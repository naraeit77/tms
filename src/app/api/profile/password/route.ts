import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createPureClient } from '@/lib/supabase/server';
import bcrypt from 'bcryptjs';

/**
 * PATCH /api/profile/password
 * 사용자 비밀번호 변경
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { current_password, new_password } = body;

    if (!current_password || !new_password) {
      return NextResponse.json(
        { error: 'Current password and new password are required' },
        { status: 400 }
      );
    }

    if (new_password.length < 8) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const supabase = await createPureClient();

    // 현재 사용자 정보 조회
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('password')
      .eq('email', session.user.email)
      .single();

    if (fetchError || !user) {
      console.error('Failed to fetch user:', fetchError);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 현재 비밀번호 확인
    const isPasswordValid = await bcrypt.compare(current_password, user.password);
    if (!isPasswordValid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
    }

    // 새 비밀번호 해시
    const hashedPassword = await bcrypt.hash(new_password, 10);

    // 비밀번호 업데이트
    const { error: updateError } = await supabase
      .from('users')
      .update({
        password: hashedPassword,
        updated_at: new Date().toISOString()
      })
      .eq('email', session.user.email);

    if (updateError) {
      console.error('Failed to update password:', updateError);
      return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    console.error('Password change error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
