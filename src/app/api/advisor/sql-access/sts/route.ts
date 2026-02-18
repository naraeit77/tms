import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * POST /api/advisor/sql-access/sts
 * SQL Tuning Set (STS) 생성
 * AWR 또는 Cursor Cache 기반으로 STS 생성
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
      sts_name,
      source_type, // 'AWR' | 'CURSOR_CACHE'
      awr_snapshot_start,
      awr_snapshot_end,
      cursor_cache_filter, // 예: 'elapsed_time > 5000000' (5초 이상)
      limit,
    } = body;

    if (!connection_id || !sts_name || !source_type) {
      return NextResponse.json(
        { error: 'Connection ID, STS name, and source type are required' },
        { status: 400 }
      );
    }

    const config = await getOracleConfig(connection_id);

    // 기존 STS 삭제 시도
    try {
      await executeQuery(config, `
        BEGIN
          DBMS_SQLTUNE.DROP_SQLSET(sqlset_name => :1);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      `, [sts_name], { timeout: 10000 });
    } catch {
      // 무시
    }

    // STS 생성
    await executeQuery(config, `
      DECLARE
        l_sqlset_name VARCHAR2(128) := :sts_name;
        l_sqlset_cur DBMS_SQLTUNE.SQLSET_CURSOR;
      BEGIN
        -- STS 생성
        DBMS_SQLTUNE.CREATE_SQLSET(
          sqlset_name => l_sqlset_name,
          description => 'STS created via TMS for SQL Access Advisor'
        );

        -- 소스에 따라 SQL 수집
        IF :source_type = 'CURSOR_CACHE' THEN
          -- Cursor Cache에서 SQL 수집
          OPEN l_sqlset_cur FOR
            SELECT VALUE(a)
            FROM TABLE(DBMS_SQLTUNE.SELECT_CURSOR_CACHE(
              basic_filter => :cursor_filter,
              ranking_measure1 => 'elapsed_time',
              result_limit => :limit_val
            )) a;
          
          DBMS_SQLTUNE.LOAD_SQLSET(
            sqlset_name => l_sqlset_name,
            populate_cursor => l_sqlset_cur
          );
          
        ELSIF :source_type = 'AWR' THEN
          -- AWR에서 SQL 수집
          OPEN l_sqlset_cur FOR
            SELECT VALUE(a)
            FROM TABLE(DBMS_SQLTUNE.SELECT_WORKLOAD_REPOSITORY(
              begin_snap => :snap_start,
              end_snap => :snap_end,
              basic_filter => :cursor_filter,
              ranking_measure1 => 'elapsed_time',
              result_limit => :limit_val
            )) a;
          
          DBMS_SQLTUNE.LOAD_SQLSET(
            sqlset_name => l_sqlset_name,
            populate_cursor => l_sqlset_cur
          );
        END IF;
      END;
    `, [
      sts_name,
      source_type,
      cursor_cache_filter || 'elapsed_time > 0',
      limit || 50,
      awr_snapshot_start || null,
      awr_snapshot_end || null,
      cursor_cache_filter || 'elapsed_time > 0',
      limit || 50,
    ], { timeout: 120000 });

    // STS에 포함된 SQL 개수 조회
    const countQuery = `
      SELECT COUNT(*) as SQL_COUNT
      FROM DBA_SQLSET_STATEMENTS
      WHERE SQLSET_NAME = :sts_name
    `;

    let sqlCount = 0;
    try {
      const countResult = await executeQuery(config, countQuery, [sts_name], { timeout: 10000 });
      sqlCount = countResult.rows[0]?.SQL_COUNT || 0;
    } catch {
      // USER_SQLSET_STATEMENTS로 폴백
      try {
        const userCountQuery = `
          SELECT COUNT(*) as SQL_COUNT
          FROM USER_SQLSET_STATEMENTS
          WHERE SQLSET_NAME = :sts_name
        `;
        const userCountResult = await executeQuery(config, userCountQuery, [sts_name], { timeout: 10000 });
        sqlCount = userCountResult.rows[0]?.SQL_COUNT || 0;
      } catch {
        sqlCount = 0;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        sts_name,
        source_type,
        sql_count: sqlCount,
      },
      message: `STS '${sts_name}'이(가) 생성되었습니다. ${sqlCount}개의 SQL이 포함되었습니다.`,
    });
  } catch (error) {
    console.error('Error creating STS:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create STS';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET /api/advisor/sql-access/sts
 * STS 목록 조회
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

    // STS 목록 조회
    const query = `
      SELECT
        s.NAME,
        s.OWNER,
        s.DESCRIPTION,
        s.CREATED,
        COUNT(st.SQL_ID) as SQL_COUNT
      FROM DBA_SQLSETS s
      LEFT JOIN DBA_SQLSET_STATEMENTS st ON s.NAME = st.SQLSET_NAME AND s.OWNER = st.OWNER
      GROUP BY s.NAME, s.OWNER, s.DESCRIPTION, s.CREATED
      ORDER BY s.CREATED DESC
    `;

    let result;
    try {
      result = await executeQuery(config, query, [], { timeout: 10000 });
    } catch (dbaError) {
      // USER 뷰로 폴백
      try {
        const userQuery = `
          SELECT
            s.NAME,
            USER as OWNER,
            s.DESCRIPTION,
            s.CREATED,
            COUNT(st.SQL_ID) as SQL_COUNT
          FROM USER_SQLSETS s
          LEFT JOIN USER_SQLSET_STATEMENTS st ON s.NAME = st.SQLSET_NAME
          GROUP BY s.NAME, s.DESCRIPTION, s.CREATED
          ORDER BY s.CREATED DESC
        `;
        result = await executeQuery(config, userQuery, [], { timeout: 10000 });
      } catch (userError) {
        // 둘 다 실패하면 빈 결과 반환 (권한 부족으로 간주)
        console.warn('[STS List] Failed to query STS:', dbaError, userError);
        return NextResponse.json({
          success: true,
          data: [],
          count: 0,
          message: 'STS 목록을 조회할 권한이 없거나 STS가 없습니다.',
        });
      }
    }

    const stsList = result.rows.map((row: any) => ({
      name: row.NAME,
      owner: row.OWNER,
      description: row.DESCRIPTION,
      created: row.CREATED,
      sql_count: Math.floor(Number(row.SQL_COUNT) || 0),
    }));

    return NextResponse.json({
      success: true,
      data: stsList,
      count: stsList.length,
    });
  } catch (error) {
    console.error('Error fetching STS list:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch STS list';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

