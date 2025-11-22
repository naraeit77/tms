import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';
import { createClient } from '@/lib/supabase/server';

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
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const supabase = await createClient();

    // 현재 사용자 ID 조회
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    // 리포트 메타데이터 조회
    const { data: report, error } = await supabase
      .from('awr_reports')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(report.connection_id);

    let reportContent = '';

    if (report.report_type === 'AWR') {
      // AWR 리포트 재생성
      const awrQuery = `
        SELECT output
        FROM TABLE(DBMS_WORKLOAD_REPOSITORY.AWR_REPORT_HTML(
          l_dbid => (SELECT dbid FROM v$database),
          l_inst_num => (SELECT instance_number FROM v$instance),
          l_bid => ${report.begin_snap_id},
          l_eid => ${report.end_snap_id}
        ))
      `;

      const result = await executeQuery(config, awrQuery);
      reportContent = result.rows.map((row: any) => row.OUTPUT).join('\n');
    } else {
      // ADDM 리포트 재생성
      const taskName = `ADDM_TASK_${Date.now()}`;

      // ADDM 태스크 생성
      await executeQuery(config, `
        BEGIN
          DBMS_ADVISOR.CREATE_TASK(
            advisor_name => 'ADDM',
            task_name => '${taskName}',
            task_desc => 'ADDM analysis from TMS'
          );
        END;
      `);

      // 파라미터 설정
      await executeQuery(config, `
        BEGIN
          DBMS_ADVISOR.SET_TASK_PARAMETER(
            task_name => '${taskName}',
            parameter => 'START_SNAPSHOT',
            value => ${report.begin_snap_id}
          );
          DBMS_ADVISOR.SET_TASK_PARAMETER(
            task_name => '${taskName}',
            parameter => 'END_SNAPSHOT',
            value => ${report.end_snap_id}
          );
        END;
      `);

      // 태스크 실행
      await executeQuery(config, `
        BEGIN
          DBMS_ADVISOR.EXECUTE_TASK(task_name => '${taskName}');
        END;
      `);

      // 리포트 조회
      const reportResult = await executeQuery(config, `
        SELECT DBMS_ADVISOR.GET_TASK_REPORT(task_name => '${taskName}') as report
        FROM dual
      `);
      reportContent = reportResult.rows[0]?.REPORT || '';
    }

    return NextResponse.json({
      success: true,
      data: {
        id: report.id,
        report_type: report.report_type,
        begin_snap_id: report.begin_snap_id,
        end_snap_id: report.end_snap_id,
        report_name: report.report_name,
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
