import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';
import { createClient } from '@/lib/supabase/server';

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

    const supabase = await createClient();

    // 현재 사용자의 리포트 목록 조회
    const { data: reports, error } = await supabase
      .from('awr_reports')
      .select(`
        id,
        connection_id,
        report_type,
        begin_snap_id,
        end_snap_id,
        report_name,
        file_size,
        status,
        generated_at
      `)
      .order('generated_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Supabase query error:', error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: reports || [],
      count: reports?.length || 0,
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
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connection_id);

    const supabase = await createClient();

    // 현재 사용자 ID 조회
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    // 리포트 파일명 생성
    const reportName = `${report_type}_${begin_snap_id}_${end_snap_id}_${Date.now()}.html`;

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

      const result = await executeQuery(config, awrQuery);

      // AWR 리포트 결과를 하나의 문자열로 결합
      const reportContent = result.rows
        .map((row: any) => row.OUTPUT)
        .join('\n');

      const fileSize = Buffer.byteLength(reportContent, 'utf8');

      // Supabase에 리포트 메타데이터 저장
      const { data: savedReport, error: saveError } = await supabase
        .from('awr_reports')
        .insert({
          user_id: user.id,
          connection_id,
          report_type: 'AWR',
          begin_snap_id,
          end_snap_id,
          report_name: reportName,
          file_size: fileSize,
          status: 'COMPLETED',
        })
        .select()
        .single();

      if (saveError) {
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
      // 먼저 ADDM 태스크 생성
      const taskName = `ADDM_TASK_${Date.now()}`;

      const createTaskQuery = `
        BEGIN
          DBMS_ADVISOR.CREATE_TASK(
            advisor_name => 'ADDM',
            task_name => '${taskName}',
            task_desc => 'ADDM analysis from TMS'
          );
        END;
      `;

      await executeQuery(config, createTaskQuery);

      // ADDM 태스크 파라미터 설정
      const setTaskQuery = `
        BEGIN
          DBMS_ADVISOR.SET_TASK_PARAMETER(
            task_name => '${taskName}',
            parameter => 'START_SNAPSHOT',
            value => ${begin_snap_id}
          );
          DBMS_ADVISOR.SET_TASK_PARAMETER(
            task_name => '${taskName}',
            parameter => 'END_SNAPSHOT',
            value => ${end_snap_id}
          );
        END;
      `;

      await executeQuery(config, setTaskQuery);

      // ADDM 태스크 실행
      const executeTaskQuery = `
        BEGIN
          DBMS_ADVISOR.EXECUTE_TASK(task_name => '${taskName}');
        END;
      `;

      await executeQuery(config, executeTaskQuery);

      // ADDM 리포트 조회
      const reportQuery = `
        SELECT DBMS_ADVISOR.GET_TASK_REPORT(task_name => '${taskName}') as report
        FROM dual
      `;

      const reportResult = await executeQuery(config, reportQuery);
      const reportContent = reportResult.rows[0]?.REPORT || '';

      const fileSize = Buffer.byteLength(reportContent, 'utf8');

      // Supabase에 리포트 메타데이터 저장
      const { data: savedReport, error: saveError } = await supabase
        .from('awr_reports')
        .insert({
          user_id: user.id,
          connection_id,
          report_type: 'ADDM',
          begin_snap_id,
          end_snap_id,
          report_name: reportName,
          file_size: fileSize,
          status: 'COMPLETED',
        })
        .select()
        .single();

      if (saveError) {
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
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const reportId = searchParams.get('id');

    if (!reportId) {
      return NextResponse.json({ error: 'Report ID is required' }, { status: 400 });
    }

    const supabase = await createClient();

    // 현재 사용자 ID 조회
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    // 리포트 삭제 (RLS 정책에 의해 자신의 리포트만 삭제 가능)
    const { error: deleteError } = await supabase
      .from('awr_reports')
      .delete()
      .eq('id', reportId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Failed to delete report:', deleteError);
      throw deleteError;
    }

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
