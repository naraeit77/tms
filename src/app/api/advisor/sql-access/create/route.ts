import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import oracledb from 'oracledb';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * POST /api/advisor/sql-access/create
 * SQL Access Advisor 작업 생성 및 실행
 *
 * 단계별 실행으로 타임아웃 방지:
 * 1. 기존 작업/워크로드 삭제
 * 2. 작업 생성
 * 3. 워크로드 생성
 * 4. V$SQL에서 SQL 수집 (별도 쿼리)
 * 5. 워크로드에 SQL 추가
 * 6. 작업 실행
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      connection_id,
      task_name,
      workload_type,
      sts_name, // STS 이름 (옵션)
      analysis_scope, // 'INDEX' | 'PARTITION' | 'MV' | 'ALL'
      time_limit = 300,
    } = body;

    if (!connection_id || !task_name) {
      return NextResponse.json(
        { error: 'Connection ID and task name are required' },
        { status: 400 }
      );
    }

    const config = await getOracleConfig(connection_id);
    const workloadName = task_name + '_WL';

    // 1단계: 기존 워크로드와 작업 삭제 시도 (실패해도 무시)
    console.log('[SQL Access Advisor] Step 1: Cleaning up existing tasks/workloads');
    try {
      await executeQuery(config, `
        BEGIN
          DBMS_ADVISOR.DELETE_SQLWKLD(workload_name => :1);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      `, [workloadName], { timeout: 15000 });
    } catch {
      // 무시
    }

    try {
      await executeQuery(config, `
        BEGIN
          DBMS_ADVISOR.DELETE_TASK(task_name => :1);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      `, [task_name], { timeout: 15000 });
    } catch {
      // 무시
    }

    // 2단계: SQL Access Advisor 작업 생성
    console.log('[SQL Access Advisor] Step 2: Creating task');

    // 분석 범위 값 결정
    const scopeValue = analysis_scope || 'ALL';
    let analysisScope: string;
    switch (scopeValue) {
      case 'INDEX':
        analysisScope = 'INDEX';
        break;
      case 'PARTITION':
        analysisScope = 'PARTITION';
        break;
      case 'MV':
        analysisScope = 'MATERIALIZED_VIEW';
        break;
      default:
        analysisScope = 'INDEX, PARTITION, MATERIALIZED_VIEW';
    }

    const createTaskSQL = `
      DECLARE
        l_task_id NUMBER;
      BEGIN
        DBMS_ADVISOR.CREATE_TASK(
          advisor_name => 'SQL Access Advisor',
          task_name    => :1,
          task_desc    => 'SQL Access Advisor task created via TMS',
          task_id      => l_task_id
        );

        -- 시간 제한 설정
        DBMS_ADVISOR.SET_TASK_PARAMETER(
          task_name => :2,
          parameter => 'TIME_LIMIT',
          value     => :3
        );

        -- 분석 범위 설정
        DBMS_ADVISOR.SET_TASK_PARAMETER(
          task_name => :4,
          parameter => 'ANALYSIS_SCOPE',
          value     => :5
        );
      END;
    `;
    await executeQuery(config, createTaskSQL, [
      task_name,
      task_name,
      time_limit,
      task_name,
      analysisScope,
    ], { timeout: 30000 });

    // 3단계: 워크로드 생성
    console.log('[SQL Access Advisor] Step 3: Creating workload');
    const createWorkloadSQL = `
      BEGIN
        DBMS_ADVISOR.CREATE_SQLWKLD(
          workload_name => :1,
          description   => 'Workload for ' || :2
        );
      END;
    `;
    await executeQuery(config, createWorkloadSQL, [workloadName, task_name], { timeout: 30000 });

    // 4단계: V$SQL에서 SQL 목록 조회 (별도 쿼리로 분리하여 타임아웃 방지)
    // 4단계 & 5단계: V$SQL에서 SQL 수집 및 워크로드 추가 (PL/SQL 루프로 최적화)
    console.log('[SQL Access Advisor] Step 4 & 5: Fetching and adding SQL statements via PL/SQL');

    // SQL_FULLTEXT는 CLOB이므로 PL/SQL에서 직접 처리하는 것이 효율적 (네트워크 왕복 제거)
    const populateWorkloadSQL = `
      DECLARE
        l_cnt NUMBER := 0;
      BEGIN
        FOR r IN (
          SELECT /*+ NO_MONITOR */ SQL_ID, SQL_FULLTEXT, 
                 NVL(EXECUTIONS, 1) as EXECUTIONS, 
                 NVL(ELAPSED_TIME, 0) as ELAPSED_TIME, 
                 NVL(BUFFER_GETS, 0) as BUFFER_GETS, 
                 NVL(DISK_READS, 0) as DISK_READS, 
                 PARSING_SCHEMA_NAME
          FROM (
            SELECT SQL_ID, SQL_FULLTEXT, EXECUTIONS, ELAPSED_TIME, BUFFER_GETS, DISK_READS,
                   PARSING_SCHEMA_NAME
            FROM V$SQL
            WHERE PARSING_SCHEMA_NAME NOT IN ('SYS', 'SYSTEM', 'DBSNMP', 'SYSMAN', 'OUTLN', 'MDSYS', 'ORDSYS', 'EXFSYS', 'DMSYS', 'WMSYS', 'CTXSYS', 'ANONYMOUS', 'XDB', 'ORDPLUGINS', 'OLAPSYS', 'PUBLIC')
            AND COMMAND_TYPE IN (2, 3, 6, 7) -- INSERT, SELECT, UPDATE, DELETE
            AND ELAPSED_TIME > 0
            AND EXECUTIONS > 0
            ORDER BY ELAPSED_TIME DESC
          )
          WHERE ROWNUM <= 20
        ) LOOP
          BEGIN
            DBMS_ADVISOR.ADD_SQLWKLD_STATEMENT(
              workload_name   => :1,
              module          => 'TMS',
              action          => 'ANALYZE',
              cpu_time        => 0,
              elapsed_time    => r.ELAPSED_TIME / 1000000, -- microseconds to seconds logic as per existing code
              disk_reads      => r.DISK_READS,
              buffer_gets     => r.BUFFER_GETS,
              rows_processed  => 0,
              optimizer_cost  => 0,
              executions      => r.EXECUTIONS,
              priority        => 2,
              last_execution_date => SYSDATE,
              stat_period     => 0,
              username        => r.PARSING_SCHEMA_NAME,
              sql_text        => r.SQL_FULLTEXT
            );
            l_cnt := l_cnt + 1;
          EXCEPTION WHEN OTHERS THEN
            NULL; -- 개별 SQL 추가 실패는 무시
          END;
        END LOOP;
        :2 := l_cnt;
      END;
    `;

    let addedCount = 0;
    try {
      // 1번 바인드: workloadName, 2번 바인드: OUT 변수 (count)
      // 1번 바인드: workloadName, 2번 바인드: OUT 변수 (count)
      const result = await executeQuery(config, populateWorkloadSQL, [
        workloadName,
        { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      ], { timeout: 120000 });

      // 배열 바인딩 결과에서 아웃 바인드 값 추출
      if (result.outBinds && Array.isArray(result.outBinds)) {
        addedCount = result.outBinds[0];
      }
      console.log(`[SQL Access Advisor] Added ${addedCount} SQL statements via PL/SQL loop`);
    } catch (populateError) {
      console.warn('[SQL Access Advisor] Failed to populate workload via PL/SQL:', populateError);
      // 실패 시 0으로 진행
    }

    // 6단계: 워크로드와 작업 연결
    if (sts_name) {
      // STS 기반 워크로드 연결
      console.log('[SQL Access Advisor] Step 6: Linking STS workload to task');
      const linkSTSWorkloadSQL = `
        BEGIN
          DBMS_ADVISOR.ADD_SQLWKLD_REF(
            task_name     => :1,
            workload_name => :2,
            is_sts        => 1
          );
        END;
      `;
      await executeQuery(config, linkSTSWorkloadSQL, [task_name, sts_name], { timeout: 30000 });
    } else if (addedCount > 0) {
      // 일반 워크로드 연결
      console.log('[SQL Access Advisor] Step 6: Linking workload to task');
      const linkWorkloadSQL = `
        BEGIN
          DBMS_ADVISOR.ADD_SQLWKLD_REF(
            task_name     => :1,
            workload_name => :2,
            is_sts        => 0
          );
        END;
      `;
      await executeQuery(config, linkWorkloadSQL, [task_name, workloadName], { timeout: 30000 });
    }

    // 7단계: 작업 실행 (DBMS_SCHEDULER를 사용하여 비동기 실행)
    console.log('[SQL Access Advisor] Step 7: Executing task asynchronously via Scheduler');

    // 스케줄러를 통한 비동기 실행
    const executeTaskSQL = `
      BEGIN
        DBMS_SCHEDULER.CREATE_JOB(
          job_name   => 'JOB_' || :1,
          job_type   => 'PLSQL_BLOCK',
          job_action => 'BEGIN DBMS_ADVISOR.EXECUTE_TASK(task_name => ''' || :2 || '''); END;',
          start_date => SYSTIMESTAMP,
          enabled    => TRUE,
          auto_drop  => TRUE,
          comments   => 'SQL Access Advisor Task Execution'
        );
      END;
    `;

    // 스케줄러 실행 시도 (실패 시 에러 전파하여 사용자에게 알림)
    await executeQuery(config, executeTaskSQL, [task_name, task_name], { timeout: 20000 });
    console.log('[SQL Access Advisor] Task submitted to scheduler');

    return NextResponse.json({
      success: true,
      data: {
        task_name,
        workload_type: workload_type || 'CURRENT',
        status: 'EXECUTING', // 스케줄러에 의해 시작됨
        sql_count: addedCount,
      },
      message: `SQL Access Advisor 작업이 백그라운드에서 시작되었습니다. ${addedCount}개의 SQL이 분석에 포함되었습니다.`,
    });
  } catch (error) {
    console.error('Error creating SQL Access Advisor task:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create access advisor task';

    // ORA 에러 코드별 사용자 친화적 메시지 제공
    if (errorMessage.includes('ORA-13600') || errorMessage.includes('does not exist')) {
      return NextResponse.json(
        {
          error: 'SQL Access Advisor가 설치되어 있지 않거나 권한이 부족합니다. Oracle Enterprise Edition의 Tuning Pack 라이센스가 필요합니다.',
          details: errorMessage,
        },
        { status: 403 }
      );
    }

    if (errorMessage.includes('ORA-13607') || errorMessage.includes('already exists')) {
      return NextResponse.json(
        {
          error: '동일한 이름의 작업이 이미 존재합니다. 다른 작업 이름을 사용하거나 기존 작업을 삭제해주세요.',
          details: errorMessage,
        },
        { status: 409 }
      );
    }

    if (errorMessage.includes('ORA-13604') || errorMessage.includes('insufficient privileges')) {
      return NextResponse.json(
        {
          error: 'ADVISOR 권한이 필요합니다. DBA에게 ADVISOR 권한을 요청해주세요.',
          details: errorMessage,
        },
        { status: 403 }
      );
    }

    if (errorMessage.includes('ORA-00942')) {
      return NextResponse.json(
        {
          error: 'V$SQL 뷰에 대한 접근 권한이 없습니다. SELECT ANY DICTIONARY 권한이 필요합니다.',
          details: errorMessage,
        },
        { status: 403 }
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
      },
      { status: 500 }
    );
  }
}
