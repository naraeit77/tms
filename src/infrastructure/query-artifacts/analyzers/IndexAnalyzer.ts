/**
 * Infrastructure Layer - Index Analyzer
 * Analyzes SQL columns for index candidacy and recommendations
 */

import type {
  ParsedSQL,
  ParsedColumn,
  ColumnAnalysis,
  IndexPointAnalysis,
  ExistingIndex,
  ColumnStatistics,
  SelectivityGrade,
  IndexPointType,
  IndexPriority,
} from '@/domain/query-artifacts/entities'
import { IndexCandidateScore, Selectivity } from '@/domain/query-artifacts/value-objects'

/**
 * Index Analyzer
 * Evaluates columns for index candidacy based on selectivity and usage patterns
 */
export class IndexAnalyzer {
  /**
   * Analyze columns for index candidacy
   */
  analyzeColumns(
    columns: ParsedColumn[],
    statistics: Map<string, ColumnStatistics>,
    existingIndexes: ExistingIndex[]
  ): ColumnAnalysis[] {
    const analyses: ColumnAnalysis[] = []
    const indexedColumns = this.buildIndexedColumnSet(existingIndexes)

    for (const column of columns) {
      const key = `${column.tableName}.${column.name}`
      const stats = statistics.get(key)
      const hasIndex = indexedColumns.has(key)

      const analysis = this.analyzeColumn(column, stats, hasIndex)
      analyses.push(analysis)
    }

    return analyses
  }

  /**
   * Identify index points for the diagram
   */
  identifyIndexPoints(
    parsedSQL: ParsedSQL,
    columnAnalyses: ColumnAnalysis[],
    existingIndexes: ExistingIndex[]
  ): IndexPointAnalysis[] {
    const points: IndexPointAnalysis[] = []
    const indexedColumns = this.buildIndexedColumnSet(existingIndexes)
    let pointNumber = 1

    // Map column analyses by columnId for quick lookup
    const analysisMap = new Map(columnAnalyses.map(a => [a.columnId, a]))

    for (const column of parsedSQL.columns) {
      const key = `${column.tableName}.${column.name}`
      const analysis = analysisMap.get(column.id)
      const hasIndex = indexedColumns.has(key)
      const existingIndex = this.findExistingIndex(column.tableName, column.name, existingIndexes)

      const pointType = this.determinePointType(column)
      const priority = this.determinePriority(column, analysis, hasIndex)

      points.push({
        pointNumber: pointNumber++,
        tableName: column.tableName,
        columnName: column.name,
        columnId: column.id,
        pointType,
        existingIndex,
        needsIndex: !hasIndex && analysis?.isIndexable === true,
        priority,
      })
    }

    return points
  }

  /**
   * Calculate optimal table access order
   */
  calculateAccessOrder(parsedSQL: ParsedSQL, columnAnalyses: ColumnAnalysis[]): string[] {
    const { tables, joins } = parsedSQL

    // Build adjacency list for join graph
    const joinGraph = new Map<string, Set<string>>()
    for (const table of tables) {
      joinGraph.set(table.id, new Set())
    }
    for (const join of joins) {
      joinGraph.get(join.sourceTableId)?.add(join.targetTableId)
      joinGraph.get(join.targetTableId)?.add(join.sourceTableId)
    }

    // Score each table as potential entry point
    const tableScores = new Map<string, number>()
    for (const table of tables) {
      let score = 0

      // Penalty for OUTER join targets (should be accessed later)
      if (table.isOuterJoinTarget) {
        score -= 100
      }

      // Bonus for tables with high-selectivity WHERE conditions
      const tableColumns = columnAnalyses.filter(a => a.tableName === table.name)
      for (const col of tableColumns) {
        if (col.selectivity <= 0.01) score += 50
        else if (col.selectivity <= 0.05) score += 30
        else if (col.selectivity <= 0.10) score += 10

        if (col.isIndexable) score += 20
      }

      // Bonus for join connectivity (hub tables)
      const connections = joinGraph.get(table.id)?.size || 0
      score += connections * 5

      tableScores.set(table.id, score)
    }

    // Sort tables by score (highest first)
    const sortedTables = [...tables].sort((a, b) => {
      const scoreA = tableScores.get(a.id) || 0
      const scoreB = tableScores.get(b.id) || 0
      return scoreB - scoreA
    })

    // BFS traversal from entry point
    const accessOrder: string[] = []
    const visited = new Set<string>()

    const bfs = (startId: string) => {
      const queue = [startId]
      while (queue.length > 0) {
        const currentId = queue.shift()!
        if (visited.has(currentId)) continue

        visited.add(currentId)
        const table = tables.find(t => t.id === currentId)
        if (table) {
          accessOrder.push(table.name)
        }

        // Add connected tables to queue
        const connected = joinGraph.get(currentId)
        if (connected) {
          for (const nextId of connected) {
            if (!visited.has(nextId)) {
              queue.push(nextId)
            }
          }
        }
      }
    }

    // Start from highest-scoring table
    if (sortedTables.length > 0) {
      bfs(sortedTables[0].id)
    }

    // Add any unvisited tables (disconnected components)
    for (const table of sortedTables) {
      if (!visited.has(table.id)) {
        bfs(table.id)
      }
    }

    return accessOrder
  }

