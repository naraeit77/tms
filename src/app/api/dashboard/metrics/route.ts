import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { oracleConnections, sqlStatistics } from '@/db/schema';
import { eq, and, ne, sql } from 'drizzle-orm';
import { executeQuery } from '@/lib/oracle';
import { getOracleConfig } from '@/lib/oracle/utils';

/**
 * GET /api/dashboard/metrics
 * 대시보드 메트릭 조회 (특정 연결 또는 전체)
 */
export async function GET(request: NextRequest) {
  try {
    // 현재 사용자 확인 (Next-Auth 세션 사용)
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');

    // 특정 연결의 실시간 메트릭을 가져오는 경우
    if (connectionId && connectionId !== 'all') {
      try {
        // 캐싱된 연결 설정 가져오기
        const config = await getOracleConfig(connectionId);

        // Oracle에서 실시간 메트릭 수집 (PDB 호환 쿼리)
        const metricsQuery = `
          SELECT
            -- Buffer Cache Hit Ratio (PDB 호환: NVL로 빈 결과 처리)
            ROUND((1 - (NVL((SELECT value FROM v$sysstat WHERE name = 'physical reads'), 0)
              / NULLIF(NVL((SELECT value FROM v$sysstat WHERE name = 'db block gets'), 0)
                + NVL((SELECT value FROM v$sysstat WHERE name = 'consistent gets'), 0), 0))) * 100, 2) as buffer_cache_hit_ratio,

            -- Executions per second (last snapshot)
            NVL((SELECT value FROM v$sysstat WHERE name = 'execute count'), 0) as total_executions,

            -- Average Response Time (from v$sql - weighted average)
            NVL((SELECT
              CASE
                WHEN SUM(executions) > 0
                THEN SUM(elapsed_time) / SUM(executions) / 1000
                ELSE 0
              END
             FROM v$sql
             WHERE executions > 0
               AND ROWNUM <= 1000), 0) as avg_response_time_ms,

            -- SGA Used (GB)
            NVL((SELECT SUM(bytes) / 1024 / 1024 / 1024
             FROM v$sgastat), 0) as sga_used_gb,

            -- Active Sessions
            NVL((SELECT COUNT(*) FROM v$session WHERE status = 'ACTIVE' AND type = 'USER'), 0) as active_sessions
          FROM dual
        `;

        const result = await executeQuery<{
          BUFFER_CACHE_HIT_RATIO: number;
          TOTAL_EXECUTIONS: number;
          AVG_RESPONSE_TIME_MS: number;
          SGA_USED_GB: number;
          ACTIVE_SESSIONS: number;
        }>(config, metricsQuery);

        if (result.rows && result.rows.length > 0) {
          const metrics = result.rows[0];

          // Fallback: PostgreSQL에서 평균 응답시간 계산
          let avgResponseTime = Number(metrics.AVG_RESPONSE_TIME_MS) || 0;

          if (avgResponseTime === 0 || !Number.isFinite(avgResponseTime)) {
            // sql_statistics에서 평균 계산
            const sqlStats = await db
              .select({
                elapsed_time_ms: sqlStatistics.elapsedTimeMs,
                executions: sqlStatistics.executions,
                avg_elapsed_time_ms: sqlStatistics.avgElapsedTimeMs,
              })
              .from(sqlStatistics)
              .where(
                and(
                  eq(sqlStatistics.oracleConnectionId, connectionId),
                  ne(sqlStatistics.executions, 0)
                )
              )
              .limit(1000);

            if (sqlStats && sqlStats.length > 0) {
              // 가중 평균 계산 (실행 횟수로 가중)
              const totalExecutions = sqlStats.reduce((sum, s) => sum + (s.executions || 0), 0);
              const weightedSum = sqlStats.reduce((sum, s) => {
                const avgTime = Number(s.avg_elapsed_time_ms) || ((s.elapsed_time_ms || 0) / Math.max(s.executions || 0, 1));
                return sum + (avgTime * (s.executions || 0));
              }, 0);

              avgResponseTime = totalExecutions > 0 ? weightedSum / totalExecutions : 0;
            }
          }

          return NextResponse.json({
            buffer_cache_hit_ratio: Number(metrics.BUFFER_CACHE_HIT_RATIO) || 0,
            executions_per_sec: Number(metrics.TOTAL_EXECUTIONS) || 0,
            avg_response_time: Number.isFinite(avgResponseTime) ? Math.round(avgResponseTime) : 0,
            sga_used_gb: Number(metrics.SGA_USED_GB) || 0,
            active_sessions: Number(metrics.ACTIVE_SESSIONS) || 0,
          }, {
            headers: {
              'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=60',
            },
          });
        }
      } catch (oracleError) {
        console.error('Oracle metrics collection failed:', oracleError);
        // Oracle 연결 실패 시 기본값 반환
        return NextResponse.json({
          buffer_cache_hit_ratio: 0,
          executions_per_sec: 0,
          avg_response_time: 0,
          sga_used_gb: 0,
          active_sessions: 0,
        });
      }
    }

    // 전체 연결의 요약 메트릭 (병렬 처리로 최적화)
    const [connectionsData, sqlStatsData] = await Promise.all([
      db
        .select({
          id: oracleConnections.id,
          is_active: oracleConnections.isActive,
          health_status: oracleConnections.healthStatus,
        })
        .from(oracleConnections),
      db
        .select({
          id: sqlStatistics.id,
          status: sqlStatistics.status,
          priority: sqlStatistics.priority,
          elapsed_time_ms: sqlStatistics.elapsedTimeMs,
          executions: sqlStatistics.executions,
          buffer_gets: sqlStatistics.bufferGets,
        })
        .from(sqlStatistics)
        .limit(10000), // 성능 최적화: 제한된 수만 조회
    ]);

    const connections = connectionsData || [];
    const sqlStats = sqlStatsData || [];

    const totalConnections = connections.length;
    const activeConnections =
      connections.filter((c) => c.is_active && c.health_status === 'HEALTHY').length;

    const totalSQLs = sqlStats.length;
    const criticalSQLs = sqlStats.filter((s) => s.status === 'CRITICAL').length;
    const warningSQLs = sqlStats.filter((s) => s.status === 'WARNING').length;

    // 평균 지표 계산
    let avgElapsedTime = 0;
    let totalExecutions = 0;
    let avgBufferGets = 0;

    if (sqlStats && sqlStats.length > 0) {
      const totalElapsed = sqlStats.reduce((sum, s) => sum + (s.elapsed_time_ms || 0), 0);
      avgElapsedTime = totalElapsed / sqlStats.length;

      totalExecutions = sqlStats.reduce((sum, s) => sum + (s.executions || 0), 0);

      const totalBufferGets = sqlStats.reduce((sum, s) => sum + (s.buffer_gets || 0), 0);
      avgBufferGets = totalBufferGets / sqlStats.length;
    }

    return NextResponse.json({
      totalConnections,
      activeConnections,
      totalSQLs,
      criticalSQLs,
      warningSQLs,
      avgElapsedTime,
      totalExecutions,
      avgBufferGets,
      buffer_cache_hit_ratio: 0,
      executions_per_sec: 0,
      avg_response_time: avgElapsedTime,
      sga_used_gb: 0,
      active_sessions: 0,
    }, {
      headers: {
        'Cache-Control': 'private, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    console.error('Dashboard metrics error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch dashboard metrics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
