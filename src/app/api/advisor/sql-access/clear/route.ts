import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * POST /api/advisor/sql-access/clear
 * SQL Access Advisor 작업 목록 정리
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { connection_id, task_names } = body;

    console.log('[SQL Access Clear] Request received for connection:', connection_id);

    if (!connection_id) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    const config = await getOracleConfig(connection_id);

    // 전체 삭제 또는 특정 작업만 삭제
    let deletedCount = 0;

    // 시스템 작업 제외 목록 (삭제하면 안되는 Oracle 시스템 작업들)
    const systemTasks = [
      'SYS_AUTO_INDEX_TASK',
      'SYS_AUTO_SPM_EVOLVE_TASK',
      'SYS_AI_SPM_EVOLVE_TASK',
      'AUTO_STATS_ADVISOR_TASK',
      'INDIVIDUAL_STATS_ADVISOR_TASK',
    ];

    // 현재 사용자 조회
    let currentUser = '';
    try {
      const userResult = await executeQuery(config, 'SELECT USER FROM DUAL', []);
      currentUser = userResult.rows[0]?.USER || '';
      console.log(`[SQL Access Clear] Current user: ${currentUser}`);
    } catch {
      // 실패해도 진행
    }

    // 작업 삭제 헬퍼 함수
    const deleteTask = async (taskName: string, taskOwner?: string) => {
      if (systemTasks.includes(taskName)) {
        console.log(`[SQL Access Clear] Skipping system task: ${taskName}`);
        return false;
      }

      // 다른 사용자 소유의 작업은 건너뛰기 (ORA-13605 방지)
      if (taskOwner && currentUser && taskOwner.toUpperCase() !== currentUser.toUpperCase()) {
        console.log(`[SQL Access Clear] Skipping task owned by ${taskOwner}: ${taskName}`);
        return false;
      }

      // 연결된 워크로드 먼저 삭제
      try {
        const dropWkldSQL = `
          BEGIN
            DBMS_ADVISOR.DELETE_SQLWKLD(workload_name => :1);
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
        `;
        await executeQuery(config, dropWkldSQL, [taskName + '_WL'], { timeout: 15000 });
        console.log(`[SQL Access Clear] Deleted workload: ${taskName}_WL`);
      } catch {
        // 워크로드 삭제 실패는 무시
      }

      // 실행 중인 작업은 먼저 취소 후 삭제
      try {
        const cancelAndDeleteSQL = `
          BEGIN
            BEGIN
              DBMS_ADVISOR.CANCEL_TASK(task_name => :1);
            EXCEPTION WHEN OTHERS THEN NULL;
            END;

            DBMS_ADVISOR.DELETE_TASK(task_name => :1);
          END;
        `;
        await executeQuery(config, cancelAndDeleteSQL, [taskName], { timeout: 30000 });
        console.log(`[SQL Access Clear] Deleted task: ${taskName}`);
        return true;
      } catch (error) {
        console.error(`[SQL Access Clear] Failed to delete task ${taskName}:`, error);
        return false;
      }
    };

    if (task_names && Array.isArray(task_names) && task_names.length > 0) {
      // 특정 작업들만 삭제
      for (const taskName of task_names) {
        if (await deleteTask(taskName)) {
          deletedCount++;
        }
      }
    } else {
      // 모든 SQL Access Advisor 작업 조회 후 삭제
      // DBA_ADVISOR_TASKS 먼저 시도하고 실패 시 USER_ADVISOR_TASKS로 폴백
      // 현재 사용자 소유의 작업만 조회 (삭제 가능한 작업만)
      const dbaListQuery = `
        SELECT TASK_NAME, OWNER
        FROM DBA_ADVISOR_TASKS
        WHERE ADVISOR_NAME = 'SQL Access Advisor'
          AND OWNER = USER
      `;

      const userListQuery = `
        SELECT TASK_NAME, USER as OWNER
        FROM USER_ADVISOR_TASKS
        WHERE ADVISOR_NAME = 'SQL Access Advisor'
      `;

      let tasks: any[] = [];
      try {
        const listResult = await executeQuery(config, dbaListQuery, [], { timeout: 15000 });
        tasks = listResult.rows;
        console.log(`[SQL Access Clear] Found ${tasks.length} tasks from DBA view`);
      } catch (dbaError) {
        // DBA 뷰 실패 시 USER 뷰로 폴백
        try {
          const listResult = await executeQuery(config, userListQuery, [], { timeout: 15000 });
          tasks = listResult.rows;
          console.log(`[SQL Access Clear] Found ${tasks.length} tasks from USER view`);
        } catch (userError) {
          console.warn('[SQL Access Clear] Failed to query tasks:', dbaError, userError);
          return NextResponse.json({
            success: true,
            message: '작업 목록을 조회할 권한이 없습니다.',
            deletedCount: 0,
          });
        }
      }

      for (const task of tasks) {
        if (await deleteTask(task.TASK_NAME, task.OWNER)) {
          deletedCount++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `${deletedCount}개의 SQL Access Advisor 작업이 삭제되었습니다.`,
      deletedCount,
    });
  } catch (error) {
    console.error('SQL Access clear API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to clear SQL Access Advisor tasks',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
