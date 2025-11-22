import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * GET /api/advisor/sql-access/tasks
 * SQL Access Advisor 작업 목록 조회
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
          error: 'SQL Access Advisor requires Oracle Enterprise Edition with Tuning Pack license',
          isEnterprise: false,
        },
        { status: 403 }
      );
    }

    // SQL Access Advisor 작업 목록 조회
    const query = `
      SELECT
        t.TASK_ID,
        t.TASK_NAME,
        t.DESCRIPTION,
        t.OWNER,
        t.CREATED,
        t.STATUS,
        'CURRENT' as WORKLOAD_TYPE
      FROM DBA_ADVISOR_TASKS t
      WHERE t.ADVISOR_NAME = 'SQL Access Advisor'
      ORDER BY t.CREATED DESC
    `;

    const result = await executeQuery(config, query);

    // 각 작업의 권장사항 개수 조회
    const tasksWithRecommendations = await Promise.all(
      result.rows.map(async (task: any) => {
        const recommendationQuery = `
          SELECT COUNT(*) as REC_COUNT
          FROM DBA_ADVISOR_RECOMMENDATIONS
          WHERE TASK_NAME = :task_name
        `;

        const recResult = await executeQuery(config, recommendationQuery, [task.TASK_NAME]);

        return {
          task_id: task.TASK_ID,
          task_name: task.TASK_NAME,
          description: task.DESCRIPTION,
          owner: task.OWNER,
          created: task.CREATED,
          status: task.STATUS,
          workload_type: task.WORKLOAD_TYPE,
          recommendation_count: recResult.rows[0]?.REC_COUNT || 0,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: tasksWithRecommendations,
      isEnterprise: true,
    });
  } catch (error) {
    console.error('Error fetching SQL Access Advisor tasks:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch access advisor tasks',
      },
      { status: 500 }
    );
  }
}
