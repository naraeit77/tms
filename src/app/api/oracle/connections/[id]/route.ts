/**
 * Oracle Connection Management API
 * DELETE: 특정 연결 삭제
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { oracleConnections, auditLogs, userProfiles } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { invalidateConnectionCache } from '@/lib/oracle/utils';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    console.log('[DELETE] Session:', session?.user?.email);

    if (!session?.user?.email) {
      console.error('[DELETE] Unauthorized - No session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    console.log('[DELETE] Deleting connection:', id);

    if (!id) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    // 연결 정보 조회
    const connectionResult = await db
      .select({ id: oracleConnections.id, name: oracleConnections.name })
      .from(oracleConnections)
      .where(eq(oracleConnections.id, id))
      .limit(1);

    if (connectionResult.length === 0) {
      console.error('[DELETE] Connection not found:', id);
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    const connection = connectionResult[0];
    console.log('[DELETE] Found connection:', connection.name);

    // 연결 삭제
    await db
      .delete(oracleConnections)
      .where(eq(oracleConnections.id, id));

    // 감사 로그 기록
    const userProfileResult = await db
      .select({ id: userProfiles.id })
      .from(userProfiles)
      .where(eq(userProfiles.email, session.user.email))
      .limit(1);

    if (userProfileResult.length > 0) {
      await db.insert(auditLogs).values({
        userId: userProfileResult[0].id,
        action: 'DELETE',
        resourceType: 'oracle_connection',
        resourceId: id,
        details: {
          name: connection.name,
        },
      });
    }

    // 연결 캐시 무효화
    invalidateConnectionCache(id);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
