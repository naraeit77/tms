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

    // ASH 샘플 데이터 조회
    const ashQuery = `
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
        current_obj#,
        current_file#,
        current_block#,
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
    `;

    const result = await executeQuery(config, ashQuery, {
      start_time: startTime,
      end_time: endTime,
    });

    // ASH 데이터 변환
    const samples = result.rows.map((row: any) => ({
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
      current_obj: row['CURRENT_OBJ#'],
      current_file: row['CURRENT_FILE#'],
      current_block: row['CURRENT_BLOCK#'],
      program: row.PROGRAM,
      module: row.MODULE,
      machine: row.MACHINE,
    }));

    // 메트릭 계산
    const metrics = calculateASHMetrics(samples);

    return NextResponse.json({
      success: true,
      data: samples,
      metrics,
      count: samples.length,
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
