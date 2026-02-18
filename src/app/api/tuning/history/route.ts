import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { tuningHistory } from '@/db/schema';
import { eq, desc, and, gte, lte, count, lt } from 'drizzle-orm';

/**
 * GET /api/tuning/history
 * 튜닝 이력 조회
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const activityType = searchParams.get('activity_type');
    const tuningTaskId = searchParams.get('tuning_task_id');
    const sqlId = searchParams.get('sql_id');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const limitParam = searchParams.get('limit');
    // limit이 'all'이면 큰 수(예: 10000) 아니면 파싱
    const limit = limitParam === 'all' ? 10000 : parseInt(limitParam || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build filter conditions
    const conditions = [];

    if (activityType && activityType !== 'all') {
      conditions.push(eq(tuningHistory.activityType, activityType));
    }

    if (tuningTaskId) {
      conditions.push(eq(tuningHistory.tuningTaskId, tuningTaskId));
    }

    if (sqlId) {
      conditions.push(eq(tuningHistory.sqlId, sqlId));
    }

    // 날짜 필터 적용
    if (startDate) {
      conditions.push(gte(tuningHistory.performedAt, new Date(startDate)));
    }

    if (endDate) {
      conditions.push(lte(tuningHistory.performedAt, new Date(endDate)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(tuningHistory)
      .where(whereClause);

    // Get paginated data
    const data = await db
      .select({
        id: tuningHistory.id,
        tuning_task_id: tuningHistory.tuningTaskId,
        oracle_connection_id: tuningHistory.oracleConnectionId,
        sql_id: tuningHistory.sqlId,
        activity_type: tuningHistory.activityType,
        description: tuningHistory.description,
        old_value: tuningHistory.oldValue,
        new_value: tuningHistory.newValue,
        elapsed_time_ms: tuningHistory.elapsedTimeMs,
        buffer_gets: tuningHistory.bufferGets,
        cpu_time_ms: tuningHistory.cpuTimeMs,
        performed_by: tuningHistory.performedBy,
        performed_at: tuningHistory.performedAt,
        metadata: tuningHistory.metadata,
        created_at: tuningHistory.createdAt,
      })
      .from(tuningHistory)
      .where(whereClause)
      .orderBy(desc(tuningHistory.performedAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      data,
      pagination: {
        total,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('Get tuning history error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tuning history' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tuning/history
 * 튜닝 이력 추가 (수동 기록용)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tuning_task_id,
      oracle_connection_id,
      sql_id,
      activity_type,
      description,
      old_value,
      new_value,
      elapsed_time_ms,
      buffer_gets,
      cpu_time_ms,
    } = body;

    // 필수 필드 검증
    if (!tuning_task_id || !oracle_connection_id || !sql_id || !activity_type || !description) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const [history] = await db
      .insert(tuningHistory)
      .values({
        tuningTaskId: tuning_task_id,
        oracleConnectionId: oracle_connection_id,
        sqlId: sql_id,
        activityType: activity_type,
        description,
        oldValue: old_value,
        newValue: new_value,
        elapsedTimeMs: elapsed_time_ms,
        bufferGets: buffer_gets,
        cpuTimeMs: cpu_time_ms,
        metadata: {},
      })
      .returning();

    // Map to snake_case for frontend compatibility
    const response = {
      id: history.id,
      tuning_task_id: history.tuningTaskId,
      oracle_connection_id: history.oracleConnectionId,
      sql_id: history.sqlId,
      activity_type: history.activityType,
      description: history.description,
      old_value: history.oldValue,
      new_value: history.newValue,
      elapsed_time_ms: history.elapsedTimeMs,
      buffer_gets: history.bufferGets,
      cpu_time_ms: history.cpuTimeMs,
      performed_by: history.performedBy,
      performed_at: history.performedAt,
      metadata: history.metadata,
      created_at: history.createdAt,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Create tuning history error:', error);
    return NextResponse.json(
      { error: 'Failed to create tuning history' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tuning/history
 * 오래된 튜닝 이력 삭제
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const retentionDays = parseInt(searchParams.get('retention_days') || '0');

    if (retentionDays < 0) {
      return NextResponse.json(
        { error: 'Invalid retention days' },
        { status: 400 }
      );
    }

    // retentionDays가 0이면 모든 기록 삭제 (주의 필요)
    // 안전을 위해 0일 때의 동작은 정책적으로 결정해야 함.
    if (retentionDays === 0) {
      return NextResponse.json(
        { error: 'Retention days must be greater than 0' },
        { status: 400 }
      );
    }

    // 기준 날짜 계산
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() - retentionDays);

    const deleted = await db
      .delete(tuningHistory)
      .where(lt(tuningHistory.performedAt, retentionDate))
      .returning({ id: tuningHistory.id });

    return NextResponse.json({ success: true, deleted_count: deleted.length });
  } catch (error) {
    console.error('Delete tuning history error:', error);
    return NextResponse.json(
      { error: 'Failed to delete tuning history' },
      { status: 500 }
    );
  }
}
