/**
 * Application Layer - Generate Optimization Use Case
 * SQL optimization suggestions using LLM
 */

import { v4 as uuidv4 } from 'uuid'
import type { ILLMAdapter } from '../ports/ILLMAdapter'
import type { ChatMessage } from '@/domain/llm-analysis'
import type { GenerateOptimizationRequest, GenerateOptimizationResponse, OptimizationChange } from '../dto'

export class GenerateOptimizationUseCase {
  constructor(private readonly llmAdapter: ILLMAdapter) {}

  async execute(request: GenerateOptimizationRequest): Promise<GenerateOptimizationResponse> {
    const startTime = Date.now()

    // Validate request
    this.validateRequest(request)

    // Build prompt
    const messages = this.buildMessages(request)

    // Call LLM
    const llmResponse = await this.llmAdapter.chat(messages, {
      maxTokens: 4096,
      temperature: 0.1,
    })

    // Parse response
    const optimization = this.parseResponse(llmResponse.content, request.sqlText)

    const processingTimeMs = Date.now() - startTime

    return {
      id: uuidv4(),
      originalSql: request.sqlText,
      optimizedSql: optimization.optimizedSql,
      changes: optimization.changes,
      expectedImprovement: optimization.expectedImprovement,
      explanation: optimization.explanation,
      modelUsed: llmResponse.model,
      processingTimeMs,
    }
  }

  private validateRequest(request: GenerateOptimizationRequest): void {
    if (!request.sqlText || request.sqlText.trim().length === 0) {
      throw new Error('SQL text is required')
    }

    if (request.sqlText.length > 50000) {
      throw new Error('SQL text exceeds maximum length of 50000 characters')
    }
  }

  private buildMessages(request: GenerateOptimizationRequest): ChatMessage[] {
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
      return `당신은 Oracle SQL 최적화 전문가입니다.
SQL 쿼리를 분석하고 성능이 개선된 최적화 버전을 제시합니다.
최적화된 SQL은 원본과 동일한 결과를 반환해야 합니다.
응답은 반드시 JSON 형식으로 제공해야 합니다.`
    }

    return `You are an Oracle SQL optimization expert.
You analyze SQL queries and provide optimized versions with improved performance.
The optimized SQL must return the same results as the original.
Your response must be in JSON format.`
  }

  private buildUserPrompt(request: GenerateOptimizationRequest, language: 'ko' | 'en'): string {
    const target = request.targetImprovement || 'performance'

    if (language === 'ko') {
      let prompt = `## 원본 SQL
\`\`\`sql
${request.sqlText}
\`\`\`
`

      if (request.executionPlan) {
        prompt += `
## 현재 실행 계획
\`\`\`
${request.executionPlan}
\`\`\`
`
      }

      if (request.metrics) {
        prompt += `
## 현재 성능 메트릭
- Elapsed Time: ${request.metrics.elapsedTimeMs}ms
- CPU Time: ${request.metrics.cpuTimeMs}ms
- Buffer Gets: ${request.metrics.bufferGets.toLocaleString()}
- Disk Reads: ${request.metrics.diskReads.toLocaleString()}
- Executions: ${request.metrics.executions.toLocaleString()}
`
      }

      prompt += `
## 최적화 목표
${target === 'performance' ? '성능 최적화 (실행 시간, 리소스 사용량 감소)' : ''}
${target === 'readability' ? '가독성 향상 (코드 정리, 명확한 구조)' : ''}
${target === 'both' ? '성능 및 가독성 모두 향상' : ''}

## 요청
위 SQL을 최적화하고 다음 JSON 형식으로 응답해주세요:
{
  "optimizedSql": "최적화된 SQL (전체)",
  "explanation": "전체 최적화 설명 (2-3문장)",
  "expectedImprovement": "예상 성능 개선 (예: '30-50% 실행 시간 단축')",
  "changes": [
    {
      "type": "rewrite/hint/index/restructure",
      "description": "변경 설명",
      "before": "변경 전 코드 조각",
      "after": "변경 후 코드 조각",
      "impact": "해당 변경의 영향"
    }
  ]
}

주의사항:
- 최적화된 SQL은 원본과 동일한 결과를 반환해야 함
- 실제 적용 가능한 변경만 제안
- 각 변경의 이유와 영향을 명확히 설명`

      return prompt
    }

    // English version
    let prompt = `## Original SQL
\`\`\`sql
${request.sqlText}
\`\`\`
`

    if (request.executionPlan) {
      prompt += `
## Current Execution Plan
\`\`\`
${request.executionPlan}
\`\`\`
`
    }

    if (request.metrics) {
      prompt += `
## Current Performance Metrics
- Elapsed Time: ${request.metrics.elapsedTimeMs}ms
- CPU Time: ${request.metrics.cpuTimeMs}ms
- Buffer Gets: ${request.metrics.bufferGets.toLocaleString()}
- Disk Reads: ${request.metrics.diskReads.toLocaleString()}
`
    }

    prompt += `
## Optimization Goal
${target === 'performance' ? 'Performance optimization (reduce execution time, resource usage)' : ''}
${target === 'readability' ? 'Readability improvement (clean code, clear structure)' : ''}
${target === 'both' ? 'Improve both performance and readability' : ''}

## Request
Optimize the above SQL and respond in the following JSON format:
{
  "optimizedSql": "Optimized SQL (complete)",
  "explanation": "Overall optimization explanation",
  "expectedImprovement": "Expected performance improvement",
  "changes": [...]
}`

    return prompt
  }

  private parseResponse(content: string, originalSql: string): ParsedOptimization {
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
        optimizedSql: parsed.optimizedSql || originalSql,
        explanation: parsed.explanation || 'Optimization analysis completed',
        expectedImprovement: parsed.expectedImprovement || 'Unknown',
        changes: (parsed.changes || []).map((c: any) => ({
          type: c.type || 'rewrite',
          description: c.description || '',
          before: c.before || '',
          after: c.after || '',
          impact: c.impact || '',
        })),
      }
    } catch (error) {
      console.error('Failed to parse optimization response:', error)
      return {
        optimizedSql: originalSql,
        explanation: content.substring(0, 500),
        expectedImprovement: 'Unable to determine',
        changes: [],
      }
    }
  }
}

interface ParsedOptimization {
  optimizedSql: string
  explanation: string
  expectedImprovement: string
  changes: OptimizationChange[]
}
