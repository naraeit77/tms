/**
 * Application Layer - Compare Performance Use Case
 * Performance comparison between two SQL queries using LLM
 */

import { v4 as uuidv4 } from 'uuid'
import type { ILLMAdapter } from '../ports/ILLMAdapter'
import type { ILLMAnalysisRepository } from '@/domain/llm-analysis'
import type { ChatMessage } from '@/domain/llm-analysis'
import type { ComparePerformanceRequest, ComparePerformanceResponse, MetricComparison } from '../dto'

export class ComparePerformanceUseCase {
  constructor(
    private readonly llmAdapter: ILLMAdapter,
    private readonly repository?: ILLMAnalysisRepository
  ) {}

  async execute(request: ComparePerformanceRequest): Promise<ComparePerformanceResponse> {
    const startTime = Date.now()

    // Validate request
    this.validateRequest(request)

    // Calculate metric comparisons
    const metricsComparison = this.calculateMetricComparisons(request)

    // Build prompt for LLM analysis
    const messages = this.buildMessages(request, metricsComparison)

    // Call LLM
    const llmResponse = await this.llmAdapter.chat(messages, {
      maxTokens: 2048,
      temperature: 0.1,
    })

    // Parse response
    const analysis = this.parseResponse(llmResponse.content, metricsComparison)

    const processingTimeMs = Date.now() - startTime

    const result: ComparePerformanceResponse = {
      id: uuidv4(),
      winner: analysis.winner,
      summary: analysis.summary,
      metricsComparison,
      keyDifferences: analysis.keyDifferences,
      recommendations: analysis.recommendations,
      modelUsed: llmResponse.model,
      processingTimeMs,
      analyzedAt: new Date().toISOString(),
    }

    // Save to repository if requested
    if (request.saveHistory && this.repository) {
      await this.repository.savePerformanceComparison({
        id: result.id,
        sqlIdA: request.sqlA.sqlId,
        sqlIdB: request.sqlB.sqlId,
        metricsA: request.sqlA.metrics,
        metricsB: request.sqlB.metrics,
        analysis: result.summary,
        winner: result.winner,
        improvements: result.recommendations,
        analyzedAt: new Date(),
      })
    }

    return result
  }

  private validateRequest(request: ComparePerformanceRequest): void {
    if (!request.sqlA.sqlText || !request.sqlB.sqlText) {
      throw new Error('Both SQL texts are required')
    }

    if (!request.sqlA.metrics || !request.sqlB.metrics) {
      throw new Error('Performance metrics are required for both SQLs')
    }
  }

  private calculateMetricComparisons(request: ComparePerformanceRequest): MetricComparison[] {
    const comparisons: MetricComparison[] = []
    const { metrics: metricsA } = request.sqlA
    const { metrics: metricsB } = request.sqlB

    // Elapsed Time
    comparisons.push(this.compareMetric('Elapsed Time (ms)', metricsA.elapsedTimeMs, metricsB.elapsedTimeMs, true))

    // CPU Time
    comparisons.push(this.compareMetric('CPU Time (ms)', metricsA.cpuTimeMs, metricsB.cpuTimeMs, true))

    // Buffer Gets
    comparisons.push(this.compareMetric('Buffer Gets', metricsA.bufferGets, metricsB.bufferGets, true))

    // Disk Reads
    comparisons.push(this.compareMetric('Disk Reads', metricsA.diskReads, metricsB.diskReads, true))

    // Executions
    comparisons.push(this.compareMetric('Executions', metricsA.executions, metricsB.executions, false))

    // Per-execution metrics
    if (metricsA.executions > 0 && metricsB.executions > 0) {
      const avgTimeA = metricsA.elapsedTimeMs / metricsA.executions
      const avgTimeB = metricsB.elapsedTimeMs / metricsB.executions
      comparisons.push(this.compareMetric('Avg Time per Exec (ms)', avgTimeA, avgTimeB, true))

      const avgGetsA = metricsA.bufferGets / metricsA.executions
      const avgGetsB = metricsB.bufferGets / metricsB.executions
      comparisons.push(this.compareMetric('Avg Buffer Gets per Exec', avgGetsA, avgGetsB, true))
    }

    // Rows processed if available
    if (metricsA.rowsProcessed !== undefined && metricsB.rowsProcessed !== undefined) {
      comparisons.push(this.compareMetric('Rows Processed', metricsA.rowsProcessed, metricsB.rowsProcessed, false))
    }

    return comparisons
  }

  private compareMetric(
    metric: string,
    valueA: number,
    valueB: number,
    lowerIsBetter: boolean
  ): MetricComparison {
    const difference = valueA - valueB
    const differencePercent = valueB !== 0 ? ((valueA - valueB) / valueB) * 100 : (valueA > 0 ? 100 : 0)

    let winner: 'A' | 'B' | 'tie'
    if (Math.abs(differencePercent) < 5) {
      winner = 'tie'
    } else if (lowerIsBetter) {
      winner = valueA < valueB ? 'A' : 'B'
    } else {
      winner = valueA > valueB ? 'A' : 'B'
    }

    return {
      metric,
      valueA,
      valueB,
      winner,
      difference,
      differencePercent: Math.round(differencePercent * 100) / 100,
    }
  }

