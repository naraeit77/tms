import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

interface DeadlockInfo {
  deadlock_time: string;
  inst_id: number;
  message?: string;
  session1_sid?: number;
  session1_serial?: number;
  session1_user?: string;
  session1_machine?: string;
  session1_sql_id?: string;
  session2_sid?: number;
  session2_serial?: number;
  session2_user?: string;
  session2_machine?: string;
  session2_sql_id?: string;
  object_name?: string;
  row_wait_obj?: number;
  event?: string;
  is_current?: boolean;
}

/**
 * GET /api/monitoring/locks
 * Oracle Lock 정보 조회 (Deadlock 이력 포함)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');
    const lockType = searchParams.get('lock_type'); // DML, DDL, SYSTEM, etc.

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connectionId);

    // Oracle Lock 정보 조회 (위험한 Lock만 조회 - 성능 최적화)
    // 최적화 포인트:
    // 1. 날짜 연산을 상수 쪽으로 이동 (인덱스 활용 가능)
    // 2. WITH 절로 blocking_sessions를 한 번만 조회
    // 3. SUBSTR 스칼라 서브쿼리는 JOIN으로 변환 가능하지만, v$sql 특성상 유지
    let query = `
      SELECT * FROM (
      WITH blocking_sids AS (
        SELECT DISTINCT blocking_session AS sid
        FROM v$session
        WHERE blocking_session IS NOT NULL
      )
      SELECT
        l.session_id as holding_session,
        s.serial# as holding_serial,
        s.username as holding_username,
        s.osuser as holding_osuser,
        s.machine as holding_machine,
        s.program as holding_program,
        l.oracle_username,
        l.os_user_name,
        l.process,
        l.object_id,
        l.locked_mode,
        DECODE(l.locked_mode,
          0, 'None',
          1, 'Null',
          2, 'Row-S (SS)',
          3, 'Row-X (SX)',
          4, 'Share',
          5, 'S/Row-X (SSX)',
          6, 'Exclusive',
          'Unknown') as lock_mode_name,
        ROUND((SYSDATE - s.logon_time) * 86400) as lock_duration_sec,
        s.sql_id,
        (SELECT SUBSTR(sq.sql_text, 1, 200) FROM v$sql sq WHERE sq.sql_id = s.sql_id AND ROWNUM = 1) as sql_text,
        s.blocking_session as waiting_session,
        0 as waiting_serial,
        NULL as waiting_username,
        s.event as waiting_event,
        s.wait_time,
        s.seconds_in_wait,
        CASE WHEN bs.sid IS NOT NULL THEN 1 ELSE 0 END as is_blocker
      FROM v$locked_object l
      JOIN v$session s ON l.session_id = s.sid
      LEFT JOIN blocking_sids bs ON s.sid = bs.sid
      WHERE (
        s.blocking_session IS NOT NULL
        OR l.locked_mode >= 4
        OR s.logon_time < SYSDATE - INTERVAL '5' MINUTE
        OR bs.sid IS NOT NULL
      )
      ) WHERE ROWNUM <= 50
      ORDER BY is_blocker, locked_mode DESC, lock_duration_sec DESC
    `;

    let result: { rows: any[] };
    try {
      result = await executeQuery(config, query);
    } catch (queryError: any) {
      // v$locked_object 뷰 접근 권한이 없거나 뷰가 없는 경우
      if (queryError.message?.includes('ORA-00942') || queryError.message?.includes('ORA-01031')) {
        console.warn('[Locks API] Insufficient privileges or view not available, returning empty result');
        return NextResponse.json({
          success: true,
          data: [],
          count: 0,
          timestamp: new Date().toISOString(),
        });
      }
      throw queryError;
    }

    // 객체 정보 조회 시도 (권한이 있는 경우)
    const objectIds = [...new Set((result.rows || []).map((row: any) => row.OBJECT_ID))];
    const objectInfoMap = new Map<number, { owner: string; name: string; type: string }>();
    
    if (objectIds.length > 0) {
      try {
        const objectQuery = `
          SELECT
            object_id,
            owner,
            object_name,
            object_type
          FROM
            dba_objects
          WHERE
            object_id IN (${objectIds.join(',')})
        `;
        const objectResult = await executeQuery(config, objectQuery);
        (objectResult.rows || []).forEach((row: any) => {
          objectInfoMap.set(row.OBJECT_ID, {
            owner: row.OWNER,
            name: row.OBJECT_NAME,
            type: row.OBJECT_TYPE,
          });
        });
      } catch (objectError: any) {
        // dba_objects 권한이 없으면 무시하고 계속 진행
        console.debug('[Locks API] Could not fetch object info:', objectError.message);
      }
    }

    // Lock 데이터를 변환
    let locks = (result.rows || []).map((row: any) => {
      // SQL 텍스트 변환
      let sqlText = '';
      if (row.SQL_TEXT) {
        if (typeof row.SQL_TEXT === 'string') {
          sqlText = row.SQL_TEXT;
        } else if (Buffer.isBuffer(row.SQL_TEXT)) {
          sqlText = row.SQL_TEXT.toString('utf-8');
        } else if (row.SQL_TEXT.toString) {
          sqlText = row.SQL_TEXT.toString();
        }
      }
      sqlText = sqlText ? sqlText.substring(0, 500) : '';

      // 객체 정보 가져오기
      const objectInfo = objectInfoMap.get(row.OBJECT_ID);

      return {
        id: `${connectionId}-${row.HOLDING_SESSION}-${row.OBJECT_ID}`,
        oracle_connection_id: connectionId,
        holding_session: row.HOLDING_SESSION,
        holding_serial: row.HOLDING_SERIAL,
        holding_username: row.HOLDING_USERNAME,
        holding_osuser: row.HOLDING_OSUSER,
        holding_machine: row.HOLDING_MACHINE,
        holding_program: row.HOLDING_PROGRAM,
        oracle_username: row.ORACLE_USERNAME,
        os_user_name: row.OS_USER_NAME,
        process: row.PROCESS,
        object_id: row.OBJECT_ID,
        object_owner: objectInfo?.owner || null,
        object_name: objectInfo?.name || null,
        object_type: objectInfo?.type || null,
        locked_mode: row.LOCKED_MODE,
        lock_mode_name: row.LOCK_MODE_NAME,
        lock_duration_sec: Math.floor(Number(row.LOCK_DURATION_SEC) || 0),
        sql_id: row.SQL_ID,
        sql_text: sqlText,
        waiting_session: row.WAITING_SESSION,
        waiting_serial: row.WAITING_SERIAL,
        waiting_username: row.WAITING_USERNAME,
        waiting_event: row.WAITING_EVENT,
        wait_time: Math.floor(Number(row.WAIT_TIME) || 0),
        seconds_in_wait: Math.floor(Number(row.SECONDS_IN_WAIT) || 0),
        collected_at: new Date().toISOString(),
      };
    });

    // lockType 필터 적용 (클라이언트 측에서도 필터링되지만 서버 측에서도 적용)
    if (lockType && lockType !== 'all') {
      locks = locks.filter((lock: any) => lock.object_type === lockType.toUpperCase());
    }

    console.log(`[Locks API] Fetched ${locks.length} locks for connection ${connectionId}`);

    // Deadlock 이력 조회 (최근 24시간)
    let deadlocks: DeadlockInfo[] = [];
    try {
      // V$DIAG_ALERT_EXT에서 Deadlock 관련 메시지 조회 시도
      const deadlockQuery = `
        SELECT * FROM (
        SELECT
          originating_timestamp as deadlock_time,
          inst_id,
          message_text
        FROM v$diag_alert_ext
        WHERE message_text LIKE '%ORA-00060%'
          AND originating_timestamp > SYSDATE - 1
        ORDER BY originating_timestamp DESC
        ) WHERE ROWNUM <= 20
      `;

      const deadlockResult = await executeQuery(config, deadlockQuery);

      if (deadlockResult.rows && deadlockResult.rows.length > 0) {
        deadlocks = deadlockResult.rows.map((row: any) => ({
          deadlock_time: row.DEADLOCK_TIME ? new Date(row.DEADLOCK_TIME).toISOString() : new Date().toISOString(),
          inst_id: row.INST_ID || 1,
          message: row.MESSAGE_TEXT || 'Deadlock detected (ORA-00060)',
        }));
      }
    } catch (deadlockError: any) {
      // V$DIAG_ALERT_EXT 권한이 없는 경우, DBA_HIST_ACTIVE_SESS_HISTORY로 대체 시도
      console.debug('[Locks API] V$DIAG_ALERT_EXT not available, trying ASH...');

      try {
        // ASH에서 Deadlock 관련 wait event 조회
        const ashDeadlockQuery = `
          SELECT * FROM (
          SELECT
            sample_time as deadlock_time,
            instance_number as inst_id,
            session_id as session1_sid,
            session_serial# as session1_serial,
            user_id,
            machine,
            sql_id as session1_sql_id,
            blocking_session as session2_sid,
            blocking_session_serial# as session2_serial,
            current_obj# as row_wait_obj,
            event
          FROM dba_hist_active_sess_history
          WHERE event LIKE '%enq: TX - row lock contention%'
            AND blocking_session IS NOT NULL
            AND sample_time > SYSDATE - 1
          ORDER BY sample_time DESC
          ) WHERE ROWNUM <= 50
        `;

        const ashResult = await executeQuery(config, ashDeadlockQuery);

        if (ashResult.rows && ashResult.rows.length > 0) {
          deadlocks = ashResult.rows.map((row: any) => ({
            deadlock_time: row.DEADLOCK_TIME ? new Date(row.DEADLOCK_TIME).toISOString() : new Date().toISOString(),
            inst_id: row.INST_ID || 1,
            session1_sid: row.SESSION1_SID,
            session1_serial: row.SESSION1_SERIAL,
            session1_user: row.USER_ID?.toString() || 'Unknown',
            session1_machine: row.MACHINE || 'Unknown',
            session1_sql_id: row.SESSION1_SQL_ID || '',
            session2_sid: row.SESSION2_SID,
            session2_serial: row.SESSION2_SERIAL,
            session2_user: '',
            session2_machine: '',
            session2_sql_id: '',
            object_name: '',
            row_wait_obj: row.ROW_WAIT_OBJ || 0,
            event: row.EVENT || 'enq: TX - row lock contention',
          }));
        }
      } catch (ashError: any) {
        console.debug('[Locks API] ASH query failed:', ashError.message);

        // 마지막 대안: V$LOCK에서 현재 Deadlock 가능성 있는 상황 조회
        try {
          const currentDeadlockQuery = `
            SELECT
              SYSDATE as deadlock_time,
              s1.inst_id,
              s1.sid as session1_sid,
              s1.serial# as session1_serial,
              s1.username as session1_user,
              s1.machine as session1_machine,
              s1.sql_id as session1_sql_id,
              s2.sid as session2_sid,
              s2.serial# as session2_serial,
              s2.username as session2_user,
              s2.machine as session2_machine,
              s2.sql_id as session2_sql_id,
              s1.row_wait_obj# as row_wait_obj
            FROM v$session s1
            JOIN v$session s2 ON s1.blocking_session = s2.sid
            WHERE s1.blocking_session IS NOT NULL
              AND s2.blocking_session = s1.sid
            ) WHERE ROWNUM <= 20
          `;

          const currentDeadlockResult = await executeQuery(config, currentDeadlockQuery);

          if (currentDeadlockResult.rows && currentDeadlockResult.rows.length > 0) {
            deadlocks = currentDeadlockResult.rows.map((row: any) => ({
              deadlock_time: new Date().toISOString(),
              inst_id: row.INST_ID || 1,
              session1_sid: row.SESSION1_SID,
              session1_serial: row.SESSION1_SERIAL,
              session1_user: row.SESSION1_USER || 'Unknown',
              session1_machine: row.SESSION1_MACHINE || 'Unknown',
              session1_sql_id: row.SESSION1_SQL_ID || '',
              session2_sid: row.SESSION2_SID,
              session2_serial: row.SESSION2_SERIAL,
              session2_user: row.SESSION2_USER || 'Unknown',
              session2_machine: row.SESSION2_MACHINE || 'Unknown',
              session2_sql_id: row.SESSION2_SQL_ID || '',
              object_name: '',
              row_wait_obj: row.ROW_WAIT_OBJ || 0,
              is_current: true,
            }));
          }
        } catch (currentError: any) {
          console.debug('[Locks API] Current deadlock query failed:', currentError.message);
        }
      }
    }

    console.log(`[Locks API] Found ${deadlocks.length} deadlock events`);

    return NextResponse.json({
      success: true,
      data: locks,
      deadlocks: deadlocks,
      count: locks.length,
      deadlockCount: deadlocks.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.warn('[Locks API] Error occurred, returning empty result:', errorMessage);

    // 모든 에러를 graceful하게 처리하여 빈 데이터 반환 (500 에러 대신)
    return NextResponse.json({
      success: true,
      data: [],
      count: 0,
      timestamp: new Date().toISOString(),
      warning: errorMessage,
    });
  }
}
