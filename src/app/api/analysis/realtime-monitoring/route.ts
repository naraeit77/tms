import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getOracleConfig } from '@/lib/oracle/utils'
import { executeQuery } from '@/lib/oracle/client'

/**
 * GET /api/analysis/realtime-monitoring
 * 실시간 SQL 실행 모니터링
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const connectionId = searchParams.get('connection_id')

    if (!connectionId) {
      return NextResponse.json(
        { error: 'Connection ID is required' },
        { status: 400 }
      )
    }

    console.log('[Realtime Monitoring API] connection_id:', connectionId)

    const config = await getOracleConfig(connectionId)

    // 실시간 실행 중인 SQL 조회 (Oracle 11g 호환: ROWNUM 사용)
    const query = `
      SELECT * FROM (
        SELECT
          s.sql_id,
          SUBSTR(s.sql_text, 1, 500) as sql_text,
          ses.status,
          ROUND(s.elapsed_time / 1000) as elapsed_time_ms,
          ROUND(s.cpu_time / 1000) as cpu_time_ms,
          ses.event as wait_event,
          ses.sid as session_id,
          ses.username,
          ses.logon_time as start_time
        FROM v$session ses
        JOIN v$sql s ON ses.sql_id = s.sql_id AND ses.sql_child_number = s.child_number
        WHERE ses.type = 'USER'
          AND ses.username IS NOT NULL
          AND ses.status = 'ACTIVE'
          AND s.sql_id IS NOT NULL
        ORDER BY s.elapsed_time DESC
      ) WHERE ROWNUM <= 30
    `

    // 타임아웃 5초 설정
    const result = await executeQuery(config, query, [], { timeout: 5000 })

    // 결과 변환
    const realtimeSQLs = result.rows.map((row: any) => {
      const sqlText = (row.SQL_TEXT || '').toString()

      return {
        sql_id: row.SQL_ID,
        sql_text: sqlText,
        status: row.STATUS === 'ACTIVE' ? 'EXECUTING' : 'WAITING',
        elapsed_time_ms: Math.floor(Number(row.ELAPSED_TIME_MS) || 0),
        cpu_time_ms: Math.floor(Number(row.CPU_TIME_MS) || 0),
        wait_event: row.WAIT_EVENT,
        session_id: Number(row.SESSION_ID),
        username: row.USERNAME,
        start_time: row.START_TIME ? new Date(row.START_TIME).toISOString() : new Date().toISOString(),
      }
    })

    console.log(`[Realtime Monitoring API] Found ${realtimeSQLs.length} active SQLs`)

    return NextResponse.json({
      success: true,
      data: realtimeSQLs,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Realtime monitoring API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch realtime monitoring data' },
      { status: 500 }
    )
  }
}
