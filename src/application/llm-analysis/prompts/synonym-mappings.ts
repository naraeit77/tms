/**
 * Application Layer - Synonym/Alias Mappings
 * Korean natural language synonyms to SearchFilters field mappings
 * Improves AI Smart Search accuracy by normalizing user input
 */

/**
 * Time-related synonyms mapping to timeRange values
 */
export const TIME_SYNONYMS: Record<string, string> = {
  // 1 hour variations
  '1시간': '1h',
  '한시간': '1h',
  '한 시간': '1h',
  '최근 1시간': '1h',
  '지난 1시간': '1h',
  '1시간 이내': '1h',
  '1시간내': '1h',

  // 6 hours variations
  '6시간': '6h',
  '여섯시간': '6h',
  '6시간 이내': '6h',
  '반나절': '6h',

  // 12 hours variations
  '12시간': '12h',
  '반일': '12h',
  '열두시간': '12h',

  // 24 hours / 1 day variations
  '24시간': '24h',
  '하루': '24h',
  '1일': '24h',
  '오늘': '24h',
  '금일': '24h',
  '당일': '24h',
  '하루동안': '24h',
  '24h': '24h',

  // 7 days / 1 week variations
  '7일': '7d',
  '일주일': '7d',
  '1주일': '7d',
  '한주': '7d',
  '이번주': '7d',
  '지난주': '7d',
  '일주': '7d',
  '주간': '7d',

  // 30 days / 1 month variations
  '30일': '30d',
  '한달': '30d',
  '1개월': '30d',
  '한 달': '30d',
  '이번달': '30d',
  '월간': '30d',
  '지난달': '30d',

  // All time
  '전체': 'all',
  '모든 기간': 'all',
  '전체 기간': 'all',
  '제한없음': 'all',
}

/**
 * Performance metric synonyms
 */
export const PERFORMANCE_SYNONYMS: Record<string, { field: string; direction: 'high' | 'low' }> = {
  // Slow/Fast queries
  '느린': { field: 'elapsed_time', direction: 'high' },
  '느려진': { field: 'elapsed_time', direction: 'high' },
  '지연': { field: 'elapsed_time', direction: 'high' },
  '지연된': { field: 'elapsed_time', direction: 'high' },
  '오래걸리는': { field: 'elapsed_time', direction: 'high' },
  '오래 걸리는': { field: 'elapsed_time', direction: 'high' },
  '장시간': { field: 'elapsed_time', direction: 'high' },
  '시간이 오래': { field: 'elapsed_time', direction: 'high' },
  '슬로우': { field: 'elapsed_time', direction: 'high' },
  'slow': { field: 'elapsed_time', direction: 'high' },

  '빠른': { field: 'elapsed_time', direction: 'low' },
  '빨라진': { field: 'elapsed_time', direction: 'low' },
  '신속한': { field: 'elapsed_time', direction: 'low' },
  'fast': { field: 'elapsed_time', direction: 'low' },

  // Buffer gets / Logical reads
  '버퍼': { field: 'buffer_gets', direction: 'high' },
  '버퍼 읽기': { field: 'buffer_gets', direction: 'high' },
  '논리적 읽기': { field: 'buffer_gets', direction: 'high' },
  '로지컬 리드': { field: 'buffer_gets', direction: 'high' },
  'logical read': { field: 'buffer_gets', direction: 'high' },
  'buffer gets': { field: 'buffer_gets', direction: 'high' },
  '메모리 읽기': { field: 'buffer_gets', direction: 'high' },

  // Disk reads / Physical reads
  '디스크': { field: 'disk_reads', direction: 'high' },
  '디스크 읽기': { field: 'disk_reads', direction: 'high' },
  '물리적 읽기': { field: 'disk_reads', direction: 'high' },
  '피지컬 리드': { field: 'disk_reads', direction: 'high' },
  'physical read': { field: 'disk_reads', direction: 'high' },
  'disk reads': { field: 'disk_reads', direction: 'high' },
  'I/O': { field: 'disk_reads', direction: 'high' },
  'io': { field: 'disk_reads', direction: 'high' },

  // CPU usage
  'CPU': { field: 'cpu_time', direction: 'high' },
  'cpu': { field: 'cpu_time', direction: 'high' },
  '씨피유': { field: 'cpu_time', direction: 'high' },
  'CPU 사용': { field: 'cpu_time', direction: 'high' },
  'CPU 시간': { field: 'cpu_time', direction: 'high' },
  'CPU 소모': { field: 'cpu_time', direction: 'high' },

  // Execution count
  '실행': { field: 'executions', direction: 'high' },
  '실행횟수': { field: 'executions', direction: 'high' },
  '실행 횟수': { field: 'executions', direction: 'high' },
  '수행': { field: 'executions', direction: 'high' },
  '호출': { field: 'executions', direction: 'high' },
  '자주 실행': { field: 'executions', direction: 'high' },
  '빈번한': { field: 'executions', direction: 'high' },
  '많이 실행': { field: 'executions', direction: 'high' },
}

