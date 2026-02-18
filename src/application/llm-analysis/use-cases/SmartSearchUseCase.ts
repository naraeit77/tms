/**
 * @deprecated This LLM-based SmartSearch is deprecated.
 * Use the rule-based implementation instead:
 * - Use Case: @/application/smart-search/RuleBasedSmartSearchUseCase
 * - Hook: @/presentation/analysis/hooks/useRuleBasedSearch
 *
 * The rule-based implementation provides:
 * - Faster response (synchronous, no API calls)
 * - No LLM dependency or costs
 * - Predictable results with explicit rules
 * - Better maintainability
 *
 * Original: Application Layer - Smart Search Use Case (Enhanced)
 * Natural language to SQL search filters using LLM
 * v2.0 - Improved accuracy with expanded few-shot examples and synonym preprocessing
 */

import type { ILLMAdapter } from '../ports/ILLMAdapter'
import type { ChatMessage, SearchFilters } from '@/domain/llm-analysis'
import type { SmartSearchRequest, SmartSearchResponse } from '../dto'
import { getBalancedExamples, formatExamplesForPrompt } from '../prompts/smart-search-examples'
import {
  preprocessUserInput,
  generateHintContext,
} from '../prompts/synonym-mappings'

export class SmartSearchUseCase {
  constructor(private readonly llmAdapter: ILLMAdapter) {}

  async execute(request: SmartSearchRequest): Promise<SmartSearchResponse> {
    const startTime = Date.now()

    // Validate request
    this.validateRequest(request)

    // Preprocess input for hints
    const { hints } = preprocessUserInput(request.query)

    // Build prompt with enhanced examples and hints
    const messages = this.buildMessages(request, hints)

    // Call LLM
    const llmResponse = await this.llmAdapter.chat(messages, {
      maxTokens: 1024,
      temperature: 0.05, // Lower temperature for more consistent output
    })

    // Parse response with fallback hints
    const result = this.parseResponse(llmResponse.content, request.query, hints)

    const processingTimeMs = Date.now() - startTime

    return {
      originalQuery: request.query,
      interpretation: result.interpretation,
      filters: result.filters,
      suggestions: result.suggestions,
      modelUsed: llmResponse.model,
      processingTimeMs,
    }
  }

  private validateRequest(request: SmartSearchRequest): void {
    if (!request.query || request.query.trim().length === 0) {
      throw new Error('Search query is required')
    }

    if (request.query.length > 500) {
      throw new Error('Search query exceeds maximum length of 500 characters')
    }
  }

