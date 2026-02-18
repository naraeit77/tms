import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/db';
import { users, userProfiles, userRoles, auditLogs } from '@/db/schema';
import { eq } from 'drizzle-orm';

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

    // 프로필 생성
    await db.insert(userProfiles).values({
      id: newUser.id,
      email: newUser.email,
      fullName: fullName || null,
      roleId: viewerRole?.id || null,
      preferences: {},
      isActive: true,
    });

    // 감사 로그 기록
    await db.insert(auditLogs).values({
      userId: newUser.id,
      action: 'USER_SIGNUP',
      resourceType: 'user',
      details: { email, full_name: fullName },
    });

    return NextResponse.json(
      {
        success: true,
        message: '회원가입이 완료되었습니다.',
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
