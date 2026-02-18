import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sqlTuningTasks, userProfiles } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/tuning/tasks/[id]
 * 개별 튜닝 작업 조회
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    console.log(`[API] Fetching tuning task: ${id}`);

    const rows = await db
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
      .where(eq(sqlTuningTasks.id, id))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Tuning task not found', data: null },
        { status: 404 }
      );
    }

    const data: Record<string, any> = { ...rows[0] };

    // 담당자 이름 조회
    if (data.assigned_to) {
      try {
        const userRows = await db
          .select({ full_name: userProfiles.fullName })
          .from(userProfiles)
          .where(eq(userProfiles.id, data.assigned_to))
          .limit(1);

        if (userRows.length > 0 && userRows[0].full_name) {
          data.assignee_name = userRows[0].full_name;
        }
      } catch (err) {
        console.warn(`[API] Failed to fetch assignee name for user ${data.assigned_to}:`, err);
      }
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[API] Critical error in GET /api/tuning/tasks/[id]:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch tuning task',
        details: error?.message || 'Unknown error',
        stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/tuning/tasks/[id]
 * 튜닝 작업 업데이트
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    console.log(`[API] Updating tuning task ${id} with body:`, JSON.stringify(body));

    // Map snake_case request body keys to camelCase Drizzle column names
    const snakeToCamelMap: Record<string, string> = {
      oracle_connection_id: 'oracleConnectionId',
      sql_statistics_id: 'sqlStatisticsId',
      sql_id: 'sqlId',
      sql_text: 'sqlText',
      assigned_to: 'assignedTo',
      assigned_at: 'assignedAt',
      assigned_by: 'assignedBy',
      before_elapsed_time_ms: 'beforeElapsedTimeMs',
      before_cpu_time_ms: 'beforeCpuTimeMs',
      before_buffer_gets: 'beforeBufferGets',
      before_disk_reads: 'beforeDiskReads',
      before_executions: 'beforeExecutions',
      before_plan_hash_value: 'beforePlanHashValue',
      after_elapsed_time_ms: 'afterElapsedTimeMs',
      after_cpu_time_ms: 'afterCpuTimeMs',
      after_buffer_gets: 'afterBufferGets',
      after_disk_reads: 'afterDiskReads',
      after_executions: 'afterExecutions',
      after_plan_hash_value: 'afterPlanHashValue',
      improvement_rate: 'improvementRate',
      elapsed_time_improved_pct: 'elapsedTimeImprovedPct',
      buffer_gets_improved_pct: 'bufferGetsImprovedPct',
      cpu_time_improved_pct: 'cpuTimeImprovedPct',
      tuning_method: 'tuningMethod',
      tuning_details: 'tuningDetails',
      implemented_changes: 'implementedChanges',
      identified_at: 'identifiedAt',
      started_at: 'startedAt',
      completed_at: 'completedAt',
      cancelled_at: 'cancelledAt',
      estimated_completion_date: 'estimatedCompletionDate',
      reviewed_by: 'reviewedBy',
      reviewed_at: 'reviewedAt',
      review_comments: 'reviewComments',
      approved_by: 'approvedBy',
      approved_at: 'approvedAt',
      created_by: 'createdBy',
      created_at: 'createdAt',
      updated_at: 'updatedAt',
    };

    const updateData: Record<string, any> = {};
    for (const [key, value] of Object.entries(body)) {
      const camelKey = snakeToCamelMap[key] || key;
      updateData[camelKey] = value;
    }

    // Always update the updatedAt timestamp
    updateData.updatedAt = new Date();

    const rows = await db
      .update(sqlTuningTasks)
      .set(updateData)
      .where(eq(sqlTuningTasks.id, id))
      .returning();

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Tuning task not found' },
        { status: 404 }
      );
    }

    const task = rows[0];

    // Map back to snake_case for frontend compatibility
    const data = {
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
      before_cpu_time_ms: task.beforeCpuTimeMs,
      before_buffer_gets: task.beforeBufferGets,
      before_disk_reads: task.beforeDiskReads,
      before_executions: task.beforeExecutions,
      before_plan_hash_value: task.beforePlanHashValue,
      after_elapsed_time_ms: task.afterElapsedTimeMs,
      after_cpu_time_ms: task.afterCpuTimeMs,
      after_buffer_gets: task.afterBufferGets,
      after_disk_reads: task.afterDiskReads,
      after_executions: task.afterExecutions,
      after_plan_hash_value: task.afterPlanHashValue,
      improvement_rate: task.improvementRate,
      elapsed_time_improved_pct: task.elapsedTimeImprovedPct,
      buffer_gets_improved_pct: task.bufferGetsImprovedPct,
      cpu_time_improved_pct: task.cpuTimeImprovedPct,
      tuning_method: task.tuningMethod,
      tuning_details: task.tuningDetails,
      implemented_changes: task.implementedChanges,
      identified_at: task.identifiedAt,
      started_at: task.startedAt,
      completed_at: task.completedAt,
      cancelled_at: task.cancelledAt,
      estimated_completion_date: task.estimatedCompletionDate,
      reviewed_by: task.reviewedBy,
      reviewed_at: task.reviewedAt,
      review_comments: task.reviewComments,
      approved_by: task.approvedBy,
      approved_at: task.approvedAt,
      tags: task.tags,
      labels: task.labels,
      metadata: task.metadata,
      created_by: task.createdBy,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
    };

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[API] Critical error in PATCH /api/tuning/tasks/[id]:', error);
    return NextResponse.json(
      {
        error: 'Failed to update tuning task',
        details: error?.message || 'Unknown error',
        code: error?.code,
        stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tuning/tasks/[id]
 * 튜닝 작업 삭제
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db
      .delete(sqlTuningTasks)
      .where(eq(sqlTuningTasks.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete tuning task error:', error);
    return NextResponse.json(
      { error: 'Failed to delete tuning task' },
      { status: 500 }
    );
  }
}
