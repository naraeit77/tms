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
    const issues = []

    // 1. Full Table Scan 패턴 탐지
    if (!patternType || patternType === 'all' || patternType === 'full_table_scan') {
      const fullScanQuery = `
        SELECT
          COUNT(DISTINCT sql_id) as sql_count,
          MIN(last_active_time) as first_detected,
          MAX(last_active_time) as last_detected
        FROM v$sql
        WHERE operation = 'TABLE ACCESS'
        AND options = 'FULL'
        AND executions > 10
      `

      const result = await executeQuery(config, fullScanQuery, [])
      if (result.rows[0]?.SQL_COUNT > 0) {
        const sqlCount = Number(result.rows[0].SQL_COUNT)
        issues.push({
          id: 'full_table_scan',
          pattern_type: 'full_table_scan',
          severity: sqlCount > 50 ? 'critical' : sqlCount > 20 ? 'high' : 'medium',
          sql_count: sqlCount,
          description: '전체 테이블 스캔이 빈번하게 발생하고 있습니다',
          recommendation: '인덱스를 추가하거나 WHERE 절을 개선하여 범위 스캔으로 변경하세요.',
          affected_sqls: [],
          first_detected: result.rows[0].FIRST_DETECTED || new Date().toISOString(),
          last_detected: result.rows[0].LAST_DETECTED || new Date().toISOString(),
        })
      }
    }

    // 2. 카티전 조인 패턴 탐지
    if (!patternType || patternType === 'all' || patternType === 'cartesian_join') {
      const cartesianQuery = `
        SELECT
          COUNT(DISTINCT sql_id) as sql_count,
          MIN(last_active_time) as first_detected,
          MAX(last_active_time) as last_detected
        FROM v$sql
        WHERE UPPER(sql_fulltext) LIKE '%CROSS JOIN%'
           OR (UPPER(sql_fulltext) LIKE '%FROM%,%'
               AND UPPER(sql_fulltext) NOT LIKE '%WHERE%')
      `

      const result = await executeQuery(config, cartesianQuery, [])
      if (result.rows[0]?.SQL_COUNT > 0) {
        const sqlCount = Number(result.rows[0].SQL_COUNT)
        issues.push({
          id: 'cartesian_join',
          pattern_type: 'cartesian_join',
          severity: 'critical',
          sql_count: sqlCount,
          description: '카티전 조인(Cartesian Join)이 감지되었습니다',
          recommendation: 'JOIN 조건을 명시하거나 WHERE 절에 조인 조건을 추가하세요.',
          affected_sqls: [],
          first_detected: result.rows[0].FIRST_DETECTED || new Date().toISOString(),
          last_detected: result.rows[0].LAST_DETECTED || new Date().toISOString(),
        })
      }
    }

    // 3. 중복 실행 패턴 탐지
    if (!patternType || patternType === 'all' || patternType === 'redundant_execution') {
      const redundantQuery = `
        SELECT
          COUNT(*) as sql_count,
          MIN(last_active_time) as first_detected,
          MAX(last_active_time) as last_detected
        FROM (
          SELECT sql_id, COUNT(*) as duplicate_count
          FROM v$sql
          WHERE executions > 1000
          GROUP BY sql_id
          HAVING COUNT(*) > 1
        )
      `

      const result = await executeQuery(config, redundantQuery, [])
      if (result.rows[0]?.SQL_COUNT > 0) {
        const sqlCount = Number(result.rows[0].SQL_COUNT)
        issues.push({
          id: 'redundant_execution',
          pattern_type: 'redundant_execution',
          severity: sqlCount > 100 ? 'high' : 'medium',
          sql_count: sqlCount,
          description: '동일한 SQL이 중복으로 파싱되어 실행되고 있습니다',
          recommendation: '바인드 변수를 사용하여 SQL을 재사용하거나 애플리케이션에서 캐싱을 적용하세요.',
          affected_sqls: [],
          first_detected: result.rows[0].FIRST_DETECTED || new Date().toISOString(),
          last_detected: result.rows[0].LAST_DETECTED || new Date().toISOString(),
        })
      }
    }

    // 4. 비효율적 정렬 패턴 탐지
    if (!patternType || patternType === 'all' || patternType === 'inefficient_sort') {
      const sortQuery = `
        SELECT
          COUNT(DISTINCT sql_id) as sql_count,
          MIN(last_active_time) as first_detected,
          MAX(last_active_time) as last_detected
        FROM v$sql
        WHERE UPPER(sql_fulltext) LIKE '%ORDER BY%'
        AND disk_reads > buffer_gets * 0.1
        AND executions > 10
      `

      const result = await executeQuery(config, sortQuery, [])
      if (result.rows[0]?.SQL_COUNT > 0) {
        const sqlCount = Number(result.rows[0].SQL_COUNT)
        issues.push({
          id: 'inefficient_sort',
          pattern_type: 'inefficient_sort',
          severity: sqlCount > 30 ? 'high' : 'medium',
          sql_count: sqlCount,
          description: '비효율적인 정렬 작업이 발견되었습니다',
          recommendation: 'ORDER BY 절에 사용된 컬럼에 인덱스를 추가하거나 PGA 메모리를 늘리세요.',
          affected_sqls: [],
          first_detected: result.rows[0].FIRST_DETECTED || new Date().toISOString(),
          last_detected: result.rows[0].LAST_DETECTED || new Date().toISOString(),
        })
      }
    }

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
