/**
 * Domain Layer - Entities
 * Core business entities for LLM Analysis
 */

// Analysis Types
export type AnalysisType =
  | 'tuning'       // SQL 튜닝 분석
  | 'explain'      // 실행계획 해석
  | 'index'        // 인덱스 제안
  | 'rewrite'      // SQL 리라이트
  | 'pattern'      // 패턴 탐지
  | 'comparison'   // 성능 비교
  | 'search'       // 스마트 검색

// Issue Severity
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

// Performance Grade
export type PerformanceGrade = 'A' | 'B' | 'C' | 'D' | 'F'

/**
 * Issue Entity
 * Represents a performance issue found in SQL
 */
export interface Issue {
  id: string
  type: string
  severity: IssueSeverity
  title: string
  description: string
  location?: string
  suggestion?: string
}

/**
 * Recommendation Entity
 * Represents an optimization recommendation
 */
export interface Recommendation {
  id: string
  type: 'index' | 'rewrite' | 'hint' | 'statistics' | 'partition' | 'other'
  priority: number
  title: string
  description: string
  implementation?: string
  expectedImprovement?: string
  risk?: 'low' | 'medium' | 'high'
}

/**
 * Index Suggestion Entity
 */
export interface IndexSuggestion {
  table: string
  columns: string[]
  type: 'btree' | 'bitmap' | 'function' | 'composite'
  ddl: string
  reason: string
  expectedImprovement: string
}

/**
 * Rewrite Suggestion Entity
 */
export interface RewriteSuggestion {
  original: string
  optimized: string
  explanation: string
  performanceGain: string
}

/**
 * SQL Analysis Entity
 * Main entity for SQL analysis results
 */
export interface SQLAnalysis {
  id: string
  sqlId: string
  sqlText: string
  analysisType: AnalysisType
  summary: string
  issues: Issue[]
  recommendations: Recommendation[]
  indexSuggestions?: IndexSuggestion[]
  rewriteSuggestions?: RewriteSuggestion[]
  performanceScore: number
  performanceGrade: PerformanceGrade
  analyzedAt: Date
  modelUsed: string
  processingTimeMs: number
}

/**
 * Execution Plan Analysis Entity
 */
export interface ExecutionPlanAnalysis {
  id: string
  sqlId: string
  planHashValue: number
  planText: string
  summary: string
  bottlenecks: Bottleneck[]
  recommendations: Recommendation[]
  estimatedCost: number
  actualCost?: number
  analyzedAt: Date
}

/**
 * Bottleneck Entity
 */
export interface Bottleneck {
  operation: string
  objectName?: string
  cost: number
  cardinality: number
  description: string
  suggestion: string
}

/**
 * Pattern Detection Result Entity
 */
export interface PatternDetectionResult {
  id: string
  sqlId: string
  patterns: DetectedPattern[]
  overallRisk: 'low' | 'medium' | 'high' | 'critical'
  analyzedAt: Date
}

/**
 * Detected Pattern Entity
 */
export interface DetectedPattern {
  name: string
  category: 'anti-pattern' | 'best-practice' | 'optimization-opportunity'
  severity: IssueSeverity
  description: string
  location?: string
  fix?: string
}

/**
 * Performance Comparison Entity
 */
export interface PerformanceComparison {
  id: string
  sqlIdA: string
  sqlIdB: string
  metricsA: SQLMetrics
  metricsB: SQLMetrics
  analysis: string
  winner: 'A' | 'B' | 'tie'
  improvements: string[]
  analyzedAt: Date
}

/**
 * SQL Metrics Value Object
 */
export interface SQLMetrics {
  elapsedTimeMs: number
  cpuTimeMs: number
  bufferGets: number
  diskReads: number
  executions: number
  rowsProcessed?: number
  parseCalls?: number
}

/**
 * Smart Search Result Entity
 */
export interface SmartSearchResult {
  query: string
  interpretedFilters: SearchFilters
  explanation: string
  processedAt: Date
}

/**
 * Search Filters Value Object
 */
export interface SearchFilters {
  timeRange?: '1h' | '6h' | '12h' | '24h' | '7d' | '30d' | '90d' | 'all' | string
  minElapsedTime?: number
  maxElapsedTime?: number
  minBufferGets?: number
  maxBufferGets?: number
  minDiskReads?: number
  maxDiskReads?: number
  minExecutions?: number
  maxExecutions?: number
  minCpuTime?: number
  maxCpuTime?: number
  sqlPattern?: string
  schema?: string
  table?: string
  sortBy?: 'elapsed_time' | 'cpu_time' | 'buffer_gets' | 'disk_reads' | 'executions' | 'rows_processed' | string
  sortOrder?: 'asc' | 'desc'
  limit?: number
}
