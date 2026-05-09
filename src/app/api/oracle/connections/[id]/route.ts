/**
 * Oracle Connection Management API
 * DELETE: 본인 소유 연결 삭제 (RLS 적용 — 다른 사용자 연결 시도 시 404)
 */

import { NextRequest, NextResponse } from 'next/server';
import { oracleConnections, auditLogs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { invalidateConnectionCache } from '@/lib/oracle/utils';
import { withSessionContext, UnauthorizedError } from '@/db/with-user';

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    const result = await withSessionContext(async (tx, userId) => {
      const [connection] = await tx
        .select({ id: oracleConnections.id, name: oracleConnections.name })
        .from(oracleConnections)
        .where(eq(oracleConnections.id, id))
        .limit(1);

      if (!connection) {
        return { ok: false as const };
      }

      await tx.delete(oracleConnections).where(eq(oracleConnections.id, id));

      await tx.insert(auditLogs).values({
        userId,
        action: 'DELETE',
        resourceType: 'oracle_connection',
        resourceId: id,
        details: { name: connection.name },
      });

      return { ok: true as const, name: connection.name };
    });

    if (!result.ok) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    invalidateConnectionCache(id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Connection delete error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
