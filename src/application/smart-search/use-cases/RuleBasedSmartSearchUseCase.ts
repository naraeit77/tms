/**
 * Application Layer - RuleBasedSmartSearchUseCase
 * Use case for parsing natural language queries into search filters using rules
 *
 * This replaces the LLM-based SmartSearchUseCase with pure rule-based logic
 */

import { SearchQuery, ParsedIntent, type IQueryParser } from '@/domain/smart-search'
import type { RuleBasedSearchRequest, RuleBasedSearchResponse } from '../dto'

/**
 * Rule-Based Smart Search Use Case
 * Orchestrates the query parsing process using injected IQueryParser
 */
export class RuleBasedSmartSearchUseCase {
  constructor(private readonly queryParser: IQueryParser) {}

  /**
   * Executes the smart search use case
   * @param request - The search request containing the natural language query
   * @returns Response with parsed filters and interpretation
   */
  execute(request: RuleBasedSearchRequest): RuleBasedSearchResponse {
    const startTime = performance.now()

    try {
      // Step 1: Create SearchQuery value object
      const searchQuery = SearchQuery.create(request.query)

      // Step 2: Parse query using the injected parser
      let parsedIntent: ParsedIntent

      if (this.queryParser.canHandle(searchQuery)) {
        parsedIntent = this.queryParser.parse(searchQuery)
      } else {
        // Fallback to default intent if parser can't handle
        parsedIntent = ParsedIntent.createDefault(request.query)
      }

      // Step 3: Build response DTO
      const processingTimeMs = Math.round(performance.now() - startTime)

      return {
        originalQuery: request.query,
        interpretation: parsedIntent.interpretation,
        filters: parsedIntent.filters,
        suggestions: parsedIntent.suggestions,
        confidence: parsedIntent.confidence,
        matchedRules: parsedIntent.matchedRules,
        processingTimeMs,
      }
    } catch (error) {
      // Handle empty or invalid query
      const processingTimeMs = Math.round(performance.now() - startTime)

      return {
        originalQuery: request.query,
        interpretation: '검색어를 해석할 수 없습니다.',
        filters: {},
        suggestions: [
          '예시: "최근 1시간 느린 쿼리"',
          '예시: "버퍼 많이 쓰는 SELECT"',
          '예시: "오늘 실행된 쿼리 중 가장 느린 것"',
        ],
        confidence: 'low',
        matchedRules: [],
        processingTimeMs,
      }
    }
  }

  /**
   * Converts filters to URL search params
   */
  static filtersToURLParams(filters: RuleBasedSearchResponse['filters']): URLSearchParams {
    const params = new URLSearchParams()

    if (filters.sqlPattern) {
      params.set('pattern', filters.sqlPattern)
    }
    if (filters.timeRange) {
      params.set('time_range', filters.timeRange)
    }
    if (filters.sortBy) {
      params.set('order_by', filters.sortBy)
    }
    if (filters.sortOrder) {
      params.set('order', filters.sortOrder)
    }
    if (filters.limit) {
      params.set('limit', String(filters.limit))
    }
    if (filters.minElapsedTime) {
      params.set('min_elapsed_time', String(filters.minElapsedTime))
    }
    if (filters.maxElapsedTime) {
      params.set('max_elapsed_time', String(filters.maxElapsedTime))
    }
    if (filters.minBufferGets) {
      params.set('min_buffer_gets', String(filters.minBufferGets))
    }
    if (filters.maxBufferGets) {
      params.set('max_buffer_gets', String(filters.maxBufferGets))
    }
    if (filters.minExecutions) {
      params.set('min_executions', String(filters.minExecutions))
    }
    if (filters.schema) {
      params.set('schema', filters.schema)
    }

    // Mark as AI search for tracking
    params.set('ai_search', 'true')

    return params
  }
}
