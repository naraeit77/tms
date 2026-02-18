import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * GET /api/advisor/segment
 * Segment Advisor 권장사항 조회
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
    const quickQueryOpts = { timeout: 5000 }; // 빠른 쿼리용 5초 타임아웃
    const mainQueryOpts = { timeout: 60000 }; // 메인 쿼리용 60초 타임아웃

    // Enterprise Edition 확인 (빠른 쿼리)
    const editionCheckQuery = `
      SELECT BANNER
      FROM V$VERSION
      WHERE BANNER LIKE 'Oracle%Enterprise Edition%'
    `;

    try {
      const editionResult = await executeQuery(config, editionCheckQuery, [], quickQueryOpts);
      // 결과가 없으면 Enterprise Edition이 아님
      if (!editionResult.rows || editionResult.rows.length === 0) {
        return NextResponse.json(
          {
            error: 'Segment Advisor requires Oracle Enterprise Edition with Diagnostics Pack license',
            isEnterprise: false,
          },
          { status: 403 }
        );
      }
    } catch (error) {
      // 타임아웃이나 연결 오류는 다르게 처리
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('timeout')) {
        return NextResponse.json(
          { error: `Database query timeout: ${errorMessage}` },
          { status: 504 }
        );
      }
      // V$VERSION 접근 권한 문제 등
      console.warn('[Segment Advisor] Edition check failed:', errorMessage);
      // 권한 문제일 수 있으므로 계속 진행 시도
    }

    // 실시간 세그먼트 분석 (간소화된 쿼리 - 성능 최적화)
    // DBA 권한이 없는 경우 USER_* 뷰로 fallback

    // 먼저 DBA_SEGMENTS 접근 시도, 실패시 USER_SEGMENTS 사용
    let result;
    let useDbaViews = true;

    const dbaSegmentsQuery = `
      SELECT * FROM (
        SELECT
          s.OWNER as SEGMENT_OWNER,
          s.SEGMENT_NAME,
          s.SEGMENT_TYPE,
          s.TABLESPACE_NAME,
          s.BYTES as ALLOCATED_SPACE,
          CASE
            WHEN s.SEGMENT_TYPE = 'TABLE' THEN
              NVL(t.NUM_ROWS * t.AVG_ROW_LEN, s.BYTES * 0.7)
            ELSE
              s.BYTES * 0.85
          END as USED_SPACE,
          s.BYTES - CASE
            WHEN s.SEGMENT_TYPE = 'TABLE' THEN
              NVL(t.NUM_ROWS * t.AVG_ROW_LEN, s.BYTES * 0.7)
            ELSE
              s.BYTES * 0.85
          END as RECLAIMABLE_SPACE,
          ROUND((s.BYTES - CASE
            WHEN s.SEGMENT_TYPE = 'TABLE' THEN
              NVL(t.NUM_ROWS * t.AVG_ROW_LEN, s.BYTES * 0.7)
            ELSE
              s.BYTES * 0.85
          END) / s.BYTES * 100, 2) as FRAGMENTATION,
          'ESTIMATED' as SOURCE
        FROM DBA_SEGMENTS s
        LEFT JOIN DBA_TABLES t
          ON s.OWNER = t.OWNER AND s.SEGMENT_NAME = t.TABLE_NAME AND s.SEGMENT_TYPE = 'TABLE'
        WHERE s.SEGMENT_TYPE IN ('TABLE', 'INDEX')
          AND s.OWNER NOT IN ('SYS', 'SYSTEM', 'WMSYS', 'CTXSYS', 'MDSYS', 'OLAPSYS', 'XDB', 'DBSNMP', 'SYSMAN', 'OUTLN', 'ORDSYS', 'EXFSYS')
          AND s.BYTES > 10485760
        ORDER BY RECLAIMABLE_SPACE DESC
      )
      WHERE ROWNUM <= 30 AND RECLAIMABLE_SPACE > 1048576
    `;

    const userSegmentsQuery = `
      SELECT * FROM (
        SELECT
          USER as SEGMENT_OWNER,
          s.SEGMENT_NAME,
          s.SEGMENT_TYPE,
          s.TABLESPACE_NAME,
          s.BYTES as ALLOCATED_SPACE,
          CASE
            WHEN s.SEGMENT_TYPE = 'TABLE' THEN
              NVL(t.NUM_ROWS * t.AVG_ROW_LEN, s.BYTES * 0.7)
            ELSE
              s.BYTES * 0.85
          END as USED_SPACE,
          s.BYTES - CASE
            WHEN s.SEGMENT_TYPE = 'TABLE' THEN
              NVL(t.NUM_ROWS * t.AVG_ROW_LEN, s.BYTES * 0.7)
            ELSE
              s.BYTES * 0.85
          END as RECLAIMABLE_SPACE,
          ROUND((s.BYTES - CASE
            WHEN s.SEGMENT_TYPE = 'TABLE' THEN
              NVL(t.NUM_ROWS * t.AVG_ROW_LEN, s.BYTES * 0.7)
            ELSE
              s.BYTES * 0.85
          END) / s.BYTES * 100, 2) as FRAGMENTATION,
          'ESTIMATED' as SOURCE
        FROM USER_SEGMENTS s
        LEFT JOIN USER_TABLES t
          ON s.SEGMENT_NAME = t.TABLE_NAME AND s.SEGMENT_TYPE = 'TABLE'
        WHERE s.SEGMENT_TYPE IN ('TABLE', 'INDEX')
          AND s.BYTES > 10485760
        ORDER BY RECLAIMABLE_SPACE DESC
      )
      WHERE ROWNUM <= 30 AND RECLAIMABLE_SPACE > 1048576
    `;

    try {
      result = await executeQuery(config, dbaSegmentsQuery, [], mainQueryOpts);
      console.log('[Segment Advisor] Using DBA_SEGMENTS view');
    } catch (dbaError) {
      const errorMessage = dbaError instanceof Error ? dbaError.message : 'Unknown error';
      console.log('[Segment Advisor] DBA_SEGMENTS not accessible, falling back to USER_SEGMENTS:', errorMessage);
      useDbaViews = false;
      result = await executeQuery(config, userSegmentsQuery, [], mainQueryOpts);
    }

    console.log('Segment Advisor query result:', {
      rowCount: result.rows.length,
      sampleRows: result.rows.slice(0, 3),
    });

    // 상수 정의
    const MIN_RECLAIMABLE_SPACE_MB = 1;
    const MIN_RECLAIMABLE_SPACE_BYTES = MIN_RECLAIMABLE_SPACE_MB * 1024 * 1024;

    const recommendations = result.rows
      .map((row: any) => {
        const segmentOwner = row.SEGMENT_OWNER || '';
        const segmentName = row.SEGMENT_NAME || '';
        const segmentType = row.SEGMENT_TYPE || 'TABLE';
        const allocatedSpace = Number(row.ALLOCATED_SPACE) || 0;
        const usedSpace = Number(row.USED_SPACE) || 0;
        const reclaimableSpace = Math.max(0, Number(row.RECLAIMABLE_SPACE) || 0);
        const fragmentation = Number(row.FRAGMENTATION) || 0;
        const source = row.SOURCE || 'ESTIMATED';

        // 권장사항 SQL 문장 생성
        let recommendationSQL = '';
        if (segmentType === 'TABLE' && segmentOwner && segmentName) {
          recommendationSQL =
            `-- ${segmentOwner}.${segmentName} 테이블 공간 회수\n` +
            `-- 예상 회수 공간: ${(reclaimableSpace / 1024 / 1024).toFixed(2)} MB (${source})\n` +
            `ALTER TABLE ${segmentOwner}.${segmentName} ENABLE ROW MOVEMENT;\n` +
            `ALTER TABLE ${segmentOwner}.${segmentName} SHRINK SPACE COMPACT;\n` +
            `ALTER TABLE ${segmentOwner}.${segmentName} SHRINK SPACE CASCADE;`;
        } else if (segmentType === 'INDEX' && segmentOwner && segmentName) {
          recommendationSQL =
            `-- ${segmentOwner}.${segmentName} 인덱스 공간 회수\n` +
            `-- 예상 회수 공간: ${(reclaimableSpace / 1024 / 1024).toFixed(2)} MB (${source})\n` +
            `ALTER INDEX ${segmentOwner}.${segmentName} SHRINK SPACE COMPACT;`;
        }

        return {
          segment_owner: segmentOwner,
          segment_name: segmentName,
          segment_type: segmentType,
          tablespace_name: row.TABLESPACE_NAME || 'N/A',
          allocated_space: allocatedSpace,
          used_space: usedSpace,
          reclaimable_space: reclaimableSpace,
          fragmentation: fragmentation,
          recommendation: recommendationSQL,
          source: source,
        };
      })
      .filter((rec: any) => rec.reclaimable_space > MIN_RECLAIMABLE_SPACE_BYTES);

    return NextResponse.json({
      success: true,
      data: recommendations,
      isEnterprise: true,
    });
  } catch (error) {
    console.error('Error fetching Segment Advisor data:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch segment advisor data',
      },
      { status: 500 }
    );
  }
}
