import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * GET /api/awr/ash
 * ASH (Active Session History) 데이터 조회
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');
    const startTime = searchParams.get('start_time'); // Format: YYYY-MM-DD HH:MI:SS
    const endTime = searchParams.get('end_time'); // Format: YYYY-MM-DD HH:MI:SS

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    if (!startTime || !endTime) {
      return NextResponse.json(
        { error: 'Start time and end time are required' },
        { status: 400 }
      );
    }

    console.log(`[ASH API] Request: connectionId=${connectionId}, range=${startTime} ~ ${endTime}`);

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connectionId);

    // 서버 시간 및 타임존 확인 (디버깅용)
    let dbServerTime: string | null = null;
    let dbTimezone: string | null = null;
    try {
      const tzQuery = `
        SELECT
          TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS TZH:TZM') as server_time,
          DBTIMEZONE as db_tz,
          SESSIONTIMEZONE as session_tz
        FROM dual
      `;
      const tzResult = await executeQuery(config, tzQuery, [], { timeout: 5000 });
      const tzRow = tzResult.rows[0];
      dbServerTime = tzRow?.SERVER_TIME || null;
      dbTimezone = tzRow?.SESSION_TZ || tzRow?.DB_TZ || null;
      console.log(`[ASH] DB server time: ${dbServerTime}, timezone: ${dbTimezone}`);
    } catch {
      console.log('[ASH] Failed to get DB timezone info');
    }

    // ASH 데이터 조회 - V$ACTIVE_SESSION_HISTORY (EE) 또는 V$SESSION (SE) 폴백
    let samples: any[] = [];
    let dataSource = 'ash';
    const strategyErrors: Array<{ strategy: string; error: string }> = [];
    let diagnostic: {
      server_time?: string;
      ash_min_time?: string | null;
      ash_max_time?: string | null;
      ash_available?: boolean;
      edition?: string;
      requested_range?: { start: string; end: string };
      db_timezone?: string | null;
    } | undefined;

    // 전략 1: V$ACTIVE_SESSION_HISTORY (Enterprise Edition + Diagnostics Pack)
    try {
      const ashQuery = `
        SELECT * FROM (
          SELECT
            sample_id,
            sample_time,
            session_id,
            session_serial#,
            user_id,
            sql_id,
            sql_plan_hash_value,
            event,
            wait_class,
            wait_time,
            session_state,
            blocking_session,
            program,
            module,
            machine
          FROM
            v$active_session_history
          WHERE
            sample_time >= TO_TIMESTAMP(:start_time, 'YYYY-MM-DD HH24:MI:SS')
            AND sample_time <= TO_TIMESTAMP(:end_time, 'YYYY-MM-DD HH24:MI:SS')
          ORDER BY
            sample_time DESC
        ) WHERE ROWNUM <= 5000
      `;

      const result = await executeQuery(config, ashQuery, { start_time: startTime, end_time: endTime }, { timeout: 30000 });
      console.log(`[ASH] V$ACTIVE_SESSION_HISTORY returned ${result.rows.length} rows`);
      samples = result.rows.map((row: any) => ({
        sample_id: row.SAMPLE_ID,
        sample_time: row.SAMPLE_TIME,
        session_id: row.SESSION_ID,
        session_serial: row['SESSION_SERIAL#'],
        user_id: row.USER_ID,
        sql_id: row.SQL_ID,
        sql_plan_hash_value: row.SQL_PLAN_HASH_VALUE,
        event: row.EVENT,
        wait_class: row.WAIT_CLASS,
        wait_time_ms: row.WAIT_TIME,
        session_state: row.SESSION_STATE,
        blocking_session: row.BLOCKING_SESSION,
        program: row.PROGRAM,
        module: row.MODULE,
        machine: row.MACHINE,
      }));

      // Strategy 1 성공했으나 0건이면 진단 쿼리 실행
      if (samples.length === 0) {
        try {
          const diagQuery = `
            SELECT
              TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS TZH:TZM') as server_time,
              TO_CHAR(MIN(sample_time), 'YYYY-MM-DD HH24:MI:SS') as ash_min_time,
              TO_CHAR(MAX(sample_time), 'YYYY-MM-DD HH24:MI:SS') as ash_max_time,
              COUNT(*) as total_ash_rows,
              (SELECT banner FROM v$version WHERE ROWNUM = 1) as edition
            FROM v$active_session_history
          `;
          const diagResult = await executeQuery(config, diagQuery, [], { timeout: 10000 });
          const row = diagResult.rows[0];
          diagnostic = {
            server_time: row?.SERVER_TIME || null,
            ash_min_time: row?.ASH_MIN_TIME || null,
            ash_max_time: row?.ASH_MAX_TIME || null,
            ash_available: true,
            edition: row?.EDITION || null,
            requested_range: { start: startTime, end: endTime },
            db_timezone: dbTimezone,
          };
          console.log('[ASH] Diagnostic info:', JSON.stringify(diagnostic));
          console.log(`[ASH] Total ASH rows in buffer: ${row?.TOTAL_ASH_ROWS || 0}`);
        } catch {
          // 진단 쿼리 실패는 무시
        }
      }
    } catch (ashError) {
      const errMsg = (ashError as Error).message;
      console.log('[ASH] V$ACTIVE_SESSION_HISTORY failed:', errMsg);
      strategyErrors.push({ strategy: 'V$ACTIVE_SESSION_HISTORY', error: errMsg });
    }

    // 전략 2: DBA_HIST_ACTIVE_SESS_HISTORY (AWR 저장 ASH - EE + Diagnostics Pack)
    // V$ASH가 0건이면 에러 유무와 관계없이 시도 (V$ASH 버퍼에 없는 과거 데이터일 수 있음)
    if (samples.length === 0) {
      console.log('[ASH] Trying DBA_HIST_ACTIVE_SESS_HISTORY...');
      try {
        const dbaHistQuery = `
          SELECT * FROM (
            SELECT
              sample_id,
              sample_time,
              session_id,
              session_serial# as session_serial,
              user_id,
              sql_id,
              sql_plan_hash_value,
              event,
              wait_class,
              wait_time,
              session_state,
              blocking_session,
              program,
              module,
              machine
            FROM
              dba_hist_active_sess_history
            WHERE
              sample_time >= TO_TIMESTAMP(:start_time, 'YYYY-MM-DD HH24:MI:SS')
              AND sample_time <= TO_TIMESTAMP(:end_time, 'YYYY-MM-DD HH24:MI:SS')
            ORDER BY
              sample_time DESC
          ) WHERE ROWNUM <= 5000
        `;

        const dbaResult = await executeQuery(config, dbaHistQuery, { start_time: startTime, end_time: endTime }, { timeout: 30000 });
        console.log(`[ASH] DBA_HIST_ACTIVE_SESS_HISTORY returned ${dbaResult.rows.length} rows`);
        if (dbaResult.rows.length > 0) {
          dataSource = 'dba_hist_ash';
          samples = dbaResult.rows.map((row: any) => ({
            sample_id: row.SAMPLE_ID,
            sample_time: row.SAMPLE_TIME,
            session_id: row.SESSION_ID,
            session_serial: row.SESSION_SERIAL,
            user_id: row.USER_ID,
            sql_id: row.SQL_ID,
            sql_plan_hash_value: row.SQL_PLAN_HASH_VALUE,
            event: row.EVENT,
            wait_class: row.WAIT_CLASS,
            wait_time_ms: row.WAIT_TIME,
            session_state: row.SESSION_STATE,
            blocking_session: row.BLOCKING_SESSION,
            program: row.PROGRAM,
            module: row.MODULE,
            machine: row.MACHINE,
          }));
        }
      } catch (dbaHistError) {
        const errMsg = (dbaHistError as Error).message;
        console.log('[ASH] DBA_HIST_ACTIVE_SESS_HISTORY failed:', errMsg);
        strategyErrors.push({ strategy: 'DBA_HIST_ACTIVE_SESS_HISTORY', error: errMsg });
      }
    }

    // 전략 3: V$SESSION 폴백 (Standard Edition - 현재 활성 세션 스냅샷)
    // 모든 전략이 0건이면 V$SESSION으로 현재 활성 세션이라도 조회
    if (samples.length === 0) {
      console.log('[ASH] Falling back to V$SESSION');
      dataSource = 'v$session';
      try {
        const sessionQuery = `
          SELECT
            s.sid as session_id,
            s.serial# as session_serial,
            s.username,
            s.sql_id,
            0 as sql_plan_hash_value,
            CASE
              WHEN s.state = 'WAITING' THEN NVL(s.event, 'unknown wait')
              ELSE 'ON CPU'
            END as event,
            CASE
              WHEN s.state = 'WAITING' THEN NVL(s.wait_class, 'Other')
              ELSE 'CPU'
            END as wait_class,
            CASE WHEN s.state = 'WAITING' THEN ROUND(s.wait_time_micro / 1000, 0) ELSE 0 END as wait_time,
            CASE
              WHEN s.state = 'WAITING' AND NVL(s.wait_class, 'Idle') != 'Idle' THEN 'WAITING'
              ELSE 'ON CPU'
            END as session_state,
            s.blocking_session,
            s.program,
            s.module,
            s.machine,
            TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI:SS') as sample_time
          FROM v$session s
          WHERE s.type = 'USER'
            AND s.status = 'ACTIVE'
            AND s.username IS NOT NULL
            AND s.username NOT IN ('SYS', 'SYSTEM', 'DBSNMP')
            AND NOT (s.state = 'WAITING' AND NVL(s.wait_class, 'Idle') = 'Idle')
        `;
        const sessionResult = await executeQuery(config, sessionQuery, [], { timeout: 10000 });
        console.log(`[ASH] V$SESSION returned ${sessionResult.rows.length} rows`);
        samples = sessionResult.rows.map((row: any) => ({
          sample_id: null,
          sample_time: row.SAMPLE_TIME,
          session_id: row.SESSION_ID,
          session_serial: row.SESSION_SERIAL,
          user_id: null,
          sql_id: row.SQL_ID,
          sql_plan_hash_value: row.SQL_PLAN_HASH_VALUE,
          event: row.EVENT,
          wait_class: row.WAIT_CLASS,
          wait_time_ms: row.WAIT_TIME,
          session_state: row.SESSION_STATE,
          blocking_session: row.BLOCKING_SESSION,
          program: row.PROGRAM,
          module: row.MODULE,
          machine: row.MACHINE,
        }));
      } catch (sessionError) {
        const errMsg = (sessionError as Error).message;
        console.error('[ASH] V$SESSION fallback also failed:', errMsg);
        strategyErrors.push({ strategy: 'V$SESSION', error: errMsg });
      }

      // V$SESSION 폴백에서도 진단 정보 수집
      if (!diagnostic) {
        try {
          const diagQuery = `
            SELECT
              TO_CHAR(SYSTIMESTAMP, 'YYYY-MM-DD HH24:MI:SS TZH:TZM') as server_time,
              (SELECT banner FROM v$version WHERE ROWNUM = 1) as edition
            FROM dual
          `;
          const diagResult = await executeQuery(config, diagQuery, [], { timeout: 5000 });
          const row = diagResult.rows[0];
          diagnostic = {
            server_time: row?.SERVER_TIME || null,
            ash_available: false,
            edition: row?.EDITION || null,
            requested_range: { start: startTime, end: endTime },
            db_timezone: dbTimezone,
          };
        } catch {
          // 무시
        }
      }
    }

    // 메트릭 계산
    const metrics = calculateASHMetrics(samples);

    return NextResponse.json({
      success: true,
      data: samples,
      metrics,
      count: samples.length,
      source: dataSource,
      errors: strategyErrors.length > 0 ? strategyErrors : undefined,
      diagnostic: samples.length === 0 ? diagnostic : undefined,
      time_range: {
        start: startTime,
        end: endTime,
      },
    });
  } catch (error) {
    console.error('ASH API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch ASH data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * ASH 메트릭 계산
 */
function calculateASHMetrics(samples: any[]) {
  if (samples.length === 0) {
    return {
      total_samples: 0,
      active_sessions: 0,
      top_wait_events: [],
      top_sql: [],
      session_states: [],
    };
  }

  // Wait Events 집계
  const waitEventMap = new Map<string, number>();
  samples.forEach((sample) => {
    if (sample.event) {
      waitEventMap.set(sample.event, (waitEventMap.get(sample.event) || 0) + 1);
    }
  });

  const top_wait_events = Array.from(waitEventMap.entries())
    .map(([event, count]) => ({
      event,
      count,
      percentage: (count / samples.length) * 100,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Top SQL 집계
  const sqlMap = new Map<string, number>();
  samples.forEach((sample) => {
    if (sample.sql_id) {
      sqlMap.set(sample.sql_id, (sqlMap.get(sample.sql_id) || 0) + 1);
    }
  });

  const top_sql = Array.from(sqlMap.entries())
    .map(([sql_id, count]) => ({
      sql_id,
      count,
      percentage: (count / samples.length) * 100,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Session States 집계
  const stateMap = new Map<string, number>();
  samples.forEach((sample) => {
    const state = sample.session_state || 'UNKNOWN';
    stateMap.set(state, (stateMap.get(state) || 0) + 1);
  });

  const session_states = Array.from(stateMap.entries())
    .map(([state, count]) => ({
      state,
      count,
      percentage: (count / samples.length) * 100,
    }))
    .sort((a, b) => b.count - a.count);

  // 평균 활성 세션 수 계산 (샘플 타임별 유니크 세션 수의 평균)
  const sampleTimeMap = new Map<string, Set<number>>();
  samples.forEach((sample) => {
    const timeKey = sample.sample_time;
    if (!sampleTimeMap.has(timeKey)) {
      sampleTimeMap.set(timeKey, new Set());
    }
    sampleTimeMap.get(timeKey)!.add(sample.session_id);
  });

  const avgActiveSessions =
    Array.from(sampleTimeMap.values()).reduce((sum, sessions) => sum + sessions.size, 0) /
    sampleTimeMap.size;

  return {
    total_samples: samples.length,
    active_sessions: Math.round(avgActiveSessions),
    top_wait_events,
    top_sql,
    session_states,
  };
}
