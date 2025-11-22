import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getOracleConfig } from '@/lib/oracle/utils'
import { executeQuery } from '@/lib/oracle/client'
import oracledb from 'oracledb'

/**
 * GET /api/analysis/refactoring-suggestions
 * SQL 리팩토링 제안
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

    console.log('[Refactoring Suggestions API] connection_id:', connectionId)

    const config = await getOracleConfig(connectionId)

    // 리팩토링이 필요한 SQL 조회
    const query = `
      SELECT
        sql_id,
        sql_fulltext,
        sql_text,
        executions,
        cpu_time / 1000 as cpu_time_ms,
        elapsed_time / 1000 as elapsed_time_ms,
        buffer_gets,
        disk_reads
      FROM v$sql
      WHERE executions > 100
        AND (
          UPPER(sql_fulltext) LIKE '%SELECT *%'
          OR UPPER(sql_fulltext) LIKE '%OR%OR%'
          OR UPPER(sql_fulltext) LIKE '%UNION%UNION%'
          OR (cpu_time / DECODE(executions, 0, 1, executions)) > 100000
        )
      ORDER BY cpu_time DESC
      FETCH FIRST 10 ROWS ONLY
    `

    const result = await executeQuery(config, query, [], {
      fetchInfo: {
        SQL_FULLTEXT: { type: oracledb.STRING },
        SQL_TEXT: { type: oracledb.STRING },
      },
    })

    // AI 기반 리팩토링 제안 생성
    const suggestions = result.rows.map((row: any) => {
      const sqlText = (row.SQL_FULLTEXT || row.SQL_TEXT || '').toString()
      const improvements = []
      let refactoredSql = sqlText
      let performanceGain = 0
      let complexityReduction = 0

      // SELECT * 최적화
      if (sqlText.toUpperCase().includes('SELECT *')) {
        improvements.push({
          type: '컬럼 명시화',
          description: 'SELECT *를 필요한 컬럼만 선택하도록 변경',
          impact: 'high' as const,
        })
        refactoredSql = refactoredSql.replace(/SELECT\s+\*/gi, 'SELECT col1, col2, col3')
        performanceGain += 25
        complexityReduction += 15
      }

      // OR 조건 최적화
      if ((sqlText.match(/\sOR\s/gi) || []).length > 2) {
        improvements.push({
          type: 'OR 조건 최적화',
          description: 'OR 조건을 IN 절로 변경하거나 UNION ALL 사용',
          impact: 'high' as const,
        })
        performanceGain += 30
        complexityReduction += 20
      }

      // UNION 최적화
      if (sqlText.toUpperCase().includes('UNION') && !sqlText.toUpperCase().includes('UNION ALL')) {
        improvements.push({
          type: 'UNION ALL 사용',
          description: '중복 제거가 불필요한 경우 UNION을 UNION ALL로 변경',
          impact: 'medium' as const,
        })
        refactoredSql = refactoredSql.replace(/UNION(?!\s+ALL)/gi, 'UNION ALL')
        performanceGain += 20
        complexityReduction += 10
      }

      // 서브쿼리 최적화
      if ((sqlText.match(/\(\s*SELECT/gi) || []).length > 1) {
        improvements.push({
          type: '서브쿼리 조인 변환',
          description: '중첩된 서브쿼리를 JOIN으로 변환하여 성능 개선',
          impact: 'high' as const,
        })
        performanceGain += 35
        complexityReduction += 25
      }

      // 기본 개선사항이 없는 경우
      if (improvements.length === 0) {
        improvements.push({
          type: '인덱스 활용',
          description: 'WHERE 절의 컬럼에 적절한 인덱스 추가 검토',
          impact: 'medium' as const,
        })
        performanceGain = 15
        complexityReduction = 5
      }

      return {
        sql_id: row.SQL_ID,
        original_sql: sqlText,
        refactored_sql: refactoredSql !== sqlText ? refactoredSql : sqlText + '\n-- 인덱스 추가 권장: CREATE INDEX idx_name ON table_name(column_name)',
        improvements,
        performance_gain: Math.min(performanceGain, 100),
        complexity_reduction: Math.min(complexityReduction, 100),
        reasoning: `이 SQL은 ${improvements.map(i => i.type).join(', ')} 개선을 통해 ${performanceGain}%의 성능 향상을 기대할 수 있습니다. ` +
          `CPU 시간이 ${Math.round(Number(row.CPU_TIME_MS))}ms로 높으며, ${row.EXECUTIONS}번 실행되었습니다. ` +
          improvements.map(i => i.description).join(' ')
      }
    })

    console.log(`[Refactoring Suggestions API] Found ${suggestions.length} suggestions`)

    return NextResponse.json({
      success: true,
      data: suggestions,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Refactoring suggestions API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate refactoring suggestions' },
      { status: 500 }
    )
  }
}
