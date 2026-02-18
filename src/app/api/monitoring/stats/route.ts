import 'server-only';

/**
 * Monitoring Stats API
 * GET: 전체 SQL 통계 및 분석 데이터 요약
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { oracleConnections } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

export async function GET(request: NextRequest) {
  try {
    // 현재 사용자 확인 (Next-Auth 세션 사용)
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Oracle 연결 정보 조회
    const connections = await db
      .select({
        id: oracleConnections.id,
        isActive: oracleConnections.isActive,
        healthStatus: oracleConnections.healthStatus,
      })
      .from(oracleConnections)
      .where(eq(oracleConnections.isActive, true));

    const activeConnections = connections || [];
    const healthyConnections = activeConnections.filter((c) => c.healthStatus === 'HEALTHY');

    // SQL 분석 통계 - 실제 Oracle 데이터에서 수집
    const stats = {
      totalQueries: 0,
      slowQueries: 0,
      criticalIssues: 0,
      avgResponseTime: 0,
      totalConnections: activeConnections.length,
      healthyConnections: healthyConnections.length,
    };

    // 각 활성 연결에서 실제 데이터 수집
    for (const conn of healthyConnections) {
      try {
        const config = await getOracleConfig(conn.id);

        // V$SQL에서 SQL 통계 조회
        const sqlStatsQuery = `
          SELECT
            COUNT(DISTINCT sql_id) as total_queries,
            COUNT(DISTINCT CASE WHEN elapsed_time/NULLIF(executions,0)/1000 > 1000 THEN sql_id END) as slow_queries,
            COUNT(DISTINCT CASE WHEN elapsed_time/NULLIF(executions,0)/1000 > 5000 THEN sql_id END) as critical_issues,
            ROUND(AVG(elapsed_time/NULLIF(executions,0)/1000), 2) as avg_response_time_ms
          FROM v$sql
          WHERE executions > 0
            AND last_active_time > SYSDATE - 1
        `;

        const result = await executeQuery(config, sqlStatsQuery);

        if (result.rows && result.rows.length > 0) {
          const row = result.rows[0];
          stats.totalQueries += Number(row.TOTAL_QUERIES) || 0;
          stats.slowQueries += Number(row.SLOW_QUERIES) || 0;
          stats.criticalIssues += Number(row.CRITICAL_ISSUES) || 0;
          stats.avgResponseTime += Number(row.AVG_RESPONSE_TIME_MS) || 0;
        }
      } catch (error) {
        console.error(`Failed to collect stats from connection ${conn.id}:`, error);
        // 연결 실패 시 해당 연결은 건너뛰고 계속 진행
      }
    }

    // 평균 계산 (여러 연결에서 수집한 경우)
    if (healthyConnections.length > 0 && stats.avgResponseTime > 0) {
      stats.avgResponseTime = Math.round(stats.avgResponseTime / healthyConnections.length);
    }

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Stats API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch monitoring stats' }, { status: 500 });
  }
}
