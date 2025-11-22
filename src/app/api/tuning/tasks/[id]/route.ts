import { NextRequest, NextResponse } from 'next/server';
import { createPureClient } from '@/lib/supabase/server';

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
    const supabase = await createPureClient();

    const { data, error } = await supabase
      .from('sql_tuning_tasks')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Tuning task not found' },
          { status: 404 }
        );
      }
      throw error;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Get tuning task error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tuning task' },
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

    const supabase = await createPureClient();

    const { data, error } = await supabase
      .from('sql_tuning_tasks')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Update tuning task error:', error);
    return NextResponse.json(
      { error: 'Failed to update tuning task' },
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
    const supabase = await createPureClient();

    const { error } = await supabase
      .from('sql_tuning_tasks')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete tuning task error:', error);
    return NextResponse.json(
      { error: 'Failed to delete tuning task' },
      { status: 500 }
    );
  }
}
