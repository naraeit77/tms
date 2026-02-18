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

    // Enterprise Edition 확인 (더 간단하고 빠른 쿼리 사용)
    // 타임아웃 발생 시에도 계속 진행하여 실제 사용 가능 여부를 확인
    let isEnterprise = false;
    try {
      // 방법 1: DBMS_SQLTUNE 패키지 존재 여부로 확인 (가장 정확하고 빠름)
      const packageCheckQuery = `
        SELECT COUNT(*) as CNT
        FROM ALL_OBJECTS
        WHERE OWNER = 'SYS'
        AND OBJECT_NAME = 'DBMS_SQLTUNE'
        AND OBJECT_TYPE = 'PACKAGE'
        AND ROWNUM = 1
      `;
      
      const packageResult = await executeQuery(config, packageCheckQuery, [], { timeout: 5000 });
      isEnterprise = (packageResult.rows?.[0]?.CNT || 0) > 0;
      
      if (!isEnterprise) {
        // 방법 2: V$VERSION에서 확인 (백업 방법)
        try {
          const editionCheckQuery = `
            SELECT CASE 
              WHEN UPPER(BANNER) LIKE '%ENTERPRISE%' THEN 1 
              ELSE 0 
            END as IS_ENTERPRISE
            FROM V$VERSION
            WHERE ROWNUM = 1
          `;
          const editionResult = await executeQuery(config, editionCheckQuery, [], { timeout: 5000 });
          isEnterprise = editionResult.rows?.[0]?.IS_ENTERPRISE === 1;
        } catch (versionError) {
          console.log('[SQL Tuning Tasks] Could not check V$VERSION:', versionError);
        }
      }
    } catch (error) {
      // Enterprise Edition 확인 실패 시에도 계속 진행
      // (타임아웃이 발생할 수 있으므로, 실제 USER_ADVISOR_TASKS 접근 시 에러로 판단)
      console.warn('[SQL Tuning Tasks] Enterprise Edition check failed (will check during query):', error);
      // DBMS_SQLTUNE 사용 시도 시 에러가 발생하면 그때 처리
    }

    // SQL Tuning Advisor 작업 목록 조회
    // DBA 권한이 있으면 DBA_ADVISOR_TASKS 사용, 없으면 USER_ADVISOR_TASKS로 fallback
    let result;
    let useDbaViews = false;

    // 먼저 DBA_ADVISOR_TASKS 시도 (모든 사용자의 작업 조회 가능)
    const dbaQuery = `
      SELECT
        t.TASK_ID,
        t.TASK_NAME,
        t.DESCRIPTION,
        t.OWNER,
        t.CREATED,
        t.STATUS,
        NVL(
          (SELECT COUNT(*)
           FROM DBA_ADVISOR_EXECUTIONS e
           WHERE e.TASK_NAME = t.TASK_NAME AND e.OWNER = t.OWNER),
          0
        ) as EXECUTION_COUNT
      FROM DBA_ADVISOR_TASKS t
      WHERE t.ADVISOR_NAME = 'SQL Tuning Advisor'
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

    try {
      result = await executeQuery(config, dbaQuery, [], { timeout: 15000 });
      useDbaViews = true;
    } catch (dbaError) {
      // DBA views not accessible, falling back to USER views
      try {
        result = await executeQuery(config, userQuery, [], { timeout: 15000 });
      } catch (userError) {
        // USER_ADVISOR_TASKS 접근 실패 시 Enterprise Edition이 아니거나 권한이 없을 수 있음
        const errorMessage = userError instanceof Error ? userError.message : 'Unknown error';
        if (errorMessage.includes('ORA-00942') || errorMessage.includes('does not exist')) {
          return NextResponse.json(
            {
              error: 'SQL Tuning Advisor requires Oracle Enterprise Edition with Tuning Pack license',
              isEnterprise: false,
              details: 'ADVISOR_TASKS views are not available. This usually means Enterprise Edition with Tuning Pack is not licensed.',
            },
            { status: 403 }
          );
        }
        throw userError;
      }
    }

    // 각 작업의 권장사항 개수 및 SQL 정보 조회
    const tasksWithRecommendations = await Promise.all(
      result.rows.map(async (task: any) => {
        // 권장사항 개수 조회 (DBA/USER 뷰 선택)
        const recommendationQuery = useDbaViews
          ? `SELECT COUNT(*) as REC_COUNT FROM DBA_ADVISOR_FINDINGS WHERE TASK_NAME = :task_name AND OWNER = :owner`
          : `SELECT COUNT(*) as REC_COUNT FROM USER_ADVISOR_FINDINGS WHERE TASK_NAME = :task_name`;

        let recCount = 0;
        try {
          const recParams = useDbaViews ? [task.TASK_NAME, task.OWNER] : [task.TASK_NAME];
          const recResult = await executeQuery(config, recommendationQuery, recParams, { timeout: 5000 });
          recCount = recResult.rows?.[0]?.REC_COUNT || 0;
        } catch {
          // Could not fetch recommendation count - continue with default
        }

        // SQL 텍스트 조회 (DBA/USER 뷰 선택)
        let sqlText = null;
        let sqlId = null;
        try {
          const sqlQuery = useDbaViews
            ? `SELECT ATTR1 as SQL_TEXT, ATTR2 as SQL_ID FROM DBA_ADVISOR_OBJECTS WHERE TASK_NAME = :task_name AND OWNER = :owner AND TYPE = 'SQL' AND ROWNUM = 1`
            : `SELECT ATTR1 as SQL_TEXT, ATTR2 as SQL_ID FROM USER_ADVISOR_OBJECTS WHERE TASK_NAME = :task_name AND TYPE = 'SQL' AND ROWNUM = 1`;
          const sqlParams = useDbaViews ? [task.TASK_NAME, task.OWNER] : [task.TASK_NAME];
          const sqlResult = await executeQuery(config, sqlQuery, sqlParams, { timeout: 5000 });
          if (sqlResult.rows && sqlResult.rows.length > 0) {
            sqlText = sqlResult.rows[0].SQL_TEXT;
            sqlId = sqlResult.rows[0].SQL_ID;
          }
        } catch {
          // Could not fetch SQL text - continue with null
        }

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

    return NextResponse.json(
      {
        success: true,
        data: tasksWithRecommendations,
        isEnterprise: isEnterprise,
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=30',
        },
      }
    );
  } catch (error) {
    console.error('[SQL Tuning Tasks] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch tuning tasks',
      },
      { status: 500 }
    );
  }
}
