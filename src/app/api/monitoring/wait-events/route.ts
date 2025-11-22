import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createPureClient } from '@/lib/supabase/server';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * GET /api/monitoring/wait-events
 * Oracle 대기 이벤트 모니터링 데이터 조회
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createPureClient();
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('connection_id');
    const waitClass = searchParams.get('wait_class');

    console.log('[Wait Events API] Received connection_id:', connectionId);

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connectionId);

    // Oracle에서 실시간 대기 이벤트 정보 조회
    const query = `
      SELECT
        event,
        wait_class,
        total_waits,
        total_timeouts,
        time_waited,
        average_wait,
        time_waited * 10 as time_waited_ms,
        average_wait * 10 as average_wait_ms,
        wait_class_id,
        event_id,
        ROUND(ratio_to_report(time_waited) OVER() * 100, 2) as pct_total_time
      FROM
        v$system_event
      WHERE
        wait_class != 'Idle'
        ${waitClass && waitClass !== 'all' ? `AND wait_class = '${waitClass}'` : ''}
      ORDER BY
        time_waited DESC
      FETCH FIRST 100 ROWS ONLY
    `;

    const result = await executeQuery(config, query);
    console.log(`[Wait Events API] Oracle returned ${result.rows.length} rows`);

    // 대기 이벤트 데이터를 변환
    const waitEvents = result.rows.map((row: any, index: number) => ({
      id: `${connectionId}-${row.EVENT_ID || index}`,
      oracle_connection_id: connectionId,
      event_name: row.EVENT,
      event: row.EVENT,
      wait_class: row.WAIT_CLASS,
      total_waits: Math.floor(Number(row.TOTAL_WAITS) || 0),
      total_timeouts: Math.floor(Number(row.TOTAL_TIMEOUTS) || 0),
      time_waited: Math.floor(Number(row.TIME_WAITED) || 0),
      average_wait: Math.floor(Number(row.AVERAGE_WAIT) || 0),
      time_waited_ms: Math.floor(Number(row.TIME_WAITED_MS) || 0),
      average_wait_ms: Math.floor(Number(row.AVERAGE_WAIT_MS) || 0),
      wait_class_id: row.WAIT_CLASS_ID,
      event_id: row.EVENT_ID,
      pct_total_time: Number(row.PCT_TOTAL_TIME) || 0,
      pct_db_time: Number(row.PCT_TOTAL_TIME) || 0,
      collected_at: new Date().toISOString(),
    }));

    // 대기 클래스별 요약 정보 조회
    const summaryQuery = `
      SELECT
        wait_class,
        SUM(total_waits) as total_waits,
        SUM(time_waited) * 10 as total_time_ms,
        ROUND(AVG(average_wait) * 10, 2) as avg_wait_ms
      FROM
        v$system_event
      WHERE
        wait_class != 'Idle'
      GROUP BY
        wait_class
      ORDER BY
        total_time_ms DESC
    `;

    const summaryResult = await executeQuery(config, summaryQuery);

    const waitClassSummary = summaryResult.rows.map((row: any) => ({
      wait_class: row.WAIT_CLASS,
      total_waits: Math.floor(Number(row.TOTAL_WAITS) || 0),
      total_time_ms: Math.floor(Number(row.TOTAL_TIME_MS) || 0),
      avg_wait_ms: Number(row.AVG_WAIT_MS) || 0,
    }));

    console.log(`[Wait Events API] Returning ${waitEvents.length} wait events`);

    return NextResponse.json({
      success: true,
      data: waitEvents,
      summary: waitClassSummary,
      count: waitEvents.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Wait events monitoring API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch wait event data' },
      { status: 500 }
    );
  }
}
