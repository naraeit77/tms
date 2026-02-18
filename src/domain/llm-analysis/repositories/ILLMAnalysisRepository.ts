/**
 * Domain Layer - Repository Interface
 * Defines the contract for LLM analysis persistence
 */

import type {
  SQLAnalysis,
  ExecutionPlanAnalysis,
  PatternDetectionResult,
  PerformanceComparison,
} from '../entities'

/**
 * LLM Analysis Repository Interface
 * Following Dependency Inversion Principle - Domain defines interface, Infrastructure implements
 */
export interface ILLMAnalysisRepository {
  // SQL Analysis
  saveSQLAnalysis(analysis: SQLAnalysis): Promise<void>
  getSQLAnalysis(id: string): Promise<SQLAnalysis | null>
  getSQLAnalysisBySqlId(sqlId: string): Promise<SQLAnalysis[]>
  getRecentSQLAnalyses(limit: number): Promise<SQLAnalysis[]>

  // Execution Plan Analysis
  saveExecutionPlanAnalysis(analysis: ExecutionPlanAnalysis): Promise<void>
  getExecutionPlanAnalysis(id: string): Promise<ExecutionPlanAnalysis | null>
  getExecutionPlanAnalysisBySqlId(sqlId: string): Promise<ExecutionPlanAnalysis[]>

  // Pattern Detection
  savePatternDetectionResult(result: PatternDetectionResult): Promise<void>
  getPatternDetectionResult(id: string): Promise<PatternDetectionResult | null>
  getPatternDetectionResultBySqlId(sqlId: string): Promise<PatternDetectionResult[]>

  // Performance Comparison
  savePerformanceComparison(comparison: PerformanceComparison): Promise<void>
  getPerformanceComparison(id: string): Promise<PerformanceComparison | null>
  getRecentComparisons(limit: number): Promise<PerformanceComparison[]>

  // Cleanup
  deleteAnalysis(id: string): Promise<void>
  deleteOldAnalyses(olderThanDays: number): Promise<number>
}
