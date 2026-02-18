/**
 * Domain Layer - ParsedIntent Value Object
 * Represents the parsed intention from user's search query
 */

import type { SearchFilters } from '../../llm-analysis/entities'

/**
 * Intent Type - What the user wants to find
 */
export type IntentType =
  | 'find_slow_queries'       // 느린 쿼리 찾기
  | 'find_resource_heavy'     // 리소스 많이 쓰는 쿼리
  | 'find_frequent'           // 자주 실행되는 쿼리
  | 'find_by_pattern'         // 패턴으로 찾기
  | 'find_by_schema'          // 스키마별 찾기
  | 'find_recent'             // 최근 쿼리 찾기
  | 'general_search'          // 일반 검색

/**
 * Confidence Level for parsed results
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low'

/**
 * Matched Rule information
 */
export interface MatchedRule {
  ruleName: string
  matchedKeywords: string[]
  confidence: number
}

/**
 * ParsedIntent Value Object
 * Immutable object representing the parsed search intent
 */
export class ParsedIntent {
  private constructor(
    public readonly intentType: IntentType,
    public readonly filters: SearchFilters,
    public readonly interpretation: string,
    public readonly suggestions: string[],
    public readonly confidence: ConfidenceLevel,
    public readonly matchedRules: MatchedRule[]
  ) {}

  /**
   * Creates a new ParsedIntent
   */
  static create(params: {
    intentType: IntentType
    filters: SearchFilters
    interpretation: string
    suggestions?: string[]
    confidence?: ConfidenceLevel
    matchedRules?: MatchedRule[]
  }): ParsedIntent {
    return new ParsedIntent(
      params.intentType,
      Object.freeze({ ...params.filters }),
      params.interpretation,
      params.suggestions ?? [],
      params.confidence ?? 'medium',
      params.matchedRules ?? []
    )
  }

  /**
   * Creates a default intent for unparseable queries
   */
  static createDefault(query: string): ParsedIntent {
    return new ParsedIntent(
      'general_search',
      {},
      `검색어: "${query}"`,
      ['시간 범위를 지정해보세요 (예: 최근 1시간)', '성능 조건을 추가해보세요 (예: 느린 쿼리)'],
      'low',
      []
    )
  }

  /**
   * Checks if the intent has high confidence
   */
  isHighConfidence(): boolean {
    return this.confidence === 'high'
  }

  /**
   * Checks if any filters were extracted
   */
  hasFilters(): boolean {
    return Object.keys(this.filters).length > 0
  }

  /**
   * Gets the number of matched rules
   */
  get ruleCount(): number {
    return this.matchedRules.length
  }

  /**
   * Merges with another ParsedIntent, combining filters
   */
  mergeWith(other: ParsedIntent): ParsedIntent {
    const mergedFilters: SearchFilters = {
      ...this.filters,
      ...other.filters,
    }

    const mergedRules = [...this.matchedRules, ...other.matchedRules]

    // Calculate combined confidence
    const avgConfidence = this.calculateAverageConfidence(mergedRules)

    return new ParsedIntent(
      this.determineIntent(mergedFilters),
      Object.freeze(mergedFilters),
      this.combineInterpretations(other.interpretation),
      [...new Set([...this.suggestions, ...other.suggestions])],
      avgConfidence,
      mergedRules
    )
  }

  private calculateAverageConfidence(rules: MatchedRule[]): ConfidenceLevel {
    if (rules.length === 0) return 'low'
    const avgScore = rules.reduce((sum, r) => sum + r.confidence, 0) / rules.length
    if (avgScore >= 0.8) return 'high'
    if (avgScore >= 0.5) return 'medium'
    return 'low'
  }

  private determineIntent(filters: SearchFilters): IntentType {
    if (filters.sortBy === 'elapsed_time' && filters.sortOrder === 'desc') {
      return 'find_slow_queries'
    }
    if (filters.sortBy === 'buffer_gets' || filters.sortBy === 'cpu_time') {
      return 'find_resource_heavy'
    }
    if (filters.sortBy === 'executions') {
      return 'find_frequent'
    }
    if (filters.sqlPattern) {
      return 'find_by_pattern'
    }
    if (filters.schema) {
      return 'find_by_schema'
    }
    if (filters.timeRange) {
      return 'find_recent'
    }
    return 'general_search'
  }

  private combineInterpretations(other: string): string {
    if (!other || other === this.interpretation) {
      return this.interpretation
    }
    return `${this.interpretation}. ${other}`
  }

  /**
   * Converts to plain object for serialization
   */
  toJSON(): object {
    return {
      intentType: this.intentType,
      filters: this.filters,
      interpretation: this.interpretation,
      suggestions: this.suggestions,
      confidence: this.confidence,
      matchedRules: this.matchedRules,
    }
  }
}
