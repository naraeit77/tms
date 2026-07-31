import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/db';
import { users, userProfiles, userRoles, auditLogs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { sendWelcomeEmail } from '@/lib/emails/welcome';

/**
 * POST /api/auth/signup
 * 회원가입 API
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, fullName } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: '이메일과 비밀번호를 입력해주세요.' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: '비밀번호는 최소 8자 이상이어야 합니다.' },
        { status: 400 }
      );
    }

    // 이메일 중복 체크
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: '이미 가입된 이메일입니다.' },
        { status: 400 }
      );
    }

    // 비밀번호 해싱
    const passwordHash = await bcrypt.hash(password, 12);

    // 사용자 생성
    const [newUser] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
      })
      .returning({ id: users.id, email: users.email });

    // viewer 역할 조회
    const [viewerRole] = await db
      .select({ id: userRoles.id })
      .from(userRoles)
      .where(eq(userRoles.name, 'viewer'))
      .limit(1);

    // 프로필 생성 — 신규 가입자는 30일 trial 자동 부여
    const trialExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(userProfiles).values({
      id: newUser.id,
      email: newUser.email,
      fullName: fullName || null,
      roleId: viewerRole?.id || null,
      preferences: {},
      isActive: true,
      expiresAt: trialExpiresAt,
    });

    // 감사 로그 기록
    await db.insert(auditLogs).values({
      userId: newUser.id,
      action: 'USER_SIGNUP',
      resourceType: 'user',
      details: { email, full_name: fullName },
    });

    // 환영 메일 발송 — 실패해도 가입 자체는 성공으로 처리
    let emailSent = true;
    try {
      await sendWelcomeEmail({
        email: newUser.email,
        fullName: fullName || null,
        trialExpiresAt,
      });
    } catch (mailErr) {
      emailSent = false;
      console.error('[signup] welcome email send failed:', mailErr);
    }

    return NextResponse.json(
      {
        success: true,
        message: emailSent
          ? '회원가입이 완료되었습니다. 가입한 이메일로 안내 메일을 보내드렸어요.'
          : '회원가입이 완료되었습니다. (안내 메일 발송에는 실패했어요. 잠시 후 다시 확인해 주세요.)',
        emailSent,
        user: {
          id: newUser.id,
          email: newUser.email,
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
