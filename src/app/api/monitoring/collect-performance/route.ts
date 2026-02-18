'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';
import { db } from '@/db';
import {
  performanceCollectionSettings,
  performanceCollectionLogs,
  sqlPerformanceHistory,
  sqlPerformanceDailySummary,
} from '@/db/schema';
import { eq, and, desc, count, sql } from 'drizzle-orm';

/**
 * 성능 등급 계산
 * A: 우수 (elapsed < 100ms, buffer_gets < 1000)
 * B: 양호 (elapsed < 500ms, buffer_gets < 5000)
 * C: 보통 (elapsed < 1000ms, buffer_gets < 10000)
 * D: 주의 (elapsed < 5000ms, buffer_gets < 50000)
 * F: 심각 (그 외)
 */
function calculatePerformanceGrade(elapsedTimeMs: number, bufferGets: number): string {
  if (elapsedTimeMs < 100 && bufferGets < 1000) return 'A';
  if (elapsedTimeMs < 500 && bufferGets < 5000) return 'B';
  if (elapsedTimeMs < 1000 && bufferGets < 10000) return 'C';
  if (elapsedTimeMs < 5000 && bufferGets < 50000) return 'D';
  return 'F';
}

/**
 * POST /api/monitoring/collect-performance
 * Oracle에서 성능 데이터를 수집하여 PostgreSQL에 저장
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let logId: string | null = null;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { connection_id } = body;

    if (!connection_id) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    // 수집 설정 확인
    const [settings] = await db
      .select()
      .from(performanceCollectionSettings)
      .where(eq(performanceCollectionSettings.oracleConnectionId, connection_id))
      .limit(1);

    // 기본 설정 사용 (설정이 없는 경우)
    const collectionSettings = settings ? {
      is_enabled: settings.isEnabled,
      min_executions: settings.minExecutions,
      min_elapsed_time_ms: settings.minElapsedTimeMs,
      excluded_schemas: settings.excludedSchemas,
      top_sql_limit: settings.topSqlLimit,
      collect_all_hours: settings.collectAllHours,
      collect_start_hour: settings.collectStartHour,
      collect_end_hour: settings.collectEndHour,
      total_collections: settings.totalCollections,
      successful_collections: settings.successfulCollections,
    } : {
      is_enabled: true,
      min_executions: 1,
      min_elapsed_time_ms: '0',
      excluded_schemas: ['SYS', 'SYSTEM', 'DBSNMP', 'SYSMAN', 'OUTLN', 'MDSYS', 'ORDSYS', 'EXFSYS', 'WMSYS', 'CTXSYS', 'XDB'],
      top_sql_limit: 500,
      collect_all_hours: true,
      collect_start_hour: 0,
      collect_end_hour: 23,
      total_collections: 0,
      successful_collections: 0,
    };

    // 수집 비활성화 확인
    if (!collectionSettings.is_enabled) {
      return NextResponse.json({
        success: false,
        message: 'Collection is disabled for this connection'
      });
    }

    // 시간대 확인
    const currentHour = new Date().getHours();
    if (!collectionSettings.collect_all_hours) {
      if (currentHour < (collectionSettings.collect_start_hour ?? 0) ||
          currentHour > (collectionSettings.collect_end_hour ?? 23)) {
        return NextResponse.json({
          success: false,
          message: `Collection not allowed at hour ${currentHour}. Allowed: ${collectionSettings.collect_start_hour}-${collectionSettings.collect_end_hour}`
        });
      }
    }

    // 수집 로그 생성
    try {
      const [logData] = await db
        .insert(performanceCollectionLogs)
        .values({
          oracleConnectionId: connection_id,
          status: 'RUNNING',
          source: 'v$sql',
        })
        .returning({ id: performanceCollectionLogs.id });

      if (logData) {
        logId = logData.id;
      }
    } catch (logError) {
      console.error('[Collect Performance] Failed to create log:', logError);
    }

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connection_id);
    const queryOpts = { timeout: 60000 }; // 60초 타임아웃

    // 제외 스키마 목록
    const excludedSchemas = collectionSettings.excluded_schemas || [];
    const excludedSchemasStr = excludedSchemas.map((s: string) => `'${s}'`).join(', ');

    // V$SQL에서 Top SQL 수집 쿼리 (Oracle 12c+ 호환)
    let result: { rows: any[] } = { rows: [] };

    // Oracle 11g 호환: FETCH FIRST 대신 서브쿼리 + ROWNUM 사용
    try {
      const collectQuery12c = `
        SELECT * FROM (
          SELECT
            sql_id,
            plan_hash_value,
            parsing_schema_name,
            module,
            action,
            SUBSTR(sql_text, 1, 4000) as sql_text,
            executions,
            ROUND(elapsed_time / DECODE(executions, 0, 1, executions) / 1000, 2) as avg_elapsed_time_ms,
            ROUND(cpu_time / DECODE(executions, 0, 1, executions) / 1000, 2) as avg_cpu_time_ms,
            ROUND(buffer_gets / DECODE(executions, 0, 1, executions)) as avg_buffer_gets,
            ROUND(disk_reads / DECODE(executions, 0, 1, executions)) as avg_disk_reads,
            rows_processed,
            physical_read_requests,
            physical_write_requests,
            direct_reads,
            direct_writes,
            ROUND(application_wait_time / 1000, 2) as application_wait_time_ms,
            ROUND(concurrency_wait_time / 1000, 2) as concurrency_wait_time_ms,
            ROUND(cluster_wait_time / 1000, 2) as cluster_wait_time_ms,
            ROUND(user_io_wait_time / 1000, 2) as user_io_wait_time_ms
          FROM v$sql
          WHERE executions >= :min_execs
            AND parsing_schema_name NOT IN (${excludedSchemasStr})
            AND sql_text NOT LIKE '%v$sql%'
            AND sql_text NOT LIKE '%dba_hist%'
          ORDER BY elapsed_time DESC
      )
      WHERE ROWNUM <= :top_limit
      `;

      result = await executeQuery(
        config,
        collectQuery12c,
        [collectionSettings.min_executions, collectionSettings.top_sql_limit],
        queryOpts
      );
    } catch (err: any) {
      // Oracle 11g 폴백: direct_reads/direct_writes 컬럼 없는 쿼리
      if (err.message?.includes('ORA-00904')) {
        console.log('[Collect Performance] Using Oracle 11g compatible query (without direct_reads/writes)');
        const collectQuery11g = `
          SELECT
            sql_id,
            plan_hash_value,
            parsing_schema_name,
            module,
            action,
            SUBSTR(sql_text, 1, 4000) as sql_text,
            executions,
            ROUND(elapsed_time / DECODE(executions, 0, 1, executions) / 1000, 2) as avg_elapsed_time_ms,
            ROUND(cpu_time / DECODE(executions, 0, 1, executions) / 1000, 2) as avg_cpu_time_ms,
            ROUND(buffer_gets / DECODE(executions, 0, 1, executions)) as avg_buffer_gets,
            ROUND(disk_reads / DECODE(executions, 0, 1, executions)) as avg_disk_reads,
            rows_processed,
            0 as physical_read_requests,
            0 as physical_write_requests,
            0 as direct_reads,
            0 as direct_writes,
            ROUND(application_wait_time / 1000, 2) as application_wait_time_ms,
            ROUND(concurrency_wait_time / 1000, 2) as concurrency_wait_time_ms,
            ROUND(cluster_wait_time / 1000, 2) as cluster_wait_time_ms,
            ROUND(user_io_wait_time / 1000, 2) as user_io_wait_time_ms
          FROM (
            SELECT * FROM v$sql
            WHERE executions >= :min_execs
              AND parsing_schema_name NOT IN (${excludedSchemasStr})
              AND sql_text NOT LIKE '%v$sql%'
              AND sql_text NOT LIKE '%dba_hist%'
            ORDER BY elapsed_time DESC
          )
          WHERE ROWNUM <= :top_limit
        `;

        result = await executeQuery(
          config,
          collectQuery11g,
          [collectionSettings.min_executions, collectionSettings.top_sql_limit],
          queryOpts
        );
      } else {
        throw err;
      }
    }

    if (!result.rows || result.rows.length === 0) {
      // 데이터 없음 - 성공으로 처리
      if (logId) {
        await db
          .update(performanceCollectionLogs)
          .set({
            status: 'SUCCESS',
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
            recordsCollected: 0,
            recordsInserted: 0,
          })
          .where(eq(performanceCollectionLogs.id, logId));
      }

      return NextResponse.json({
        success: true,
        message: 'No data to collect',
        records_collected: 0,
        records_inserted: 0,
        duration_ms: Date.now() - startTime,
      });
    }

    const now = new Date();
    const collectedAt = now;
    const collectionHour = now.getHours();
    const collectionDate = now.toISOString().split('T')[0];

    // 성능 데이터 변환 및 저장
    const performanceRecords = result.rows.map((row: any) => {
      let sqlText = row.SQL_TEXT;
      if (sqlText && typeof sqlText !== 'string') {
        sqlText = Buffer.isBuffer(sqlText) ? sqlText.toString('utf-8') : String(sqlText);
      }

      const elapsedTimeMs = Number(row.AVG_ELAPSED_TIME_MS) || 0;
      const bufferGets = Number(row.AVG_BUFFER_GETS) || 0;

      return {
        oracleConnectionId: connection_id,
        sqlId: row.SQL_ID,
        planHashValue: row.PLAN_HASH_VALUE ? Number(row.PLAN_HASH_VALUE) : null,
        parsingSchemaName: row.PARSING_SCHEMA_NAME,
        module: row.MODULE ? String(row.MODULE).substring(0, 64) : null,
        action: row.ACTION ? String(row.ACTION).substring(0, 64) : null,
        sqlText: sqlText ? sqlText.substring(0, 4000) : null,
        executions: Number(row.EXECUTIONS) || 0,
        elapsedTimeMs: String(elapsedTimeMs),
        cpuTimeMs: String(Number(row.AVG_CPU_TIME_MS) || 0),
        bufferGets: bufferGets,
        diskReads: Number(row.AVG_DISK_READS) || 0,
        rowsProcessed: Number(row.ROWS_PROCESSED) || 0,
        physicalReadRequests: Number(row.PHYSICAL_READ_REQUESTS) || 0,
        physicalWriteRequests: Number(row.PHYSICAL_WRITE_REQUESTS) || 0,
        directReads: Number(row.DIRECT_READS) || 0,
        directWrites: Number(row.DIRECT_WRITES) || 0,
        applicationWaitTimeMs: String(Number(row.APPLICATION_WAIT_TIME_MS) || 0),
        concurrencyWaitTimeMs: String(Number(row.CONCURRENCY_WAIT_TIME_MS) || 0),
        clusterWaitTimeMs: String(Number(row.CLUSTER_WAIT_TIME_MS) || 0),
        userIoWaitTimeMs: String(Number(row.USER_IO_WAIT_TIME_MS) || 0),
        performanceGrade: calculatePerformanceGrade(elapsedTimeMs, bufferGets),
        source: 'v$sql',
        collectedAt: collectedAt,
        collectionHour: collectionHour,
        collectionDate: collectionDate,
      };
    });

    // 배치 삽입 (500개씩)
    const batchSize = 500;
    let insertedCount = 0;
    let insertErrors: string[] = [];

    for (let i = 0; i < performanceRecords.length; i += batchSize) {
      const batch = performanceRecords.slice(i, i + batchSize);
      try {
        const insertData = await db
          .insert(sqlPerformanceHistory)
          .values(batch)
          .returning({ id: sqlPerformanceHistory.id });

        insertedCount += insertData.length;
      } catch (insertError: any) {
        console.error(`[Collect Performance] Batch insert error (${i}-${i + batch.length}):`, {
          error: insertError,
          message: insertError.message,
          firstRecord: batch[0] ? {
            sqlId: batch[0].sqlId,
            parsingSchemaName: batch[0].parsingSchemaName,
            source: batch[0].source,
          } : null,
        });
        insertErrors.push(`Batch ${i}: ${insertError.message}`);

        // 개별 레코드 삽입 시도 (문제 레코드 식별)
        for (const record of batch) {
          try {
            await db
              .insert(sqlPerformanceHistory)
              .values(record);
            insertedCount++;
          } catch (singleError: any) {
            console.error(`[Collect Performance] Single insert error for SQL_ID ${record.sqlId}:`, singleError.message);
          }
        }
      }
    }

    // 에러가 있었으면 로그에 기록
    if (insertErrors.length > 0) {
      console.warn(`[Collect Performance] ${insertErrors.length} batch errors occurred, but individual inserts may have succeeded`);
    }

    // 일별 요약 업데이트
    await updateDailySummary(connection_id, collectionDate, performanceRecords);

    // 수집 로그 업데이트
    const hasPartialFailure = insertErrors.length > 0 && insertedCount > 0;
    const hasTotalFailure = insertErrors.length > 0 && insertedCount === 0;
    const finalStatus = hasTotalFailure ? 'FAILED' : (hasPartialFailure ? 'PARTIAL' : 'SUCCESS');

    if (logId) {
      await db
        .update(performanceCollectionLogs)
        .set({
          status: finalStatus,
          completedAt: new Date(),
          durationMs: Date.now() - startTime,
          recordsCollected: result.rows.length,
          recordsInserted: insertedCount,
          errorMessage: insertErrors.length > 0 ? insertErrors.join('; ') : null,
        })
        .where(eq(performanceCollectionLogs.id, logId));
    }

    // 수집 설정 업데이트
    if (settings) {
      await db
        .update(performanceCollectionSettings)
        .set({
          lastCollectionAt: new Date(),
          lastCollectionStatus: finalStatus,
          lastCollectionCount: insertedCount,
          totalCollections: (collectionSettings.total_collections || 0) + 1,
          successfulCollections: (collectionSettings.successful_collections || 0) + (hasTotalFailure ? 0 : 1),
        })
        .where(eq(performanceCollectionSettings.oracleConnectionId, connection_id));
    }

    return NextResponse.json({
      success: true,
      message: 'Performance data collected successfully',
      records_collected: result.rows.length,
      records_inserted: insertedCount,
      duration_ms: Date.now() - startTime,
    });

  } catch (error) {
    console.error('[Collect Performance API] Error:', error);

    // 에러 시 로그 업데이트
    if (logId) {
      try {
        await db
          .update(performanceCollectionLogs)
          .set({
            status: 'FAILED',
            completedAt: new Date(),
            durationMs: Date.now() - startTime,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            errorDetails: { stack: error instanceof Error ? error.stack : null },
          })
          .where(eq(performanceCollectionLogs.id, logId));
      } catch (logError) {
        console.error('[Collect Performance] Failed to update error log:', logError);
      }
    }

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Collection failed',
      duration_ms: Date.now() - startTime,
    }, { status: 500 });
  }
}

/**
 * 일별 요약 업데이트
 */
