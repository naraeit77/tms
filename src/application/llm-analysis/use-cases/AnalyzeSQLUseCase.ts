/**
 * Application Layer - Analyze SQL Use Case
 * Core SQL analysis functionality using LLM
 */

import { v4 as uuidv4 } from 'uuid'
import type { ILLMAdapter } from '../ports/ILLMAdapter'
import type { ILLMAnalysisRepository, SQLAnalysis, PerformanceGrade } from '@/domain/llm-analysis'
import { PerformanceScore, type ChatMessage } from '@/domain/llm-analysis'
import type { AnalyzeSQLRequest, AnalyzeSQLResponse } from '../dto'

export class AnalyzeSQLUseCase {
  constructor(
    private readonly llmAdapter: ILLMAdapter,
    private readonly repository?: ILLMAnalysisRepository
  ) {}

  async execute(request: AnalyzeSQLRequest): Promise<AnalyzeSQLResponse> {
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
    const analysis = this.parseResponse(llmResponse.content, request)

    const processingTimeMs = Date.now() - startTime

    // Calculate performance score from metrics if available
    let performanceScore = analysis.performanceScore
    let performanceGrade: PerformanceGrade = analysis.performanceGrade

    if (request.metrics) {
      const score = PerformanceScore.fromMetrics(request.metrics)
      performanceScore = score.value
      performanceGrade = score.grade
    }

    const sqlAnalysis: SQLAnalysis = {
      id: uuidv4(),
      sqlId: request.sqlId || this.generateSqlId(request.sqlText),
      sqlText: request.sqlText,
      analysisType: request.context || 'tuning',
      summary: analysis.summary,
      issues: analysis.issues,
      recommendations: analysis.recommendations,
      indexSuggestions: analysis.indexSuggestions,
      rewriteSuggestions: analysis.rewriteSuggestions,
      performanceScore,
      performanceGrade,
      analyzedAt: new Date(),
      modelUsed: llmResponse.model,
      processingTimeMs,
    }

    // Save to repository if requested
    if (request.saveHistory && this.repository) {
      await this.repository.saveSQLAnalysis(sqlAnalysis)
    }

    return {
      id: sqlAnalysis.id,
      sqlId: sqlAnalysis.sqlId,
      summary: sqlAnalysis.summary,
      issues: sqlAnalysis.issues,
      recommendations: sqlAnalysis.recommendations,
      indexSuggestions: sqlAnalysis.indexSuggestions || [],
      rewriteSuggestions: sqlAnalysis.rewriteSuggestions || [],
      performanceScore: sqlAnalysis.performanceScore,
      performanceGrade: sqlAnalysis.performanceGrade,
      modelUsed: sqlAnalysis.modelUsed,
      processingTimeMs: sqlAnalysis.processingTimeMs,
      analyzedAt: sqlAnalysis.analyzedAt.toISOString(),
    }
  }

  private validateRequest(request: AnalyzeSQLRequest): void {
    if (!request.sqlText || request.sqlText.trim().length === 0) {
      throw new Error('SQL text is required')
    }

    if (request.sqlText.length > 50000) {
      throw new Error('SQL text exceeds maximum length of 50000 characters')
    }
  }

  private buildMessages(request: AnalyzeSQLRequest): ChatMessage[] {
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
      return `당신은 Oracle 데이터베이스 SQL 튜닝 전문가입니다.
SQL 쿼리를 분석하고 성능 개선을 위한 구체적인 권장사항을 제공합니다.
응답은 반드시 JSON 형식으로 제공해야 합니다.`
    }

