import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createPureClient } from '@/lib/supabase/server';

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
    const supabase = await createPureClient();
    const { data, error } = await supabase
      .from('plan_baselines')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Failed to fetch plan baseline:', error);
      return NextResponse.json(
        { error: 'Plan baseline not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
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
    const supabase = await createPureClient();

    const { data, error } = await supabase
      .from('plan_baselines')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Failed to update plan baseline:', error);
      return NextResponse.json(
        { error: 'Failed to update plan baseline' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
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
    const supabase = await createPureClient();
    const { error } = await supabase
      .from('plan_baselines')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Failed to delete plan baseline:', error);
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
