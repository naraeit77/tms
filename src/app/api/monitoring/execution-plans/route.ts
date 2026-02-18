import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * 실행계획 행들을 포맷팅된 텍스트로 변환
 */
function formatExecutionPlan(rows: any[]): string {
  if (!rows || rows.length === 0) return '';

  // ID 순으로 정렬
  const sortedRows = [...rows].sort((a, b) => (a.ID || 0) - (b.ID || 0));

  const lines: string[] = [];

  // 헤더
  lines.push('--------------------------------------------------------------------------------------------');
  lines.push('| Id  | Operation                     | Name              | Rows  | Bytes | Cost  | Time   |');
  lines.push('--------------------------------------------------------------------------------------------');

  sortedRows.forEach((row: any) => {
    const id = String(row.ID || '').padStart(4);
    const depth = row.DEPTH || 0;
    const indent = '  '.repeat(depth);

    let operation = row.OPERATION || '';
    if (row.OPTIONS) {
      operation += ` ${row.OPTIONS}`;
    }
    operation = (indent + operation).padEnd(29);

    const objectName = String(row.OBJECT_NAME || '').padEnd(17);
    const cardinality = String(Math.floor(Number(row.CARDINALITY) || 0)).padStart(6);
    const bytes = String(Math.floor(Number(row.BYTES) || 0)).padStart(6);
    const cost = String(Math.floor(Number(row.COST) || 0)).padStart(6);

    // 시간을 초 단위로 변환 (Oracle은 초 단위로 저장)
    const time = row.TIME ? `${Math.floor(Number(row.TIME) || 0)}s` : '';
    const timeStr = time.padStart(7);

    lines.push(`|${id} |${operation}|${objectName}|${cardinality}|${bytes}|${cost}|${timeStr}|`);

    // Access Predicates 추가
    if (row.ACCESS_PREDICATES) {
      const predicates = String(row.ACCESS_PREDICATES);
      lines.push(`|     |   Access: ${predicates}`);
    }

    // Filter Predicates 추가
    if (row.FILTER_PREDICATES) {
      const predicates = String(row.FILTER_PREDICATES);
      lines.push(`|     |   Filter: ${predicates}`);
    }
  });

  lines.push('--------------------------------------------------------------------------------------------');

  return lines.join('\n');
}

