/**
 * Infrastructure Layer - SQLTypeRule
 * Parsing rule for extracting SQL type patterns from queries
 */

import type { SearchQuery, IParsingRule, ParsedIntent, MatchedRule } from '@/domain/smart-search'
import type { SearchFilters } from '@/domain/llm-analysis'

/**
 * SQL type patterns for Korean natural language
 */
const SQL_TYPE_PATTERNS: Array<{
  pattern: RegExp
  sqlPattern: string
  keywords: string[]
  interpretation: string
}> = [
  // SELECT queries
  {
    pattern: /\bselect\b|조회|읽기\s*쿼리|검색\s*쿼리/i,
    sqlPattern: '%SELECT%',
    keywords: ['select', '조회', '읽기', '검색'],
    interpretation: 'SELECT 쿼리',
  },

  // INSERT queries
  {
    pattern: /\binsert\b|삽입|입력|추가\s*쿼리/i,
    sqlPattern: '%INSERT%',
    keywords: ['insert', '삽입', '입력', '추가'],
    interpretation: 'INSERT 쿼리',
  },

  // UPDATE queries
  {
    pattern: /\bupdate\b|수정|갱신|업데이트/i,
    sqlPattern: '%UPDATE%',
    keywords: ['update', '수정', '갱신', '업데이트'],
    interpretation: 'UPDATE 쿼리',
  },

  // DELETE queries
  {
    pattern: /\bdelete\b|삭제|제거/i,
    sqlPattern: '%DELETE%',
    keywords: ['delete', '삭제', '제거'],
    interpretation: 'DELETE 쿼리',
  },

  // MERGE queries
  {
    pattern: /\bmerge\b|병합/i,
    sqlPattern: '%MERGE%',
    keywords: ['merge', '병합'],
    interpretation: 'MERGE 쿼리',
  },

  // PL/SQL
  {
    pattern: /pl\/?sql|프로시저|procedure|함수|function|패키지|package/i,
    sqlPattern: '%BEGIN%',
    keywords: ['pl/sql', 'plsql', '프로시저', 'procedure', '함수', 'function'],
    interpretation: 'PL/SQL 블록',
  },

  // JOIN queries
  {
    pattern: /\bjoin\b|조인/i,
    sqlPattern: '%JOIN%',
    keywords: ['join', '조인'],
    interpretation: 'JOIN이 포함된 쿼리',
  },

  // Subquery
  {
    pattern: /서브쿼리|subquery|중첩|nested/i,
    sqlPattern: '%(SELECT%',
    keywords: ['서브쿼리', 'subquery', '중첩'],
    interpretation: '서브쿼리가 포함된 쿼리',
  },

  // Full table scan related
  {
    pattern: /full\s*(?:table)?\s*scan|전체\s*스캔|풀\s*스캔/i,
    sqlPattern: '%FULL%',
    keywords: ['full scan', '전체 스캔', '풀 스캔'],
    interpretation: 'Full Scan이 발생할 수 있는 쿼리',
  },

  // GROUP BY
  {
    pattern: /group\s*by|그룹|집계|aggregate/i,
    sqlPattern: '%GROUP BY%',
    keywords: ['group by', '그룹', '집계'],
    interpretation: 'GROUP BY가 포함된 쿼리',
  },

  // ORDER BY
  {
    pattern: /order\s*by|정렬/i,
    sqlPattern: '%ORDER BY%',
    keywords: ['order by', '정렬'],
    interpretation: 'ORDER BY가 포함된 쿼리',
  },
]

/**
 * SQL Type Parsing Rule
 */
export class SQLTypeRule implements IParsingRule {
  readonly name = 'sql_type'
  readonly priority = 60 // Medium priority

  matches(query: SearchQuery): boolean {
    return SQL_TYPE_PATTERNS.some(({ pattern }) => pattern.test(query.normalizedInput))
  }

  apply(query: SearchQuery): Partial<ParsedIntent> {
    const matchedKeywords: string[] = []
    let sqlPattern: SearchFilters['sqlPattern'] | undefined
    let interpretation = ''

    for (const typePattern of SQL_TYPE_PATTERNS) {
      if (typePattern.pattern.test(query.normalizedInput)) {
        sqlPattern = typePattern.sqlPattern
        interpretation = typePattern.interpretation
        matchedKeywords.push(...typePattern.keywords.filter(k =>
          query.normalizedInput.includes(k.toLowerCase())
        ))
        break
      }
    }

    if (!sqlPattern) {
      return {}
    }

    const matchedRule: MatchedRule = {
      ruleName: this.name,
      matchedKeywords,
      confidence: 0.85,
    }

    return {
      filters: { sqlPattern },
      interpretation,
      matchedRules: [matchedRule],
    }
  }
}
