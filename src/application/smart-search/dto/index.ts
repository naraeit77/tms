/**
 * Application Layer - Smart Search DTOs
 * Data Transfer Objects for rule-based smart search use case
 */

import type { SearchFilters } from '@/domain/llm-analysis'
import type { ConfidenceLevel, MatchedRule } from '@/domain/smart-search'

/**
 * Request DTO for rule-based smart search
 */
export interface RuleBasedSearchRequest {
  query: string
}

/**
 * Response DTO for rule-based smart search
 */
export interface RuleBasedSearchResponse {
  originalQuery: string
  interpretation: string
  filters: SearchFilters
  suggestions: string[]
  confidence: ConfidenceLevel
  matchedRules: MatchedRule[]
  processingTimeMs: number
}

/**
 * URL params generated from search filters
 */
export interface SearchURLParams {
  pattern?: string
  time_range?: string
  order_by?: string
  order?: string
  limit?: string
  min_elapsed_time?: string
  max_elapsed_time?: string
  min_buffer_gets?: string
  max_buffer_gets?: string
  min_executions?: string
  schema?: string
  ai_search?: string
}
