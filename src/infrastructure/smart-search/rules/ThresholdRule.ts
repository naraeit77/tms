/**
 * Infrastructure Layer - ThresholdRule
 * Parsing rule for extracting numeric threshold filters from queries
 */

import type { SearchQuery, IParsingRule, ParsedIntent, MatchedRule } from '@/domain/smart-search'
import type { SearchFilters } from '@/domain/llm-analysis'

/**
 * Threshold patterns for performance metrics
 */
const THRESHOLD_PATTERNS: Array<{
  pattern: RegExp
  filterKey: keyof SearchFilters
  multiplier: number
  keywords: string[]
  interpretation: string
}> = [
  // Elapsed time thresholds (in milliseconds)
  {
    pattern: /(\d+(?:\.\d+)?)\s*(?:초|sec(?:ond)?s?)\s*(?:이상|초과|넘는|보다\s*(?:큰|긴))/i,
    filterKey: 'minElapsedTime',
    multiplier: 1000, // seconds to ms
    keywords: ['초', 'sec', '이상', '초과'],
    interpretation: '실행 시간',
  },
  {
    pattern: /(?:실행\s*시간|elapsed)\s*[>≥]\s*(\d+(?:\.\d+)?)\s*(?:초|sec|ms)?/i,
    filterKey: 'minElapsedTime',
    multiplier: 1000,
    keywords: ['실행 시간', 'elapsed'],
    interpretation: '실행 시간',
  },
  {
    pattern: /(\d+(?:\.\d+)?)\s*ms\s*(?:이상|초과|넘는)/i,
    filterKey: 'minElapsedTime',
    multiplier: 1,
    keywords: ['ms', '이상'],
    interpretation: '실행 시간',
  },

  // Buffer gets thresholds
  {
    pattern: /(?:버퍼|buffer)\s*(?:gets?)?\s*[>≥]\s*(\d+)/i,
    filterKey: 'minBufferGets',
    multiplier: 1,
    keywords: ['버퍼', 'buffer'],
    interpretation: '버퍼 읽기',
  },
  {
    pattern: /(\d+)\s*(?:버퍼|buffer)\s*(?:이상|초과)/i,
    filterKey: 'minBufferGets',
    multiplier: 1,
    keywords: ['버퍼', 'buffer', '이상'],
    interpretation: '버퍼 읽기',
  },

  // Disk reads thresholds
  {
    pattern: /(?:디스크|disk)\s*(?:reads?)?\s*[>≥]\s*(\d+)/i,
    filterKey: 'minDiskReads',
    multiplier: 1,
    keywords: ['디스크', 'disk'],
    interpretation: '디스크 읽기',
  },

  // Execution count thresholds
  {
    pattern: /(?:실행\s*횟수|executions?)\s*[>≥]\s*(\d+)/i,
    filterKey: 'minExecutions',
    multiplier: 1,
    keywords: ['실행 횟수', 'execution'],
    interpretation: '실행 횟수',
  },
  {
    pattern: /(\d+)\s*(?:번|회)\s*(?:이상|초과)\s*실행/i,
    filterKey: 'minExecutions',
    multiplier: 1,
    keywords: ['번', '회', '실행'],
    interpretation: '실행 횟수',
  },

  // CPU time thresholds
  {
    pattern: /(?:cpu\s*time?|cpu\s*시간)\s*[>≥]\s*(\d+)/i,
    filterKey: 'minCpuTime',
    multiplier: 1,
    keywords: ['cpu', 'cpu 시간'],
    interpretation: 'CPU 시간',
  },
]

/**
 * Threshold Parsing Rule
 */
export class ThresholdRule implements IParsingRule {
  readonly name = 'threshold'
  readonly priority = 40 // Lower priority - more specific

  matches(query: SearchQuery): boolean {
    return THRESHOLD_PATTERNS.some(({ pattern }) => pattern.test(query.normalizedInput))
  }

  apply(query: SearchQuery): Partial<ParsedIntent> {
    const matchedKeywords: string[] = []
    const filters: SearchFilters = {}
    const interpretations: string[] = []

    for (const threshold of THRESHOLD_PATTERNS) {
      const match = query.normalizedInput.match(threshold.pattern)
      if (match) {
        const value = parseFloat(match[1]) * threshold.multiplier
        if (value > 0) {
          // Type assertion needed due to dynamic key access
          ;(filters as Record<string, number>)[threshold.filterKey] = value
          matchedKeywords.push(...threshold.keywords.filter(k =>
            query.normalizedInput.toLowerCase().includes(k.toLowerCase())
          ))
          interpretations.push(`${threshold.interpretation} >= ${value}`)
        }
      }
    }

    if (Object.keys(filters).length === 0) {
      return {}
    }

    const matchedRule: MatchedRule = {
      ruleName: this.name,
      matchedKeywords: [...new Set(matchedKeywords)],
      confidence: 0.75,
    }

    return {
      filters,
      interpretation: interpretations.join(', '),
      matchedRules: [matchedRule],
    }
  }
}