/**
 * SQL type synonyms
 */
export const SQL_TYPE_SYNONYMS: Record<string, string> = {
  // SELECT
  '조회': 'SELECT',
  '검색': 'SELECT',
  '셀렉트': 'SELECT',
  'select': 'SELECT',
  'SELECT': 'SELECT',
  '읽기': 'SELECT',
  '데이터 조회': 'SELECT',
  '쿼리': 'SELECT',

  // INSERT
  '삽입': 'INSERT',
  '입력': 'INSERT',
  '인서트': 'INSERT',
  'insert': 'INSERT',
  'INSERT': 'INSERT',
  '등록': 'INSERT',
  '추가': 'INSERT',
  '신규': 'INSERT',
  '데이터 입력': 'INSERT',

  // UPDATE
  '수정': 'UPDATE',
  '변경': 'UPDATE',
  '업데이트': 'UPDATE',
  'update': 'UPDATE',
  'UPDATE': 'UPDATE',
  '갱신': 'UPDATE',
  '데이터 수정': 'UPDATE',

  // DELETE
  '삭제': 'DELETE',
  '제거': 'DELETE',
  '딜리트': 'DELETE',
  'delete': 'DELETE',
  'DELETE': 'DELETE',
  '데이터 삭제': 'DELETE',

  // MERGE
  '머지': 'MERGE',
  'merge': 'MERGE',
  'MERGE': 'MERGE',
  'upsert': 'MERGE',

  // PL/SQL
  'PL/SQL': 'PLSQL',
  'plsql': 'PLSQL',
  '프로시저': 'PLSQL',
  '스토어드': 'PLSQL',
  '저장 프로시저': 'PLSQL',
  '펑션': 'PLSQL',
  '함수': 'PLSQL',
  '패키지': 'PLSQL',

  // DDL
  'DDL': 'DDL',
  'ddl': 'DDL',
  'CREATE': 'DDL',
  'ALTER': 'DDL',
  'DROP': 'DDL',
  '테이블 생성': 'DDL',
  '테이블 변경': 'DDL',
  '인덱스 생성': 'DDL',
}

/**
 * Sort order synonyms
 */
export const SORT_SYNONYMS: Record<string, string> = {
  // Elapsed time
  '시간순': 'elapsed_time',
  '수행시간': 'elapsed_time',
  '실행시간': 'elapsed_time',
  '응답시간': 'elapsed_time',
  '소요시간': 'elapsed_time',
  '걸린시간': 'elapsed_time',

  // Buffer gets
  '버퍼순': 'buffer_gets',
  '버퍼 사용량': 'buffer_gets',
  '논리적읽기': 'buffer_gets',
  '메모리사용': 'buffer_gets',

  // Disk reads
  '디스크순': 'disk_reads',
  '물리적읽기': 'disk_reads',
  '디스크 읽기': 'disk_reads',
  'IO순': 'disk_reads',

  // Executions
  '실행횟수순': 'executions',
  '실행순': 'executions',
  '호출순': 'executions',
  '수행횟수': 'executions',

  // CPU time
  'CPU순': 'cpu_time',
  'cpu순': 'cpu_time',
  'CPU사용량': 'cpu_time',

  // Rows processed
  '처리건수': 'rows_processed',
  '처리량': 'rows_processed',
  '로우수': 'rows_processed',
  '행수': 'rows_processed',
}