    return `You are an Oracle database SQL tuning expert.
You analyze SQL queries and provide specific recommendations for performance improvement.
Your response must be in JSON format.`
  }

  private buildUserPrompt(request: AnalyzeSQLRequest, language: 'ko' | 'en'): string {
    const labels = language === 'ko'
      ? { sql: 'SQL 쿼리', plan: '실행 계획', metrics: '성능 메트릭', request: '요청' }
      : { sql: 'SQL Query', plan: 'Execution Plan', metrics: 'Performance Metrics', request: 'Request' }

    let prompt = `## ${labels.sql}
\`\`\`sql
${request.sqlText}
\`\`\`
`

    if (request.executionPlan) {
      prompt += `
## ${labels.plan}
\`\`\`
${request.executionPlan}
\`\`\`
`
    }

    if (request.metrics) {
      prompt += `
## ${labels.metrics}
- Elapsed Time: ${request.metrics.elapsedTimeMs}ms
- CPU Time: ${request.metrics.cpuTimeMs}ms
- Buffer Gets: ${request.metrics.bufferGets.toLocaleString()}
- Disk Reads: ${request.metrics.diskReads.toLocaleString()}
- Executions: ${request.metrics.executions.toLocaleString()}
${request.metrics.rowsProcessed !== undefined ? `- Rows Processed: ${request.metrics.rowsProcessed.toLocaleString()}` : ''}
`
    }

    if (language === 'ko') {
      prompt += `
## ${labels.request}
위 SQL을 분석하고 다음 JSON 형식으로 응답해주세요:
{
  "summary": "분석 요약 (2-3문장)",
  "performanceScore": 0-100 사이의 점수,
  "performanceGrade": "A/B/C/D/F",
  "issues": [
    {
      "id": "고유 ID",
      "type": "이슈 유형",
      "severity": "critical/high/medium/low/info",
      "title": "이슈 제목",
      "description": "상세 설명",
      "suggestion": "해결 방안"
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
  ],
  "indexSuggestions": [
    {
      "table": "테이블명",
      "columns": ["컬럼1", "컬럼2"],
      "type": "btree/bitmap/function/composite",
      "ddl": "CREATE INDEX ...",
      "reason": "생성 이유",
      "expectedImprovement": "예상 개선 효과"
    }
  ],
  "rewriteSuggestions": [
    {
      "original": "원본 SQL 일부",
      "optimized": "최적화된 SQL",
      "explanation": "변경 설명",
      "performanceGain": "예상 성능 향상"
    }
  ]
}`
    } else {
      prompt += `
## ${labels.request}
Analyze the above SQL and respond in the following JSON format:
{
  "summary": "Analysis summary (2-3 sentences)",
  "performanceScore": score between 0-100,
  "performanceGrade": "A/B/C/D/F",
  "issues": [...],
  "recommendations": [...],
  "indexSuggestions": [...],
  "rewriteSuggestions": [...]
}`
    }

    return prompt
  }

  private parseResponse(content: string, _request: AnalyzeSQLRequest): ParsedAnalysis {
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content]
      const jsonStr = jsonMatch[1] || content

      // Try to find JSON object in the string
      const jsonStart = jsonStr.indexOf('{')
      const jsonEnd = jsonStr.lastIndexOf('}')

      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error('No JSON object found in response')
      }

      const parsed = JSON.parse(jsonStr.substring(jsonStart, jsonEnd + 1))

      return {
        summary: parsed.summary || 'Analysis completed',
        performanceScore: parsed.performanceScore || 50,
        performanceGrade: parsed.performanceGrade || 'C',
        issues: (parsed.issues || []).map((issue: any, index: number) => ({
          id: issue.id || `issue-${index}`,
          type: issue.type || 'performance',
          severity: issue.severity || 'medium',
          title: issue.title || 'Issue detected',
          description: issue.description || '',
          location: issue.location,
          suggestion: issue.suggestion,
        })),
        recommendations: (parsed.recommendations || []).map((rec: any, index: number) => ({
          id: rec.id || `rec-${index}`,
          type: rec.type || 'other',
          priority: rec.priority || index + 1,
          title: rec.title || 'Recommendation',
          description: rec.description || '',
          implementation: rec.implementation,
          expectedImprovement: rec.expectedImprovement,
          risk: rec.risk,
        })),
        indexSuggestions: (parsed.indexSuggestions || []).map((idx: any) => ({
          table: idx.table || 'unknown',
          columns: idx.columns || [],
          type: idx.type || 'btree',
          ddl: idx.ddl || '',
          reason: idx.reason || '',
          expectedImprovement: idx.expectedImprovement || '',
        })),
        rewriteSuggestions: (parsed.rewriteSuggestions || []).map((rw: any) => ({
          original: rw.original || '',
          optimized: rw.optimized || '',
          explanation: rw.explanation || '',
          performanceGain: rw.performanceGain || '',
        })),
      }
    } catch (error) {
      // Return a basic analysis if parsing fails
      console.error('Failed to parse LLM response:', error)
      return {
        summary: content.substring(0, 500),
        performanceScore: 50,
        performanceGrade: 'C',
        issues: [],
        recommendations: [],
        indexSuggestions: [],
        rewriteSuggestions: [],
      }
    }
  }

  private generateSqlId(sqlText: string): string {
    // Generate a simple hash-based ID
    let hash = 0
    for (let i = 0; i < sqlText.length; i++) {
      const char = sqlText.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return `sql_${Math.abs(hash).toString(16)}`
  }
}

interface ParsedAnalysis {
  summary: string
  performanceScore: number
  performanceGrade: PerformanceGrade
  issues: any[]
  recommendations: any[]
  indexSuggestions: any[]
  rewriteSuggestions: any[]
}
