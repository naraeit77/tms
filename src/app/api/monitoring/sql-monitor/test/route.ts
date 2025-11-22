import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * GET /api/monitoring/sql-monitor/test
 * SQL Monitor 기능 테스트 및 디버깅
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
    const results: any = {
      connectionId,
      timestamp: new Date().toISOString(),
      tests: []
    };

    // 1. Oracle Version 확인
    try {
      const versionQuery = `SELECT BANNER FROM V$VERSION WHERE ROWNUM = 1`;
      const versionResult = await executeQuery(config, versionQuery);
      results.tests.push({
        test: 'Oracle Version',
        status: 'success',
        result: versionResult.rows?.[0]?.BANNER,
        isEnterprise: versionResult.rows?.[0]?.BANNER?.includes('Enterprise Edition')
      });
    } catch (error: any) {
      results.tests.push({
        test: 'Oracle Version',
        status: 'error',
        error: error.message
      });
    }

    // 2. Control Management Pack Access 확인
    try {
      const licenseQuery = `
        SELECT
          NAME,
          VALUE,
          DESCRIPTION
        FROM V$PARAMETER
        WHERE NAME = 'control_management_pack_access'
      `;
      const licenseResult = await executeQuery(config, licenseQuery);
      results.tests.push({
        test: 'License Parameter',
        status: 'success',
        result: licenseResult.rows?.[0],
        isDiagnosticTuning: licenseResult.rows?.[0]?.VALUE === 'DIAGNOSTIC+TUNING'
      });
    } catch (error: any) {
      results.tests.push({
        test: 'License Parameter',
        status: 'error',
        error: error.message
      });
    }

    // 3. V$SQL_MONITOR 뷰 접근 권한 확인
    try {
      const privilegeQuery = `
        SELECT COUNT(*) AS CNT
        FROM USER_TAB_PRIVS
        WHERE TABLE_NAME = 'V_$SQL_MONITOR'
           OR TABLE_NAME = 'V$SQL_MONITOR'
      `;
      const privResult = await executeQuery(config, privilegeQuery);

      // 직접 V$SQL_MONITOR 접근 시도
      const directQuery = `
        SELECT COUNT(*) AS CNT
        FROM V$SQL_MONITOR
        WHERE ROWNUM = 1
      `;
      const directResult = await executeQuery(config, directQuery);

      results.tests.push({
        test: 'V$SQL_MONITOR Access',
        status: 'success',
        privilege_count: privResult.rows?.[0]?.CNT,
        can_access: true,
        row_count: directResult.rows?.[0]?.CNT
      });
    } catch (error: any) {
      results.tests.push({
        test: 'V$SQL_MONITOR Access',
        status: 'error',
        error: error.message,
        error_code: error.errorNum || 'N/A'
      });
    }

    // 4. V$SQL_MONITOR 데이터 확인 (상세)
    try {
      const monitorQuery = `
        SELECT
          COUNT(*) AS TOTAL_COUNT,
          COUNT(DISTINCT SQL_ID) AS UNIQUE_SQL_COUNT,
          MIN(SQL_EXEC_START) AS OLDEST_EXEC,
          MAX(SQL_EXEC_START) AS NEWEST_EXEC,
          COUNT(CASE WHEN ELAPSED_TIME >= 5000000 THEN 1 END) AS COUNT_5SEC_ELAPSED,
          COUNT(CASE WHEN CPU_TIME >= 5000000 THEN 1 END) AS COUNT_5SEC_CPU,
          COUNT(CASE WHEN PX_SERVERS_REQUESTED > 1 THEN 1 END) AS COUNT_PARALLEL,
          COUNT(CASE WHEN STATUS = 'EXECUTING' THEN 1 END) AS COUNT_EXECUTING,
          COUNT(CASE WHEN STATUS = 'DONE' THEN 1 END) AS COUNT_DONE
        FROM V$SQL_MONITOR
        WHERE SQL_EXEC_START >= SYSDATE - 1
      `;
      const monitorResult = await executeQuery(config, monitorQuery);
      results.tests.push({
        test: 'V$SQL_MONITOR Data Statistics',
        status: 'success',
        result: monitorResult.rows?.[0],
        info: {
          note: 'ELAPSED_TIME and CPU_TIME are in microseconds (5000000 = 5 seconds)',
          last_24_hours: true
        }
      });
    } catch (error: any) {
      results.tests.push({
        test: 'V$SQL_MONITOR Data Statistics',
        status: 'error',
        error: error.message
      });
    }

    // 5. 샘플 SQL Monitor 데이터 가져오기 (상세)
    try {
      const sampleQuery = `
        SELECT * FROM (
          SELECT
            SQL_ID,
            SQL_EXEC_ID,
            SQL_EXEC_START,
            STATUS,
            USERNAME,
            ELAPSED_TIME,
            CPU_TIME,
            ROUND(ELAPSED_TIME / 1000000, 2) AS ELAPSED_SEC,
            ROUND(CPU_TIME / 1000000, 2) AS CPU_SEC,
            PX_SERVERS_REQUESTED,
            MODULE,
            CASE
              WHEN ELAPSED_TIME >= 5000000 THEN 'YES (ELAPSED >= 5s)'
              WHEN CPU_TIME >= 5000000 THEN 'YES (CPU >= 5s)'
              WHEN PX_SERVERS_REQUESTED > 1 THEN 'YES (PARALLEL)'
              ELSE 'MONITOR_HINT_OR_OTHER'
            END AS CAPTURE_REASON
          FROM V$SQL_MONITOR
          WHERE SQL_EXEC_START >= SYSDATE - 1
          ORDER BY SQL_EXEC_START DESC
        )
        WHERE ROWNUM <= 10
      `;
      const sampleResult = await executeQuery(config, sampleQuery);
      results.tests.push({
        test: 'Sample SQL Monitor Data (Last 24h)',
        status: 'success',
        count: sampleResult.rows?.length || 0,
        samples: sampleResult.rows,
        info: {
          note: 'Shows top 10 most recent SQL Monitor entries with capture reason',
          elapsed_cpu_in_seconds: true
        }
      });
    } catch (error: any) {
      results.tests.push({
        test: 'Sample SQL Monitor Data (Last 24h)',
        status: 'error',
        error: error.message
      });
    }

    // 6. DBMS_SQLTUNE 패키지 확인
    try {
      const packageQuery = `
        SELECT
          OBJECT_NAME,
          OBJECT_TYPE,
          STATUS
        FROM ALL_OBJECTS
        WHERE OBJECT_NAME = 'DBMS_SQLTUNE'
          AND OBJECT_TYPE IN ('PACKAGE', 'PACKAGE BODY')
        ORDER BY OBJECT_TYPE
      `;
      const packageResult = await executeQuery(config, packageQuery);
      results.tests.push({
        test: 'DBMS_SQLTUNE Package',
        status: 'success',
        result: packageResult.rows
      });
    } catch (error: any) {
      results.tests.push({
        test: 'DBMS_SQLTUNE Package',
        status: 'error',
        error: error.message
      });
    }

    // 7. 현재 사용자 권한 확인
    try {
      const userQuery = `
        SELECT
          USER AS CURRENT_USER,
          SYS_CONTEXT('USERENV', 'SESSION_USER') AS SESSION_USER,
          SYS_CONTEXT('USERENV', 'DB_NAME') AS DB_NAME
        FROM DUAL
      `;
      const userResult = await executeQuery(config, userQuery);
      results.tests.push({
        test: 'Current User Info',
        status: 'success',
        result: userResult.rows?.[0]
      });
    } catch (error: any) {
      results.tests.push({
        test: 'Current User Info',
        status: 'error',
        error: error.message
      });
    }

    // 8. SQL Monitor 관련 권한 확인
    try {
      const grantQuery = `
        SELECT
          PRIVILEGE,
          ADMIN_OPTION
        FROM USER_SYS_PRIVS
        WHERE PRIVILEGE IN (
          'SELECT ANY DICTIONARY',
          'SELECT_CATALOG_ROLE',
          'SELECT ANY TABLE'
        )
      `;
      const grantResult = await executeQuery(config, grantQuery);
      results.tests.push({
        test: 'System Privileges',
        status: 'success',
        privileges: grantResult.rows
      });
    } catch (error: any) {
      results.tests.push({
        test: 'System Privileges',
        status: 'error',
        error: error.message
      });
    }

    // 9. SQL Monitor 관련 파라미터 확인
    try {
      const paramQuery = `
        SELECT
          NAME,
          VALUE,
          DESCRIPTION
        FROM V$PARAMETER
        WHERE NAME IN (
          'statistics_level',
          'sql_trace',
          'timed_statistics'
        )
        ORDER BY NAME
      `;
      const paramResult = await executeQuery(config, paramQuery);
      results.tests.push({
        test: 'SQL Monitor Parameters',
        status: 'success',
        parameters: paramResult.rows,
        info: {
          note: 'statistics_level should be TYPICAL or ALL for SQL Monitor to work',
          required: 'statistics_level = TYPICAL or ALL'
        }
      });
    } catch (error: any) {
      results.tests.push({
        test: 'SQL Monitor Parameters',
        status: 'error',
        error: error.message
      });
    }

    // 10. 실제 5초 이상 실행된 SQL 확인 (V$SQL_MONITOR 기준)
    try {
      const longRunQuery = `
        SELECT
          COUNT(*) AS TOTAL,
          COUNT(CASE WHEN ELAPSED_TIME >= 5000000 THEN 1 END) AS COUNT_5SEC_ELAPSED,
          COUNT(CASE WHEN CPU_TIME >= 5000000 THEN 1 END) AS COUNT_5SEC_CPU,
          MIN(ROUND(ELAPSED_TIME/1000000, 2)) AS MIN_ELAPSED_SEC,
          MAX(ROUND(ELAPSED_TIME/1000000, 2)) AS MAX_ELAPSED_SEC,
          AVG(ROUND(ELAPSED_TIME/1000000, 2)) AS AVG_ELAPSED_SEC
        FROM V$SQL_MONITOR
        WHERE SQL_EXEC_START >= SYSDATE - 1/24
      `;
      const longRunResult = await executeQuery(config, longRunQuery);
      results.tests.push({
        test: 'Long Running SQL Analysis (Last 1 hour)',
        status: 'success',
        result: longRunResult.rows?.[0],
        info: {
          note: 'Analysis of SQL Monitor entries from last hour',
          threshold: '5 seconds (5000000 microseconds)'
        }
      });
    } catch (error: any) {
      results.tests.push({
        test: 'Long Running SQL Analysis (Last 1 hour)',
        status: 'error',
        error: error.message
      });
    }

    // 결과 요약
    const summary: any = {
      totalTests: results.tests.length,
      successful: results.tests.filter((t: any) => t.status === 'success').length,
      failed: results.tests.filter((t: any) => t.status === 'error').length,
      canUseSQLMonitor: false,
      issues: [],
      warnings: []
    };

    // SQL Monitor 사용 가능 여부 판단
    const versionTest = results.tests.find((t: any) => t.test === 'Oracle Version');
    const licenseTest = results.tests.find((t: any) => t.test === 'License Parameter');
    const accessTest = results.tests.find((t: any) => t.test === 'V$SQL_MONITOR Access');
    const packageTest = results.tests.find((t: any) => t.test === 'DBMS_SQLTUNE Package');
    const statsTest = results.tests.find((t: any) => t.test === 'V$SQL_MONITOR Data Statistics');
    const paramTest = results.tests.find((t: any) => t.test === 'SQL Monitor Parameters');
    const longRunTest = results.tests.find((t: any) => t.test === 'Long Running SQL Analysis (Last 1 hour)');

    if (versionTest?.status === 'error') {
      summary.issues.push('Oracle 버전을 확인할 수 없습니다');
    } else if (!versionTest?.isEnterprise) {
      summary.issues.push('Enterprise Edition이 아닙니다');
    }

    if (licenseTest?.status === 'error') {
      summary.issues.push('라이센스 파라미터를 확인할 수 없습니다');
    } else if (!licenseTest?.isDiagnosticTuning) {
      summary.issues.push(`라이센스가 DIAGNOSTIC+TUNING이 아닙니다 (현재: ${licenseTest?.result?.VALUE || 'NONE'})`);
    }

    if (accessTest?.status === 'error') {
      summary.issues.push(`V$SQL_MONITOR 접근 불가: ${accessTest?.error}`);
    }

    if (packageTest?.status === 'error') {
      summary.issues.push('DBMS_SQLTUNE 패키지를 확인할 수 없습니다');
    } else if (!packageTest?.result || packageTest.result.length === 0) {
      summary.issues.push('DBMS_SQLTUNE 패키지가 설치되지 않았습니다');
    }

    // 파라미터 확인
    if (paramTest?.status === 'success') {
      const statsLevel = paramTest.parameters?.find((p: any) => p.NAME === 'statistics_level');
      if (statsLevel && statsLevel.VALUE !== 'TYPICAL' && statsLevel.VALUE !== 'ALL') {
        summary.warnings.push(`statistics_level이 ${statsLevel.VALUE}입니다. TYPICAL 또는 ALL로 설정되어야 합니다.`);
      }
    }

    // 데이터 통계 확인
    if (statsTest?.status === 'success') {
      const totalCount = statsTest.result?.TOTAL_COUNT || 0;
      const count5SecElapsed = statsTest.result?.COUNT_5SEC_ELAPSED || 0;
      const count5SecCPU = statsTest.result?.COUNT_5SEC_CPU || 0;

      summary.dataStatistics = {
        total: totalCount,
        fiveSecElapsed: count5SecElapsed,
        fiveSecCPU: count5SecCPU,
        parallel: statsTest.result?.COUNT_PARALLEL || 0
      };

      if (totalCount === 0) {
        summary.warnings.push('최근 24시간 내 V$SQL_MONITOR에 데이터가 없습니다. SQL Monitor가 활성화되지 않았을 수 있습니다.');
      } else if (count5SecElapsed === 0 && count5SecCPU === 0) {
        summary.warnings.push(`V$SQL_MONITOR에 ${totalCount}건의 데이터가 있지만, 5초 이상 실행된 SQL은 없습니다. MONITOR 힌트나 병렬 처리 SQL만 캡처되고 있습니다.`);
      }
    }

    // 최근 1시간 데이터 확인
    if (longRunTest?.status === 'success') {
      const hourTotal = longRunTest.result?.TOTAL || 0;
      const hourCount5Sec = longRunTest.result?.COUNT_5SEC_ELAPSED || 0;

      summary.lastHourStatistics = {
        total: hourTotal,
        fiveSecElapsed: hourCount5Sec,
        maxElapsedSec: longRunTest.result?.MAX_ELAPSED_SEC || 0
      };

      if (hourTotal === 0) {
        summary.warnings.push('최근 1시간 내 V$SQL_MONITOR에 데이터가 없습니다.');
      }
    }

    summary.canUseSQLMonitor =
      versionTest?.isEnterprise === true &&
      licenseTest?.isDiagnosticTuning === true &&
      accessTest?.status === 'success' &&
      packageTest?.result?.length > 0;

    results.summary = summary;

    return NextResponse.json({
      success: true,
      data: results
    });

  } catch (error) {
    console.error('SQL Monitor test API error:', error);
    return NextResponse.json(
      {
        error: 'Test failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}