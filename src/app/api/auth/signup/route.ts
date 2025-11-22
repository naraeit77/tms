import { NextRequest, NextResponse } from 'next/server';
import { createAuthClient, createPureClient } from '@/lib/supabase/server';

/**
 * POST /api/auth/signup
 * 회원가입 API
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, fullName } = body;

    // 필수 필드 검증
    if (!email || !password) {
      return NextResponse.json(
        { error: '이메일과 비밀번호를 입력해주세요.' },
        { status: 400 }
      );
    }

    // 비밀번호 길이 검증
    if (password.length < 8) {
      return NextResponse.json(
        { error: '비밀번호는 최소 8자 이상이어야 합니다.' },
        { status: 400 }
      );
    }

    // Use auth client for signup (anon key)
    const authClient = await createAuthClient();

    // Supabase Auth에 사용자 생성
    const { data: authData, error: authError } = await authClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (authError) {
      // 이메일 중복 에러 처리
      if (authError.message.includes('already registered')) {
        return NextResponse.json(
          { error: '이미 가입된 이메일입니다.' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: '회원가입에 실패했습니다.' },
        { status: 500 }
      );
    }

    // Use service role client for database operations
    const supabase = await createPureClient();

    // viewer role 조회
    const { data: viewerRole } = await supabase
      .from('user_roles')
      .select('id')
      .eq('name', 'viewer')
      .single();

    // user_profiles 테이블에 프로필 생성
    const { error: profileError } = await supabase
      .from('user_profiles')
      .insert({
        id: authData.user.id,
        email: authData.user.email!,
        full_name: fullName || null,
        role_id: viewerRole?.id || null,
        preferences: {},
        is_active: true,
      });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      // 프로필 생성 실패해도 계속 진행 (authorize 시 자동 생성됨)
    }

    // audit_logs에 기록
    await supabase
      .from('audit_logs')
      .insert({
        user_id: authData.user.id,
        action: 'USER_SIGNUP',
        resource_type: 'user',
        resource_id: authData.user.id,
        details: {
          email: authData.user.email,
          full_name: fullName,
        },
      });

    // 이메일 확인이 필요한지 체크
    const emailConfirmationRequired = authData.user.email_confirmed_at === null;

    return NextResponse.json(
      {
        success: true,
        message: emailConfirmationRequired
          ? '회원가입이 완료되었습니다. 이메일을 확인해주세요.'
          : '회원가입이 완료되었습니다.',
        emailConfirmationRequired,
        user: {
          id: authData.user.id,
          email: authData.user.email,
          emailConfirmed: !emailConfirmationRequired,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: '회원가입 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
