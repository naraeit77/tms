import 'server-only';

/**
 * SQL Statistics API
 * GET: SQL 통계 조회
 * POST: SQL 통계 수집 트리거
 *
 * 시간 범위가 지정된 경우:
 * - Enterprise Edition: V$ACTIVE_SESSION_HISTORY (ASH)를 사용하여 해당 시간대에 활성화된 SQL 조회
 * - Standard Edition: V$SQL의 last_active_time을 기준으로 필터링 (제한적)
 *
 * 시간 범위가 없는 경우:
 * - V$SQL 직접 조회
 *
 * Oracle Edition 지원:
 * - Enterprise Edition (EE): ASH 사용 가능 (Diagnostics Pack 필요)
 * - Standard Edition (SE/SE2): ASH 사용 불가, V$SQL 기반 폴백
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';
import { getConnectionEdition } from '@/lib/oracle/edition-guard-server';

/**
 * Oracle Edition 확인 및 ASH 사용 가능 여부 체크
 * Standard Edition에서는 V$ACTIVE_SESSION_HISTORY가 존재하지 않음
 */
async function checkAshAvailability(config: any): Promise<boolean> {
  try {
    // ASH 테이블 존재 여부 확인 (간단한 쿼리로 테스트)
    const testQuery = `
      SELECT 1 FROM v$active_session_history WHERE ROWNUM = 1
    `;
    await executeQuery(config, testQuery);
    return true;
  } catch {
    // ASH가 없거나 권한이 없으면 false 반환
    return false;
  }
}

/**
 * 시간 범위 기반 SQL 조회 (V$ACTIVE_SESSION_HISTORY 사용)
 * ASH는 실제로 해당 시간에 실행 중이었던 SQL만 포함
 */
