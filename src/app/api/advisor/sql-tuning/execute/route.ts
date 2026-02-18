import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * POST /api/advisor/sql-tuning/execute
 * SQL Tuning Advisor 작업 실행
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { connection_id, task_name, task_owner } = body;

    if (!connection_id || !task_name) {
      return NextResponse.json(
        { error: 'Connection ID and task name are required' },
        { status: 400 }
      );
    }

    const config = await getOracleConfig(connection_id);

    // 작업 실행 (SQL Tuning은 시간이 오래 걸릴 수 있으므로 비동기 처리)
    const executeSQL = `
      BEGIN
        DBMS_SQLTUNE.EXECUTE_TUNING_TASK(task_name => :task_name);
      END;
    `;

    try {
      // 실행은 최대 2분까지 대기, 그 이후에는 백그라운드에서 계속 실행됨
      await executeQuery(config, executeSQL, [task_name], { timeout: 120000 });
    } catch {
      // 실행 타임아웃은 정상적인 경우일 수 있음 (작업이 백그라운드에서 계속 실행됨)
      // 작업 상태 확인 (DBA 뷰 우선 시도)
      try {
        let statusQuery: string;
        let statusParams: any[];

        // DBA 뷰 시도
        if (task_owner) {
          statusQuery = `
            SELECT STATUS
            FROM DBA_ADVISOR_TASKS
            WHERE TASK_NAME = :task_name AND OWNER = :task_owner
          `;
          statusParams = [task_name, task_owner];
        } else {
          statusQuery = `
            SELECT STATUS
            FROM DBA_ADVISOR_TASKS
            WHERE TASK_NAME = :task_name
          `;
          statusParams = [task_name];
        }

        try {
          const statusResult = await executeQuery(config, statusQuery, statusParams, { timeout: 5000 });
          const currentStatus = statusResult.rows[0]?.STATUS || 'EXECUTING';
          
          return NextResponse.json({
            success: true,
            data: {
              task_name,
              status: currentStatus,
            },
            message: `SQL Tuning 작업이 실행되었습니다. 현재 상태: ${currentStatus}. 실행 완료까지 시간이 걸릴 수 있습니다.`,
          });
        } catch {
          // DBA 뷰 실패 시 USER 뷰로 폴백
          const userStatusQuery = `
            SELECT STATUS
            FROM USER_ADVISOR_TASKS
            WHERE TASK_NAME = :task_name
          `;
          const userStatusResult = await executeQuery(config, userStatusQuery, [task_name], { timeout: 5000 });
          const currentStatus = userStatusResult.rows[0]?.STATUS || 'EXECUTING';
          
          return NextResponse.json({
            success: true,
            data: {
              task_name,
              status: currentStatus,
            },
            message: `SQL Tuning 작업이 실행되었습니다. 현재 상태: ${currentStatus}. 실행 완료까지 시간이 걸릴 수 있습니다.`,
          });
        }
      } catch (statusError) {
        // 상태 확인 실패 시에도 작업은 실행되었을 수 있음
        return NextResponse.json({
          success: true,
          data: {
            task_name,
            status: 'EXECUTING',
          },
          message: 'SQL Tuning 작업이 실행되었습니다. 실행 완료까지 시간이 걸릴 수 있습니다. 잠시 후 새로고침하여 상태를 확인해주세요.',
        });
      }
    }

    // 작업 완료 후 권장사항 개수 조회
    let recommendationCount = 0;
    try {
      // DBA 뷰 시도
      let recCountQuery: string;
      let recParams: any[];

      if (task_owner) {
        recCountQuery = `
          SELECT COUNT(*) as REC_COUNT
          FROM DBA_ADVISOR_FINDINGS
          WHERE TASK_NAME = :task_name AND OWNER = :task_owner
        `;
        recParams = [task_name, task_owner];
      } else {
        recCountQuery = `
          SELECT COUNT(*) as REC_COUNT
          FROM DBA_ADVISOR_FINDINGS
          WHERE TASK_NAME = :task_name
        `;
        recParams = [task_name];
      }

      try {
        const recResult = await executeQuery(config, recCountQuery, recParams, { timeout: 5000 });
        recommendationCount = recResult.rows?.[0]?.REC_COUNT || 0;
      } catch {
        // DBA 뷰 실패 시 USER 뷰로 폴백
        const userRecQuery = `
          SELECT COUNT(*) as REC_COUNT
          FROM USER_ADVISOR_FINDINGS
          WHERE TASK_NAME = :task_name
        `;
        const recResult = await executeQuery(config, userRecQuery, [task_name], { timeout: 5000 });
        recommendationCount = recResult.rows?.[0]?.REC_COUNT || 0;
      }
    } catch {
      // 권장사항 개수 조회 실패 시 무시
    }

    return NextResponse.json({
      success: true,
      data: {
        task_name,
        status: 'COMPLETED',
        recommendation_count: recommendationCount,
      },
      message: recommendationCount > 0
        ? `SQL Tuning 작업이 완료되었습니다. ${recommendationCount}개의 권장사항이 발견되었습니다.`
        : 'SQL Tuning 작업이 완료되었습니다. 권장사항이 없거나 SQL이 이미 최적화되어 있습니다.',
    });
  } catch (error) {
    console.error('Error executing SQL Tuning Advisor task:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to execute tuning task';

    // ORA 에러 코드별 사용자 친화적 메시지 제공
    if (errorMessage.includes('ORA-13604')) {
      return NextResponse.json(
        {
          error: '권한이 부족합니다. 해당 작업의 소유자로 접속하거나 ADVISOR 권한이 필요합니다.',
          details: errorMessage,
        },
        { status: 403 }
      );
    }

    if (errorMessage.includes('ORA-13605')) {
      return NextResponse.json(
        {
          error: '해당 작업을 찾을 수 없습니다. 작업이 삭제되었거나 존재하지 않습니다.',
          details: errorMessage,
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
