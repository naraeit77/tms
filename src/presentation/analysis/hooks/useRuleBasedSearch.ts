/**
 * Presentation Layer - Rule-Based Search Hook
 * React hook for natural language SQL search using rules (no LLM)
 */

'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  RuleBasedSmartSearchUseCase,
  type RuleBasedSearchRequest,
  type RuleBasedSearchResponse,
} from '@/application/smart-search'
import { QueryParserService } from '@/infrastructure/smart-search'

/**
 * Hook result type
 */
interface UseRuleBasedSearchResult {
  search: (query: string) => RuleBasedSearchResponse
  result: RuleBasedSearchResponse | null
  isLoading: boolean
  error: Error | null
  reset: () => void
}

/**
 * Creates the use case with dependency injection
 */
function createSearchUseCase(): RuleBasedSmartSearchUseCase {
  const parserService = new QueryParserService()
  return new RuleBasedSmartSearchUseCase(parserService)
}

/**
 * Rule-based smart search hook
 * Synchronous parsing - no API calls needed
 */
export function useRuleBasedSearch(): UseRuleBasedSearchResult {
  const [result, setResult] = useState<RuleBasedSearchResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Memoize the use case to avoid recreating on every render
  const useCase = useMemo(() => createSearchUseCase(), [])

  const search = useCallback((query: string): RuleBasedSearchResponse => {
    setIsLoading(true)
    setError(null)

    try {
      const request: RuleBasedSearchRequest = { query }
      const response = useCase.execute(request)
      setResult(response)
      return response
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Search failed')
      setError(error)
      // Return default response on error
      return {
        originalQuery: query,
        interpretation: '검색어를 해석할 수 없습니다.',
        filters: {},
        suggestions: ['예시: "최근 1시간 느린 쿼리"'],
        confidence: 'low',
        matchedRules: [],
        processingTimeMs: 0,
      }
    } finally {
      setIsLoading(false)
    }
  }, [useCase])

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return {
    search,
    result,
    isLoading,
    error,
    reset,
  }
}

/**
 * Utility function to convert search result to URL params
 */
export function searchResultToURLParams(result: RuleBasedSearchResponse): URLSearchParams {
  return RuleBasedSmartSearchUseCase.filtersToURLParams(result.filters)
}

/**
 * Hook for directly getting URL params from a query
 */
export function useSearchToURL() {
  const { search } = useRuleBasedSearch()

  const getURLParams = useCallback((query: string): URLSearchParams => {
    const result = search(query)
    return searchResultToURLParams(result)
  }, [search])

  return { getURLParams }
}