  private analyzeColumn(
    column: ParsedColumn,
    stats: ColumnStatistics | undefined,
    hasIndex: boolean
  ): ColumnAnalysis {
    // Calculate selectivity
    let selectivity = 0.5 // Default assumption
    let selectivityGrade: SelectivityGrade = 'FAIR'
    let nullRatio: number | undefined

    if (stats) {
      const selectivityObj = Selectivity.fromStatistics(stats.numDistinct, stats.numRows)
      selectivity = selectivityObj.value
      selectivityGrade = selectivityObj.grade
      nullRatio = stats.numRows > 0 ? stats.numNulls / stats.numRows : undefined
    }

    // Calculate index candidate score
    const candidateScore = new IndexCandidateScore(
      column.condition.type,
      column.condition.operator,
      selectivity,
      nullRatio
    )

    // Determine if column is indexable
    const isIndexable = candidateScore.isCandidate && !hasIndex

    return {
      columnId: column.id,
      tableName: column.tableName,
      columnName: column.name,
      selectivity,
      selectivityGrade,
      nullRatio,
      isIndexable,
      score: candidateScore.score,
      reasons: candidateScore.reasons,
      excludeReasons: candidateScore.excludeReasons,
    }
  }

  private buildIndexedColumnSet(indexes: ExistingIndex[]): Set<string> {
    const indexed = new Set<string>()
    for (const index of indexes) {
      for (const col of index.columns) {
        indexed.add(`${index.tableName}.${col.columnName}`)
      }
    }
    return indexed
  }

  private findExistingIndex(
    tableName: string,
    columnName: string,
    indexes: ExistingIndex[]
  ): ExistingIndex | undefined {
    return indexes.find(
      idx => idx.tableName === tableName && idx.columns.some(c => c.columnName === columnName)
    )
  }

  private determinePointType(column: ParsedColumn): IndexPointType {
    switch (column.condition.type) {
      case 'JOIN':
        return 'JOIN'
      case 'WHERE':
        // Entry point if it's a high-selectivity condition
        return column.condition.operator === '=' ? 'ENTRY' : 'FILTER'
      case 'ORDER_BY':
        return 'ORDER'
      default:
        return 'FILTER'
    }
  }

  private determinePriority(
    column: ParsedColumn,
    analysis: ColumnAnalysis | undefined,
    hasIndex: boolean
  ): IndexPriority {
    if (hasIndex) return 'LOW'

    // Join columns are critical
    if (column.condition.type === 'JOIN') return 'CRITICAL'

    // High selectivity conditions are high priority
    if (analysis && analysis.selectivity <= 0.01) return 'HIGH'
    if (analysis && analysis.selectivity <= 0.05) return 'MEDIUM'

    // LIKE conditions are usually low priority
    if (column.condition.operator === 'LIKE') return 'LOW'

    return 'MEDIUM'
  }
}
