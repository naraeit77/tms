/**
 * Application Layer - DTOs
 * Data Transfer Objects for use case inputs/outputs
 */

import type {
  AnalysisType,
  SQLMetrics,
  Issue,
  Recommendation,
  IndexSuggestion,
  RewriteSuggestion,
  PerformanceGrade,
  Bottleneck,
  DetectedPattern,
  SearchFilters,
} from '@/domain/llm-analysis'

// Common
export type SupportedLanguage = 'ko' | 'en'

// ===================
// SQL Analysis DTOs
// ===================

export interface AnalyzeSQLRequest {
  sqlText: string
  sqlId?: string
  executionPlan?: string
  metrics?: SQLMetrics
  context?: AnalysisType
  language?: SupportedLanguage
  saveHistory?: boolean
}

export interface AnalyzeSQLResponse {
  id: string
  sqlId: string
  summary: string
  issues: Issue[]
  recommendations: Recommendation[]
  indexSuggestions: IndexSuggestion[]
  rewriteSuggestions: RewriteSuggestion[]
  performanceScore: number
  performanceGrade: PerformanceGrade
  modelUsed: string
  processingTimeMs: number
  analyzedAt: string
}

// ===================
// Execution Plan DTOs
// ===================

export interface AnalyzeExecutionPlanRequest {
  planText: string
  sqlId?: string
  sqlText?: string
  language?: SupportedLanguage
  saveHistory?: boolean
}

export interface AnalyzeExecutionPlanResponse {
  id: string
  sqlId?: string
  summary: string
  bottlenecks: Bottleneck[]
  recommendations: Recommendation[]
  estimatedCost: number
  modelUsed: string
  processingTimeMs: number
  analyzedAt: string
}

// ===================
// Pattern Detection DTOs
// ===================

export interface DetectPatternsRequest {
  sqlText: string
  sqlId?: string
  includeAntiPatterns?: boolean
  includeBestPractices?: boolean
  language?: SupportedLanguage
  saveHistory?: boolean
}

export interface DetectPatternsResponse {
  id: string
  sqlId?: string
  patterns: DetectedPattern[]
  overallRisk: 'low' | 'medium' | 'high' | 'critical'
  summary: string
  modelUsed: string
  processingTimeMs: number
  analyzedAt: string
}

// ===================
// SQL Optimization DTOs
// ===================

export interface GenerateOptimizationRequest {
  sqlText: string
  sqlId?: string
  executionPlan?: string
  metrics?: SQLMetrics
  targetImprovement?: 'performance' | 'readability' | 'both'
  language?: SupportedLanguage
}

export interface GenerateOptimizationResponse {
  id: string
  originalSql: string
  optimizedSql: string
  changes: OptimizationChange[]
  expectedImprovement: string
  explanation: string
  modelUsed: string
  processingTimeMs: number
}

export interface OptimizationChange {
  type: 'rewrite' | 'hint' | 'index' | 'restructure'
  description: string
  before: string
  after: string
  impact: string
}

// ===================
// Performance Comparison DTOs
// ===================

export interface ComparePerformanceRequest {
  sqlA: {
    sqlId: string
    sqlText: string
    metrics: SQLMetrics
    planHashValue?: number
  }
  sqlB: {
    sqlId: string
    sqlText: string
    metrics: SQLMetrics
    planHashValue?: number
  }
  language?: SupportedLanguage
  saveHistory?: boolean
}

export interface ComparePerformanceResponse {
  id: string
  winner: 'A' | 'B' | 'tie'
  summary: string
  metricsComparison: MetricComparison[]
  keyDifferences: string[]
  recommendations: string[]
  modelUsed: string
  processingTimeMs: number
  analyzedAt: string
}

export interface MetricComparison {
  metric: string
  valueA: number
  valueB: number
  winner: 'A' | 'B' | 'tie'
  difference: number
  differencePercent: number
}

// ===================
// Smart Search DTOs
// ===================

export interface SmartSearchRequest {
  query: string
  language?: SupportedLanguage
}

export interface SmartSearchResponse {
  originalQuery: string
  interpretation: string
  filters: SearchFilters
  suggestions?: string[]
  modelUsed: string
  processingTimeMs: number
}

// ===================
// Comprehensive Analysis DTOs
// ===================

export interface ComprehensiveAnalysisRequest {
  sqlText: string
  sqlId?: string
  executionPlan?: string
  metrics?: SQLMetrics
  language?: SupportedLanguage
  includePatterns?: boolean
  includeOptimization?: boolean
}

export interface ComprehensiveAnalysisResponse {
  sqlAnalysis: AnalyzeSQLResponse
  planAnalysis?: AnalyzeExecutionPlanResponse
  patternDetection?: DetectPatternsResponse
  optimization?: GenerateOptimizationResponse
  overallScore: number
  overallGrade: PerformanceGrade
  prioritizedActions: string[]
  processingTimeMs: number
}
