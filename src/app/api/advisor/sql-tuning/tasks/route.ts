import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * GET /api/advisor/sql-tuning/tasks
 * SQL Tuning Advisor 작업 목록 조회
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
          error: 'SQL Tuning Advisor requires Oracle Enterprise Edition with Tuning Pack license',
          isEnterprise: false,
        },
        { status: 403 }
      );
    }

    // SQL Tuning Advisor 작업 목록 조회 - USER_ADVISOR_* 뷰 사용
    // USER_ADVISOR_TASKS는 현재 사용자 소유의 작업만 표시하므로 OWNER 컬럼이 없음
    const query = `
      SELECT
        t.TASK_ID,
        t.TASK_NAME,
        t.DESCRIPTION,
        USER as OWNER,
        t.CREATED,
        t.STATUS,
        NVL(
          (SELECT COUNT(*)
           FROM USER_ADVISOR_EXECUTIONS e
           WHERE e.TASK_NAME = t.TASK_NAME),
          0
        ) as EXECUTION_COUNT
      FROM USER_ADVISOR_TASKS t
      WHERE t.ADVISOR_NAME = 'SQL Tuning Advisor'
      ORDER BY t.CREATED DESC
    `;

    console.log('[SQL Tuning Tasks] Fetching tasks...');
    const result = await executeQuery(config, query);
    console.log('[SQL Tuning Tasks] Found tasks:', result.rows?.length || 0);

    // 각 작업의 권장사항 개수 및 SQL 정보 조회
    const tasksWithRecommendations = await Promise.all(
      result.rows.map(async (task: any) => {
        // 권장사항 개수 조회
        const recommendationQuery = `
          SELECT COUNT(*) as REC_COUNT
          FROM USER_ADVISOR_FINDINGS
          WHERE TASK_NAME = :task_name
        `;

        const recResult = await executeQuery(config, recommendationQuery, [task.TASK_NAME]);
        const recCount = recResult.rows?.[0]?.REC_COUNT || 0;

        // SQL 텍스트 조회 (USER_ADVISOR_SQLSTATS 또는 USER_ADVISOR_OBJECTS 활용)
        let sqlText = null;
        let sqlId = null;
        try {
          const sqlQuery = `
            SELECT ATTR1 as SQL_TEXT, ATTR2 as SQL_ID
            FROM USER_ADVISOR_OBJECTS
            WHERE TASK_NAME = :task_name
              AND TYPE = 'SQL'
              AND ROWNUM = 1
          `;
          const sqlResult = await executeQuery(config, sqlQuery, [task.TASK_NAME]);
          if (sqlResult.rows && sqlResult.rows.length > 0) {
            sqlText = sqlResult.rows[0].SQL_TEXT;
            sqlId = sqlResult.rows[0].SQL_ID;
          }
        } catch (err) {
          console.log(`[SQL Tuning Tasks] Could not fetch SQL text for task "${task.TASK_NAME}"`);
        }

        console.log(`[SQL Tuning Tasks] Task "${task.TASK_NAME}" has ${recCount} findings`);

        return {
          task_id: task.TASK_ID,
          task_name: task.TASK_NAME,
          description: task.DESCRIPTION,
          owner: task.OWNER,
          created: task.CREATED,
          status: task.STATUS,
          execution_count: task.EXECUTION_COUNT,
          recommendation_count: recCount,
          sql_text: sqlText ? sqlText.substring(0, 200) : null,
          sql_id: sqlId,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: tasksWithRecommendations,
      isEnterprise: true,
    });
  } catch (error) {
    console.error('Error fetching SQL Tuning Advisor tasks:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch tuning tasks',
      },
      { status: 500 }
    );
  }
}
