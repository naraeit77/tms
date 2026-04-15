/**
 * Application Layer - Analyze Query Use Case
 * Orchestrates SQL parsing, index analysis, and recommendation generation
 */

import type {
  ParsedSQL,
  IndexCreationDiagram,
  IndexAnalysis,
  TuningRecommendation,
  ReportSummary,
  DiagramNode,
  DiagramEdge,
  DiagramColumn,
  AccessPath,
  ColumnAnalysis,
  IndexPointAnalysis,
  ExistingIndex,
} from '@/domain/query-artifacts'
import type { ISQLParser, IIndexMetadataRepository } from '@/domain/query-artifacts'
import type {
  AnalyzeQueryRequest,
  AnalyzeQueryResponse,
  QueryArtifactOutput,
  AnalysisMetadata,
} from '../dto'
import { HealthScore, IndexCandidateScore } from '@/domain/query-artifacts'
import type { IndexAnalyzer } from '@/infrastructure/query-artifacts/analyzers/IndexAnalyzer'

/**
 * Analyze Query Use Case
 * Main orchestrator for Query Artifacts feature
 */
export class AnalyzeQueryUseCase {
  constructor(
    private readonly sqlParser: ISQLParser,
    private readonly indexRepository: IIndexMetadataRepository,
    private readonly indexAnalyzer?: IndexAnalyzer
  ) {}

