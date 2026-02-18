import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { performanceCollectionSettings, oracleConnections } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

/**
 * GET /api/monitoring/collection-settings
 * 수집 설정 조회
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');

    if (connectionId) {
      // 특정 연결의 설정 조회
      const [settings] = await db
        .select()
        .from(performanceCollectionSettings)
        .where(eq(performanceCollectionSettings.oracleConnectionId, connectionId))
        .limit(1);

      // 설정이 없으면 기본값 반환
      if (!settings) {
        return NextResponse.json({
          success: true,
          data: {
            oracle_connection_id: connectionId,
            is_enabled: false,
            collection_interval_minutes: 10,
            retention_days: 30,
            min_executions: 1,
            min_elapsed_time_ms: 0,
            excluded_schemas: ['SYS', 'SYSTEM', 'DBSNMP', 'SYSMAN', 'OUTLN', 'MDSYS', 'ORDSYS', 'EXFSYS', 'WMSYS', 'CTXSYS', 'XDB'],
            top_sql_limit: 500,
            collect_all_hours: true,
            collect_start_hour: 0,
            collect_end_hour: 23,
            total_collections: 0,
            successful_collections: 0,
            failed_collections: 0,
          },
          is_default: true,
        });
      }

      return NextResponse.json({
        success: true,
        data: {
          id: settings.id,
          oracle_connection_id: settings.oracleConnectionId,
          is_enabled: settings.isEnabled,
          collection_interval_minutes: settings.collectionIntervalMinutes,
          retention_days: settings.retentionDays,
          min_executions: settings.minExecutions,
          min_elapsed_time_ms: settings.minElapsedTimeMs,
          excluded_schemas: settings.excludedSchemas,
          top_sql_limit: settings.topSqlLimit,
          collect_all_hours: settings.collectAllHours,
          collect_start_hour: settings.collectStartHour,
          collect_end_hour: settings.collectEndHour,
          total_collections: settings.totalCollections,
          successful_collections: settings.successfulCollections,
          failed_collections: settings.failedCollections,
          last_collection_at: settings.lastCollectionAt,
          last_collection_status: settings.lastCollectionStatus,
          last_collection_count: settings.lastCollectionCount,
          last_error_message: settings.lastErrorMessage,
          created_at: settings.createdAt,
          updated_at: settings.updatedAt,
        },
        is_default: false,
      });
    } else {
      // 모든 연결의 설정 조회 (with join to oracle_connections)
      const allSettings = await db
        .select({
          settings: performanceCollectionSettings,
          connection: {
            id: oracleConnections.id,
            name: oracleConnections.name,
            host: oracleConnections.host,
            isActive: oracleConnections.isActive,
          },
        })
        .from(performanceCollectionSettings)
        .innerJoin(
          oracleConnections,
          eq(performanceCollectionSettings.oracleConnectionId, oracleConnections.id)
        )
        .orderBy(desc(performanceCollectionSettings.createdAt));

      const formattedSettings = allSettings.map(row => ({
        id: row.settings.id,
        oracle_connection_id: row.settings.oracleConnectionId,
        is_enabled: row.settings.isEnabled,
        collection_interval_minutes: row.settings.collectionIntervalMinutes,
        retention_days: row.settings.retentionDays,
        min_executions: row.settings.minExecutions,
        min_elapsed_time_ms: row.settings.minElapsedTimeMs,
        excluded_schemas: row.settings.excludedSchemas,
        top_sql_limit: row.settings.topSqlLimit,
        collect_all_hours: row.settings.collectAllHours,
        collect_start_hour: row.settings.collectStartHour,
        collect_end_hour: row.settings.collectEndHour,
        total_collections: row.settings.totalCollections,
        successful_collections: row.settings.successfulCollections,
        failed_collections: row.settings.failedCollections,
        last_collection_at: row.settings.lastCollectionAt,
        last_collection_status: row.settings.lastCollectionStatus,
        created_at: row.settings.createdAt,
        updated_at: row.settings.updatedAt,
        oracle_connections: {
          id: row.connection.id,
          name: row.connection.name,
          host: row.connection.host,
          is_active: row.connection.isActive,
        },
      }));

      return NextResponse.json({
        success: true,
        data: formattedSettings,
      });
    }
  } catch (error) {
    console.error('[Collection Settings GET] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get settings',
    }, { status: 500 });
  }
}

/**
 * POST /api/monitoring/collection-settings
 * 수집 설정 생성/업데이트
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      connection_id,
      is_enabled,
      collection_interval_minutes,
      retention_days,
      min_executions,
      min_elapsed_time_ms,
      excluded_schemas,
      top_sql_limit,
      collect_all_hours,
      collect_start_hour,
      collect_end_hour,
    } = body;

    if (!connection_id) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    // 유효성 검사
    if (collection_interval_minutes && ![5, 10, 15, 30, 60].includes(collection_interval_minutes)) {
      return NextResponse.json({
        error: 'Invalid collection interval. Allowed: 5, 10, 15, 30, 60'
      }, { status: 400 });
    }

    if (retention_days && (retention_days < 7 || retention_days > 90)) {
      return NextResponse.json({
        error: 'Retention days must be between 7 and 90'
      }, { status: 400 });
    }

    if (top_sql_limit && (top_sql_limit < 100 || top_sql_limit > 1000)) {
      return NextResponse.json({
        error: 'Top SQL limit must be between 100 and 1000'
      }, { status: 400 });
    }

    // 기존 설정 확인
    const [existingSettings] = await db
      .select({ id: performanceCollectionSettings.id })
      .from(performanceCollectionSettings)
      .where(eq(performanceCollectionSettings.oracleConnectionId, connection_id))
      .limit(1);

    const settingsData: Record<string, any> = {};

    // 변경된 필드만 업데이트
    if (is_enabled !== undefined) settingsData.isEnabled = is_enabled;
    if (collection_interval_minutes !== undefined) settingsData.collectionIntervalMinutes = collection_interval_minutes;
    if (retention_days !== undefined) settingsData.retentionDays = retention_days;
    if (min_executions !== undefined) settingsData.minExecutions = min_executions;
    if (min_elapsed_time_ms !== undefined) settingsData.minElapsedTimeMs = String(min_elapsed_time_ms);
    if (excluded_schemas !== undefined) settingsData.excludedSchemas = excluded_schemas;
    if (top_sql_limit !== undefined) settingsData.topSqlLimit = top_sql_limit;
    if (collect_all_hours !== undefined) settingsData.collectAllHours = collect_all_hours;
    if (collect_start_hour !== undefined) settingsData.collectStartHour = collect_start_hour;
    if (collect_end_hour !== undefined) settingsData.collectEndHour = collect_end_hour;

    let result;

    if (existingSettings) {
      // 업데이트
      const [data] = await db
        .update(performanceCollectionSettings)
        .set(settingsData)
        .where(eq(performanceCollectionSettings.oracleConnectionId, connection_id))
        .returning();

      result = data;
    } else {
      // 새로 생성
      const [data] = await db
        .insert(performanceCollectionSettings)
        .values({
          oracleConnectionId: connection_id,
          ...settingsData,
        })
        .returning();

      result = data;
    }

    // snake_case 형태로 응답
    const responseData = result ? {
      id: result.id,
      oracle_connection_id: result.oracleConnectionId,
      is_enabled: result.isEnabled,
      collection_interval_minutes: result.collectionIntervalMinutes,
      retention_days: result.retentionDays,
      min_executions: result.minExecutions,
      min_elapsed_time_ms: result.minElapsedTimeMs,
      excluded_schemas: result.excludedSchemas,
      top_sql_limit: result.topSqlLimit,
      collect_all_hours: result.collectAllHours,
      collect_start_hour: result.collectStartHour,
      collect_end_hour: result.collectEndHour,
      total_collections: result.totalCollections,
      successful_collections: result.successfulCollections,
      failed_collections: result.failedCollections,
      created_at: result.createdAt,
      updated_at: result.updatedAt,
    } : null;

    return NextResponse.json({
      success: true,
      data: responseData,
      message: existingSettings ? 'Settings updated' : 'Settings created',
    });

  } catch (error) {
    console.error('[Collection Settings POST] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save settings',
    }, { status: 500 });
  }
}

/**
 * DELETE /api/monitoring/collection-settings
 * 수집 설정 삭제 (기본값으로 초기화)
 */
export async function DELETE(request: NextRequest) {
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

    await db
      .delete(performanceCollectionSettings)
      .where(eq(performanceCollectionSettings.oracleConnectionId, connectionId));

    return NextResponse.json({
      success: true,
      message: 'Settings deleted',
    });

  } catch (error) {
    console.error('[Collection Settings DELETE] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete settings',
    }, { status: 500 });
  }
}
