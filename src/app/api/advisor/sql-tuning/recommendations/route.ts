import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';
import oracledb from 'oracledb';

/**
 * GET /api/advisor/sql-tuning/recommendations
 * SQL Tuning Advisor 권장사항 조회
 * DBA 뷰를 우선 사용하고, 권한이 없으면 USER 뷰로 폴백
 *
 * 개선사항:
 * 1. 더 강력한 타임아웃 처리 (90초로 증가)
 * 2. 작업 상태에 따른 친절한 안내 메시지
 * 3. 튜닝 가이드 포함 응답
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');
    const taskName = searchParams.get('task_name');
    const taskOwner = searchParams.get('task_owner'); // 옵션: 작업 소유자

    if (!connectionId || !taskName) {
      return NextResponse.json(
        { error: 'Connection ID and task name are required' },
        { status: 400 }
      );
    }

    const config = await getOracleConfig(connectionId);

    // 먼저 작업 상태 확인 (완료되지 않은 작업의 권장사항 조회 방지)
    let taskStatus: string | null = null;
    let taskExecutionStart: string | null = null;
    let taskExecutionEnd: string | null = null;

    try {
      let statusQuery: string;
      let statusParams: any[];

      if (taskOwner) {
        statusQuery = `
          SELECT STATUS,
                 TO_CHAR(EXECUTION_START, 'YYYY-MM-DD HH24:MI:SS') as EXEC_START,
                 TO_CHAR(EXECUTION_END, 'YYYY-MM-DD HH24:MI:SS') as EXEC_END
          FROM DBA_ADVISOR_TASKS
          WHERE TASK_NAME = :task_name AND OWNER = :task_owner AND ADVISOR_NAME = 'SQL Tuning Advisor'
        `;
        statusParams = [taskName, taskOwner];
      } else {
        statusQuery = `
          SELECT STATUS,
                 TO_CHAR(EXECUTION_START, 'YYYY-MM-DD HH24:MI:SS') as EXEC_START,
                 TO_CHAR(EXECUTION_END, 'YYYY-MM-DD HH24:MI:SS') as EXEC_END
          FROM DBA_ADVISOR_TASKS
          WHERE TASK_NAME = :task_name AND ADVISOR_NAME = 'SQL Tuning Advisor'
        `;
        statusParams = [taskName];
      }

      try {
        const statusResult = await executeQuery(config, statusQuery, statusParams, { timeout: 10000 });
        taskStatus = statusResult.rows[0]?.STATUS || null;
        taskExecutionStart = statusResult.rows[0]?.EXEC_START || null;
        taskExecutionEnd = statusResult.rows[0]?.EXEC_END || null;
      } catch {
        // DBA 뷰 실패 시 USER 뷰로 폴백
        const userStatusQuery = `
          SELECT STATUS,
                 TO_CHAR(EXECUTION_START, 'YYYY-MM-DD HH24:MI:SS') as EXEC_START,
                 TO_CHAR(EXECUTION_END, 'YYYY-MM-DD HH24:MI:SS') as EXEC_END
          FROM USER_ADVISOR_TASKS
          WHERE TASK_NAME = :task_name AND ADVISOR_NAME = 'SQL Tuning Advisor'
        `;
        const userStatusResult = await executeQuery(config, userStatusQuery, [taskName], { timeout: 10000 });
        taskStatus = userStatusResult.rows[0]?.STATUS || null;
        taskExecutionStart = userStatusResult.rows[0]?.EXEC_START || null;
        taskExecutionEnd = userStatusResult.rows[0]?.EXEC_END || null;
      }
    } catch (statusError) {
      // 상태 확인 실패는 무시하고 계속 진행
      console.warn('[SQL Tuning Recommendations] Could not check task status:', statusError);
    }

    // 작업이 완료되지 않은 경우 상태별 적절한 응답 반환
    if (taskStatus && taskStatus !== 'COMPLETED') {
      const statusMessages: Record<string, { message: string; guide: string }> = {
        INITIAL: {
          message: '작업이 초기화 중입니다.',
          guide: '작업이 아직 시작되지 않았습니다. "작업 실행" 버튼을 클릭하여 분석을 시작하세요.',
        },
        EXECUTING: {
          message: '작업이 실행 중입니다.',
          guide: 'SQL Tuning Advisor가 분석 중입니다. 복잡한 SQL의 경우 5~10분이 소요될 수 있습니다. 잠시 후 새로고침하여 확인해주세요.',
        },
        INTERRUPTED: {
          message: '작업이 중단되었습니다.',
          guide: '분석이 중단되었습니다. 네트워크 문제이거나 분석 시간이 제한을 초과했을 수 있습니다. 작업을 다시 실행해주세요.',
        },
        CANCELLED: {
          message: '작업이 취소되었습니다.',
          guide: '사용자에 의해 작업이 취소되었습니다. 새 작업을 생성하여 다시 분석해주세요.',
        },
        ERROR: {
          message: '작업 실행 중 오류가 발생했습니다.',
          guide: 'SQL 구문 오류, 권한 부족, 또는 시스템 리소스 문제일 수 있습니다. SQL을 확인하고 작업을 다시 실행해주세요.',
        },
      };

      const statusInfo = statusMessages[taskStatus] || {
        message: `작업이 아직 완료되지 않았습니다. 현재 상태: ${taskStatus}`,
        guide: '잠시 후 다시 확인해주세요.',
      };

      return NextResponse.json(
        {
          success: false,
          error: statusInfo.message,
          guide: statusInfo.guide,
          task_status: taskStatus,
          task_name: taskName,
          task_owner: taskOwner,
          execution_start: taskExecutionStart,
          execution_end: taskExecutionEnd,
          data: [],
          count: 0,
          // 튜닝 가이드 기본 정보 제공
          tuning_guide: {
            title: 'SQL Tuning Advisor 사용 가이드',
            steps: [
              '1. 작업이 COMPLETED 상태가 될 때까지 기다리세요.',
              '2. 권장사항이 없는 경우 SQL이 이미 최적화되어 있습니다.',
              '3. SQL Profile 적용을 통해 실행 계획을 개선할 수 있습니다.',
              '4. 인덱스 권장사항이 있다면 DBA와 협의 후 적용하세요.',
            ],
          },
        },
        { status: 202 } // 202 Accepted - 작업이 진행 중임을 나타냄
      );
    }

    let result;
    let viewType = 'DBA';

    // DBA 뷰 우선 시도 (SYS 소유 작업 포함 모든 작업 조회 가능)
    try {
      // USE_HASH, LEADING 힌트로 3-way JOIN 최적화
      const dbaQuery = `
        SELECT /*+ LEADING(f r a) USE_HASH(r a) */
          f.OWNER as TASK_OWNER,
          f.FINDING_ID,
          f.TYPE as FINDING_TYPE,
          f.MESSAGE as FINDING_MESSAGE,
          f.IMPACT,
          f.IMPACT_TYPE,
          r.TYPE as REC_TYPE,
          r.BENEFIT as REC_BENEFIT,
          a.COMMAND as ACTION_COMMAND,
          a.MESSAGE as ACTION_MESSAGE,
          a.ATTR1,
          a.ATTR2,
          a.ATTR3,
          a.ATTR4,
          a.ATTR5
        FROM DBA_ADVISOR_FINDINGS f
        LEFT JOIN DBA_ADVISOR_RECOMMENDATIONS r
          ON f.OWNER = r.OWNER AND f.TASK_NAME = r.TASK_NAME AND f.FINDING_ID = r.FINDING_ID
        LEFT JOIN DBA_ADVISOR_ACTIONS a
          ON r.OWNER = a.OWNER AND r.TASK_NAME = a.TASK_NAME AND r.REC_ID = a.REC_ID
        WHERE f.TASK_NAME = :task_name
        ${taskOwner ? 'AND f.OWNER = :task_owner' : ''}
        ORDER BY f.IMPACT DESC NULLS LAST, f.FINDING_ID, r.REC_ID, a.ACTION_ID
      `;

      const bindParams = taskOwner ? [taskName, taskOwner] : [taskName];
      result = await executeQuery(config, dbaQuery, bindParams, { timeout: 30000 }); // 타임아웃 30초
    } catch (dbaError) {
      // ORA-01013 에러 체크
      const errorMessage = dbaError instanceof Error ? dbaError.message : String(dbaError);
      if (errorMessage.includes('ORA-01013') || errorMessage.includes('user requested cancel')) {
        throw new Error('ORA-01013: SQL Tuning Advisor 분석이 타임아웃되었거나 취소되었습니다. 작업을 다시 실행해 주세요.');
      }
      // DBA views not accessible, falling back to USER views
      viewType = 'USER';

      try {
        // USER 뷰로 폴백 (현재 사용자 소유 작업만 조회 가능)
        const userQuery = `
          SELECT
            USER as TASK_OWNER,
            f.FINDING_ID,
            f.TYPE as FINDING_TYPE,
            f.MESSAGE as FINDING_MESSAGE,
            f.IMPACT,
            f.IMPACT_TYPE,
            r.TYPE as REC_TYPE,
            r.BENEFIT as REC_BENEFIT,
            a.COMMAND as ACTION_COMMAND,
            a.MESSAGE as ACTION_MESSAGE,
            a.ATTR1,
            a.ATTR2,
            a.ATTR3,
            a.ATTR4,
            a.ATTR5
          FROM USER_ADVISOR_FINDINGS f
          LEFT JOIN USER_ADVISOR_RECOMMENDATIONS r
            ON f.TASK_NAME = r.TASK_NAME AND f.FINDING_ID = r.FINDING_ID
          LEFT JOIN USER_ADVISOR_ACTIONS a
            ON r.TASK_NAME = a.TASK_NAME AND r.REC_ID = a.REC_ID
          WHERE f.TASK_NAME = :task_name
          ORDER BY f.IMPACT DESC NULLS LAST, f.FINDING_ID, r.REC_ID, a.ACTION_ID
        `;

        result = await executeQuery(config, userQuery, [taskName], { timeout: 30000 }); // 타임아웃 30초
      } catch (userError) {
        // ORA-01013 에러 체크
        const userErrorMessage = userError instanceof Error ? userError.message : String(userError);
        if (userErrorMessage.includes('ORA-01013') || userErrorMessage.includes('user requested cancel')) {
          throw new Error('ORA-01013: SQL Tuning Advisor 분석이 타임아웃되었거나 취소되었습니다. 작업을 다시 실행해 주세요.');
        }
        throw userError;
      }
    }

    // 결과 그룹화 및 구조화 - 프론트엔드 기대 구조에 맞춤
    const findingsMap = new Map();

    // ORA-01013 에러가 포함된 행이 있는지 확인
    let hasOraError = false;
    if (result.rows && result.rows.length > 0) {
      // 먼저 ORA 에러가 있는지 확인
      hasOraError = result.rows.some((row: any) =>
        row.FINDING_MESSAGE?.includes('ORA-01013') ||
        row.FINDING_MESSAGE?.includes('ORA-') ||
        row.ACTION_MESSAGE?.includes('ORA-01013') ||
        row.ACTION_MESSAGE?.includes('ORA-')
      );
    }

    if (result.rows && result.rows.length > 0 && !hasOraError) {
      result.rows.forEach((row: any) => {
        const findingId = row.FINDING_ID;

        if (!findingsMap.has(findingId)) {
          const findingMessage = row.FINDING_MESSAGE || row.FINDING_TYPE || 'No finding message';
          const impactType = row.IMPACT_TYPE || 'PERFORMANCE';
          const benefitValue = Number(row.REC_BENEFIT || row.IMPACT || 0);

          findingsMap.set(findingId, {
            finding: findingMessage,
            benefit_type: impactType,
            benefit_value: benefitValue > 0 ? benefitValue : undefined,
            message: findingMessage,
            actions: [],
            rationale: row.ACTION_MESSAGE || undefined,
            sql_profile_name: row.ATTR1 && row.ACTION_COMMAND === 'CREATE_PROFILE' ? row.ATTR1 : undefined,
            // 디버깅용 추가 정보
            finding_id: findingId,
            finding_type: row.FINDING_TYPE,
            rec_type: row.REC_TYPE,
            task_owner: row.TASK_OWNER,
          });
        }

        const finding = findingsMap.get(findingId);

        // 액션 추가 (중복 제거 및 포맷팅)
        if (row.ACTION_COMMAND) {
          let actionText = row.ACTION_COMMAND;

          // 액션 타입에 따라 포맷팅
          if (row.ACTION_COMMAND === 'CREATE_PROFILE') {
            actionText = `SQL 프로파일 생성: ${row.ATTR1 || 'N/A'}`;
          } else if (row.ACTION_COMMAND === 'CREATE_INDEX') {
            actionText = `인덱스 생성: ${row.ATTR1 || 'N/A'}`;
          } else if (row.ACTION_COMMAND === 'GATHER_TABLE_STATS') {
            actionText = `테이블 통계 수집: ${row.ATTR1 || 'N/A'}`;
          } else if (row.ACTION_COMMAND === 'GATHER_INDEX_STATS') {
            actionText = `인덱스 통계 수집: ${row.ATTR1 || 'N/A'}`;
          } else if (row.ACTION_MESSAGE) {
            actionText = row.ACTION_MESSAGE;
          }

          if (!finding.actions.includes(actionText)) {
            finding.actions.push(actionText);
          }
        }

        // rationale이 없고 ACTION_MESSAGE가 있으면 사용
        if (!finding.rationale && row.ACTION_MESSAGE) {
          finding.rationale = row.ACTION_MESSAGE;
        }
      });
    }

    const recommendations = Array.from(findingsMap.values());

    // ORA-01013 에러가 있는 경우 특별 처리
    if (hasOraError) {
      return NextResponse.json(
        {
          success: false,
          error: 'SQL Tuning Advisor 분석이 타임아웃되었거나 취소되었습니다. 작업을 다시 실행해 주세요.',
          data: recommendations, // 에러 메시지도 포함하여 반환
          count: recommendations.length,
          task_name: taskName,
          task_owner: taskOwner || recommendations[0]?.task_owner,
          view_type: viewType,
          has_error: true,
        },
        { status: 408 } // Request Timeout
      );
    }

    // ================================================================
    // sqltrpt.sql 스타일 리포트 생성
    // Oracle의 $ORACLE_HOME/rdbms/admin/sqltrpt.sql 참조
    //
    // 주의: DBMS_SQLTUNE.REPORT_TUNING_TASK는 CLOB을 반환하며,
    // 대용량 데이터 조회 시 타임아웃이 발생할 수 있음
    // 따라서 TEXT 리포트만 기본 조회하고, HTML/Script는 별도 요청으로 처리
    // ================================================================

    // 1. TEXT 리포트 생성 (DBMS_SQLTUNE.REPORT_TUNING_TASK) - sqltrpt.sql 핵심
    // section='SUMMARY'로 요약만 먼저 조회하여 타임아웃 방지
    let sqlTuningReport = '';
    try {
      let reportQuery: string;
      let reportParams: any[];

      if (taskOwner) {
        // section='ALL' 대신 'SUMMARY'로 빠른 조회 (타임아웃 방지)
        // level='TYPICAL' 로 적절한 상세도 유지
        reportQuery = `SELECT DBMS_SQLTUNE.REPORT_TUNING_TASK(:task_name, 'TEXT', 'SUMMARY', 'TYPICAL', :task_owner) as REPORT FROM DUAL`;
        reportParams = [taskName, taskOwner];
      } else {
        reportQuery = `SELECT DBMS_SQLTUNE.REPORT_TUNING_TASK(:task_name, 'TEXT', 'SUMMARY', 'TYPICAL') as REPORT FROM DUAL`;
        reportParams = [taskName];
      }

      const reportResult = await executeQuery(config, reportQuery, reportParams, {
        fetchInfo: { REPORT: { type: oracledb.STRING } },
        timeout: 30000 // 30초로 줄임
      });
      sqlTuningReport = reportResult.rows[0]?.REPORT || '';

      // SUMMARY가 성공하면 전체 리포트 시도 (추가 30초)
      if (sqlTuningReport) {
        try {
          let fullReportQuery: string;
          if (taskOwner) {
            fullReportQuery = `SELECT DBMS_SQLTUNE.REPORT_TUNING_TASK(:task_name, 'TEXT', 'ALL', 'TYPICAL', :task_owner) as REPORT FROM DUAL`;
          } else {
            fullReportQuery = `SELECT DBMS_SQLTUNE.REPORT_TUNING_TASK(:task_name, 'TEXT', 'ALL', 'TYPICAL') as REPORT FROM DUAL`;
          }
          const fullReportResult = await executeQuery(config, fullReportQuery, reportParams, {
            fetchInfo: { REPORT: { type: oracledb.STRING } },
            timeout: 30000
          });
          const fullReport = fullReportResult.rows[0]?.REPORT;
          if (fullReport) {
            sqlTuningReport = fullReport;
          }
        } catch {
          // 전체 리포트 실패 시 SUMMARY 유지
          console.log('[SQL Tuning] Full report timed out, using SUMMARY');
        }
      }
    } catch (reportError) {
      console.warn('Failed to generate tuning report:', reportError);
    }

    // 2. 튜닝 스크립트 생성 (DBMS_SQLTUNE.SCRIPT_TUNING_TASK)
    // sqltrpt.sql: DBMS_SQLTUNE.SCRIPT_TUNING_TASK를 통해 적용 가능한 스크립트 생성
    let sqlTuningScript = '';
    try {
      let actualScriptQuery: string;
      let actualScriptParams: any[];

      if (taskOwner) {
        actualScriptQuery = `SELECT DBMS_SQLTUNE.SCRIPT_TUNING_TASK(:task_name, 'ALL', :task_owner) as SCRIPT FROM DUAL`;
        actualScriptParams = [taskName, taskOwner];
      } else {
        actualScriptQuery = `SELECT DBMS_SQLTUNE.SCRIPT_TUNING_TASK(:task_name) as SCRIPT FROM DUAL`;
        actualScriptParams = [taskName];
      }

      const scriptResult = await executeQuery(config, actualScriptQuery, actualScriptParams, {
        fetchInfo: { SCRIPT: { type: oracledb.STRING } },
        timeout: 20000 // 20초로 줄임
      });
      sqlTuningScript = scriptResult.rows[0]?.SCRIPT || '';
    } catch (scriptError) {
      console.warn('Failed to generate tuning script:', scriptError);
    }

    // 3. HTML 리포트 생성 (시각적 분석용) - 별도로 지연 로드 가능
    // 타임아웃 방지를 위해 section='SUMMARY'로 축소
    let htmlReport = '';
    try {
      let htmlReportQuery: string;
      let htmlReportParams: any[];

      if (taskOwner) {
        // HTML도 SUMMARY로 축소하여 타임아웃 방지
        htmlReportQuery = `SELECT DBMS_SQLTUNE.REPORT_TUNING_TASK(:task_name, 'HTML', 'SUMMARY', 'TYPICAL', :task_owner) as REPORT FROM DUAL`;
        htmlReportParams = [taskName, taskOwner];
      } else {
        htmlReportQuery = `SELECT DBMS_SQLTUNE.REPORT_TUNING_TASK(:task_name, 'HTML', 'SUMMARY', 'TYPICAL') as REPORT FROM DUAL`;
        htmlReportParams = [taskName];
      }

      const htmlReportResult = await executeQuery(config, htmlReportQuery, htmlReportParams, {
        fetchInfo: { REPORT: { type: oracledb.STRING } },
        timeout: 20000 // 20초로 줄임
      });
      htmlReport = htmlReportResult.rows[0]?.REPORT || '';
    } catch (htmlError) {
      console.warn('Failed to generate HTML report:', htmlError);
    }

    // 4. sqltrpt.sql 스타일의 상세 권장사항 추출
    // DBA_ADVISOR_RATIONALE 뷰에서 상세 근거 정보 조회
    let rationaleDetails: any[] = [];
    try {
      const rationaleQuery = `
        SELECT
          r.REC_ID,
          r.TYPE as RATIONALE_TYPE,
          r.MESSAGE as RATIONALE_MESSAGE,
          r.IMPACT
        FROM ${viewType === 'DBA' ? 'DBA' : 'USER'}_ADVISOR_RATIONALE r
        WHERE r.TASK_NAME = :task_name
        ${taskOwner && viewType === 'DBA' ? 'AND r.OWNER = :task_owner' : ''}
        ORDER BY r.REC_ID, r.IMPACT DESC NULLS LAST
      `;
      const rationaleParams = taskOwner && viewType === 'DBA' ? [taskName, taskOwner] : [taskName];
      const rationaleResult = await executeQuery(config, rationaleQuery, rationaleParams, { timeout: 15000 });
      rationaleDetails = rationaleResult.rows || [];
    } catch {
      // 무시 - 일부 버전에서 지원하지 않을 수 있음
    }

    // 5. sqltrpt.sql 스타일의 SQL 프로필 정보
    // ACCEPT_SQL_PROFILE 명령이 있는지 확인
    let sqlProfileInfo: any = null;
    try {
      const profileInfoQuery = `
        SELECT
          a.ATTR1 as PROFILE_NAME,
          a.ATTR2 as SQL_SIGNATURE,
          a.ATTR3 as CATEGORY,
          a.ATTR4 as FORCE_MATCHING,
          a.ATTR5 as TASK_EXEC_NAME,
          a.MESSAGE as PROFILE_MESSAGE
        FROM ${viewType === 'DBA' ? 'DBA' : 'USER'}_ADVISOR_ACTIONS a
        WHERE a.TASK_NAME = :task_name
        ${taskOwner && viewType === 'DBA' ? 'AND a.OWNER = :task_owner' : ''}
        AND a.COMMAND = 'ACCEPT_SQL_PROFILE'
      `;
      const profileInfoParams = taskOwner && viewType === 'DBA' ? [taskName, taskOwner] : [taskName];
      const profileInfoResult = await executeQuery(config, profileInfoQuery, profileInfoParams, { timeout: 10000 });
      if (profileInfoResult.rows && profileInfoResult.rows.length > 0) {
        sqlProfileInfo = profileInfoResult.rows[0];
      }
    } catch {
      // 무시
    }

    // 6. 원본 SQL과 개선된 실행 계획 정보 (sqltrpt.sql 핵심)
    let originalPlan: string | null = null;
    let recommendedPlan: string | null = null;
    try {
      // 원본 실행 계획
      const originalPlanQuery = `
        SELECT DBMS_SQLTUNE.REPORT_TUNING_TASK(:task_name, 'TEXT', 'FINDINGS', 'TYPICAL'${taskOwner ? ', :task_owner' : ''}) as PLAN
        FROM DUAL
      `;
      const originalPlanParams = taskOwner ? [taskName, taskOwner] : [taskName];
      const originalPlanResult = await executeQuery(config, originalPlanQuery, originalPlanParams, {
        fetchInfo: { PLAN: { type: oracledb.STRING } },
        timeout: 30000
      });
      originalPlan = originalPlanResult.rows[0]?.PLAN || null;
    } catch {
      // 무시
    }

    // 실행 계획 비교 정보 추출 (sqltrpt.sql의 핵심 기능)
    let planComparison = null;
    try {
      // 원본 실행 계획과 권장 실행 계획 비교
      const planCompareQuery = `
        SELECT
          o.ATTR1 as PLAN_HASH_VALUE,
          o.ATTR2 as PLAN_ID,
          o.ATTR3 as TIMESTAMP_INFO,
          o.ATTR4 as PARSING_SCHEMA,
          o.ATTR5 as OTHER_INFO
        FROM ${viewType === 'DBA' ? 'DBA' : 'USER'}_ADVISOR_OBJECTS o
        WHERE o.TASK_NAME = :task_name
        ${taskOwner && viewType === 'DBA' ? 'AND o.OWNER = :task_owner' : ''}
        AND o.OBJECT_TYPE IN ('SQL', 'PLAN')
        ORDER BY o.OBJECT_ID
      `;

      const planParams = taskOwner && viewType === 'DBA' ? [taskName, taskOwner] : [taskName];
      const planResult = await executeQuery(config, planCompareQuery, planParams, { timeout: 10000 });

      if (planResult.rows && planResult.rows.length > 0) {
        planComparison = {
          objects: planResult.rows,
          count: planResult.rows.length
        };
      }
    } catch (planError) {
      console.warn('Failed to fetch plan comparison:', planError);
    }

    // SQL Profile 적용 가능 여부 확인
    let canApplyProfile = false;
    let existingProfile = null;
    try {
      // 권장사항 중 SQL Profile 생성 가능한 것이 있는지 확인
      const profileCheckQuery = `
        SELECT
          a.ATTR1 as PROFILE_NAME,
          a.ATTR2 as SQL_TEXT_HASH,
          a.ATTR3 as FORCE_MATCHING
        FROM ${viewType === 'DBA' ? 'DBA' : 'USER'}_ADVISOR_ACTIONS a
        WHERE a.TASK_NAME = :task_name
        ${taskOwner && viewType === 'DBA' ? 'AND a.OWNER = :task_owner' : ''}
        AND a.COMMAND = 'ACCEPT_SQL_PROFILE'
        AND ROWNUM = 1
      `;

      const profileParams = taskOwner && viewType === 'DBA' ? [taskName, taskOwner] : [taskName];
      const profileResult = await executeQuery(config, profileCheckQuery, profileParams, { timeout: 5000 });

      if (profileResult.rows && profileResult.rows.length > 0) {
        canApplyProfile = true;
      }
    } catch {
      // 프로파일 체크 실패는 무시
    }

    // 기존 적용된 SQL Profile이 있는지 확인
    try {
      const existingProfileQuery = `
        SELECT p.NAME, p.STATUS, p.CREATED
        FROM DBA_SQL_PROFILES p
        WHERE p.NAME LIKE :task_pattern
        ORDER BY p.CREATED DESC
        ) WHERE ROWNUM <= 1
      `;
      const existingResult = await executeQuery(config, existingProfileQuery, [`%${taskName}%`], { timeout: 5000 });
      if (existingResult.rows && existingResult.rows.length > 0) {
        existingProfile = existingResult.rows[0];
      }
    } catch {
      // 기존 프로파일 확인 실패는 무시
    }

    // 통계 분석 정보 (sqltrpt.sql 스타일)
    let statisticsAnalysis = null;
    try {
      const statsQuery = `
        SELECT
          f.TYPE as FINDING_TYPE,
          f.MESSAGE as FINDING_MESSAGE,
          f.MORE_INFO as ADDITIONAL_INFO
        FROM ${viewType === 'DBA' ? 'DBA' : 'USER'}_ADVISOR_FINDINGS f
        WHERE f.TASK_NAME = :task_name
        ${taskOwner && viewType === 'DBA' ? 'AND f.OWNER = :task_owner' : ''}
        AND f.TYPE IN ('STATISTICS', 'STATS_ANALYSIS', 'STALE_STATS', 'MISSING_STATS')
      `;

      const statsParams = taskOwner && viewType === 'DBA' ? [taskName, taskOwner] : [taskName];
      const statsResult = await executeQuery(config, statsQuery, statsParams, { timeout: 10000 });

      if (statsResult.rows && statsResult.rows.length > 0) {
        statisticsAnalysis = {
          findings: statsResult.rows,
          hasStaleStats: statsResult.rows.some((r: any) => r.FINDING_TYPE === 'STALE_STATS'),
          hasMissingStats: statsResult.rows.some((r: any) => r.FINDING_TYPE === 'MISSING_STATS')
        };
      }
    } catch {
      // 통계 분석 실패는 무시
    }

    // 인덱스 권장사항 상세 정보
    let indexRecommendations = null;
    try {
      const indexQuery = `
        SELECT
          a.ATTR1 as INDEX_NAME,
          a.ATTR2 as TABLE_OWNER,
          a.ATTR3 as TABLE_NAME,
          a.ATTR4 as COLUMN_LIST,
          a.ATTR5 as INDEX_TYPE,
          a.MESSAGE as CREATE_STATEMENT
        FROM ${viewType === 'DBA' ? 'DBA' : 'USER'}_ADVISOR_ACTIONS a
        WHERE a.TASK_NAME = :task_name
        ${taskOwner && viewType === 'DBA' ? 'AND a.OWNER = :task_owner' : ''}
        AND a.COMMAND IN ('CREATE_INDEX', 'RETAIN_INDEX', 'REBUILD_INDEX')
        ORDER BY a.ACTION_ID
      `;

      const indexParams = taskOwner && viewType === 'DBA' ? [taskName, taskOwner] : [taskName];
      const indexResult = await executeQuery(config, indexQuery, indexParams, { timeout: 10000 });

      if (indexResult.rows && indexResult.rows.length > 0) {
        indexRecommendations = indexResult.rows;
      }
    } catch {
      // 인덱스 권장사항 조회 실패는 무시
    }

    // 응답 시간 계산
    const responseTime = Date.now() - startTime;

    // 튜닝 가이드 생성 (권장사항 유형에 따라 동적 생성)
    const tuningGuide = {
      title: 'SQL Tuning Advisor 결과 해석 가이드',
      summary: recommendations.length > 0
        ? `${recommendations.length}개의 튜닝 권장사항이 발견되었습니다.`
        : 'SQL이 이미 최적화되어 있거나 추가 튜닝이 필요하지 않습니다.',
      categories: {
        sql_profile: {
          name: 'SQL Profile',
          description: 'SQL 문장을 수정하지 않고 옵티마이저에게 더 나은 실행 계획을 선택하도록 힌트를 제공합니다.',
          when_to_use: '바인드 변수 페킹 문제, 통계 정보 부정확, 실행 계획 고정이 필요한 경우',
          impact: 'HIGH - 즉시 적용 가능하며 SQL 수정 불필요',
          available: canApplyProfile,
        },
        index: {
          name: '인덱스 권장',
          description: '쿼리 성능 향상을 위한 신규 인덱스 생성 또는 기존 인덱스 수정을 권장합니다.',
          when_to_use: 'Full Table Scan이 빈번하거나 정렬 작업이 많은 경우',
          impact: 'MEDIUM - DBA 검토 후 적용 필요',
          count: indexRecommendations?.length || 0,
        },
        statistics: {
          name: '통계 정보',
          description: '테이블/인덱스 통계가 오래되었거나 누락된 경우 통계 수집을 권장합니다.',
          when_to_use: '데이터 변경이 많았거나 통계 수집이 오래된 경우',
          impact: 'HIGH - 옵티마이저의 실행 계획 선택에 직접적 영향',
          hasIssues: statisticsAnalysis?.hasMissingStats || statisticsAnalysis?.hasStaleStats || false,
        },
      },
      next_steps: [
        recommendations.length === 0 ? '현재 SQL은 최적화되어 있습니다. 추가 튜닝이 필요하지 않습니다.' : null,
        canApplyProfile ? 'SQL Profile 적용을 통해 즉시 성능을 개선할 수 있습니다.' : null,
        (indexRecommendations?.length || 0) > 0 ? `${indexRecommendations?.length}개의 인덱스 생성을 검토해보세요.` : null,
        statisticsAnalysis?.hasMissingStats ? '누락된 테이블/인덱스 통계를 수집하세요.' : null,
        statisticsAnalysis?.hasStaleStats ? '오래된 통계 정보를 갱신하세요.' : null,
        '상세 리포트 탭에서 Oracle의 분석 결과를 확인하세요.',
      ].filter(Boolean),
      tips: [
        'SQL Profile은 SQL 수정 없이 적용 가능하며, 언제든지 비활성화할 수 있습니다.',
        '인덱스 생성 전 기존 인덱스와 중복되지 않는지 확인하세요.',
        'Force Match 옵션을 사용하면 리터럴 값이 다른 유사 SQL에도 Profile이 적용됩니다.',
        '정기적인 통계 수집은 옵티마이저 성능 유지에 필수적입니다.',
      ],
    };

    return NextResponse.json(
      {
        success: true,
        data: recommendations,
        count: recommendations.length,
        task_name: taskName,
        task_owner: taskOwner || recommendations[0]?.task_owner,
        task_status: taskStatus,
        execution_start: taskExecutionStart,
        execution_end: taskExecutionEnd,
        view_type: viewType,
        response_time_ms: responseTime,
        // 기본 리포트
        script: sqlTuningScript,
        report: sqlTuningReport,
        // sqltrpt.sql 스타일 추가 정보
        html_report: htmlReport,
        plan_comparison: planComparison,
        can_apply_profile: canApplyProfile,
        existing_profile: existingProfile,
        statistics_analysis: statisticsAnalysis,
        index_recommendations: indexRecommendations,
        // 튜닝 가이드
        tuning_guide: tuningGuide,
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=60',
        },
      }
    );
  } catch (error) {
    console.error('[SQL Tuning Recommendations] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch recommendations';

    // ORA 에러 코드별 사용자 친화적 메시지 제공
    if (errorMessage.includes('ORA-00942') || errorMessage.includes('does not exist')) {
      return NextResponse.json(
        {
          error: '권장사항을 조회할 수 없습니다. 작업이 완료되지 않았거나 권한이 부족할 수 있습니다.',
          details: errorMessage,
        },
        { status: 403 }
      );
    }

    if (errorMessage.includes('ORA-01013')) {
      return NextResponse.json(
        {
          error: '권장사항 조회 중 타임아웃이 발생했습니다. 작업이 아직 실행 중일 수 있습니다.',
          details: errorMessage,
        },
        { status: 408 }
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
