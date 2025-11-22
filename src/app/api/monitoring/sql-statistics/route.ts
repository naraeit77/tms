import 'server-only';

/**
 * SQL Statistics API
 * GET: SQL 통계 조회 (Oracle에서 직접)
 * POST: SQL 통계 수집 트리거
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    // 현재 사용자 확인
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 쿼리 파라미터
    const connectionId = searchParams.get('connection_id');
    const orderBy = searchParams.get('order_by') || 'buffer_gets';
    const limit = parseInt(searchParams.get('limit') || '100');
    const minElapsedTime = searchParams.get('min_elapsed_time');
    const minBufferGets = searchParams.get('min_buffer_gets');
    const minExecutions = searchParams.get('min_executions');
    const module = searchParams.get('module');

    console.log('[SQL Statistics API] Received connection_id:', connectionId);

    if (!connectionId || connectionId === 'all') {
      // 연결이 선택되지 않은 경우 빈 배열 반환
      return NextResponse.json({
        data: [],
        total: 0,
        limit,
        offset: 0,
      });
    }

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connectionId);

    // Oracle에서 SQL 통계 조회
    let whereConditions = [
      "parsing_schema_name NOT IN ('SYS', 'SYSTEM')",
      "sql_text NOT LIKE '%v$%'",
      "sql_text NOT LIKE '%V$%'",
      "executions > 0"
    ];

    if (minElapsedTime) {
      whereConditions.push(`elapsed_time / DECODE(executions, 0, 1, executions) / 1000 >= ${minElapsedTime}`);
    }
    if (minBufferGets) {
      whereConditions.push(`buffer_gets >= ${minBufferGets}`);
    }
    if (minExecutions) {
      whereConditions.push(`executions >= ${minExecutions}`);
    }
    if (module && module !== 'all') {
      whereConditions.push(`module = '${module}'`);
    }

    // 정렬 컬럼 결정
    let orderColumn = 'buffer_gets';
    if (orderBy === 'elapsed_time_ms') {
      orderColumn = 'elapsed_time';
    } else if (orderBy === 'cpu_time_ms') {
      orderColumn = 'cpu_time';
    } else if (orderBy === 'disk_reads') {
      orderColumn = 'disk_reads';
    } else if (orderBy === 'executions') {
      orderColumn = 'executions';
    }

    const query = `
      SELECT
        sql_id,
        sql_text,
        module,
        parsing_schema_name as schema_name,
        executions,
        elapsed_time / 1000 as elapsed_time_ms,
        cpu_time / 1000 as cpu_time_ms,
        buffer_gets,
        disk_reads,
        rows_processed,
        elapsed_time / DECODE(executions, 0, 1, executions) / 1000 as avg_elapsed_time_ms,
        buffer_gets / DECODE(executions, 0, 1, executions) as gets_per_exec,
        first_load_time,
        last_active_time,
        plan_hash_value,
        CASE
          WHEN elapsed_time / DECODE(executions, 0, 1, executions) > 10000000 THEN 'CRITICAL'
          WHEN elapsed_time / DECODE(executions, 0, 1, executions) > 5000000 THEN 'WARNING'
          WHEN buffer_gets / DECODE(executions, 0, 1, executions) > 100000 THEN 'WARNING'
          ELSE 'NORMAL'
        END as status,
        CASE
          WHEN elapsed_time / DECODE(executions, 0, 1, executions) > 10000000 THEN 'HIGH'
          WHEN elapsed_time / DECODE(executions, 0, 1, executions) > 5000000 THEN 'MEDIUM'
          ELSE 'LOW'
        END as priority
      FROM
        v$sql
      WHERE
        ${whereConditions.join(' AND ')}
      ORDER BY
        ${orderColumn} DESC
      FETCH FIRST ${limit} ROWS ONLY
    `;

    const result = await executeQuery(config, query);

    // 전체 개수 조회 쿼리
    const countQuery = `
      SELECT COUNT(*) as total_count
      FROM v$sql
      WHERE ${whereConditions.join(' AND ')}
    `;

    const countResult = await executeQuery(config, countQuery);
    const totalCount = countResult.rows[0]?.TOTAL_COUNT || 0;

    // SQL 데이터 변환
    const sqlStats = result.rows.map((row: any, index: number) => {
      // SQL 텍스트를 문자열로 변환
      let sqlText = row.SQL_TEXT;
      if (sqlText && typeof sqlText !== 'string') {
        if (Buffer.isBuffer(sqlText)) {
          sqlText = sqlText.toString('utf-8');
        } else if (sqlText.toString) {
          sqlText = sqlText.toString();
        }
      }
      sqlText = sqlText || '';

      return {
        id: `${connectionId}-${row.SQL_ID}-${row.PLAN_HASH_VALUE || 0}-${index}`, // 고유 ID 생성
        sql_id: row.SQL_ID,
        sql_text: sqlText,
        module: row.MODULE,
        schema_name: row.SCHEMA_NAME,
        status: row.STATUS,
        priority: row.PRIORITY,
        elapsed_time_ms: Math.floor(Number(row.ELAPSED_TIME_MS) || 0),
        cpu_time_ms: Math.floor(Number(row.CPU_TIME_MS) || 0),
        buffer_gets: Math.floor(Number(row.BUFFER_GETS) || 0),
        disk_reads: Math.floor(Number(row.DISK_READS) || 0),
        executions: Math.floor(Number(row.EXECUTIONS) || 0),
        rows_processed: Math.floor(Number(row.ROWS_PROCESSED) || 0),
        avg_elapsed_time_ms: Math.floor(Number(row.AVG_ELAPSED_TIME_MS) || 0),
        gets_per_exec: Math.floor(Number(row.GETS_PER_EXEC) || 0),
        oracle_connection_id: connectionId,
        collected_at: new Date().toISOString(),
      };
    });

    return NextResponse.json({
      data: sqlStats,
      total: Number(totalCount) || 0,
      count: sqlStats.length,
      limit,
      offset: 0,
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch SQL statistics from Oracle' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 현재 사용자 확인
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { connection_id } = body;

    if (!connection_id) {
      return NextResponse.json({ error: 'connection_id is required' }, { status: 400 });
    }

    // SQL 통계 수집 트리거
    // TODO: 백그라운드 작업으로 처리
    // 현재는 간단하게 응답만 반환

    return NextResponse.json({
      message: 'SQL statistics collection triggered',
      connection_id,
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
