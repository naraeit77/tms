/**
 * Infrastructure Layer - SchemaRule
 * Parsing rule for extracting schema/table filters from queries
 */

import type { SearchQuery, IParsingRule, ParsedIntent, MatchedRule } from '@/domain/smart-search'
import type { SearchFilters } from '@/domain/llm-analysis'

/**
 * Schema/Table patterns for Korean natural language
 */
const SCHEMA_PATTERNS: Array<{
  pattern: RegExp
  extractSchema: (match: RegExpMatchArray) => string
  keywords: string[]
}> = [
  // Schema patterns
  {
    pattern: /(?:스키마|schema)\s*[:\s=]?\s*(\w+)/i,
    extractSchema: (m) => m[1].toUpperCase(),
    keywords: ['스키마', 'schema'],
  },
  {
    pattern: /(\w+)\s*스키마/i,
    extractSchema: (m) => m[1].toUpperCase(),
    keywords: ['스키마'],
  },

  // Owner patterns
  {
    pattern: /(?:소유자|owner)\s*[:\s=]?\s*(\w+)/i,
    extractSchema: (m) => m[1].toUpperCase(),
    keywords: ['소유자', 'owner'],
  },

  // User patterns (for Oracle schemas = users)
  {
    pattern: /(?:사용자|user)\s*[:\s=]?\s*(\w+)/i,
    extractSchema: (m) => m[1].toUpperCase(),
    keywords: ['사용자', 'user'],
  },
]

/**
 * Table patterns
 */
const TABLE_PATTERNS: Array<{
  pattern: RegExp
  extractTable: (match: RegExpMatchArray) => string
  keywords: string[]
}> = [
  // Table patterns
  {
    pattern: /(?:테이블|table)\s*[:\s=]?\s*(\w+)/i,
    extractTable: (m) => m[1].toUpperCase(),
    keywords: ['테이블', 'table'],
  },
  {
    pattern: /(\w+)\s*테이블/i,
    extractTable: (m) => m[1].toUpperCase(),
    keywords: ['테이블'],
  },

  // FROM clause detection (e.g., "EMPLOYEES 테이블에서")
  {
    pattern: /(\w+)\s*(?:테이블)?(?:에서|의|를)/i,
    extractTable: (m) => {
      // Filter out common Korean words that aren't table names
      const word = m[1].toUpperCase()
      const skipWords = ['쿼리', '데이터', '결과', '시간', '스키마', '오늘', '최근', '가장']
      if (skipWords.includes(word) || word.length < 2) return ''
      return word
    },
    keywords: ['에서', '의'],
  },
]

/**
 * Schema Parsing Rule
 */
export class SchemaRule implements IParsingRule {
  readonly name = 'schema'
  readonly priority = 50 // Medium priority

  matches(query: SearchQuery): boolean {
    return SCHEMA_PATTERNS.some(({ pattern }) => pattern.test(query.normalizedInput)) ||
           TABLE_PATTERNS.some(({ pattern }) => pattern.test(query.normalizedInput))
  }

  apply(query: SearchQuery): Partial<ParsedIntent> {
    const matchedKeywords: string[] = []
    let schema: SearchFilters['schema'] | undefined
    let table: SearchFilters['table'] | undefined
    const interpretations: string[] = []

    // Check schema patterns
    for (const schemaPattern of SCHEMA_PATTERNS) {
      const match = query.normalizedInput.match(schemaPattern.pattern)
      if (match) {
        const extractedSchema = schemaPattern.extractSchema(match)
        if (extractedSchema && extractedSchema.length >= 2) {
          schema = extractedSchema
          matchedKeywords.push(...schemaPattern.keywords.filter(k =>
            query.normalizedInput.toLowerCase().includes(k.toLowerCase())
          ))
          interpretations.push(`스키마: ${schema}`)
          break
        }
      }
    }

    // Check table patterns
    for (const tablePattern of TABLE_PATTERNS) {
      const match = query.normalizedInput.match(tablePattern.pattern)
      if (match) {
        const extractedTable = tablePattern.extractTable(match)
        if (extractedTable && extractedTable.length >= 2) {
          table = extractedTable
          matchedKeywords.push(...tablePattern.keywords.filter(k =>
            query.normalizedInput.toLowerCase().includes(k.toLowerCase())
          ))
          interpretations.push(`테이블: ${table}`)
          break
        }
      }
    }

    if (!schema && !table) {
      return {}
    }

    const matchedRule: MatchedRule = {
      ruleName: this.name,
      matchedKeywords,
      confidence: 0.8,
    }

    const filters: SearchFilters = {}
    if (schema) filters.schema = schema
    if (table) filters.table = table

    return {
      filters,
      interpretation: interpretations.join(', '),
      matchedRules: [matchedRule],
    }
  }
}
