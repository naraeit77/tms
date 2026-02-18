import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * GET /api/advisor/sql-tuning/profiles
 * SQL Profile 목록 조회 및 관리
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');
    const sqlId = searchParams.get('sql_id'); // 옵션: 특정 SQL_ID의 프로파일만 조회

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    const config = await getOracleConfig(connectionId);

    // DBA_SQL_PROFILES 뷰에서 SQL Profile 목록 조회
    // USER_SQL_PROFILES로 폴백
    let query: string;
    let viewType = 'DBA';

    if (sqlId) {
      query = `
        SELECT
          NAME,
          CATEGORY,
          SIGNATURE,
          SQL_TEXT,
          TYPE,
          STATUS,
          FORCE_MATCHING,
          CREATED,
          LAST_MODIFIED,
          DESCRIPTION,
          TASK_ID,
          TASK_EXEC_NAME,
          TASK_OBJ_ID,
          TASK_REC_ID
        FROM DBA_SQL_PROFILES
        WHERE SQL_TEXT LIKE '%' || :sql_id || '%'
        ORDER BY CREATED DESC
      `;
    } else {
      query = `
        SELECT
          NAME,
          CATEGORY,
          SIGNATURE,
          SQL_TEXT,
          TYPE,
          STATUS,
          FORCE_MATCHING,
          CREATED,
          LAST_MODIFIED,
          DESCRIPTION,
          TASK_ID,
          TASK_EXEC_NAME,
          TASK_OBJ_ID,
          TASK_REC_ID
        FROM DBA_SQL_PROFILES
        ORDER BY CREATED DESC
      `;
    }

    let result;
    try {
      if (sqlId) {
        result = await executeQuery(config, query, [sqlId], { timeout: 10000 });
      } else {
        result = await executeQuery(config, query, [], { timeout: 10000 });
      }
    } catch (dbaError) {
      // DBA 뷰 실패 시 USER 뷰로 폴백
      viewType = 'USER';
      if (sqlId) {
        query = `
          SELECT
            NAME,
            CATEGORY,
            SIGNATURE,
            SQL_TEXT,
            TYPE,
            STATUS,
            FORCE_MATCHING,
            CREATED,
            LAST_MODIFIED,
            DESCRIPTION,
            TASK_ID,
            TASK_EXEC_NAME,
            TASK_OBJ_ID,
            TASK_REC_ID
          FROM USER_SQL_PROFILES
          WHERE SQL_TEXT LIKE '%' || :sql_id || '%'
          ORDER BY CREATED DESC
        `;
        result = await executeQuery(config, query, [sqlId], { timeout: 10000 });
      } else {
        query = `
          SELECT
            NAME,
            CATEGORY,
            SIGNATURE,
            SQL_TEXT,
            TYPE,
            STATUS,
            FORCE_MATCHING,
            CREATED,
            LAST_MODIFIED,
            DESCRIPTION,
            TASK_ID,
            TASK_EXEC_NAME,
            TASK_OBJ_ID,
            TASK_REC_ID
          FROM USER_SQL_PROFILES
          ORDER BY CREATED DESC
        `;
        result = await executeQuery(config, query, [], { timeout: 10000 });
      }
    }

    const profiles = result.rows.map((row: any) => {
      let sqlText = row.SQL_TEXT;
      if (sqlText && typeof sqlText !== 'string') {
        if (Buffer.isBuffer(sqlText)) {
          sqlText = sqlText.toString('utf-8');
        } else if (sqlText.toString) {
          sqlText = sqlText.toString();
        } else {
          sqlText = String(sqlText);
        }
      }

      return {
        name: row.NAME,
        category: row.CATEGORY,
        signature: row.SIGNATURE?.toString() || '',
        sql_text: sqlText || '',
        type: row.TYPE,
        status: row.STATUS,
        force_matching: row.FORCE_MATCHING === 'YES' || row.FORCE_MATCHING === 'Y',
        created: row.CREATED,
        last_modified: row.LAST_MODIFIED,
        description: row.DESCRIPTION,
        task_id: row.TASK_ID,
        task_exec_name: row.TASK_EXEC_NAME,
        task_obj_id: row.TASK_OBJ_ID,
        task_rec_id: row.TASK_REC_ID,
      };
    });

    return NextResponse.json({
      success: true,
      data: profiles,
      count: profiles.length,
      view_type: viewType,
    });
  } catch (error) {
    console.error('Error fetching SQL Profiles:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch SQL Profiles';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/advisor/sql-tuning/profiles
 * SQL Profile 삭제
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { connection_id, profile_name, force } = body;

    if (!connection_id || !profile_name) {
      return NextResponse.json(
        { error: 'Connection ID and profile name are required' },
        { status: 400 }
      );
    }

    const config = await getOracleConfig(connection_id);

    // SQL Profile 삭제
    const dropSQL = `
      BEGIN
        DBMS_SQLTUNE.DROP_SQL_PROFILE(
          name => :profile_name,
          ignore => ${force ? 'TRUE' : 'FALSE'}
        );
      END;
    `;

    await executeQuery(config, dropSQL, [profile_name], { timeout: 30000 });

    return NextResponse.json({
      success: true,
      message: `SQL Profile '${profile_name}'이(가) 삭제되었습니다.`,
    });
  } catch (error) {
    console.error('Error dropping SQL Profile:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to drop SQL Profile';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

