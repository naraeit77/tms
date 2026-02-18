/**
 * Infrastructure Layer - QueryParserService
 * Implementation of IQueryParser using rule-based parsing
 */

import {
  SearchQuery,
  ParsedIntent,
  type IQueryParser,
  type IParsingRule,
  type MatchedRule,
  type IntentType,
} from '@/domain/smart-search'
import type { SearchFilters } from '@/domain/llm-analysis'
import { RuleRegistry } from './RuleRegistry'
import {
  TimeRangeRule,
  PerformanceMetricRule,
  SQLTypeRule,
  LimitRule,
  SchemaRule,
  ThresholdRule,
} from '../rules'

/**
 * Query Parser Service
 * Implements rule-based natural language query parsing
 */
export class QueryParserService implements IQueryParser {
  private registry: RuleRegistry

  constructor(registry?: RuleRegistry) {
    this.registry = registry || RuleRegistry.getInstance()
    this.initializeDefaultRules()
  }

  /**
   * Initializes the default set of parsing rules
   */
  private initializeDefaultRules(): void {
    this.registry.registerAll([
      new LimitRule(),           // Priority 90
      new TimeRangeRule(),       // Priority 80
      new PerformanceMetricRule(), // Priority 70
      new SQLTypeRule(),         // Priority 60
      new SchemaRule(),          // Priority 50
      new ThresholdRule(),       // Priority 40
    ])
  }

  /**
   * Checks if the parser can handle this query
   */
  canHandle(query: SearchQuery): boolean {
    return this.registry.getMatchingRules(query).length > 0
  }

  /**
   * Parses a SearchQuery into a ParsedIntent
   */
  parse(query: SearchQuery): ParsedIntent {
    const matchingRules = this.registry.getMatchingRules(query)

    if (matchingRules.length === 0) {
      return ParsedIntent.createDefault(query.rawInput)
    }

    // Apply all matching rules and merge results
    const mergedFilters: SearchFilters = {}
    const allMatchedRules: MatchedRule[] = []
    const interpretations: string[] = []

    for (const rule of matchingRules) {
      const result = rule.apply(query)

      // Merge filters
      if (result.filters) {
        Object.assign(mergedFilters, result.filters)
      }

      // Collect matched rules
      if (result.matchedRules) {
        allMatchedRules.push(...result.matchedRules)
      }

      // Collect interpretations
      if (result.interpretation) {
        interpretations.push(result.interpretation)
      }
    }

    // Build final interpretation
    const interpretation = this.buildInterpretation(interpretations, query.rawInput)

    // Generate suggestions
    const suggestions = this.generateSuggestions(mergedFilters, query)

    // Calculate confidence
    const confidence = this.calculateConfidence(allMatchedRules)

    // Determine intent type
    const intentType = this.determineIntentType(mergedFilters)

    return ParsedIntent.create({
      intentType,
      filters: mergedFilters,
      interpretation,
      suggestions,
      confidence,
      matchedRules: allMatchedRules,
    })
  }

  /**
   * Builds the final interpretation string
   */
  private buildInterpretation(interpretations: string[], originalQuery: string): string {
    if (interpretations.length === 0) {
      return `검색어: "${originalQuery}"`
    }

    // Remove duplicates and join
    const unique = [...new Set(interpretations)]
    return unique.join(', ') + ' 검색'
  }

  /**
   * Generates search suggestions based on filters
   */
  private generateSuggestions(filters: SearchFilters, query: SearchQuery): string[] {
    const suggestions: string[] = []

    // Suggest adding time range if not present
    if (!filters.timeRange) {
      suggestions.push('시간 범위 추가: "최근 1시간", "오늘", "이번 주"')
    }

    // Suggest performance sorting if not present
    if (!filters.sortBy) {
      suggestions.push('정렬 조건: "느린 쿼리", "자주 실행", "버퍼 많이 쓰는"')
    }

    // Suggest limit if getting many results
    if (!filters.limit && filters.sortBy) {
      suggestions.push('결과 제한: "상위 10개", "5개만"')
    }

    // Suggest SQL type if general search
    if (!filters.sqlPattern) {
      suggestions.push('SQL 유형: "SELECT", "UPDATE", "JOIN 쿼리"')
    }

    // Limit to 3 suggestions
    return suggestions.slice(0, 3)
  }

  /**
   * Calculates overall confidence based on matched rules
   */
  private calculateConfidence(matchedRules: MatchedRule[]): 'high' | 'medium' | 'low' {
    if (matchedRules.length === 0) {
      return 'low'
    }

    const avgConfidence = matchedRules.reduce((sum, r) => sum + r.confidence, 0) / matchedRules.length

    // Bonus for multiple matched rules
    const ruleCountBonus = Math.min(matchedRules.length * 0.05, 0.15)
    const finalConfidence = Math.min(avgConfidence + ruleCountBonus, 1.0)

    if (finalConfidence >= 0.85) return 'high'
    if (finalConfidence >= 0.6) return 'medium'
    return 'low'
  }

  /**
   * Determines the intent type based on filters
   */
  private determineIntentType(filters: SearchFilters): IntentType {
    if (filters.sortBy === 'elapsed_time' && filters.sortOrder === 'desc') {
      return 'find_slow_queries'
    }
    if (filters.sortBy === 'buffer_gets' || filters.sortBy === 'cpu_time' || filters.sortBy === 'disk_reads') {
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

  /**
   * Adds a custom rule to the parser
   */
  addRule(rule: IParsingRule): void {
    this.registry.register(rule)
  }

  /**
   * Gets the count of registered rules
   */
  get ruleCount(): number {
    return this.registry.ruleCount
  }
}
