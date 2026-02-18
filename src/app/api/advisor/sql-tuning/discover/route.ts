import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * GET /api/advisor/sql-tuning/discover
 * 성능 저하 SQL 자동 수집 (Discovery)
 * V$SQLAREA 또는 DBA_HIST_SQLSTAT에서 부하가 높은 SQL 추출
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');
    const limit = parseInt(searchParams.get('limit') || '20');
    const orderBy = searchParams.get('order_by') || 'elapsed_time'; // elapsed_time, cpu_time, buffer_gets, executions

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    const config = await getOracleConfig(connectionId);

    // 정렬 컬럼 결정
    let orderColumn = 'elapsed_time';
    if (orderBy === 'cpu_time') {
      orderColumn = 'cpu_time';
    } else if (orderBy === 'buffer_gets') {
      orderColumn = 'buffer_gets';
    } else if (orderBy === 'executions') {
      orderColumn = 'executions';
    }

    // V$SQLAREA에서 성능 저하 SQL 수집
    // ELAPSED_TIME, CPU_TIME, BUFFER_GETS가 높은 상위 SQL 추출
    const query = `
      SELECT * FROM (
      SELECT
        sql_id,
        SUBSTR(sql_text, 1, 500) as sql_text_preview,
        parsing_schema_name as schema_name,
        module,
        executions,
        ROUND(elapsed_time / 1000) as elapsed_time_ms,
        ROUND(cpu_time / 1000) as cpu_time_ms,
        buffer_gets,
        disk_reads,
        rows_processed,
        ROUND(elapsed_time / DECODE(executions, 0, 1, executions) / 1000) as avg_elapsed_time_ms,
        ROUND(buffer_gets / DECODE(executions, 0, 1, executions)) as avg_buffer_gets,
        plan_hash_value,
        first_load_time,
        last_active_time,
        CASE
          WHEN elapsed_time / DECODE(executions, 0, 1, executions) > 2000000 THEN 'CRITICAL'
          WHEN elapsed_time / DECODE(executions, 0, 1, executions) > 1000000 THEN 'WARNING'
          WHEN buffer_gets / DECODE(executions, 0, 1, executions) > 50000 THEN 'WARNING'
          ELSE 'NORMAL'
        END as priority,
        CASE
          WHEN elapsed_time / DECODE(executions, 0, 1, executions) > 2000000 THEN 'HIGH'
          WHEN elapsed_time / DECODE(executions, 0, 1, executions) > 1000000 THEN 'MEDIUM'
          ELSE 'LOW'
        END as tuning_priority
      FROM
        v$sqlarea
      WHERE
        parsing_schema_name NOT IN ('SYS', 'SYSTEM', 'DBSNMP', 'SYSMAN')
        AND sql_text IS NOT NULL
        AND sql_text NOT LIKE '%v$%'
        AND sql_text NOT LIKE '%V$%'
        AND executions > 0
        AND elapsed_time > 0
      ORDER BY
        ${orderColumn} DESC
      ) WHERE ROWNUM <= ${limit}
    `;

    const result = await executeQuery(config, query, [], { timeout: 10000 });

    const sqlList = result.rows.map((row: any) => {
      let sqlText = row.SQL_TEXT_PREVIEW;
      if (sqlText && typeof sqlText !== 'string') {
        if (Buffer.isBuffer(sqlText)) {
          sqlText = sqlText.toString('utf-8');
        } else if (sqlText.toString) {
          sqlText = sqlText.toString();
        } else {
          sqlText = String(sqlText);
        }
      }

      return {
        sql_id: row.SQL_ID,
        sql_text_preview: sqlText || '',
        schema_name: row.SCHEMA_NAME,
        module: row.MODULE,
        executions: Math.floor(Number(row.EXECUTIONS) || 0),
        elapsed_time_ms: Math.floor(Number(row.ELAPSED_TIME_MS) || 0),
        cpu_time_ms: Math.floor(Number(row.CPU_TIME_MS) || 0),
        buffer_gets: Math.floor(Number(row.BUFFER_GETS) || 0),
        disk_reads: Math.floor(Number(row.DISK_READS) || 0),
        rows_processed: Math.floor(Number(row.ROWS_PROCESSED) || 0),
        avg_elapsed_time_ms: Math.floor(Number(row.AVG_ELAPSED_TIME_MS) || 0),
        avg_buffer_gets: Math.floor(Number(row.AVG_BUFFER_GETS) || 0),
        plan_hash_value: row.PLAN_HASH_VALUE,
        first_load_time: row.FIRST_LOAD_TIME,
        last_active_time: row.LAST_ACTIVE_TIME,
        priority: row.PRIORITY,
        tuning_priority: row.TUNING_PRIORITY,
      };
    });

    return NextResponse.json({
      success: true,
      data: sqlList,
      count: sqlList.length,
      order_by: orderBy,
    });
  } catch (error) {
    console.error('Error discovering SQL for tuning:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to discover SQL';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

