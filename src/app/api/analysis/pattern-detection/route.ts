import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getOracleConfig } from '@/lib/oracle/utils'
import { executeQuery } from '@/lib/oracle/client'

/**
 * GET /api/analysis/pattern-detection
 * SQL 성능 패턴 이슈 탐지
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const connectionId = searchParams.get('connection_id')
    const severity = searchParams.get('severity')
    const patternType = searchParams.get('pattern_type')

    if (!connectionId) {
      return NextResponse.json(
        { error: 'Connection ID is required' },
        { status: 400 }
      )
    }

    console.log('[Pattern Detection API] connection_id:', connectionId)

    const config = await getOracleConfig(connectionId)
    const issues: any[] = []
    const queryOpts = { timeout: 5000 } // 각 쿼리 타임아웃 5초

    // 모든 패턴 탐지 쿼리를 병렬로 실행 (성능 최적화: 순차 → 병렬)
    const patternQueries = []

    // 1. Full Table Scan 패턴 탐지 - buffer_gets가 높고 disk_reads가 높은 경우
    if (!patternType || patternType === 'all' || patternType === 'full_table_scan') {
      patternQueries.push({
        type: 'full_table_scan',
        query: `
          SELECT
            COUNT(sql_id) as sql_count,
            MIN(last_active_time) as first_detected,
            MAX(last_active_time) as last_detected
          FROM v$sql
          WHERE buffer_gets > 100000
            AND disk_reads > buffer_gets * 0.1
            AND executions > 10
            AND parsing_schema_name NOT IN ('SYS', 'SYSTEM')
            AND ROWNUM <= 200
        `,
        createIssue: (row: any) => ({
          id: 'full_table_scan',
          pattern_type: 'full_table_scan',
          severity: Number(row.SQL_COUNT) > 50 ? 'critical' : Number(row.SQL_COUNT) > 20 ? 'high' : 'medium',
          sql_count: Number(row.SQL_COUNT) || 0,
          description: '전체 테이블 스캔이 빈번하게 발생하고 있습니다',
          recommendation: '인덱스를 추가하거나 WHERE 절을 개선하여 범위 스캔으로 변경하세요.',
          affected_sqls: [],
          first_detected: row.FIRST_DETECTED || new Date().toISOString(),
          last_detected: row.LAST_DETECTED || new Date().toISOString(),
        })
      })
    }

    // 2. 중복 실행 패턴 탐지 (카티전 조인 대신 - LIKE 연산 제거로 성능 향상)
    if (!patternType || patternType === 'all' || patternType === 'redundant_execution') {
      patternQueries.push({
        type: 'redundant_execution',
        query: `
          SELECT
            COUNT(sql_id) as sql_count,
            MIN(last_active_time) as first_detected,
            MAX(last_active_time) as last_detected
          FROM v$sql
          WHERE executions > 1000
            AND parse_calls > executions * 1.5
            AND parsing_schema_name NOT IN ('SYS', 'SYSTEM')
            AND ROWNUM <= 200
        `,
        createIssue: (row: any) => ({
          id: 'redundant_execution',
          pattern_type: 'redundant_execution',
          severity: Number(row.SQL_COUNT) > 100 ? 'high' : 'medium',
          sql_count: Number(row.SQL_COUNT) || 0,
          description: '동일한 SQL이 중복으로 파싱되어 실행되고 있습니다',
          recommendation: '바인드 변수를 사용하여 SQL을 재사용하거나 애플리케이션에서 캐싱을 적용하세요.',
          affected_sqls: [],
          first_detected: row.FIRST_DETECTED || new Date().toISOString(),
          last_detected: row.LAST_DETECTED || new Date().toISOString(),
        })
      })
    }

    // 3. 비효율적 정렬 패턴 탐지 (LIKE 연산 제거 - disk_reads 기준으로만 판단)
    if (!patternType || patternType === 'all' || patternType === 'inefficient_sort') {
      patternQueries.push({
        type: 'inefficient_sort',
        query: `
          SELECT
            COUNT(sql_id) as sql_count,
            MIN(last_active_time) as first_detected,
            MAX(last_active_time) as last_detected
          FROM v$sql
          WHERE disk_reads > buffer_gets * 0.1
            AND disk_reads > 10000
            AND executions > 10
            AND parsing_schema_name NOT IN ('SYS', 'SYSTEM')
            AND ROWNUM <= 200
        `,
        createIssue: (row: any) => ({
          id: 'inefficient_sort',
          pattern_type: 'inefficient_sort',
          severity: Number(row.SQL_COUNT) > 30 ? 'high' : 'medium',
          sql_count: Number(row.SQL_COUNT) || 0,
          description: '비효율적인 정렬 또는 I/O 작업이 발견되었습니다',
          recommendation: 'ORDER BY 절에 사용된 컬럼에 인덱스를 추가하거나 PGA 메모리를 늘리세요.',
          affected_sqls: [],
          first_detected: row.FIRST_DETECTED || new Date().toISOString(),
          last_detected: row.LAST_DETECTED || new Date().toISOString(),
        })
      })
    }

    // 4. 고비용 SQL 패턴 탐지 (새 패턴 추가)
    if (!patternType || patternType === 'all' || patternType === 'high_cost_sql') {
      patternQueries.push({
        type: 'high_cost_sql',
        query: `
          SELECT
            COUNT(sql_id) as sql_count,
            MIN(last_active_time) as first_detected,
            MAX(last_active_time) as last_detected
          FROM v$sql
          WHERE elapsed_time / DECODE(executions, 0, 1, executions) > 5000000
            AND executions > 5
            AND parsing_schema_name NOT IN ('SYS', 'SYSTEM')
            AND ROWNUM <= 200
        `,
        createIssue: (row: any) => ({
          id: 'high_cost_sql',
          pattern_type: 'high_cost_sql',
          severity: Number(row.SQL_COUNT) > 20 ? 'critical' : 'high',
          sql_count: Number(row.SQL_COUNT) || 0,
          description: '실행 시간이 5초 이상인 고비용 SQL이 발견되었습니다',
          recommendation: '실행 계획을 검토하고 인덱스 추가 또는 SQL 리팩토링을 고려하세요.',
          affected_sqls: [],
          first_detected: row.FIRST_DETECTED || new Date().toISOString(),
          last_detected: row.LAST_DETECTED || new Date().toISOString(),
        })
      })
    }

    // 모든 쿼리 병렬 실행
    const results = await Promise.all(
      patternQueries.map(async ({ query, createIssue }) => {
        try {
          const result = await executeQuery(config, query, [], queryOpts)
          if (result.rows && result.rows.length > 0 && result.rows[0]?.SQL_COUNT > 0) {
            return createIssue(result.rows[0])
          }
          return null
        } catch (error) {
          console.warn('[Pattern Detection] Query failed:', error)
          return null
        }
      })
    )

    // null이 아닌 결과만 issues에 추가
    results.forEach(result => {
      if (result) issues.push(result)
    })

    // 심각도 필터링
    let filteredIssues = issues
    if (severity && severity !== 'all') {
      filteredIssues = issues.filter(issue => issue.severity === severity)
    }

    console.log(`[Pattern Detection API] Found ${filteredIssues.length} issues`)

    return NextResponse.json({
      success: true,
      data: filteredIssues,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Pattern detection API error:', error)
    return NextResponse.json(
      { error: 'Failed to detect patterns' },
      { status: 500 }
    )
  }
}
