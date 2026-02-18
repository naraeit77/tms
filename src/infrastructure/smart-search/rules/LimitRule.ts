/**
 * Infrastructure Layer - LimitRule
 * Parsing rule for extracting result limit from queries
 */

import type { SearchQuery, IParsingRule, ParsedIntent, MatchedRule } from '@/domain/smart-search'
import type { SearchFilters } from '@/domain/llm-analysis'

/**
 * Limit patterns for Korean natural language
 */
const LIMIT_PATTERNS: Array<{
  pattern: RegExp
  extractLimit: (match: RegExpMatchArray) => number
  keywords: string[]
}> = [
  // Numeric patterns (e.g., "5개", "10개만")
  {
    pattern: /(\d+)\s*개(?:만)?/,
    extractLimit: (m) => parseInt(m[1], 10),
    keywords: ['개'],
  },

  // Top N patterns
  {
    pattern: /(?:상위|톱|top)\s*(\d+)/i,
    extractLimit: (m) => parseInt(m[1], 10),
    keywords: ['상위', '톱', 'top'],
  },

  // Korean number words - single
  {
    pattern: /(?:하나(?:만)?|한\s*개|단\s*하나)/,
    extractLimit: () => 1,
    keywords: ['하나', '한 개', '단 하나'],
  },

  // Korean number words - two to ten
  {
    pattern: /(?:두\s*개|둘)/,
    extractLimit: () => 2,
    keywords: ['두 개', '둘'],
  },
  {
    pattern: /(?:세\s*개|셋)/,
    extractLimit: () => 3,
    keywords: ['세 개', '셋'],
  },
  {
    pattern: /(?:네\s*개|넷)/,
    extractLimit: () => 4,
    keywords: ['네 개', '넷'],
  },
  {
    pattern: /다섯\s*개/,
    extractLimit: () => 5,
    keywords: ['다섯 개'],
  },
  {
    pattern: /여섯\s*개/,
    extractLimit: () => 6,
    keywords: ['여섯 개'],
  },
  {
    pattern: /일곱\s*개/,
    extractLimit: () => 7,
    keywords: ['일곱 개'],
  },
  {
    pattern: /여덟\s*개/,
    extractLimit: () => 8,
    keywords: ['여덟 개'],
  },
  {
    pattern: /아홉\s*개/,
    extractLimit: () => 9,
    keywords: ['아홉 개'],
  },
  {
    pattern: /열\s*개/,
    extractLimit: () => 10,
    keywords: ['열 개'],
  },
  {
    pattern: /스무\s*개/,
    extractLimit: () => 20,
    keywords: ['스무 개'],
  },

  // "가장" pattern (implies single result)
  {
    pattern: /가장\s+(?:느린|빠른|많은|큰|작은|높은|낮은)\s*(?:쿼리|SQL|것)?(?!\s*(?:\d+|몇|여러))/,
    extractLimit: () => 1,
    keywords: ['가장'],
  },
]

/**
 * Limit Parsing Rule
 */
export class LimitRule implements IParsingRule {
  readonly name = 'limit'
  readonly priority = 90 // Highest priority - should be processed first

  matches(query: SearchQuery): boolean {
    return LIMIT_PATTERNS.some(({ pattern }) => pattern.test(query.normalizedInput))
  }

  apply(query: SearchQuery): Partial<ParsedIntent> {
    const matchedKeywords: string[] = []
    let limit: SearchFilters['limit'] | undefined

    for (const limitPattern of LIMIT_PATTERNS) {
      const match = query.normalizedInput.match(limitPattern.pattern)
      if (match) {
        const extractedLimit = limitPattern.extractLimit(match)
        // Validate limit is reasonable
        if (extractedLimit > 0 && extractedLimit <= 1000) {
          limit = extractedLimit
          matchedKeywords.push(...limitPattern.keywords.filter(k =>
            query.normalizedInput.includes(k.toLowerCase()) ||
            query.normalizedInput.includes(k)
          ))
          break
        }
      }
    }

    if (!limit) {
      return {}
    }

    const matchedRule: MatchedRule = {
      ruleName: this.name,
      matchedKeywords,
      confidence: 0.95,
    }

    return {
      filters: { limit },
      interpretation: `결과 ${limit}개`,
      matchedRules: [matchedRule],
    }
  }
}
