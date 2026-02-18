/**
 * Presentation Layer - Smart Search Hook
 * React hook for natural language SQL search
 *
 * Implementation: Rule-based parsing (no LLM dependency)
 *
 * Benefits:
 * - Instant results (synchronous, no API calls)
 * - No LLM costs or latency
 * - Predictable, testable behavior
 * - Easy to extend with new rules
 *
 * @see @/infrastructure/smart-search/rules/ for parsing rules
 * @see @/application/smart-search/ for use case
 */

'use client'

// Re-export rule-based search as the default smart search
export {
  useRuleBasedSearch as useSmartSearch,
  searchResultToURLParams,
  useSearchToURL,
} from './useRuleBasedSearch'

// Also export the original hook for direct usage
export { useRuleBasedSearch } from './useRuleBasedSearch'

// Export types for consumers
export type { RuleBasedSearchResponse as SmartSearchResult } from '@/application/smart-search'
export type { RuleBasedSearchRequest, RuleBasedSearchResponse } from '@/application/smart-search'
