import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { planBaselines } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Drizzle row를 snake_case JSON 응답으로 변환
 */
function toSnakeCaseResponse(row: typeof planBaselines.$inferSelect) {
  return {
    id: row.id,
    oracle_connection_id: row.oracleConnectionId,
    sql_id: row.sqlId,
    plan_hash_value: row.planHashValue,
    plan_name: row.planName,
    sql_handle: row.sqlHandle,
    is_enabled: row.isEnabled,
    is_accepted: row.isAccepted,
    is_fixed: row.isFixed,
    plan_table: row.planTable,
    cost: row.cost,
    executions: row.executions,
    avg_elapsed_time_ms: row.avgElapsedTimeMs,
    avg_buffer_gets: row.avgBufferGets,
    created_in_oracle_at: row.createdInOracleAt,
    last_modified_at: row.lastModifiedAt,
    created_by: row.createdBy,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

/**
 * GET /api/plan-baselines/[id]
 * SQL Plan Baseline 상세 조회
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const result = await db
      .select()
      .from(planBaselines)
      .where(eq(planBaselines.id, id))
      .limit(1);

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Plan baseline not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: toSnakeCaseResponse(result[0]),
    });
  } catch (error) {
    console.error('Plan baseline API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/plan-baselines/[id]
 * SQL Plan Baseline 수정
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // snake_case body를 camelCase Drizzle 컬럼으로 매핑
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    const fieldMap: Record<string, string> = {
      oracle_connection_id: 'oracleConnectionId',
      sql_id: 'sqlId',
      plan_hash_value: 'planHashValue',
      plan_name: 'planName',
      sql_handle: 'sqlHandle',
      is_enabled: 'isEnabled',
      is_accepted: 'isAccepted',
      is_fixed: 'isFixed',
      plan_table: 'planTable',
      cost: 'cost',
      executions: 'executions',
      avg_elapsed_time_ms: 'avgElapsedTimeMs',
      avg_buffer_gets: 'avgBufferGets',
      created_in_oracle_at: 'createdInOracleAt',
      last_modified_at: 'lastModifiedAt',
      created_by: 'createdBy',
    };

    for (const [snakeKey, camelKey] of Object.entries(fieldMap)) {
      if (body[snakeKey] !== undefined) {
        updateData[camelKey] = body[snakeKey];
      }
    }

    const updated = await db
      .update(planBaselines)
      .set(updateData)
      .where(eq(planBaselines.id, id))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json(
        { error: 'Failed to update plan baseline' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: toSnakeCaseResponse(updated[0]),
    });
  } catch (error) {
    console.error('Plan baseline API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/plan-baselines/[id]
 * SQL Plan Baseline 삭제
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const deleted = await db
      .delete(planBaselines)
      .where(eq(planBaselines.id, id))
      .returning({ id: planBaselines.id });

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: 'Failed to delete plan baseline' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('Plan baseline API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
