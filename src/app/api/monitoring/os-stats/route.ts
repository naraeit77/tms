import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * GET /api/monitoring/os-stats
 * Oracle 서버의 실제 OS 레벨 리소스 메트릭 조회
 *
 * V$OSSTAT 뷰를 사용하여 실제 운영체제 CPU, Memory 사용량을 조회합니다.
 * Linux 서버의 top 명령어와 일치하는 실제 시스템 리소스 정보를 제공합니다.
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

    const config = await getOracleConfig(connectionId);
    const queryOpts = { timeout: 5000 };

    // V$OSSTAT, V$SYSMETRIC, V$IOSTAT_FILE 순차 조회 (동시 연결 수 최소화)
    const osStatResult = await executeQuery(config, `
      SELECT stat_name, value, comments
      FROM v$osstat
      WHERE stat_name IN (
        'NUM_CPUS', 'NUM_CPU_CORES', 'NUM_CPU_SOCKETS',
        'IDLE_TIME', 'BUSY_TIME', 'USER_TIME', 'SYS_TIME',
        'IOWAIT_TIME', 'NICE_TIME',
        'PHYSICAL_MEMORY_BYTES', 'FREE_MEMORY_BYTES', 'LOAD'
      )
    `, [], queryOpts).catch((err) => {
      console.error('[OS Stats] V$OSSTAT 조회 실패:', err);
      return { rows: [] };
    });

    const sysMetricResult = await executeQuery(config, `
      SELECT metric_name, value, metric_unit
      FROM v$sysmetric
      WHERE group_id = 2
        AND metric_name IN (
          'Host CPU Utilization (%)', 'Database CPU Time Ratio',
          'CPU Usage Per Sec',
          'Physical Read Total Bytes Per Sec', 'Physical Write Total Bytes Per Sec',
          'Physical Read Total IO Requests Per Sec', 'Physical Write Total IO Requests Per Sec',
          'Network Traffic Volume Per Sec',
          'I/O Megabytes per Second', 'I/O Requests per Second'
        )
    `, [], queryOpts).catch((err) => {
      console.error('[OS Stats] V$SYSMETRIC 조회 실패:', err);
      return { rows: [] };
    });

    const ioStatResult = await executeQuery(config, `
      SELECT
        SUM(NVL(small_read_megabytes, 0) + NVL(large_read_megabytes, 0)) as total_read_mb,
        SUM(NVL(small_write_megabytes, 0) + NVL(large_write_megabytes, 0)) as total_write_mb,
        SUM(NVL(small_read_reqs, 0) + NVL(large_read_reqs, 0)) as total_read_requests,
        SUM(NVL(small_write_reqs, 0) + NVL(large_write_reqs, 0)) as total_write_requests
      FROM v$iostat_file
    `, [], queryOpts).catch((err) => {
      console.error('[OS Stats] V$IOSTAT_FILE 조회 실패:', err);
      return { rows: [{}] };
    });

    // OS 통계 파싱
    const osStats: Record<string, number> = {};
    osStatResult.rows.forEach((row: any) => {
      osStats[row.STAT_NAME] = Number(row.VALUE) || 0;
    });

    // 시스템 메트릭 파싱
    const sysMetrics: Record<string, number> = {};
    sysMetricResult.rows.forEach((row: any) => {
      sysMetrics[row.METRIC_NAME] = Number(row.VALUE) || 0;
    });

    // I/O 통계 파싱
    const ioStats = ioStatResult.rows[0] || {};

    // CPU 사용률 계산
    // V$OSSTAT의 BUSY_TIME과 IDLE_TIME은 누적값이므로
    // V$SYSMETRIC의 'Host CPU Utilization (%)'을 우선 사용
    let cpuUsagePercent = sysMetrics['Host CPU Utilization (%)'] || 0;

    // V$SYSMETRIC에서 가져오지 못한 경우 V$OSSTAT에서 계산
    if (cpuUsagePercent === 0 && osStats['BUSY_TIME'] && osStats['IDLE_TIME']) {
      const totalTime = osStats['BUSY_TIME'] + osStats['IDLE_TIME'];
      cpuUsagePercent = totalTime > 0 ? (osStats['BUSY_TIME'] / totalTime) * 100 : 0;
    }

    // 메모리 사용률 계산
    const totalMemoryBytes = osStats['PHYSICAL_MEMORY_BYTES'] || 0;
    const freeMemoryBytes = osStats['FREE_MEMORY_BYTES'] || 0;
    const usedMemoryBytes = totalMemoryBytes - freeMemoryBytes;
    const memoryUsagePercent = totalMemoryBytes > 0
      ? (usedMemoryBytes / totalMemoryBytes) * 100
      : 0;

    // I/O 사용률 (MB/s 기준)
    const ioMBPerSec = sysMetrics['I/O Megabytes per Second'] || 0;
    const ioReqPerSec = sysMetrics['I/O Requests per Second'] || 0;

    // 네트워크 트래픽 (bytes/sec to MB/s)
    const networkBytesPerSec = sysMetrics['Network Traffic Volume Per Sec'] || 0;
    const networkMBPerSec = networkBytesPerSec / 1024 / 1024;

    // I/O Wait 비율 계산
    const iowaitTime = osStats['IOWAIT_TIME'] || 0;
    const busyTime = osStats['BUSY_TIME'] || 0;
    const idleTime = osStats['IDLE_TIME'] || 0;
    const totalCpuTime = busyTime + idleTime;
    const iowaitPercent = totalCpuTime > 0 ? (iowaitTime / totalCpuTime) * 100 : 0;

    // 결과 구성
    const result = {
      // CPU 관련
      cpu: {
        usage_percent: Math.round(cpuUsagePercent * 100) / 100,  // 호스트 CPU 사용률 (%)
        num_cpus: osStats['NUM_CPUS'] || 0,
        num_cores: osStats['NUM_CPU_CORES'] || 0,
        num_sockets: osStats['NUM_CPU_SOCKETS'] || 0,
        user_time_csecs: osStats['USER_TIME'] || 0,
        sys_time_csecs: osStats['SYS_TIME'] || 0,
        idle_time_csecs: osStats['IDLE_TIME'] || 0,
        busy_time_csecs: osStats['BUSY_TIME'] || 0,
        iowait_percent: Math.round(iowaitPercent * 100) / 100,
        db_cpu_ratio: Math.round((sysMetrics['Database CPU Time Ratio'] || 0) * 100) / 100,
        load_average: osStats['LOAD'] || 0,
      },
      // 메모리 관련
      memory: {
        usage_percent: Math.round(memoryUsagePercent * 100) / 100,  // 메모리 사용률 (%)
        total_bytes: totalMemoryBytes,
        total_gb: Math.round((totalMemoryBytes / 1024 / 1024 / 1024) * 100) / 100,
        used_bytes: usedMemoryBytes,
        used_gb: Math.round((usedMemoryBytes / 1024 / 1024 / 1024) * 100) / 100,
        free_bytes: freeMemoryBytes,
        free_gb: Math.round((freeMemoryBytes / 1024 / 1024 / 1024) * 100) / 100,
      },
      // I/O 관련
      io: {
        mb_per_sec: Math.round(ioMBPerSec * 100) / 100,
        requests_per_sec: Math.round(ioReqPerSec * 100) / 100,
        read_bytes_per_sec: sysMetrics['Physical Read Total Bytes Per Sec'] || 0,
        write_bytes_per_sec: sysMetrics['Physical Write Total Bytes Per Sec'] || 0,
        read_iops: Math.round(sysMetrics['Physical Read Total IO Requests Per Sec'] || 0),
        write_iops: Math.round(sysMetrics['Physical Write Total IO Requests Per Sec'] || 0),
        total_read_mb: Math.round((Number(ioStats.TOTAL_READ_MB) || 0) * 100) / 100,
        total_write_mb: Math.round((Number(ioStats.TOTAL_WRITE_MB) || 0) * 100) / 100,
      },
      // 네트워크 관련
      network: {
        mb_per_sec: Math.round(networkMBPerSec * 100) / 100,
        bytes_per_sec: networkBytesPerSec,
      },
      // 메타 정보
      meta: {
        timestamp: new Date().toISOString(),
        source: 'oracle_v$osstat',
        has_osstat_data: osStatResult.rows.length > 0,
        has_sysmetric_data: sysMetricResult.rows.length > 0,
      }
    };

    console.log('[OS Stats] 조회 완료:', {
      cpu_usage: result.cpu.usage_percent,
      memory_usage: result.memory.usage_percent,
      io_mbps: result.io.mb_per_sec,
      has_osstat: result.meta.has_osstat_data,
      has_sysmetric: result.meta.has_sysmetric_data,
    });

    return NextResponse.json({
      success: true,
      data: result,
    }, {
      headers: {
        'Cache-Control': 'no-store', // 실시간 데이터이므로 캐시 안함
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[OS Stats API] Error:', errorMessage);
    return NextResponse.json({
      success: false,
      error: errorMessage,
      data: null,
    }, { status: 500 });
  }
}
