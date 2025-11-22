import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * POST /api/advisor/sql-tuning/clear
 * SQL Tuning Advisor 작업 목록 정리
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { connection_id, task_names } = body;

    console.log('[SQL Tuning Clear] Request received for connection:', connection_id);

    if (!connection_id) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    const config = await getOracleConfig(connection_id);

    // 전체 삭제 또는 특정 작업만 삭제
    let deletedCount = 0;

    if (task_names && Array.isArray(task_names) && task_names.length > 0) {
      // 특정 작업들만 삭제
      for (const taskName of task_names) {
        try {
          const dropSQL = `
            BEGIN
              DBMS_SQLTUNE.DROP_TUNING_TASK(task_name => :task_name);
            END;
          `;
          await executeQuery(config, dropSQL, { task_name: taskName });
          deletedCount++;
          console.log(`[SQL Tuning Clear] Deleted task: ${taskName}`);
        } catch (error) {
          console.error(`[SQL Tuning Clear] Failed to delete task ${taskName}:`, error);
          // 개별 작업 삭제 실패는 무시하고 계속 진행
        }
      }
    } else {
      // 모든 SQL Tuning Advisor 작업 조회 후 삭제
      // OWNER 조건을 제거하여 현재 연결된 사용자가 접근 가능한 모든 작업 조회
      const listQuery = `
        SELECT TASK_NAME, OWNER
        FROM DBA_ADVISOR_TASKS
        WHERE ADVISOR_NAME = 'SQL Tuning Advisor'
      `;

      const listResult = await executeQuery(config, listQuery);
      const tasks = listResult.rows;

      console.log(`[SQL Tuning Clear] Found ${tasks.length} tasks to delete from owners:`,
        tasks.map((t: any) => t.OWNER).join(', '));

      for (const task of tasks) {
        try {
          const dropSQL = `
            BEGIN
              DBMS_SQLTUNE.DROP_TUNING_TASK(task_name => :task_name);
            END;
          `;
          await executeQuery(config, dropSQL, { task_name: task.TASK_NAME });
          deletedCount++;
          console.log(`[SQL Tuning Clear] Deleted task: ${task.TASK_NAME}`);
        } catch (error) {
          console.error(`[SQL Tuning Clear] Failed to delete task ${task.TASK_NAME}:`, error);
          // 개별 작업 삭제 실패는 무시하고 계속 진행
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `${deletedCount}개의 SQL Tuning Advisor 작업이 삭제되었습니다.`,
      deletedCount,
    });
  } catch (error) {
    console.error('SQL Tuning clear API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to clear SQL Tuning Advisor tasks',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
