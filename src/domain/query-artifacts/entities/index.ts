/**
 * Domain Layer - Query Artifacts Entities
 * Core business entities for SQL Index Creation Diagram (인덱스 생성도)
 * Based on: 이병국, 「개발자를 위한 인덱스 생성과 SQL 작성 노하우」, 2018
 */

// ============================================================================
// SQL Parsing Types
// ============================================================================

/**
 * Parsed Table from SQL
 * Represents a table extracted from FROM/JOIN clauses
 */
export interface ParsedTable {
  id: string
  alias: string
  name: string
  schema?: string
  isOuterJoinTarget: boolean
}

/**
 * Column Condition Types
 */
export type ConditionType = 'WHERE' | 'JOIN' | 'ORDER_BY' | 'GROUP_BY' | 'NONE'

/**
 * SQL Operators
 */
export type SqlOperator =
  | '='
  | 'LIKE'
  | 'BETWEEN'
  | 'IN'
  | '>'
  | '<'
  | '>='
  | '<='
  | 'IS NULL'
  | 'IS NOT NULL'
  | 'NOT IN'
  | 'EXISTS'
  | 'NOT EXISTS'

/**
 * Column Condition Details
 */
export interface ColumnCondition {
  type: ConditionType
  operator: SqlOperator
  isBindVariable: boolean
  literalValue?: string
  joinTargetTableId?: string
  joinTargetColumnId?: string
}

/**
 * Parsed Column from SQL
 */
export interface ParsedColumn {
  id: string
  tableId: string
  tableName: string
  name: string
  condition: ColumnCondition
  dataType?: string
}

/**
 * Join Types
 */
export type JoinType = 'INNER' | 'LEFT_OUTER' | 'RIGHT_OUTER' | 'FULL_OUTER' | 'CROSS'

/**
 * Parsed Join Relationship
 */
export interface ParsedJoin {
  id: string
  sourceTableId: string
  sourceColumnId: string
  targetTableId: string
  targetColumnId: string
  joinType: JoinType
}

/**
 * Complete SQL Parsing Result
 */
export interface ParsedSQL {
  tables: ParsedTable[]
  columns: ParsedColumn[]
  joins: ParsedJoin[]
  orderByColumns: string[]
  groupByColumns: string[]
  originalSql: string
  normalizedSql: string
}

// ============================================================================
// Diagram Types (Visual Representation)
// ============================================================================

/**
 * Diagram Node Type (Table Visual)
 */
export type DiagramNodeType = 'INNER' | 'OUTER'

/**
 * Diagram Edge Style
 */
export type DiagramLineStyle = 'SOLID' | 'DASHED'

/**
 * Column in Diagram Node
 */
export interface DiagramColumn {
  id: string
  columnId: string
  name: string
  hasIndex: boolean
  isIndexCandidate: boolean
  candidateReason?: string
  excludeReason?: string
  conditionType: ConditionType
  position: number
  selectivityGrade?: SelectivityGrade
}

/**
 * Diagram Node (Table Circle)
 * Represents a table as a circle in the Index Creation Diagram
 */
export interface DiagramNode {
  id: string
  tableId: string
  tableName: string
  alias: string
  type: DiagramNodeType
  position: { x: number; y: number }
  columns: DiagramColumn[]
}

/**
 * Diagram Edge (Join Line)
 * Represents a join relationship as a line between tables
 */
export interface DiagramEdge {
  id: string
  sourceNodeId: string
  sourceColumnPosition: number
  targetNodeId: string
  targetColumnPosition: number
  joinType: JoinType
  lineStyle: DiagramLineStyle
}

/**
 * Access Path Step
 * Represents the order in which tables should be accessed
 */
export interface AccessPath {
  order: number
  nodeId: string
  tableName: string
  entryColumnId?: string
  entryColumnName?: string
  joinColumnId?: string
  joinColumnName?: string
}

