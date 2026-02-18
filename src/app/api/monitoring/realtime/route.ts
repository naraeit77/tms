import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * GET /api/monitoring/realtime
 * 실시간 SQL 모니터링 데이터 조회 (Oracle 실시간)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');
    const limit = parseInt(searchParams.get('limit') || '50');

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    console.log('[Realtime Monitoring API] Received connection_id:', connectionId);

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connectionId);

    // Oracle에서 현재 실행 중이거나 최근에 실행된 SQL 조회
    const query = `
      SELECT * FROM (
      SELECT
        sql_id,
        SUBSTR(sql_text, 1, 200) as sql_text,
        executions,
        elapsed_time / 1000 as elapsed_time_ms,
        cpu_time / 1000 as cpu_time_ms,
        buffer_gets,
        disk_reads,
        rows_processed,
        last_active_time,
        parsing_schema_name,
        CASE
          WHEN elapsed_time / DECODE(executions, 0, 1, executions) > 10000000 THEN 'CRITICAL'
          WHEN elapsed_time / DECODE(executions, 0, 1, executions) > 5000000 THEN 'WARNING'
          ELSE 'NORMAL'
        END as status
      FROM
        v$sql
      WHERE
        parsing_schema_name NOT IN ('SYS', 'SYSTEM')
        AND sql_text NOT LIKE '%v$%'
        AND executions > 0
        AND last_active_time > SYSDATE - (5/1440)
      ORDER BY
        last_active_time DESC
      ) WHERE ROWNUM <= :limit
    `;

    const result = await executeQuery(config, query, [limit]);
    console.log(`[Realtime Monitoring API] Oracle returned ${result.rows.length} rows`);

    // 데이터 변환
    const realtimeData = result.rows.map((row: any) => {
      let sqlText = row.SQL_TEXT;
      if (sqlText && typeof sqlText !== 'string') {
        if (Buffer.isBuffer(sqlText)) {
          sqlText = sqlText.toString('utf-8');
        } else if (sqlText.toString) {
          sqlText = sqlText.toString();
        }
      }

      return {
        sql_id: row.SQL_ID,
        sql_text: sqlText || '',
        executions: Math.floor(Number(row.EXECUTIONS) || 0),
        elapsed_time_ms: Math.floor(Number(row.ELAPSED_TIME_MS) || 0),
        cpu_time_ms: Math.floor(Number(row.CPU_TIME_MS) || 0),
        buffer_gets: Math.floor(Number(row.BUFFER_GETS) || 0),
        disk_reads: Math.floor(Number(row.DISK_READS) || 0),
        rows_processed: Math.floor(Number(row.ROWS_PROCESSED) || 0),
        last_active_time: row.LAST_ACTIVE_TIME,
        status: row.STATUS,
        connection_name: config.name,
      };
    });

    console.log(`[Realtime Monitoring API] Returning ${realtimeData.length} SQL statements`);

    return NextResponse.json({
      success: true,
      data: realtimeData,
      count: realtimeData.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Realtime monitoring API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch realtime SQL data' },
      { status: 500 }
    );
  }
}
