/**
 * SQL Statistics Collection API
 * POST: Oracle DB에서 SQL 통계를 수집하여 PostgreSQL에 저장
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { oracleConnections, systemSettings, sqlStatistics, auditLogs } from '@/db/schema';
import { eq, and, desc, sql, ne, inArray } from 'drizzle-orm';
import { decrypt } from '@/lib/crypto';
import { collectSQLStatistics, getSQLFullText } from '@/lib/oracle';
import { processAutoTuning } from '@/lib/services/auto-tuning';
import type { OracleConnectionConfig, SQLStatisticsRow } from '@/lib/oracle/types';

export async function POST(request: NextRequest) {
  try {
    // 현재 사용자 확인 (Next-Auth 세션 사용)
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    const body = await request.json();
    const { connection_id } = body;

    if (!connection_id) {
      return NextResponse.json({ error: 'connection_id is required' }, { status: 400 });
    }

    // 연결 정보 조회
    const connections = await db
      .select()
      .from(oracleConnections)
      .where(
        and(
          eq(oracleConnections.id, connection_id),
          eq(oracleConnections.isActive, true)
        )
      )
      .limit(1);

    const connection = connections[0];
    if (!connection) {
      return NextResponse.json({ error: 'Connection not found or inactive' }, { status: 404 });
    }

    // 시스템 설정에서 임계값 조회
    const settings = await db
      .select()
      .from(systemSettings)
      .where(
        inArray(systemSettings.key, [
          'elapsed_time_critical',
          'elapsed_time_warning',
          'buffer_gets_critical',
          'buffer_gets_warning',
        ])
      );

    const thresholds = {
      elapsed_critical: (settings?.find((s) => s.key === 'elapsed_time_critical')?.value as any)?.value || 10000,
      elapsed_warning: (settings?.find((s) => s.key === 'elapsed_time_warning')?.value as any)?.value || 5000,
      buffer_critical: (settings?.find((s) => s.key === 'buffer_gets_critical')?.value as any)?.value || 1000000,
      buffer_warning: (settings?.find((s) => s.key === 'buffer_gets_warning')?.value as any)?.value || 500000,
    };

    // Oracle 연결 및 SQL 통계 수집
    const password = decrypt(connection.passwordEncrypted);

    const config: OracleConnectionConfig = {
      id: connection.id,
      name: connection.name,
      host: connection.host,
      port: connection.port!,
      serviceName: connection.serviceName || undefined,
      sid: connection.sid || undefined,
      username: connection.username,
      password,
      connectionType: connection.connectionType!,
      privilege: connection.privilege || undefined,
    };

    // Oracle에서 SQL 통계 수집 (실제 클라이언트 사용)
    console.log('Collecting SQL statistics from Oracle...', {
      host: config.host,
      port: config.port,
      username: config.username,
      connectionType: config.connectionType,
      serviceName: config.serviceName,
      sid: config.sid,
      privilege: config.privilege,
      connectionPrivilege: connection.privilege,
    });

    let sqlStats: SQLStatisticsRow[];
    try {
      sqlStats = await collectSQLStatistics(config, 1000);
      console.log(`Collected ${sqlStats?.length || 0} SQL statistics`);
    } catch (collectError) {
      console.error('Error during SQL statistics collection:', collectError);
      const errorMessage = collectError instanceof Error ? collectError.message : 'Unknown error';
      const errorStack = collectError instanceof Error ? collectError.stack : undefined;

      return NextResponse.json(
        {
          error: 'Failed to collect SQL statistics',
          details: errorMessage,
          stack: process.env.NODE_ENV === 'development' ? errorStack : undefined,
        },
        { status: 500 }
      );
    }

    if (!sqlStats || sqlStats.length === 0) {
      return NextResponse.json({
        message: 'No SQL statistics found',
        collected: 0,
      });
    }

    let collected = 0;
    let errors = 0;

    // SQL 통계 저장
    for (const row of sqlStats) {
      try {
        // SQL Full Text 조회
        const sqlTextRaw = await getSQLFullText(config, row.SQL_ID);

        // sqlText를 문자열로 변환 (Buffer나 다른 타입일 수 있음)
        const sqlText = typeof sqlTextRaw === 'string'
          ? sqlTextRaw
          : String(sqlTextRaw || '');

        // 상태 및 우선순위 결정
        const status = determineStatus(row, thresholds);
        const priority = determinePriority(row, thresholds);

        // Upsert SQL 통계
        await db
          .insert(sqlStatistics)
          .values({
            oracleConnectionId: connection_id,
            sqlId: row.SQL_ID,
            planHashValue: row.PLAN_HASH_VALUE ? Math.floor(Number(row.PLAN_HASH_VALUE)) : null,
            module: row.MODULE,
            schemaName: row.SCHEMA_NAME,
            sqlText: sqlText.substring(0, 4000),
            sqlFulltext: sqlText,
            elapsedTimeMs: Math.floor(Number(row.ELAPSED_TIME_MS) || 0),
            cpuTimeMs: Math.floor(Number(row.CPU_TIME_MS) || 0),
            bufferGets: Math.floor(Number(row.BUFFER_GETS) || 0),
            diskReads: Math.floor(Number(row.DISK_READS) || 0),
            directWrites: Math.floor(Number(row.DIRECT_WRITES) || 0),
            executions: Math.floor(Number(row.EXECUTIONS) || 0),
            parseCalls: Math.floor(Number(row.PARSE_CALLS) || 0),
            rowsProcessed: Math.floor(Number(row.ROWS_PROCESSED) || 0),
            avgElapsedTimeMs: String(row.EXECUTIONS > 0 ? row.ELAPSED_TIME_MS / row.EXECUTIONS : 0),
            avgCpuTimeMs: String(row.EXECUTIONS > 0 ? row.CPU_TIME_MS / row.EXECUTIONS : 0),
            getsPerExec: String(row.EXECUTIONS > 0 ? row.BUFFER_GETS / row.EXECUTIONS : 0),
            rowsPerExec: String(row.EXECUTIONS > 0 ? row.ROWS_PROCESSED / row.EXECUTIONS : 0),
            applicationWaitTimeMs: Math.floor(Number(row.APPLICATION_WAIT_TIME_MS) || 0),
            concurrencyWaitTimeMs: Math.floor(Number(row.CONCURRENCY_WAIT_TIME_MS) || 0),
            clusterWaitTimeMs: Math.floor(Number(row.CLUSTER_WAIT_TIME_MS) || 0),
            userIoWaitTimeMs: Math.floor(Number(row.USER_IO_WAIT_TIME_MS) || 0),
            firstLoadTime: row.FIRST_LOAD_TIME ? new Date(row.FIRST_LOAD_TIME) : null,
            lastActiveTime: row.LAST_ACTIVE_TIME ? new Date(row.LAST_ACTIVE_TIME) : null,
            lastLoadTime: row.LAST_LOAD_TIME ? new Date(row.LAST_LOAD_TIME) : null,
            collectedAt: new Date(),
            status,
            priority,
          })
          .onConflictDoUpdate({
            target: [sqlStatistics.oracleConnectionId, sqlStatistics.sqlId],
            set: {
              planHashValue: row.PLAN_HASH_VALUE ? Math.floor(Number(row.PLAN_HASH_VALUE)) : null,
              module: row.MODULE,
              schemaName: row.SCHEMA_NAME,
              sqlText: sqlText.substring(0, 4000),
              sqlFulltext: sqlText,
              elapsedTimeMs: Math.floor(Number(row.ELAPSED_TIME_MS) || 0),
              cpuTimeMs: Math.floor(Number(row.CPU_TIME_MS) || 0),
              bufferGets: Math.floor(Number(row.BUFFER_GETS) || 0),
              diskReads: Math.floor(Number(row.DISK_READS) || 0),
              directWrites: Math.floor(Number(row.DIRECT_WRITES) || 0),
              executions: Math.floor(Number(row.EXECUTIONS) || 0),
              parseCalls: Math.floor(Number(row.PARSE_CALLS) || 0),
              rowsProcessed: Math.floor(Number(row.ROWS_PROCESSED) || 0),
              avgElapsedTimeMs: String(row.EXECUTIONS > 0 ? row.ELAPSED_TIME_MS / row.EXECUTIONS : 0),
              avgCpuTimeMs: String(row.EXECUTIONS > 0 ? row.CPU_TIME_MS / row.EXECUTIONS : 0),
              getsPerExec: String(row.EXECUTIONS > 0 ? row.BUFFER_GETS / row.EXECUTIONS : 0),
              rowsPerExec: String(row.EXECUTIONS > 0 ? row.ROWS_PROCESSED / row.EXECUTIONS : 0),
              applicationWaitTimeMs: Math.floor(Number(row.APPLICATION_WAIT_TIME_MS) || 0),
              concurrencyWaitTimeMs: Math.floor(Number(row.CONCURRENCY_WAIT_TIME_MS) || 0),
              clusterWaitTimeMs: Math.floor(Number(row.CLUSTER_WAIT_TIME_MS) || 0),
              userIoWaitTimeMs: Math.floor(Number(row.USER_IO_WAIT_TIME_MS) || 0),
              collectedAt: new Date(),
              status,
              priority,
              updatedAt: new Date(),
            },
          });

        collected++;
      } catch (err) {
        errors++;
        console.error(`Error processing SQL ${row.SQL_ID}:`, err);
      }
    }

    // 자동 튜닝 처리
    let autoTuningResult = { processed: 0, registered: 0, skipped: 0, errors: [] as string[] };

    try {
      // 수집된 SQL 통계 조회 (자동 튜닝 대상)
      const collectedStats = await db
        .select({
          id: sqlStatistics.id,
          oracle_connection_id: sqlStatistics.oracleConnectionId,
          sql_id: sqlStatistics.sqlId,
          sql_text: sqlStatistics.sqlText,
          elapsed_time_ms: sqlStatistics.elapsedTimeMs,
          cpu_time_ms: sqlStatistics.cpuTimeMs,
          buffer_gets: sqlStatistics.bufferGets,
          executions: sqlStatistics.executions,
          status: sqlStatistics.status,
        })
        .from(sqlStatistics)
        .where(
          and(
            eq(sqlStatistics.oracleConnectionId, connection_id),
            ne(sqlStatistics.status, 'TUNING')
          )
        )
        .orderBy(desc(sqlStatistics.bufferGets))
        .limit(100);

      if (collectedStats && collectedStats.length > 0) {
        autoTuningResult = await processAutoTuning(collectedStats, userId);

        if (autoTuningResult.registered > 0) {
          console.log(`Auto-tuning: ${autoTuningResult.registered} SQL(s) registered for tuning`);
        }
      }
    } catch (autoTuningError) {
      console.error('Auto-tuning error:', autoTuningError);
    }

    // 감사 로그
    await db.insert(auditLogs).values({
      userId: userId,
      action: 'COLLECT',
      resourceType: 'sql_statistics',
      resourceId: connection_id,
      details: {
        total: sqlStats.length,
        collected,
        errors,
        autoTuning: autoTuningResult,
      },
    });

    return NextResponse.json({
      message: 'SQL statistics collected successfully',
      total: sqlStats.length,
      collected,
      errors,
      autoTuning: {
        enabled: autoTuningResult.processed > 0,
        registered: autoTuningResult.registered,
        skipped: autoTuningResult.skipped,
      },
    });
  } catch (error) {
    console.error('Collection error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    return NextResponse.json(
      {
        error: 'Failed to collect SQL statistics',
        details: errorMessage,
        stack: process.env.NODE_ENV === 'development' ? errorStack : undefined,
      },
      { status: 500 }
    );
  }
}

function determineStatus(row: SQLStatisticsRow, thresholds: any): 'NORMAL' | 'WARNING' | 'CRITICAL' {
  if (row.ELAPSED_TIME_MS >= thresholds.elapsed_critical || row.BUFFER_GETS >= thresholds.buffer_critical) {
    return 'CRITICAL';
  }

  if (row.ELAPSED_TIME_MS >= thresholds.elapsed_warning || row.BUFFER_GETS >= thresholds.buffer_warning) {
    return 'WARNING';
  }

  return 'NORMAL';
}

function determinePriority(row: SQLStatisticsRow, thresholds: any): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  const status = determineStatus(row, thresholds);

  if (status === 'CRITICAL') {
    return 'CRITICAL';
  } else if (status === 'WARNING') {
    return 'HIGH';
  } else {
    return 'MEDIUM';
  }
}
