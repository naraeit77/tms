import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * POST /api/monitoring/sql-monitor/clear
 * V$SQL_MONITOR 데이터 정리
 *
 * V$SQL_MONITOR는 Oracle의 내부 메모리 구조를 보여주는 동적 뷰로,
 * 실제로 데이터를 삭제할 수 없습니다. 대신 현재 시점을 기록하여
 * 이 시점 이전의 데이터를 필터링합니다.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { connection_id } = body;

    console.log('[SQL Monitor Clear] Request received for connection:', connection_id);

    if (!connection_id) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    const config = await getOracleConfig(connection_id);

    try {
      // 현재 V$SQL_MONITOR의 데이터 개수 확인
      const countQuery = `
        SELECT COUNT(*) AS CURRENT_COUNT
        FROM V$SQL_MONITOR
        WHERE SQL_EXEC_START >= SYSDATE - 1/24
      `;

      const countResult = await executeQuery(config, countQuery);
      const currentCount = countResult.rows?.[0]?.CURRENT_COUNT || 0;

      console.log(`[SQL Monitor Clear] Current entries: ${currentCount}`);

      // 현재 시각을 Oracle DB 서버 시각으로 가져오기
      const timestampQuery = `SELECT SYSDATE AS CLEARED_AT FROM DUAL`;
      const timestampResult = await executeQuery(config, timestampQuery);
      const clearedAt = timestampResult.rows?.[0]?.CLEARED_AT;

      console.log(`[SQL Monitor Clear] Clear timestamp: ${clearedAt}`);

      // V$SQL_MONITOR는 동적 뷰이므로 실제 삭제는 불가능
      // 대신 클라이언트에게 cleared_at 시각을 전달하여
      // 이 시각 이후의 데이터만 표시하도록 필터링
      return NextResponse.json({
        success: true,
        message: `SQL Monitor 데이터가 정리되었습니다. ${currentCount}개의 항목이 숨겨집니다.`,
        clearedCount: Number(currentCount),
        clearedAt: clearedAt,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      throw error;
    }

  } catch (error) {
    console.error('SQL Monitor clear API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to clear SQL Monitor data',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
