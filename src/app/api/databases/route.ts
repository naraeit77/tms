import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { oracleConnections } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    // Check authentication using Next-Auth session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      // 인증 실패 시 조용히 처리 (개발 환경에서만 로그)
      if (process.env.NODE_ENV === 'development') {
        console.debug('Database API: Authentication required');
      }
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get all active database connections
    const databases = await db
      .select({
        id: oracleConnections.id,
        name: oracleConnections.name,
        host: oracleConnections.host,
        port: oracleConnections.port,
        service_name: oracleConnections.serviceName,
        sid: oracleConnections.sid,
        username: oracleConnections.username,
        oracle_version: oracleConnections.oracleVersion,
        is_active: oracleConnections.isActive,
        health_status: oracleConnections.healthStatus,
        created_at: oracleConnections.createdAt,
      })
      .from(oracleConnections)
      .where(eq(oracleConnections.isActive, true))
      .orderBy(desc(oracleConnections.createdAt));

    return NextResponse.json({
      success: true,
      data: databases || []
    }, {
      headers: {
        'Cache-Control': 'private, s-maxage=60, stale-while-revalidate=120',
      },
    });

  } catch (error) {
    // 에러를 조용히 처리 (개발 환경에서만 출력)
    if (process.env.NODE_ENV === 'development') {
      console.debug('Database API error:', error);
    }
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
