/**
 * Application Layer - Detect Patterns Use Case
 * SQL anti-pattern and best practice detection using LLM
 */

import { v4 as uuidv4 } from 'uuid'
import type { ILLMAdapter } from '../ports/ILLMAdapter'
import type { ILLMAnalysisRepository, DetectedPattern } from '@/domain/llm-analysis'
import type { ChatMessage } from '@/domain/llm-analysis'
import type { DetectPatternsRequest, DetectPatternsResponse } from '../dto'

export class DetectPatternsUseCase {
  constructor(
    private readonly llmAdapter: ILLMAdapter,
    private readonly repository?: ILLMAnalysisRepository
  ) {}

  async execute(request: DetectPatternsRequest): Promise<DetectPatternsResponse> {
    const startTime = Date.now()

    // Validate request
    this.validateRequest(request)

    // Build prompt
    const messages = this.buildMessages(request)

    // Call LLM
    const llmResponse = await this.llmAdapter.chat(messages, {
      maxTokens: 2048,
      temperature: 0.1,
    })

    // Parse response
    const analysis = this.parseResponse(llmResponse.content)

    const processingTimeMs = Date.now() - startTime

    const result: DetectPatternsResponse = {
      id: uuidv4(),
      sqlId: request.sqlId,
      patterns: analysis.patterns,
      overallRisk: analysis.overallRisk,
      summary: analysis.summary,
      modelUsed: llmResponse.model,
      processingTimeMs,
      analyzedAt: new Date().toISOString(),
    }

    // Save to repository if requested
    if (request.saveHistory && this.repository && request.sqlId) {
      await this.repository.savePatternDetectionResult({
        id: result.id,
        sqlId: request.sqlId,
        patterns: result.patterns,
        overallRisk: result.overallRisk,
        analyzedAt: new Date(),
      })
    }

    return result
  }

  private validateRequest(request: DetectPatternsRequest): void {
    if (!request.sqlText || request.sqlText.trim().length === 0) {
      throw new Error('SQL text is required')
    }

    if (request.sqlText.length > 50000) {
      throw new Error('SQL text exceeds maximum length of 50000 characters')
    }
  }

  private buildMessages(request: DetectPatternsRequest): ChatMessage[] {
    const language = request.language || 'ko'
    const systemPrompt = this.getSystemPrompt(language)
    const userPrompt = this.buildUserPrompt(request, language)

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]
  }

  private getSystemPrompt(language: 'ko' | 'en'): string {
    if (language === 'ko') {
      return `당신은 Oracle SQL 코드 품질 및 패턴 분석 전문가입니다.
SQL 쿼리에서 안티패턴, 모범 사례, 최적화 기회를 식별합니다.
응답은 반드시 JSON 형식으로 제공해야 합니다.`
    }

    return `You are an Oracle SQL code quality and pattern analysis expert.
You identify anti-patterns, best practices, and optimization opportunities in SQL queries.
Your response must be in JSON format.`
  }

  private buildUserPrompt(request: DetectPatternsRequest, language: 'ko' | 'en'): string {
    const includeAntiPatterns = request.includeAntiPatterns !== false
    const includeBestPractices = request.includeBestPractices !== false

    if (language === 'ko') {
      return `## SQL 쿼리
\`\`\`sql
${request.sqlText}
\`\`\`

## 분석 요청
위 SQL에서 다음을 탐지해주세요:
${includeAntiPatterns ? '- 안티패턴 (성능 저하 유발 패턴)' : ''}
${includeBestPractices ? '- 모범 사례 준수 여부' : ''}
- 최적화 기회

### 탐지 대상 패턴
1. **암시적 타입 변환** - WHERE 절에서 데이터 타입 불일치
2. **Missing Join Conditions** - 카르테시안 조인 가능성
3. **SELECT * 사용** - 불필요한 컬럼 조회
4. **함수 사용으로 인한 인덱스 억제** - WHERE 절 컬럼에 함수 적용
5. **비효율적 서브쿼리** - JOIN으로 변환 가능한 서브쿼리
6. **OR 조건 남용** - UNION으로 최적화 가능
7. **NOT IN 서브쿼리** - NOT EXISTS로 변환 권장
8. **DISTINCT 남용** - 중복 원인 해결 필요
9. **ORDER BY 없는 ROWNUM** - 비결정적 결과
10. **힌트 없는 대용량 조인** - 조인 순서/방법 미지정

다음 JSON 형식으로 응답해주세요:
{
  "summary": "전체 분석 요약 (2-3문장)",
  "overallRisk": "low/medium/high/critical",
  "patterns": [
    {
      "name": "패턴 이름",
      "category": "anti-pattern/best-practice/optimization-opportunity",
      "severity": "critical/high/medium/low/info",
      "description": "상세 설명",
      "location": "해당 위치 (해당되는 경우)",
      "fix": "수정 방법"
    }
  ]
}`
    }

    return `## SQL Query
\`\`\`sql
${request.sqlText}
\`\`\`

## Analysis Request
Please detect the following in the SQL above:
${includeAntiPatterns ? '- Anti-patterns (patterns causing performance degradation)' : ''}
${includeBestPractices ? '- Best practice compliance' : ''}
- Optimization opportunities

Respond in the following JSON format:
{
  "summary": "Overall analysis summary",
  "overallRisk": "low/medium/high/critical",
  "patterns": [...]
}`
  }

  private parseResponse(content: string): ParsedPatternAnalysis {
    try {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content]
      const jsonStr = jsonMatch[1] || content

      const jsonStart = jsonStr.indexOf('{')
      const jsonEnd = jsonStr.lastIndexOf('}')

      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error('No JSON object found in response')
      }

      const parsed = JSON.parse(jsonStr.substring(jsonStart, jsonEnd + 1))

      return {
        summary: parsed.summary || 'Pattern analysis completed',
        overallRisk: parsed.overallRisk || 'low',
        patterns: (parsed.patterns || []).map((p: any) => ({
          name: p.name || 'Unknown Pattern',
          category: p.category || 'anti-pattern',
          severity: p.severity || 'medium',
          description: p.description || '',
          location: p.location,
          fix: p.fix,
        })),
      }
    } catch (error) {
      console.error('Failed to parse pattern detection response:', error)
      return {
        summary: content.substring(0, 500),
        overallRisk: 'low',
        patterns: [],
      }
    }
  }
}

interface ParsedPatternAnalysis {
  summary: string
  overallRisk: 'low' | 'medium' | 'high' | 'critical'
  patterns: DetectedPattern[]
}
