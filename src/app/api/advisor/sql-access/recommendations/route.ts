import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import oracledb from 'oracledb';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * GET /api/advisor/sql-access/recommendations
 * SQL Access Advisor 권장사항 조회
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');
    const taskName = searchParams.get('task_name');

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    if (!taskName) {
      return NextResponse.json({ error: 'Task name is required' }, { status: 400 });
    }

    const config = await getOracleConfig(connectionId);

    // 권장사항 조회 (USER_ADVISOR_* 뷰 사용)
    const recommendationsQuery = `
      SELECT
        r.REC_ID,
        r.RANK,
        r.TYPE,
        r.BENEFIT
      FROM USER_ADVISOR_RECOMMENDATIONS r
      WHERE r.TASK_NAME = :1
      ORDER BY r.RANK
    `;

    const recommendationsResult = await executeQuery(config, recommendationsQuery, [taskName], { timeout: 30000 });

    // 각 권장사항의 상세 액션 조회
    const recommendations = await Promise.all(
      recommendationsResult.rows.map(async (rec: any) => {
        // 액션 조회 (USER_ADVISOR_ACTIONS 뷰 사용)
        const actionsQuery = `
          SELECT
            a.ACTION_ID,
            a.COMMAND,
            a.ATTR1,
            a.ATTR2,
            a.ATTR3,
            a.ATTR4,
            a.ATTR5
          FROM USER_ADVISOR_ACTIONS a
          WHERE a.TASK_NAME = :1
          AND a.REC_ID = :2
          ORDER BY a.ACTION_ID
        `;

        const actionsResult = await executeQuery(config, actionsQuery, [taskName, rec.REC_ID], { timeout: 15000 });

        // 커맨드(DDL) 문 생성
        const actions = actionsResult.rows.map((action: any) => {
          let ddl = '';
          const command = action.COMMAND;

          if (command === 'CREATE INDEX') {
            ddl = `CREATE INDEX ${action.ATTR1} ON ${action.ATTR2}(${action.ATTR3})`;
            if (action.ATTR4) ddl += ` ${action.ATTR4}`;
          } else if (command === 'CREATE MATERIALIZED VIEW') {
            ddl = `CREATE MATERIALIZED VIEW ${action.ATTR1} AS ${action.ATTR3}`;
          } else if (command === 'PARTITION TABLE') {
            ddl = `-- Partition table ${action.ATTR1} by ${action.ATTR2}`;
          } else if (command === 'RETAIN INDEX' || command === 'RETAIN MATERIALIZED VIEW') {
            ddl = `-- ${command}: ${action.ATTR1}`;
          } else {
            ddl = `-- ${command}: ${action.ATTR1 || ''} ${action.ATTR2 || ''} ${action.ATTR3 || ''}`.trim();
          }

          return {
            action_id: action.ACTION_ID,
            command: action.COMMAND,
            object_name: action.ATTR1,
            table_name: action.ATTR2,
            columns: action.ATTR3,
            ddl: ddl.trim(),
          };
        });

        return {
          rec_id: rec.REC_ID,
          rank: rec.RANK,
          type: rec.TYPE,
          benefit: rec.BENEFIT,
          actions,
        };
      })
    );
    // 구현 스크립트 생성 (DBMS_ADVISOR.GET_TASK_SCRIPT)
    let implementationScript = '';
    try {
      const scriptQuery = `SELECT DBMS_ADVISOR.GET_TASK_SCRIPT(:task_name) as SCRIPT FROM DUAL`;
      const scriptResult = await executeQuery(config, scriptQuery, [taskName], {
        fetchInfo: { SCRIPT: { type: oracledb.STRING } }
      });
      implementationScript = scriptResult.rows[0]?.SCRIPT || '';
    } catch (scriptError) {
      console.warn('Failed to generate implementation script:', scriptError);
    }

    // 상세 리포트 생성 (DBMS_ADVISOR.GET_TASK_REPORT)
    let accessReport = '';
    try {
      const reportQuery = `SELECT DBMS_ADVISOR.GET_TASK_REPORT(:task_name, 'TEXT', 'ALL') as REPORT FROM DUAL`;
      const reportResult = await executeQuery(config, reportQuery, [taskName], {
        fetchInfo: { REPORT: { type: oracledb.STRING } }
      });
      accessReport = reportResult.rows[0]?.REPORT || '';
    } catch (reportError) {
      console.warn('Failed to generate access advisor report:', reportError);
    }

    return NextResponse.json({
      success: true,
      data: {
        task_name: taskName,
        recommendations,
        script: implementationScript,
        report: accessReport,
        total_count: recommendations.length,
      },
    });
  } catch (error) {
    console.error('Error fetching SQL Access Advisor recommendations:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch recommendations',
      },
      { status: 500 }
    );
  }
}