async function getTimeRangeSqlStats(
  config: any,
  connectionId: string,
  startTime: string,
  endTime: string,
  limit: number,
  orderBy: string
) {
  console.log('[sql-statistics] ASH 시간 범위 쿼리:', { startTime, endTime, limit, orderBy });

  // 시간 문자열을 Oracle 타임스탬프 형식으로 변환
  // 입력: "2025-11-28 14:30:00" 형태
  // 시간 범위를 1분씩 확장하여 경계값 문제 해결
  const startTimestamp = `TO_TIMESTAMP('${startTime}', 'YYYY-MM-DD HH24:MI:SS') - INTERVAL '1' MINUTE`;
  const endTimestamp = `TO_TIMESTAMP('${endTime}', 'YYYY-MM-DD HH24:MI:SS') + INTERVAL '1' MINUTE`;

  // 정렬 컬럼 매핑 (ASH 기반 - sql_with_stats CTE의 컬럼명 사용)
  let orderColumn = 'sample_count';
  if (orderBy === 'elapsed_time_ms' || orderBy === 'cpu_time_ms') {
    orderColumn = 'avg_elapsed_ms';
  } else if (orderBy === 'buffer_gets') {
    orderColumn = 'buffer_gets';  // V$SQL에서 가져온 buffer_gets 컬럼 사용
  } else if (orderBy === 'disk_reads') {
    orderColumn = 'disk_reads';   // V$SQL에서 가져온 disk_reads 컬럼 사용
  } else if (orderBy === 'executions') {
    orderColumn = 'sample_count';
  }

  // V$ACTIVE_SESSION_HISTORY에서 시간 범위 내 활성 SQL 조회
  // ASH는 1초마다 활성 세션을 샘플링하므로 sample_count가 대략적인 활성 시간을 나타냄
  const query = `
    WITH ash_sql AS (
      SELECT
        ash.sql_id,
        COUNT(*) as sample_count,
        MIN(ash.sample_time) as first_seen,
        MAX(ash.sample_time) as last_seen,
        SUM(NVL(ash.tm_delta_time, 0)) / 1000000 as total_elapsed_sec,
        SUM(NVL(ash.tm_delta_cpu_time, 0)) / 1000000 as total_cpu_sec,
        SUM(NVL(ash.delta_read_io_requests, 0)) as total_disk_reads,
        SUM(NVL(ash.delta_interconnect_io_bytes, 0)) as total_io_bytes
      FROM
        v$active_session_history ash
      WHERE
        ash.sample_time >= ${startTimestamp}
        AND ash.sample_time <= ${endTimestamp}
        AND ash.sql_id IS NOT NULL
        AND ash.user_id NOT IN (0, 5)  -- SYS, SYSTEM 제외
      GROUP BY
        ash.sql_id
    ),
    sql_with_stats AS (
      SELECT
        a.sql_id,
        a.sample_count,
        a.first_seen,
        a.last_seen,
        a.total_elapsed_sec,
        a.total_cpu_sec,
        a.total_disk_reads,
        s.sql_text,
        s.module,
        s.parsing_schema_name as schema_name,
        s.executions,
        s.elapsed_time / 1000 as elapsed_time_ms,
        s.cpu_time / 1000 as cpu_time_ms,
        s.buffer_gets,
        s.disk_reads,
        s.rows_processed,
        CASE WHEN s.executions > 0 THEN s.elapsed_time / s.executions / 1000 ELSE 0 END as avg_elapsed_ms,
        CASE WHEN s.executions > 0 THEN s.buffer_gets / s.executions ELSE 0 END as gets_per_exec,
        s.plan_hash_value,
        s.first_load_time,
        s.last_active_time
      FROM
        ash_sql a
        LEFT JOIN v$sql s ON a.sql_id = s.sql_id
      WHERE
        s.sql_text IS NOT NULL
        AND s.sql_text NOT LIKE '%v$%'
        AND s.sql_text NOT LIKE '%V$%'
    )
    SELECT
      sql_id,
      sql_text,
      module,
      schema_name,
      executions,
      elapsed_time_ms,
      cpu_time_ms,
      buffer_gets,
      disk_reads,
      rows_processed,
      avg_elapsed_ms as avg_elapsed_time_ms,
      gets_per_exec,
      first_load_time,
      last_active_time,
      plan_hash_value,
      sample_count,
      first_seen,
      last_seen,
      total_elapsed_sec as ash_elapsed_sec,
      total_cpu_sec as ash_cpu_sec,
      total_disk_reads as ash_disk_reads,
      CASE
        WHEN avg_elapsed_ms > 2000 THEN 'CRITICAL'
        WHEN avg_elapsed_ms > 1000 THEN 'WARNING'
        WHEN gets_per_exec > 50000 THEN 'WARNING'
        ELSE 'NORMAL'
      END as status,
      CASE
        WHEN avg_elapsed_ms > 2000 THEN 'HIGH'
        WHEN avg_elapsed_ms > 1000 THEN 'MEDIUM'
        ELSE 'LOW'
      END as priority
    FROM
      sql_with_stats
    ORDER BY
      ${orderColumn} DESC
    FETCH FIRST ${limit} ROWS ONLY
  `;

  const result = await executeQuery(config, query, [], { timeout: 30000 });
  console.log('[sql-statistics] ASH 쿼리 결과:', { rowCount: result.rows?.length || 0 });

  // 결과가 없어도 빈 결과를 반환 (폴백 없음)
  // 이는 해당 시간대에 실제로 활성화된 SQL이 없었음을 의미함
  // 차트가 Oracle 서버 시간 기반으로 생성되므로, 시간 범위가 정확히 매칭됨

  // SQL 데이터 변환
  const sqlStats = result.rows.map((row: any, index: number) => {
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
      id: `${connectionId}-${row.SQL_ID}-${row.PLAN_HASH_VALUE || 0}-${index}`,
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
      // ASH 추가 정보
      sample_count: Math.floor(Number(row.SAMPLE_COUNT) || 0),
      first_seen: row.FIRST_SEEN,
      last_seen: row.LAST_SEEN,
      ash_elapsed_sec: Number(row.ASH_ELAPSED_SEC) || 0,
      ash_cpu_sec: Number(row.ASH_CPU_SEC) || 0,
    };
  });

  return {
    data: sqlStats,
    total: sqlStats.length,
    count: sqlStats.length,
    source: 'ash', // ASH에서 데이터 조회됨을 표시
  };
}

/**
 * 시간 범위 기반 SQL 조회 - Standard Edition 폴백 (V$SQL 사용)
 *
 * 중요: 차트의 시간은 클라이언트 브라우저 시간 기준이고, Oracle V$SQL의 last_active_time은
 * Oracle 서버 시간 기준입니다. 시간대 차이로 인해 정확한 매칭이 어려울 수 있습니다.
 *
 * 따라서 시간 범위가 지정되면:
 * 1. 먼저 해당 시간 범위로 조회 시도
 * 2. 결과가 없으면 최근 활성 SQL 조회 (시간 범위 무시)
 */
