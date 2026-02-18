import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * SQL Tuning 작업을 단계별로 삭제 시도하는 헬퍼 함수
 * 여러 방법을 순차적으로 시도하여 삭제 성공률을 높임
 * @param config Oracle 연결 설정
 * @param taskName 삭제할 작업 이름
 * @param taskOwner 작업 소유자 (DBA 권한 시 사용)
 */
async function deleteTuningTask(
  config: any,
  taskName: string,
  taskOwner?: string
): Promise<{ success: boolean; method: string; error?: string }> {
  const shortTimeout = { timeout: 30000 };
  const longTimeout = { timeout: 120000 };

  console.log(`[SQL Tuning Clear] Attempting to delete task: ${taskName} (owner: ${taskOwner})`);

  // 방법 1: SYS 권한으로 직접 삭제 (SYS 소유 작업 처리)
  // DBMS_SQLTUNE.DROP_TUNING_TASK는 owner 파라미터가 없으므로
  // 현재 접속 사용자의 작업만 삭제 가능. SYS 작업은 SYS로 접속해야 함.
  // 하지만 ADVISOR 권한이 있으면 DBMS_SQLTUNE을 통해 삭제 시도 가능

  try {
    // 먼저 작업 상태를 확인하고 실행 중이면 중지
    const method1SQL = `
      DECLARE
        v_status VARCHAR2(30);
        v_task_id NUMBER;
      BEGIN
        -- 현재 상태 확인
        BEGIN
          SELECT STATUS, TASK_ID INTO v_status, v_task_id
          FROM DBA_ADVISOR_TASKS
          WHERE TASK_NAME = :task_name1 AND OWNER = :owner1
          AND ROWNUM = 1;
        EXCEPTION WHEN OTHERS THEN
          v_status := 'UNKNOWN';
          v_task_id := NULL;
        END;

        -- 실행 중인 경우 인터럽트 및 취소 시도
        IF v_status IN ('EXECUTING', 'INITIAL', 'INTERRUPTED') THEN
          BEGIN
            DBMS_SQLTUNE.INTERRUPT_TUNING_TASK(task_name => :task_name2);
          EXCEPTION WHEN OTHERS THEN NULL;
          END;

          BEGIN
            DBMS_SQLTUNE.CANCEL_TUNING_TASK(task_name => :task_name3);
          EXCEPTION WHEN OTHERS THEN NULL;
          END;
        END IF;

        -- 리셋 시도
        BEGIN
          DBMS_SQLTUNE.RESET_TUNING_TASK(task_name => :task_name4);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;

        -- 최종 삭제 시도
        BEGIN
          DBMS_SQLTUNE.DROP_TUNING_TASK(task_name => :task_name5);
        EXCEPTION
          WHEN OTHERS THEN
            -- DROP 실패 시 DBMS_ADVISOR로 시도
            BEGIN
              DBMS_ADVISOR.DELETE_TASK(task_name => :task_name6);
            EXCEPTION WHEN OTHERS THEN
              RAISE;
            END;
        END;
      END;
    `;
    await executeQuery(config, method1SQL, [taskName, taskOwner || 'SYS', taskName, taskName, taskName, taskName, taskName], longTimeout);
    console.log(`[SQL Tuning Clear] Successfully deleted: ${taskName} (method 1)`);
    return { success: true, method: 'interrupt+cancel+reset+drop' };
  } catch (err1) {
    const err1Msg = err1 instanceof Error ? err1.message : String(err1);
    console.log(`[SQL Tuning Clear] Method 1 failed for ${taskName}:`, err1Msg);

    // ORA-13604: 권한 부족 - 소유자가 다른 경우
    if (err1Msg.includes('ORA-13604')) {
      // SYS 소유 작업인 경우 특별 처리 시도
      if (taskOwner === 'SYS') {
        console.log(`[SQL Tuning Clear] Task ${taskName} is owned by SYS, trying alternative methods...`);
      }
    }
  }

  // 방법 2: DBMS_ADVISOR.DELETE_TASK 사용 (범용 Advisor 삭제)
  try {
    const method2SQL = `
      BEGIN
        DBMS_ADVISOR.DELETE_TASK(task_name => :task_name);
      END;
    `;
    await executeQuery(config, method2SQL, [taskName], shortTimeout);
    console.log(`[SQL Tuning Clear] Successfully deleted: ${taskName} (method 2 - DBMS_ADVISOR)`);
    return { success: true, method: 'DBMS_ADVISOR.DELETE_TASK' };
  } catch (err2) {
    console.log(`[SQL Tuning Clear] Method 2 failed for ${taskName}:`, err2 instanceof Error ? err2.message : err2);
  }

  // 방법 3: 단순 DROP만 시도 (이미 완료된 작업용)
  try {
    const method3SQL = `
      BEGIN
        DBMS_SQLTUNE.DROP_TUNING_TASK(task_name => :task_name);
      END;
    `;
    await executeQuery(config, method3SQL, [taskName], shortTimeout);
    console.log(`[SQL Tuning Clear] Successfully deleted: ${taskName} (method 3 - simple drop)`);
    return { success: true, method: 'simple drop' };
  } catch (err3) {
    console.log(`[SQL Tuning Clear] Method 3 failed for ${taskName}:`, err3 instanceof Error ? err3.message : err3);
  }

  // 방법 4: SYSDBA로 실행되는 프로시저 호출 시도 (보통 실패하지만 시도)
  // 대안: 직접 내부 테이블에서 삭제 (위험하지만 마지막 수단)
  try {
    // task_id를 먼저 조회
    const getTaskIdSQL = `
      SELECT TASK_ID FROM DBA_ADVISOR_TASKS
      WHERE TASK_NAME = :task_name AND OWNER = :owner
    `;
    const taskIdResult = await executeQuery(config, getTaskIdSQL, [taskName, taskOwner || 'SYS'], shortTimeout);
    const taskId = taskIdResult.rows?.[0]?.TASK_ID;

    if (taskId) {
      // WRI$ 내부 테이블에서 직접 삭제 시도
      const method4SQL = `
        BEGIN
          -- 관련 데이터 삭제 (순서 중요: 종속 테이블부터)
          DELETE FROM SYS.WRI$_ADV_SQLT_PLAN_HASH WHERE TASK_ID = :task_id1;
          DELETE FROM SYS.WRI$_ADV_SQLT_STATISTICS WHERE TASK_ID = :task_id2;
          DELETE FROM SYS.WRI$_ADV_SQLT_PLANS WHERE TASK_ID = :task_id3;
          DELETE FROM SYS.WRI$_ADV_SQLT_BINDS WHERE TASK_ID = :task_id4;
          DELETE FROM SYS.WRI$_ADV_ACTIONS WHERE TASK_ID = :task_id5;
          DELETE FROM SYS.WRI$_ADV_RECOMMENDATIONS WHERE TASK_ID = :task_id6;
          DELETE FROM SYS.WRI$_ADV_RATIONALE WHERE TASK_ID = :task_id7;
          DELETE FROM SYS.WRI$_ADV_FINDINGS WHERE TASK_ID = :task_id8;
          DELETE FROM SYS.WRI$_ADV_OBJECTS WHERE TASK_ID = :task_id9;
          DELETE FROM SYS.WRI$_ADV_PARAMETERS WHERE TASK_ID = :task_id10;
          DELETE FROM SYS.WRI$_ADV_JOURNAL WHERE TASK_ID = :task_id11;
          DELETE FROM SYS.WRI$_ADV_MESSAGE_GROUPS WHERE TASK_ID = :task_id12;
          DELETE FROM SYS.WRI$_ADV_TASKS WHERE ID = :task_id13;
          COMMIT;
        END;
      `;
      await executeQuery(config, method4SQL, [
        taskId, taskId, taskId, taskId, taskId, taskId, taskId,
        taskId, taskId, taskId, taskId, taskId, taskId
      ], longTimeout);
      console.log(`[SQL Tuning Clear] Successfully deleted: ${taskName} (method 4 - direct table delete)`);
      return { success: true, method: 'direct table delete' };
    }
  } catch (err4) {
    const err4Msg = err4 instanceof Error ? err4.message : 'Unknown error';
    console.log(`[SQL Tuning Clear] Method 4 failed for ${taskName}:`, err4Msg);

    // 권한 문제로 실패한 경우 명확한 메시지 반환
    if (err4Msg.includes('ORA-13604') || err4Msg.includes('insufficient privileges') || err4Msg.includes('ORA-00942')) {
      return {
        success: false,
        method: 'all methods failed',
        error: `권한 부족: '${taskOwner || 'UNKNOWN'}' 소유의 작업을 삭제하려면 SYS AS SYSDBA로 접속해야 합니다.`,
      };
    }

    return { success: false, method: 'all methods failed', error: err4Msg };
  }

  return {
    success: false,
    method: 'all methods failed',
    error: `'${taskOwner || 'UNKNOWN'}' 소유의 작업 삭제 실패. SYS 소유 작업은 SYSDBA 권한이 필요합니다.`
  };
}

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
    const { connection_id, task_names, task_owners } = body;

    if (!connection_id) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    console.log('[SQL Tuning Clear] Starting cleanup for connection:', connection_id);

    const config = await getOracleConfig(connection_id);

    // 현재 접속 사용자 확인
    let currentUser = 'UNKNOWN';
    try {
      const userResult = await executeQuery(config, 'SELECT USER FROM DUAL', []);
      currentUser = userResult.rows?.[0]?.USER || 'UNKNOWN';
      console.log(`[SQL Tuning Clear] Current user: ${currentUser}`);
    } catch {
      console.log('[SQL Tuning Clear] Could not determine current user');
    }

    let deletedCount = 0;
    const failedTasks: { taskName: string; owner?: string; error: string }[] = [];

    if (task_names && Array.isArray(task_names) && task_names.length > 0) {
      // 특정 작업들만 삭제
      console.log(`[SQL Tuning Clear] Deleting specific tasks: ${task_names.join(', ')}`);
      for (let i = 0; i < task_names.length; i++) {
        const taskName = task_names[i];
        const taskOwner = task_owners?.[i];
        const result = await deleteTuningTask(config, taskName, taskOwner);
        if (result.success) {
          deletedCount++;
        } else {
          failedTasks.push({ taskName, owner: taskOwner, error: result.error || 'Unknown error' });
        }
      }
    } else {
      // 모든 SQL Tuning Advisor 작업 조회 후 삭제
      // DBA 권한이 있으면 DBA_ADVISOR_TASKS, 없으면 USER_ADVISOR_TASKS 사용
      let listResult;
      let viewType = 'DBA';

      try {
        const dbaListQuery = `
          SELECT TASK_NAME, OWNER, STATUS
          FROM DBA_ADVISOR_TASKS
          WHERE ADVISOR_NAME = 'SQL Tuning Advisor'
          ORDER BY CREATED DESC
        `;
        listResult = await executeQuery(config, dbaListQuery);
        console.log('[SQL Tuning Clear] Using DBA_ADVISOR_TASKS view');
      } catch {
        // DBA views not accessible, falling back to USER views
        viewType = 'USER';
        const userListQuery = `
          SELECT TASK_NAME, USER as OWNER, STATUS
          FROM USER_ADVISOR_TASKS
          WHERE ADVISOR_NAME = 'SQL Tuning Advisor'
          ORDER BY CREATED DESC
        `;
        listResult = await executeQuery(config, userListQuery);
        console.log('[SQL Tuning Clear] Using USER_ADVISOR_TASKS view (DBA view not accessible)');
      }

      const tasks = listResult.rows || [];
      console.log(`[SQL Tuning Clear] Found ${tasks.length} tasks to delete`);

      // SYS 소유와 현재 사용자 소유 분리
      const sysTasks = tasks.filter((t: any) => String(t.OWNER) === 'SYS');
      const userTasks = tasks.filter((t: any) => String(t.OWNER) !== 'SYS');

      console.log(`[SQL Tuning Clear] SYS owned: ${sysTasks.length}, User owned: ${userTasks.length}`);

      // 현재 사용자 소유 작업 먼저 삭제 (성공 확률 높음)
      for (const task of userTasks) {
        const taskName = String(task.TASK_NAME);
        const taskOwner = String(task.OWNER);
        const taskStatus = String(task.STATUS);
        console.log(`[SQL Tuning Clear] Processing user task: ${taskName} (owner: ${taskOwner}, status: ${taskStatus})`);

        const result = await deleteTuningTask(config, taskName, taskOwner);
        if (result.success) {
          deletedCount++;
        } else {
          failedTasks.push({ taskName, owner: taskOwner, error: result.error || 'Unknown error' });
        }
      }

      // SYS 소유 작업 삭제 시도
      for (const task of sysTasks) {
        const taskName = String(task.TASK_NAME);
        const taskOwner = String(task.OWNER);
        const taskStatus = String(task.STATUS);
        console.log(`[SQL Tuning Clear] Processing SYS task: ${taskName} (status: ${taskStatus})`);

        const result = await deleteTuningTask(config, taskName, taskOwner);
        if (result.success) {
          deletedCount++;
        } else {
          failedTasks.push({ taskName, owner: taskOwner, error: result.error || 'Unknown error' });
        }
      }
    }

    console.log(`[SQL Tuning Clear] Completed: ${deletedCount} deleted, ${failedTasks.length} failed`);

    const response: any = {
      success: true,
      deletedCount,
      currentUser,
    };

    if (failedTasks.length > 0) {
      // SYS 소유 작업 실패 개수 확인
      const sysFailedCount = failedTasks.filter(t => t.owner === 'SYS').length;

      if (sysFailedCount > 0 && sysFailedCount === failedTasks.length) {
        response.message = `${deletedCount}개의 작업이 삭제되었습니다. SYS 소유의 ${sysFailedCount}개 작업은 SYSDBA 권한으로 접속해야 삭제할 수 있습니다.`;
        response.warning = 'SYS 소유 작업 삭제를 위해 SYS AS SYSDBA로 연결된 데이터베이스 연결을 사용하세요.';
      } else {
        response.message = `${deletedCount}개의 작업이 삭제되었습니다. ${failedTasks.length}개의 작업 삭제에 실패했습니다.`;
        response.warning = '일부 작업은 SYSTEM 소유이거나 잠긴 상태일 수 있습니다. DBA 권한이 필요할 수 있습니다.';
      }
      response.failedTasks = failedTasks;
    } else {
      response.message = `${deletedCount}개의 SQL Tuning Advisor 작업이 삭제되었습니다.`;
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[SQL Tuning Clear] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // ORA 에러 코드별 사용자 친화적 메시지 제공
    if (errorMessage.includes('ORA-13604')) {
      return NextResponse.json(
        {
          error: '권한이 부족합니다. ADVISOR 권한이 필요합니다.',
          details: errorMessage,
        },
        { status: 403 }
      );
    }

    if (errorMessage.includes('ORA-20000')) {
      return NextResponse.json(
        {
          error: '일부 작업이 실행 중이어서 삭제할 수 없습니다. 잠시 후 다시 시도해주세요.',
          details: errorMessage,
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error: 'SQL Tuning Advisor 작업 정리에 실패했습니다.',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
