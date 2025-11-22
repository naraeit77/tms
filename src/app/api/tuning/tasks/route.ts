import { NextRequest, NextResponse } from 'next/server';
import { createPureClient } from '@/lib/supabase/server';

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

    const supabase = await createPureClient();

    let query = supabase
      .from('sql_tuning_tasks')
      .select('*')
      .order('identified_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // 필터 적용
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (priority && priority !== 'all') {
      query = query.eq('priority', priority);
    }

    if (assignedTo) {
      query = query.eq('assigned_to', assignedTo);
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

    const supabase = await createPureClient();

    // 튜닝 태스크 생성
    const { data: task, error } = await supabase
      .from('sql_tuning_tasks')
      .insert({
        oracle_connection_id,
        sql_id,
        sql_text,
        title,
        description,
        priority,
        status: 'IDENTIFIED',
        identified_at: new Date().toISOString(),
        metadata: {},
        labels: {},
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error('Create tuning task error:', error);
    return NextResponse.json(
      { error: 'Failed to create tuning task' },
      { status: 500 }
    );
  }
}
