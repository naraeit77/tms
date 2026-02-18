import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getOracleConfig } from '@/lib/oracle/utils'
import { executeQuery } from '@/lib/oracle/client'

/**
 * GET /api/monitoring/sql-history
 * SQL 성능 히스토리 조회 (최근 7일)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const connectionId = searchParams.get('connection_id')
    const sqlId = searchParams.get('sql_id')

    if (!connectionId || !sqlId) {
      return NextResponse.json(
        { error: 'Connection ID and SQL ID are required' },
        { status: 400 }
      )
    }

    console.log('[SQL History API] connection_id:', connectionId, 'sql_id:', sqlId)

    const config = await getOracleConfig(connectionId)

    // DBA_HIST_SQLSTAT에서 히스토리 데이터 조회
    const historyQuery = `
      SELECT * FROM (
      SELECT
        TO_CHAR(s.end_interval_time, 'YYYY-MM-DD HH24:MI:SS') as snapshot_time,
        sql.executions_delta as executions,
        sql.elapsed_time_delta / 1000000 as elapsed_time_sec,
        sql.cpu_time_delta / 1000000 as cpu_time_sec,
        sql.buffer_gets_delta as buffer_gets,
        sql.disk_reads_delta as disk_reads,
        sql.rows_processed_delta as rows_processed,
        CASE
          WHEN sql.executions_delta > 0
          THEN sql.elapsed_time_delta / sql.executions_delta / 1000
          ELSE 0
        END as avg_elapsed_ms,
        CASE
          WHEN sql.executions_delta > 0
          THEN sql.cpu_time_delta / sql.executions_delta / 1000
          ELSE 0
        END as avg_cpu_ms
      FROM dba_hist_sqlstat sql
      JOIN dba_hist_snapshot s ON sql.snap_id = s.snap_id
      WHERE sql.sql_id = :sql_id
        AND s.end_interval_time >= SYSDATE - 7
      ORDER BY s.end_interval_time DESC
      ) WHERE ROWNUM <= 100
    `

    let historyResult
    try {
      historyResult = await executeQuery(config, historyQuery, [sqlId])
    } catch (err) {
      console.log('[SQL History API] AWR history not accessible, using v$sql snapshots:', err)

      // AWR을 사용할 수 없는 경우 v$sql의 현재 데이터만 반환
      const currentQuery = `
        SELECT * FROM (
        SELECT
          TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI:SS') as snapshot_time,
          executions,
          elapsed_time / 1000000 as elapsed_time_sec,
          cpu_time / 1000000 as cpu_time_sec,
          buffer_gets,
          disk_reads,
          rows_processed,
          elapsed_time / DECODE(executions, 0, 1, executions) / 1000 as avg_elapsed_ms,
          cpu_time / DECODE(executions, 0, 1, executions) / 1000 as avg_cpu_ms
        FROM v$sql
        WHERE sql_id = :sql_id
        ) WHERE ROWNUM <= 1
      `

      historyResult = await executeQuery(config, currentQuery, [sqlId])
    }

    // 결과 변환
    const history = historyResult.rows.map((row: any) => ({
      timestamp: row.SNAPSHOT_TIME,
      executions: Math.floor(Number(row.EXECUTIONS) || 0),
      elapsed_time_sec: Number(row.ELAPSED_TIME_SEC) || 0,
      cpu_time_sec: Number(row.CPU_TIME_SEC) || 0,
      buffer_gets: Math.floor(Number(row.BUFFER_GETS) || 0),
      disk_reads: Math.floor(Number(row.DISK_READS) || 0),
      rows_processed: Math.floor(Number(row.ROWS_PROCESSED) || 0),
      avg_elapsed_ms: Number(row.AVG_ELAPSED_MS) || 0,
      avg_cpu_ms: Number(row.AVG_CPU_MS) || 0,
    }))

    console.log(`[SQL History API] Found ${history.length} history records`)

    return NextResponse.json({
      success: true,
      data: history,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('SQL history API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch SQL history' },
      { status: 500 }
    )
  }
}
