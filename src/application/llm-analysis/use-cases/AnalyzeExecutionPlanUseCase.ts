/**
 * Application Layer - Analyze Execution Plan Use Case
 * Execution plan analysis and bottleneck detection using LLM
 */

import { v4 as uuidv4 } from 'uuid'
import type { ILLMAdapter } from '../ports/ILLMAdapter'
import type { ILLMAnalysisRepository, Bottleneck, Recommendation } from '@/domain/llm-analysis'
import type { ChatMessage } from '@/domain/llm-analysis'
import type { AnalyzeExecutionPlanRequest, AnalyzeExecutionPlanResponse } from '../dto'

export class AnalyzeExecutionPlanUseCase {
  constructor(
    private readonly llmAdapter: ILLMAdapter,
    private readonly repository?: ILLMAnalysisRepository
  ) {}

  async execute(request: AnalyzeExecutionPlanRequest): Promise<AnalyzeExecutionPlanResponse> {
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

    const result: AnalyzeExecutionPlanResponse = {
      id: uuidv4(),
      sqlId: request.sqlId,
      summary: analysis.summary,
      bottlenecks: analysis.bottlenecks,
      recommendations: analysis.recommendations,
      estimatedCost: analysis.estimatedCost,
      modelUsed: llmResponse.model,
      processingTimeMs,
      analyzedAt: new Date().toISOString(),
    }

    // Save to repository if requested
    if (request.saveHistory && this.repository && request.sqlId) {
      await this.repository.saveExecutionPlanAnalysis({
        id: result.id,
        sqlId: request.sqlId,
        planHashValue: 0, // Would need to be parsed from plan
        planText: request.planText,
        summary: result.summary,
        bottlenecks: result.bottlenecks,
        recommendations: result.recommendations,
        estimatedCost: result.estimatedCost,
        analyzedAt: new Date(),
      })
    }

    return result
  }

  private validateRequest(request: AnalyzeExecutionPlanRequest): void {
    if (!request.planText || request.planText.trim().length === 0) {
      throw new Error('Execution plan text is required')
    }

    if (request.planText.length > 100000) {
      throw new Error('Execution plan exceeds maximum length of 100000 characters')
    }
  }

  private buildMessages(request: AnalyzeExecutionPlanRequest): ChatMessage[] {
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
      return `당신은 Oracle 데이터베이스 실행 계획 분석 전문가입니다.
실행 계획을 분석하여 병목 지점을 식별하고 최적화 방안을 제시합니다.
응답은 반드시 JSON 형식으로 제공해야 합니다.`
    }

    return `You are an Oracle database execution plan analysis expert.
You analyze execution plans to identify bottlenecks and suggest optimizations.
Your response must be in JSON format.`
  }

  private buildUserPrompt(request: AnalyzeExecutionPlanRequest, language: 'ko' | 'en'): string {
    let prompt = ''

    if (language === 'ko') {
      prompt = `## 실행 계획
\`\`\`
${request.planText}
\`\`\`
`
      if (request.sqlText) {
        prompt += `
## 원본 SQL
\`\`\`sql
${request.sqlText}
\`\`\`
`
      }

      prompt += `
## 요청
위 실행 계획을 분석하고 다음 JSON 형식으로 응답해주세요:
{
  "summary": "실행 계획 분석 요약 (2-3문장)",
  "estimatedCost": 예상 비용 (숫자),
  "bottlenecks": [
    {
      "operation": "작업 유형 (예: TABLE ACCESS FULL)",
      "objectName": "객체명 (테이블/인덱스)",
      "cost": 비용,
      "cardinality": 예상 행 수,
      "description": "병목 원인 설명",
      "suggestion": "개선 방안"
    }
  ],
  "recommendations": [
    {
      "id": "고유 ID",
      "type": "index/rewrite/hint/statistics/partition/other",
      "priority": 1-5,
      "title": "권장사항 제목",
      "description": "상세 설명",
      "implementation": "구현 방법",
      "expectedImprovement": "예상 개선 효과"
    }
  ]
}`
    } else {
      prompt = `## Execution Plan
\`\`\`
${request.planText}
\`\`\`
`
      if (request.sqlText) {
        prompt += `
## Original SQL
\`\`\`sql
${request.sqlText}
\`\`\`
`
      }

      prompt += `
## Request
Analyze the above execution plan and respond in the following JSON format:
{
  "summary": "Execution plan analysis summary",
  "estimatedCost": estimated cost (number),
  "bottlenecks": [...],
  "recommendations": [...]
}`
    }

    return prompt
  }

  private parseResponse(content: string): ParsedPlanAnalysis {
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
        summary: parsed.summary || 'Execution plan analyzed',
        estimatedCost: parsed.estimatedCost || 0,
        bottlenecks: (parsed.bottlenecks || []).map((b: any) => ({
          operation: b.operation || 'UNKNOWN',
          objectName: b.objectName,
          cost: b.cost || 0,
          cardinality: b.cardinality || 0,
          description: b.description || '',
          suggestion: b.suggestion || '',
        })),
        recommendations: (parsed.recommendations || []).map((rec: any, index: number) => ({
          id: rec.id || `rec-${index}`,
          type: rec.type || 'other',
          priority: rec.priority || index + 1,
          title: rec.title || 'Recommendation',
          description: rec.description || '',
          implementation: rec.implementation,
          expectedImprovement: rec.expectedImprovement,
        })),
      }
    } catch (error) {
      console.error('Failed to parse execution plan analysis:', error)
      return {
        summary: content.substring(0, 500),
        estimatedCost: 0,
        bottlenecks: [],
        recommendations: [],
      }
    }
  }
}

interface ParsedPlanAnalysis {
  summary: string
  estimatedCost: number
  bottlenecks: Bottleneck[]
  recommendations: Recommendation[]
}
