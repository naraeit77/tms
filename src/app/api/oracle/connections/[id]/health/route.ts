/**
 * Oracle Connection Health Check API
 * GET: 특정 연결의 Health Check 수행
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { oracleConnections } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { healthCheck } from '@/lib/oracle';
import { getOracleConfig, invalidateConnectionCache } from '@/lib/oracle/utils';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // 캐싱된 연결 설정 가져오기
    const config = await getOracleConfig(id);

    console.log('Performing health check for connection:', {
      name: config.name,
      host: config.host,
      port: config.port,
      connectionType: config.connectionType,
    });

    const healthCheckResult = await healthCheck(config);

    console.log('Health check result:', healthCheckResult);

    // 결과 저장
    const healthStatus = healthCheckResult.isHealthy ? 'HEALTHY' : 'ERROR';

    // Health Check 업데이트 (버전 및 에디션 정보 포함)
    const updateData: Record<string, any> = {
      lastHealthCheckAt: new Date(),
      healthStatus: healthStatus,
    };

    if (healthCheckResult.isHealthy) {
      updateData.lastConnectedAt = new Date();
      updateData.oracleVersion = healthCheckResult.version;
      updateData.oracleEdition = healthCheckResult.edition || null;
    }

    try {
      await db
        .update(oracleConnections)
        .set(updateData)
        .where(eq(oracleConnections.id, id));

      // 연결 정보가 업데이트되었으므로 캐시 무효화
      invalidateConnectionCache(id);
    } catch (updateError) {
      console.error('Failed to update health check status:', updateError);
    }

    return NextResponse.json({
      data: healthCheckResult,
    });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      {
        error: 'Health check failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