async function getTimeRangeSqlStatsFallback(
  config: any,
  connectionId: string,
  startTime: string,
  endTime: string,
  limit: number,
  orderBy: string
) {
  console.log('[sql-statistics] V$SQL 폴백 시간 범위 쿼리:', { startTime, endTime, limit, orderBy });

  // V$SQL.LAST_ACTIVE_TIME은 DATE 타입이므로 TO_DATE 사용
  // 시간 문자열 형식: 'YYYY-MM-DD HH24:MI:SS'
  // 시간 범위를 1분씩 확장하여 경계값 문제 해결
  const startDate = `TO_DATE('${startTime}', 'YYYY-MM-DD HH24:MI:SS') - INTERVAL '1' MINUTE`;
  const endDate = `TO_DATE('${endTime}', 'YYYY-MM-DD HH24:MI:SS') + INTERVAL '1' MINUTE`;

  // 정렬 컬럼 결정
  let orderColumn = 'last_active_time';
  if (orderBy === 'elapsed_time_ms') {
    orderColumn = 'elapsed_time';
  } else if (orderBy === 'cpu_time_ms') {
    orderColumn = 'cpu_time';
  } else if (orderBy === 'buffer_gets') {
    orderColumn = 'buffer_gets';
  } else if (orderBy === 'disk_reads') {
    orderColumn = 'disk_reads';
  } else if (orderBy === 'executions') {
    orderColumn = 'executions';
  }

  // 먼저 시간 범위로 조회 시도
  // Oracle 11g 호환: FETCH FIRST 대신 서브쿼리 + ROWNUM 사용
  const timeRangeQuery = `
    SELECT * FROM (
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
          WHEN elapsed_time / DECODE(executions, 0, 1, executions) > 2000000 THEN 'CRITICAL'
          WHEN elapsed_time / DECODE(executions, 0, 1, executions) > 1000000 THEN 'WARNING'
          WHEN buffer_gets / DECODE(executions, 0, 1, executions) > 50000 THEN 'WARNING'
          ELSE 'NORMAL'
        END as status,
        CASE
          WHEN elapsed_time / DECODE(executions, 0, 1, executions) > 2000000 THEN 'HIGH'
          WHEN elapsed_time / DECODE(executions, 0, 1, executions) > 1000000 THEN 'MEDIUM'
          ELSE 'LOW'
        END as priority
      FROM
        v$sql
      WHERE
        parsing_schema_name NOT IN ('SYS', 'SYSTEM')
        AND sql_text NOT LIKE '%v$%'
        AND sql_text NOT LIKE '%V$%'
        AND executions > 0
        AND last_active_time >= ${startDate}
        AND last_active_time <= ${endDate}
      ORDER BY
        ${orderColumn} DESC
    ) WHERE ROWNUM <= ${limit}
  `;

  const result = await executeQuery(config, timeRangeQuery, [], { timeout: 30000 });
  console.log('[sql-statistics] V$SQL 폴백 쿼리 결과:', { rowCount: result.rows?.length || 0 });

  // 결과가 없어도 빈 결과를 반환 (폴백 없음)
  // 이는 해당 시간대에 실제로 실행된 SQL이 없었음을 의미함
  // 차트가 Oracle 서버 시간 기반으로 생성되므로, 시간 범위가 정확히 매칭됨

  // SQL 데이터 변환
  const sqlStats = result.rows.map((row: any, index: number) => {
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
      id: `${connectionId}-${row.SQL_ID}-${row.PLAN_HASH_VALUE || 0}-${index}`,
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
      // V$SQL 폴백에서는 ASH 정보 없음
      sample_count: 0,
      first_seen: null,
      last_seen: row.LAST_ACTIVE_TIME,
      ash_elapsed_sec: 0,
      ash_cpu_sec: 0,
    };
  });

  return {
    data: sqlStats,
    total: sqlStats.length,
    count: sqlStats.length,
    source: 'v$sql_fallback', // Standard Edition 폴백임을 표시
  };
}

/**
 * SQL_ID로 직접 조회
 */
