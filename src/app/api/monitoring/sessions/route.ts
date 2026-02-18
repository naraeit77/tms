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

    // Oracle 직접 쿼리
    const config = await getOracleConfig(connectionId);

    // Oracle에서 실시간 세션 정보 조회 (최적화 버전)
    // ROWNUM in JOIN 문제 해결: 스칼라 서브쿼리로 SQL 텍스트 조회
    // status 필터: 화이트리스트 검증으로 SQL Injection 방지
    const validStatuses = ['ACTIVE', 'INACTIVE', 'KILLED', 'CACHED', 'SNIPED'];
    let statusFilter = '';
    if (status) {
      const upperStatus = status.toUpperCase();
      if (validStatuses.includes(upperStatus)) {
        statusFilter = `AND s.status = '${upperStatus}'`;
      }
    }

    // Oracle 11g 호환: FETCH FIRST 대신 서브쿼리 + ROWNUM 사용
    const query = `
      SELECT * FROM (
        SELECT /*+ FIRST_ROWS(100) */
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
          (SELECT SUBSTR(sq.sql_text, 1, 200) FROM v$sql sq WHERE sq.sql_id = s.sql_id AND ROWNUM = 1) as sql_text,
          0 as cpu_time_ms,
          0 as logical_reads
        FROM v$session s
        WHERE s.type = 'USER'
          AND s.username IS NOT NULL
          ${statusFilter}
        ORDER BY s.status DESC, s.last_call_et DESC
      ) WHERE ROWNUM <= 100
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

    // Note: Session data is real-time only from Oracle V$SESSION
    // The composite id (connectionId-SID-SERIAL) is for frontend display only

    return NextResponse.json({
      success: true,
      data: sessions,
      count: sessions.length,
      timestamp: new Date().toISOString(),
    }, {
      headers: {
        'Cache-Control': 'private, s-maxage=10, stale-while-revalidate=30',
      },
    });
  } catch (error: any) {
    const errorMessage = error?.message || 'Unknown error';
    console.warn('[Sessions API] Error occurred, returning empty result:', errorMessage);

    // 모든 에러를 graceful하게 처리하여 빈 데이터 반환 (500 에러 대신)
    return NextResponse.json({
      success: true,
      data: [],
      count: 0,
      timestamp: new Date().toISOString(),
      warning: errorMessage,
    });
  }
}
