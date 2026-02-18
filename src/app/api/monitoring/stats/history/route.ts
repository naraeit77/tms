/**
 * Statistics Collection History API
 * 통계 수집 이력 조회
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { oracleConnections, statsCollectionHistory } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    // 현재 사용자 확인 (Next-Auth 세션 사용)
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');

    if (!connectionId || connectionId === 'all') {
      return NextResponse.json({ error: 'Connection ID required' }, { status: 400 });
    }

    // Verify connection ownership
    const connections = await db
      .select({ id: oracleConnections.id })
      .from(oracleConnections)
      .where(
        and(
          eq(oracleConnections.id, connectionId),
          eq(oracleConnections.isActive, true)
        )
      )
      .limit(1);

    if (connections.length === 0) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    // Get history records
    const history = await db
      .select()
      .from(statsCollectionHistory)
      .where(eq(statsCollectionHistory.oracleConnectionId, connectionId))
      .orderBy(desc(statsCollectionHistory.createdAt))
      .limit(100);

    // Map to snake_case for frontend compatibility
    const mappedHistory = history.map((h) => ({
      id: h.id,
      oracle_connection_id: h.oracleConnectionId,
      owner: h.owner,
      table_name: h.tableName,
      operation: h.operation,
      status: h.status,
      start_time: h.startTime,
      end_time: h.endTime,
      duration_seconds: h.durationSeconds,
      error_message: h.errorMessage,
      created_at: h.createdAt,
      updated_at: h.updatedAt,
    }));

    return NextResponse.json({ data: mappedHistory });
  } catch (error: any) {
    console.error('Error fetching statistics history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch statistics history', details: error.message },
      { status: 500 }
    );
  }
}