async function updateDailySummary(
  connectionId: string,
  summaryDate: string,
  records: any[]
) {
  try {
    // 기존 요약 조회
    const [existingSummary] = await db
      .select()
      .from(sqlPerformanceDailySummary)
      .where(
        and(
          eq(sqlPerformanceDailySummary.oracleConnectionId, connectionId),
          eq(sqlPerformanceDailySummary.summaryDate, summaryDate)
        )
      )
      .limit(1);

    // 통계 계산
    const totalSqls = new Set(records.map(r => r.sqlId)).size;
    const totalExecutions = records.reduce((sum, r) => sum + r.executions, 0);
    const avgElapsedTime = records.reduce((sum, r) => sum + Number(r.elapsedTimeMs), 0) / records.length;
    const avgCpuTime = records.reduce((sum, r) => sum + Number(r.cpuTimeMs), 0) / records.length;
    const avgBufferGets = records.reduce((sum, r) => sum + r.bufferGets, 0) / records.length;
    const avgDiskReads = records.reduce((sum, r) => sum + r.diskReads, 0) / records.length;
    const maxElapsedTime = Math.max(...records.map(r => Number(r.elapsedTimeMs)));
    const maxBufferGets = Math.max(...records.map(r => r.bufferGets));

    // 등급별 카운트
    const gradeACount = records.filter(r => r.performanceGrade === 'A').length;
    const gradeBCount = records.filter(r => r.performanceGrade === 'B').length;
    const gradeCCount = records.filter(r => r.performanceGrade === 'C').length;
    const gradeDCount = records.filter(r => r.performanceGrade === 'D').length;
    const gradeFCount = records.filter(r => r.performanceGrade === 'F').length;

    const now = new Date();

    if (existingSummary) {
      // 기존 요약 업데이트 (누적)
      await db
        .update(sqlPerformanceDailySummary)
        .set({
          totalSqls: (existingSummary.totalSqls || 0) + totalSqls,
          totalExecutions: (existingSummary.totalExecutions || 0) + totalExecutions,
          avgElapsedTimeMs: String((Number(existingSummary.avgElapsedTimeMs) + avgElapsedTime) / 2),
          avgCpuTimeMs: String((Number(existingSummary.avgCpuTimeMs) + avgCpuTime) / 2),
          avgBufferGets: String((Number(existingSummary.avgBufferGets) + avgBufferGets) / 2),
          avgDiskReads: String((Number(existingSummary.avgDiskReads) + avgDiskReads) / 2),
          maxElapsedTimeMs: String(Math.max(Number(existingSummary.maxElapsedTimeMs), maxElapsedTime)),
          maxBufferGets: Math.max(existingSummary.maxBufferGets || 0, maxBufferGets),
          gradeACount: (existingSummary.gradeACount || 0) + gradeACount,
          gradeBCount: (existingSummary.gradeBCount || 0) + gradeBCount,
          gradeCCount: (existingSummary.gradeCCount || 0) + gradeCCount,
          gradeDCount: (existingSummary.gradeDCount || 0) + gradeDCount,
          gradeFCount: (existingSummary.gradeFCount || 0) + gradeFCount,
          collectionCount: (existingSummary.collectionCount || 0) + 1,
          lastCollectionAt: now,
        })
        .where(eq(sqlPerformanceDailySummary.id, existingSummary.id));
    } else {
      // 새 요약 생성
      await db
        .insert(sqlPerformanceDailySummary)
        .values({
          oracleConnectionId: connectionId,
          summaryDate: summaryDate,
          totalSqls: totalSqls,
          totalExecutions: totalExecutions,
          avgElapsedTimeMs: String(avgElapsedTime),
          avgCpuTimeMs: String(avgCpuTime),
          avgBufferGets: String(avgBufferGets),
          avgDiskReads: String(avgDiskReads),
          maxElapsedTimeMs: String(maxElapsedTime),
          maxBufferGets: maxBufferGets,
          gradeACount: gradeACount,
          gradeBCount: gradeBCount,
          gradeCCount: gradeCCount,
          gradeDCount: gradeDCount,
          gradeFCount: gradeFCount,
          collectionCount: 1,
          firstCollectionAt: now,
          lastCollectionAt: now,
        });
    }
  } catch (error) {
    console.error('[Collect Performance] Failed to update daily summary:', error);
  }
}

