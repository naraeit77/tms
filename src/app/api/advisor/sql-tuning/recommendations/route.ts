import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * GET /api/advisor/sql-tuning/recommendations
 * SQL Tuning Advisor 권장사항 조회
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');
    const taskName = searchParams.get('task_name');

    if (!connectionId || !taskName) {
      return NextResponse.json(
        { error: 'Connection ID and task name are required' },
        { status: 400 }
      );
    }

    const config = await getOracleConfig(connectionId);

    // 권장사항 조회 - USER_ADVISOR_* 뷰 사용 (일반 사용자 권한)
    // DBA_ADVISOR_* 뷰는 DBA 권한이 필요하므로 USER_ADVISOR_* 사용
    // USER_ADVISOR_RECOMMENDATIONS에는 MESSAGE 컬럼이 없으므로 BENEFIT_ERROR 사용
    const query = `
      SELECT
        f.FINDING_ID,
        f.TYPE as FINDING_TYPE,
        f.MESSAGE as FINDING_MESSAGE,
        f.IMPACT,
        f.IMPACT_TYPE,
        r.TYPE as REC_TYPE,
        r.BENEFIT as REC_BENEFIT,
        a.COMMAND as ACTION_COMMAND,
        a.MESSAGE as ACTION_MESSAGE,
        a.ATTR1,
        a.ATTR2,
        a.ATTR3,
        a.ATTR4,
        a.ATTR5
      FROM USER_ADVISOR_FINDINGS f
      LEFT JOIN USER_ADVISOR_RECOMMENDATIONS r
        ON f.TASK_NAME = r.TASK_NAME AND f.FINDING_ID = r.FINDING_ID
      LEFT JOIN USER_ADVISOR_ACTIONS a
        ON r.TASK_NAME = a.TASK_NAME AND r.REC_ID = a.REC_ID
      WHERE f.TASK_NAME = :task_name
      ORDER BY f.IMPACT DESC, f.FINDING_ID, r.REC_ID, a.ACTION_ID
    `;

    console.log('[SQL Tuning Recommendations] Querying for task:', taskName);
    const result = await executeQuery(config, query, [taskName]);
    console.log('[SQL Tuning Recommendations] Query result rows:', result.rows?.length || 0);

    // 결과 그룹화 및 구조화
    const findingsMap = new Map();

    if (result.rows && result.rows.length > 0) {
      result.rows.forEach((row: any) => {
        const findingId = row.FINDING_ID;

        if (!findingsMap.has(findingId)) {
          findingsMap.set(findingId, {
            finding_id: findingId,
            finding: row.FINDING_MESSAGE || row.FINDING_TYPE || 'No finding message',
            finding_type: row.FINDING_TYPE,
            benefit_type: row.IMPACT_TYPE || 'PERFORMANCE',
            benefit_value: Number(row.REC_BENEFIT || row.IMPACT || 0),
            impact: Number(row.IMPACT || 0),
            message: row.FINDING_MESSAGE || '',
            rec_type: row.REC_TYPE,
            actions: [],
            raw_actions: [], // 디버깅용
          });
        }

        const finding = findingsMap.get(findingId);

        // 액션 추가 (중복 제거)
        if (row.ACTION_COMMAND && !finding.actions.includes(row.ACTION_COMMAND)) {
          finding.actions.push(row.ACTION_COMMAND);
        }

        // 디버깅용 raw 액션 저장
        if (row.ACTION_COMMAND || row.ACTION_MESSAGE) {
          finding.raw_actions.push({
            command: row.ACTION_COMMAND,
            message: row.ACTION_MESSAGE,
            attr1: row.ATTR1,
            attr2: row.ATTR2,
            attr3: row.ATTR3,
          });
        }
      });
    }

    const recommendations = Array.from(findingsMap.values());

    console.log('[SQL Tuning Recommendations] Total recommendations:', recommendations.length);
    console.log('[SQL Tuning Recommendations] Sample:', recommendations[0]);

    return NextResponse.json({
      success: true,
      data: recommendations,
      count: recommendations.length,
      task_name: taskName,
    });
  } catch (error) {
    console.error('Error fetching SQL Tuning Advisor recommendations:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch recommendations',
      },
      { status: 500 }
    );
  }
}