/**
 * Limit/count patterns for result limiting
 */
export const LIMIT_PATTERNS: Array<{
  pattern: RegExp
  extract: (match: RegExpMatchArray) => number
}> = [
  // "N개", "N개만"
  { pattern: /(\d+)\s*개(?:만)?/, extract: (m) => parseInt(m[1], 10) },
  // "상위 N개", "톱 N", "top N"
  { pattern: /(?:상위|톱|top)\s*(\d+)/i, extract: (m) => parseInt(m[1], 10) },
  // "하나", "하나만", "한 개", "단 하나"
  { pattern: /(?:하나(?:만)?|한\s*개|단\s*하나)/, extract: () => 1 },
  // "두 개", "둘"
  { pattern: /(?:두\s*개|둘)/, extract: () => 2 },
  // "세 개", "셋"
  { pattern: /(?:세\s*개|셋)/, extract: () => 3 },
  // "다섯 개"
  { pattern: /다섯\s*개/, extract: () => 5 },
  // "열 개"
  { pattern: /열\s*개/, extract: () => 10 },
  // "스무 개"
  { pattern: /스무\s*개/, extract: () => 20 },
  // "가장 ~한" without explicit count = 1
  { pattern: /가장\s+(?:느린|빠른|많은|큰|작은)\s*(?:쿼리|SQL)?(?!\s*\d)/, extract: () => 1 },
]

/**
 * Threshold value synonyms (numeric interpretation)
 */
export const THRESHOLD_PATTERNS: Array<{
  pattern: RegExp
  field: string
  multiplier: number
}> = [
  // Elapsed time patterns
  { pattern: /(\d+)\s*초\s*(이상|넘는|초과)/i, field: 'minElapsedTime', multiplier: 1000 },
  { pattern: /(\d+)\s*ms\s*(이상|넘는|초과)/i, field: 'minElapsedTime', multiplier: 1 },
  { pattern: /(\d+)\s*밀리초\s*(이상|넘는|초과)/i, field: 'minElapsedTime', multiplier: 1 },
  { pattern: /(\d+)\s*분\s*(이상|넘는|초과)/i, field: 'minElapsedTime', multiplier: 60000 },

  // Buffer gets patterns
  { pattern: /버퍼.*?(\d+)\s*(이상|넘는|초과)/i, field: 'minBufferGets', multiplier: 1 },
  { pattern: /(\d+)\s*버퍼\s*(이상|넘는|초과)/i, field: 'minBufferGets', multiplier: 1 },
  { pattern: /논리.*?(\d+)\s*(이상|넘는|초과)/i, field: 'minBufferGets', multiplier: 1 },

  // Disk reads patterns
  { pattern: /디스크.*?(\d+)\s*(이상|넘는|초과)/i, field: 'minDiskReads', multiplier: 1 },
  { pattern: /(\d+)\s*디스크\s*(이상|넘는|초과)/i, field: 'minDiskReads', multiplier: 1 },
  { pattern: /물리.*?(\d+)\s*(이상|넘는|초과)/i, field: 'minDiskReads', multiplier: 1 },

  // Execution count patterns
  { pattern: /(\d+)\s*번\s*(이상|넘는|초과)\s*실행/i, field: 'minExecutions', multiplier: 1 },
  { pattern: /실행.*?(\d+)\s*번\s*(이상|넘는|초과)/i, field: 'minExecutions', multiplier: 1 },
  { pattern: /(\d+)\s*회\s*(이상|넘는|초과)/i, field: 'minExecutions', multiplier: 1 },
]

/**
 * Intensity/degree synonyms for relative queries
 */
export const INTENSITY_SYNONYMS: Record<string, number> = {
  // High intensity
  '매우': 3,
  '아주': 3,
  '엄청': 3,
  '극도로': 3,
  '심각하게': 3,
  '심각한': 3,
  '극심한': 3,
  '최악의': 3,

  // Medium intensity
  '상당히': 2,
  '꽤': 2,
  '많이': 2,
  '비교적': 2,

  // Default/low intensity
  '조금': 1,
  '약간': 1,
  '다소': 1,
}

