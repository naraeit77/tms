// 관리자 전용 — 사용자 단건 조회/수정/삭제

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/db';
import { users, userProfiles, userRoles, auditLogs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin, AdminGuardError } from '@/lib/admin-guard';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;

    const [row] = await db
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
        role_id: userProfiles.roleId,
        role_name: userRoles.name,
        role_display_name: userRoles.displayName,
      })
      .from(userProfiles)
      .leftJoin(userRoles, eq(userProfiles.roleId, userRoles.id))
      .where(eq(userProfiles.id, id))
      .limit(1);

    if (!row) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json({ data: row });
  } catch (err) {
    if (err instanceof AdminGuardError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[admin/users/:id] GET failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, unknown> = {};
    if ('fullName' in body) updates.fullName = body.fullName || null;
    if ('department' in body) updates.department = body.department || null;
    if ('phone' in body) updates.phone = body.phone || null;
    if ('roleId' in body) updates.roleId = body.roleId || null;
    if ('isActive' in body) updates.isActive = !!body.isActive;
    if ('expiresAt' in body) {
      const parsed = parseExpiresAt(body.expiresAt);
      updates.expiresAt = parsed;
    }
    updates.updatedAt = new Date();

    if (Object.keys(updates).length === 1) {
      // updatedAt 만 있는 경우
      return NextResponse.json({ error: '변경할 필드가 없습니다.' }, { status: 400 });
    }

    // 비밀번호 재설정은 별도 처리 (선택)
    if (typeof body.password === 'string' && body.password.length > 0) {
      if (body.password.length < 8) {
        return NextResponse.json({ error: '비밀번호는 최소 8자 이상이어야 합니다.' }, { status: 400 });
      }
      const passwordHash = await bcrypt.hash(body.password, 12);
      await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, id));
    }

    const [updated] = await db
      .update(userProfiles)
      .set(updates)
      .where(eq(userProfiles.id, id))
      .returning({ id: userProfiles.id });

    if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    await db.insert(auditLogs).values({
      userId: session.user.id,
      action: 'ADMIN_USER_UPDATE',
      resourceType: 'user',
      resourceId: id,
      details: sanitizeForAudit(updates, body.password ? { passwordReset: true } : {}),
    });

    return NextResponse.json({ data: { id: updated.id } });
  } catch (err) {
    if (err instanceof AdminGuardError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[admin/users/:id] PATCH failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdmin();
    const { id } = await params;

    if (id === session.user.id) {
      return NextResponse.json({ error: '본인 계정은 삭제할 수 없습니다.' }, { status: 400 });
    }

    const [target] = await db.select({ email: users.email }).from(users).where(eq(users.id, id)).limit(1);
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // user_profiles 는 ON DELETE CASCADE → users 만 삭제하면 연쇄 정리됨
    // (oracle_connections 등 created_by FK 도 CASCADE 로 같이 정리)
    await db.delete(users).where(eq(users.id, id));

    await db.insert(auditLogs).values({
      userId: session.user.id,
      action: 'ADMIN_USER_DELETE',
      resourceType: 'user',
      resourceId: id,
      details: { email: target.email },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AdminGuardError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[admin/users/:id] DELETE failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function parseExpiresAt(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw instanceof Date) return raw;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

function sanitizeForAudit(updates: Record<string, unknown>, extras: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...extras };
  for (const [k, v] of Object.entries(updates)) {
    if (k === 'updatedAt') continue;
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}
