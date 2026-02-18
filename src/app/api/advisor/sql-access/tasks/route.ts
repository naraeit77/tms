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

    // SQL Access Advisor 작업 목록 + 권장사항 개수 조회
    // DBA_ADVISOR_TASKS 먼저 시도하고 실패 시 USER_ADVISOR_TASKS로 폴백
    // 현재 사용자 소유의 작업만 표시 (삭제 가능한 작업만 보여주기 위해)
    const dbaQuery = `
      SELECT
        t.TASK_ID,
        t.TASK_NAME,
        t.DESCRIPTION,
        t.OWNER,
        t.CREATED,
        t.STATUS,
        'CURRENT' as WORKLOAD_TYPE,
        NVL(r.REC_COUNT, 0) as REC_COUNT
      FROM DBA_ADVISOR_TASKS t
      LEFT JOIN (
        SELECT TASK_NAME, OWNER, COUNT(*) as REC_COUNT
        FROM DBA_ADVISOR_RECOMMENDATIONS
        GROUP BY TASK_NAME, OWNER
      ) r ON t.TASK_NAME = r.TASK_NAME AND t.OWNER = r.OWNER
      WHERE t.ADVISOR_NAME = 'SQL Access Advisor'
        AND t.OWNER = USER
      ORDER BY t.CREATED DESC
    `;

    const userQuery = `
      SELECT
        t.TASK_ID,
        t.TASK_NAME,
        t.DESCRIPTION,
        USER as OWNER,
        t.CREATED,
        t.STATUS,
        'CURRENT' as WORKLOAD_TYPE,
        NVL(r.REC_COUNT, 0) as REC_COUNT
      FROM USER_ADVISOR_TASKS t
      LEFT JOIN (
        SELECT TASK_NAME, COUNT(*) as REC_COUNT
        FROM USER_ADVISOR_RECOMMENDATIONS
        GROUP BY TASK_NAME
      ) r ON t.TASK_NAME = r.TASK_NAME
      WHERE t.ADVISOR_NAME = 'SQL Access Advisor'
      ORDER BY t.CREATED DESC
    `;

    let result;
    try {
      result = await executeQuery(config, dbaQuery, [], { timeout: 15000 });
    } catch (dbaError) {
      // DBA 뷰 실패 시 USER 뷰로 폴백
      try {
        result = await executeQuery(config, userQuery, [], { timeout: 15000 });
      } catch (userError) {
        // 둘 다 실패하면 빈 결과 반환 (권한 부족이거나 Enterprise Edition이 아님)
        const errorMessage = userError instanceof Error ? userError.message : 'Unknown error';
        if (errorMessage.includes('ORA-00942') || errorMessage.includes('does not exist')) {
          return NextResponse.json({
            success: true,
            data: [],
            isEnterprise: false,
            message: 'SQL Access Advisor 작업을 조회할 권한이 없거나 Enterprise Edition이 아닙니다.',
          });
        }
        console.warn('[SQL Access Advisor] Failed to query tasks:', dbaError, userError);
        return NextResponse.json({
          success: true,
          data: [],
          isEnterprise: true,
          message: '작업 목록을 조회하는 중 오류가 발생했습니다.',
        });
      }
    }

    const tasksWithRecommendations = result.rows.map((task: any) => ({
      task_id: task.TASK_ID,
      task_name: task.TASK_NAME,
      description: task.DESCRIPTION,
      owner: task.OWNER,
      created: task.CREATED,
      status: task.STATUS,
      workload_type: task.WORKLOAD_TYPE,
      recommendation_count: task.REC_COUNT || 0,
    }));

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
