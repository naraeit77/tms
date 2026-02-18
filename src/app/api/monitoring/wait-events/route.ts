import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
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

    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('connection_id');
    const waitClass = searchParams.get('wait_class');

    console.log('[Wait Events API] Received connection_id:', connectionId);

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    // Oracle 직접 쿼리
    const config = await getOracleConfig(connectionId);

    // 허용된 Wait Class 목록 (SQL Injection 방지)
    const validWaitClasses = ['User I/O', 'System I/O', 'Concurrency', 'Application', 'Configuration', 'Network', 'Commit', 'Administrative', 'Scheduler', 'Cluster', 'Other'];
    const sanitizedWaitClass = waitClass && validWaitClasses.includes(waitClass) ? waitClass : null;

    // 대기 이벤트, 요약 정보, 현재 대기 세션, 이벤트별 SQL, 이벤트 설명을 병렬로 조회
    const [result, summaryResult, waitingSessionsResult, eventSqlResult, eventDescResult] = await Promise.all([
      // Oracle에서 실시간 대기 이벤트 정보 조회 (전체 - Idle 제외) + V$EVENT_NAME 조인으로 설명 포함
      // USE_HASH, LEADING 힌트로 해시 조인 유도 및 조인 순서 최적화
      executeQuery(config, `
        SELECT /*+ LEADING(se en) USE_HASH(en) */
          se.event,
          se.wait_class,
          se.total_waits,
          se.total_timeouts,
          se.time_waited,
          se.average_wait,
          ROUND(se.time_waited * 10, 2) as time_waited_ms,
          ROUND(se.average_wait * 10, 4) as average_wait_ms,
          se.wait_class_id,
          se.event_id,
          ROUND(ratio_to_report(se.time_waited) OVER() * 100, 2) as pct_total_time,
          en.display_name,
          en.parameter1,
          en.parameter2,
          en.parameter3
        FROM
          v$system_event se
        LEFT JOIN
          v$event_name en ON se.event = en.name
        WHERE
          se.wait_class != 'Idle'
          ${sanitizedWaitClass ? `AND se.wait_class = '${sanitizedWaitClass}'` : ''}
        ORDER BY
          se.time_waited DESC
      `),

      // 대기 클래스별 요약 정보 조회 (힌트 추가)
      executeQuery(config, `
        SELECT /*+ PARALLEL(2) */
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
      `),

      // 현재 대기 중인 세션과 SQL 정보 조회 (실시간)
      // USE_HASH, LEADING 힌트로 해시 조인 유도
      executeQuery(config, `
        SELECT * FROM (
        SELECT /*+ LEADING(s sq) USE_HASH(sq) */
          s.sid,
          s.serial#,
          s.username,
          s.program,
          s.machine,
          s.event,
          s.wait_class,
          s.seconds_in_wait,
          s.state,
          s.sql_id,
          s.sql_child_number,
          s.prev_sql_id,
          sq.sql_text,
          sq.executions,
          ROUND(sq.elapsed_time / NULLIF(sq.executions, 0) / 1000, 2) as avg_elapsed_ms,
          ROUND(sq.buffer_gets / NULLIF(sq.executions, 0), 0) as avg_buffer_gets,
          sq.rows_processed
        FROM
          v$session s
        LEFT JOIN
          v$sql sq ON s.sql_id = sq.sql_id AND s.sql_child_number = sq.child_number
        WHERE
          s.type = 'USER'
          AND s.status = 'ACTIVE'
          AND s.wait_class != 'Idle'
          ${sanitizedWaitClass ? `AND s.wait_class = '${sanitizedWaitClass}'` : ''}
        ORDER BY
          s.seconds_in_wait DESC
        ) WHERE ROWNUM <= 50
      `),

      // 이벤트별 관련 SQL 정보 조회 (V$ACTIVE_SESSION_HISTORY 기반 - 최근 5분)
      executeQuery(config, `
        SELECT
          event,
          sql_id,
          COUNT(*) as sample_count,
          COUNT(DISTINCT session_id) as session_count,
          ROUND(AVG(time_waited) / 1000, 2) as avg_wait_ms
        FROM
          v$active_session_history
        WHERE
          sample_time > SYSDATE - INTERVAL '5' MINUTE
          AND wait_class != 'Idle'
          AND sql_id IS NOT NULL
          ${sanitizedWaitClass ? `AND wait_class = '${sanitizedWaitClass}'` : ''}
        GROUP BY
          event, sql_id
        ORDER BY
          event, sample_count DESC
      `).catch(() => ({ rows: [] })),

      // 모든 Wait Event 설명 조회 (V$EVENT_NAME)
      executeQuery(config, `
        SELECT
          name,
          display_name,
          wait_class,
          parameter1,
          parameter2,
          parameter3
        FROM
          v$event_name
        WHERE
          wait_class != 'Idle'
      `).catch(() => ({ rows: [] }))
    ]);

    console.log(`[Wait Events API] Oracle returned ${result.rows.length} rows`);

    // 대기 이벤트 데이터를 변환 (Oracle에서 가져온 설명 포함)
    const waitEvents = result.rows.map((row: any, index: number) => ({
      id: `${connectionId}-${row.EVENT_ID || index}`,
      oracle_connection_id: connectionId,
      event_name: row.EVENT,
      event: row.EVENT,
      wait_class: row.WAIT_CLASS,
      total_waits: Math.floor(Number(row.TOTAL_WAITS) || 0),
      total_timeouts: Math.floor(Number(row.TOTAL_TIMEOUTS) || 0),
      time_waited: Math.floor(Number(row.TIME_WAITED) || 0),
      average_wait: Number(row.AVERAGE_WAIT) || 0,
      time_waited_ms: Number(row.TIME_WAITED_MS) || 0,
      average_wait_ms: Number(row.AVERAGE_WAIT_MS) || 0,
      wait_class_id: row.WAIT_CLASS_ID,
      event_id: row.EVENT_ID,
      pct_total_time: Number(row.PCT_TOTAL_TIME) || 0,
      pct_db_time: Number(row.PCT_TOTAL_TIME) || 0,
      // Oracle에서 가져온 이벤트 설명
      display_name: row.DISPLAY_NAME || null,
      parameter1: row.PARAMETER1 || null,
      parameter2: row.PARAMETER2 || null,
      parameter3: row.PARAMETER3 || null,
      collected_at: new Date().toISOString(),
    }));

    // 모든 Wait Event 설명을 맵으로 변환
    const eventDescriptions: Record<string, { display_name: string; wait_class: string; parameter1: string; parameter2: string; parameter3: string }> = {};
    eventDescResult.rows.forEach((row: any) => {
      eventDescriptions[row.NAME] = {
        display_name: row.DISPLAY_NAME || row.NAME,
        wait_class: row.WAIT_CLASS,
        parameter1: row.PARAMETER1 || '',
        parameter2: row.PARAMETER2 || '',
        parameter3: row.PARAMETER3 || '',
      };
    });

    const waitClassSummary = summaryResult.rows.map((row: any) => ({
      wait_class: row.WAIT_CLASS,
      total_waits: Math.floor(Number(row.TOTAL_WAITS) || 0),
      total_time_ms: Math.floor(Number(row.TOTAL_TIME_MS) || 0),
      avg_wait_ms: Number(row.AVG_WAIT_MS) || 0,
    }));

    // 현재 대기 중인 세션의 SQL 정보
    const waitingSessions = waitingSessionsResult.rows.map((row: any) => {
      let sqlText = row.SQL_TEXT;
      if (sqlText && typeof sqlText !== 'string') {
        if (Buffer.isBuffer(sqlText)) {
          sqlText = sqlText.toString('utf-8');
        } else if (sqlText.toString) {
          sqlText = sqlText.toString();
        }
      }

      return {
        sid: row.SID,
        serial: row['SERIAL#'],
        username: row.USERNAME,
        program: row.PROGRAM,
        machine: row.MACHINE,
        event: row.EVENT,
        wait_class: row.WAIT_CLASS,
        seconds_in_wait: Number(row.SECONDS_IN_WAIT) || 0,
        state: row.STATE,
        sql_id: row.SQL_ID,
        prev_sql_id: row.PREV_SQL_ID,
        sql_text: sqlText ? (sqlText.length > 200 ? sqlText.substring(0, 200) + '...' : sqlText) : null,
        sql_text_full: sqlText || null,
        executions: Math.floor(Number(row.EXECUTIONS) || 0),
        avg_elapsed_ms: Number(row.AVG_ELAPSED_MS) || 0,
        avg_buffer_gets: Math.floor(Number(row.AVG_BUFFER_GETS) || 0),
        rows_processed: Math.floor(Number(row.ROWS_PROCESSED) || 0),
      };
    });

    // 이벤트별 SQL 정보를 그룹화
    const eventSqlMap: Record<string, Array<{ sql_id: string; sample_count: number; session_count: number; avg_wait_ms: number }>> = {};
    eventSqlResult.rows.forEach((row: any) => {
      const eventName = row.EVENT;
      if (!eventSqlMap[eventName]) {
        eventSqlMap[eventName] = [];
      }
      // 이벤트당 상위 5개 SQL만 저장
      if (eventSqlMap[eventName].length < 5) {
        eventSqlMap[eventName].push({
          sql_id: row.SQL_ID,
          sample_count: Number(row.SAMPLE_COUNT) || 0,
          session_count: Number(row.SESSION_COUNT) || 0,
          avg_wait_ms: Number(row.AVG_WAIT_MS) || 0,
        });
      }
    });

    console.log(`[Wait Events API] Returning ${waitEvents.length} wait events, ${waitingSessions.length} waiting sessions, ${Object.keys(eventSqlMap).length} events with SQL, ${Object.keys(eventDescriptions).length} event descriptions`);

    return NextResponse.json({
      success: true,
      data: waitEvents,
      summary: waitClassSummary,
      waitingSessions: waitingSessions,
      eventSqlMap: eventSqlMap,
      eventDescriptions: eventDescriptions,
      count: waitEvents.length,
      waitingSessionsCount: waitingSessions.length,
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
