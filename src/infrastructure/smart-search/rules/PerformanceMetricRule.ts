/**
 * Infrastructure Layer - PerformanceMetricRule
 * Parsing rule for extracting performance sorting filters from queries
 */

import type { SearchQuery, IParsingRule, ParsedIntent, MatchedRule } from '@/domain/smart-search'
import type { SearchFilters } from '@/domain/llm-analysis'

/**
 * Performance metric patterns for Korean natural language
 */
const METRIC_PATTERNS: Array<{
  pattern: RegExp
  sortBy: SearchFilters['sortBy']
  sortOrder: SearchFilters['sortOrder']
  keywords: string[]
  interpretation: string
}> = [
  // Slow queries (elapsed time)
  {
    pattern: /느린|slow|오래\s*걸린|시간\s*(?:이|가)\s*오래|long\s*running/i,
    sortBy: 'elapsed_time',
    sortOrder: 'desc',
    keywords: ['느린', 'slow', '오래걸린', '오래 걸린'],
    interpretation: '실행 시간이 긴 쿼리',
  },
  {
    pattern: /빠른|fast|짧은|시간\s*(?:이|가)\s*짧/i,
    sortBy: 'elapsed_time',
    sortOrder: 'asc',
    keywords: ['빠른', 'fast', '짧은'],
    interpretation: '실행 시간이 짧은 쿼리',
  },

  // CPU intensive queries
  {
    pattern: /cpu\s*(?:많이|높|과다)|cpu\s*intensive|cpu\s*time|cpu\s*사용/i,
    sortBy: 'cpu_time',
    sortOrder: 'desc',
    keywords: ['cpu', 'cpu 많이', 'cpu 사용'],
    interpretation: 'CPU 사용량이 높은 쿼리',
  },

  // Buffer/Memory intensive
  {
    pattern: /버퍼|buffer|메모리|memory|논리적\s*읽기|logical\s*read/i,
    sortBy: 'buffer_gets',
    sortOrder: 'desc',
    keywords: ['버퍼', 'buffer', '메모리', 'memory'],
    interpretation: '버퍼 사용량이 높은 쿼리',
  },

  // Disk I/O
  {
    pattern: /디스크|disk|물리적\s*읽기|physical\s*read|io|i\/o/i,
    sortBy: 'disk_reads',
    sortOrder: 'desc',
    keywords: ['디스크', 'disk', 'io', 'i/o'],
    interpretation: '디스크 읽기가 많은 쿼리',
  },

  // Frequently executed
  {
    pattern: /자주|많이\s*실행|빈번|frequent|실행\s*횟수|execution/i,
    sortBy: 'executions',
    sortOrder: 'desc',
    keywords: ['자주', '많이 실행', '빈번', '실행 횟수'],
    interpretation: '자주 실행되는 쿼리',
  },

  // Row processing
  {
    pattern: /행\s*(?:이|가)\s*많|많은\s*행|rows|데이터\s*(?:가|이)\s*많/i,
    sortBy: 'rows_processed',
    sortOrder: 'desc',
    keywords: ['행이 많', '많은 행', 'rows'],
    interpretation: '처리 행 수가 많은 쿼리',
  },
]

/**
 * "가장" prefix detection for superlative queries
 */
const SUPERLATIVE_PATTERN = /가장|제일|최고|top|best|worst|most/i

/**
 * Performance Metric Parsing Rule
 */
export class PerformanceMetricRule implements IParsingRule {
  readonly name = 'performance_metric'
  readonly priority = 70 // High priority

  matches(query: SearchQuery): boolean {
    return METRIC_PATTERNS.some(({ pattern }) => pattern.test(query.normalizedInput))
  }

  apply(query: SearchQuery): Partial<ParsedIntent> {
    const matchedKeywords: string[] = []
    let sortBy: SearchFilters['sortBy'] | undefined
    let sortOrder: SearchFilters['sortOrder'] | undefined
    let interpretation = ''

    for (const metric of METRIC_PATTERNS) {
      if (metric.pattern.test(query.normalizedInput)) {
        sortBy = metric.sortBy
        sortOrder = metric.sortOrder
        interpretation = metric.interpretation
        matchedKeywords.push(...metric.keywords.filter(k =>
          query.normalizedInput.includes(k.toLowerCase())
        ))
        break
      }
    }

    if (!sortBy) {
      return {}
    }

    // Check for superlative modifier
    const isSuperlative = SUPERLATIVE_PATTERN.test(query.normalizedInput)
    if (isSuperlative) {
      matchedKeywords.push('가장')
      interpretation = `가장 ${interpretation}`
    }

    const matchedRule: MatchedRule = {
      ruleName: this.name,
      matchedKeywords,
      confidence: isSuperlative ? 0.95 : 0.85,
    }

    return {
      filters: { sortBy, sortOrder },
      interpretation,
      matchedRules: [matchedRule],
    }
  }
}
