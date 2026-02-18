import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { schedulerJobs } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

/**
 * GET /api/scheduler
 * 스케줄러 작업 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');

    const whereCondition = status ? eq(schedulerJobs.status, status) : undefined;

    const jobs = await db
      .select()
      .from(schedulerJobs)
      .where(whereCondition)
      .orderBy(desc(schedulerJobs.createdAt));

    // Convert camelCase to snake_case for frontend compatibility
    const formattedJobs = jobs.map(job => ({
      id: job.id,
      name: job.name,
      job_type: job.jobType,
      cron_expression: job.cronExpression,
      status: job.status,
      oracle_connection_id: job.oracleConnectionId,
      config: job.config,
      last_run_at: job.lastRunAt,
      last_run_status: job.lastRunStatus,
      last_run_duration_ms: job.lastRunDurationMs,
      last_error_message: job.lastErrorMessage,
      next_run_at: job.nextRunAt,
      run_count: job.runCount,
      fail_count: job.failCount,
      created_by: job.createdBy,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
    }));

    return NextResponse.json({
      success: true,
      data: formattedJobs,
    });
  } catch (error) {
    console.error('Scheduler API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/scheduler
 * 스케줄러 작업 생성
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Map snake_case input to camelCase for Drizzle
    const [data] = await db
      .insert(schedulerJobs)
      .values({
        name: body.name,
        jobType: body.job_type,
        cronExpression: body.cron_expression,
        status: body.status,
        oracleConnectionId: body.oracle_connection_id,
        config: body.config,
        lastRunAt: body.last_run_at ? new Date(body.last_run_at) : undefined,
        lastRunStatus: body.last_run_status,
        lastRunDurationMs: body.last_run_duration_ms,
        lastErrorMessage: body.last_error_message,
        nextRunAt: body.next_run_at ? new Date(body.next_run_at) : undefined,
        runCount: body.run_count,
        failCount: body.fail_count,
        createdBy: body.created_by,
      })
      .returning();

    // Format response in snake_case
    const formattedData = data ? {
      id: data.id,
      name: data.name,
      job_type: data.jobType,
      cron_expression: data.cronExpression,
      status: data.status,
      oracle_connection_id: data.oracleConnectionId,
      config: data.config,
      last_run_at: data.lastRunAt,
      last_run_status: data.lastRunStatus,
      last_run_duration_ms: data.lastRunDurationMs,
      last_error_message: data.lastErrorMessage,
      next_run_at: data.nextRunAt,
      run_count: data.runCount,
      fail_count: data.failCount,
      created_by: data.createdBy,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
    } : null;

    return NextResponse.json({
      success: true,
      data: formattedData,
    });
  } catch (error) {
    console.error('Scheduler API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
