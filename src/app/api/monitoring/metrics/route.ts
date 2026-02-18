import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * 쿼리 실행 + 에러 추적 헬퍼
 * 실패 시 fallback 값을 반환하되, 실패한 쿼리명을 기록
 */
function trackedQuery<T>(
  name: string,
  queryFn: () => Promise<{ rows: T[] }>,
  fallback: { rows: T[] },
  failures: string[]
): Promise<{ rows: T[] }> {
  return queryFn().catch((err) => {
    failures.push(name);
    console.warn(`[Metrics API] Query '${name}' failed:`, err?.message || err);
    return fallback;
  });
}

/**
 * GET /api/monitoring/metrics
 * Oracle 실시간 메트릭 조회 (Dashboard용)
 * - 쿼리를 배치 그룹으로 분할하여 연결 부하 감소
 * - Oracle 11g 호환 (ROWNUM 사용, FETCH FIRST 미사용)
 * - 쿼리 실패 추적 및 프론트엔드 전달
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    const startTime = Date.now();
    console.log('[Metrics API] Fetching from Oracle directly');

    const config = await getOracleConfig(connectionId);
    const queryOpts = { timeout: 5000 };
    const failures: string[] = [];

    // ── Batch 1: 핵심 정보 (DB정보, 세션, SQL통계, 메모리, 성능통계) ──
    const [dbInfoResult, sessionResult, sqlStatsResult, memoryResult, perfStatsResult] = await Promise.all([
      trackedQuery('dbInfo', () => executeQuery(config, `
        SELECT instance_name, version, startup_time, status, database_status
        FROM v$instance
      `, [], queryOpts), { rows: [{}] as any[] }, failures),

      trackedQuery('sessions', () => executeQuery(config, `
        SELECT
          COUNT(*) as total_sessions,
          SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_sessions,
          SUM(CASE WHEN status = 'INACTIVE' THEN 1 ELSE 0 END) as inactive_sessions,
          SUM(CASE WHEN blocking_session IS NOT NULL THEN 1 ELSE 0 END) as blocked_sessions
        FROM v$session
        WHERE type = 'USER'
      `, [], queryOpts), { rows: [{ TOTAL_SESSIONS: 0, ACTIVE_SESSIONS: 0, INACTIVE_SESSIONS: 0, BLOCKED_SESSIONS: 0 }] as any[] }, failures),

      trackedQuery('sqlStats', () => executeQuery(config, `
        SELECT
          COUNT(*) as unique_sql_count,
          SUM(executions) as total_executions,
          ROUND(AVG(elapsed_time / NULLIF(executions, 0)) / 1000, 2) as avg_elapsed_time,
          ROUND(AVG(cpu_time / NULLIF(executions, 0)) / 1000, 2) as avg_cpu_time,
          ROUND(AVG(buffer_gets / NULLIF(executions, 0)), 2) as avg_buffer_gets
        FROM v$sql
        WHERE parsing_schema_name NOT IN ('SYS', 'SYSTEM')
          AND executions > 0
          AND ROWNUM <= 500
      `, [], queryOpts), { rows: [{ UNIQUE_SQL_COUNT: 0, TOTAL_EXECUTIONS: 0, AVG_ELAPSED_TIME: 0, AVG_CPU_TIME: 0, AVG_BUFFER_GETS: 0 }] as any[] }, failures),

      trackedQuery('memory', () => executeQuery(config, `
        SELECT name, ROUND(value / 1024 / 1024, 2) as size_mb
        FROM v$sga
        WHERE ROWNUM <= 4
      `, [], queryOpts), { rows: [] }, failures),

      trackedQuery('perfStats', () => executeQuery(config, `
        SELECT
          ROUND((1 - (NVL((SELECT value FROM v$sysstat WHERE name = 'physical reads'), 0)
            / NULLIF(NVL((SELECT value FROM v$sysstat WHERE name = 'db block gets'), 0)
              + NVL((SELECT value FROM v$sysstat WHERE name = 'consistent gets'), 0), 0))) * 100, 2) as buffer_cache_hit_rate,
          ROUND(
            NVL((SELECT value FROM v$sysmetric WHERE metric_name = 'User Commits Per Sec' AND group_id = 2 AND ROWNUM = 1), 0)
            + NVL((SELECT value FROM v$sysmetric WHERE metric_name = 'User Rollbacks Per Sec' AND group_id = 2 AND ROWNUM = 1), 0)
          , 2) as tps,
          NVL((SELECT SUM(value) FROM v$sysstat WHERE name IN ('user commits', 'user rollbacks')), 0) as total_transactions
        FROM dual
      `, [], queryOpts), { rows: [{ BUFFER_CACHE_HIT_RATE: 0, TPS: 0, TOTAL_TRANSACTIONS: 0 }] as any[] }, failures),
    ]);

    // ── Batch 2: I/O, 대기이벤트, Top SQL, 테이블스페이스 ──
    const [ioStatsResult, topWaitsResult, topSqlResult, tablespaceResult] = await Promise.all([
      trackedQuery('ioStats', () => executeQuery(config, `
        SELECT
          NVL(MAX(CASE WHEN metric_name = 'Physical Read Total IO Requests Per Sec' THEN value END), 0) as read_iops,
          NVL(MAX(CASE WHEN metric_name = 'Physical Write Total IO Requests Per Sec' THEN value END), 0) as write_iops,
          NVL(MAX(CASE WHEN metric_name = 'Physical Read Total Bytes Per Sec' THEN value / 1024 / 1024 END), 0) as read_mbps,
          NVL(MAX(CASE WHEN metric_name = 'Physical Write Total Bytes Per Sec' THEN value / 1024 / 1024 END), 0) as write_mbps,
          NVL(MAX(CASE WHEN metric_name = 'Physical Reads Per Sec' THEN value END), 0) as physical_reads_per_sec,
          NVL(MAX(CASE WHEN metric_name = 'Physical Writes Per Sec' THEN value END), 0) as physical_writes_per_sec,
          NVL(MAX(CASE WHEN metric_name = 'Redo Generated Per Sec' THEN value / 1024 / 1024 END), 0) as redo_mbps,
          NVL(MAX(CASE WHEN metric_name = 'DB Block Gets Per Sec' THEN value END), 0) as db_block_gets_per_sec,
          NVL(MAX(CASE WHEN metric_name = 'Consistent Read Gets Per Sec' THEN value END), 0) as consistent_gets_per_sec,
          NVL(MAX(CASE WHEN metric_name = 'Host CPU Utilization (%)' THEN value END), 0) as host_cpu_usage,
          NVL(MAX(CASE WHEN metric_name = 'Database CPU Time Ratio' THEN value END), 0) as db_cpu_usage,
          NVL(MAX(CASE WHEN metric_name = 'SQL Service Response Time' THEN value END), 0) as sql_response_time,
          NVL(MAX(CASE WHEN metric_name = 'Executions Per Sec' THEN value END), 0) as executions_per_sec,
          NVL(MAX(CASE WHEN metric_name = 'Hard Parse Count Per Sec' THEN value END), 0) as hard_parses_per_sec,
          NVL(MAX(CASE WHEN metric_name = 'Parse Count (Total) Per Sec' THEN value END), 0) as parses_per_sec
        FROM v$sysmetric
        WHERE group_id = 2
      `, [], queryOpts), { rows: [{}] as any[] }, failures),

      trackedQuery('topWaits', () => executeQuery(config, `
        SELECT event, wait_class, total_waits,
               time_waited * 10 as time_waited_ms,
               average_wait * 10 as average_wait_ms
        FROM v$system_event
        WHERE wait_class != 'Idle' AND ROWNUM <= 5
        ORDER BY time_waited DESC
      `, [], queryOpts), { rows: [] }, failures),

      trackedQuery('topSql', () => executeQuery(config, `
        SELECT sql_id, substr(sql_text, 1, 50) as sql_snippet, executions,
               ROUND(elapsed_time / NULLIF(executions, 0) / 1000, 0) as avg_elapsed_ms,
               ROUND(cpu_time / NULLIF(executions, 0) / 1000, 0) as avg_cpu_ms,
               ROUND(buffer_gets / NULLIF(executions, 0), 0) as avg_buffer_gets,
               last_active_time
        FROM (
          SELECT sql_id, sql_text, executions, elapsed_time, cpu_time, buffer_gets, last_active_time
          FROM v$sql
          WHERE parsing_schema_name NOT IN ('SYS', 'SYSTEM', 'DBSNMP', 'SYSMAN')
            AND executions > 0
            AND elapsed_time > 0
            AND last_active_time >= SYSDATE - 10/1440
          ORDER BY elapsed_time DESC
        )
        WHERE ROWNUM <= 50
      `, [], queryOpts), { rows: [] }, failures),

      // 테이블스페이스 (Oracle 12c+ 시도 → 11g 폴백)
      trackedQuery('tablespace', async () => {
        try {
          return await executeQuery(config, `
            SELECT * FROM (
              SELECT
                tablespace_name,
                ROUND(tablespace_size * (SELECT block_size FROM dba_tablespaces WHERE tablespace_name = m.tablespace_name) / 1024 / 1024, 2) as size_mb,
                ROUND(used_space * (SELECT block_size FROM dba_tablespaces WHERE tablespace_name = m.tablespace_name) / 1024 / 1024, 2) as used_mb,
                ROUND(used_percent, 2) as used_pct
              FROM dba_tablespace_usage_metrics m
              WHERE tablespace_name NOT LIKE 'UNDO%'
              ORDER BY used_percent DESC
            ) WHERE ROWNUM <= 5
          `, [], queryOpts);
        } catch {
          // Oracle 11g fallback
          return await executeQuery(config, `
            SELECT * FROM (
              SELECT
                df.tablespace_name,
                ROUND(SUM(df.bytes) / 1024 / 1024, 2) as size_mb,
                ROUND((SUM(df.bytes) - NVL(fs.free_bytes, 0)) / 1024 / 1024, 2) as used_mb,
                ROUND(((SUM(df.bytes) - NVL(fs.free_bytes, 0)) / SUM(df.bytes)) * 100, 2) as used_pct
              FROM dba_data_files df
              LEFT JOIN (
                SELECT tablespace_name, SUM(bytes) as free_bytes
                FROM dba_free_space
                GROUP BY tablespace_name
              ) fs ON df.tablespace_name = fs.tablespace_name
              WHERE df.tablespace_name NOT LIKE 'UNDO%'
              GROUP BY df.tablespace_name, fs.free_bytes
              ORDER BY used_pct DESC
            ) WHERE ROWNUM <= 5
          `, [], queryOpts);
        }
      }, { rows: [] }, failures),
    ]);

    // ── Batch 3: 부가 정보 (Wait Class, 메모리상세, 리소스제한, 블록세션) ──
    const [waitClassResult, memoryDetailResult, resourceLimitResult, blockedSessionsResult] = await Promise.all([
      trackedQuery('waitClass', () => executeQuery(config, `
        SELECT wait_class, ROUND(SUM(time_waited_micro) / 1000000, 2) as time_waited_sec
        FROM v$system_event
        WHERE wait_class != 'Idle'
        GROUP BY wait_class
        ORDER BY time_waited_sec DESC
      `, [], queryOpts), { rows: [] }, failures),

      // Oracle 11g 호환: 집계함수와 스칼라 서브쿼리 분리
      trackedQuery('memoryDetail', () => executeQuery(config, `
        SELECT
          (SELECT ROUND(SUM(CASE WHEN pool = 'shared pool' OR name LIKE 'shared%' THEN bytes ELSE 0 END) / 1024 / 1024 / 1024, 2) FROM v$sgastat) as shared_pool_gb,
          (SELECT ROUND(SUM(CASE WHEN name LIKE 'buffer%' THEN bytes ELSE 0 END) / 1024 / 1024 / 1024, 2) FROM v$sgastat) as buffer_cache_gb,
          (SELECT ROUND(SUM(bytes) / 1024 / 1024 / 1024, 2) FROM v$sgastat) as sga_used_gb,
          (SELECT ROUND(value / 1024 / 1024 / 1024, 2) FROM v$parameter WHERE name = 'sga_max_size') as sga_max_gb,
          (SELECT ROUND(value / 1024 / 1024 / 1024, 2) FROM v$pgastat WHERE name = 'total PGA allocated') as pga_used_gb,
          (SELECT ROUND(value / 1024 / 1024 / 1024, 2) FROM v$parameter WHERE name = 'pga_aggregate_limit') as pga_max_gb
        FROM dual
      `, [], queryOpts), { rows: [{}] as any[] }, failures),

      trackedQuery('resourceLimits', () => executeQuery(config, `
        SELECT resource_name, current_utilization, max_utilization, initial_allocation, limit_value
        FROM v$resource_limit
        WHERE resource_name IN ('processes', 'sessions', 'enqueue_locks', 'enqueue_resources', 'transactions')
      `, [], queryOpts), { rows: [] }, failures),

      trackedQuery('blockedSessions', () => executeQuery(config, `
        SELECT * FROM (
          SELECT
            s.sid, s.serial#, s.username, s.status, s.event as wait_event,
            s.seconds_in_wait as wait_sec, s.blocking_session as blocker,
            s.sql_id, s.module, s.action
          FROM v$session s
          WHERE s.blocking_session IS NOT NULL
            AND s.type = 'USER'
          ORDER BY s.seconds_in_wait DESC
        ) WHERE ROWNUM <= 10
      `, [], queryOpts), { rows: [] }, failures),
    ]);

    const queryTime = Date.now() - startTime;
    console.log(`[Metrics API] Oracle queries completed in ${queryTime}ms (failures: ${failures.length > 0 ? failures.join(', ') : 'none'})`);

    // 기본 데이터 추출
    const dbInfo = dbInfoResult.rows[0] || {};
    const sessionMetrics = sessionResult.rows[0] || {};
    const sqlMetrics = sqlStatsResult.rows[0] || {};
    const memoryMetrics = memoryResult.rows.reduce((acc: any, row: any) => {
      if (row.NAME) {
        acc[row.NAME.toLowerCase().replace(/ /g, '_')] = Number(row.SIZE_MB) || 0;
      }
      return acc;
    }, {});

    // 테이블스페이스 메트릭 처리
    const tablespaceMetrics = tablespaceResult.rows.map((row: any) => ({
      name: row.TABLESPACE_NAME,
      size_mb: Number(row.SIZE_MB) || 0,
      used_mb: Number(row.USED_MB) || 0,
      used_pct: Number(row.USED_PCT) || 0,
    }));

    const topWaits = topWaitsResult.rows.map((row: any) => ({
      event: row.EVENT,
      wait_class: row.WAIT_CLASS,
      total_waits: Math.floor(Number(row.TOTAL_WAITS) || 0),
      time_waited_ms: Math.floor(Number(row.TIME_WAITED_MS) || 0),
      average_wait_ms: Math.floor(Number(row.AVERAGE_WAIT_MS) || 0),
    }));

    const topSql = topSqlResult.rows.map((row: any) => {
      let sqlSnippet = row.SQL_SNIPPET;
      if (sqlSnippet && typeof sqlSnippet !== 'string') {
        if (Buffer.isBuffer(sqlSnippet)) {
          sqlSnippet = sqlSnippet.toString('utf-8');
        } else if (sqlSnippet.toString) {
          sqlSnippet = sqlSnippet.toString();
        }
      }

      return {
        sql_id: row.SQL_ID,
        sql_snippet: sqlSnippet || '',
        executions: Math.floor(Number(row.EXECUTIONS) || 0),
        avg_elapsed_ms: Math.floor(Number(row.AVG_ELAPSED_MS) || 0),
        avg_cpu_ms: Math.floor(Number(row.AVG_CPU_MS) || 0),
        avg_buffer_gets: Math.floor(Number(row.AVG_BUFFER_GETS) || 0),
      };
    });

    const perfStats = perfStatsResult.rows[0] || {};
    const bufferCacheHitRate = Number(perfStats.BUFFER_CACHE_HIT_RATE) || 0;
    const transactionTps = Number(perfStats.TPS) || 0;
    const totalTransactions = Math.floor(Number(perfStats.TOTAL_TRANSACTIONS) || 0);

    // I/O 통계 처리
    const ioStats = ioStatsResult.rows[0] || {};
    const ioMetrics = {
      read_iops: Math.floor(Number(ioStats.READ_IOPS) || 0),
      write_iops: Math.floor(Number(ioStats.WRITE_IOPS) || 0),
      read_mbps: Number(ioStats.READ_MBPS) || 0,
      write_mbps: Number(ioStats.WRITE_MBPS) || 0,
      physical_reads: Math.floor(Number(ioStats.PHYSICAL_READS_PER_SEC) || 0),
      physical_writes: Math.floor(Number(ioStats.PHYSICAL_WRITES_PER_SEC) || 0),
      redo_mbps: Number(ioStats.REDO_MBPS) || 0,
      db_block_gets: Math.floor(Number(ioStats.DB_BLOCK_GETS_PER_SEC) || 0),
      consistent_gets: Math.floor(Number(ioStats.CONSISTENT_GETS_PER_SEC) || 0),
    };

    // CPU 및 시스템 통계
    const systemStats = {
      cpu_usage: Number(ioStats.HOST_CPU_USAGE) || 0,
      db_cpu_usage: Number(ioStats.DB_CPU_USAGE) || 0,
      sql_response_time: Number(ioStats.SQL_RESPONSE_TIME) || 0,
      executions_per_sec: Math.floor(Number(ioStats.EXECUTIONS_PER_SEC) || 0),
      parses_per_sec: Math.floor(Number(ioStats.PARSES_PER_SEC) || 0),
      hard_parses_per_sec: Math.floor(Number(ioStats.HARD_PARSES_PER_SEC) || 0),
    };

    // Wait Class 집계 (Wait Events 차트용)
    const waitEvents = waitClassResult.rows.map((row: any) => ({
      name: row.WAIT_CLASS,
      value: Math.floor(Number(row.TIME_WAITED_SEC) || 0),
    }));

    // 메모리 상세 정보
    const memDetail = memoryDetailResult.rows[0] || {};
    const memoryDetailed = {
      sga_used_gb: Number(memDetail.SGA_USED_GB) || 0,
      sga_max_gb: Number(memDetail.SGA_MAX_GB) || 6,
      pga_used_gb: Number(memDetail.PGA_USED_GB) || 0,
      pga_max_gb: Number(memDetail.PGA_MAX_GB) || 3,
      shared_pool_gb: Number(memDetail.SHARED_POOL_GB) || 0,
      buffer_cache_gb: Number(memDetail.BUFFER_CACHE_GB) || 0,
    };

    // Resource Limits 처리
    const resourceLimits = resourceLimitResult.rows.map((row: any) => {
      const limitValue = row.LIMIT_VALUE === 'UNLIMITED' ? 999999 : parseInt(row.LIMIT_VALUE, 10) || 0;
      return {
        name: row.RESOURCE_NAME,
        current: parseInt(row.CURRENT_UTILIZATION, 10) || 0,
        max: parseInt(row.MAX_UTILIZATION, 10) || 0,
        limit: limitValue,
      };
    });

    // Blocked Sessions 처리
    const blockedSessions = blockedSessionsResult.rows.map((row: any) => ({
      sid: row.SID,
      serial: row['SERIAL#'],
      username: row.USERNAME,
      waitEvent: row.WAIT_EVENT,
      waitSec: parseInt(row.WAIT_SEC, 10) || 0,
      blocker: row.BLOCKER,
      sqlId: row.SQL_ID,
      module: row.MODULE,
    }));

    // 결과 구성
    const metrics = {
      database: {
        instance_name: dbInfo.INSTANCE_NAME,
        version: dbInfo.VERSION,
        startup_time: dbInfo.STARTUP_TIME,
        status: dbInfo.STATUS,
        database_status: dbInfo.DATABASE_STATUS,
      },
      sessions: {
        total: Math.floor(Number(sessionMetrics.TOTAL_SESSIONS) || 0),
        active: Math.floor(Number(sessionMetrics.ACTIVE_SESSIONS) || 0),
        inactive: Math.floor(Number(sessionMetrics.INACTIVE_SESSIONS) || 0),
        blocked: Math.floor(Number(sessionMetrics.BLOCKED_SESSIONS) || 0),
      },
      sql_statistics: {
        unique_sql_count: Math.floor(Number(sqlMetrics.UNIQUE_SQL_COUNT) || 0),
        total_executions: Math.floor(Number(sqlMetrics.TOTAL_EXECUTIONS) || 0),
        total_parse_calls: systemStats.parses_per_sec,
        avg_elapsed_time: Math.floor(Number(sqlMetrics.AVG_ELAPSED_TIME) || 0),
        avg_cpu_time: Math.floor(Number(sqlMetrics.AVG_CPU_TIME) || 0),
        avg_buffer_gets: Math.floor(Number(sqlMetrics.AVG_BUFFER_GETS) || 0),
      },
      memory: {
        ...memoryMetrics,
        ...memoryDetailed,
      },
      system: systemStats,
      io: ioMetrics,
      tablespaces: tablespaceMetrics,
      resources: resourceLimits,
      blocked_sessions: blockedSessions,
      top_waits: topWaits,
      wait_events: waitEvents,
      top_sql: topSql,
      performance: {
        buffer_cache_hit_rate: bufferCacheHitRate,
        transaction_tps: transactionTps,
        total_transactions: totalTransactions,
        db_cpu_usage: systemStats.db_cpu_usage,
      },
      timestamp: new Date().toISOString(),
    };

    console.log(`[Metrics API] Total response time: ${queryTime}ms`);

    return NextResponse.json({
      success: true,
      data: metrics,
      source: 'oracle_direct',
      responseTime: queryTime,
      // 쿼리 실패 정보 전달 (프론트엔드에서 부분 데이터 표시 가능)
      ...(failures.length > 0 && { warnings: failures, partial: true }),
    }, {
      headers: {
        // 실패한 쿼리가 있으면 캐시하지 않음
        'Cache-Control': failures.length > 0 ? 'no-store' : 'public, s-maxage=30, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error('Dashboard metrics API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard metrics' },
      { status: 500 }
    );
  }
}
