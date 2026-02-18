import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * GET /api/monitoring/sql-monitor
 * Oracle SQL Monitor 데이터 조회 (Enterprise Edition Only)
 */
export async function GET(request: NextRequest) {
  // 변수를 함수 스코프로 선언 (catch 블록에서도 접근 가능하도록)
  let isEnterprise = false;
  let editionInfo = 'Unknown';
  let licenseValue: string | null = null;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');
    const status = searchParams.get('status');
    const username = searchParams.get('username');

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connectionId);

    // Enterprise Edition 확인

    const editionCheckQuery = `
      SELECT
        BANNER,
        CASE
          WHEN BANNER LIKE '%Enterprise Edition%' THEN 'Y'
          ELSE 'N'
        END AS IS_ENTERPRISE
      FROM V$VERSION
      WHERE BANNER LIKE 'Oracle%'
    `;

    try {
      const editionResult = await executeQuery(config, editionCheckQuery);
      isEnterprise = editionResult.rows?.[0]?.IS_ENTERPRISE === 'Y';
      editionInfo = editionResult.rows?.[0]?.BANNER || 'Unknown';
      console.log('[SQL Monitor] Edition check:', { isEnterprise, editionInfo });
    } catch (error) {
      console.error('[SQL Monitor] Failed to check edition:', error);
      // Continue anyway - let the V$SQL_MONITOR query fail if not available
    }

    if (!isEnterprise) {
      console.log('[SQL Monitor] Not Enterprise Edition, but continuing to check V$SQL_MONITOR availability');
    }

    // Diagnostic and Tuning Pack 라이센스 확인
    try {
      const licenseCheckQuery = `
        SELECT VALUE
        FROM V$PARAMETER
        WHERE NAME = 'control_management_pack_access'
      `;

      const licenseResult = await executeQuery(config, licenseCheckQuery);
      licenseValue = licenseResult.rows?.[0]?.VALUE;
      console.log('[SQL Monitor] License check:', licenseValue);

      if (licenseValue !== 'DIAGNOSTIC+TUNING') {
        console.log('[SQL Monitor] License not set to DIAGNOSTIC+TUNING, but continuing to try V$SQL_MONITOR');
      }
    } catch (error) {
      console.error('[SQL Monitor] Failed to check license:', error);
      // Continue anyway
    }

    // SQL Monitor 데이터 조회 - 최근 1시간 데이터 가져오기
    // Oracle SQL Monitor는 다음 조건을 만족하는 SQL만 자동 캡처:
    // 1. 5초 이상의 CPU 시간 또는 경과 시간
    // 2. 병렬 처리 SQL
    // 3. /*+ MONITOR */ 힌트 사용 SQL
    let query = `
      SELECT * FROM (
        SELECT
          m.KEY,
          m.SQL_ID,
          m.SQL_EXEC_ID,
          m.SQL_EXEC_START,
          m.STATUS,
          m.USERNAME,
          m.MODULE,
          m.ACTION,
          m.SERVICE_NAME,
          m.ELAPSED_TIME / 1000 AS DURATION,  -- microseconds to milliseconds
          m.CPU_TIME / 1000 AS CPU_TIME,      -- microseconds to milliseconds
          m.ELAPSED_TIME / 1000 AS ELAPSED_TIME, -- microseconds to milliseconds
          m.BUFFER_GETS,
          m.DISK_READS,
          m.FETCHES,
          m.IO_INTERCONNECT_BYTES,
          m.PHYSICAL_READ_BYTES,
          m.PHYSICAL_WRITE_BYTES,
          m.ERROR_MESSAGE,
          m.SQL_PLAN_HASH_VALUE AS PLAN_HASH_VALUE,
          m.PX_SERVERS_REQUESTED AS PARALLEL_DEGREE,
          m.PX_SERVERS_ALLOCATED AS PARALLEL_INSTANCES,
          m.REFRESH_COUNT,
          s.SQL_TEXT
        FROM
          V$SQL_MONITOR m
          LEFT JOIN V$SQL s ON m.SQL_ID = s.SQL_ID
        WHERE
          m.SQL_EXEC_START >= SYSDATE - 1/24
    `;

    // 필터 적용 (SQL Injection 방지: 화이트리스트 검증)
    const validStatuses = ['EXECUTING', 'DONE', 'DONE (ERROR)', 'DONE (ALL ROWS)', 'DONE (FIRST N ROWS)', 'QUEUED'];
    if (status && status !== 'all') {
      const upperStatus = status.toUpperCase();
      if (validStatuses.includes(upperStatus)) {
        query += ` AND m.STATUS = '${upperStatus}'`;
      }
    }

    // username 필터는 특수문자 제거 후 적용 (SQL Injection 방지)
    if (username) {
      const sanitizedUsername = username.replace(/[^a-zA-Z0-9_]/g, '');
      if (sanitizedUsername) {
        query += ` AND UPPER(m.USERNAME) LIKE UPPER('%${sanitizedUsername}%')`;
      }
    }

    query += ` ORDER BY m.SQL_EXEC_START DESC
      ) WHERE ROWNUM <= 100`;  // 최근 100개로 제한

    console.log('[SQL Monitor API] Executing query for connection:', connectionId);
    console.log('[SQL Monitor API] Query filters - Status:', status || 'all', ', Username:', username || 'all');

    let result;
    try {
      result = await executeQuery(config, query);
      console.log('[SQL Monitor API] Query executed successfully, rows returned:', result.rows?.length || 0);
    } catch (queryError: any) {
      console.error('[SQL Monitor API] Query execution error:', queryError);

      // V$SQL_MONITOR 뷰가 없는 경우 (Enterprise Edition이 아니거나 권한 없음)
      if (queryError.message?.includes('ORA-00942')) {
        return NextResponse.json(
          {
            error: 'V$SQL_MONITOR view not available. Enterprise Edition with Diagnostic and Tuning Pack required.',
            isEnterprise: false,
            edition: editionInfo,
            currentLicense: licenseValue
          },
          { status: 400 }
        );
      }

      throw queryError; // Re-throw for general error handling
    }

    // 데이터 변환
    const entries = (result.rows || []).map((row: any) => ({
      key: row.KEY,
      sql_id: row.SQL_ID,
      sql_exec_id: Number(row.SQL_EXEC_ID),
      sql_exec_start: row.SQL_EXEC_START,
      status: row.STATUS,
      username: row.USERNAME,
      module: row.MODULE,
      action: row.ACTION,
      service_name: row.SERVICE_NAME,
      duration: row.DURATION ? Math.floor(Number(row.DURATION)) : null,
      cpu_time: row.CPU_TIME ? Math.floor(Number(row.CPU_TIME)) : null,
      elapsed_time: row.ELAPSED_TIME ? Math.floor(Number(row.ELAPSED_TIME)) : null,
      buffer_gets: row.BUFFER_GETS ? Number(row.BUFFER_GETS) : null,
      disk_reads: row.DISK_READS ? Number(row.DISK_READS) : null,
      fetches: row.FETCHES ? Number(row.FETCHES) : null,
      io_interconnect_bytes: row.IO_INTERCONNECT_BYTES ? Number(row.IO_INTERCONNECT_BYTES) : null,
      physical_read_bytes: row.PHYSICAL_READ_BYTES ? Number(row.PHYSICAL_READ_BYTES) : null,
      physical_write_bytes: row.PHYSICAL_WRITE_BYTES ? Number(row.PHYSICAL_WRITE_BYTES) : null,
      sql_text: row.SQL_TEXT ? row.SQL_TEXT.substring(0, 500) : null,
      error_message: row.ERROR_MESSAGE,
      plan_hash_value: row.PLAN_HASH_VALUE ? Number(row.PLAN_HASH_VALUE) : null,
      parallel_degree: row.PARALLEL_DEGREE ? Number(row.PARALLEL_DEGREE) : null,
      parallel_instances: row.PARALLEL_INSTANCES ? Number(row.PARALLEL_INSTANCES) : null,
      refresh_count: row.REFRESH_COUNT ? Number(row.REFRESH_COUNT) : null,
    }));

    console.log(`[SQL Monitor API] Found ${entries.length} SQL Monitor entries`);

    return NextResponse.json({
      success: true,
      data: entries,
      count: entries.length,
      isEnterprise: isEnterprise,
      edition: editionInfo,
      license: licenseValue,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('SQL Monitor API error:', error);

    // Oracle 오류 처리
    if (error instanceof Error) {
      if (error.message.includes('ORA-00942')) {
        return NextResponse.json(
          {
            error: 'V$SQL_MONITOR view not available. Enterprise Edition with Diagnostic and Tuning Pack required.',
            isEnterprise: false,
            edition: editionInfo,
            currentLicense: licenseValue
          },
          { status: 400 }
        );
      }

      // 기타 Oracle 에러
      return NextResponse.json(
        {
          error: error.message || 'Failed to fetch SQL Monitor data',
          isEnterprise: isEnterprise,
          edition: editionInfo,
          currentLicense: licenseValue
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch SQL Monitor data' },
      { status: 500 }
    );
  }
}