  /**
   * Execute the analysis
   */
  async execute(request: AnalyzeQueryRequest): Promise<AnalyzeQueryResponse> {
    const startTime = Date.now()
    const analysisId = this.generateAnalysisId()

    try {
      // Validate request
      if (!request.sql?.trim()) {
        return this.createErrorResponse('INVALID_SQL', 'SQL statement is required', startTime, analysisId)
      }

      if (!request.connectionId) {
        return this.createErrorResponse('INVALID_SQL', 'Connection ID is required', startTime, analysisId)
      }

      // Check for PL/SQL blocks (detailed error message)
      if (this.isPLSQL(request.sql)) {
        return this.createErrorResponse(
          'UNSUPPORTED_SYNTAX',
          'PL/SQL 블록은 분석할 수 없습니다.\n\n' +
          '[ PL/SQL 분석이 불가한 이유 ]\n' +
          '  - PL/SQL은 절차적 로직(IF, LOOP, EXCEPTION 등)을 포함하여 정적 분석이 어렵습니다.\n' +
          '  - EXECUTE IMMEDIATE 등 동적 SQL은 런타임에만 결정되므로 사전 분석이 불가능합니다.\n' +
          '  - 변수, 커서, 예외처리 등 복잡한 구조로 인해 SQL 추출이 부정확할 수 있습니다.\n\n' +
          '[ 대안 ]\n' +
          '  - PL/SQL 내부의 개별 SQL문(SELECT, UPDATE, DELETE 등)을 복사하여 별도로 분석하세요.\n' +
          '  - 커서(CURSOR)에 사용된 SELECT 문을 추출하여 분석하면 인덱스 최적화가 가능합니다.\n' +
          '  - FOR 루프 내의 SQL문도 별도 추출하여 분석할 수 있습니다.\n\n' +
          '[ 지원되는 SQL 유형 ]\n' +
          '  - SELECT (WITH절/CTE 포함)\n' +
          '  - UPDATE ... WHERE\n' +
          '  - DELETE ... WHERE\n' +
          '  - INSERT ... SELECT',
          startTime, analysisId
        )
      }

      // Check for INSERT...VALUES (no query to analyze)
      if (this.isInsertValues(request.sql)) {
        return this.createErrorResponse(
          'UNSUPPORTED_SYNTAX',
          'INSERT ... VALUES 문은 인덱스 분석 대상이 아닙니다.\n\n' +
          '단순 INSERT는 조회 조건이 없어 인덱스 최적화 분석이 불필요합니다.\n' +
          'INSERT ... SELECT 문은 SELECT 부분의 인덱스 분석이 가능합니다.',
          startTime, analysisId
        )
      }

      // Check if SQL is supported
      if (!this.sqlParser.isSupported(request.sql)) {
        return this.createErrorResponse(
          'UNSUPPORTED_SYNTAX',
          '지원되지 않는 SQL 유형입니다.\n\n' +
          '[ 지원되는 SQL 유형 ]\n' +
          '  - SELECT (WITH절/CTE 포함)\n' +
          '  - UPDATE ... WHERE\n' +
          '  - DELETE ... WHERE\n' +
          '  - INSERT ... SELECT',
          startTime, analysisId
        )
      }

      // Parse SQL
      const parsedSQL = this.sqlParser.parse(request.sql)

      if (parsedSQL.tables.length === 0) {
        return this.createErrorResponse('PARSE_ERROR', 'No tables found in SQL', startTime, analysisId)
      }

      // Get table names for index lookup
      const tableNames = parsedSQL.tables.map(t => t.name)

      // Determine schema owner:
      // 1. Explicit request owner
      // 2. Schema from SQL (e.g., HR.EMPLOYEES)
      // 3. Will be resolved from connection username in repository
      const explicitSchema = request.owner || request.options?.targetSchema

      // Collect unique schemas from parsed SQL tables
      const parsedSchemas = new Set(
        parsedSQL.tables
          .filter(t => t.schema)
          .map(t => t.schema!.toUpperCase())
      )

      // Fetch existing indexes
      let existingIndexes: Map<string, ExistingIndex[]> = new Map()
      if (request.options?.includeStatistics !== false) {
        try {
          if (parsedSchemas.size > 1 && !explicitSchema) {
            // Multiple schemas in SQL - fetch per schema
            for (const schema of parsedSchemas) {
              const schemaTables = parsedSQL.tables
                .filter(t => t.schema?.toUpperCase() === schema)
                .map(t => t.name)
              const schemaIndexes = await this.indexRepository.getIndexesForTables(
                request.connectionId,
                schema,
                schemaTables
              )
              for (const [table, indexes] of schemaIndexes) {
                existingIndexes.set(table, indexes)
              }
            }
            // Also fetch for tables without explicit schema using connection user
            const noSchemaTables = parsedSQL.tables
              .filter(t => !t.schema)
              .map(t => t.name)
            if (noSchemaTables.length > 0) {
              const defaultIndexes = await this.indexRepository.getIndexesForTables(
                request.connectionId,
                '', // empty string signals to use connection username
                noSchemaTables
              )
              for (const [table, indexes] of defaultIndexes) {
                existingIndexes.set(table, indexes)
              }
            }
          } else {
            // Single schema or explicit schema provided
            const schema = explicitSchema
              || (parsedSchemas.size === 1 ? [...parsedSchemas][0] : '')
            existingIndexes = await this.indexRepository.getIndexesForTables(
              request.connectionId,
              schema,
              tableNames
            )
          }
        } catch {
          // Continue without index metadata if unavailable
          console.warn('Could not fetch index metadata, continuing without it')
        }
      }

      // Analyze columns
      const columnAnalyses = this.analyzeColumns(parsedSQL, existingIndexes)

      // Fetch table row counts for join direction analysis
      let tableRowCounts: Map<string, number> = new Map()
      try {
        tableRowCounts = await this.fetchTableRowCounts(
          request.connectionId,
          explicitSchema || (parsedSchemas.size === 1 ? [...parsedSchemas][0] : ''),
          tableNames
        )
      } catch {
        console.warn('Could not fetch table row counts, using heuristics for access order')
      }

      // Determine optimal access order using actual row counts
      const optimalAccessOrder = this.determineAccessOrder(parsedSQL, columnAnalyses, tableRowCounts)

      // Identify index points
      const indexPoints = this.identifyIndexPoints(
        parsedSQL,
        columnAnalyses,
        existingIndexes,
        optimalAccessOrder
      )

      // Build analysis result
      const analysis: IndexAnalysis = {
        parsedSQL,
        columnAnalyses,
        indexPoints,
        optimalAccessOrder,
      }

      // Build diagram
      const diagram = this.buildDiagram(parsedSQL, existingIndexes, columnAnalyses, optimalAccessOrder)

      // Generate recommendations
      const recommendations = this.generateRecommendations(indexPoints, analysis)

      // Generate hints if requested
      let hints: string | undefined
      if (request.options?.includeHints) {
        hints = this.generateHints(optimalAccessOrder, parsedSQL)
      }

      // Calculate summary
      const summary = this.calculateSummary(diagram, indexPoints, recommendations)

      const output: QueryArtifactOutput = {
        diagram,
        analysis,
        recommendations,
        summary,
        hints,
      }

      return {
        success: true,
        data: output,
        metadata: this.createMetadata(analysisId, startTime),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred'
      return this.createErrorResponse('INTERNAL_ERROR', message, startTime, analysisId)
    }
  }

  /**
   * Analyze columns for index candidacy
   */
  private analyzeColumns(
    parsedSQL: ParsedSQL,
    existingIndexes: Map<string, ExistingIndex[]>
  ): ColumnAnalysis[] {
    const analyses: ColumnAnalysis[] = []

    for (const column of parsedSQL.columns) {
      if (column.condition.type === 'NONE') continue

      const candidateScore = new IndexCandidateScore(
        column.condition.type,
        column.condition.operator,
        undefined, // selectivity would come from stats
        undefined // nullRatio would come from stats
      )

      const analysis: ColumnAnalysis = {
        columnId: column.id,
        tableName: column.tableName,
        columnName: column.name,
        selectivity: 0.05, // Default assumption
        selectivityGrade: 'FAIR',
        isIndexable: candidateScore.isCandidate,
        score: candidateScore.score,
        reasons: candidateScore.reasons,
        excludeReasons: candidateScore.excludeReasons,
      }

      analyses.push(analysis)
    }

    return analyses
  }

  /**
   * Determine optimal table access order based on actual table statistics
   * Rules:
   * 1. Entry table = table with WHERE condition that produces smallest result set
   *    - Consider both selectivity score AND actual row count
   * 2. Join direction: smaller result set drives, larger is driven (NL Join principle)
   * 3. INNER JOINs before OUTER JOINs
   * 4. Follow join relationships
   */
  private determineAccessOrder(
    parsedSQL: ParsedSQL,
    columnAnalyses: ColumnAnalysis[],
    tableRowCounts: Map<string, number> = new Map()
  ): string[] {
    const order: string[] = []
    const visited = new Set<string>()

    // Separate INNER and OUTER tables
    const innerTables = parsedSQL.tables.filter(t => !t.isOuterJoinTarget)
    const outerTables = parsedSQL.tables.filter(t => t.isOuterJoinTarget)

    // Find entry table: best selectivity WHERE condition, weighted by actual row count
    const whereColumns = columnAnalyses.filter(
      ca => {
        const col = parsedSQL.columns.find(c => c.id === ca.columnId)
        return col?.condition.type === 'WHERE' && ca.isIndexable
      }
    )

    let entryTableId: string | null = null
    if (whereColumns.length > 0) {
      // Score each candidate considering both selectivity and actual row count
      // Lower estimated result rows = better entry point
      const candidates = whereColumns.map(ca => {
        const col = parsedSQL.columns.find(c => c.id === ca.columnId)
        const table = col ? parsedSQL.tables.find(t => t.id === col.tableId) : null
        const rowCount = table ? (tableRowCounts.get(table.name) || 0) : 0

        // Estimated result rows after applying filter
        // selectivity of 0.05 means ~5% of rows will remain
        const estimatedRows = rowCount > 0
          ? rowCount * (ca.selectivity || 0.05)
          : 1 / ca.score // fallback: higher score = fewer estimated rows

        return {
          columnAnalysis: ca,
          tableId: col?.tableId,
          tableName: table?.name,
          rowCount,
          estimatedRows,
          score: ca.score,
        }
      }).filter(c => c.tableId)

      // Sort by estimated result rows ascending (smallest result set first)
      // If row counts unavailable, fall back to score descending
      candidates.sort((a, b) => {
        if (a.rowCount > 0 && b.rowCount > 0) {
          return a.estimatedRows - b.estimatedRows
        }
        return b.score - a.score
      })

      if (candidates.length > 0) {
        entryTableId = candidates[0].tableId!
      }
    }

    // If no WHERE condition, use smallest INNER table by row count
    if (!entryTableId && innerTables.length > 0) {
      const tablesWithCounts = innerTables
        .map(t => ({ id: t.id, name: t.name, rows: tableRowCounts.get(t.name) || 0 }))

      const hasRowCounts = tablesWithCounts.some(t => t.rows > 0)
      if (hasRowCounts) {
        // Sort by row count ascending (smallest table first)
        tablesWithCounts.sort((a, b) => (a.rows || Infinity) - (b.rows || Infinity))
        entryTableId = tablesWithCounts[0].id
      } else {
        entryTableId = innerTables[0].id
      }
    }

    // Start with entry table
    if (entryTableId) {
      order.push(entryTableId)
      visited.add(entryTableId)
    }

    // BFS through join relationships for INNER tables
    // When choosing next table, prefer smaller tables (join direction: small → large)
    const queue = [...order]
    while (queue.length > 0) {
      const currentId = queue.shift()!

      // Find all connected tables via joins
      const connectedTables: Array<{ id: string; rowCount: number }> = []
      for (const join of parsedSQL.joins) {
        if (join.joinType === 'LEFT_OUTER' || join.joinType === 'RIGHT_OUTER') continue

        let nextId: string | null = null
        if (join.sourceTableId === currentId && !visited.has(join.targetTableId)) {
          nextId = join.targetTableId
        } else if (join.targetTableId === currentId && !visited.has(join.sourceTableId)) {
          nextId = join.sourceTableId
        }

        if (nextId && innerTables.some(t => t.id === nextId)) {
          const nextTable = parsedSQL.tables.find(t => t.id === nextId)
          connectedTables.push({
            id: nextId,
            rowCount: nextTable ? (tableRowCounts.get(nextTable.name) || 0) : 0,
          })
        }
      }

      // Sort connected tables by row count ascending (smaller tables first for NL join)
      const hasRowCounts = connectedTables.some(t => t.rowCount > 0)
      if (hasRowCounts) {
        connectedTables.sort((a, b) => (a.rowCount || Infinity) - (b.rowCount || Infinity))
      }

      for (const next of connectedTables) {
        if (!visited.has(next.id)) {
          order.push(next.id)
          visited.add(next.id)
          queue.push(next.id)
        }
      }
    }

    // Add remaining INNER tables (sorted by row count if available)
    const remainingInner = innerTables.filter(t => !visited.has(t.id))
    if (remainingInner.length > 0) {
      const hasRowCounts = remainingInner.some(t => tableRowCounts.get(t.name))
      if (hasRowCounts) {
        remainingInner.sort((a, b) =>
          (tableRowCounts.get(a.name) || Infinity) - (tableRowCounts.get(b.name) || Infinity)
        )
      }
      for (const table of remainingInner) {
        order.push(table.id)
        visited.add(table.id)
      }
    }

    // Add OUTER tables last
    for (const table of outerTables) {
      order.push(table.id)
    }

    return order
  }

  /**
   * Fetch actual row counts for all tables from Oracle statistics
   */
  private async fetchTableRowCounts(
    connectionId: string,
    schema: string,
    tableNames: string[]
  ): Promise<Map<string, number>> {
    const rowCounts = new Map<string, number>()

    for (const tableName of tableNames) {
      try {
        const count = await this.indexRepository.getTableRowCount(
          connectionId,
          schema || '',
          tableName
        )
        if (count > 0) {
          rowCounts.set(tableName, count)
        }
      } catch {
        // Skip tables where row count is unavailable
      }
    }

    return rowCounts
  }

  /**
   * Identify index points (positions where indexes are needed)
   */
  private identifyIndexPoints(
    parsedSQL: ParsedSQL,
    columnAnalyses: ColumnAnalysis[],
    existingIndexes: Map<string, ExistingIndex[]>,
    accessOrder: string[]
  ): IndexPointAnalysis[] {
    const points: IndexPointAnalysis[] = []
    let pointNumber = 1

    for (let i = 0; i < accessOrder.length; i++) {
      const tableId = accessOrder[i]
      const table = parsedSQL.tables.find(t => t.id === tableId)
      if (!table) continue

      const tableIndexes = existingIndexes.get(table.name) || []
      const tableColumns = parsedSQL.columns.filter(c => c.tableId === tableId)

      for (const column of tableColumns) {
        const analysis = columnAnalyses.find(a => a.columnId === column.id)
        if (!analysis || !analysis.isIndexable) continue

        const existingIndex = this.findIndexForColumn(tableIndexes, column.name)
        const isFirstTable = i === 0

        let pointType: 'ENTRY' | 'JOIN' | 'FILTER' | 'ORDER'
        let priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

        if (isFirstTable && column.condition.type === 'WHERE') {
          pointType = 'ENTRY'
          priority = existingIndex ? 'LOW' : 'CRITICAL'
        } else if (column.condition.type === 'JOIN') {
          pointType = 'JOIN'
          priority = existingIndex ? 'LOW' : 'HIGH'
        } else if (column.condition.type === 'WHERE') {
          pointType = 'FILTER'
          priority = existingIndex ? 'LOW' : 'MEDIUM'
        } else if (column.condition.type === 'ORDER_BY') {
          pointType = 'ORDER'
          priority = existingIndex ? 'LOW' : 'MEDIUM'
        } else {
          continue
        }

        points.push({
          pointNumber: pointNumber++,
          tableName: table.name,
          columnName: column.name,
          columnId: column.id,
          pointType,
          existingIndex,
          needsIndex: !existingIndex,
          priority,
        })
      }
    }

    return points
  }

  /**
   * Find an index that covers the given column
   */
  private findIndexForColumn(indexes: ExistingIndex[], columnName: string): ExistingIndex | undefined {
    // First, try to find index where column is leading
    const leadingIndex = indexes.find(
      idx => idx.columns[0]?.columnName.toUpperCase() === columnName.toUpperCase()
    )
    if (leadingIndex) return leadingIndex

    // Then, any index containing the column
    return indexes.find(
      idx => idx.columns.some(c => c.columnName.toUpperCase() === columnName.toUpperCase())
    )
  }

  /**
   * Build the diagram representation
   */
  private buildDiagram(
    parsedSQL: ParsedSQL,
    existingIndexes: Map<string, ExistingIndex[]>,
    columnAnalyses: ColumnAnalysis[],
    accessOrder: string[]
  ): IndexCreationDiagram {
    const nodes: DiagramNode[] = []
    const edges: DiagramEdge[] = []

    // Create nodes for each table
    for (const table of parsedSQL.tables) {
      const tableIndexes = existingIndexes.get(table.name) || []
      const tableColumns = parsedSQL.columns.filter(c => c.tableId === table.id)

      const diagramColumns: DiagramColumn[] = tableColumns
        .filter(c => c.condition.type !== 'NONE')
        .map((col, idx) => {
          const analysis = columnAnalyses.find(a => a.columnId === col.id)
          const hasIndex = this.findIndexForColumn(tableIndexes, col.name) !== undefined

          return {
            id: `${table.id}-col-${idx}`,
            columnId: col.id,
            name: col.name,
            hasIndex,
            isIndexCandidate: analysis?.isIndexable ?? false,
            candidateReason: analysis?.reasons.join('; '),
            excludeReason: analysis?.excludeReasons.join('; '),
            conditionType: col.condition.type,
            position: idx + 1,
            selectivityGrade: analysis?.selectivityGrade,
          }
        })

      nodes.push({
        id: table.id,
        tableId: table.id,
        tableName: table.name,
        alias: table.alias,
        type: table.isOuterJoinTarget ? 'OUTER' : 'INNER',
        position: { x: 0, y: 0 }, // Will be calculated by layout engine
        columns: diagramColumns,
      })
    }

    // Create edges for joins
    for (const join of parsedSQL.joins) {
      const sourceNode = nodes.find(n => n.tableId === join.sourceTableId)
      const targetNode = nodes.find(n => n.tableId === join.targetTableId)

      if (!sourceNode || !targetNode) continue

      const sourceCol = sourceNode.columns.find(c => c.columnId === join.sourceColumnId)
      const targetCol = targetNode.columns.find(c => c.columnId === join.targetColumnId)

      edges.push({
        id: join.id,
        sourceNodeId: sourceNode.id,
        sourceColumnPosition: sourceCol?.position ?? 1,
        targetNodeId: targetNode.id,
        targetColumnPosition: targetCol?.position ?? 1,
        joinType: join.joinType,
        lineStyle: join.joinType.includes('OUTER') ? 'DASHED' : 'SOLID',
      })
    }

    // Build access path
    const accessPath: AccessPath[] = accessOrder.map((tableId, idx) => {
      const table = parsedSQL.tables.find(t => t.id === tableId)!
      const node = nodes.find(n => n.tableId === tableId)!

      // Find entry/join column
      let entryColumnId: string | undefined
      let entryColumnName: string | undefined
      let joinColumnId: string | undefined
      let joinColumnName: string | undefined

      if (idx === 0) {
        // Entry table - find WHERE column
        const whereCol = node.columns.find(c => c.conditionType === 'WHERE')
        entryColumnId = whereCol?.columnId
        entryColumnName = whereCol?.name
      } else {
        // Join table - find JOIN column
        const joinCol = node.columns.find(c => c.conditionType === 'JOIN')
        joinColumnId = joinCol?.columnId
        joinColumnName = joinCol?.name
      }

      return {
        order: idx + 1,
        nodeId: node.id,
        tableName: table.name,
        entryColumnId,
        entryColumnName,
        joinColumnId,
        joinColumnName,
      }
    })

    return {
      nodes,
      edges,
      recommendedAccessPath: accessPath,
    }
  }

  /**
   * Generate tuning recommendations
   */
  private generateRecommendations(
    indexPoints: IndexPointAnalysis[],
    analysis: IndexAnalysis
  ): TuningRecommendation[] {
    const recommendations: TuningRecommendation[] = []

    // Group points by priority
    const criticalPoints = indexPoints.filter(p => p.needsIndex && p.priority === 'CRITICAL')
    const highPoints = indexPoints.filter(p => p.needsIndex && p.priority === 'HIGH')
    const mediumPoints = indexPoints.filter(p => p.needsIndex && p.priority === 'MEDIUM')

    // Generate CREATE INDEX recommendations
    for (const point of [...criticalPoints, ...highPoints, ...mediumPoints]) {
      const indexName = `IX_${point.tableName}_${point.columnName}`.substring(0, 30).toUpperCase()

      recommendations.push({
        id: `REC_${point.pointNumber}`,
        type: 'CREATE_INDEX',
        priority: point.priority,
        title: `${point.tableName}.${point.columnName} 인덱스 생성`,
        description: this.getRecommendationDescription(point),
        rationale: this.getRecommendationRationale(point),
        ddl: `CREATE INDEX ${indexName} ON ${point.tableName}(${point.columnName});`,
        expectedImprovement: this.getExpectedImprovement(point.priority),
        risk: '인덱스 생성으로 INSERT/UPDATE/DELETE 성능에 영향',
        relatedPoints: [point.pointNumber],
      })
    }

    return recommendations
  }

  private getRecommendationDescription(point: IndexPointAnalysis): string {
    switch (point.pointType) {
      case 'ENTRY':
        return `쿼리 진입점의 ${point.columnName} 컬럼에 인덱스가 없습니다. Full Table Scan이 발생합니다.`
      case 'JOIN':
        return `조인 컬럼 ${point.columnName}에 인덱스가 없습니다. Nested Loop Join 성능이 저하됩니다.`
      case 'FILTER':
        return `필터 조건 컬럼 ${point.columnName}에 인덱스가 없습니다.`
      case 'ORDER':
        return `정렬 컬럼 ${point.columnName}에 인덱스가 없어 Sort 연산이 발생합니다.`
      default:
        return `${point.columnName} 컬럼에 인덱스 생성을 권장합니다.`
    }
  }

  private getRecommendationRationale(point: IndexPointAnalysis): string {
    switch (point.pointType) {
      case 'ENTRY':
        return '쿼리 진입점 - 첫 번째 접근 테이블의 조건 컬럼\n인덱스 없이는 Full Table Scan 발생'
      case 'JOIN':
        return '조인 연결 컬럼 - Nested Loop Join에 필수\n인덱스 없으면 Hash Join 또는 Sort Merge Join으로 전환'
      case 'FILTER':
        return '필터 조건 컬럼 - 결과 집합 축소에 기여'
      case 'ORDER':
        return '정렬 컬럼 - 소트 연산 제거 가능'
      default:
        return '인덱스 생성 권장'
    }
  }

  private getExpectedImprovement(priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'): string {
    switch (priority) {
      case 'CRITICAL':
        return '예상 성능 개선: 10배 이상'
      case 'HIGH':
        return '예상 성능 개선: 5-10배'
      case 'MEDIUM':
        return '예상 성능 개선: 2-5배'
      case 'LOW':
        return '예상 성능 개선: 미미함'
    }
  }

  /**
   * Generate Oracle hints
   */
  private generateHints(accessOrder: string[], parsedSQL: ParsedSQL): string {
    if (accessOrder.length < 2) return ''

    const tableAliases = accessOrder.map(id => {
      const table = parsedSQL.tables.find(t => t.id === id)
      return table?.alias || table?.name || id
    })

    const leadingHint = `/*+ LEADING(${tableAliases.join(' ')}) */`
    const useNlHint = `/*+ USE_NL(${tableAliases.slice(1).join(' ')}) */`

    return `${leadingHint}\n${useNlHint}`
  }

  /**
   * Calculate report summary
   */
  private calculateSummary(
    diagram: IndexCreationDiagram,
    indexPoints: IndexPointAnalysis[],
    recommendations: TuningRecommendation[]
  ): ReportSummary {
    const existingIndexCount = indexPoints.filter(p => p.existingIndex).length
    const missingIndexCount = indexPoints.filter(p => p.needsIndex).length
    const criticalIssueCount = recommendations.filter(r => r.priority === 'CRITICAL').length

    const healthScore = new HealthScore(
      existingIndexCount,
      indexPoints.length,
      criticalIssueCount
    )

    return {
      tableCount: diagram.nodes.length,
      joinCount: diagram.edges.length,
      existingIndexCount,
      missingIndexCount,
      criticalIssueCount,
      overallHealthScore: healthScore.value,
    }
  }

  /**
   * Create error response
   */
  private createErrorResponse(
    code: string,
    message: string,
    startTime: number,
    analysisId: string
  ): AnalyzeQueryResponse {
    return {
      success: false,
      error: {
        code: code as any,
        message,
      },
      metadata: this.createMetadata(analysisId, startTime),
    }
  }

  /**
   * Create analysis metadata
   */
  private createMetadata(analysisId: string, startTime: number): AnalysisMetadata {
    return {
      analysisId,
      executionTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      parserVersion: '1.0.0',
    }
  }

  /**
   * Generate unique analysis ID
   */
  private generateAnalysisId(): string {
    return `qa_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }

  /**
   * Check if SQL is a PL/SQL block
   */
  private isPLSQL(sql: string): boolean {
    const stripped = sql
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim()
    return /^\s*(DECLARE\b|BEGIN\b|CREATE\s+(OR\s+REPLACE\s+)?(PROCEDURE|FUNCTION|PACKAGE|TRIGGER|TYPE)\b)/i.test(stripped)
  }

  /**
   * Check if SQL is INSERT...VALUES (no SELECT)
   */
  private isInsertValues(sql: string): boolean {
    const stripped = sql
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim()
    return /^\s*INSERT\b/i.test(stripped) && !/\bSELECT\b/i.test(stripped)
  }
}
