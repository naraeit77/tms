import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { statspackReports } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getOracleConfig } from '@/lib/oracle/utils';

/**
 * GET /api/monitoring/statspack/reports
 * STATSPACK 리포트 목록 조회
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

    // PostgreSQL에서 리포트 목록 조회
    const reports = await db
      .select()
      .from(statspackReports)
      .where(eq(statspackReports.oracleConnectionId, connectionId))
      .orderBy(desc(statspackReports.createdAt))
      .limit(50);

    // Map to snake_case for frontend compatibility
    const mappedReports = reports.map((r) => ({
      id: r.id,
      oracle_connection_id: r.oracleConnectionId,
      begin_snap_id: r.beginSnapId,
      end_snap_id: r.endSnapId,
      report_type: r.reportType,
      report_content: r.reportContent,
      begin_time: r.beginTime,
      end_time: r.endTime,
      created_at: r.createdAt,
      updated_at: r.updatedAt,
    }));

    return NextResponse.json({
      success: true,
      data: mappedReports,
      count: mappedReports.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Statspack Reports API] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json(
        {
          error: 'Failed to fetch statspack reports',
          details: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to fetch statspack reports' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/monitoring/statspack/reports
 * STATSPACK 리포트 생성
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { connection_id, begin_snap_id, end_snap_id, report_type = 'TEXT' } = body;

    if (!connection_id || !begin_snap_id || !end_snap_id) {
      return NextResponse.json(
        { error: 'Connection ID, begin_snap_id, and end_snap_id are required' },
        { status: 400 }
      );
    }

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connection_id);

    console.log(`[Statspack Reports API] Generating report for snaps ${begin_snap_id}-${end_snap_id}, type: ${report_type}`);

    try {
      // STATSPACK 리포트 생성 - 스냅샷 정보만 포함한 기본 리포트
      // Oracle 버전 호환성을 위해 stats$snapshot 테이블만 사용
      const isHtml = report_type === 'HTML';

      const reportQuery = isHtml ? `
        DECLARE
          v_report VARCHAR2(32000) := '';
          v_begin_snap NUMBER := ${begin_snap_id};
          v_end_snap NUMBER := ${end_snap_id};
          v_dbname VARCHAR2(100);
          v_instance VARCHAR2(100);
        BEGIN
          -- 데이터베이스 정보 조회
          BEGIN
            SELECT name INTO v_dbname FROM v$database;
            SELECT instance_name INTO v_instance FROM v$instance;
          EXCEPTION WHEN OTHERS THEN
            v_dbname := 'Unknown';
            v_instance := 'Unknown';
          END;

          -- HTML 리포트 헤더
          v_report := '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>STATSPACK Report</title>';
          v_report := v_report || '<style>body{font-family:Arial,sans-serif;margin:20px;background:#f5f5f5}';
          v_report := v_report || '.container{max-width:900px;margin:0 auto;background:white;padding:30px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)}';
          v_report := v_report || 'h1{color:#1a365d;border-bottom:3px solid #3182ce;padding-bottom:10px}';
          v_report := v_report || 'h2{color:#2c5282;margin-top:30px}';
          v_report := v_report || '.info-grid{display:grid;grid-template-columns:150px 1fr;gap:10px;margin:20px 0}';
          v_report := v_report || '.info-label{font-weight:bold;color:#4a5568}';
          v_report := v_report || '.info-value{color:#2d3748}';
          v_report := v_report || 'table{width:100%;border-collapse:collapse;margin:20px 0}';
          v_report := v_report || 'th,td{border:1px solid #e2e8f0;padding:12px;text-align:left}';
          v_report := v_report || 'th{background:#edf2f7;color:#2d3748;font-weight:600}';
          v_report := v_report || 'tr:nth-child(even){background:#f7fafc}';
          v_report := v_report || 'tr:hover{background:#edf2f7}';
          v_report := v_report || '.note{background:#fef3c7;border-left:4px solid #f59e0b;padding:15px;margin:20px 0;border-radius:0 8px 8px 0}';
          v_report := v_report || '.footer{margin-top:30px;padding-top:20px;border-top:1px solid #e2e8f0;color:#718096;font-size:12px}</style></head>';
          v_report := v_report || '<body><div class="container">';
          v_report := v_report || '<h1>STATSPACK Report</h1>';

          -- 기본 정보
          v_report := v_report || '<div class="info-grid">';
          v_report := v_report || '<span class="info-label">Database:</span><span class="info-value">' || v_dbname || '</span>';
          v_report := v_report || '<span class="info-label">Instance:</span><span class="info-value">' || v_instance || '</span>';
          v_report := v_report || '<span class="info-label">Snap ID Range:</span><span class="info-value">' || v_begin_snap || ' - ' || v_end_snap || '</span>';
          v_report := v_report || '<span class="info-label">Generated:</span><span class="info-value">' || TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI:SS') || '</span>';
          v_report := v_report || '</div>';

          -- 스냅샷 테이블
          v_report := v_report || '<h2>Snapshot Information</h2>';
          v_report := v_report || '<table><thead><tr><th>Snap ID</th><th>Snapshot Time</th><th>Startup Time</th><th>DBID</th><th>Instance</th></tr></thead><tbody>';

          FOR snap_rec IN (
            SELECT snap_id, snap_time, startup_time, dbid, instance_number
            FROM perfstat.stats$snapshot
            WHERE snap_id BETWEEN v_begin_snap AND v_end_snap
            ORDER BY snap_id
          ) LOOP
            v_report := v_report || '<tr><td>' || snap_rec.snap_id || '</td>';
            v_report := v_report || '<td>' || TO_CHAR(snap_rec.snap_time, 'YYYY-MM-DD HH24:MI:SS') || '</td>';
            v_report := v_report || '<td>' || TO_CHAR(snap_rec.startup_time, 'YYYY-MM-DD HH24:MI:SS') || '</td>';
            v_report := v_report || '<td>' || snap_rec.dbid || '</td>';
            v_report := v_report || '<td>' || snap_rec.instance_number || '</td></tr>';
          END LOOP;

          v_report := v_report || '</tbody></table>';

          -- 안내 메시지
          v_report := v_report || '<div class="note"><strong>Note:</strong> For detailed STATSPACK report with SQL statistics and wait events, run spreport.sql directly in SQL*Plus.<br>';
          v_report := v_report || '<code>@$ORACLE_HOME/rdbms/admin/spreport.sql</code></div>';

          -- 푸터
          v_report := v_report || '<div class="footer">Generated by Narae TMS - SQL Tuning Management System</div>';
          v_report := v_report || '</div></body></html>';

          :report := v_report;
        EXCEPTION
          WHEN OTHERS THEN
            :report := '<!DOCTYPE html><html><body><h1>Error</h1><p>' || SQLERRM || '</p></body></html>';
        END;
      ` : `
        DECLARE
          v_report VARCHAR2(32000) := '';
          v_begin_snap NUMBER := ${begin_snap_id};
          v_end_snap NUMBER := ${end_snap_id};
          v_dbname VARCHAR2(100);
          v_instance VARCHAR2(100);
        BEGIN
          -- 데이터베이스 정보 조회
          BEGIN
            SELECT name INTO v_dbname FROM v$database;
            SELECT instance_name INTO v_instance FROM v$instance;
          EXCEPTION WHEN OTHERS THEN
            v_dbname := 'Unknown';
            v_instance := 'Unknown';
          END;

          -- TEXT 리포트 헤더
          v_report := 'STATSPACK Report' || CHR(10);
          v_report := v_report || '================' || CHR(10) || CHR(10);
          v_report := v_report || 'Database: ' || v_dbname || CHR(10);
          v_report := v_report || 'Instance: ' || v_instance || CHR(10);
          v_report := v_report || 'Snap ID Range: ' || v_begin_snap || ' - ' || v_end_snap || CHR(10);
          v_report := v_report || 'Generated: ' || TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI:SS') || CHR(10) || CHR(10);

          -- 스냅샷 정보 조회
          v_report := v_report || 'Snapshot Information' || CHR(10);
          v_report := v_report || '====================' || CHR(10);

          FOR snap_rec IN (
            SELECT snap_id, snap_time, startup_time, dbid, instance_number
            FROM perfstat.stats$snapshot
            WHERE snap_id BETWEEN v_begin_snap AND v_end_snap
            ORDER BY snap_id
          ) LOOP
            v_report := v_report || 'Snap ID: ' || snap_rec.snap_id ||
              ', Time: ' || TO_CHAR(snap_rec.snap_time, 'YYYY-MM-DD HH24:MI:SS') ||
              ', Startup: ' || TO_CHAR(snap_rec.startup_time, 'YYYY-MM-DD HH24:MI:SS') || CHR(10);
          END LOOP;

          v_report := v_report || CHR(10) || 'Note: For detailed STATSPACK report, run spreport.sql directly in SQL*Plus.' || CHR(10);
          v_report := v_report || 'Command: @$ORACLE_HOME/rdbms/admin/spreport.sql' || CHR(10);

          :report := v_report;
        EXCEPTION
          WHEN OTHERS THEN
            :report := 'Error generating report: ' || SQLERRM;
        END;
      `;

      const oracledb = await import('oracledb');
      const { getOraclePool } = await import('@/lib/oracle/client');
      const pool = await getOraclePool(config);
      const oracleConnection = await pool.getConnection();

      let reportContent: string;
      try {
        const result = await oracleConnection.execute(
          reportQuery,
          {
            report: { dir: oracledb.default.BIND_OUT, type: oracledb.default.STRING, maxSize: 40000 }
          },
          { autoCommit: true }
        );
        reportContent = (result.outBinds as any).report || 'No report content generated.';
      } finally {
        await oracleConnection.close();
      }

      console.log(`[Statspack Reports API] Report generated successfully for connection ${connection_id}`);

      // PostgreSQL에 리포트 저장
      const now = new Date();

      let savedReport = null;
      try {
        const inserted = await db
          .insert(statspackReports)
          .values({
            oracleConnectionId: connection_id,
            beginSnapId: begin_snap_id,
            endSnapId: end_snap_id,
            reportType: report_type,
            reportContent: reportContent,
            beginTime: now,
            endTime: now,
          })
          .returning();

        savedReport = inserted[0] || null;
      } catch (saveError) {
        console.error('[Statspack Reports API] Failed to save report:', saveError);
        // 저장 실패해도 리포트는 반환 (다운로드는 가능하도록)
      }

      // Map to snake_case for frontend compatibility
      const responseData = savedReport ? {
        id: savedReport.id,
        oracle_connection_id: savedReport.oracleConnectionId,
        begin_snap_id: savedReport.beginSnapId,
        end_snap_id: savedReport.endSnapId,
        report_type: savedReport.reportType,
        report_content: savedReport.reportContent,
        begin_time: savedReport.beginTime,
        end_time: savedReport.endTime,
        created_at: savedReport.createdAt,
      } : {
        id: `${connection_id}-${begin_snap_id}-${end_snap_id}-${Date.now()}`,
        oracle_connection_id: connection_id,
        begin_snap_id,
        end_snap_id,
        report_type,
        report_content: reportContent,
        begin_time: now.toISOString(),
        end_time: now.toISOString(),
        created_at: now.toISOString(),
      };

      return NextResponse.json({
        success: true,
        message: 'Report created successfully',
        data: responseData,
        timestamp: new Date().toISOString(),
      });
    } catch (queryError: any) {
      const errorMsg = queryError.message || '';
      console.error('[Statspack Reports API] Query error:', errorMsg);

      // STATSPACK이 설치되지 않은 경우
      if (errorMsg.includes('ORA-00942') || errorMsg.includes('ORA-06550') || errorMsg.includes('PLS-00201')) {
        return NextResponse.json(
          {
            error: 'STATSPACK not available',
            details: `STATSPACK 테이블 또는 패키지를 찾을 수 없습니다.\n\n원본 오류: ${errorMsg}`,
          },
          { status: 400 }
        );
      }
      throw queryError;
    }
  } catch (error) {
    console.error('[Statspack Reports API] Error creating report:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json(
        {
          error: 'Failed to create statspack report',
          details: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create statspack report' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/monitoring/statspack/reports
 * STATSPACK 리포트 삭제
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const reportId = searchParams.get('id');

    if (!reportId) {
      return NextResponse.json({ error: 'Report ID is required' }, { status: 400 });
    }

    await db
      .delete(statspackReports)
      .where(eq(statspackReports.id, reportId));

    console.log(`[Statspack Reports API] Report ${reportId} deleted successfully`);

    return NextResponse.json({
      success: true,
      message: 'Report deleted successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Statspack Reports API] Error deleting report:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        error: 'Failed to delete statspack report',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