/**
 * DELETE /api/monitoring/collect-performance
 * 수집 로그 삭제
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');
    const logIdParam = searchParams.get('log_id');
    const deleteAll = searchParams.get('delete_all') === 'true';

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    if (deleteAll) {
      // 먼저 삭제할 로그 수 확인
      const [countResult] = await db
        .select({ value: count() })
        .from(performanceCollectionLogs)
        .where(eq(performanceCollectionLogs.oracleConnectionId, connectionId));

      const totalCount = countResult?.value || 0;

      // 모든 수집 로그 삭제
      await db
        .delete(performanceCollectionLogs)
        .where(eq(performanceCollectionLogs.oracleConnectionId, connectionId));

      return NextResponse.json({
        success: true,
        message: `${totalCount}개의 수집 로그가 삭제되었습니다.`,
        deleted_count: totalCount,
      });
    } else if (logIdParam) {
      // 특정 로그만 삭제
      await db
        .delete(performanceCollectionLogs)
        .where(
          and(
            eq(performanceCollectionLogs.id, logIdParam),
            eq(performanceCollectionLogs.oracleConnectionId, connectionId)
          )
        );

      return NextResponse.json({
        success: true,
        message: '수집 로그가 삭제되었습니다.',
      });
    } else {
      return NextResponse.json({
        error: 'Either log_id or delete_all=true is required',
      }, { status: 400 });
    }
  } catch (error) {
    console.error('[Delete Collection Logs] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete logs',
    }, { status: 500 });
  }
}

/**
 * GET /api/monitoring/collect-performance
 * 수집 상태 및 설정 조회
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    // 수집 설정 조회
    const [settings] = await db
      .select()
      .from(performanceCollectionSettings)
      .where(eq(performanceCollectionSettings.oracleConnectionId, connectionId))
      .limit(1);

    // 최근 수집 로그 조회 (10개)
    const recentLogs = await db
      .select()
      .from(performanceCollectionLogs)
      .where(eq(performanceCollectionLogs.oracleConnectionId, connectionId))
      .orderBy(desc(performanceCollectionLogs.startedAt))
      .limit(10);

    // 오늘 수집 통계
    const today = new Date().toISOString().split('T')[0];
    const [todaySummary] = await db
      .select()
      .from(sqlPerformanceDailySummary)
      .where(
        and(
          eq(sqlPerformanceDailySummary.oracleConnectionId, connectionId),
          eq(sqlPerformanceDailySummary.summaryDate, today)
        )
      )
      .limit(1);

    // 총 저장된 레코드 수
    const [totalRecordsResult] = await db
      .select({ value: count() })
      .from(sqlPerformanceHistory)
      .where(eq(sqlPerformanceHistory.oracleConnectionId, connectionId));

    return NextResponse.json({
      success: true,
      settings: settings ? {
        is_enabled: settings.isEnabled,
        collection_interval_minutes: settings.collectionIntervalMinutes,
        retention_days: settings.retentionDays,
        top_sql_limit: settings.topSqlLimit,
        min_executions: settings.minExecutions,
        min_elapsed_time_ms: settings.minElapsedTimeMs,
        excluded_schemas: settings.excludedSchemas,
        collect_all_hours: settings.collectAllHours,
        collect_start_hour: settings.collectStartHour,
        collect_end_hour: settings.collectEndHour,
        total_collections: settings.totalCollections,
        successful_collections: settings.successfulCollections,
        failed_collections: settings.failedCollections,
        last_collection_at: settings.lastCollectionAt,
        last_collection_status: settings.lastCollectionStatus,
        last_collection_count: settings.lastCollectionCount,
      } : {
        is_enabled: true,
        collection_interval_minutes: 10,
        retention_days: 30,
        top_sql_limit: 500,
      },
      recent_logs: (recentLogs || []).map(log => ({
        id: log.id,
        oracle_connection_id: log.oracleConnectionId,
        started_at: log.startedAt,
        completed_at: log.completedAt,
        duration_ms: log.durationMs,
        status: log.status,
        records_collected: log.recordsCollected,
        records_inserted: log.recordsInserted,
        records_updated: log.recordsUpdated,
        source: log.source,
        error_message: log.errorMessage,
        error_details: log.errorDetails,
        created_at: log.createdAt,
      })),
      today_summary: todaySummary ? {
        id: todaySummary.id,
        oracle_connection_id: todaySummary.oracleConnectionId,
        summary_date: todaySummary.summaryDate,
        total_sqls: todaySummary.totalSqls,
        total_executions: todaySummary.totalExecutions,
        avg_elapsed_time_ms: todaySummary.avgElapsedTimeMs,
        avg_cpu_time_ms: todaySummary.avgCpuTimeMs,
        avg_buffer_gets: todaySummary.avgBufferGets,
        avg_disk_reads: todaySummary.avgDiskReads,
        max_elapsed_time_ms: todaySummary.maxElapsedTimeMs,
        max_buffer_gets: todaySummary.maxBufferGets,
        grade_a_count: todaySummary.gradeACount,
        grade_b_count: todaySummary.gradeBCount,
        grade_c_count: todaySummary.gradeCCount,
        grade_d_count: todaySummary.gradeDCount,
        grade_f_count: todaySummary.gradeFCount,
        collection_count: todaySummary.collectionCount,
        first_collection_at: todaySummary.firstCollectionAt,
        last_collection_at: todaySummary.lastCollectionAt,
      } : null,
      total_records: totalRecordsResult?.value || 0,
    });

  } catch (error) {
    console.error('[Collect Performance GET] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get collection status',
    }, { status: 500 });
  }
}
