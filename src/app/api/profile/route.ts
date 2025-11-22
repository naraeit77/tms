import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createPureClient } from '@/lib/supabase/server';

/**
 * GET /api/profile
 * 현재 사용자 프로필 조회
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createPureClient();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', session.user.email)
      .single();

    if (error) {
      console.error('Failed to fetch profile:', error);
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // 비밀번호는 제외하고 반환
    const { password, ...profile } = data;

    return NextResponse.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error('Profile API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/profile
 * 사용자 프로필 수정 (이름만 변경 가능)
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const supabase = await createPureClient();
    const { data, error } = await supabase
      .from('users')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('email', session.user.email)
      .select()
      .single();

    if (error) {
      console.error('Failed to update profile:', error);
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }

    const { password, ...profile } = data;

    return NextResponse.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
