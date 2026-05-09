/**
 * Oracle Connection Health Check API
 * GET: 본인 소유 연결의 Health Check (RLS 적용)
 */

import { NextRequest, NextResponse } from 'next/server';
import { oracleConnections } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { healthCheck } from '@/lib/oracle';
import { getOracleConfig, invalidateConnectionCache } from '@/lib/oracle/utils';
import { withSessionContext, UnauthorizedError } from '@/db/with-user';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const result = await withSessionContext(async (tx, userId) => {
      // RLS 컨텍스트 안에서 캐시/조회 — 다른 사용자 연결이면 not found
      const config = await getOracleConfig(id, userId);
      const healthCheckResult = await healthCheck(config);
      const healthStatus = healthCheckResult.isHealthy ? 'HEALTHY' : 'ERROR';

      const updateData: Record<string, unknown> = {
        lastHealthCheckAt: new Date(),
        healthStatus,
      };
      if (healthCheckResult.isHealthy) {
        updateData.lastConnectedAt = new Date();
        updateData.oracleVersion = healthCheckResult.version;
        updateData.oracleEdition = healthCheckResult.edition || null;
      }

      await tx.update(oracleConnections).set(updateData).where(eq(oracleConnections.id, id));
      return healthCheckResult;
    });

    invalidateConnectionCache(id);
    return NextResponse.json({ data: result });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }
    console.error('Health check error:', error);
    return NextResponse.json(
      { error: 'Health check failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