async function getSqlById(
  config: any,
  connectionId: string,
  sqlId: string
) {
  // SQL_ID 형식 검증 (13자리 영숫자)
  if (!/^[a-zA-Z0-9]{13}$/.test(sqlId)) {
    throw new Error('Invalid SQL_ID format. SQL_ID must be 13 alphanumeric characters.');
  }

  const query = `
    SELECT
      sql_id,
      SUBSTR(sql_text, 1, 1000) as sql_text,
      module,
      parsing_schema_name as schema_name,
      executions,
      ROUND(elapsed_time / 1000) as elapsed_time_ms,
      ROUND(cpu_time / 1000) as cpu_time_ms,
      buffer_gets,
      disk_reads,
      rows_processed,
      ROUND(elapsed_time / DECODE(executions, 0, 1, executions) / 1000) as avg_elapsed_time_ms,
      ROUND(buffer_gets / DECODE(executions, 0, 1, executions)) as gets_per_exec,
      first_load_time,
      last_active_time,
      plan_hash_value,
      CASE
        WHEN elapsed_time / DECODE(executions, 0, 1, executions) > 2000000 THEN 'CRITICAL'
        WHEN elapsed_time / DECODE(executions, 0, 1, executions) > 1000000 THEN 'WARNING'
        WHEN buffer_gets / DECODE(executions, 0, 1, executions) > 50000 THEN 'WARNING'
        ELSE 'NORMAL'
      END as status,
      CASE
        WHEN elapsed_time / DECODE(executions, 0, 1, executions) > 2000000 THEN 'HIGH'
        WHEN elapsed_time / DECODE(executions, 0, 1, executions) > 1000000 THEN 'MEDIUM'
        ELSE 'LOW'
      END as priority
    FROM
      v$sql
    WHERE
      sql_id = :1
      AND executions > 0
  `;

  const result = await executeQuery(config, query, [sqlId], { timeout: 5000 });

  const sqlStats = result.rows.map((row: any, index: number) => {
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
      id: `${connectionId}-${row.SQL_ID}-${row.PLAN_HASH_VALUE || 0}-${index}`,
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

  return {
    data: sqlStats,
    total: sqlStats.length,
    count: sqlStats.length,
    source: 'v$sql',
  };
}

/**
 * 기본 SQL 통계 조회 (V$SQL 사용)
 */
async function getDefaultSqlStats(
  config: any,
  connectionId: string,
  limit: number,
  orderBy: string,
  minElapsedTime: string | null,
  minBufferGets: string | null,
  minExecutions: string | null,
  module: string | null
) {
  let whereConditions = [
    "parsing_schema_name NOT IN ('SYS', 'SYSTEM')",
    "executions > 0",
    "ROWNUM <= 500" // 성능 최적화: 스캔 범위 제한
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

  // 최적화: sql_text LIKE 조건 제거 (CLOB 스캔 비용 절감), 결과 수 제한
  // Oracle 11g 호환: FETCH FIRST 대신 서브쿼리 + ROWNUM 사용
  const query = `
    SELECT * FROM (
      SELECT /*+ FIRST_ROWS(${limit}) */
        sql_id,
        SUBSTR(sql_text, 1, 1000) as sql_text,
        module,
        parsing_schema_name as schema_name,
        executions,
        ROUND(elapsed_time / 1000) as elapsed_time_ms,
        ROUND(cpu_time / 1000) as cpu_time_ms,
        buffer_gets,
        disk_reads,
        rows_processed,
        ROUND(elapsed_time / DECODE(executions, 0, 1, executions) / 1000) as avg_elapsed_time_ms,
        ROUND(buffer_gets / DECODE(executions, 0, 1, executions)) as gets_per_exec,
        first_load_time,
        last_active_time,
        plan_hash_value,
        CASE
          WHEN elapsed_time / DECODE(executions, 0, 1, executions) > 2000000 THEN 'CRITICAL'
          WHEN elapsed_time / DECODE(executions, 0, 1, executions) > 1000000 THEN 'WARNING'
          WHEN buffer_gets / DECODE(executions, 0, 1, executions) > 50000 THEN 'WARNING'
          ELSE 'NORMAL'
        END as status,
        CASE
          WHEN elapsed_time / DECODE(executions, 0, 1, executions) > 2000000 THEN 'HIGH'
          WHEN elapsed_time / DECODE(executions, 0, 1, executions) > 1000000 THEN 'MEDIUM'
          ELSE 'LOW'
        END as priority
      FROM
        v$sql
      WHERE
        ${whereConditions.join(' AND ')}
      ORDER BY
        ${orderColumn} DESC
    ) WHERE ROWNUM <= ${limit}
  `;

  // 타임아웃 8초로 설정 (기존 무제한 → 8초)
  const result = await executeQuery(config, query, [], { timeout: 8000 });

  // 별도 COUNT 쿼리 제거 - 결과 수를 total로 사용 (성능 최적화)
  const totalCount = result.rows.length;

  const sqlStats = result.rows.map((row: any, index: number) => {
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
      id: `${connectionId}-${row.SQL_ID}-${row.PLAN_HASH_VALUE || 0}-${index}`,
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

  return {
    data: sqlStats,
    total: Number(totalCount) || 0,
    count: sqlStats.length,
    source: 'v$sql',
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    const connectionId = searchParams.get('connection_id');
    const orderBy = searchParams.get('order_by') || 'buffer_gets';
    const limit = parseInt(searchParams.get('limit') || '100');
    const minElapsedTime = searchParams.get('min_elapsed_time');
    const minBufferGets = searchParams.get('min_buffer_gets');
    const minExecutions = searchParams.get('min_executions');
    const module = searchParams.get('module');
    const startTime = searchParams.get('start_time');
    const endTime = searchParams.get('end_time');
    const sqlId = searchParams.get('sql_id'); // SQL_ID로 직접 검색

    if (!connectionId || connectionId === 'all') {
      return NextResponse.json({
        data: [],
        total: 0,
        limit,
        offset: 0,
      });
    }

    // Oracle 직접 쿼리
    const config = await getOracleConfig(connectionId);

    let result;

    // 에디션 확인 (ASH 사용 가능 여부 결정)
    const edition = await getConnectionEdition(connectionId);
    const isStandardEdition = edition !== 'Enterprise';

    // SQL_ID로 직접 조회하는 경우
    if (sqlId) {
      result = await getSqlById(config, connectionId, sqlId);
    } else if (startTime && endTime) {
      // 시간 범위가 지정된 경우: 에디션에 따라 적절한 방법 선택
      try {
        if (!isStandardEdition) {
          // Enterprise Edition: ASH 사용 가능 여부 확인
          const ashAvailable = await checkAshAvailability(config);

          if (ashAvailable) {
            result = await getTimeRangeSqlStats(config, connectionId, startTime, endTime, limit, orderBy);

            // ASH 결과가 비어있으면 V$SQL 폴백 시도
            if (result.data.length === 0) {
              console.log('[sql-statistics] ASH 결과 없음, V$SQL 폴백 시도');
              const fallbackResult = await getTimeRangeSqlStatsFallback(config, connectionId, startTime, endTime, limit, orderBy);
              if (fallbackResult.data.length > 0) {
                result = fallbackResult;
                result.source = 'v$sql_fallback_from_ash';
              }
            }
          } else {
            result = await getTimeRangeSqlStatsFallback(config, connectionId, startTime, endTime, limit, orderBy);
          }
        } else {
          // Standard Edition: ASH 프로빙 없이 바로 V$SQL 사용
          console.log('[sql-statistics] Standard Edition: V$SQL 직접 사용');
          result = await getTimeRangeSqlStatsFallback(config, connectionId, startTime, endTime, limit, orderBy);
        }
      } catch (timeRangeError) {
        // 시간 범위 쿼리 실패 시 상세 에러 로깅
        console.error('Time range SQL query error:', timeRangeError);
        console.error('Start time:', startTime, 'End time:', endTime);

        // 에러 메시지 추출
        const errorMessage = timeRangeError instanceof Error ? timeRangeError.message : String(timeRangeError);

        return NextResponse.json({
          data: [],
          total: 0,
          count: 0,
          source: 'error',
          warning: errorMessage,
        });
      }
    } else {
      // 시간 범위가 없는 경우: V$SQL 사용
      result = await getDefaultSqlStats(
        config, connectionId, limit, orderBy,
        minElapsedTime, minBufferGets, minExecutions, module
      );
    }

    return NextResponse.json({
      ...result,
      limit,
      offset: 0,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('[SQL Statistics API] Error occurred, returning empty result:', errorMessage);

    // 모든 에러를 graceful하게 처리하여 빈 데이터 반환 (500 에러 대신)
    return NextResponse.json({
      success: true,
      data: [],
      count: 0,
      source: 'fallback',
      warning: errorMessage,
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    // 현재 사용자 확인 (Next-Auth 세션 사용)
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
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
    // 에러를 조용히 처리 (개발 환경에서만 출력)
    if (process.env.NODE_ENV === 'development') {
      console.debug('SQL Statistics POST API Error:', error);
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
