import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { planBaselines } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

/**
 * GET /api/plan-baselines
 * SQL Plan Baselines 조회
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');

    let query = db
      .select({
        id: planBaselines.id,
        oracle_connection_id: planBaselines.oracleConnectionId,
        sql_id: planBaselines.sqlId,
        plan_hash_value: planBaselines.planHashValue,
        plan_name: planBaselines.planName,
        sql_handle: planBaselines.sqlHandle,
        is_enabled: planBaselines.isEnabled,
        is_accepted: planBaselines.isAccepted,
        is_fixed: planBaselines.isFixed,
        plan_table: planBaselines.planTable,
        cost: planBaselines.cost,
        executions: planBaselines.executions,
        avg_elapsed_time_ms: planBaselines.avgElapsedTimeMs,
        avg_buffer_gets: planBaselines.avgBufferGets,
        created_in_oracle_at: planBaselines.createdInOracleAt,
        last_modified_at: planBaselines.lastModifiedAt,
        created_by: planBaselines.createdBy,
        created_at: planBaselines.createdAt,
        updated_at: planBaselines.updatedAt,
      })
      .from(planBaselines)
      .orderBy(desc(planBaselines.createdAt))
      .$dynamic();

    if (connectionId) {
      query = query.where(eq(planBaselines.oracleConnectionId, connectionId));
    }

    const data = await query;

    return NextResponse.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error('Plan baselines API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/plan-baselines
 * SQL Plan Baseline 생성
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    const [data] = await db
      .insert(planBaselines)
      .values({
        oracleConnectionId: body.oracle_connection_id,
        sqlId: body.sql_id,
        planHashValue: body.plan_hash_value,
        planName: body.plan_name,
        sqlHandle: body.sql_handle,
        isEnabled: body.is_enabled ?? true,
        isAccepted: body.is_accepted ?? true,
        isFixed: body.is_fixed ?? false,
        planTable: body.plan_table,
        cost: body.cost,
        executions: body.executions,
        avgElapsedTimeMs: body.avg_elapsed_time_ms,
        avgBufferGets: body.avg_buffer_gets,
        createdInOracleAt: body.created_in_oracle_at,
        lastModifiedAt: body.last_modified_at,
        createdBy: body.created_by,
      })
      .returning();

    // snake_case response for frontend compatibility
    const responseData = {
      id: data.id,
      oracle_connection_id: data.oracleConnectionId,
      sql_id: data.sqlId,
      plan_hash_value: data.planHashValue,
      plan_name: data.planName,
      sql_handle: data.sqlHandle,
      is_enabled: data.isEnabled,
      is_accepted: data.isAccepted,
      is_fixed: data.isFixed,
      plan_table: data.planTable,
      cost: data.cost,
      executions: data.executions,
      avg_elapsed_time_ms: data.avgElapsedTimeMs,
      avg_buffer_gets: data.avgBufferGets,
      created_in_oracle_at: data.createdInOracleAt,
      last_modified_at: data.lastModifiedAt,
      created_by: data.createdBy,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
    };

    return NextResponse.json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error('Plan baselines API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
