/**
 * Application Layer - Query Artifacts DTOs
 * Data Transfer Objects for API communication
 */

import type {
  IndexCreationDiagram,
  IndexAnalysis,
  TuningRecommendation,
  ReportSummary,
  QueryArtifactReport,
} from '@/domain/query-artifacts'

/**
 * Analyze Query Request DTO
 */
export interface AnalyzeQueryRequest {
  sql: string
  connectionId: string
  owner?: string
  options?: AnalyzeQueryOptions
}

/**
 * Analysis Options
 */
export interface AnalyzeQueryOptions {
  includeStatistics?: boolean
  includeRecommendations?: boolean
  includeHints?: boolean
  includeExecutionPlan?: boolean
  targetSchema?: string
}

/**
 * Analyze Query Response DTO
 */
export interface AnalyzeQueryResponse {
  success: boolean
  data?: QueryArtifactOutput
  error?: QueryArtifactError
  metadata: AnalysisMetadata
}

/**
 * Query Artifact Output
 */
export interface QueryArtifactOutput {
  diagram: IndexCreationDiagram
  analysis: IndexAnalysis
  recommendations: TuningRecommendation[]
  summary: ReportSummary
  hints?: string
}

/**
 * Error Information
 */
export interface QueryArtifactError {
  code: QueryArtifactErrorCode
  message: string
  details?: Record<string, unknown>
}

/**
 * Error Codes
 */
export type QueryArtifactErrorCode =
  | 'INVALID_SQL'
  | 'PARSE_ERROR'
  | 'CONNECTION_ERROR'
  | 'METADATA_ERROR'
  | 'TIMEOUT'
  | 'UNSUPPORTED_SYNTAX'
  | 'UNAUTHORIZED'
  | 'INTERNAL_ERROR'

/**
 * Analysis Metadata
 */
export interface AnalysisMetadata {
  analysisId: string
  executionTimeMs: number
  timestamp: string
  parserVersion: string
}

/**
 * Save Analysis Request DTO
 */
export interface SaveAnalysisRequest {
  report: QueryArtifactReport
  userId: string
  tags?: string[]
}

/**
 * Analysis History Item DTO
 */
export interface AnalysisHistoryItem {
  id: string
  sql: string
  summary: ReportSummary
  createdAt: Date
  tags?: string[]
}

/**
 * Index Recommendation Summary DTO
 * Simplified view for UI cards
 */
export interface IndexRecommendationSummary {
  tableName: string
  columnName: string
  type: 'CREATE' | 'DROP' | 'MODIFY'
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  ddl: string
  reason: string
}

/**
 * Access Order Step DTO
 * For visualizing table access sequence
 */
export interface AccessOrderStep {
  step: number
  tableName: string
  tableAlias: string
  accessMethod: 'INDEX_SCAN' | 'TABLE_SCAN' | 'INDEX_RANGE_SCAN' | 'HASH_JOIN'
  indexUsed?: string
  joinColumn?: string
}

/**
 * Diagram Layout Options
 */
export interface DiagramLayoutOptions {
  direction: 'LR' | 'TB' | 'RL' | 'BT'
  nodeSpacing: number
  rankSpacing: number
  fitView: boolean
}

/**
 * Export Report Request DTO
 */
export interface ExportReportRequest {
  reportId: string
  format: 'markdown' | 'pdf' | 'json'
  includeRecommendations: boolean
  includeDiagram: boolean
}
