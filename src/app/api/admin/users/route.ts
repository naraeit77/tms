// 관리자 전용 — 사용자 목록 조회 / 신규 등록

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/db';
import { users, userProfiles, userRoles, auditLogs } from '@/db/schema';
import { eq, desc, asc } from 'drizzle-orm';
import { requireAdmin, AdminGuardError } from '@/lib/admin-guard';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    await requireAdmin();

    const rows = await db
      .select({
        id: userProfiles.id,
        email: userProfiles.email,
        full_name: userProfiles.fullName,
        department: userProfiles.department,
        phone: userProfiles.phone,
        is_active: userProfiles.isActive,
        expires_at: userProfiles.expiresAt,
        last_login_at: userProfiles.lastLoginAt,
        created_at: userProfiles.createdAt,
        updated_at: userProfiles.updatedAt,
        role_id: userProfiles.roleId,
        role_name: userRoles.name,
        role_display_name: userRoles.displayName,
      })
      .from(userProfiles)
      .leftJoin(userRoles, eq(userProfiles.roleId, userRoles.id))
      .orderBy(desc(userProfiles.createdAt));

    const roleOptions = await db
      .select({ id: userRoles.id, name: userRoles.name, display_name: userRoles.displayName })
      .from(userRoles)
      .where(eq(userRoles.isActive, true))
      .orderBy(asc(userRoles.displayName));

    return NextResponse.json({ data: rows, roles: roleOptions });
  } catch (err) {
    if (err instanceof AdminGuardError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[admin/users] GET failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin();
    const body = await request.json();
    const { email, password, fullName, roleId, expiresAt, isActive, department, phone } = body ?? {};

    if (!email || !password) {
      return NextResponse.json({ error: '이메일과 비밀번호는 필수입니다.' }, { status: 400 });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: '비밀번호는 최소 8자 이상이어야 합니다.' }, { status: 400 });
    }

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) {
      return NextResponse.json({ error: '이미 가입된 이메일입니다.' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [newUser] = await db
      .insert(users)
      .values({ email, passwordHash })
      .returning({ id: users.id, email: users.email });

    const expiresDate = parseExpiresAt(expiresAt);

    await db.insert(userProfiles).values({
      id: newUser.id,
      email: newUser.email,
      fullName: fullName || null,
      roleId: roleId || null,
      department: department || null,
      phone: phone || null,
      isActive: isActive !== false,
      expiresAt: expiresDate,
      preferences: {},
    });

    await db.insert(auditLogs).values({
      userId: session.user.id,
      action: 'ADMIN_USER_CREATE',
      resourceType: 'user',
      resourceId: newUser.id,
      details: { email: newUser.email, roleId: roleId ?? null, expiresAt: expiresDate?.toISOString() ?? null },
    });

    return NextResponse.json({ data: { id: newUser.id, email: newUser.email } }, { status: 201 });
  } catch (err) {
    if (err instanceof AdminGuardError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[admin/users] POST failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function parseExpiresAt(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw instanceof Date) return raw;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}
