import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * GET /api/trace
 * 트레이스 세션 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connectionId);

    // 트레이스 세션 정보 조회 (v$session과 v$process 조인)
    // 현재 트레이싱 중인 세션과 트레이스 파일 정보를 조회
    const query = `
      SELECT
        s.sid,
        s.serial# as serial_number,
        s.username,
        s.sql_id,
        s.sql_trace,
        s.sql_trace_waits,
        s.sql_trace_binds,
        s.logon_time,
        p.tracefile,
        p.traceid
      FROM
        v$session s
        LEFT JOIN v$process p ON s.paddr = p.addr
      WHERE
        s.type = 'USER'
        AND s.sql_trace = 'ENABLED'
      ORDER BY
        s.logon_time DESC
    `;

    const result = await executeQuery(config, query);

    const traces = result.rows.map((row: any) => ({
      id: `${connectionId}-${row.SID}-${row.SERIAL_NUMBER}`,
      session_id: row.SID,
      serial_number: row.SERIAL_NUMBER,
      username: row.USERNAME,
      sql_id: row.SQL_ID,
      trace_file: row.TRACEFILE || 'N/A',
      trace_id: row.TRACEID,
      status: row.SQL_TRACE === 'ENABLED' ? 'ACTIVE' : 'STOPPED',
      started_at: row.LOGON_TIME,
      sql_trace_waits: row.SQL_TRACE_WAITS === 'TRUE',
      sql_trace_binds: row.SQL_TRACE_BINDS === 'TRUE',
    }));

    return NextResponse.json({
      success: true,
      data: traces,
      count: traces.length,
    });
  } catch (error) {
    console.error('Trace API GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trace sessions' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/trace
 * 트레이스 시작/중지
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { connection_id, session_id, action } = body;

    if (!connection_id || !session_id || !action) {
      return NextResponse.json(
        { error: 'Connection ID, Session ID, and action are required' },
        { status: 400 }
      );
    }

    if (!['start', 'stop'].includes(action)) {
      return NextResponse.json(
        { error: 'Action must be either "start" or "stop"' },
        { status: 400 }
      );
    }

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connection_id);

    if (action === 'start') {
      // 트레이스 시작
      // 1. 세션에 대해 트레이스 활성화
      const startTraceQuery = `
        BEGIN
          DBMS_MONITOR.SESSION_TRACE_ENABLE(
            session_id => ${session_id},
            waits => TRUE,
            binds => TRUE
          );
        END;
      `;

      await executeQuery(config, startTraceQuery);

      // 2. 트레이스 파일 정보 조회
      const traceFileQuery = `
        SELECT
          s.sid,
          s.serial#,
          p.tracefile,
          p.traceid
        FROM
          v$session s
          JOIN v$process p ON s.paddr = p.addr
        WHERE
          s.sid = ${session_id}
      `;

      const traceFileResult = await executeQuery(config, traceFileQuery);
      const traceInfo = traceFileResult.rows[0];

      return NextResponse.json({
        success: true,
        message: 'Trace started successfully',
        data: {
          session_id: session_id,
          trace_file: traceInfo?.TRACEFILE || 'N/A',
          trace_id: traceInfo?.TRACEID,
        },
      });
    } else {
      // 트레이스 중지
      const stopTraceQuery = `
        BEGIN
          DBMS_MONITOR.SESSION_TRACE_DISABLE(
            session_id => ${session_id}
          );
        END;
      `;

      await executeQuery(config, stopTraceQuery);

      return NextResponse.json({
        success: true,
        message: 'Trace stopped successfully',
        data: {
          session_id: session_id,
        },
      });
    }
  } catch (error) {
    console.error('Trace API POST error:', error);
    return NextResponse.json(
      {
        error: 'Failed to start/stop trace',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
