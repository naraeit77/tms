import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/crypto';
import { executeQuery } from '@/lib/oracle';
import type { OracleConnectionConfig } from '@/lib/oracle/types';

/**
 * GET /api/dashboard/metrics
 * 대시보드 메트릭 조회 (특정 연결 또는 전체)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');

    // 특정 연결의 실시간 메트릭을 가져오는 경우
    if (connectionId && connectionId !== 'all') {
      try {
        const { data: connection, error: connError } = await supabase
          .from('oracle_connections')
          .select('*')
          .eq('id', connectionId)
          .eq('is_active', true)
          .single();

        if (connError || !connection) {
          throw new Error('Connection not found or inactive');
        }

        const password = decrypt(connection.password_encrypted);

        const config: OracleConnectionConfig = {
          id: connection.id,
          name: connection.name,
          host: connection.host,
          port: connection.port,
          serviceName: connection.service_name || undefined,
          sid: connection.sid || undefined,
          username: connection.username,
          password,
          connectionType: connection.connection_type,
        };

        // Oracle에서 실시간 메트릭 수집
        const metricsQuery = `
          SELECT
            -- Buffer Cache Hit Ratio
            (SELECT (1 - (phy.value / (cur.value + con.value))) * 100
             FROM v$sysstat phy, v$sysstat cur, v$sysstat con
             WHERE phy.name = 'physical reads'
               AND cur.name = 'db block gets'
               AND con.name = 'consistent gets') as buffer_cache_hit_ratio,

            -- Executions per second (last snapshot)
            (SELECT value FROM v$sysstat WHERE name = 'execute count') as total_executions,

            -- Average Response Time (approximation using DB time)
            (SELECT value / 1000 FROM v$sysstat WHERE name = 'DB time') as db_time_ms,

            -- SGA Used (GB)
            (SELECT SUM(bytes) / 1024 / 1024 / 1024
             FROM v$sgastat) as sga_used_gb,

            -- Active Sessions
            (SELECT COUNT(*) FROM v$session WHERE status = 'ACTIVE' AND type = 'USER') as active_sessions
          FROM dual
        `;

        const result = await executeQuery<{
          BUFFER_CACHE_HIT_RATIO: number;
          TOTAL_EXECUTIONS: number;
          DB_TIME_MS: number;
          SGA_USED_GB: number;
          ACTIVE_SESSIONS: number;
        }>(config, metricsQuery);

        if (result.rows && result.rows.length > 0) {
          const metrics = result.rows[0];

          return NextResponse.json({
            buffer_cache_hit_ratio: Number(metrics.BUFFER_CACHE_HIT_RATIO) || 0,
            executions_per_sec: Number(metrics.TOTAL_EXECUTIONS) || 0,
            avg_response_time: Number(metrics.DB_TIME_MS) / Math.max(Number(metrics.TOTAL_EXECUTIONS), 1) || 0,
            sga_used_gb: Number(metrics.SGA_USED_GB) || 0,
            active_sessions: Number(metrics.ACTIVE_SESSIONS) || 0,
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

    // 전체 연결의 요약 메트릭 (기존 로직)
    const { data: connections, error: connError } = await supabase
      .from('oracle_connections')
      .select('id, is_active, health_status');

    if (connError) throw connError;

    const totalConnections = connections?.length || 0;
    const activeConnections =
      connections?.filter((c) => c.is_active && c.health_status === 'HEALTHY').length || 0;

    // SQL 통계 현황
    const { data: sqlStats, error: sqlError } = await supabase
      .from('sql_statistics')
      .select('id, status, priority, elapsed_time_ms, executions, buffer_gets');

    if (sqlError) throw sqlError;

    const totalSQLs = sqlStats?.length || 0;
    const criticalSQLs = sqlStats?.filter((s) => s.status === 'CRITICAL').length || 0;
    const warningSQLs = sqlStats?.filter((s) => s.status === 'WARNING').length || 0;

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
