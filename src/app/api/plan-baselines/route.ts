import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createPureClient } from '@/lib/supabase/server';

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

    const supabase = await createPureClient();
    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');

    let query = supabase
      .from('plan_baselines')
      .select('*')
      .order('created_at', { ascending: false });

    if (connectionId) {
      query = query.eq('oracle_connection_id', connectionId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch plan baselines:', error);
      return NextResponse.json(
        { error: 'Failed to fetch plan baselines' },
        { status: 500 }
      );
    }

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
    const supabase = await createPureClient();

    const { data, error } = await supabase
      .from('plan_baselines')
      .insert([body])
      .select()
      .single();

    if (error) {
      console.error('Failed to create plan baseline:', error);
      return NextResponse.json(
        { error: 'Failed to create plan baseline' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Plan baselines API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
