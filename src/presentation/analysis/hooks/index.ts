/**
 * Presentation Layer - Analysis Hooks
 * Export all analysis-related React hooks
 */

// LLM-based analysis (SQL analysis, execution plan, etc.)
export { useLLMHealth, type LLMHealthData } from './useLLMHealth'
export { useSQLAnalysis, useSQLAnalysisStream } from './useSQLAnalysis'
export { useExecutionPlanAnalysis, useExecutionPlanAnalysisStream } from './useExecutionPlanAnalysis'
export { usePatternDetection } from './usePatternDetection'

// Smart Search - Rule-based implementation (no LLM dependency)
// Provides instant, synchronous natural language to SQL filter conversion
export {
  useSmartSearch,
  useRuleBasedSearch,
  searchResultToURLParams,
  useSearchToURL,
} from './useSmartSearch'

// Re-export types
export type {
  SmartSearchResult,
  RuleBasedSearchRequest,
  RuleBasedSearchResponse,
} from './useSmartSearch'
