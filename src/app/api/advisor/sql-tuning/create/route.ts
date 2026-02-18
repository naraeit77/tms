import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * POST /api/advisor/sql-tuning/create
 * SQL Tuning Advisor 작업 생성 및 실행
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { connection_id, sql_text, sql_id, task_name } = body;

    if (!connection_id || !task_name) {
      return NextResponse.json(
        { error: 'Connection ID and task name are required' },
        { status: 400 }
      );
    }

    if (!sql_text && !sql_id) {
      return NextResponse.json(
        { error: 'Either SQL text or SQL ID is required' },
        { status: 400 }
      );
    }

    const config = await getOracleConfig(connection_id);

    // 기존 동일 이름의 작업이 있으면 먼저 중지 후 삭제
    // DBA 뷰와 USER 뷰 모두 확인하여 작업 존재 여부 확인
    const dropExistingTaskSQL = `
      DECLARE
        v_status VARCHAR2(30);
        v_task_name VARCHAR2(128) := :p_task_name;
      BEGIN
        -- 작업 상태 확인 (DBA 뷰 우선 시도)
        BEGIN
          SELECT STATUS INTO v_status
          FROM DBA_ADVISOR_TASKS
          WHERE TASK_NAME = v_task_name
          AND ADVISOR_NAME = 'SQL Tuning Advisor'
          AND ROWNUM = 1;
        EXCEPTION
          WHEN NO_DATA_FOUND THEN
            -- DBA 뷰에 없으면 USER 뷰 확인
            BEGIN
              SELECT STATUS INTO v_status
              FROM USER_ADVISOR_TASKS
              WHERE TASK_NAME = v_task_name
              AND ADVISOR_NAME = 'SQL Tuning Advisor';
            EXCEPTION
              WHEN NO_DATA_FOUND THEN
                v_status := NULL;
            END;
          WHEN OTHERS THEN
            -- DBA 뷰 접근 권한이 없으면 USER 뷰로 폴백
            BEGIN
              SELECT STATUS INTO v_status
              FROM USER_ADVISOR_TASKS
              WHERE TASK_NAME = v_task_name
              AND ADVISOR_NAME = 'SQL Tuning Advisor';
            EXCEPTION
              WHEN NO_DATA_FOUND THEN
                v_status := NULL;
            END;
        END;

        -- 작업이 존재하면 처리
        IF v_status IS NOT NULL THEN
          -- 실행 중이면 먼저 중지
          IF v_status = 'EXECUTING' OR v_status = 'INITIAL' THEN
            BEGIN
              DBMS_SQLTUNE.INTERRUPT_TUNING_TASK(task_name => v_task_name);
            EXCEPTION
              WHEN OTHERS THEN NULL;
            END;
          END IF;

          -- 작업 삭제
          BEGIN
            DBMS_SQLTUNE.DROP_TUNING_TASK(task_name => v_task_name);
          EXCEPTION
            WHEN OTHERS THEN
              -- ORA-13605: 작업이 존재하지 않음 - 무시
              IF SQLCODE != -13605 THEN
                RAISE;
              END IF;
          END;
        END IF;
      END;
    `;

    try {
      await executeQuery(config, dropExistingTaskSQL, [task_name], { timeout: 30000 });
    } catch {
      // 삭제 실패해도 계속 진행 (작업이 존재하지 않을 수 있음)
    }

    // 작업 생성 (PL/SQL 실행) - 바인드 변수 사용
    let createTaskSQL: string;

    if (sql_text) {
      // SQL 텍스트로 작업 생성 - CLOB 바인드 변수 사용
      // time_limit을 짧게 설정하여 빠른 분석 수행 (기본값은 무한대)
      createTaskSQL = `
        DECLARE
          l_task_name VARCHAR2(100);
          l_sql_text  CLOB := :sql_text;
        BEGIN
          l_task_name := DBMS_SQLTUNE.CREATE_TUNING_TASK(
            sql_text    => l_sql_text,
            task_name   => :task_name,
            time_limit  => 300
          );
        END;
      `;

      await executeQuery(config, createTaskSQL, [sql_text, task_name], { timeout: 120000 });
    } else if (sql_id) {
      // SQL ID로 작업 생성
      // time_limit을 짧게 설정하여 빠른 분석 수행 (기본값은 무한대)
      createTaskSQL = `
        DECLARE
          l_task_name VARCHAR2(100);
        BEGIN
          l_task_name := DBMS_SQLTUNE.CREATE_TUNING_TASK(
            sql_id      => :sql_id,
            task_name   => :task_name,
            time_limit  => 300
          );
        END;
      `;

      await executeQuery(config, createTaskSQL, [sql_id, task_name], { timeout: 120000 });
    }

    // 작업 실행 - 직접 동기 실행 (현재 사용자 소유로 작업이 생성됨)
    // DBMS_SCHEDULER 사용 시 SYS 소유로 생성되어 삭제 불가 문제 발생
    const executeTaskSQL = `
      BEGIN
        DBMS_SQLTUNE.EXECUTE_TUNING_TASK(task_name => :task_name);
      END;
    `;

    try {
      // 5분(300초) 타임아웃으로 동기 실행 (time_limit과 일치)
      await executeQuery(config, executeTaskSQL, [task_name], { timeout: 330000 });
    } catch (execError: any) {
      const msg = execError.message || '';
      // 타임아웃은 정상으로 간주 - 작업이 오래 걸리는 것
      if (msg.includes('timeout') || msg.includes('ORA-01013')) {
        console.log('SQL Tuning task execution timed out, task may still be running');
        return NextResponse.json({
          success: true,
          data: {
            task_name,
            status: 'EXECUTING',
          },
          message: 'SQL Tuning 작업이 시작되었습니다. 분석에 시간이 걸릴 수 있으니 잠시 후 새로고침하여 확인해주세요.',
        });
      }
      throw execError; // 다른 에러는 throw
    }

    // 동기 실행이 매우 빨리 끝난 경우 (여기 도달할 확률 낮음)
    let recommendationCount = 0;
    try {
      const recCountQuery = `
        SELECT COUNT(*) as REC_COUNT
        FROM USER_ADVISOR_FINDINGS
        WHERE TASK_NAME = :task_name
      `;
      const recResult = await executeQuery(config, recCountQuery, [task_name], { timeout: 5000 });
      recommendationCount = recResult.rows?.[0]?.REC_COUNT || 0;
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
    console.error('Error creating SQL Tuning Advisor task:', error);
    // 더 자세한 에러 정보 로깅
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }
    const errorMessage = error instanceof Error ? error.message : 'Failed to create tuning task';

    // Oracle 권한 관련 에러 처리
    if (errorMessage.includes('ORA-00942') || errorMessage.includes('table or view does not exist')) {
      return NextResponse.json(
        {
          error: 'SQL Tuning Advisor 관련 뷰에 접근 권한이 없습니다. DBA 권한이 필요합니다.',
          details: errorMessage,
        },
        { status: 403 }
      );
    }

    if (errorMessage.includes('ORA-13600') || errorMessage.includes('ADVISOR privilege')) {
      return NextResponse.json(
        {
          error: 'SQL Tuning Advisor 실행 권한이 없습니다. ADVISOR 권한이 필요합니다.',
          details: errorMessage,
        },
        { status: 403 }
      );
    }

    // 연결 관련 에러 처리
    if (errorMessage.includes('not found') || errorMessage.includes('connection')) {
      return NextResponse.json(
        {
          error: 'Oracle 연결을 찾을 수 없거나 연결에 실패했습니다.',
          details: errorMessage,
        },
        { status: 400 }
      );
    }

    // 타임아웃 에러인 경우 더 명확한 메시지 제공
    if (errorMessage.includes('timeout')) {
      return NextResponse.json(
        {
          error: '작업 생성 중 타임아웃이 발생했습니다. 작업이 생성되었을 수 있으니 잠시 후 작업 목록을 확인해주세요.',
          details: errorMessage,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
