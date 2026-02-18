/**
 * ASH (Active Session History) API Route
 * TMS 2.0 Custom ASH 구현 - Oracle Standard Edition 호환
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

export interface ASHDataPoint {
  time: string;
  timestamp: number;
  index: number;
  CPU: number;
  'User I/O': number;
  'System I/O': number;
  Concurrency: number;
  Application: number;
  Commit: number;
  Configuration: number;
  Administrative: number;
  Network: number;
  Other: number;
  Idle: number;
}

// Custom ASH 수집 쿼리 (v$session 기반 - Oracle SE 호환)
const CUSTOM_ASH_QUERY = `
SELECT
  TO_CHAR(SYSDATE, 'HH24:MI') AS sample_time,
  CAST(EXTRACT(SECOND FROM SYSTIMESTAMP) * 1000 +
       (SYSDATE - TRUNC(SYSDATE)) * 86400000 AS NUMBER) AS timestamp_ms,
  NVL(SUM(CASE WHEN wait_class IS NULL OR wait_class = 'CPU' THEN 1 ELSE 0 END), 0) AS cpu_count,
  NVL(SUM(CASE WHEN wait_class = 'User I/O' THEN 1 ELSE 0 END), 0) AS user_io_count,
  NVL(SUM(CASE WHEN wait_class = 'System I/O' THEN 1 ELSE 0 END), 0) AS system_io_count,
  NVL(SUM(CASE WHEN wait_class = 'Concurrency' THEN 1 ELSE 0 END), 0) AS concurrency_count,
  NVL(SUM(CASE WHEN wait_class = 'Application' THEN 1 ELSE 0 END), 0) AS application_count,
  NVL(SUM(CASE WHEN wait_class = 'Commit' THEN 1 ELSE 0 END), 0) AS commit_count,
  NVL(SUM(CASE WHEN wait_class = 'Configuration' THEN 1 ELSE 0 END), 0) AS configuration_count,
  NVL(SUM(CASE WHEN wait_class = 'Administrative' THEN 1 ELSE 0 END), 0) AS administrative_count,
  NVL(SUM(CASE WHEN wait_class = 'Network' THEN 1 ELSE 0 END), 0) AS network_count,
  NVL(SUM(CASE WHEN wait_class NOT IN ('CPU', 'User I/O', 'System I/O', 'Concurrency', 'Application', 'Commit', 'Configuration', 'Administrative', 'Network', 'Idle') THEN 1 ELSE 0 END), 0) AS other_count,
  NVL(SUM(CASE WHEN wait_class = 'Idle' THEN 1 ELSE 0 END), 0) AS idle_count
FROM v$session
WHERE status = 'ACTIVE'
  AND type = 'USER'
  AND sid != (SELECT sid FROM v$mystat WHERE rownum = 1)
GROUP BY TO_CHAR(SYSDATE, 'HH24:MI')
`;

// v$active_session_history 사용 쿼리 (Enterprise Edition)
const ENTERPRISE_ASH_QUERY = `
SELECT
  TO_CHAR(sample_time, 'HH24:MI') AS sample_time,
  TO_NUMBER(TO_CHAR(sample_time, 'SSSSS')) * 1000 AS timestamp_ms,
  NVL(SUM(CASE WHEN session_state = 'ON CPU' OR wait_class IS NULL THEN 1 ELSE 0 END), 0) AS cpu_count,
  NVL(SUM(CASE WHEN wait_class = 'User I/O' THEN 1 ELSE 0 END), 0) AS user_io_count,
  NVL(SUM(CASE WHEN wait_class = 'System I/O' THEN 1 ELSE 0 END), 0) AS system_io_count,
  NVL(SUM(CASE WHEN wait_class = 'Concurrency' THEN 1 ELSE 0 END), 0) AS concurrency_count,
  NVL(SUM(CASE WHEN wait_class = 'Application' THEN 1 ELSE 0 END), 0) AS application_count,
  NVL(SUM(CASE WHEN wait_class = 'Commit' THEN 1 ELSE 0 END), 0) AS commit_count,
  NVL(SUM(CASE WHEN wait_class = 'Configuration' THEN 1 ELSE 0 END), 0) AS configuration_count,
  NVL(SUM(CASE WHEN wait_class = 'Administrative' THEN 1 ELSE 0 END), 0) AS administrative_count,
  NVL(SUM(CASE WHEN wait_class = 'Network' THEN 1 ELSE 0 END), 0) AS network_count,
  NVL(SUM(CASE WHEN wait_class NOT IN ('User I/O', 'System I/O', 'Concurrency', 'Application', 'Commit', 'Configuration', 'Administrative', 'Network', 'Idle') AND session_state != 'ON CPU' THEN 1 ELSE 0 END), 0) AS other_count,
  NVL(SUM(CASE WHEN wait_class = 'Idle' THEN 1 ELSE 0 END), 0) AS idle_count
FROM v$active_session_history
WHERE sample_time > SYSDATE - INTERVAL ':minutes' MINUTE
GROUP BY TO_CHAR(sample_time, 'HH24:MI')
ORDER BY sample_time
`;

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connectionId') || searchParams.get('connection_id');
    const minutes = parseInt(searchParams.get('minutes') || '60', 10);
    const useEnterprise = searchParams.get('enterprise') === 'true';

    if (!connectionId) {
      return NextResponse.json(
        { error: 'connectionId is required' },
        { status: 400 }
      );
    }

    const config = await getOracleConfig(connectionId);

    let query: string;

    if (useEnterprise) {
      query = ENTERPRISE_ASH_QUERY.replace(':minutes', minutes.toString());
    } else {
      query = CUSTOM_ASH_QUERY;
    }

    const result = await executeQuery(config, query);

    const ashData: ASHDataPoint[] = result.rows.map((row: any, index: number) => ({
      time: row.SAMPLE_TIME,
      timestamp: Date.now() - (result.rows.length - 1 - index) * 60000,
      index,
      CPU: parseFloat(row.CPU_COUNT) || 0,
      'User I/O': parseFloat(row.USER_IO_COUNT) || 0,
      'System I/O': parseFloat(row.SYSTEM_IO_COUNT) || 0,
      Concurrency: parseFloat(row.CONCURRENCY_COUNT) || 0,
      Application: parseFloat(row.APPLICATION_COUNT) || 0,
      Commit: parseFloat(row.COMMIT_COUNT) || 0,
      Configuration: parseFloat(row.CONFIGURATION_COUNT) || 0,
      Administrative: parseFloat(row.ADMINISTRATIVE_COUNT) || 0,
      Network: parseFloat(row.NETWORK_COUNT) || 0,
      Other: parseFloat(row.OTHER_COUNT) || 0,
      Idle: parseFloat(row.IDLE_COUNT) || 0,
    }));

    return NextResponse.json({
      success: true,
      data: ashData,
      meta: {
        connectionId,
        minutes,
        useEnterprise,
        count: ashData.length,
        collectedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('ASH API Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch ASH data',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

// POST: Real-time ASH 샘플링 (Custom ASH 테이블에 저장)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { connectionId } = body;

    if (!connectionId) {
      return NextResponse.json(
        { error: 'connectionId is required' },
        { status: 400 }
      );
    }

    const config = await getOracleConfig(connectionId);

    // Custom ASH 샘플링 및 저장
    const sampleQuery = `
      INSERT INTO tms_ash_samples (
        sample_time, sid, serial#, user#, username,
        sql_id, sql_child_number, sql_exec_id,
        event, wait_class, session_state,
        time_waited, blocking_session
      )
      SELECT
        SYSTIMESTAMP,
        s.sid,
        s.serial#,
        s.user#,
        s.username,
        s.sql_id,
        s.sql_child_number,
        s.sql_exec_id,
        s.event,
        s.wait_class,
        CASE WHEN s.wait_class IS NULL THEN 'ON CPU' ELSE 'WAITING' END,
        s.seconds_in_wait,
        s.blocking_session
      FROM v$session s
      WHERE s.status = 'ACTIVE'
        AND s.type = 'USER'
        AND s.sid != (SELECT sid FROM v$mystat WHERE rownum = 1)
    `;

    await executeQuery(config, sampleQuery);

    return NextResponse.json({
      success: true,
      message: 'ASH sample collected',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('ASH Sample Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to collect ASH sample',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
