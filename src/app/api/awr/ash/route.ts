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

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connectionId);

    // ASH 데이터 조회 - V$ACTIVE_SESSION_HISTORY (EE) 또는 V$SESSION (SE) 폴백
    let samples: any[] = [];
    let dataSource = 'ash';

    try {
      // 전략 1: V$ACTIVE_SESSION_HISTORY (Enterprise Edition + Diagnostics Pack)
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
    } catch (ashError) {
      // 전략 2: DBA_HIST_ACTIVE_SESS_HISTORY (AWR 저장 ASH - EE + Diagnostics Pack)
      console.log('[ASH] V$ACTIVE_SESSION_HISTORY failed:', (ashError as Error).message);
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
      } catch {
        // 전략 3: V$SESSION 폴백 (Standard Edition - 현재 활성 세션 스냅샷)
        console.log('[ASH] DBA_HIST also not available, falling back to V$SESSION');
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
          console.error('[ASH] V$SESSION fallback also failed:', sessionError);
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
