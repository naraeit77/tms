import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * POST /api/advisor/sql-tuning/apply-profile
 * SQL Profile 자동 적용 (sqltrpt.sql의 ACCEPT_SQL_PROFILE 기능)
 *
 * Oracle's DBMS_SQLTUNE.ACCEPT_SQL_PROFILE을 사용하여
 * SQL Tuning Advisor가 권장한 SQL Profile을 적용합니다.
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
      task_owner,
      profile_name,
      profile_type = 'REGULAR', // REGULAR 또는 PX (Parallel Execution)
      force_match = false, // SQL 리터럴 값 변경에도 매칭 적용
      category = 'DEFAULT',
      description
    } = body;

    if (!connection_id || !task_name) {
      return NextResponse.json(
        { error: 'Connection ID and task name are required' },
        { status: 400 }
      );
    }

    const config = await getOracleConfig(connection_id);

    // SQL Profile 적용 PL/SQL
    // force_match가 true면 SQL 리터럴이 달라도 매칭 (SQL 시그니처 기반)
    const applyProfileSQL = `
      DECLARE
        v_profile_name VARCHAR2(128);
        v_sql_text CLOB;
        v_description VARCHAR2(500) := :p_description;
      BEGIN
        -- SQL Profile 적용
        v_profile_name := DBMS_SQLTUNE.ACCEPT_SQL_PROFILE(
          task_name   => :task_name,
          task_owner  => ${task_owner ? ':task_owner' : 'NULL'},
          name        => ${profile_name ? ':profile_name' : 'NULL'},
          description => NVL(v_description, 'Created by TMS SQL Tuning Advisor'),
          category    => :category,
          force_match => ${force_match ? 'TRUE' : 'FALSE'},
          profile_type => :profile_type
        );

        -- 생성된 SQL Profile 정보 조회
        :out_profile_name := v_profile_name;
      END;
    `;

    // 바인드 파라미터 구성
    const bindParams: any = {
      task_name: task_name,
      p_description: description || null,
      category: category,
      profile_type: profile_type,
      out_profile_name: { dir: 3003, type: 2001, maxSize: 128 } // BIND_OUT, STRING
    };

    if (task_owner) {
      bindParams.task_owner = task_owner;
    }
    if (profile_name) {
      bindParams.profile_name = profile_name;
    }

    const result = await executeQuery(config, applyProfileSQL, bindParams, {
      timeout: 60000,
      autoCommit: true
    });

    const createdProfileName = result.outBinds?.out_profile_name;

    // 생성된 SQL Profile 상세 정보 조회
    let profileDetails = null;
    if (createdProfileName) {
      try {
        const detailsQuery = `
          SELECT
            NAME,
            CATEGORY,
            SIGNATURE,
            SQL_TEXT,
            CREATED,
            LAST_MODIFIED,
            DESCRIPTION,
            TYPE,
            STATUS,
            FORCE_MATCHING
          FROM DBA_SQL_PROFILES
          WHERE NAME = :profile_name
        `;
        const detailsResult = await executeQuery(config, detailsQuery, [createdProfileName], {
          timeout: 10000
        });
        profileDetails = detailsResult.rows[0] || null;
      } catch {
        // USER 뷰로 폴백
        try {
          const userDetailsQuery = `
            SELECT
              NAME,
              CATEGORY,
              SIGNATURE,
              SQL_TEXT,
              CREATED,
              LAST_MODIFIED,
              DESCRIPTION,
              TYPE,
              STATUS,
              FORCE_MATCHING
            FROM USER_SQL_PROFILES
            WHERE NAME = :profile_name
          `;
          const userDetailsResult = await executeQuery(config, userDetailsQuery, [createdProfileName], {
            timeout: 10000
          });
          profileDetails = userDetailsResult.rows[0] || null;
        } catch {
          // 상세 정보 조회 실패는 무시
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        profile_name: createdProfileName,
        task_name,
        category,
        force_match,
        profile_type,
        details: profileDetails
      },
      message: `SQL Profile '${createdProfileName}'이(가) 성공적으로 적용되었습니다.`
    });

  } catch (error) {
    console.error('Error applying SQL Profile:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to apply SQL Profile';

    // 특정 오류에 대한 사용자 친화적 메시지
    if (errorMessage.includes('ORA-13831')) {
      return NextResponse.json(
        { error: '이 작업에서 SQL Profile을 생성할 수 없습니다. 권장사항이 없거나 이미 적용되었을 수 있습니다.' },
        { status: 400 }
      );
    }

    if (errorMessage.includes('ORA-13846')) {
      return NextResponse.json(
        { error: '동일한 이름의 SQL Profile이 이미 존재합니다.' },
        { status: 409 }
      );
    }

    if (errorMessage.includes('ORA-06550') || errorMessage.includes('PLS-')) {
      return NextResponse.json(
        { error: 'SQL Profile 적용 권한이 없습니다. DBA 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/advisor/sql-tuning/apply-profile
 * SQL Profile 삭제
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { connection_id, profile_name, ignore_errors = true } = body;

    if (!connection_id || !profile_name) {
      return NextResponse.json(
        { error: 'Connection ID and profile name are required' },
        { status: 400 }
      );
    }

    const config = await getOracleConfig(connection_id);

    const dropProfileSQL = `
      BEGIN
        DBMS_SQLTUNE.DROP_SQL_PROFILE(
          name         => :profile_name,
          ignore       => ${ignore_errors ? 'TRUE' : 'FALSE'}
        );
      END;
    `;

    await executeQuery(config, dropProfileSQL, [profile_name], {
      timeout: 30000,
      autoCommit: true
    });

    return NextResponse.json({
      success: true,
      message: `SQL Profile '${profile_name}'이(가) 삭제되었습니다.`
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

/**
 * GET /api/advisor/sql-tuning/apply-profile
 * SQL Profile 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');
    const category = searchParams.get('category');

    if (!connectionId) {
      return NextResponse.json(
        { error: 'Connection ID is required' },
        { status: 400 }
      );
    }

    const config = await getOracleConfig(connectionId);

    let profilesQuery = `
      SELECT
        NAME,
        CATEGORY,
        SIGNATURE,
        SQL_TEXT,
        CREATED,
        LAST_MODIFIED,
        DESCRIPTION,
        TYPE,
        STATUS,
        FORCE_MATCHING
      FROM DBA_SQL_PROFILES
      WHERE 1=1
    `;
    const params: string[] = [];

    if (category) {
      profilesQuery += ' AND CATEGORY = :category';
      params.push(category);
    }

    profilesQuery += ' ORDER BY CREATED DESC';

    let result;
    try {
      result = await executeQuery(config, profilesQuery, params, { timeout: 30000 });
    } catch {
      // USER 뷰로 폴백
      profilesQuery = profilesQuery.replace('DBA_SQL_PROFILES', 'USER_SQL_PROFILES');
      result = await executeQuery(config, profilesQuery, params, { timeout: 30000 });
    }

    return NextResponse.json({
      success: true,
      data: result.rows || [],
      count: result.rows?.length || 0
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
