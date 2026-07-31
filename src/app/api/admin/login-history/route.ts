// 관리자 전용 — 접속(로그인) 이력 조회. 가입된 모든 사용자를 대상으로 구간별 접속 횟수·접속일자 집계.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { loginHistory, userProfiles } from '@/db/schema';
import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { requireAdmin, AdminGuardError } from '@/lib/admin-guard';

export const dynamic = 'force-dynamic';

// YYYY-MM-DD 로컬 포맷
function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// from/to (YYYY-MM-DD) → [시작 00:00, 종료 익일 00:00) 반열림 구간.
// 기본값: 이번 달 1일 ~ 오늘.
function parseRange(fromRaw: string | null, toRaw: string | null) {
  const now = new Date();
  const parse = (s: string | null): Date | null =>
    s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : null;

  let start = parse(fromRaw) ?? new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  let endInclusive = parse(toRaw) ?? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  // from 이 to 보다 뒤면 스왑
  if (start.getTime() > endInclusive.getTime()) {
    [start, endInclusive] = [endInclusive, start];
  }

  const end = new Date(endInclusive);
  end.setDate(end.getDate() + 1); // 종료일 포함을 위해 익일 0시를 배타적 상한으로

  return { start, end, from: fmt(start), to: fmt(endInclusive) };
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const { start, end, from, to } = parseRange(searchParams.get('from'), searchParams.get('to'));

    // 상세 모드 — 특정 사용자의 개별 접속 레코드 (선택한 구간)
    if (email) {
      const records = await db
        .select({
          id: loginHistory.id,
          login_at: loginHistory.loginAt,
          ip_address: loginHistory.ipAddress,
          user_agent: loginHistory.userAgent,
          success: loginHistory.success,
        })
        .from(loginHistory)
        .where(
          and(
            eq(loginHistory.email, email),
            gte(loginHistory.loginAt, start),
            lt(loginHistory.loginAt, end),
          ),
        )
        .orderBy(desc(loginHistory.loginAt))
        .limit(1000);

      return NextResponse.json({ from, to, email, records });
    }

    // 요약 모드 — 가입된 모든 사용자를 기준으로 구간별 접속 집계 (접속 이력이 없는 사용자도 포함)
    const rangeFilter = sql`(${loginHistory.loginAt} >= ${start} and ${loginHistory.loginAt} < ${end})`;

    const summary = await db
      .select({
        user_id: userProfiles.id,
        email: userProfiles.email,
        full_name: userProfiles.fullName,
        department: userProfiles.department,
        is_active: userProfiles.isActive,
        range_count: sql<number>`count(${loginHistory.id}) filter (where ${rangeFilter})::int`,
        active_days: sql<number>`count(distinct date(${loginHistory.loginAt})) filter (where ${rangeFilter})::int`,
        total_count: sql<number>`count(${loginHistory.id})::int`,
        last_login_at: sql<string | null>`max(${loginHistory.loginAt})`,
      })
      .from(userProfiles)
      .leftJoin(loginHistory, eq(loginHistory.email, userProfiles.email))
      .groupBy(
        userProfiles.id,
        userProfiles.email,
        userProfiles.fullName,
        userProfiles.department,
        userProfiles.isActive,
      )
      .orderBy(
        desc(sql`count(${loginHistory.id}) filter (where ${rangeFilter})`),
        asc(userProfiles.email),
      );

    const totals = {
      registered_users: summary.length,
      active_users: summary.filter((r) => (r.range_count ?? 0) > 0).length,
      range_logins: summary.reduce((acc, r) => acc + (r.range_count ?? 0), 0),
    };

    return NextResponse.json({ from, to, summary, totals });
  } catch (err) {
    if (err instanceof AdminGuardError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[admin/login-history] GET failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
