/**
 * SQL Grades API Route
 * TMS 2.0 SQL 등급 시스템 - SQL 성능 등급 조회 및 분석
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';
import {
  transformToClusterPoint,
  SQLGrade,
  SQL_GRADES,
  SQLClusterPoint,
} from '@/lib/sql-grading';

// v$sql 기반 SQL 통계 조회 쿼리 (limit 파라미터 사용)
// Oracle 11g 호환: FETCH FIRST 대신 서브쿼리 + ROWNUM 사용
const getSqlStatsQuery = (limit: number) => `
SELECT * FROM (
  SELECT
    sql_id,
    SUBSTR(sql_text, 1, 200) as sql_text,
    executions,
    elapsed_time / 1000000 AS elapsed_sec,
    cpu_time / 1000000 AS cpu_sec,
    buffer_gets,
    disk_reads,
    rows_processed,
    module,
    parsing_schema_name AS username,
    first_load_time,
    last_active_time
  FROM v$sql
  WHERE executions > 0
    AND sql_text NOT LIKE '%v$%'
    AND sql_text NOT LIKE '%dba_%'
    AND elapsed_time > 0
  ORDER BY elapsed_time DESC
) WHERE ROWNUM <= ${limit}
`;

// 특정 시간 범위 SQL 조회 (v$active_session_history 기반)
// Oracle 11g 호환: FETCH FIRST 대신 서브쿼리 + ROWNUM 사용
const getSqlByTimeRangeQuery = (limit: number) => `
SELECT * FROM (
  SELECT
    sql.sql_id,
    SUBSTR(sql.sql_text, 1, 200) as sql_text,
    sql.executions,
    sql.elapsed_time / 1000000 AS elapsed_sec,
    sql.cpu_time / 1000000 AS cpu_sec,
    sql.buffer_gets,
    sql.disk_reads,
    sql.rows_processed,
    sql.module,
    ash.wait_class,
    COUNT(DISTINCT ash.sample_id) AS samples,
    ROUND(COUNT(DISTINCT ash.sample_id) * 100.0 /
      NULLIF((SELECT COUNT(*) FROM v$active_session_history
       WHERE sample_time BETWEEN TO_TIMESTAMP(:start_time, 'YYYY-MM-DD HH24:MI:SS')
         AND TO_TIMESTAMP(:end_time, 'YYYY-MM-DD HH24:MI:SS')), 0), 2) AS pct_activity
  FROM v$active_session_history ash
  JOIN v$sql sql ON ash.sql_id = sql.sql_id
  WHERE ash.sample_time BETWEEN TO_TIMESTAMP(:start_time, 'YYYY-MM-DD HH24:MI:SS')
    AND TO_TIMESTAMP(:end_time, 'YYYY-MM-DD HH24:MI:SS')
    AND ash.sql_id IS NOT NULL
  GROUP BY sql.sql_id, sql.sql_text, sql.executions, sql.elapsed_time,
           sql.cpu_time, sql.buffer_gets, sql.disk_reads, sql.rows_processed,
           sql.module, ash.wait_class
  ORDER BY samples DESC
) WHERE ROWNUM <= ${limit}
`;

// Custom ASH 테이블 기반 조회 (Standard Edition)
// Oracle 11g 호환: FETCH FIRST 대신 서브쿼리 + ROWNUM 사용
const getSqlByTimeRangeSeQuery = (limit: number) => `
SELECT * FROM (
  SELECT
    sql.sql_id,
    SUBSTR(sql.sql_text, 1, 200) as sql_text,
    sql.executions,
    sql.elapsed_time / 1000000 AS elapsed_sec,
    sql.cpu_time / 1000000 AS cpu_sec,
    sql.buffer_gets,
    sql.disk_reads,
    sql.rows_processed,
    sql.module,
    ash.wait_class,
    COUNT(*) AS samples,
    ROUND(COUNT(*) * 100.0 /
      NULLIF((SELECT COUNT(*) FROM tms_ash_samples
       WHERE sample_time BETWEEN TO_TIMESTAMP(:start_time, 'YYYY-MM-DD HH24:MI:SS')
         AND TO_TIMESTAMP(:end_time, 'YYYY-MM-DD HH24:MI:SS')), 0), 2) AS pct_activity
  FROM tms_ash_samples ash
  JOIN v$sql sql ON ash.sql_id = sql.sql_id
  WHERE ash.sample_time BETWEEN TO_TIMESTAMP(:start_time, 'YYYY-MM-DD HH24:MI:SS')
    AND TO_TIMESTAMP(:end_time, 'YYYY-MM-DD HH24:MI:SS')
    AND ash.sql_id IS NOT NULL
  GROUP BY sql.sql_id, sql.sql_text, sql.executions, sql.elapsed_time,
           sql.cpu_time, sql.buffer_gets, sql.disk_reads, sql.rows_processed,
           sql.module, ash.wait_class
  ORDER BY samples DESC
) WHERE ROWNUM <= ${limit}
`;

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connectionId') || searchParams.get('connection_id');
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const gradeFilter = searchParams.get('grade') as SQLGrade | null;
    const startTime = searchParams.get('startTime');
    const endTime = searchParams.get('endTime');
    const useEnterprise = searchParams.get('enterprise') === 'true';

    if (!connectionId) {
      return NextResponse.json(
        { error: 'connectionId is required' },
        { status: 400 }
      );
    }

    const config = await getOracleConfig(connectionId);

    // limit 범위 제한 (최소 10, 최대 2000)
    const safeLimit = Math.min(Math.max(limit, 10), 2000);

    let query: string;
    let bindParams: any = {};

    // 시간 범위가 지정된 경우
    if (startTime && endTime) {
      if (useEnterprise) {
        query = getSqlByTimeRangeQuery(safeLimit);
      } else {
        query = getSqlByTimeRangeSeQuery(safeLimit);
      }
      bindParams = {
        start_time: startTime,
        end_time: endTime,
      };
    } else {
      query = getSqlStatsQuery(safeLimit);
    }

    const result = await executeQuery(config, query, bindParams);

    // SQL 데이터를 클러스터 포인트로 변환하고 등급 계산
    let clusterData: SQLClusterPoint[] = result.rows.map((row: any) => {
      return transformToClusterPoint({
        sql_id: row.SQL_ID,
        elapsed_sec: parseFloat(row.ELAPSED_SEC) || 0,
        cpu_sec: parseFloat(row.CPU_SEC) || 0,
        executions: parseInt(row.EXECUTIONS, 10) || 1,
        buffer_gets: parseInt(row.BUFFER_GETS, 10) || 0,
        disk_reads: parseInt(row.DISK_READS, 10) || 0,
        rows_processed: parseInt(row.ROWS_PROCESSED, 10) || 0,
        module: row.MODULE,
        wait_class: row.WAIT_CLASS,
        sql_text: row.SQL_TEXT,
      });
    });

    // 등급 필터 적용
    if (gradeFilter) {
      clusterData = clusterData.filter((sql) => sql.grade === gradeFilter);
    }

    // 등급별 통계 계산
    const gradeStats = clusterData.reduce(
      (acc, sql) => {
        acc[sql.grade] = (acc[sql.grade] || 0) + 1;
        return acc;
      },
      {} as Record<SQLGrade, number>
    );

    // 등급별 정보 추가
    const gradeInfo = Object.entries(SQL_GRADES).map(([grade, info]) => ({
      grade,
      ...info,
      count: gradeStats[grade as SQLGrade] || 0,
    }));

    return NextResponse.json({
      success: true,
      data: clusterData,
      gradeStats,
      gradeInfo,
      meta: {
        connectionId,
        limit,
        gradeFilter,
        startTime,
        endTime,
        totalCount: clusterData.length,
        collectedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('SQL Grades API Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch SQL grades',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

// POST: 특정 SQL에 대한 상세 등급 분석
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { connectionId, sqlId } = body;

    if (!connectionId || !sqlId) {
      return NextResponse.json(
        { error: 'connectionId and sqlId are required' },
        { status: 400 }
      );
    }

    const config = await getOracleConfig(connectionId);

    // 특정 SQL 상세 정보 조회
    // Oracle 11g 호환: FETCH FIRST 대신 서브쿼리 + ROWNUM 사용
    const detailQuery = `
      SELECT * FROM (
        SELECT
          sql_id,
          sql_fulltext,
          executions,
          elapsed_time / 1000000 AS elapsed_sec,
          cpu_time / 1000000 AS cpu_sec,
          buffer_gets,
          disk_reads,
          rows_processed,
          module,
          parsing_schema_name AS username,
          first_load_time,
          last_active_time,
          plan_hash_value,
          optimizer_cost,
          sorts,
          fetches,
          parse_calls
        FROM v$sql
        WHERE sql_id = :sql_id
        ORDER BY last_active_time DESC
      ) WHERE ROWNUM <= 1
    `;

    const result = await executeQuery(config, detailQuery, { sql_id: sqlId });

    if (!result.rows || result.rows.length === 0) {
      return NextResponse.json(
        { error: 'SQL not found' },
        { status: 404 }
      );
    }

    const row = result.rows[0];
    const clusterPoint = transformToClusterPoint({
      sql_id: row.SQL_ID,
      elapsed_sec: parseFloat(row.ELAPSED_SEC) || 0,
      cpu_sec: parseFloat(row.CPU_SEC) || 0,
      executions: parseInt(row.EXECUTIONS, 10) || 1,
      buffer_gets: parseInt(row.BUFFER_GETS, 10) || 0,
      disk_reads: parseInt(row.DISK_READS, 10) || 0,
      rows_processed: parseInt(row.ROWS_PROCESSED, 10) || 0,
      module: row.MODULE,
    });

    // 튜닝 권장사항 생성 (D, F 등급에 대해)
    const recommendations: string[] = [];
    if (clusterPoint.bufferPerExec > 10000) {
      recommendations.push('Buffer Gets/Exec가 높음 - 인덱스 검토 필요');
    }
    if (clusterPoint.elapsedPerExec > 1) {
      recommendations.push('실행당 경과시간이 김 - 실행계획 분석 필요');
    }
    if (clusterPoint.diskReads / clusterPoint.bufferGets > 0.1) {
      recommendations.push('물리적 I/O 비율이 높음 - 메모리 캐싱 검토');
    }
    if (clusterPoint.grade === 'D' || clusterPoint.grade === 'F') {
      recommendations.push('SQL Advisor 실행 권장');
    }

    return NextResponse.json({
      success: true,
      data: {
        ...clusterPoint,
        sqlText: row.SQL_FULLTEXT,
        username: row.USERNAME,
        firstLoadTime: row.FIRST_LOAD_TIME,
        lastActiveTime: row.LAST_ACTIVE_TIME,
        planHashValue: row.PLAN_HASH_VALUE,
        optimizerCost: parseInt(row.OPTIMIZER_COST, 10) || 0,
        sorts: parseInt(row.SORTS, 10) || 0,
        fetches: parseInt(row.FETCHES, 10) || 0,
        parseCalls: parseInt(row.PARSE_CALLS, 10) || 0,
      },
      recommendations,
      gradeInfo: SQL_GRADES[clusterPoint.grade],
    });
  } catch (error: any) {
    console.error('SQL Grade Detail Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to analyze SQL grade',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
