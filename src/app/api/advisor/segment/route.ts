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

    // Enterprise Edition 확인
    const editionCheckQuery = `
      SELECT BANNER
      FROM V$VERSION
      WHERE BANNER LIKE 'Oracle%Enterprise Edition%'
    `;

    try {
      await executeQuery(config, editionCheckQuery);
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Segment Advisor requires Oracle Enterprise Edition with Diagnostics Pack license',
          isEnterprise: false,
        },
        { status: 403 }
      );
    }

    // DBMS_ADVISOR 결과 조회 (분석 실행 후) 또는 실시간 계산 (폴백)
    // 우선순위: DBA_ADVISOR_FINDINGS > 실시간 계산
    const segmentsQuery = `
      WITH advisor_recommendations AS (
        -- DBMS_ADVISOR 분석 결과 (최근 24시간 이내)
        SELECT
          o.ATTR1 as OWNER,
          o.ATTR2 as SEGMENT_NAME,
          o.TYPE as SEGMENT_TYPE,
          s.TABLESPACE_NAME,
          s.BYTES as ALLOCATED_SPACE,
          f.MESSAGE,
          TO_NUMBER(REGEXP_SUBSTR(f.MESSAGE, '[0-9]+')) * 1024 * 1024 as RECLAIMABLE_SPACE_ADVISOR
        FROM DBA_ADVISOR_TASKS t
        JOIN DBA_ADVISOR_OBJECTS o ON t.TASK_NAME = o.TASK_NAME
        JOIN DBA_ADVISOR_FINDINGS f ON t.TASK_NAME = f.TASK_NAME AND o.OBJECT_ID = f.OBJECT_ID
        JOIN DBA_SEGMENTS s ON o.ATTR1 = s.OWNER AND o.ATTR2 = s.SEGMENT_NAME
        WHERE t.ADVISOR_NAME = 'Segment Advisor'
          AND t.STATUS = 'COMPLETED'
          AND t.CREATED >= SYSDATE - 1
          AND f.TYPE = 'RECOMMENDATION'
      ),
      realtime_calculation AS (
        -- 실시간 계산 (통계 기반)
        SELECT
          s.OWNER,
          s.SEGMENT_NAME,
          s.SEGMENT_TYPE,
          s.TABLESPACE_NAME,
          s.BYTES as ALLOCATED_SPACE,
          CASE
            WHEN s.SEGMENT_TYPE = 'TABLE' THEN
              NVL(t.NUM_ROWS * t.AVG_ROW_LEN, s.BYTES * 0.7)
            ELSE
              s.BYTES * 0.9
          END as USED_SPACE
        FROM DBA_SEGMENTS s
        LEFT JOIN DBA_TABLES t
          ON s.OWNER = t.OWNER AND s.SEGMENT_NAME = t.TABLE_NAME
        WHERE s.SEGMENT_TYPE IN ('TABLE', 'INDEX')
          AND s.OWNER NOT IN ('SYS', 'SYSTEM', 'WMSYS', 'CTXSYS', 'MDSYS', 'OLAPSYS', 'XDB')
          AND s.BYTES > 5242880
      )
      SELECT
        COALESCE(a.OWNER, r.OWNER) as SEGMENT_OWNER,
        COALESCE(a.SEGMENT_NAME, r.SEGMENT_NAME) as SEGMENT_NAME,
        COALESCE(a.SEGMENT_TYPE, r.SEGMENT_TYPE) as SEGMENT_TYPE,
        COALESCE(a.TABLESPACE_NAME, r.TABLESPACE_NAME) as TABLESPACE_NAME,
        COALESCE(a.ALLOCATED_SPACE, r.ALLOCATED_SPACE) as ALLOCATED_SPACE,
        r.USED_SPACE,
        COALESCE(a.RECLAIMABLE_SPACE_ADVISOR, GREATEST(r.ALLOCATED_SPACE - r.USED_SPACE, 0)) as RECLAIMABLE_SPACE,
        CASE
          WHEN COALESCE(a.ALLOCATED_SPACE, r.ALLOCATED_SPACE) > 0 THEN
            ROUND(COALESCE(a.RECLAIMABLE_SPACE_ADVISOR, r.ALLOCATED_SPACE - r.USED_SPACE) /
                  COALESCE(a.ALLOCATED_SPACE, r.ALLOCATED_SPACE) * 100, 2)
          ELSE 0
        END as FRAGMENTATION,
        CASE WHEN a.OWNER IS NOT NULL THEN 'ADVISOR' ELSE 'ESTIMATED' END as SOURCE
      FROM realtime_calculation r
      LEFT JOIN advisor_recommendations a
        ON r.OWNER = a.OWNER AND r.SEGMENT_NAME = a.SEGMENT_NAME
      WHERE COALESCE(a.ALLOCATED_SPACE, r.ALLOCATED_SPACE) > COALESCE(r.USED_SPACE, 0) * 1.2
      ORDER BY RECLAIMABLE_SPACE DESC
      FETCH FIRST 50 ROWS ONLY
    `;

    const result = await executeQuery(config, segmentsQuery);

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
