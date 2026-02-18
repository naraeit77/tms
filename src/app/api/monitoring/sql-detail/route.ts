import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';
import { db } from '@/db';
import { sqlPerformanceHistory } from '@/db/schema';
import { eq, and, gte, desc } from 'drizzle-orm';
import oracledb from 'oracledb';

/**
 * GET /api/monitoring/sql-detail
 * SQL 상세 정보 및 실행계획 조회
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

    if (!connectionId || !sqlId) {
      return NextResponse.json(
        { error: 'Connection ID and SQL ID are required' },
        { status: 400 }
      );
    }

    console.log('[SQL Detail API] Received connection_id:', connectionId, 'sql_id:', sqlId);

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connectionId);

    // SQL_ID 형식 검증 (SQL Injection 방지 - 13자의 영숫자만 허용)
    const normalizedSqlId = sqlId.toLowerCase().trim();
    if (!/^[a-z0-9]{13}$/.test(normalizedSqlId)) {
      return NextResponse.json(
        { error: 'Invalid SQL_ID format. Must be 13 alphanumeric characters.' },
        { status: 400 }
      );
    }

    // 1. SQL 기본 정보 조회 - UNION ALL로 v$sql, v$sqlarea, dba_hist_sqltext를 한 번에 조회
    // 직렬 쿼리 최적화: 3번의 라운드트립 → 1번으로 감소
    const sqlInfoQuery = `
      SELECT * FROM (
        SELECT
          sql_id,
          sql_fulltext,
          sql_text,
          executions,
          elapsed_time / 1000 as elapsed_time_ms,
          cpu_time / 1000 as cpu_time_ms,
          buffer_gets,
          disk_reads,
          rows_processed,
          parsing_schema_name,
          module,
          last_active_time,
          first_load_time,
          optimizer_mode,
          optimizer_cost,
          elapsed_time / DECODE(executions, 0, 1, executions) / 1000 as avg_elapsed_ms,
          cpu_time / DECODE(executions, 0, 1, executions) / 1000 as avg_cpu_ms,
          buffer_gets / DECODE(executions, 0, 1, executions) as avg_buffer_gets,
          disk_reads / DECODE(executions, 0, 1, executions) as avg_disk_reads,
          rows_processed / DECODE(executions, 0, 1, executions) as avg_rows_processed,
          parse_calls,
          direct_writes,
          1 as source_priority
        FROM v$sql
        WHERE sql_id = :sql_id AND ROWNUM = 1
        UNION ALL
        SELECT
          sql_id,
          sql_fulltext,
          sql_text,
          executions,
          elapsed_time / 1000 as elapsed_time_ms,
          cpu_time / 1000 as cpu_time_ms,
          buffer_gets,
          disk_reads,
          rows_processed,
          parsing_schema_name,
          module,
          last_active_time,
          first_load_time,
          optimizer_mode,
          optimizer_cost,
          elapsed_time / DECODE(executions, 0, 1, executions) / 1000 as avg_elapsed_ms,
          cpu_time / DECODE(executions, 0, 1, executions) / 1000 as avg_cpu_ms,
          buffer_gets / DECODE(executions, 0, 1, executions) as avg_buffer_gets,
          disk_reads / DECODE(executions, 0, 1, executions) as avg_disk_reads,
          rows_processed / DECODE(executions, 0, 1, executions) as avg_rows_processed,
          parse_calls,
          0 as direct_writes,
          2 as source_priority
        FROM v$sqlarea
        WHERE sql_id = :sql_id AND ROWNUM = 1
      )
      WHERE ROWNUM = 1
      ORDER BY source_priority
    `;

    let sqlInfoResult = await executeQuery(config, sqlInfoQuery, [normalizedSqlId, normalizedSqlId], {
      fetchInfo: {
        SQL_FULLTEXT: { type: oracledb.STRING },
        SQL_TEXT: { type: oracledb.STRING },
      },
    });

    // 메모리 뷰에서 찾을 수 없으면 dba_hist_sqltext 시도 (별도 쿼리 - 권한 문제 가능)
    if (!sqlInfoResult.rows || sqlInfoResult.rows.length === 0) {
      console.log('[SQL Detail API] SQL not found in memory views, trying dba_hist_sqltext');

      const histSqlInfoQuery = `
        SELECT
          sql_id,
          sql_text,
          sql_text as sql_fulltext,
          0 as executions,
          0 as elapsed_time_ms,
          0 as cpu_time_ms,
          0 as buffer_gets,
          0 as disk_reads,
          0 as rows_processed,
          NULL as parsing_schema_name,
          NULL as module,
          NULL as last_active_time,
          NULL as first_load_time,
          NULL as optimizer_mode,
          0 as optimizer_cost,
          0 as avg_elapsed_ms,
          0 as avg_cpu_ms,
          0 as avg_buffer_gets,
          0 as avg_disk_reads,
          0 as avg_rows_processed,
          0 as parse_calls,
          0 as direct_writes,
          3 as source_priority
        FROM dba_hist_sqltext
        WHERE sql_id = :sql_id
        AND ROWNUM <= 1
      `;

      try {
        sqlInfoResult = await executeQuery(config, histSqlInfoQuery, [normalizedSqlId], {
          fetchInfo: {
            SQL_FULLTEXT: { type: oracledb.STRING },
            SQL_TEXT: { type: oracledb.STRING },
          },
        });
      } catch (err) {
        console.log('[SQL Detail API] dba_hist_sqltext not accessible:', err);
      }
    }

    if (!sqlInfoResult.rows || sqlInfoResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'SQL not found in v$sql, v$sqlarea, or dba_hist_sqltext' },
        { status: 404 }
      );
    }

    const sqlInfo = sqlInfoResult.rows[0];

    // SQL 텍스트 변환 (CLOB 처리)
    let sqlText = '';
    const sqlFullText = sqlInfo.SQL_FULLTEXT || sqlInfo.SQL_TEXT;

    console.log('[SQL Detail API] SQL_FULLTEXT type:', typeof sqlFullText, 'constructor:', sqlFullText?.constructor?.name);

    if (sqlFullText) {
      if (typeof sqlFullText === 'string') {
        sqlText = sqlFullText;
        console.log('[SQL Detail API] SQL text length:', sqlText.length);
      } else if (Buffer.isBuffer(sqlFullText)) {
        sqlText = sqlFullText.toString('utf-8');
        console.log('[SQL Detail API] Converted Buffer to string, length:', sqlText.length);
      } else if (sqlFullText.constructor && sqlFullText.constructor.name === 'Lob') {
        // Oracle CLOB - 비동기로 읽기
        console.log('[SQL Detail API] Reading CLOB asynchronously');
        try {
          const chunks: Buffer[] = [];
          sqlFullText.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });
          await new Promise((resolve, reject) => {
            sqlFullText.on('end', resolve);
            sqlFullText.on('error', reject);
          });
          sqlText = Buffer.concat(chunks).toString('utf-8');
          console.log('[SQL Detail API] CLOB read successfully, length:', sqlText.length);
        } catch (err) {
          console.error('[SQL Detail API] Error reading CLOB:', err);
          sqlText = sqlInfo.SQL_TEXT?.toString() || '';
        }
      } else if (typeof sqlFullText === 'object') {
        // CLOB 객체를 문자열로 변환 시도
        console.warn('[SQL Detail API] SQL_FULLTEXT is an object, attempting conversion');
        try {
          sqlText = String(sqlFullText);
          // [object Object]인 경우 SQL_TEXT 사용
          if (sqlText === '[object Object]') {
            console.warn('[SQL Detail API] Got [object Object], falling back to SQL_TEXT');
            sqlText = sqlInfo.SQL_TEXT?.toString() || '';
          }
        } catch (err) {
          console.error('[SQL Detail API] Error converting object to string:', err);
          sqlText = sqlInfo.SQL_TEXT?.toString() || '';
        }
      }
    } else {
      console.warn('[SQL Detail API] SQL_FULLTEXT and SQL_TEXT are both null/undefined');
    }

    // 2. 실행계획 조회
    const executionPlanQuery = `
      SELECT
        id,
        parent_id,
        operation,
        options,
        object_name,
        object_type,
        cardinality,
        bytes,
        cost,
        cpu_cost,
        io_cost,
        time,
        access_predicates,
        filter_predicates,
        partition_start,
        partition_stop
      FROM
        v$sql_plan
      WHERE
        sql_id = :sql_id
      ORDER BY
        id
    `;

    const executionPlanResult = await executeQuery(config, executionPlanQuery, [normalizedSqlId]);

    // 실행계획 데이터 변환
    const executionPlan = executionPlanResult.rows.map((row: any) => {
      // CLOB 필드 처리
      const convertClob = (field: any) => {
        if (!field) return null;
        if (typeof field === 'string') return field;
        if (Buffer.isBuffer(field)) return field.toString('utf-8');
        if (field.toString) return field.toString();
        return null;
      };

      return {
        id: row.ID,
        parent_id: row.PARENT_ID,
        operation: row.OPERATION,
        options: row.OPTIONS,
        object_name: row.OBJECT_NAME,
        object_type: row.OBJECT_TYPE,
        cardinality: Math.floor(Number(row.CARDINALITY) || 0),
        bytes: Math.floor(Number(row.BYTES) || 0),
        cost: Math.floor(Number(row.COST) || 0),
        cpu_cost: Math.floor(Number(row.CPU_COST) || 0),
        io_cost: Math.floor(Number(row.IO_COST) || 0),
        time: Math.floor(Number(row.TIME) || 0),
        access_predicates: convertClob(row.ACCESS_PREDICATES),
        filter_predicates: convertClob(row.FILTER_PREDICATES),
        partition_start: row.PARTITION_START,
        partition_stop: row.PARTITION_STOP,
      };
    });

    // 3. Bind 변수 정보 조회
    const bindVariablesQuery = `
      SELECT
        name,
        position,
        datatype_string,
        value_string
      FROM
        v$sql_bind_capture
      WHERE
        sql_id = :sql_id
      ORDER BY
        position
    `;

    let bindVariables = [];
    try {
      const bindVariablesResult = await executeQuery(config, bindVariablesQuery, [normalizedSqlId]);
      bindVariables = bindVariablesResult.rows.map((row: any) => ({
        name: row.NAME,
        position: row.POSITION,
        datatype: row.DATATYPE_STRING,
        value: row.VALUE_STRING,
      }));
    } catch (err) {
      console.error('Failed to fetch bind variables:', err);
    }

    // 4. PostgreSQL에서 히스토리 데이터 조회 (최근 7일)
    let performanceHistory: any[] = [];
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const historyData = await db
        .select()
        .from(sqlPerformanceHistory)
        .where(
          and(
            eq(sqlPerformanceHistory.oracleConnectionId, connectionId),
            eq(sqlPerformanceHistory.sqlId, sqlId),
            gte(sqlPerformanceHistory.collectedAt, sevenDaysAgo)
          )
        )
        .orderBy(desc(sqlPerformanceHistory.collectedAt))
        .limit(100);

      performanceHistory = historyData.map((row) => ({
        collected_at: row.collectedAt,
        collection_date: row.collectionDate,
        collection_hour: row.collectionHour,
        executions: Number(row.executions) || 0,
        elapsed_time_ms: Number(row.elapsedTimeMs) || 0,
        cpu_time_ms: Number(row.cpuTimeMs) || 0,
        buffer_gets: Number(row.bufferGets) || 0,
        disk_reads: Number(row.diskReads) || 0,
        rows_processed: Number(row.rowsProcessed) || 0,
        performance_grade: row.performanceGrade,
      }));
    } catch (err) {
      console.log('[SQL Detail API] Performance history query failed:', err);
    }

    // 결과 구성
    const detailData = {
      sql_info: {
        sql_id: sqlInfo.SQL_ID,
        sql_text: sqlText || '',
        executions: Math.floor(Number(sqlInfo.EXECUTIONS) || 0),
        elapsed_time_ms: Math.floor(Number(sqlInfo.ELAPSED_TIME_MS) || 0),
        cpu_time_ms: Math.floor(Number(sqlInfo.CPU_TIME_MS) || 0),
        buffer_gets: Math.floor(Number(sqlInfo.BUFFER_GETS) || 0),
        disk_reads: Math.floor(Number(sqlInfo.DISK_READS) || 0),
        rows_processed: Math.floor(Number(sqlInfo.ROWS_PROCESSED) || 0),
        schema_name: sqlInfo.PARSING_SCHEMA_NAME,
        module: sqlInfo.MODULE,
        last_active_time: sqlInfo.LAST_ACTIVE_TIME,
        first_load_time: sqlInfo.FIRST_LOAD_TIME,
        optimizer_mode: sqlInfo.OPTIMIZER_MODE,
        optimizer_cost: Math.floor(Number(sqlInfo.OPTIMIZER_COST) || 0),
        avg_elapsed_ms: Math.floor(Number(sqlInfo.AVG_ELAPSED_MS) || 0),
        avg_cpu_ms: Math.floor(Number(sqlInfo.AVG_CPU_MS) || 0),
        avg_buffer_gets: Math.floor(Number(sqlInfo.AVG_BUFFER_GETS) || 0),
        avg_disk_reads: Math.floor(Number(sqlInfo.AVG_DISK_READS) || 0),
        avg_rows_processed: Math.floor(Number(sqlInfo.AVG_ROWS_PROCESSED) || 0),
        parse_calls: Math.floor(Number(sqlInfo.PARSE_CALLS) || 0),
        direct_writes: Math.floor(Number(sqlInfo.DIRECT_WRITES) || 0),
        gets_per_exec: Math.floor(Number(sqlInfo.AVG_BUFFER_GETS) || 0),
      },
      execution_plan: executionPlan,
      bind_variables: bindVariables,
      performance_history: performanceHistory,
    };

    console.log(`[SQL Detail API] Returning detail for SQL_ID: ${sqlId}`);

    return NextResponse.json({
      success: true,
      data: detailData,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('SQL detail API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SQL detail' },
      { status: 500 }
    );
  }
}
