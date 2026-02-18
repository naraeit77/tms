import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * GET /api/advisor/memory
 * Memory Advisor 분석 결과 조회
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');
    const workload = searchParams.get('workload') || 'TYPICAL';

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    const config = await getOracleConfig(connectionId);

    // SGA 현재 크기 조회
    const sgaQuery = `
      SELECT
        SUM(VALUE) as CURRENT_SGA_SIZE
      FROM V$SGA
    `;

    const sgaResult = await executeQuery(config, sgaQuery);

    // PGA 현재 크기 조회
    const pgaQuery = `
      SELECT VALUE as CURRENT_PGA_SIZE
      FROM V$PGASTAT
      WHERE NAME = 'total PGA allocated'
    `;

    const pgaResult = await executeQuery(config, pgaQuery);

    // SGA/PGA Target 조회
    const targetQuery = `
      SELECT NAME, VALUE
      FROM V$PARAMETER
      WHERE NAME IN ('sga_target', 'pga_aggregate_target')
    `;

    const targetResult = await executeQuery(config, targetQuery);
    const sgaTarget = targetResult.rows.find((r: any) => r.NAME === 'sga_target')?.VALUE || 0;
    const pgaTarget = targetResult.rows.find((r: any) => r.NAME === 'pga_aggregate_target')?.VALUE || 0;

    // Hit Ratio 조회
    const hitRatioQuery = `
      SELECT
        (SELECT ROUND((1 - (phy.value / (cur.value + con.value))) * 100, 2)
         FROM v$sysstat cur, v$sysstat con, v$sysstat phy
         WHERE cur.name = 'db block gets'
           AND con.name = 'consistent gets'
           AND phy.name = 'physical reads') as BUFFER_CACHE_RATIO,
        (SELECT ROUND(SUM(pinhits) / SUM(pins) * 100, 2) FROM v$librarycache) as LIBRARY_CACHE_RATIO,
        (SELECT ROUND(SUM(gets - getmisses) / SUM(gets) * 100, 2) FROM v$rowcache) as DICTIONARY_CACHE_RATIO
      FROM DUAL
    `;

    let hitRatios = {
      buffer_cache: 0,
      library_cache: 0,
      dictionary_cache: 0
    };

    try {
      const hitRatioResult = await executeQuery(config, hitRatioQuery);
      if (hitRatioResult.rows.length > 0) {
        hitRatios = {
          buffer_cache: hitRatioResult.rows[0].BUFFER_CACHE_RATIO,
          library_cache: hitRatioResult.rows[0].LIBRARY_CACHE_RATIO,
          dictionary_cache: hitRatioResult.rows[0].DICTIONARY_CACHE_RATIO
        };
      }
    } catch (err) {
      console.warn('Failed to fetch hit ratios:', err);
    }

    // DB Cache Advice 조회
    const dbCacheAdviceQuery = `
      SELECT
        SIZE_FOR_ESTIMATE / 1024 / 1024 as SIZE_MB,
        ESTD_PHYSICAL_READS,
        SIZE_FACTOR
      FROM V$DB_CACHE_ADVICE
      WHERE NAME = 'DEFAULT'
        AND BLOCK_SIZE = (SELECT VALUE FROM V$PARAMETER WHERE NAME = 'db_block_size')
        AND ADVICE_STATUS = 'ON'
      ORDER BY SIZE_FACTOR
    `;

    let dbCacheAdvice: any[] = [];
    try {
      const cacheResult = await executeQuery(config, dbCacheAdviceQuery);
      // Baseline 찾기 (Factor = 1)
      const baseline = cacheResult.rows.find((r: any) => r.SIZE_FACTOR === 1) || cacheResult.rows[0];
      const baselineReads = baseline ? baseline.ESTD_PHYSICAL_READS : 1;

      dbCacheAdvice = cacheResult.rows.map((row: any) => ({
        size_mb: Math.round(row.SIZE_MB),
        estd_physical_reads: row.ESTD_PHYSICAL_READS,
        size_factor: row.SIZE_FACTOR,
        benefit_pct: baseline ? ((baselineReads - row.ESTD_PHYSICAL_READS) / baselineReads * 100) : 0
      }));
    } catch (error) {
      console.log('DB Cache Advice not available');
    }

    // Shared Pool Advice 조회
    const sharedPoolAdviceQuery = `
      SELECT
        SHARED_POOL_SIZE_FOR_ESTIMATE / 1024 / 1024 as SIZE_MB,
        ESTD_LC_LOAD_TIME,
        SHARED_POOL_SIZE_FACTOR as SIZE_FACTOR
      FROM V$SHARED_POOL_ADVICE
      WHERE SHARED_POOL_SIZE_FACTOR >= 0.5
        AND SHARED_POOL_SIZE_FACTOR <= 2
      ORDER BY SIZE_FACTOR
    `;

    let sharedPoolAdvice: any[] = [];
    try {
      const poolResult = await executeQuery(config, sharedPoolAdviceQuery);
      // Baseline 찾기
      const baseline = poolResult.rows.find((r: any) => r.SIZE_FACTOR === 1) || poolResult.rows[0];
      const baselineTime = baseline ? baseline.ESTD_LC_LOAD_TIME : 1;

      sharedPoolAdvice = poolResult.rows.map((row: any) => ({
        size_mb: Math.round(row.SIZE_MB),
        estd_lc_load_time: row.ESTD_LC_LOAD_TIME,
        size_factor: row.SIZE_FACTOR,
        benefit_pct: baseline ? ((baselineTime - row.ESTD_LC_LOAD_TIME) / baselineTime * 100) : 0
      }));
    } catch (error) {
      console.log('Shared Pool Advice not available');
    }

    // PGA Target Advice 조회
    const pgaTargetAdviceQuery = `
      SELECT
        PGA_TARGET_FOR_ESTIMATE / 1024 / 1024 as SIZE_MB,
        ESTD_EXTRA_BYTES_RW,
        PGA_TARGET_FACTOR as SIZE_FACTOR
      FROM V$PGA_TARGET_ADVICE
      WHERE PGA_TARGET_FACTOR >= 0.5
        AND PGA_TARGET_FACTOR <= 2
      ORDER BY SIZE_FACTOR
    `;

    let pgaTargetAdvice = [];
    try {
      const pgaAdviceResult = await executeQuery(config, pgaTargetAdviceQuery);
      pgaTargetAdvice = pgaAdviceResult.rows.map((row: any) => ({
        size_mb: Math.round(row.SIZE_MB),
        estd_extra_bytes_rw: row.ESTD_EXTRA_BYTES_RW,
        size_factor: row.SIZE_FACTOR,
      }));
    } catch (error) {
      console.log('PGA Target Advice not available');
    }

    // 권장 크기 계산 (현재 크기 기준 최적화)
    const currentSgaSize = sgaResult.rows[0]?.CURRENT_SGA_SIZE || 0;
    const currentPgaSize = pgaResult.rows[0]?.CURRENT_PGA_SIZE || 0;

    // 워크로드 타입에 따른 조정 비율
    let sgaSizeFactor = 1.0;
    let pgaSizeFactor = 1.0;

    if (workload === 'OLTP') {
      // OLTP: SGA 증가, PGA 유지
      sgaSizeFactor = 1.2;
      pgaSizeFactor = 1.0;
    } else if (workload === 'DW') {
      // DW: PGA 증가, SGA 유지
      sgaSizeFactor = 1.0;
      pgaSizeFactor = 1.5;
    }

    const recommendedSgaSize = Math.round(currentSgaSize * sgaSizeFactor);
    const recommendedPgaSize = Math.round(currentPgaSize * pgaSizeFactor);

    return NextResponse.json({
      success: true,
      data: {
        current_sga_size: currentSgaSize,
        current_pga_size: currentPgaSize,
        current_sga_target: sgaTarget,
        current_pga_target: pgaTarget,
        recommended_sga_size: recommendedSgaSize,
        recommended_pga_size: recommendedPgaSize,
        sga_size_factor: sgaSizeFactor,
        pga_size_factor: pgaSizeFactor,
        db_cache_advice: dbCacheAdvice,
        shared_pool_advice: sharedPoolAdvice,
        pga_target_advice: pgaTargetAdvice,
        hit_ratios: hitRatios,
      },
      isEnterprise: true,
    });
  } catch (error) {
    console.error('Error fetching Memory Advisor data:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch memory advisor data',
      },
      { status: 500 }
    );
  }
}
