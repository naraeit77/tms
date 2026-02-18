import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';
import { getConnectionEdition } from '@/lib/oracle/edition-guard-server';

/**
 * GET /api/monitoring/performance-trend
 * Oracle 실시간 성능 트렌드 데이터 조회 (Oracle 서버 시간 기준)
 *
 * 이 API는 Oracle 서버의 실제 시간을 기준으로 성능 메트릭을 반환합니다.
 * 차트에서 시간 범위를 선택할 때 Oracle 서버 시간과 일치하도록 합니다.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');
    const minutes = parseInt(searchParams.get('minutes') || '10', 10); // 기본 10분

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connectionId);

    // 쿼리 타임아웃 설정
    const queryOpts = { timeout: 5000 };

    // 에디션 정보를 먼저 조회하여 폴백 전략 결정에 사용
    const edition = await getConnectionEdition(connectionId);

    // 1. V$SYSMETRIC_HISTORY 가용성 및 최근 데이터 확인 (Realtime Metric)
    // 최근 60분 데이터는 V$SYSMETRIC_HISTORY가 가장 정확함 (1분 간격 집계됨)
    let useSysMetric = false;
    if (minutes <= 60) {
      try {
        const checkMetric = await executeQuery(config, `SELECT 1 FROM v$sysmetric_history WHERE ROWNUM = 1`, [], { timeout: 2000 });
        useSysMetric = !!checkMetric.rows && checkMetric.rows.length > 0;
      } catch (e) {
        useSysMetric = false;
      }
    }

    let trendData: any[] = [];
    let dataSource = 'unknown';

    if (useSysMetric) {
      // 전략 A: V$SYSMETRIC_HISTORY 기반 (가장 정확한 시스템 통계)
      dataSource = 'sysmetric';

      const metricQuery = `
        SELECT 
          TO_CHAR(TRUNC(begin_time, 'MI'), 'YYYY-MM-DD HH24:MI:SS') as timestamp,
          TRUNC(begin_time, 'MI') as oracle_timestamp,
          AVG(CASE WHEN metric_name = 'Executions Per Sec' THEN value ELSE 0 END) as exec_per_sec,
          AVG(CASE WHEN metric_name = 'Logical Reads Per Sec' THEN value ELSE 0 END) as logical_reads_per_sec,
          AVG(CASE WHEN metric_name = 'Physical Reads Per Sec' THEN value ELSE 0 END) as physical_reads_per_sec,
          AVG(CASE WHEN metric_name = 'CPU Usage Per Sec' THEN value ELSE 0 END) as cpu_usage_per_sec, -- CentiSeconds per Second
          AVG(CASE WHEN metric_name = 'Database Time Per Sec' THEN value ELSE 0 END) as db_time_per_sec -- CentiSeconds per Second (Approx AAS * 100)
        FROM v$sysmetric_history
        WHERE metric_name IN (
          'Executions Per Sec', 
          'Logical Reads Per Sec', 
          'Physical Reads Per Sec', 
          'CPU Usage Per Sec',
          'Database Time Per Sec'
        )
        AND begin_time >= SYSDATE - :minutes/1440
        GROUP BY TRUNC(begin_time, 'MI')
        ORDER BY TRUNC(begin_time, 'MI') DESC
      `;

      try {
        const result = await executeQuery(config, metricQuery, [minutes], queryOpts);

        // 문제 SQL 카운트를 위한 보조 쿼리 (ASH 사용)
        // ASH가 없으면 0으로 처리
        let problemSqlMap = new Map<string, number>();
        try {
          const ashQuery = `
             SELECT 
               TO_CHAR(TRUNC(sample_time, 'MI'), 'YYYY-MM-DD HH24:MI:SS') as time_bucket,
               COUNT(DISTINCT sql_id) as problem_count
             FROM v$active_session_history
             WHERE sample_time >= SYSDATE - :minutes/1440
               AND session_state = 'WAITING' 
               AND wait_class NOT IN ('Idle')
             GROUP BY TRUNC(sample_time, 'MI')
           `;
          const ashResult = await executeQuery(config, ashQuery, [minutes], { timeout: 3000 });
          ashResult.rows.forEach((r: any) => {
            problemSqlMap.set(r.TIME_BUCKET, Number(r.PROBLEM_COUNT));
          });
        } catch (e) {
          // ASH unavailable, ignore
        }

        trendData = result.rows.map((row: any) => {
          const execPerSec = Number(row.EXEC_PER_SEC) || 0;
          // 60초(1분) 동안의 총 실행 횟수
          const totalExecutions = Math.floor(execPerSec * 60);

          // 실행 1회당 평균값 계산 (총합 / 총실행횟수)
          // CPU Usage Per Sec는 csec 단위 (1 csec = 10ms).
          // 1분간 총 CPU Time (ms) = cpu_usage_per_sec * 10 * 60
          // 평균 CPU Time (ms) = (cpu_usage_per_sec * 10 * 60) / (exec_per_sec * 60) = cpu_usage_per_sec * 10 / exec_per_sec
          const avgCpuTime = execPerSec > 0 ? (Number(row.CPU_USAGE_PER_SEC) * 10) / execPerSec : 0;

          const avgBufferGets = execPerSec > 0 ? Number(row.LOGICAL_READS_PER_SEC) / execPerSec : 0;
          const avgDiskReads = execPerSec > 0 ? Number(row.PHYSICAL_READS_PER_SEC) / execPerSec : 0;

          // AAS (Average Active Sessions) = DB Time Per Sec / 100
          const activeSessions = Math.floor(Number(row.DB_TIME_PER_SEC) / 100);

          // timestamp 문자열이 oracleTimestamp로도 사용됨 (YYYY-MM-DD HH24:MI:SS 형식)
          // 클라이언트에서 시간 범위 선택 시 이 값을 사용하여 SQL 조회
          const timestampStr = row.TIMESTAMP;

          return {
            timestamp: timestampStr,
            oracleTimestamp: timestampStr, // timestamp와 동일한 문자열 사용
            avgCpuTime: avgCpuTime, // ms per execution
            avgElapsedTime: avgCpuTime * 1.5, // ESTIMATE: Elapsed ~= CPU * 1.5 (Wait 포함) - 정확한 Elapsed Per Sec 메트릭이 없다면 근사치 사용
            avgBufferGets: avgBufferGets,
            totalExecutions: totalExecutions,
            avgDiskReads: avgDiskReads,
            activeQueries: activeSessions,
            problemQueries: problemSqlMap.get(timestampStr) || 0,
            source: 'sysmetric',
            sqls: []
          };
        }).reverse(); // 최신순 -> 과거순 정렬을 그래프용 과거 -> 최신순으로 변경

      } catch (err) {
        console.error('Sysmetric query failed, falling back:', err);
        useSysMetric = false;
      }
    }

    // 폴백 전략: V$SYSMETRIC_HISTORY에서 데이터를 얻지 못한 경우
    if (trendData.length === 0) {
      // 전략 B: V$ACTIVE_SESSION_HISTORY (Enterprise Edition + Diagnostics Pack 전용)
      if (edition === 'Enterprise') {
        try {
          const ashAvailable = await executeQuery(config, `SELECT 1 FROM v$active_session_history WHERE ROWNUM = 1`, [], { timeout: 2000 })
            .then(() => true).catch(() => false);

          if (ashAvailable) {
            dataSource = 'ash';
            const timeBucketExpr = `TRUNC(sample_time, 'MI')`;
            const ashQuery = `
              SELECT * FROM (
                SELECT
                  TO_CHAR(${timeBucketExpr}, 'YYYY-MM-DD HH24:MI:SS') as timestamp,
                  COUNT(*) as sample_count,
                  SUM(CASE WHEN session_state = 'ON CPU' THEN 1 ELSE 0 END) as cpu_samples,
                  SUM(CASE WHEN session_state = 'WAITING' THEN 1 ELSE 0 END) as wait_samples,
                  COUNT(DISTINCT sql_id) as active_sqls,
                  COUNT(DISTINCT session_id) as active_sessions
                FROM v$active_session_history
                WHERE sample_time >= SYSDATE - :minutes/1440
                GROUP BY ${timeBucketExpr}
                ORDER BY ${timeBucketExpr} DESC
              ) WHERE ROWNUM <= 100
            `;
            const ashResult = await executeQuery(config, ashQuery, [minutes], queryOpts);
            if (ashResult.rows && ashResult.rows.length > 0) {
              trendData = ashResult.rows.map((row: any) => {
                const timestampStr = row.TIMESTAMP;
                return {
                  timestamp: timestampStr,
                  oracleTimestamp: timestampStr,
                  avgCpuTime: (Number(row.CPU_SAMPLES) * 1000) / (Number(row.SAMPLE_COUNT) || 1),
                  avgElapsedTime: 1000,
                  avgBufferGets: Number(row.CPU_SAMPLES) * 50,
                  totalExecutions: Number(row.SAMPLE_COUNT),
                  avgDiskReads: Number(row.WAIT_SAMPLES),
                  activeQueries: Number(row.ACTIVE_SESSIONS),
                  problemQueries: Math.floor(Number(row.WAIT_SAMPLES) / 5),
                  source: 'ash-estimate',
                  sqls: []
                };
              }).reverse();
            }
          }
        } catch (e) {
          console.log('[Performance Trend] ASH not available:', e instanceof Error ? e.message : e);
        }
      }
    }

    // 전략 C: V$SYSMETRIC 현재 메트릭 (모든 에디션, 현재 시점의 실시간 시스템 메트릭)
    if (trendData.length === 0) {
      try {
        const sysmetricQuery = `
          SELECT
            TO_CHAR(end_time, 'YYYY-MM-DD HH24:MI:SS') as timestamp,
            AVG(CASE WHEN metric_name = 'Executions Per Sec' THEN value END) as exec_per_sec,
            AVG(CASE WHEN metric_name = 'Logical Reads Per Sec' THEN value END) as logical_reads_per_sec,
            AVG(CASE WHEN metric_name = 'Physical Reads Per Sec' THEN value END) as physical_reads_per_sec,
            AVG(CASE WHEN metric_name = 'CPU Usage Per Sec' THEN value END) as cpu_usage_per_sec,
            AVG(CASE WHEN metric_name = 'Database Time Per Sec' THEN value END) as db_time_per_sec
          FROM v$sysmetric
          WHERE group_id = 2
            AND metric_name IN (
              'Executions Per Sec', 'Logical Reads Per Sec', 'Physical Reads Per Sec',
              'CPU Usage Per Sec', 'Database Time Per Sec'
            )
          GROUP BY end_time
          ORDER BY end_time DESC
        `;
        const sysmetricResult = await executeQuery(config, sysmetricQuery, [], { timeout: 3000 });
        if (sysmetricResult.rows && sysmetricResult.rows.length > 0) {
          dataSource = 'sysmetric-current';
          trendData = sysmetricResult.rows.map((row: any) => {
            const execPerSec = Number(row.EXEC_PER_SEC) || 0;
            const totalExecutions = Math.floor(execPerSec * 60);
            const avgCpuTime = execPerSec > 0 ? (Number(row.CPU_USAGE_PER_SEC) * 10) / execPerSec : 0;
            const avgBufferGets = execPerSec > 0 ? Number(row.LOGICAL_READS_PER_SEC) / execPerSec : 0;
            const avgDiskReads = execPerSec > 0 ? Number(row.PHYSICAL_READS_PER_SEC) / execPerSec : 0;
            const activeSessions = Number(row.DB_TIME_PER_SEC) / 100;
            return {
              timestamp: row.TIMESTAMP,
              oracleTimestamp: row.TIMESTAMP,
              avgCpuTime,
              avgElapsedTime: avgCpuTime * 1.5,
              avgBufferGets,
              totalExecutions,
              avgDiskReads,
              activeQueries: Math.round(activeSessions),
              problemQueries: 0,
              source: 'sysmetric-current',
              sqls: []
            };
          });
        }
      } catch (e) {
        console.log('[Performance Trend] V$SYSMETRIC not available:', e instanceof Error ? e.message : e);
      }
    }

    // 전략 D: V$SQL 시간 버킷별 집계 (모든 에디션, 최후 수단)
    if (trendData.length === 0) {
      dataSource = 'v$sql';
      console.log('[Performance Trend] Using V$SQL time-bucketed fallback');
      try {
        const sqlBucketQuery = `
          SELECT * FROM (
            SELECT
              TO_CHAR(TRUNC(last_active_time, 'MI'), 'YYYY-MM-DD HH24:MI:SS') as timestamp,
              COUNT(*) as sql_count,
              SUM(executions) as total_executions,
              ROUND(AVG(CASE WHEN executions > 0 THEN elapsed_time / executions / 1000 ELSE 0 END), 2) as avg_elapsed_ms,
              ROUND(AVG(CASE WHEN executions > 0 THEN cpu_time / executions / 1000 ELSE 0 END), 2) as avg_cpu_ms,
              ROUND(AVG(CASE WHEN executions > 0 THEN buffer_gets / executions ELSE 0 END), 2) as avg_buffer_gets,
              ROUND(AVG(CASE WHEN executions > 0 THEN disk_reads / executions ELSE 0 END), 2) as avg_disk_reads,
              COUNT(CASE WHEN executions > 0 AND elapsed_time / executions > 1000000 THEN 1 END) as problem_count
            FROM v$sql
            WHERE last_active_time >= SYSDATE - :minutes/1440
              AND parsing_schema_name NOT IN ('SYS', 'SYSTEM', 'DBSNMP', 'SYSMAN')
              AND executions > 0
            GROUP BY TRUNC(last_active_time, 'MI')
            ORDER BY TRUNC(last_active_time, 'MI') DESC
          ) WHERE ROWNUM <= 60
        `;
        const bucketResult = await executeQuery(config, sqlBucketQuery, [minutes], queryOpts);

        if (bucketResult.rows && bucketResult.rows.length > 0) {
          trendData = bucketResult.rows.map((row: any) => ({
            timestamp: row.TIMESTAMP,
            oracleTimestamp: row.TIMESTAMP,
            avgCpuTime: Number(row.AVG_CPU_MS) || 0,
            avgElapsedTime: Number(row.AVG_ELAPSED_MS) || 0,
            avgBufferGets: Number(row.AVG_BUFFER_GETS) || 0,
            totalExecutions: Number(row.TOTAL_EXECUTIONS) || 0,
            avgDiskReads: Number(row.AVG_DISK_READS) || 0,
            activeQueries: Number(row.SQL_COUNT) || 0,
            problemQueries: Number(row.PROBLEM_COUNT) || 0,
            source: 'v$sql',
            sqls: [],
          })).reverse();
        }
      } catch (e) {
        console.error('[Performance Trend] V$SQL bucket query error:', e);
      }
    }

    return NextResponse.json({
      success: true,
      data: trendData,
      serverTime: new Date(),
      source: dataSource,
      edition,
      interval: 60,
      requestedMinutes: minutes,
      count: trendData.length,
    }, {
      headers: { 'Cache-Control': 'no-store' } // Realtime data, no cache
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Performance Trend API] Error:', errorMessage);
    return NextResponse.json({
      success: false,
      error: errorMessage,
      data: []
    }, { status: 500 });
  }
}

