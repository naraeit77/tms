import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * POST /api/awr/ash/report
 * ASH 리포트 생성
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');
    const startTime = searchParams.get('start_time'); // Format: YYYY-MM-DD HH:MI:SS
    const endTime = searchParams.get('end_time'); // Format: YYYY-MM-DD HH:MI:SS

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    if (!startTime || !endTime) {
      return NextResponse.json(
        { error: 'Start time and end time are required' },
        { status: 400 }
      );
    }

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connectionId);

    // ASH 리포트 생성 (HTML 포맷)
    const reportQuery = `
      SELECT output
      FROM TABLE(DBMS_WORKLOAD_REPOSITORY.ASH_REPORT_HTML(
        l_dbid => (SELECT dbid FROM v$database),
        l_inst_num => (SELECT instance_number FROM v$instance),
        l_btime => TO_DATE(:start_time, 'YYYY-MM-DD HH24:MI:SS'),
        l_etime => TO_DATE(:end_time, 'YYYY-MM-DD HH24:MI:SS')
      ))
    `;

    const result = await executeQuery(config, reportQuery, {
      start_time: startTime,
      end_time: endTime,
    });

    // ASH 리포트 내용 결합
    const reportContent = result.rows.map((row: any) => row.OUTPUT).join('\n');

    const fileSize = Buffer.byteLength(reportContent, 'utf8');

    // 리포트 파일명 생성
    const reportName = `ASH_${startTime.replace(/[: -]/g, '_')}_${endTime.replace(/[: -]/g, '_')}.html`;

    return NextResponse.json({
      success: true,
      message: 'ASH report generated successfully',
      data: {
        report_name: reportName,
        file_size: fileSize,
        content: reportContent,
        time_range: {
          start: startTime,
          end: endTime,
        },
        generated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('ASH report generation error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate ASH report',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
