import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';
import { db } from '@/db';
import { sqlPerformanceDailySummary } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * GET /api/monitoring/performance-summary
 * 특정 날짜의 성능 요약 통계 조회
 * 1순위: PostgreSQL sql_performance_daily_summary 테이블
 * 2순위: DBA_HIST_SQLSTAT (AWR)
 * 3순위: V$SQL (당일/전일)
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

    let summaryData: any = null;

    // 1. PostgreSQL sql_performance_daily_summary 테이블에서 우선 조회
    try {
      const [dailySummary] = await db
        .select()
        .from(sqlPerformanceDailySummary)
        .where(
          and(
            eq(sqlPerformanceDailySummary.oracleConnectionId, connectionId),
            eq(sqlPerformanceDailySummary.summaryDate, dateStr)
          )
        )
        .limit(1);

      if (dailySummary) {
        summaryData = {
          total_sqls: Number(dailySummary.totalSqls) || 0,
          total_executions: Number(dailySummary.totalExecutions) || 0,
          avg_elapsed_time: Number(dailySummary.avgElapsedTimeMs) || 0,
          avg_cpu_time: Number(dailySummary.avgCpuTimeMs) || 0,
          avg_buffer_gets: Number(dailySummary.avgBufferGets) || 0,
          avg_disk_reads: Number(dailySummary.avgDiskReads) || 0,
          total_rows_processed: 0,
          max_elapsed_time: Number(dailySummary.maxElapsedTimeMs) || 0,
          grade_distribution: {
            a: dailySummary.gradeACount || 0,
            b: dailySummary.gradeBCount || 0,
            c: dailySummary.gradeCCount || 0,
            d: dailySummary.gradeDCount || 0,
            f: dailySummary.gradeFCount || 0,
          },
          collection_count: dailySummary.collectionCount || 0,
          source: 'database'
        };
        console.log(`[Performance Summary] Found summary from PostgreSQL for ${dateStr}`);
      }
    } catch (dbError) {
      console.log('[Performance Summary] PostgreSQL query failed:', dbError);
    }

    // 2. PostgreSQL에 데이터가 없으면 AWR에서 요약 통계 조회 시도
    if (!summaryData) {
    // 시간 필터가 있는 경우와 없는 경우 분리
    const awrSummaryQuery = hasTimeFilter ? `
      SELECT
        COUNT(DISTINCT ss.sql_id) as total_sqls,
        SUM(ss.executions_delta) as total_executions,
        ROUND(AVG(ss.elapsed_time_delta / DECODE(ss.executions_delta, 0, 1, ss.executions_delta)) / 1000, 2) as avg_elapsed_time,
        ROUND(AVG(ss.cpu_time_delta / DECODE(ss.executions_delta, 0, 1, ss.executions_delta)) / 1000, 2) as avg_cpu_time,
        ROUND(AVG(ss.buffer_gets_delta / DECODE(ss.executions_delta, 0, 1, ss.executions_delta)), 0) as avg_buffer_gets,
        ROUND(AVG(ss.disk_reads_delta / DECODE(ss.executions_delta, 0, 1, ss.executions_delta)), 0) as avg_disk_reads,
        SUM(ss.rows_processed_delta) as total_rows_processed,
        MAX(ss.elapsed_time_delta / DECODE(ss.executions_delta, 0, 1, ss.executions_delta) / 1000) as max_elapsed_time,
        MIN(snap.begin_interval_time) as period_start,
        MAX(snap.end_interval_time) as period_end
      FROM dba_hist_sqlstat ss
      JOIN dba_hist_snapshot snap ON ss.snap_id = snap.snap_id AND ss.dbid = snap.dbid AND ss.instance_number = snap.instance_number
      WHERE snap.begin_interval_time >= TO_DATE(:start_dt, 'YYYY-MM-DD HH24:MI:SS')
        AND snap.end_interval_time <= TO_DATE(:end_dt, 'YYYY-MM-DD HH24:MI:SS')
        AND ss.executions_delta > 0
        AND ss.parsing_schema_name NOT IN ('SYS', 'SYSTEM', 'DBSNMP', 'SYSMAN', 'OUTLN', 'MDSYS', 'ORDSYS', 'EXFSYS', 'WMSYS', 'CTXSYS', 'XDB')
    ` : `
      SELECT
        COUNT(DISTINCT ss.sql_id) as total_sqls,
        SUM(ss.executions_delta) as total_executions,
        ROUND(AVG(ss.elapsed_time_delta / DECODE(ss.executions_delta, 0, 1, ss.executions_delta)) / 1000, 2) as avg_elapsed_time,
        ROUND(AVG(ss.cpu_time_delta / DECODE(ss.executions_delta, 0, 1, ss.executions_delta)) / 1000, 2) as avg_cpu_time,
        ROUND(AVG(ss.buffer_gets_delta / DECODE(ss.executions_delta, 0, 1, ss.executions_delta)), 0) as avg_buffer_gets,
        ROUND(AVG(ss.disk_reads_delta / DECODE(ss.executions_delta, 0, 1, ss.executions_delta)), 0) as avg_disk_reads,
        SUM(ss.rows_processed_delta) as total_rows_processed,
        MAX(ss.elapsed_time_delta / DECODE(ss.executions_delta, 0, 1, ss.executions_delta) / 1000) as max_elapsed_time,
        MIN(snap.begin_interval_time) as period_start,
        MAX(snap.end_interval_time) as period_end
      FROM dba_hist_sqlstat ss
      JOIN dba_hist_snapshot snap ON ss.snap_id = snap.snap_id AND ss.dbid = snap.dbid AND ss.instance_number = snap.instance_number
      WHERE snap.begin_interval_time >= TO_DATE(:date_str, 'YYYY-MM-DD')
        AND snap.begin_interval_time < TO_DATE(:date_str, 'YYYY-MM-DD') + 1
        AND ss.executions_delta > 0
        AND ss.parsing_schema_name NOT IN ('SYS', 'SYSTEM', 'DBSNMP', 'SYSMAN', 'OUTLN', 'MDSYS', 'ORDSYS', 'EXFSYS', 'WMSYS', 'CTXSYS', 'XDB')
    `;

      const awrBindParams = hasTimeFilter ? [startDateTime, endDateTime] : [dateStr];

      try {
        const config = await getOracleConfig(connectionId);
        const queryOpts = { timeout: 20000 };
        const awrResult = await executeQuery(config, awrSummaryQuery, awrBindParams, queryOpts);

        if (awrResult.rows && awrResult.rows.length > 0 && awrResult.rows[0].TOTAL_SQLS > 0) {
          const row = awrResult.rows[0];
          summaryData = {
            total_sqls: Number(row.TOTAL_SQLS) || 0,
            total_executions: Number(row.TOTAL_EXECUTIONS) || 0,
            avg_elapsed_time: Number(row.AVG_ELAPSED_TIME) || 0,
            avg_cpu_time: Number(row.AVG_CPU_TIME) || 0,
            avg_buffer_gets: Number(row.AVG_BUFFER_GETS) || 0,
            avg_disk_reads: Number(row.AVG_DISK_READS) || 0,
            total_rows_processed: Number(row.TOTAL_ROWS_PROCESSED) || 0,
            max_elapsed_time: Number(row.MAX_ELAPSED_TIME) || 0,
            period_start: row.PERIOD_START,
            period_end: row.PERIOD_END,
            source: 'awr'
          };
        }
      } catch (awrError) {
        console.log('[Performance Summary] AWR query failed:', awrError);
      }
    }

    // 3. AWR 데이터가 없으면 V$SQL에서 현재 데이터 조회
    if (!summaryData) {
      const today = new Date();
      const targetDate = new Date(dateStr);
      const daysDiff = Math.floor((today.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysDiff <= 1) {
        // 시간 필터가 있는 경우와 없는 경우 분리
        const vsqlSummaryQuery = hasTimeFilter ? `
          SELECT
            COUNT(DISTINCT sql_id) as total_sqls,
            SUM(executions) as total_executions,
            ROUND(AVG(elapsed_time / DECODE(executions, 0, 1, executions)) / 1000, 2) as avg_elapsed_time,
            ROUND(AVG(cpu_time / DECODE(executions, 0, 1, executions)) / 1000, 2) as avg_cpu_time,
            ROUND(AVG(buffer_gets / DECODE(executions, 0, 1, executions)), 0) as avg_buffer_gets,
            ROUND(AVG(disk_reads / DECODE(executions, 0, 1, executions)), 0) as avg_disk_reads,
            SUM(rows_processed) as total_rows_processed,
            MAX(elapsed_time / DECODE(executions, 0, 1, executions) / 1000) as max_elapsed_time
          FROM v$sql
          WHERE executions > 0
            AND parsing_schema_name NOT IN ('SYS', 'SYSTEM', 'DBSNMP', 'SYSMAN', 'OUTLN', 'MDSYS', 'ORDSYS', 'EXFSYS', 'WMSYS', 'CTXSYS', 'XDB')
            AND last_active_time >= TO_DATE(:start_dt, 'YYYY-MM-DD HH24:MI:SS')
            AND last_active_time <= TO_DATE(:end_dt, 'YYYY-MM-DD HH24:MI:SS')
        ` : `
          SELECT
            COUNT(DISTINCT sql_id) as total_sqls,
            SUM(executions) as total_executions,
            ROUND(AVG(elapsed_time / DECODE(executions, 0, 1, executions)) / 1000, 2) as avg_elapsed_time,
            ROUND(AVG(cpu_time / DECODE(executions, 0, 1, executions)) / 1000, 2) as avg_cpu_time,
            ROUND(AVG(buffer_gets / DECODE(executions, 0, 1, executions)), 0) as avg_buffer_gets,
            ROUND(AVG(disk_reads / DECODE(executions, 0, 1, executions)), 0) as avg_disk_reads,
            SUM(rows_processed) as total_rows_processed,
            MAX(elapsed_time / DECODE(executions, 0, 1, executions) / 1000) as max_elapsed_time
          FROM v$sql
          WHERE executions > 0
            AND parsing_schema_name NOT IN ('SYS', 'SYSTEM', 'DBSNMP', 'SYSMAN', 'OUTLN', 'MDSYS', 'ORDSYS', 'EXFSYS', 'WMSYS', 'CTXSYS', 'XDB')
            AND last_active_time >= TO_DATE(:date_str, 'YYYY-MM-DD')
            AND last_active_time < TO_DATE(:date_str, 'YYYY-MM-DD') + 1
        `;

        const vsqlBindParams = hasTimeFilter ? [startDateTime, endDateTime] : [dateStr];

        try {
          const config = await getOracleConfig(connectionId);
          const queryOpts = { timeout: 20000 };
          const vsqlResult = await executeQuery(config, vsqlSummaryQuery, vsqlBindParams, queryOpts);

          if (vsqlResult.rows && vsqlResult.rows.length > 0) {
            const row = vsqlResult.rows[0];
            summaryData = {
              total_sqls: Number(row.TOTAL_SQLS) || 0,
              total_executions: Number(row.TOTAL_EXECUTIONS) || 0,
              avg_elapsed_time: Number(row.AVG_ELAPSED_TIME) || 0,
              avg_cpu_time: Number(row.AVG_CPU_TIME) || 0,
              avg_buffer_gets: Number(row.AVG_BUFFER_GETS) || 0,
              avg_disk_reads: Number(row.AVG_DISK_READS) || 0,
              total_rows_processed: Number(row.TOTAL_ROWS_PROCESSED) || 0,
              max_elapsed_time: Number(row.MAX_ELAPSED_TIME) || 0,
              source: 'v$sql'
            };
          }
        } catch (vsqlError) {
          console.log('[Performance Summary] V$SQL query failed:', vsqlError);
        }
      }
    }

    // 기본값 설정
    if (!summaryData) {
      summaryData = {
        total_sqls: 0,
        total_executions: 0,
        avg_elapsed_time: 0,
        avg_cpu_time: 0,
        avg_buffer_gets: 0,
        avg_disk_reads: 0,
        total_rows_processed: 0,
        max_elapsed_time: 0,
        source: 'none'
      };
    }

    return NextResponse.json({
      success: true,
      data: summaryData,
      date: dateStr,
      time_filter: hasTimeFilter ? {
        start_time: startTime,
        end_time: endTime,
        start_datetime: startDateTime,
        end_datetime: endDateTime
      } : null
    });

  } catch (error) {
    console.error('[Performance Summary API] Error:', error);
    return NextResponse.json({
      success: true,
      data: {
        total_sqls: 0,
        total_executions: 0,
        avg_elapsed_time: 0,
        avg_cpu_time: 0,
        avg_buffer_gets: 0,
        avg_disk_reads: 0,
        total_rows_processed: 0,
        max_elapsed_time: 0,
        source: 'error'
      },
      date: request.nextUrl.searchParams.get('date'),
      warning: error instanceof Error ? error.message : 'Unknown error',
      time_filter: null
    });
  }
}
