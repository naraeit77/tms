import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * GET /api/monitoring/sessions
 * Oracle 세션 모니터링 데이터 조회
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');
    const status = searchParams.get('status');

    console.log('[Sessions API] Received connection_id:', connectionId);

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connectionId);

    // Oracle에서 실시간 세션 정보 조회
    const query = `
      SELECT
        s.sid,
        s.serial# as serial_number,
        s.username,
        s.osuser,
        s.machine,
        s.program,
        s.module,
        s.status,
        s.state,
        s.sql_id,
        s.event,
        s.wait_class,
        s.seconds_in_wait * 1000 as wait_time_ms,
        s.logon_time,
        s.last_call_et,
        s.blocking_session,
        sq.sql_text,
        cpu.value / 10 as cpu_time_ms,
        logical.value as logical_reads
      FROM
        v$session s
        LEFT JOIN v$sql sq ON s.sql_id = sq.sql_id
        LEFT JOIN v$sesstat cpu ON s.sid = cpu.sid AND cpu.statistic# = (
          SELECT statistic# FROM v$statname WHERE name = 'CPU used by this session'
        )
        LEFT JOIN v$sesstat logical ON s.sid = logical.sid AND logical.statistic# = (
          SELECT statistic# FROM v$statname WHERE name = 'session logical reads'
        )
      WHERE
        s.type = 'USER'
        AND s.username IS NOT NULL
        ${status ? `AND s.status = '${status.toUpperCase()}'` : ''}
      ORDER BY
        s.status DESC, s.last_call_et DESC
    `;

    const result = await executeQuery(config, query);

    // 세션 데이터를 변환
    const sessions = result.rows.map((row: any) => ({
      id: `${connectionId}-${row.SID}-${row.SERIAL_NUMBER}`, // Frontend expects id field
      oracle_connection_id: connectionId,
      sid: row.SID,
      serial_number: row.SERIAL_NUMBER,
      username: row.USERNAME,
      osuser: row.OSUSER,
      machine: row.MACHINE,
      program: row.PROGRAM,
      module: row.MODULE,
      status: row.STATUS,
      state: row.STATE,
      sql_id: row.SQL_ID,
      event: row.EVENT,
      wait_class: row.WAIT_CLASS,
      wait_time_ms: Math.floor(Number(row.WAIT_TIME_MS) || 0),
      cpu_time_ms: Math.floor(Number(row.CPU_TIME_MS) || 0),
      logical_reads: Math.floor(Number(row.LOGICAL_READS) || 0),
      logon_time: row.LOGON_TIME,
      last_call_et: row.LAST_CALL_ET,
      blocking_session: row.BLOCKING_SESSION,
      sql_text: row.SQL_TEXT?.substring(0, 500),
      collected_at: new Date().toISOString(),
    }));

    console.log(`[Sessions API] Fetched ${sessions.length} sessions for connection ${connectionId}`);

    // Note: Session data is real-time only, no need to persist to Supabase
    // The composite id (connectionId-SID-SERIAL) is for frontend display only

    return NextResponse.json({
      success: true,
      data: sessions,
      count: sessions.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Sessions monitoring API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch session data' },
      { status: 500 }
    );
  }
}
