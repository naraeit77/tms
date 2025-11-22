import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createPureClient } from '@/lib/supabase/server';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * GET /api/monitoring/metrics
 * Oracle 실시간 메트릭 조회 (Dashboard용)
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

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connectionId);

    // 1. 데이터베이스 기본 정보
    const dbInfoQuery = `
      SELECT
        instance_name,
        version,
        startup_time,
        status,
        database_status
      FROM
        v$instance
    `;

    const dbInfoResult = await executeQuery(config, dbInfoQuery);
    const dbInfo = dbInfoResult.rows[0] || {};

    // 2. 세션 통계
    const sessionQuery = `
      SELECT
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) as active_sessions,
        COUNT(CASE WHEN status = 'INACTIVE' THEN 1 END) as inactive_sessions,
        COUNT(CASE WHEN blocking_session IS NOT NULL THEN 1 END) as blocked_sessions
      FROM
        v$session
      WHERE
        type = 'USER'
    `;

    const sessionResult = await executeQuery(config, sessionQuery);
    const sessionMetrics = sessionResult.rows[0] || {};

    // 3. SQL 실행 통계
    const sqlStatsQuery = `
      SELECT
        COUNT(DISTINCT sql_id) as unique_sql_count,
        SUM(executions) as total_executions,
        AVG(elapsed_time / DECODE(executions, 0, 1, executions)) as avg_elapsed_time,
        AVG(cpu_time / DECODE(executions, 0, 1, executions)) as avg_cpu_time,
        AVG(buffer_gets / DECODE(executions, 0, 1, executions)) as avg_buffer_gets
      FROM
        v$sql
      WHERE
        parsing_schema_name NOT IN ('SYS', 'SYSTEM')
        AND sql_text NOT LIKE '%v$%'
        AND executions > 0
    `;

    const sqlStatsResult = await executeQuery(config, sqlStatsQuery);
    const sqlMetrics = sqlStatsResult.rows[0] || {};

    // 4. 메모리 사용량
    const memoryQuery = `
      SELECT
        name,
        ROUND(value / 1024 / 1024, 2) as size_mb
      FROM
        v$sga
      WHERE
        name IN ('Database Buffers', 'Redo Buffers', 'Fixed Size', 'Variable Size', 'Large Pool Size', 'Java Pool Size')
    `;

    const memoryResult = await executeQuery(config, memoryQuery);
    const memoryMetrics = memoryResult.rows.reduce((acc: any, row: any) => {
      acc[row.NAME.toLowerCase().replace(/ /g, '_')] = Number(row.SIZE_MB) || 0;
      return acc;
    }, {});

    // 5. 테이블스페이스 사용량
    const tablespaceQuery = `
      SELECT
        tablespace_name,
        ROUND(SUM(bytes) / 1024 / 1024, 2) as size_mb,
        ROUND(SUM(bytes - NVL(free_bytes, 0)) / 1024 / 1024, 2) as used_mb,
        ROUND(SUM(bytes - NVL(free_bytes, 0)) / SUM(bytes) * 100, 2) as used_pct
      FROM (
        SELECT
          df.tablespace_name,
          df.bytes,
          fs.free_bytes
        FROM
          (SELECT tablespace_name, file_id, SUM(bytes) bytes FROM dba_data_files GROUP BY tablespace_name, file_id) df
          LEFT JOIN
          (SELECT tablespace_name, file_id, SUM(bytes) free_bytes FROM dba_free_space GROUP BY tablespace_name, file_id) fs
          ON df.tablespace_name = fs.tablespace_name AND df.file_id = fs.file_id
      )
      GROUP BY tablespace_name
      ORDER BY used_pct DESC
      FETCH FIRST 5 ROWS ONLY
    `;

    let tablespaceMetrics = [];
    try {
      const tablespaceResult = await executeQuery(config, tablespaceQuery);
      tablespaceMetrics = tablespaceResult.rows.map((row: any) => ({
        name: row.TABLESPACE_NAME,
        size_mb: Number(row.SIZE_MB) || 0,
        used_mb: Number(row.USED_MB) || 0,
        used_pct: Number(row.USED_PCT) || 0,
      }));
    } catch (err) {
      console.error('Failed to get tablespace metrics:', err);
    }

    // 6. 상위 대기 이벤트
    const topWaitsQuery = `
      SELECT
        event,
        wait_class,
        total_waits,
        time_waited * 10 as time_waited_ms,
        average_wait * 10 as average_wait_ms
      FROM
        v$system_event
      WHERE
        wait_class != 'Idle'
      ORDER BY
        time_waited DESC
      FETCH FIRST 5 ROWS ONLY
    `;

    const topWaitsResult = await executeQuery(config, topWaitsQuery);
    const topWaits = topWaitsResult.rows.map((row: any) => ({
      event: row.EVENT,
      wait_class: row.WAIT_CLASS,
      total_waits: Math.floor(Number(row.TOTAL_WAITS) || 0),
      time_waited_ms: Math.floor(Number(row.TIME_WAITED_MS) || 0),
      average_wait_ms: Math.floor(Number(row.AVERAGE_WAIT_MS) || 0),
    }));

    // 7. 상위 SQL (실행 시간 기준)
    const topSqlQuery = `
      SELECT
        sql_id,
        substr(sql_text, 1, 100) as sql_snippet,
        executions,
        elapsed_time / DECODE(executions, 0, 1, executions) / 1000 as avg_elapsed_ms,
        cpu_time / DECODE(executions, 0, 1, executions) / 1000 as avg_cpu_ms,
        buffer_gets / DECODE(executions, 0, 1, executions) as avg_buffer_gets
      FROM
        v$sql
      WHERE
        parsing_schema_name NOT IN ('SYS', 'SYSTEM')
        AND sql_text NOT LIKE '%v$%'
        AND executions > 0
      ORDER BY
        elapsed_time DESC
      FETCH FIRST 10 ROWS ONLY
    `;

    const topSqlResult = await executeQuery(config, topSqlQuery);
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

    // 8. 히트 레이트 계산
    const hitRateQuery = `
      SELECT
        ROUND((1 - (physical_reads / DECODE(db_block_gets + consistent_gets, 0, 1, db_block_gets + consistent_gets))) * 100, 2) as buffer_cache_hit_rate
      FROM
        (SELECT value physical_reads FROM v$sysstat WHERE name = 'physical reads'),
        (SELECT value db_block_gets FROM v$sysstat WHERE name = 'db block gets'),
        (SELECT value consistent_gets FROM v$sysstat WHERE name = 'consistent gets')
    `;

    let bufferCacheHitRate = 0;
    try {
      const hitRateResult = await executeQuery(config, hitRateQuery);
      bufferCacheHitRate = Number(hitRateResult.rows[0]?.BUFFER_CACHE_HIT_RATE) || 0;
    } catch (err) {
      console.error('Failed to get hit rate:', err);
    }

    // 9. 트랜잭션 통계
    const transactionQuery = `
      SELECT
        SUM(value) as value
      FROM
        v$sysstat
      WHERE
        name IN ('user commits', 'user rollbacks')
    `;

    const transactionResult = await executeQuery(config, transactionQuery);
    const transactionCount = Math.floor(Number(transactionResult.rows[0]?.VALUE) || 0);

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
        avg_elapsed_time: Math.floor(Number(sqlMetrics.AVG_ELAPSED_TIME) || 0),
        avg_cpu_time: Math.floor(Number(sqlMetrics.AVG_CPU_TIME) || 0),
        avg_buffer_gets: Math.floor(Number(sqlMetrics.AVG_BUFFER_GETS) || 0),
      },
      memory: memoryMetrics,
      tablespaces: tablespaceMetrics,
      top_waits: topWaits,
      top_sql: topSql,
      performance: {
        buffer_cache_hit_rate: bufferCacheHitRate,
        transaction_count: transactionCount,
      },
      timestamp: new Date().toISOString(),
    };

    // Supabase에 메트릭 저장 (선택적)
    const supabase = await createPureClient();
    try {
      await supabase.from('dashboard_metrics').insert({
        oracle_connection_id: connectionId,
        metrics: metrics,
        collected_at: new Date().toISOString(),
      });
    } catch (saveError) {
      console.error('Failed to save dashboard metrics:', saveError);
    }

    return NextResponse.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    console.error('Dashboard metrics API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard metrics' },
      { status: 500 }
    );
  }
}