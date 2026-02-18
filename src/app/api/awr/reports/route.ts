import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';
import { db } from '@/db';
import { awrReports } from '@/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { createEnterpriseFeatureResponse } from '@/lib/oracle/edition-guard';
import { getConnectionEdition } from '@/lib/oracle/edition-guard-server';

/**
 * GET /api/awr/reports
 * AWR/ADDM 리포트 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 현재 사용자의 리포트 목록 조회
    const reportsList = await db
      .select({
        id: awrReports.id,
        connectionId: awrReports.connectionId,
        reportType: awrReports.reportType,
        beginSnapId: awrReports.beginSnapId,
        endSnapId: awrReports.endSnapId,
        reportName: awrReports.reportName,
        fileSize: awrReports.fileSize,
        status: awrReports.status,
        generatedAt: awrReports.generatedAt,
      })
      .from(awrReports)
      .orderBy(desc(awrReports.generatedAt))
      .limit(50);

    return NextResponse.json({
      success: true,
      data: (reportsList || []).map(r => ({
        id: r.id,
        connection_id: r.connectionId,
        report_type: r.reportType,
        begin_snap_id: r.beginSnapId,
        end_snap_id: r.endSnapId,
        report_name: r.reportName,
        file_size: r.fileSize,
        status: r.status,
        generated_at: r.generatedAt,
      })),
      count: reportsList?.length || 0,
    });
  } catch (error) {
    console.error('AWR reports API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reports' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/awr/reports
 * AWR/ADDM 리포트 생성
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    const body = await request.json();
    const { connection_id, report_type, begin_snap_id, end_snap_id } = body;

    if (!connection_id || !report_type || !begin_snap_id || !end_snap_id) {
      return NextResponse.json(
        { error: 'Connection ID, report type, begin snap ID, and end snap ID are required' },
        { status: 400 }
      );
    }

    if (!['AWR', 'ADDM'].includes(report_type)) {
      return NextResponse.json(
        { error: 'Report type must be either "AWR" or "ADDM"' },
        { status: 400 }
      );
    }

    // Enterprise Edition 체크 (AWR/ADDM은 Diagnostics Pack 필요)
    const edition = await getConnectionEdition(connection_id);
    const enterpriseCheck = createEnterpriseFeatureResponse('AWR', edition);
    if (enterpriseCheck) {
      return NextResponse.json(enterpriseCheck, { status: 403 });
    }

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connection_id);

    // 리포트 파일명 생성 (AWR은 HTML, ADDM은 TXT)
    const fileExtension = report_type === 'AWR' ? 'html' : 'txt';
    const reportName = `${report_type}_${begin_snap_id}_${end_snap_id}_${Date.now()}.${fileExtension}`;

    if (report_type === 'AWR') {
      // AWR 리포트 생성 (HTML 포맷)
      const awrQuery = `
        SELECT output
        FROM TABLE(DBMS_WORKLOAD_REPOSITORY.AWR_REPORT_HTML(
          l_dbid => (SELECT dbid FROM v$database),
          l_inst_num => (SELECT instance_number FROM v$instance),
          l_bid => ${begin_snap_id},
          l_eid => ${end_snap_id}
        ))
      `;

      const result = await executeQuery(config, awrQuery, [], { timeout: 300000 });

      const reportContent = result.rows
        .map((row: any) => row.OUTPUT)
        .join('\n');

      const fileSize = Buffer.byteLength(reportContent, 'utf8');

      // 리포트 메타데이터 저장
      let savedReport;
      try {
        const [inserted] = await db
          .insert(awrReports)
          .values({
            userId,
            connectionId: connection_id,
            reportType: 'AWR',
            beginSnapId: begin_snap_id,
            endSnapId: end_snap_id,
            reportName,
            fileSize,
            status: 'COMPLETED',
          })
          .returning();
        savedReport = inserted;
      } catch (saveError) {
        console.error('Failed to save report metadata:', saveError);
      }

      return NextResponse.json({
        success: true,
        message: 'AWR report generated successfully',
        data: {
          id: savedReport?.id,
          report_type: 'AWR',
          begin_snap_id,
          end_snap_id,
          report_name: reportName,
          file_size: fileSize,
          content: reportContent,
          generated_at: new Date().toISOString(),
        },
      });
    } else {
      // ADDM 리포트 생성
      const taskName = `ADDM_TMS_${Date.now()}`;

      const addmQuery = `
        DECLARE
          v_task_name VARCHAR2(100) := '${taskName}';
          v_task_id NUMBER;
        BEGIN
          DBMS_ADDM.ANALYZE_DB(
            task_name => v_task_name,
            begin_snapshot => ${begin_snap_id},
            end_snapshot => ${end_snap_id}
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
                DBMS_ADVISOR.SET_TASK_PARAMETER(v_task_name, 'START_SNAPSHOT', ${begin_snap_id});
                DBMS_ADVISOR.SET_TASK_PARAMETER(v_task_name, 'END_SNAPSHOT', ${end_snap_id});

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
          v_result VARCHAR2(32767);
          v_chunk_size NUMBER := 4000;
          v_offset NUMBER := 1;
          v_length NUMBER;
        BEGIN
          v_clob := DBMS_ADVISOR.GET_TASK_REPORT('${taskName}', 'TEXT', 'ALL');
          v_length := NVL(DBMS_LOB.GETLENGTH(v_clob), 0);

          IF v_length = 0 THEN
            :report := 'No ADDM findings for the specified snapshot range.';
          ELSE
            v_result := DBMS_LOB.SUBSTR(v_clob, LEAST(v_length, 32000), 1);
            IF v_length > 32000 THEN
              v_result := v_result || CHR(10) || '... (Report truncated. Full length: ' || v_length || ' bytes)';
            END IF;
            :report := v_result;
          END IF;
        END;
      `;

      const oracledb = await import('oracledb');
      const pool = await import('@/lib/oracle/client').then(m => m.getOraclePool(config));
      const connection = await pool.getConnection();

      try {
        const result = await connection.execute(
          reportQuery,
          {
            report: { dir: oracledb.default.BIND_OUT, type: oracledb.default.STRING, maxSize: 40000 }
          },
          { autoCommit: true }
        );
        var reportContent = (result.outBinds as any).report || 'No ADDM findings for the specified snapshot range.';
      } finally {
        await connection.close();
      }

      const fileSize = Buffer.byteLength(String(reportContent), 'utf8');

      // 리포트 메타데이터 저장
      let savedReport;
      try {
        const [inserted] = await db
          .insert(awrReports)
          .values({
            userId,
            connectionId: connection_id,
            reportType: 'ADDM',
            beginSnapId: begin_snap_id,
            endSnapId: end_snap_id,
            reportName,
            fileSize,
            status: 'COMPLETED',
          })
          .returning();
        savedReport = inserted;
      } catch (saveError) {
        console.error('Failed to save report metadata:', saveError);
      }

      return NextResponse.json({
        success: true,
        message: 'ADDM report generated successfully',
        data: {
          id: savedReport?.id,
          report_type: 'ADDM',
          begin_snap_id,
          end_snap_id,
          report_name: reportName,
          file_size: fileSize,
          task_name: taskName,
          content: reportContent,
          generated_at: new Date().toISOString(),
        },
      });
    }
  } catch (error) {
    console.error('AWR report generation error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate report',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/awr/reports
 * AWR/ADDM 리포트 삭제
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const searchParams = request.nextUrl.searchParams;
    const reportId = searchParams.get('id');

    if (!reportId) {
      return NextResponse.json({ error: 'Report ID is required' }, { status: 400 });
    }

    // 리포트 삭제
    await db
      .delete(awrReports)
      .where(and(eq(awrReports.id, reportId), eq(awrReports.userId, userId)));

    return NextResponse.json({
      success: true,
      message: 'Report deleted successfully',
    });
  } catch (error) {
    console.error('AWR report deletion error:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete report',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
