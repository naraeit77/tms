/**
 * Infrastructure Layer - TimeRangeRule
 * Parsing rule for extracting time range filters from queries
 */

import type { SearchQuery, IParsingRule, ParsedIntent, MatchedRule } from '@/domain/smart-search'
import type { SearchFilters } from '@/domain/llm-analysis'

/**
 * Time range patterns for Korean natural language
 */
const TIME_PATTERNS: Array<{
  pattern: RegExp
  timeRange: SearchFilters['timeRange']
  keywords: string[]
}> = [
  // Hours
  { pattern: /(?:최근|지난)\s*1\s*시간|1h|한\s*시간/i, timeRange: '1h', keywords: ['1시간', '한시간', '1h'] },
  { pattern: /(?:최근|지난)\s*6\s*시간|6h|여섯\s*시간/i, timeRange: '6h', keywords: ['6시간', '여섯시간', '6h'] },
  { pattern: /(?:최근|지난)\s*12\s*시간|12h|열두\s*시간/i, timeRange: '12h', keywords: ['12시간', '열두시간', '12h'] },
  { pattern: /(?:최근|지난)\s*24\s*시간|24h|스물네\s*시간|하루/i, timeRange: '24h', keywords: ['24시간', '하루', '24h'] },

  // Days
  { pattern: /오늘|today/i, timeRange: '24h', keywords: ['오늘', 'today'] },
  { pattern: /(?:최근|지난)\s*7\s*일|7d|일주일|1주일?/i, timeRange: '7d', keywords: ['7일', '일주일', '1주일', '7d'] },
  { pattern: /(?:최근|지난)\s*30\s*일|30d|한\s*달|1개월/i, timeRange: '30d', keywords: ['30일', '한달', '1개월', '30d'] },
  { pattern: /(?:최근|지난)\s*90\s*일|90d|3개월|삼\s*개월/i, timeRange: '90d', keywords: ['90일', '3개월', '90d'] },

  // All time
  { pattern: /전체|모든\s*기간|all/i, timeRange: 'all', keywords: ['전체', '모든기간', 'all'] },
]

/**
 * Time Range Parsing Rule
 */
export class TimeRangeRule implements IParsingRule {
  readonly name = 'time_range'
  readonly priority = 80 // High priority

  matches(query: SearchQuery): boolean {
    return TIME_PATTERNS.some(({ pattern }) => pattern.test(query.normalizedInput))
  }

  apply(query: SearchQuery): Partial<ParsedIntent> {
    const matchedKeywords: string[] = []
    let timeRange: SearchFilters['timeRange'] | undefined

    for (const { pattern, timeRange: tr, keywords } of TIME_PATTERNS) {
      if (pattern.test(query.normalizedInput)) {
        timeRange = tr
        matchedKeywords.push(...keywords.filter(k =>
          query.normalizedInput.includes(k.toLowerCase())
        ))
        break
      }
    }

    if (!timeRange) {
      return {}
    }

    const matchedRule: MatchedRule = {
      ruleName: this.name,
      matchedKeywords,
      confidence: 0.9,
    }

    return {
      filters: { timeRange },
      interpretation: this.buildInterpretation(timeRange),
      matchedRules: [matchedRule],
    }
  }

  private buildInterpretation(timeRange: string): string {
    const interpretations: Record<string, string> = {
      '1h': '최근 1시간',
      '6h': '최근 6시간',
      '12h': '최근 12시간',
      '24h': '최근 24시간 (오늘)',
      '7d': '최근 7일',
      '30d': '최근 30일',
      '90d': '최근 90일',
      'all': '전체 기간',
    }
    return interpretations[timeRange] || `시간 범위: ${timeRange}`
  }
}
