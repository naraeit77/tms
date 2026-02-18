import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { userProfiles } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

/**
 * GET /api/users
 * 사용자 목록 조회 (튜닝 담당자 할당용)
 */
export async function GET(request: NextRequest) {
    try {
        const users = await db
            .select({
                id: userProfiles.id,
                full_name: userProfiles.fullName,
                email: userProfiles.email,
                role_id: userProfiles.roleId,
            })
            .from(userProfiles)
            .where(eq(userProfiles.isActive, true))
            .orderBy(asc(userProfiles.fullName));

        return NextResponse.json({ data: users });
    } catch (error) {
        console.error('Failed to fetch users:', error);
        return NextResponse.json(
            { error: 'Failed to fetch users' },
            { status: 500 }
        );
    }
}
