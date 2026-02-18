import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';
import { db } from '@/db';
import { awrReports } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * GET /api/awr/reports/[id]
 * 특정 AWR/ADDM 리포트 재생성 및 다운로드
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { id } = await params;

    // 리포트 메타데이터 조회
    const [report] = await db
      .select()
      .from(awrReports)
      .where(and(eq(awrReports.id, id), eq(awrReports.userId, userId)))
      .limit(1);

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(report.connectionId);

    let reportContent = '';

    if (report.reportType === 'AWR') {
      // AWR 리포트 재생성
      const awrQuery = `
        SELECT output
        FROM TABLE(DBMS_WORKLOAD_REPOSITORY.AWR_REPORT_HTML(
          l_dbid => (SELECT dbid FROM v$database),
          l_inst_num => (SELECT instance_number FROM v$instance),
          l_bid => ${report.beginSnapId},
          l_eid => ${report.endSnapId}
        ))
      `;

      const result = await executeQuery(config, awrQuery);
      reportContent = result.rows.map((row: any) => row.OUTPUT).join('\n');
    } else {
      // ADDM 리포트 재생성
      const taskName = `ADDM_TMS_${Date.now()}`;

      const addmQuery = `
        DECLARE
          v_task_name VARCHAR2(100) := '${taskName}';
          v_task_id NUMBER;
        BEGIN
          DBMS_ADDM.ANALYZE_DB(
            task_name => v_task_name,
            begin_snapshot => ${report.beginSnapId},
            end_snapshot => ${report.endSnapId}
          );
        EXCEPTION
          WHEN OTHERS THEN
            IF SQLCODE = -6550 THEN
              DECLARE
                v_dbid NUMBER;
                v_inst_num NUMBER;
              BEGIN
                SELECT dbid INTO v_dbid FROM v$database;
                SELECT instance_number INTO v_inst_num FROM v$instance;

                DBMS_ADVISOR.CREATE_TASK(
                  advisor_name => 'ADDM',
                  task_id => v_task_id,
                  task_name => v_task_name,
                  task_desc => 'ADDM analysis from TMS'
                );

                DBMS_ADVISOR.SET_TASK_PARAMETER(v_task_name, 'DB_ID', v_dbid);
                DBMS_ADVISOR.SET_TASK_PARAMETER(v_task_name, 'INSTANCE', v_inst_num);
                DBMS_ADVISOR.SET_TASK_PARAMETER(v_task_name, 'START_SNAPSHOT', ${report.beginSnapId});
                DBMS_ADVISOR.SET_TASK_PARAMETER(v_task_name, 'END_SNAPSHOT', ${report.endSnapId});

                DBMS_ADVISOR.EXECUTE_TASK(task_name => v_task_name);
              END;
            ELSE
              RAISE;
            END IF;
        END;
      `;

      await executeQuery(config, addmQuery, [], { timeout: 300000 });

      const reportQuery = `
        DECLARE
          v_clob CLOB;
          v_length NUMBER;
        BEGIN
          v_clob := DBMS_ADVISOR.GET_TASK_REPORT('${taskName}', 'TEXT', 'ALL');
          v_length := NVL(DBMS_LOB.GETLENGTH(v_clob), 0);

          IF v_length = 0 THEN
            :report := 'No ADDM findings for the specified snapshot range.';
          ELSE
            :report := DBMS_LOB.SUBSTR(v_clob, LEAST(v_length, 32000), 1);
          END IF;
        END;
      `;

      const oracledb = await import('oracledb');
      const { getOraclePool } = await import('@/lib/oracle/client');
      const pool = await getOraclePool(config);
      const connection = await pool.getConnection();

      try {
        const result = await connection.execute(
          reportQuery,
          {
            report: { dir: oracledb.default.BIND_OUT, type: oracledb.default.STRING, maxSize: 40000 }
          },
          { autoCommit: true }
        );
        reportContent = (result.outBinds as any).report || 'No ADDM findings.';
      } finally {
        await connection.close();
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: report.id,
        report_type: report.reportType,
        begin_snap_id: report.beginSnapId,
        end_snap_id: report.endSnapId,
        report_name: report.reportName,
        content: reportContent,
      },
    });
  } catch (error) {
    console.error('AWR report download error:', error);
    return NextResponse.json(
      {
        error: 'Failed to download report',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