/**
 * GET /api/monitoring/execution-plans
 * Oracle SQL 실행계획 조회
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

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connectionId);

    if (sqlId) {
      // 특정 SQL의 실행계획 조회
      // Oracle SQL_ID는 항상 13자의 영숫자 (base64 인코딩)
      const normalizedSqlId = sqlId.toLowerCase().trim();

      // SQL Injection 방지: SQL_ID 형식 검증 (13자의 영숫자만 허용)
      if (!/^[a-z0-9]{13}$/.test(normalizedSqlId)) {
        return NextResponse.json({
          success: false,
          error: 'Invalid SQL_ID format',
          message: 'SQL_ID must be exactly 13 alphanumeric characters',
          data: [],
          count: 0,
        }, { status: 400 });
      }

      const query = `
        SELECT
          plan_hash_value,
          sql_id,
          timestamp,
          operation,
          options,
          object_owner,
          object_name,
          object_type,
          optimizer,
          id,
          parent_id,
          depth,
          position,
          cost,
          cardinality,
          bytes,
          cpu_cost,
          io_cost,
          temp_space,
          access_predicates,
          filter_predicates,
          partition_start,
          partition_stop,
          other_xml
        FROM
          v$sql_plan
        WHERE
          sql_id = '${normalizedSqlId}'
        ORDER BY
          plan_hash_value, id
      `;

      const result = await executeQuery(config, query);

      if (!result.rows || result.rows.length === 0) {
        // V$SQL_PLAN에 데이터가 없는 경우, DBMS_XPLAN.DISPLAY_CURSOR로 조회 시도
        try {
          const xplanQuery = `
            SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR('${normalizedSqlId}', NULL, 'ALLSTATS LAST'))
          `;
          const xplanResult = await executeQuery(config, xplanQuery);

          if (xplanResult.rows && xplanResult.rows.length > 0) {
            // DBMS_XPLAN 결과를 텍스트로 변환
            const planLines = xplanResult.rows.map((row: any) => row.PLAN_TABLE_OUTPUT || '').join('\n');

            if (planLines.trim() && !planLines.includes('SQL_ID 찾을 수 없음') && !planLines.includes('Error')) {
              // V$SQL에서 추가 정보 조회
              const sqlInfoQuery = `
                SELECT sql_id, plan_hash_value, executions,
                       elapsed_time / DECODE(executions, 0, 1, executions) / 1000 as avg_elapsed_ms
                FROM v$sql WHERE sql_id = '${normalizedSqlId}' AND ROWNUM = 1
              `;
              const sqlInfoResult = await executeQuery(config, sqlInfoQuery);
              const sqlInfo = sqlInfoResult.rows?.[0] || {};

              return NextResponse.json({
                success: true,
                data: [{
                  id: `${normalizedSqlId}_${sqlInfo.PLAN_HASH_VALUE || 0}`,
                  sql_id: normalizedSqlId,
                  plan_hash_value: sqlInfo.PLAN_HASH_VALUE ? Math.floor(Number(sqlInfo.PLAN_HASH_VALUE)) : null,
                  plan_text: planLines,
                  cost: 0,
                  cardinality: 0,
                  bytes: 0,
                  cpu_cost: 0,
                  io_cost: 0,
                  temp_space: 0,
                  access_predicates: null,
                  filter_predicates: null,
                  collected_at: new Date().toISOString(),
                  source: 'DBMS_XPLAN',
                }],
                count: 1,
              });
            }
          }
        } catch (xplanError) {
          console.log('DBMS_XPLAN.DISPLAY_CURSOR failed:', xplanError);
        }

        // DBMS_XPLAN도 실패하면 AWR 히스토리(DBA_HIST_SQL_PLAN)에서 조회
        const awrQuery = `
          SELECT
            plan_hash_value,
            sql_id,
            NULL as timestamp,
            operation,
            options,
            object_owner,
            object_name,
            object_type,
            optimizer,
            id,
            parent_id,
            depth,
            position,
            cost,
            cardinality,
            bytes,
            cpu_cost,
            io_cost,
            temp_space,
            access_predicates,
            filter_predicates,
            partition_start,
            partition_stop,
            other_xml
          FROM
            dba_hist_sql_plan
          WHERE
            sql_id = '${normalizedSqlId}'
          ORDER BY
            plan_hash_value, id
        `;

        try {
          const awrResult = await executeQuery(config, awrQuery);

          if (awrResult.rows && awrResult.rows.length > 0) {
            // AWR에서 실행계획을 찾음 - 같은 로직으로 처리
            const plansByHash = new Map<number, any[]>();

            awrResult.rows.forEach((row: any) => {
              const planHashValue = row.PLAN_HASH_VALUE ? Math.floor(Number(row.PLAN_HASH_VALUE)) : 0;
              if (!plansByHash.has(planHashValue)) {
                plansByHash.set(planHashValue, []);
              }
              plansByHash.get(planHashValue)!.push(row);
            });

            const plans = Array.from(plansByHash.entries()).map(([planHashValue, rows]) => {
              const planText = formatExecutionPlan(rows);
              const firstRow = rows[0];
              const rootNode = rows.find((r: any) => r.ID === 0) || firstRow;

              return {
                id: `${firstRow.SQL_ID}_${planHashValue}`,
                sql_id: firstRow.SQL_ID,
                plan_hash_value: planHashValue,
                plan_text: planText,
                cost: Math.floor(Number(rootNode.COST) || 0),
                cardinality: Math.floor(Number(rootNode.CARDINALITY) || 0),
                bytes: Math.floor(Number(rootNode.BYTES) || 0),
                cpu_cost: Math.floor(Number(rootNode.CPU_COST) || 0),
                io_cost: Math.floor(Number(rootNode.IO_COST) || 0),
                temp_space: Math.floor(Number(rootNode.TEMP_SPACE) || 0),
                access_predicates: rootNode.ACCESS_PREDICATES,
                filter_predicates: rootNode.FILTER_PREDICATES,
                collected_at: new Date().toISOString(),
                source: 'AWR',
              };
            });

            return NextResponse.json({
              success: true,
              warning: 'V$SQL_PLAN에서 찾을 수 없어 AWR 히스토리에서 조회했습니다.',
              data: plans,
              count: plans.length,
            });
          }
        } catch (awrError) {
          console.log('AWR query failed (may not have DBA privileges):', awrError);
        }

        // AWR에서도 못 찾은 경우, V$SQL에서 plan_hash_value만 조회
        const fallbackQuery = `
          SELECT
            sql_id,
            plan_hash_value,
            sql_text,
            executions,
            elapsed_time / DECODE(executions, 0, 1, executions) / 1000 as avg_elapsed_ms,
            cpu_time / DECODE(executions, 0, 1, executions) / 1000 as avg_cpu_ms,
            buffer_gets / DECODE(executions, 0, 1, executions) as avg_buffer_gets
          FROM
            v$sql
          WHERE
            sql_id = '${normalizedSqlId}'
            AND ROWNUM = 1
        `;

        const fallbackResult = await executeQuery(config, fallbackQuery);

        if (!fallbackResult.rows || fallbackResult.rows.length === 0) {
          return NextResponse.json({
            success: false,
            error: 'SQL_ID not found',
            message: `SQL_ID '${normalizedSqlId}'를 V$SQL, V$SQL_PLAN, DBA_HIST_SQL_PLAN에서 찾을 수 없습니다. SQL이 메모리에서 제거되었거나 존재하지 않는 SQL_ID입니다.`,
            data: [],
            count: 0,
          });
        }

        // V$SQL 정보만 반환 (실행계획 텍스트는 없음)
        const sqlInfo = fallbackResult.rows[0];
        let sqlText = sqlInfo.SQL_TEXT;
        if (sqlText && typeof sqlText !== 'string') {
          if (Buffer.isBuffer(sqlText)) {
            sqlText = sqlText.toString('utf-8');
          } else if (sqlText.toString) {
            sqlText = sqlText.toString();
          }
        }

        return NextResponse.json({
          success: true,
          warning: 'V$SQL_PLAN 및 AWR에 실행계획 정보가 없습니다.',
          data: [{
            id: `${sqlInfo.SQL_ID}_${sqlInfo.PLAN_HASH_VALUE || 0}`,
            sql_id: sqlInfo.SQL_ID,
            plan_hash_value: sqlInfo.PLAN_HASH_VALUE ? Math.floor(Number(sqlInfo.PLAN_HASH_VALUE)) : null,
            plan_text: '※ 실행계획을 조회할 수 없습니다.\n\n이유: SQL이 오래되어 메모리(V$SQL_PLAN)와 AWR 히스토리에서 제거되었거나,\n실행계획 정보가 생성되지 않았습니다.\n\n대안:\n1. SQL을 다시 실행하여 메모리에 로드\n2. SQL Tuning Advisor 사용',
            sql_text: sqlText ? sqlText.substring(0, 1000) : '',
            cost: 0,
            cardinality: 0,
            bytes: 0,
            cpu_cost: 0,
            io_cost: 0,
            temp_space: 0,
            access_predicates: null,
            filter_predicates: null,
            avg_elapsed_ms: Math.floor(Number(sqlInfo.AVG_ELAPSED_MS) || 0),
            avg_cpu_ms: Math.floor(Number(sqlInfo.AVG_CPU_MS) || 0),
            avg_buffer_gets: Math.floor(Number(sqlInfo.AVG_BUFFER_GETS) || 0),
            executions: Math.floor(Number(sqlInfo.EXECUTIONS) || 0),
            collected_at: new Date().toISOString(),
          }],
          count: 1,
        });
      }

      // 실행계획을 plan_hash_value별로 그룹화
      const plansByHash = new Map<number, any[]>();

      result.rows.forEach((row: any) => {
        const planHashValue = row.PLAN_HASH_VALUE ? Math.floor(Number(row.PLAN_HASH_VALUE)) : 0;
        if (!plansByHash.has(planHashValue)) {
          plansByHash.set(planHashValue, []);
        }
        plansByHash.get(planHashValue)!.push(row);
      });

      // 각 plan_hash_value별로 실행계획 텍스트 생성
      const plans = Array.from(plansByHash.entries()).map(([planHashValue, rows]) => {
        // 실행계획 텍스트 포맷팅
        const planText = formatExecutionPlan(rows);

        // 첫 번째 행에서 메타데이터 추출
        const firstRow = rows[0];

        // 전체 비용 계산 (ID=0인 루트 노드의 비용)
        const rootNode = rows.find((r: any) => r.ID === 0) || firstRow;

        return {
          id: `${firstRow.SQL_ID}_${planHashValue}`,
          sql_id: firstRow.SQL_ID,
          plan_hash_value: planHashValue,
          plan_text: planText,
          cost: Math.floor(Number(rootNode.COST) || 0),
          cardinality: Math.floor(Number(rootNode.CARDINALITY) || 0),
          bytes: Math.floor(Number(rootNode.BYTES) || 0),
          cpu_cost: Math.floor(Number(rootNode.CPU_COST) || 0),
          io_cost: Math.floor(Number(rootNode.IO_COST) || 0),
          temp_space: Math.floor(Number(rootNode.TEMP_SPACE) || 0),
          access_predicates: rootNode.ACCESS_PREDICATES,
          filter_predicates: rootNode.FILTER_PREDICATES,
          collected_at: firstRow.TIMESTAMP || new Date().toISOString(),
        };
      });

      return NextResponse.json({
        success: true,
        data: plans,
        count: plans.length,
      });
    } else {
      // 최근 실행된 SQL들의 요약 정보 조회 (고유한 plan_hash_value 개수 포함)
      const query = `
        WITH sql_with_plan_count AS (
          SELECT
            s.sql_id,
            MAX(s.sql_text) as sql_text,
            COUNT(DISTINCT s.plan_hash_value) as plan_count,
            MAX(s.plan_hash_value) as plan_hash_value,
            SUM(s.executions) as executions,
            SUM(s.elapsed_time) / DECODE(SUM(s.executions), 0, 1, SUM(s.executions)) / 1000 as avg_elapsed_ms,
            SUM(s.cpu_time) / DECODE(SUM(s.executions), 0, 1, SUM(s.executions)) / 1000 as avg_cpu_ms,
            SUM(s.buffer_gets) / DECODE(SUM(s.executions), 0, 1, SUM(s.executions)) as avg_buffer_gets,
            SUM(s.disk_reads) / DECODE(SUM(s.executions), 0, 1, SUM(s.executions)) as avg_disk_reads,
            SUM(s.rows_processed) / DECODE(SUM(s.executions), 0, 1, SUM(s.executions)) as avg_rows,
            MAX(s.first_load_time) as first_load_time,
            MAX(s.last_active_time) as last_active_time
          FROM
            v$sql s
          WHERE
            s.parsing_schema_name NOT IN ('SYS', 'SYSTEM')
            AND s.sql_text NOT LIKE '%v$%'
            AND s.sql_text NOT LIKE '%V$%'
            AND s.executions > 0
          GROUP BY s.sql_id
        )
        SELECT * FROM (
          SELECT *
          FROM sql_with_plan_count
          ORDER BY last_active_time DESC
        ) WHERE ROWNUM <= 50
      `;

      const result = await executeQuery(config, query);

      // SQL 요약 데이터를 변환
      const sqlSummary = result.rows.map((row: any) => {
        // SQL 텍스트를 문자열로 변환
        let sqlText = row.SQL_TEXT;
        if (sqlText && typeof sqlText !== 'string') {
          if (Buffer.isBuffer(sqlText)) {
            sqlText = sqlText.toString('utf-8');
          } else if (sqlText.toString) {
            sqlText = sqlText.toString();
          }
        }
        sqlText = sqlText ? sqlText.substring(0, 500) : '';

        return {
          sql_id: row.SQL_ID,
          sql_text: sqlText,
          plan_hash_value: row.PLAN_HASH_VALUE ? Math.floor(Number(row.PLAN_HASH_VALUE)) : null,
          plan_count: Math.floor(Number(row.PLAN_COUNT) || 1),
          executions: Math.floor(Number(row.EXECUTIONS) || 0),
          avg_elapsed_ms: Math.floor(Number(row.AVG_ELAPSED_MS) || 0),
          avg_cpu_ms: Math.floor(Number(row.AVG_CPU_MS) || 0),
          avg_buffer_gets: Math.floor(Number(row.AVG_BUFFER_GETS) || 0),
          avg_disk_reads: Math.floor(Number(row.AVG_DISK_READS) || 0),
          avg_rows: Math.floor(Number(row.AVG_ROWS) || 0),
          first_load_time: row.FIRST_LOAD_TIME,
          last_active_time: row.LAST_ACTIVE_TIME,
        };
      });

      return NextResponse.json({
        success: true,
        data: sqlSummary,
        count: sqlSummary.length,
      });
    }
  } catch (error) {
    console.error('Execution plans API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch execution plans' },
      { status: 500 }
    );
  }
}
