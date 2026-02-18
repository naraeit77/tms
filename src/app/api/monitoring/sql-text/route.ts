import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * GET /api/monitoring/sql-text
 * 특정 SQL ID의 전체 SQL 텍스트 조회
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');
    const sqlId = searchParams.get('sql_id');

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    if (!sqlId) {
      return NextResponse.json({ error: 'SQL ID is required' }, { status: 400 });
    }

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connectionId);

    // SQL 텍스트 전체 조회 (CLOB 읽기가 느릴 수 있으므로 타임아웃 30초)
    const sqlTextQuery = `
      SELECT /*+ FIRST_ROWS(1) */
        sql_id,
        sql_fulltext,
        sql_text,
        executions,
        elapsed_time / DECODE(executions, 0, 1, executions) / 1000 as avg_elapsed_ms,
        cpu_time / DECODE(executions, 0, 1, executions) / 1000 as avg_cpu_ms,
        buffer_gets / DECODE(executions, 0, 1, executions) as avg_buffer_gets,
        disk_reads / DECODE(executions, 0, 1, executions) as avg_disk_reads,
        rows_processed / DECODE(executions, 0, 1, executions) as avg_rows_processed,
        parse_calls,
        sorts,
        parsing_schema_name,
        module,
        action,
        first_load_time,
        last_load_time,
        last_active_time
      FROM
        v$sql
      WHERE
        sql_id = :sql_id
        AND ROWNUM = 1
    `;

    const result = await executeQuery(config, sqlTextQuery, [sqlId], { timeout: 30000 });

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'SQL not found' }, { status: 404 });
    }

    const row = result.rows[0];

    // SQL 텍스트 변환 (CLOB 처리)
    let sqlFullText = row.SQL_FULLTEXT || row.SQL_TEXT;

    // CLOB 객체를 문자열로 변환
    if (sqlFullText && typeof sqlFullText !== 'string') {
      try {
        if (Buffer.isBuffer(sqlFullText)) {
          sqlFullText = sqlFullText.toString('utf-8');
        } else if (sqlFullText instanceof Object && 'getData' in sqlFullText) {
          // Oracle CLOB 객체인 경우
          sqlFullText = await sqlFullText.getData();
        } else if (typeof sqlFullText === 'object') {
          // 일반 객체인 경우 JSON으로 변환 후 확인
          console.log('SQL_FULLTEXT type:', typeof sqlFullText, sqlFullText);
          sqlFullText = JSON.stringify(sqlFullText);
        } else if (sqlFullText.toString) {
          sqlFullText = sqlFullText.toString();
        }
      } catch (err) {
        console.error('Error converting SQL text:', err);
        sqlFullText = String(sqlFullText);
      }
    }

    const sqlData = {
      sql_id: row.SQL_ID,
      sql_text: sqlFullText || '',
      executions: Math.floor(Number(row.EXECUTIONS) || 0),
      avg_elapsed_ms: Math.floor(Number(row.AVG_ELAPSED_MS) || 0),
      avg_cpu_ms: Math.floor(Number(row.AVG_CPU_MS) || 0),
      avg_buffer_gets: Math.floor(Number(row.AVG_BUFFER_GETS) || 0),
      avg_disk_reads: Math.floor(Number(row.AVG_DISK_READS) || 0),
      avg_rows_processed: Math.floor(Number(row.AVG_ROWS_PROCESSED) || 0),
      parse_calls: Math.floor(Number(row.PARSE_CALLS) || 0),
      sorts: Math.floor(Number(row.SORTS) || 0),
      parsing_schema: row.PARSING_SCHEMA_NAME,
      module: row.MODULE,
      action: row.ACTION,
      first_load_time: row.FIRST_LOAD_TIME,
      last_load_time: row.LAST_LOAD_TIME,
      last_active_time: row.LAST_ACTIVE_TIME,
    };

    return NextResponse.json({
      success: true,
      data: sqlData,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[SQL Text API] Error:', {
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(
      {
        error: 'Failed to fetch SQL text',
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    );
  }
}
