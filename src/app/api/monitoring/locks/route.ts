import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * GET /api/monitoring/locks
 * Oracle Lock 정보 조회
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

    // Oracle Lock 정보 조회
    const query = `
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
        o.owner as object_owner,
        o.object_name,
        o.object_type,
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
        l.ctime as lock_duration_sec,
        sq.sql_id,
        sq.sql_text,
        w.sid as waiting_session,
        w.serial# as waiting_serial,
        w.username as waiting_username,
        w.event as waiting_event,
        w.wait_time,
        w.seconds_in_wait
      FROM
        v$locked_object l
        JOIN dba_objects o ON l.object_id = o.object_id
        JOIN v$session s ON l.session_id = s.sid
        LEFT JOIN v$sql sq ON s.sql_id = sq.sql_id
        LEFT JOIN v$session w ON w.blocking_session = l.session_id
      WHERE
        1=1
        ${lockType && lockType !== 'all' ? `AND o.object_type = '${lockType.toUpperCase()}'` : ''}
      ORDER BY
        l.ctime DESC, l.session_id
    `;

    const result = await executeQuery(config, query);

    // Lock 데이터를 변환
    const locks = result.rows.map((row: any) => {
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
        object_owner: row.OBJECT_OWNER,
        object_name: row.OBJECT_NAME,
        object_type: row.OBJECT_TYPE,
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

    console.log(`[Locks API] Fetched ${locks.length} locks for connection ${connectionId}`);

    return NextResponse.json({
      success: true,
      data: locks,
      count: locks.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Locks monitoring API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch lock data' },
      { status: 500 }
    );
  }
}