/**
 * Index Creation Diagram (인덱스 생성도)
 * The complete visual representation of query optimization
 */
export interface IndexCreationDiagram {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  recommendedAccessPath: AccessPath[]
  alternativeAccessPaths?: AccessPath[][]
}

// ============================================================================
// Index Analysis Types
// ============================================================================

/**
 * Selectivity Grade
 * Based on column distribution (분포도)
 */
export type SelectivityGrade = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'VERY_POOR'

/**
 * Index Column Information
 */
export interface IndexColumn {
  columnName: string
  position: number
  descOrder: boolean
}

/**
 * Index Type
 */
export type IndexType = 'NORMAL' | 'BITMAP' | 'FUNCTION_BASED' | 'REVERSE' | 'UNIQUE'

/**
 * Index Status
 */
export type IndexStatus = 'VALID' | 'INVALID' | 'UNUSABLE'

/**
 * Existing Index Information (from Oracle)
 */
export interface ExistingIndex {
  indexName: string
  tableName: string
  columns: IndexColumn[]
  isUnique: boolean
  indexType: IndexType
  status: IndexStatus
  lastAnalyzed?: Date
  distinctKeys?: number
  clusteringFactor?: number
}

/**
 * Column Statistics (from Oracle)
 */
export interface ColumnStatistics {
  columnName: string
  tableName: string
  numDistinct: number
  numRows: number
  numNulls: number
  density: number
  histogram?: string
  selectivity: number
  selectivityGrade: SelectivityGrade
}

/**
 * Column Analysis Result
 */
export interface ColumnAnalysis {
  columnId: string
  tableName: string
  columnName: string
  selectivity: number
  selectivityGrade: SelectivityGrade
  cardinality?: number
  nullRatio?: number
  isIndexable: boolean
  score: number
  reasons: string[]
  excludeReasons: string[]
}

/**
 * Index Point Type
 */
export type IndexPointType = 'ENTRY' | 'JOIN' | 'FILTER' | 'ORDER'

/**
 * Index Point Priority
 */
export type IndexPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

/**
 * Index Point Analysis
 * Represents a point in the diagram where an index is needed
 */
export interface IndexPointAnalysis {
  pointNumber: number
  tableName: string
  columnName: string
  columnId: string
  pointType: IndexPointType
  existingIndex?: ExistingIndex
  needsIndex: boolean
  priority: IndexPriority
}

/**
 * Complete Index Analysis Result
 */
export interface IndexAnalysis {
  parsedSQL: ParsedSQL
  columnAnalyses: ColumnAnalysis[]
  indexPoints: IndexPointAnalysis[]
  optimalAccessOrder: string[]
  estimatedCostReduction?: number
}

// ============================================================================
// Tuning Recommendation Types
// ============================================================================

/**
 * Recommendation Type
 */
export type RecommendationType =
  | 'CREATE_INDEX'
  | 'DROP_INDEX'
  | 'MODIFY_INDEX'
  | 'ADD_HINT'
  | 'REWRITE_SQL'
  | 'GATHER_STATS'

/**
 * Tuning Recommendation
 */
export interface TuningRecommendation {
  id: string
  type: RecommendationType
  priority: IndexPriority
  title: string
  description: string
  rationale: string
  ddl?: string
  expectedImprovement?: string
  risk?: string
  relatedPoints: number[]
}

// ============================================================================
// Report Types
// ============================================================================

/**
 * Report Summary
 */
export interface ReportSummary {
  tableCount: number
  joinCount: number
  existingIndexCount: number
  missingIndexCount: number
  criticalIssueCount: number
  overallHealthScore: number
}

/**
 * Complete Query Artifact Report
 */
export interface QueryArtifactReport {
  id: string
  summary: ReportSummary
  diagram: IndexCreationDiagram
  analysis: IndexAnalysis
  recommendations: TuningRecommendation[]
  generatedAt: Date
  executionTimeMs: number
}
