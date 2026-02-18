import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';
import { db } from '@/db';
import { sqlPerformanceHistory } from '@/db/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

/**
 * GET /api/monitoring/performance-history
 * 특정 날짜의 SQL 성능 히스토리 데이터 조회
 * 1순위: PostgreSQL sql_performance_history 테이블 (수집된 데이터)
 * 2순위: DBA_HIST_SQLSTAT (AWR - Enterprise Edition)
 * 3순위: V$SQL (현재 캐시 - 당일/전일만)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');
    const dateStr = searchParams.get('date'); // YYYY-MM-DD 형식
    const startTime = searchParams.get('start_time'); // HH:MM:SS 형식 (optional)
    const endTime = searchParams.get('end_time'); // HH:MM:SS 형식 (optional)

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    if (!dateStr) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 });
    }

    // 시간 범위 조건 생성
    const hasTimeFilter = startTime && endTime;
    const startDateTime = hasTimeFilter ? `${dateStr} ${startTime}` : null;
    const endDateTime = hasTimeFilter ? `${dateStr} ${endTime}` : null;

    let historyData: any[] = [];

    // 1. PostgreSQL sql_performance_history 테이블에서 우선 조회 (수집된 데이터)
    try {
      const conditions = [
        eq(sqlPerformanceHistory.oracleConnectionId, connectionId),
        eq(sqlPerformanceHistory.collectionDate, dateStr),
      ];

      // 시간 필터가 있는 경우
      if (hasTimeFilter) {
        const startHour = parseInt(startTime!.split(':')[0]);
        const endHour = parseInt(endTime!.split(':')[0]);
        conditions.push(gte(sqlPerformanceHistory.collectionHour, startHour));
        conditions.push(lte(sqlPerformanceHistory.collectionHour, endHour));
      }

      const dbData = await db
        .select()
        .from(sqlPerformanceHistory)
        .where(and(...conditions))
        .orderBy(desc(sqlPerformanceHistory.elapsedTimeMs))
        .limit(500);

      if (dbData && dbData.length > 0) {
        historyData = dbData.map((row) => ({
          sql_id: row.sqlId,
          sql_text: row.sqlText || '',
          executions: Number(row.executions) || 0,
          avg_elapsed_time: Number(row.elapsedTimeMs) || 0,
          avg_cpu_time: Number(row.cpuTimeMs) || 0,
          avg_buffer_gets: Number(row.bufferGets) || 0,
          avg_disk_reads: Number(row.diskReads) || 0,
          rows_processed: Number(row.rowsProcessed) || 0,
          performance_grade: row.performanceGrade,
          parsing_schema_name: row.parsingSchemaName,
          first_seen: row.collectedAt,
          last_seen: row.collectedAt,
          source: 'database'
        }));

        console.log(`[Performance History] Found ${historyData.length} records from PostgreSQL`);
      }
    } catch (dbError) {
      console.log('[Performance History] PostgreSQL query failed:', dbError);
    }

    // Oracle 설정을 한 번만 조회 (AWR, V$SQL 모두 사용)
    let oracleConfig: any = null;

    // 2. PostgreSQL에 데이터가 없으면 DBA_HIST_SQLSTAT에서 조회 시도 (AWR - Enterprise Edition)
    if (historyData.length === 0) {
      // 시간 필터가 있는 경우와 없는 경우 분리
      // 최적화: CLOB (sql_text)를 GROUP BY에서 제거하고 서브쿼리로 분리
      const awrQuery = hasTimeFilter ? `
      SELECT
        agg.sql_id,
        SUBSTR(st.sql_text, 1, 1000) as sql_text,
        agg.executions,
        agg.avg_elapsed_time,
        agg.avg_cpu_time,
        agg.avg_buffer_gets,
        agg.avg_disk_reads,
        agg.rows_processed,
        agg.first_seen,
        agg.last_seen
      FROM (
        SELECT * FROM (
          SELECT
            ss.sql_id,
            ss.dbid,
            SUM(ss.executions_delta) as executions,
            ROUND(AVG(ss.elapsed_time_delta / DECODE(ss.executions_delta, 0, 1, ss.executions_delta)) / 1000, 2) as avg_elapsed_time,
            ROUND(AVG(ss.cpu_time_delta / DECODE(ss.executions_delta, 0, 1, ss.executions_delta)) / 1000, 2) as avg_cpu_time,
            ROUND(AVG(ss.buffer_gets_delta / DECODE(ss.executions_delta, 0, 1, ss.executions_delta)), 0) as avg_buffer_gets,
            ROUND(AVG(ss.disk_reads_delta / DECODE(ss.executions_delta, 0, 1, ss.executions_delta)), 0) as avg_disk_reads,
            SUM(ss.rows_processed_delta) as rows_processed,
            MIN(snap.begin_interval_time) as first_seen,
            MAX(snap.end_interval_time) as last_seen
          FROM dba_hist_sqlstat ss
          JOIN dba_hist_snapshot snap ON ss.snap_id = snap.snap_id AND ss.dbid = snap.dbid AND ss.instance_number = snap.instance_number
          WHERE snap.begin_interval_time >= TO_DATE(:start_dt, 'YYYY-MM-DD HH24:MI:SS')
            AND snap.end_interval_time <= TO_DATE(:end_dt, 'YYYY-MM-DD HH24:MI:SS')
            AND ss.executions_delta > 0
            AND ss.parsing_schema_name NOT IN ('SYS', 'SYSTEM', 'DBSNMP', 'SYSMAN', 'OUTLN', 'MDSYS', 'ORDSYS', 'EXFSYS', 'WMSYS', 'CTXSYS', 'XDB')
          GROUP BY ss.sql_id, ss.dbid
          ORDER BY SUM(ss.elapsed_time_delta) DESC
        ) WHERE ROWNUM <= 100
      ) agg
      LEFT JOIN dba_hist_sqltext st ON agg.sql_id = st.sql_id AND agg.dbid = st.dbid
    ` : `
      SELECT
        agg.sql_id,
        SUBSTR(st.sql_text, 1, 1000) as sql_text,
        agg.executions,
        agg.avg_elapsed_time,
        agg.avg_cpu_time,
        agg.avg_buffer_gets,
        agg.avg_disk_reads,
        agg.rows_processed,
        agg.first_seen,
        agg.last_seen
      FROM (
        SELECT * FROM (
          SELECT
            ss.sql_id,
            ss.dbid,
            SUM(ss.executions_delta) as executions,
            ROUND(AVG(ss.elapsed_time_delta / DECODE(ss.executions_delta, 0, 1, ss.executions_delta)) / 1000, 2) as avg_elapsed_time,
            ROUND(AVG(ss.cpu_time_delta / DECODE(ss.executions_delta, 0, 1, ss.executions_delta)) / 1000, 2) as avg_cpu_time,
            ROUND(AVG(ss.buffer_gets_delta / DECODE(ss.executions_delta, 0, 1, ss.executions_delta)), 0) as avg_buffer_gets,
            ROUND(AVG(ss.disk_reads_delta / DECODE(ss.executions_delta, 0, 1, ss.executions_delta)), 0) as avg_disk_reads,
            SUM(ss.rows_processed_delta) as rows_processed,
            MIN(snap.begin_interval_time) as first_seen,
            MAX(snap.end_interval_time) as last_seen
          FROM dba_hist_sqlstat ss
          JOIN dba_hist_snapshot snap ON ss.snap_id = snap.snap_id AND ss.dbid = snap.dbid AND ss.instance_number = snap.instance_number
          WHERE snap.begin_interval_time >= TO_DATE(:date_str, 'YYYY-MM-DD')
            AND snap.begin_interval_time < TO_DATE(:date_str, 'YYYY-MM-DD') + 1
            AND ss.executions_delta > 0
            AND ss.parsing_schema_name NOT IN ('SYS', 'SYSTEM', 'DBSNMP', 'SYSMAN', 'OUTLN', 'MDSYS', 'ORDSYS', 'EXFSYS', 'WMSYS', 'CTXSYS', 'XDB')
          GROUP BY ss.sql_id, ss.dbid
          ORDER BY SUM(ss.elapsed_time_delta) DESC
        ) WHERE ROWNUM <= 100
      ) agg
      LEFT JOIN dba_hist_sqltext st ON agg.sql_id = st.sql_id AND agg.dbid = st.dbid
    `;

      const awrBindParams = hasTimeFilter ? [startDateTime, endDateTime] : [dateStr];

      try {
        oracleConfig = await getOracleConfig(connectionId);
        const queryOpts = { timeout: 10000 }; // 30초 → 10초로 단축
        const awrResult = await executeQuery(oracleConfig, awrQuery, awrBindParams, queryOpts);

        if (awrResult.rows && awrResult.rows.length > 0) {
          historyData = awrResult.rows.map((row: any) => {
            let sqlText = row.SQL_TEXT;
            if (sqlText && typeof sqlText !== 'string') {
              sqlText = Buffer.isBuffer(sqlText) ? sqlText.toString('utf-8') : String(sqlText);
            }
            return {
              sql_id: row.SQL_ID,
              sql_text: sqlText || '',
              executions: Number(row.EXECUTIONS) || 0,
              avg_elapsed_time: Number(row.AVG_ELAPSED_TIME) || 0,
              avg_cpu_time: Number(row.AVG_CPU_TIME) || 0,
              avg_buffer_gets: Number(row.AVG_BUFFER_GETS) || 0,
              avg_disk_reads: Number(row.AVG_DISK_READS) || 0,
              rows_processed: Number(row.ROWS_PROCESSED) || 0,
              first_seen: row.FIRST_SEEN,
              last_seen: row.LAST_SEEN,
              source: 'awr'
            };
          });
        }
      } catch (awrError) {
        console.log('[Performance History] AWR query failed, trying V$SQL fallback:', awrError);
      }
    }

    // 3. AWR 데이터가 없으면 V$SQL에서 현재 캐시된 데이터 조회
    // V$SQL은 현재 캐시된 데이터만 있으므로, 최근 데이터 조회에 적합
    if (historyData.length === 0) {
      const today = new Date();
      const targetDate = new Date(dateStr);
      const daysDiff = Math.floor((today.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));

      // V$SQL에서 현재 캐시된 SQL 조회 (날짜 필터 최적화)
      // 오늘/어제: last_active_time 기준, 그 이전: 전체 캐시에서 조회
      try {
        // Oracle 설정이 없으면 새로 조회
        if (!oracleConfig) {
          oracleConfig = await getOracleConfig(connectionId);
        }

        let vsqlQuery: string;
        let vsqlBindParams: any[];

        if (daysDiff <= 1) {
          // 오늘 또는 어제: last_active_time 기준으로 필터링
          if (hasTimeFilter) {
            vsqlQuery = `
              SELECT * FROM (
                SELECT
                  sql_id,
                  SUBSTR(sql_text, 1, 1000) as sql_text,
                  executions,
                  ROUND(elapsed_time / DECODE(executions, 0, 1, executions) / 1000, 2) as avg_elapsed_time,
                  ROUND(cpu_time / DECODE(executions, 0, 1, executions) / 1000, 2) as avg_cpu_time,
                  ROUND(buffer_gets / DECODE(executions, 0, 1, executions), 0) as avg_buffer_gets,
                  ROUND(disk_reads / DECODE(executions, 0, 1, executions), 0) as avg_disk_reads,
                  rows_processed,
                  first_load_time,
                  last_active_time,
                  parsing_schema_name
                FROM v$sql
                WHERE executions > 0
                  AND parsing_schema_name NOT IN ('SYS', 'SYSTEM', 'DBSNMP', 'SYSMAN', 'OUTLN', 'MDSYS', 'ORDSYS', 'EXFSYS', 'WMSYS', 'CTXSYS', 'XDB')
                  AND last_active_time >= TO_DATE(:start_dt, 'YYYY-MM-DD HH24:MI:SS')
                  AND last_active_time <= TO_DATE(:end_dt, 'YYYY-MM-DD HH24:MI:SS')
                ORDER BY elapsed_time DESC
              ) WHERE ROWNUM <= 100
            `;
            vsqlBindParams = [startDateTime, endDateTime];
          } else {
            vsqlQuery = `
              SELECT * FROM (
                SELECT
                  sql_id,
                  SUBSTR(sql_text, 1, 1000) as sql_text,
                  executions,
                  ROUND(elapsed_time / DECODE(executions, 0, 1, executions) / 1000, 2) as avg_elapsed_time,
                  ROUND(cpu_time / DECODE(executions, 0, 1, executions) / 1000, 2) as avg_cpu_time,
                  ROUND(buffer_gets / DECODE(executions, 0, 1, executions), 0) as avg_buffer_gets,
                  ROUND(disk_reads / DECODE(executions, 0, 1, executions), 0) as avg_disk_reads,
                  rows_processed,
                  first_load_time,
                  last_active_time,
                  parsing_schema_name
                FROM v$sql
                WHERE executions > 0
                  AND parsing_schema_name NOT IN ('SYS', 'SYSTEM', 'DBSNMP', 'SYSMAN', 'OUTLN', 'MDSYS', 'ORDSYS', 'EXFSYS', 'WMSYS', 'CTXSYS', 'XDB')
                  AND last_active_time >= TO_DATE(:date_str, 'YYYY-MM-DD')
                  AND last_active_time < TO_DATE(:date_str, 'YYYY-MM-DD') + 1
                ORDER BY elapsed_time DESC
              ) WHERE ROWNUM <= 100
            `;
            vsqlBindParams = [dateStr];
          }
        } else {
          // 과거 날짜: V$SQL 캐시에 있는 모든 데이터 조회 (날짜 필터 없이)
          // V$SQL은 현재 캐시만 있으므로, 과거 날짜 요청시에도 현재 캐시 데이터를 보여줌
          console.log(`[Performance History] Date ${dateStr} is ${daysDiff} days ago, showing current V$SQL cache`);
          vsqlQuery = `
            SELECT * FROM (
              SELECT
                sql_id,
                SUBSTR(sql_text, 1, 1000) as sql_text,
                executions,
                ROUND(elapsed_time / DECODE(executions, 0, 1, executions) / 1000, 2) as avg_elapsed_time,
                ROUND(cpu_time / DECODE(executions, 0, 1, executions) / 1000, 2) as avg_cpu_time,
                ROUND(buffer_gets / DECODE(executions, 0, 1, executions), 0) as avg_buffer_gets,
                ROUND(disk_reads / DECODE(executions, 0, 1, executions), 0) as avg_disk_reads,
                rows_processed,
                first_load_time,
                last_active_time,
                parsing_schema_name
              FROM v$sql
              WHERE executions > 0
                AND parsing_schema_name NOT IN ('SYS', 'SYSTEM', 'DBSNMP', 'SYSMAN', 'OUTLN', 'MDSYS', 'ORDSYS', 'EXFSYS', 'WMSYS', 'CTXSYS', 'XDB')
              ORDER BY elapsed_time DESC
            ) WHERE ROWNUM <= 100
          `;
          vsqlBindParams = [];
        }

        const queryOpts = { timeout: 8000 };
        const vsqlResult = await executeQuery(oracleConfig, vsqlQuery, vsqlBindParams, queryOpts);

        if (vsqlResult.rows && vsqlResult.rows.length > 0) {
          historyData = vsqlResult.rows.map((row: any) => {
            let sqlText = row.SQL_TEXT;
            if (sqlText && typeof sqlText !== 'string') {
              sqlText = Buffer.isBuffer(sqlText) ? sqlText.toString('utf-8') : String(sqlText);
            }
            return {
              sql_id: row.SQL_ID,
              sql_text: sqlText || '',
              executions: Number(row.EXECUTIONS) || 0,
              avg_elapsed_time: Number(row.AVG_ELAPSED_TIME) || 0,
              avg_cpu_time: Number(row.AVG_CPU_TIME) || 0,
              avg_buffer_gets: Number(row.AVG_BUFFER_GETS) || 0,
              avg_disk_reads: Number(row.AVG_DISK_READS) || 0,
              rows_processed: Number(row.ROWS_PROCESSED) || 0,
              first_seen: row.FIRST_LOAD_TIME,
              last_seen: row.LAST_ACTIVE_TIME,
              parsing_schema_name: row.PARSING_SCHEMA_NAME,
              source: daysDiff <= 1 ? 'v$sql' : 'v$sql_cache'
            };
          });
          console.log(`[Performance History] Found ${historyData.length} records from V$SQL`);
        }
      } catch (vsqlError) {
        console.log('[Performance History] V$SQL query failed:', vsqlError);
      }
    }

    return NextResponse.json({
      success: true,
      data: historyData,
      date: dateStr,
      count: historyData.length,
      source: historyData.length > 0 ? historyData[0].source : 'none',
      time_filter: hasTimeFilter ? {
        start_time: startTime,
        end_time: endTime,
        start_datetime: startDateTime,
        end_datetime: endDateTime
      } : null
    });

  } catch (error) {
    console.error('[Performance History API] Error:', error);
    return NextResponse.json({
      success: true,
      data: [],
      date: request.nextUrl.searchParams.get('date'),
      count: 0,
      source: 'error',
      warning: error instanceof Error ? error.message : 'Unknown error',
      time_filter: null
    });
  }
}