  private buildMessages(request: ComparePerformanceRequest, metrics: MetricComparison[]): ChatMessage[] {
    const language = request.language || 'ko'
    const systemPrompt = this.getSystemPrompt(language)
    const userPrompt = this.buildUserPrompt(request, metrics, language)

    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]
  }

  private getSystemPrompt(language: 'ko' | 'en'): string {
    if (language === 'ko') {
      return `당신은 Oracle SQL 성능 분석 전문가입니다.
두 SQL 쿼리의 성능을 비교 분석하고 인사이트를 제공합니다.
응답은 반드시 JSON 형식으로 제공해야 합니다.`
    }

    return `You are an Oracle SQL performance analysis expert.
You compare and analyze the performance of two SQL queries and provide insights.
Your response must be in JSON format.`
  }

  private buildUserPrompt(
    request: ComparePerformanceRequest,
    metrics: MetricComparison[],
    language: 'ko' | 'en'
  ): string {
    if (language === 'ko') {
      return `## SQL A (${request.sqlA.sqlId})
\`\`\`sql
${request.sqlA.sqlText.substring(0, 2000)}
\`\`\`

## SQL B (${request.sqlB.sqlId})
\`\`\`sql
${request.sqlB.sqlText.substring(0, 2000)}
\`\`\`

## 성능 메트릭 비교
${metrics.map(m => `- ${m.metric}: A=${m.valueA.toLocaleString()}, B=${m.valueB.toLocaleString()}, 승자=${m.winner}, 차이=${m.differencePercent}%`).join('\n')}

## 요청
위 두 SQL의 성능을 비교 분석하고 다음 JSON 형식으로 응답해주세요:
{
  "winner": "A/B/tie",
  "summary": "종합 분석 요약 (2-3문장)",
  "keyDifferences": [
    "주요 차이점 1",
    "주요 차이점 2"
  ],
  "recommendations": [
    "개선 권장사항 1",
    "개선 권장사항 2"
  ]
}

분석 시 고려사항:
- SQL 구조의 차이점
- 성능 메트릭 차이의 원인
- 어느 SQL이 더 효율적인지와 그 이유`
    }

    return `## SQL A (${request.sqlA.sqlId})
\`\`\`sql
${request.sqlA.sqlText.substring(0, 2000)}
\`\`\`

## SQL B (${request.sqlB.sqlId})
\`\`\`sql
${request.sqlB.sqlText.substring(0, 2000)}
\`\`\`

## Performance Metrics Comparison
${metrics.map(m => `- ${m.metric}: A=${m.valueA.toLocaleString()}, B=${m.valueB.toLocaleString()}, winner=${m.winner}, diff=${m.differencePercent}%`).join('\n')}

## Request
Compare the performance of the two SQLs and respond in JSON format:
{
  "winner": "A/B/tie",
  "summary": "Overall analysis summary",
  "keyDifferences": [...],
  "recommendations": [...]
}`
  }

  private parseResponse(content: string, metrics: MetricComparison[]): ParsedComparison {
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
        winner: parsed.winner || this.determineOverallWinner(metrics),
        summary: parsed.summary || 'Performance comparison completed',
        keyDifferences: parsed.keyDifferences || [],
        recommendations: parsed.recommendations || [],
      }
    } catch (error) {
      console.error('Failed to parse comparison response:', error)
      return {
        winner: this.determineOverallWinner(metrics),
        summary: content.substring(0, 500),
        keyDifferences: [],
        recommendations: [],
      }
    }
  }

  private determineOverallWinner(metrics: MetricComparison[]): 'A' | 'B' | 'tie' {
    let scoreA = 0
    let scoreB = 0

    // Weight important metrics more heavily
    const weights: Record<string, number> = {
      'Avg Time per Exec (ms)': 3,
      'Avg Buffer Gets per Exec': 2,
      'Elapsed Time (ms)': 2,
      'CPU Time (ms)': 1,
      'Buffer Gets': 1,
      'Disk Reads': 1,
    }

    for (const metric of metrics) {
      const weight = weights[metric.metric] || 1
      if (metric.winner === 'A') scoreA += weight
      else if (metric.winner === 'B') scoreB += weight
    }

    if (Math.abs(scoreA - scoreB) <= 1) return 'tie'
    return scoreA > scoreB ? 'A' : 'B'
  }
}

interface ParsedComparison {
  winner: 'A' | 'B' | 'tie'
  summary: string
  keyDifferences: string[]
  recommendations: string[]
}
