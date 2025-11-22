import { NextRequest, NextResponse } from 'next/server';
import { createPureClient } from '@/lib/supabase/server';

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
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const supabase = await createPureClient();

    let query = supabase
      .from('tuning_history')
      .select('*')
      .order('performed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // 필터 적용
    if (activityType && activityType !== 'all') {
      query = query.eq('activity_type', activityType);
    }

    if (tuningTaskId) {
      query = query.eq('tuning_task_id', tuningTaskId);
    }

    if (sqlId) {
      query = query.eq('sql_id', sqlId);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({
      data,
      pagination: {
        total: count || data?.length || 0,
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

    const supabase = await createPureClient();

    // 이력 추가
    const { data: history, error } = await supabase
      .from('tuning_history')
      .insert({
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
        metadata: {},
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(history, { status: 201 });
  } catch (error) {
    console.error('Create tuning history error:', error);
    return NextResponse.json(
      { error: 'Failed to create tuning history' },
      { status: 500 }
    );
  }
}
