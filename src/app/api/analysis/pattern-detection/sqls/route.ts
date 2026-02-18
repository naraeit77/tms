import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getOracleConfig } from '@/lib/oracle/utils'
import { executeQuery } from '@/lib/oracle/client'

/**
 * GET /api/analysis/pattern-detection/sqls
 * 패턴별 SQL 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const connectionId = searchParams.get('connection_id')
    const patternType = searchParams.get('pattern_type')
    const limit = parseInt(searchParams.get('limit') || '50')

    if (!connectionId) {
      return NextResponse.json(
        { error: 'Connection ID is required' },
        { status: 400 }
      )
    }

    if (!patternType) {
      return NextResponse.json(
        { error: 'Pattern type is required' },
        { status: 400 }
      )
    }

    const config = await getOracleConfig(connectionId)

    // 패턴 타입에 따른 WHERE 조건 생성
    let whereConditions = [
      "parsing_schema_name NOT IN ('SYS', 'SYSTEM')",
      "executions > 0"
    ]

    // 패턴별 WHERE 조건 생성 (sql_text는 SELECT에서만 처리)
    switch (patternType) {
      case 'full_table_scan':
        whereConditions.push('buffer_gets > 100000')
        whereConditions.push('disk_reads > buffer_gets * 0.1')
        whereConditions.push('executions > 10')
        break
      case 'cartesian_join':
        // sql_text는 SELECT에서 가져온 후 필터링 (CLOB 처리 문제 방지)
        whereConditions.push('executions > 5')
        whereConditions.push('buffer_gets > 10000')
        break
      case 'redundant_execution':
        whereConditions.push('executions > 1000')
        // parse_calls는 v$sql에 없을 수 있으므로 제거
        // 대신 executions가 높고 elapsed_time이 높은 경우를 찾음
        whereConditions.push('elapsed_time / DECODE(executions, 0, 1, executions) > 1000000')
        break
      case 'inefficient_sort':
        // sql_text는 SELECT에서 가져온 후 필터링
        whereConditions.push('disk_reads > buffer_gets * 0.1')
        whereConditions.push('executions > 10')
        break
      default:
        return NextResponse.json(
          { error: 'Invalid pattern type' },
          { status: 400 }
        )
    }

    // sql_text는 CLOB이므로 SUBSTR 사용 (Oracle 12c+에서는 CLOB에서도 작동)
    // DBMS_LOB는 권한 문제가 있을 수 있으므로 SUBSTR 사용
    const query = `
      SELECT * FROM (
      SELECT
        sql_id as SQL_ID,
        CASE 
          WHEN sql_text IS NULL THEN NULL
          ELSE SUBSTR(TO_CHAR(sql_text), 1, 500)
        END as SQL_TEXT,
        module as MODULE,
        parsing_schema_name as SCHEMA_NAME,
        executions as EXECUTIONS,
        elapsed_time / 1000 as ELAPSED_TIME_MS,
        cpu_time / 1000 as CPU_TIME_MS,
        buffer_gets as BUFFER_GETS,
        disk_reads as DISK_READS,
        rows_processed as ROWS_PROCESSED,
        elapsed_time / DECODE(executions, 0, 1, executions) / 1000 as AVG_ELAPSED_TIME_MS,
        buffer_gets / DECODE(executions, 0, 1, executions) as GETS_PER_EXEC,
        TO_CHAR(last_active_time, 'YYYY-MM-DD HH24:MI:SS') as LAST_ACTIVE_TIME,
        plan_hash_value as PLAN_HASH_VALUE
      FROM
        v$sql
      WHERE
        ${whereConditions.join(' AND ')}
      ORDER BY
        buffer_gets DESC
      ) WHERE ROWNUM <= ${limit}
    `

    console.log('[Pattern Detection SQLs] Executing query for pattern:', patternType)
    const result = await executeQuery(config, query)

    // 데이터 변환: 대문자 컬럼명을 소문자로 변환하고 null 처리
    let sqls = (result.rows || []).map((row: any) => {
      // SQL 텍스트를 문자열로 변환
      let sqlText = row.SQL_TEXT || '';
      if (sqlText && typeof sqlText !== 'string') {
        if (Buffer.isBuffer(sqlText)) {
          sqlText = sqlText.toString('utf-8');
        } else if (sqlText.toString) {
          sqlText = sqlText.toString();
        }
      }

      return {
        sql_id: row.SQL_ID || '',
        sql_text: sqlText,
        module: row.MODULE || null,
        schema_name: row.SCHEMA_NAME || null,
        executions: Math.floor(Number(row.EXECUTIONS) || 0),
        elapsed_time_ms: Number(row.ELAPSED_TIME_MS) || 0,
        cpu_time_ms: Number(row.CPU_TIME_MS) || 0,
        buffer_gets: Math.floor(Number(row.BUFFER_GETS) || 0),
        disk_reads: Math.floor(Number(row.DISK_READS) || 0),
        rows_processed: Math.floor(Number(row.ROWS_PROCESSED) || 0),
        avg_elapsed_time_ms: Number(row.AVG_ELAPSED_TIME_MS) || 0,
        gets_per_exec: Number(row.GETS_PER_EXEC) || 0,
        last_active_time: row.LAST_ACTIVE_TIME || new Date().toISOString(),
        plan_hash_value: row.PLAN_HASH_VALUE || null,
      };
    });

    // 패턴별 추가 필터링 (sql_text 기반)
    if (patternType === 'cartesian_join' || patternType === 'inefficient_sort') {
      sqls = sqls.filter((sql: any) => {
        const sqlText = (sql.sql_text || '').toUpperCase()
        if (patternType === 'cartesian_join') {
          return sqlText.includes('CROSS JOIN') || 
                 (sqlText.includes('FROM') && !sqlText.includes('WHERE') && sqlText.includes(','))
        } else if (patternType === 'inefficient_sort') {
          return sqlText.includes('ORDER BY')
        }
        return true
      })
    }

    return NextResponse.json({
      success: true,
      data: sqls,
      total: sqls.length,
      pattern_type: patternType,
    })
  } catch (error: any) {
    console.error('[Pattern Detection SQLs] API error:', {
      message: error.message,
      stack: error.stack,
      connectionId,
      patternType,
      limit,
    })
    
    // 더 구체적인 에러 메시지 제공
    let errorMessage = 'Failed to fetch pattern SQLs'
    if (error.message?.includes('ORA-00904')) {
      errorMessage = 'Database column not found. Please check Oracle version compatibility.'
    } else if (error.message?.includes('ORA-00942')) {
      errorMessage = 'Table or view does not exist. Please check database permissions.'
    } else if (error.message?.includes('ORA-01017')) {
      errorMessage = 'Invalid username/password for database connection.'
    } else if (error.message?.includes('ORA-12154')) {
      errorMessage = 'Cannot connect to database. Please check connection settings.'
    } else if (error.message) {
      errorMessage = error.message
    }
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}