/**
 * Schema/Table pattern synonyms
 */
export const SCHEMA_PATTERNS: Array<{
  pattern: RegExp
  extract: (match: RegExpMatchArray) => { schema?: string; table?: string }
}> = [
  // SCHEMA.TABLE pattern
  {
    pattern: /([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)/i,
    extract: (match) => ({ schema: match[1].toUpperCase(), table: match[2].toUpperCase() }),
  },
  // "스키마명 테이블" pattern
  {
    pattern: /([A-Z_][A-Z0-9_]*)\s*스키마.*?([A-Z_][A-Z0-9_]*)\s*테이블/i,
    extract: (match) => ({ schema: match[1].toUpperCase(), table: match[2].toUpperCase() }),
  },
  // "테이블명" only pattern
  {
    pattern: /([A-Z_][A-Z0-9_]*)\s*테이블/i,
    extract: (match) => ({ table: match[1].toUpperCase() }),
  },
  // "스키마명" only pattern
  {
    pattern: /([A-Z_][A-Z0-9_]*)\s*스키마/i,
    extract: (match) => ({ schema: match[1].toUpperCase() }),
  },
]

/**
 * Common Oracle schema names for detection
 */
export const COMMON_SCHEMAS = [
  'HR', 'OE', 'SH', 'PM', 'IX', 'BI',
  'SCOTT', 'SYSTEM', 'SYS',
  'APP', 'DATA', 'PROD', 'DEV', 'TEST', 'STG',
  'ADMIN', 'BATCH', 'ONLINE', 'WEB', 'API',
]

/**
 * Helper function: Normalize Korean input using synonyms
 */
export function normalizeTimeRange(input: string): string | null {
  const normalizedInput = input.toLowerCase().trim()

  for (const [synonym, value] of Object.entries(TIME_SYNONYMS)) {
    if (normalizedInput.includes(synonym.toLowerCase())) {
      return value
    }
  }

  return null
}

/**
 * Helper function: Extract SQL type from input
 */
export function extractSqlType(input: string): string | null {
  const normalizedInput = input.toLowerCase()

  for (const [synonym, sqlType] of Object.entries(SQL_TYPE_SYNONYMS)) {
    if (normalizedInput.includes(synonym.toLowerCase())) {
      return sqlType
    }
  }

  return null
}

/**
 * Helper function: Extract performance focus from input
 */
export function extractPerformanceFocus(input: string): { field: string; direction: 'high' | 'low' } | null {
  const normalizedInput = input.toLowerCase()

  for (const [synonym, info] of Object.entries(PERFORMANCE_SYNONYMS)) {
    if (normalizedInput.includes(synonym.toLowerCase())) {
      return info
    }
  }

  return null
}

/**
 * Helper function: Extract sort order from input
 */
export function extractSortOrder(input: string): string | null {
  const normalizedInput = input.toLowerCase()

  // Check for explicit sort keywords
  const hasSortKeyword = /정렬|순서|순으로|기준/.test(normalizedInput)

  for (const [synonym, sortField] of Object.entries(SORT_SYNONYMS)) {
    if (normalizedInput.includes(synonym.toLowerCase())) {
      return sortField
    }
  }

  // If no explicit sort found but has sort keyword, default to elapsed_time
  if (hasSortKeyword) {
    return 'elapsed_time'
  }

  return null
}

/**
 * Helper function: Extract threshold values from input
 */
export function extractThresholds(input: string): Record<string, number> {
  const thresholds: Record<string, number> = {}

  for (const { pattern, field, multiplier } of THRESHOLD_PATTERNS) {
    const match = input.match(pattern)
    if (match && match[1]) {
      const value = parseInt(match[1], 10)
      if (!isNaN(value)) {
        thresholds[field] = value * multiplier
      }
    }
  }

  return thresholds
}

/**
 * Helper function: Extract intensity level
 */
export function extractIntensity(input: string): number {
  const normalizedInput = input.toLowerCase()

  for (const [synonym, level] of Object.entries(INTENSITY_SYNONYMS)) {
    if (normalizedInput.includes(synonym)) {
      return level
    }
  }

  return 1 // default intensity
}

/**
 * Helper function: Extract limit/count from input
 */
export function extractLimit(input: string): number | null {
  for (const { pattern, extract } of LIMIT_PATTERNS) {
    const match = input.match(pattern)
    if (match) {
      const limit = extract(match)
      if (limit > 0 && limit <= 1000) {
        return limit
      }
    }
  }

  return null
}

/**
 * Helper function: Extract schema/table from input
 */
export function extractSchemaTable(input: string): { schema?: string; table?: string } | null {
  const upperInput = input.toUpperCase()

  // First check for common schema names
  for (const schema of COMMON_SCHEMAS) {
    if (upperInput.includes(schema)) {
      // Check if it's part of SCHEMA.TABLE pattern
      const schemaTablePattern = new RegExp(`${schema}\\.([A-Z_][A-Z0-9_]*)`, 'i')
      const match = input.match(schemaTablePattern)
      if (match) {
        return { schema, table: match[1].toUpperCase() }
      }
      return { schema }
    }
  }

  // Then try other patterns
  for (const { pattern, extract } of SCHEMA_PATTERNS) {
    const match = input.match(pattern)
    if (match) {
      return extract(match)
    }
  }

  return null
}

/**
 * Comprehensive input normalizer
 * Preprocesses user input and extracts structured hints for LLM
 */
export function preprocessUserInput(input: string): {
  normalizedInput: string
  hints: {
    timeRange?: string
    sqlType?: string
    performanceFocus?: { field: string; direction: 'high' | 'low' }
    sortOrder?: string
    thresholds: Record<string, number>
    intensity: number
    schemaTable?: { schema?: string; table?: string }
    limit?: number
  }
} {
  const normalizedInput = input.trim()

  return {
    normalizedInput,
    hints: {
      timeRange: normalizeTimeRange(input) ?? undefined,
      sqlType: extractSqlType(input) ?? undefined,
      performanceFocus: extractPerformanceFocus(input) ?? undefined,
      sortOrder: extractSortOrder(input) ?? undefined,
      thresholds: extractThresholds(input),
      intensity: extractIntensity(input),
      schemaTable: extractSchemaTable(input) ?? undefined,
      limit: extractLimit(input) ?? undefined,
    },
  }
}

/**
 * Generate hint context for LLM prompt
 */
export function generateHintContext(hints: ReturnType<typeof preprocessUserInput>['hints']): string {
  const parts: string[] = []

  if (hints.timeRange) {
    parts.push(`시간 범위 감지: ${hints.timeRange}`)
  }

  if (hints.sqlType) {
    parts.push(`SQL 유형 감지: ${hints.sqlType}`)
  }

  if (hints.performanceFocus) {
    parts.push(`성능 지표 감지: ${hints.performanceFocus.field} (${hints.performanceFocus.direction === 'high' ? '높은 값' : '낮은 값'})`)
  }

  if (hints.sortOrder) {
    parts.push(`정렬 기준 감지: ${hints.sortOrder}`)
  }

  if (Object.keys(hints.thresholds).length > 0) {
    const thresholdStrs = Object.entries(hints.thresholds)
      .map(([field, value]) => `${field}=${value}`)
      .join(', ')
    parts.push(`임계값 감지: ${thresholdStrs}`)
  }

  if (hints.schemaTable) {
    const { schema, table } = hints.schemaTable
    if (schema && table) {
      parts.push(`스키마/테이블 감지: ${schema}.${table}`)
    } else if (schema) {
      parts.push(`스키마 감지: ${schema}`)
    } else if (table) {
      parts.push(`테이블 감지: ${table}`)
    }
  }

  if (hints.limit) {
    parts.push(`결과 수 제한 감지: ${hints.limit}개`)
  }

  if (parts.length === 0) {
    return ''
  }

  return `\n[사전 분석 힌트]\n${parts.join('\n')}`
}