  private buildMessages(
    request: SmartSearchRequest,
    hints: ReturnType<typeof preprocessUserInput>['hints']
  ): ChatMessage[] {
    const language = request.language || 'ko'
    const systemPrompt = this.getSystemPrompt(language)
    const userPrompt = this.buildUserPrompt(request.query, language, hints)

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]
  }

  private getSystemPrompt(language: 'ko' | 'en'): string {
    if (language === 'ko') {
      return `당신은 Oracle SQL 성능 모니터링 시스템의 검색 쿼리 해석 전문가입니다.
사용자의 자연어 검색어를 SQL 모니터링 시스템의 필터로 정확하게 변환합니다.

## 핵심 원칙
1. **정확성 최우선**: Few-shot 예시를 최대한 정확히 참조하여 응답합니다.
2. **복합 조건 추출**: 사용자 쿼리의 모든 조건을 빠짐없이 추출합니다.
3. **합리적 기본값**: 명시되지 않은 필드는 합리적 기본값을 적용합니다.
4. **JSON만 응답**: 설명 없이 순수 JSON 형식으로만 응답합니다.

## 시간 관련 키워드 매핑
- "1시간", "한시간", "최근" → timeRange: "1h"
- "오늘", "24시간", "하루" → timeRange: "24h"
- "일주일", "7일", "이번주" → timeRange: "7d"
- "한달", "30일", "이번달" → timeRange: "30d"
- "3개월", "분기" → timeRange: "90d"

## 성능 임계값 기준
| 키워드 | minElapsedTime | 설명 |
|--------|----------------|------|
| 느린, 지연 | 1000ms | 1초 이상 |
| 매우 느린, 심각한 | 5000ms | 5초 이상 |
| 초과 걸리는 | 3000ms | 3초 이상 |
| 빠른 | maxElapsedTime: 100ms | 100ms 이하 |

## Buffer Gets 임계값 기준
| 키워드 | minBufferGets | 설명 |
|--------|---------------|------|
| 풀스캔, 대용량 | 100000 | 10만 이상 |
| 버퍼 많이, 메모리 과다 | 50000 | 5만 이상 |
| 디스크 많은 | 10000 | 1만 이상 |

## SQL 유형 패턴
- SELECT/조회/검색 → "%SELECT%"
- UPDATE/수정/변경 → "%UPDATE%"
- DELETE/삭제/제거 → "%DELETE%"
- INSERT/입력/삽입 → "%INSERT%"
- JOIN/조인 → "%JOIN%"
- SUBQUERY/서브쿼리 → "%SELECT%SELECT%"
- ORDER BY/정렬 → "%ORDER BY%"
- GROUP BY/그룹 → "%GROUP BY%"

## 정렬 기준 매핑
| 키워드 | sortBy | sortOrder |
|--------|--------|-----------|
| 느린순, 시간순 | elapsed_time | desc |
| 빠른순 | elapsed_time | asc |
| 자주실행, 빈도순 | executions | desc |
| CPU순 | cpu_time | desc |
| 버퍼순 | buffer_gets | desc |
| 디스크순 | disk_reads | desc |

## 결과 수 제한 (limit) 매핑 - 중요!
| 키워드 | limit |
|--------|-------|
| 하나, 하나만, 1개, 한 개, 단 하나 | 1 |
| 두 개, 2개 | 2 |
| 세 개, 3개 | 3 |
| 다섯 개, 5개 | 5 |
| 열 개, 10개 | 10 |
| 스무 개, 20개 | 20 |
| 상위 N개, N개만, 톱 N, top N | N (숫자 추출) |
| 가장 ~한 (단수형) | 1 |

주의: "가장 느린 쿼리 하나"는 limit: 1, "가장 느린 쿼리들"은 limit 생략

## 중요: JSON 응답 형식
\`\`\`json
{
  "interpretation": "검색 의도 설명 (한 문장)",
  "filters": {
    "timeRange": "1h|24h|7d|30d|90d",
    "minElapsedTime": number,
    "maxElapsedTime": number,
    "minBufferGets": number,
    "maxBufferGets": number,
    "sqlPattern": "LIKE 패턴",
    "schema": "스키마명",
    "sortBy": "elapsed_time|cpu_time|buffer_gets|disk_reads|executions",
    "sortOrder": "asc|desc",
    "limit": number
  },
  "suggestions": ["추천 검색어1", "추천 검색어2"]
}
\`\`\``
    }

    return `You are an Oracle SQL performance monitoring system search query interpretation expert.
You accurately convert user's natural language queries into SQL monitoring system filters.

## Core Principles
1. **Accuracy First**: Reference few-shot examples precisely for responses.
2. **Extract All Conditions**: Extract all conditions from user queries without omission.
3. **Reasonable Defaults**: Apply reasonable defaults for unspecified fields.
4. **JSON Only**: Respond only in pure JSON format without explanation.

## Time Keywords Mapping
- "1 hour", "recent" → timeRange: "1h"
- "today", "24 hours" → timeRange: "24h"
- "this week", "7 days" → timeRange: "7d"
- "this month", "30 days" → timeRange: "30d"

## Performance Threshold Reference
| Keyword | minElapsedTime | Description |
|---------|----------------|-------------|
| slow, delayed | 1000ms | Over 1 second |
| very slow, critical | 5000ms | Over 5 seconds |
| fast | maxElapsedTime: 100ms | Under 100ms |

## Buffer Gets Threshold
| Keyword | minBufferGets | Description |
|---------|---------------|-------------|
| full scan, large | 100000 | Over 100k |
| high memory | 50000 | Over 50k |

## SQL Type Patterns
- SELECT/query → "%SELECT%"
- UPDATE/modify → "%UPDATE%"
- DELETE/remove → "%DELETE%"
- INSERT/add → "%INSERT%"
- JOIN → "%JOIN%"

## Sort Mapping
| Keyword | sortBy | sortOrder |
|---------|--------|-----------|
| slowest, by time | elapsed_time | desc |
| fastest | elapsed_time | asc |
| most executed | executions | desc |
| by CPU | cpu_time | desc |

## JSON Response Format
\`\`\`json
{
  "interpretation": "Search intent description (one sentence)",
  "filters": {
    "timeRange": "1h|24h|7d|30d|90d",
    "minElapsedTime": number,
    ...
  },
  "suggestions": ["suggestion1", "suggestion2"]
}
\`\`\``
  }

  private buildUserPrompt(
    query: string,
    language: 'ko' | 'en',
    hints: ReturnType<typeof preprocessUserInput>['hints']
  ): string {
    // Get balanced few-shot examples (12 examples, well-distributed)
    const examples = getBalancedExamples(12)
    const formattedExamples = formatExamplesForPrompt(examples, language)

    // Generate hint context from preprocessing
    const hintContext = generateHintContext(hints)

    if (language === 'ko') {
      return `## 검색어
"${query}"
${hintContext}

## 사용 가능한 필터
- timeRange: 기간 ("1h", "24h", "7d", "30d", "90d")
- minElapsedTime: 최소 실행 시간 (ms, 1000=1초)
- maxElapsedTime: 최대 실행 시간 (ms)
- minBufferGets: 최소 Buffer Gets (논리적 읽기)
- maxBufferGets: 최대 Buffer Gets
- minDiskReads: 최소 Disk Reads (물리적 읽기)
- minExecutions: 최소 실행 횟수
- sqlPattern: SQL 텍스트 패턴 (LIKE 검색, %와일드카드%)
- schema: 스키마명 (대문자)
- sortBy: 정렬 기준 (elapsed_time, cpu_time, buffer_gets, disk_reads, executions)
- sortOrder: 정렬 순서 (asc, desc)
- limit: 결과 수 제한

## Few-shot 예시 (정확히 참조하세요)
${formattedExamples}

## 요청
위 검색어를 분석하여 JSON으로만 응답하세요. 설명 없이 JSON만 출력하세요.`
    }

    return `## Search Query
"${query}"
${hintContext}

## Available Filters
- timeRange: Time period ("1h", "24h", "7d", "30d", "90d")
- minElapsedTime: Minimum elapsed time (ms, 1000=1sec)
- maxElapsedTime: Maximum elapsed time (ms)
- minBufferGets: Minimum Buffer Gets (logical reads)
- maxBufferGets: Maximum Buffer Gets
- minDiskReads: Minimum Disk Reads (physical reads)
- minExecutions: Minimum execution count
- sqlPattern: SQL text pattern (LIKE search, use %wildcards%)
- schema: Schema name (UPPERCASE)
- sortBy: Sort field (elapsed_time, cpu_time, buffer_gets, disk_reads, executions)
- sortOrder: Sort order (asc, desc)
- limit: Result limit

## Few-shot Examples (reference exactly)
${formattedExamples}

## Request
Analyze the query and respond with JSON only. No explanation, just JSON.`
  }

  private parseResponse(
    content: string,
    originalQuery: string,
    hints: ReturnType<typeof preprocessUserInput>['hints']
  ): ParsedSearch {
    // Debug logging
    console.log('[SmartSearch] LLM Response length:', content?.length || 0)
    console.log('[SmartSearch] LLM Response preview:', content?.substring(0, 200))

    try {
      // Try multiple JSON extraction patterns
      const parsed = this.extractJSON(content)
      console.log('[SmartSearch] Parsed successfully:', JSON.stringify(parsed).substring(0, 200))

      const filters: SearchFilters = {}

      if (parsed.filters) {
        // Validate and apply filters
        if (this.isValidTimeRange(parsed.filters.timeRange)) {
          filters.timeRange = parsed.filters.timeRange
        }
        if (this.isPositiveNumber(parsed.filters.minElapsedTime)) {
          filters.minElapsedTime = Number(parsed.filters.minElapsedTime)
        }
        if (this.isPositiveNumber(parsed.filters.maxElapsedTime)) {
          filters.maxElapsedTime = Number(parsed.filters.maxElapsedTime)
        }
        if (this.isPositiveNumber(parsed.filters.minBufferGets)) {
          filters.minBufferGets = Number(parsed.filters.minBufferGets)
        }
        if (this.isPositiveNumber(parsed.filters.maxBufferGets)) {
          filters.maxBufferGets = Number(parsed.filters.maxBufferGets)
        }
        if (this.isPositiveNumber(parsed.filters.minDiskReads)) {
          filters.minDiskReads = Number(parsed.filters.minDiskReads)
        }
        if (this.isPositiveNumber(parsed.filters.minExecutions)) {
          filters.minExecutions = Number(parsed.filters.minExecutions)
        }
        if (this.isValidPattern(parsed.filters.sqlPattern)) {
          filters.sqlPattern = parsed.filters.sqlPattern
        }
        if (this.isValidSchema(parsed.filters.schema)) {
          filters.schema = parsed.filters.schema.toUpperCase()
        }
        if (this.isValidSortBy(parsed.filters.sortBy)) {
          filters.sortBy = parsed.filters.sortBy
        }
        if (this.isValidSortOrder(parsed.filters.sortOrder)) {
          filters.sortOrder = parsed.filters.sortOrder
        }
        if (this.isPositiveNumber(parsed.filters.limit)) {
          filters.limit = Math.min(Number(parsed.filters.limit), 1000)
        }
      }

      // Apply hint-based fallbacks if LLM missed something obvious
      this.applyHintFallbacks(filters, hints)

      // Use LLM suggestions if available, otherwise generate dynamic ones
      const suggestions = Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0
        ? parsed.suggestions.slice(0, 5)
        : this.generateDynamicSuggestions(originalQuery, hints)

      return {
        interpretation: parsed.interpretation || `검색: ${originalQuery}`,
        filters,
        suggestions,
      }
    } catch (error) {
      console.error('[SmartSearch] Failed to parse LLM response:', error)
      console.error('[SmartSearch] Raw content was:', content?.substring(0, 500))
      // Use hints for graceful fallback
      return this.buildFallbackResponse(originalQuery, hints)
    }
  }

  /**
   * Extract JSON from various formats (with/without code blocks, with extra text)
   */
  private extractJSON(content: string): any {
    // Pattern 1: JSON in code block
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      const jsonStr = codeBlockMatch[1].trim()
      const parsed = this.tryParseJSON(jsonStr)
      if (parsed) return parsed
    }

    // Pattern 2: Direct JSON object
    const jsonStart = content.indexOf('{')
    const jsonEnd = content.lastIndexOf('}')

    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      const jsonStr = content.substring(jsonStart, jsonEnd + 1)
      const parsed = this.tryParseJSON(jsonStr)
      if (parsed) return parsed
    }

    // Pattern 3: Try fixing common JSON issues
    const fixedContent = this.fixCommonJSONIssues(content)
    const fixedParsed = this.tryParseJSON(fixedContent)
    if (fixedParsed) return fixedParsed

    throw new Error('No valid JSON found in response')
  }

  /**
   * Try to parse JSON, return null if failed
   */
  private tryParseJSON(str: string): any {
    try {
      return JSON.parse(str)
    } catch {
      return null
    }
  }

  /**
   * Fix common JSON formatting issues from LLM responses
   */
  private fixCommonJSONIssues(content: string): string {
    let fixed = content

    // Remove markdown formatting
    fixed = fixed.replace(/```json\s*/g, '').replace(/```\s*/g, '')

    // Remove trailing commas before closing brackets
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1')

    // Fix unquoted keys (simple cases)
    fixed = fixed.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')

    // Remove control characters
    fixed = fixed.replace(/[\x00-\x1F\x7F]/g, ' ')

    // Extract just the JSON object
    const jsonStart = fixed.indexOf('{')
    const jsonEnd = fixed.lastIndexOf('}')

    if (jsonStart !== -1 && jsonEnd !== -1) {
      return fixed.substring(jsonStart, jsonEnd + 1)
    }

    return fixed
  }

  /**
   * Apply preprocessed hints as fallbacks when LLM response is incomplete
   */
  private applyHintFallbacks(
    filters: SearchFilters,
    hints: ReturnType<typeof preprocessUserInput>['hints']
  ): void {
    // Time range fallback
    if (!filters.timeRange && hints.timeRange) {
      filters.timeRange = hints.timeRange as SearchFilters['timeRange']
    }

    // Threshold fallbacks
    if (Object.keys(hints.thresholds).length > 0) {
      for (const [field, value] of Object.entries(hints.thresholds)) {
        if (field === 'minElapsedTime' && !filters.minElapsedTime) {
          filters.minElapsedTime = value
        } else if (field === 'minBufferGets' && !filters.minBufferGets) {
          filters.minBufferGets = value
        } else if (field === 'minDiskReads' && !filters.minDiskReads) {
          filters.minDiskReads = value
        } else if (field === 'minExecutions' && !filters.minExecutions) {
          filters.minExecutions = value
        }
      }
    }

    // Schema/Table fallback
    if (!filters.schema && hints.schemaTable?.schema) {
      filters.schema = hints.schemaTable.schema
    }
    if (!filters.sqlPattern && hints.schemaTable?.table) {
      filters.sqlPattern = `%${hints.schemaTable.table}%`
    }

    // Sort fallback based on performance focus
    if (!filters.sortBy && hints.performanceFocus) {
      const fieldToSortBy: Record<string, string> = {
        elapsed_time: 'elapsed_time',
        buffer_gets: 'buffer_gets',
        disk_reads: 'disk_reads',
        cpu_time: 'cpu_time',
        executions: 'executions',
      }
      filters.sortBy = fieldToSortBy[hints.performanceFocus.field] as SearchFilters['sortBy']
      filters.sortOrder = hints.performanceFocus.direction === 'high' ? 'desc' : 'asc'
    }

    // Limit fallback - important for "하나만", "1개" etc.
    if (!filters.limit && hints.limit) {
      filters.limit = hints.limit
    }
  }

  /**
   * Build fallback response using only preprocessed hints
   */
  private buildFallbackResponse(
    originalQuery: string,
    hints: ReturnType<typeof preprocessUserInput>['hints']
  ): ParsedSearch {
    const filters: SearchFilters = {}

    // Apply all available hints
    if (hints.timeRange) {
      filters.timeRange = hints.timeRange as SearchFilters['timeRange']
    }

    if (hints.sqlType) {
      filters.sqlPattern = `%${hints.sqlType}%`
    }

    if (hints.performanceFocus) {
      const fieldToSortBy: Record<string, string> = {
        elapsed_time: 'elapsed_time',
        buffer_gets: 'buffer_gets',
        disk_reads: 'disk_reads',
        cpu_time: 'cpu_time',
        executions: 'executions',
      }
      filters.sortBy = fieldToSortBy[hints.performanceFocus.field] as SearchFilters['sortBy']
      filters.sortOrder = hints.performanceFocus.direction === 'high' ? 'desc' : 'asc'

      // Apply reasonable threshold based on intensity
      if (hints.performanceFocus.field === 'elapsed_time' && hints.performanceFocus.direction === 'high') {
        filters.minElapsedTime = hints.intensity >= 3 ? 5000 : hints.intensity >= 2 ? 3000 : 1000
      }
    }

    if (hints.sortOrder) {
      filters.sortBy = hints.sortOrder as SearchFilters['sortBy']
      filters.sortOrder = 'desc'
    }

    for (const [field, value] of Object.entries(hints.thresholds)) {
      (filters as any)[field] = value
    }

    if (hints.schemaTable?.schema) {
      filters.schema = hints.schemaTable.schema
    }

    // Apply limit from hints
    if (hints.limit) {
      filters.limit = hints.limit
    }

    // If no filters extracted, use text search as last resort
    if (Object.keys(filters).length === 0) {
      filters.sqlPattern = `%${originalQuery.substring(0, 50)}%`
    }

    // Generate dynamic suggestions based on query context
    const suggestions = this.generateDynamicSuggestions(originalQuery, hints)

    return {
      interpretation: `검색: ${originalQuery}`,
      filters,
      suggestions,
    }
  }

  /**
   * Generate context-aware suggestions based on query and hints
   */
  private generateDynamicSuggestions(
    query: string,
    hints: ReturnType<typeof preprocessUserInput>['hints']
  ): string[] {
    const suggestions: string[] = []
    const lowerQuery = query.toLowerCase()

    // Time-based suggestions
    if (hints.timeRange || /시간|오늘|어제|최근/.test(lowerQuery)) {
      if (!hints.timeRange || hints.timeRange !== '7d') suggestions.push('이번주 느린 쿼리')
      if (!hints.timeRange || hints.timeRange !== '30d') suggestions.push('이번달 성능 이슈')
    } else {
      suggestions.push('최근 1시간 쿼리')
    }

    // Performance-based suggestions
    if (hints.performanceFocus?.field === 'elapsed_time' || /느린|지연|slow/.test(lowerQuery)) {
      suggestions.push('CPU 사용량 높은 쿼리')
      suggestions.push('버퍼 과다 사용 쿼리')
    } else if (hints.performanceFocus?.field === 'buffer_gets' || /버퍼|메모리/.test(lowerQuery)) {
      suggestions.push('실행시간 긴 쿼리')
      suggestions.push('디스크 읽기 많은 쿼리')
    } else {
      suggestions.push('느린 쿼리 검색')
    }

    // SQL type suggestions
    if (hints.sqlType || /select|update|delete|insert/.test(lowerQuery)) {
      if (hints.sqlType !== 'SELECT') suggestions.push('SELECT 조회 쿼리')
      if (hints.sqlType !== 'UPDATE') suggestions.push('UPDATE 수정 쿼리')
    } else {
      suggestions.push('자주 실행되는 쿼리')
    }

    // Return unique suggestions (max 5)
    return [...new Set(suggestions)].slice(0, 5)
  }

  // Validation helpers
  private isValidTimeRange(value: any): value is SearchFilters['timeRange'] {
    return typeof value === 'string' && ['1h', '6h', '12h', '24h', '7d', '30d', '90d', 'all'].includes(value)
  }

  private isPositiveNumber(value: any): boolean {
    const num = Number(value)
    return !isNaN(num) && num > 0
  }

  private isValidPattern(value: any): boolean {
    return typeof value === 'string' && value.length > 0 && value.length < 1000
  }

  private isValidSchema(value: any): boolean {
    return typeof value === 'string' && value.length > 0 && value.length < 100 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)
  }

  private isValidSortBy(value: any): value is SearchFilters['sortBy'] {
    return typeof value === 'string' && ['elapsed_time', 'cpu_time', 'buffer_gets', 'disk_reads', 'executions', 'rows_processed'].includes(value)
  }

  private isValidSortOrder(value: any): value is SearchFilters['sortOrder'] {
    return typeof value === 'string' && ['asc', 'desc'].includes(value)
  }
}

interface ParsedSearch {
  interpretation: string
  filters: SearchFilters
  suggestions: string[]
}
