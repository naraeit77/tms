import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sqlTuningTasks } from '@/db/schema';
import { eq, desc, and, sql, count } from 'drizzle-orm';

/**
 * GET /api/tuning/tasks
 * 튜닝 태스크 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const assignedTo = searchParams.get('assigned_to');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    const connectionId = searchParams.get('connection_id');

    // Build filter conditions
    const conditions = [];

    if (status && status !== 'all') {
      conditions.push(eq(sqlTuningTasks.status, status));
    }

    if (priority && priority !== 'all') {
      conditions.push(eq(sqlTuningTasks.priority, priority));
    }

    if (assignedTo) {
      conditions.push(eq(sqlTuningTasks.assignedTo, assignedTo));
    }

    if (connectionId && connectionId !== 'all') {
      conditions.push(eq(sqlTuningTasks.oracleConnectionId, connectionId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const [{ total }] = await db
      .select({ total: count() })
      .from(sqlTuningTasks)
      .where(whereClause);

    // Get paginated data
    const data = await db
      .select({
        id: sqlTuningTasks.id,
        oracle_connection_id: sqlTuningTasks.oracleConnectionId,
        sql_statistics_id: sqlTuningTasks.sqlStatisticsId,
        sql_id: sqlTuningTasks.sqlId,
        sql_text: sqlTuningTasks.sqlText,
        title: sqlTuningTasks.title,
        description: sqlTuningTasks.description,
        priority: sqlTuningTasks.priority,
        status: sqlTuningTasks.status,
        assigned_to: sqlTuningTasks.assignedTo,
        assigned_at: sqlTuningTasks.assignedAt,
        assigned_by: sqlTuningTasks.assignedBy,
        before_elapsed_time_ms: sqlTuningTasks.beforeElapsedTimeMs,
        before_cpu_time_ms: sqlTuningTasks.beforeCpuTimeMs,
        before_buffer_gets: sqlTuningTasks.beforeBufferGets,
        before_disk_reads: sqlTuningTasks.beforeDiskReads,
        before_executions: sqlTuningTasks.beforeExecutions,
        before_plan_hash_value: sqlTuningTasks.beforePlanHashValue,
        after_elapsed_time_ms: sqlTuningTasks.afterElapsedTimeMs,
        after_cpu_time_ms: sqlTuningTasks.afterCpuTimeMs,
        after_buffer_gets: sqlTuningTasks.afterBufferGets,
        after_disk_reads: sqlTuningTasks.afterDiskReads,
        after_executions: sqlTuningTasks.afterExecutions,
        after_plan_hash_value: sqlTuningTasks.afterPlanHashValue,
        improvement_rate: sqlTuningTasks.improvementRate,
        elapsed_time_improved_pct: sqlTuningTasks.elapsedTimeImprovedPct,
        buffer_gets_improved_pct: sqlTuningTasks.bufferGetsImprovedPct,
        cpu_time_improved_pct: sqlTuningTasks.cpuTimeImprovedPct,
        tuning_method: sqlTuningTasks.tuningMethod,
        tuning_details: sqlTuningTasks.tuningDetails,
        implemented_changes: sqlTuningTasks.implementedChanges,
        identified_at: sqlTuningTasks.identifiedAt,
        started_at: sqlTuningTasks.startedAt,
        completed_at: sqlTuningTasks.completedAt,
        cancelled_at: sqlTuningTasks.cancelledAt,
        estimated_completion_date: sqlTuningTasks.estimatedCompletionDate,
        reviewed_by: sqlTuningTasks.reviewedBy,
        reviewed_at: sqlTuningTasks.reviewedAt,
        review_comments: sqlTuningTasks.reviewComments,
        approved_by: sqlTuningTasks.approvedBy,
        approved_at: sqlTuningTasks.approvedAt,
        tags: sqlTuningTasks.tags,
        labels: sqlTuningTasks.labels,
        metadata: sqlTuningTasks.metadata,
        created_by: sqlTuningTasks.createdBy,
        created_at: sqlTuningTasks.createdAt,
        updated_at: sqlTuningTasks.updatedAt,
      })
      .from(sqlTuningTasks)
      .where(whereClause)
      .orderBy(desc(sqlTuningTasks.identifiedAt))
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
    console.error('Get tuning tasks error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tuning tasks' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tuning/tasks
 * 새 튜닝 태스크 생성
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      oracle_connection_id,
      sql_id,
      sql_text,
      title,
      description,
      priority = 'MEDIUM',
    } = body;

    // 필수 필드 검증
    if (!oracle_connection_id || !sql_id || !sql_text || !title) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const [task] = await db
      .insert(sqlTuningTasks)
      .values({
        oracleConnectionId: oracle_connection_id,
        sqlId: sql_id,
        sqlText: sql_text,
        title,
        description,
        priority,
        status: 'IDENTIFIED',
        identifiedAt: new Date(),
        metadata: {},
        labels: {},
      })
      .returning();

    // Map to snake_case for frontend compatibility
    const response = {
      id: task.id,
      oracle_connection_id: task.oracleConnectionId,
      sql_statistics_id: task.sqlStatisticsId,
      sql_id: task.sqlId,
      sql_text: task.sqlText,
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: task.status,
      assigned_to: task.assignedTo,
      assigned_at: task.assignedAt,
      assigned_by: task.assignedBy,
      before_elapsed_time_ms: task.beforeElapsedTimeMs,
      after_elapsed_time_ms: task.afterElapsedTimeMs,
      improvement_rate: task.improvementRate,
      tuning_method: task.tuningMethod,
      tuning_details: task.tuningDetails,
      implemented_changes: task.implementedChanges,
      identified_at: task.identifiedAt,
      started_at: task.startedAt,
      completed_at: task.completedAt,
      cancelled_at: task.cancelledAt,
      estimated_completion_date: task.estimatedCompletionDate,
      tags: task.tags,
      labels: task.labels,
      metadata: task.metadata,
      created_by: task.createdBy,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Create tuning task error:', error);
    return NextResponse.json(
      { error: 'Failed to create tuning task' },
      { status: 500 }
    );
  }
}
