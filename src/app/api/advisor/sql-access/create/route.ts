import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * POST /api/advisor/sql-access/create
 * SQL Access Advisor 작업 생성 및 실행
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { connection_id, task_name, workload_type } = body;

    if (!connection_id || !task_name) {
      return NextResponse.json(
        { error: 'Connection ID and task name are required' },
        { status: 400 }
      );
    }

    const config = await getOracleConfig(connection_id);

    // 작업 생성 및 실행 (기존 작업 삭제 후 재생성)
    const createAndExecuteSQL = `
      DECLARE
        l_task_name VARCHAR2(30) := :task_name;
        l_task_exists NUMBER;
      BEGIN
        -- 1. 기존 작업 존재 여부 확인
        SELECT COUNT(*) INTO l_task_exists
        FROM dba_advisor_tasks
        WHERE task_name = l_task_name
        AND owner = USER;

        -- 2. 기존 작업이 있으면 삭제
        IF l_task_exists > 0 THEN
          DBMS_ADVISOR.DELETE_TASK(task_name => l_task_name);
        END IF;

        -- 3. SQL Access Advisor 작업 생성
        DBMS_ADVISOR.CREATE_TASK(
          advisor_name => 'SQL Access Advisor',
          task_name    => l_task_name,
          task_desc    => 'SQL Access Advisor task created via TMS'
        );

        -- 4. 파라미터 설정 (분석 범위 설정)
        DBMS_ADVISOR.SET_TASK_PARAMETER(
          task_name => l_task_name,
          parameter => 'ANALYSIS_SCOPE',
          value     => 'ALL'
        );

        -- 5. 작업 실행
        DBMS_ADVISOR.EXECUTE_TASK(task_name => l_task_name);
      END;
    `;

    await executeQuery(config, createAndExecuteSQL, {
      task_name,
    });

    return NextResponse.json({
      success: true,
      data: {
        task_name,
        workload_type: workload_type || 'CURRENT',
        status: 'CREATED_AND_EXECUTED',
      },
      message: 'SQL Access Advisor task created and executed successfully',
    });
  } catch (error) {
    console.error('Error creating SQL Access Advisor task:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create access advisor task',
      },
      { status: 500 }
    );
  }
}
