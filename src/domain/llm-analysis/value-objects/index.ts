/**
 * Domain Layer - Value Objects
 * Immutable domain value objects
 */

import type { PerformanceGrade, SQLMetrics } from '../entities'

/**
 * Performance Score Value Object
 * Encapsulates performance scoring logic
 */
export class PerformanceScore {
  private constructor(
    public readonly value: number,
    public readonly grade: PerformanceGrade,
    public readonly factors: ScoreFactor[]
  ) {}

  static create(value: number, factors: ScoreFactor[] = []): PerformanceScore {
    if (value < 0 || value > 100) {
      throw new Error('Score must be between 0 and 100')
    }
    return new PerformanceScore(value, this.calculateGrade(value), factors)
  }

  static fromMetrics(metrics: SQLMetrics): PerformanceScore {
    const factors: ScoreFactor[] = []
    let totalScore = 100

    // Elapsed time scoring (weight: 30%)
    const elapsedScore = this.scoreElapsedTime(metrics.elapsedTimeMs)
    factors.push({ name: 'elapsed_time', score: elapsedScore, weight: 0.3 })
    totalScore -= (100 - elapsedScore) * 0.3

    // Buffer gets scoring (weight: 25%)
    const bufferScore = this.scoreBufferGets(metrics.bufferGets, metrics.executions)
    factors.push({ name: 'buffer_gets', score: bufferScore, weight: 0.25 })
    totalScore -= (100 - bufferScore) * 0.25

    // CPU time scoring (weight: 20%)
    const cpuScore = this.scoreCpuTime(metrics.cpuTimeMs, metrics.elapsedTimeMs)
    factors.push({ name: 'cpu_time', score: cpuScore, weight: 0.2 })
    totalScore -= (100 - cpuScore) * 0.2

    // Disk reads scoring (weight: 15%)
    const diskScore = this.scoreDiskReads(metrics.diskReads, metrics.bufferGets)
    factors.push({ name: 'disk_reads', score: diskScore, weight: 0.15 })
    totalScore -= (100 - diskScore) * 0.15

    // Rows per execution scoring (weight: 10%)
    if (metrics.rowsProcessed !== undefined && metrics.executions > 0) {
      const rowsScore = this.scoreRowsPerExec(metrics.rowsProcessed / metrics.executions)
      factors.push({ name: 'rows_per_exec', score: rowsScore, weight: 0.1 })
      totalScore -= (100 - rowsScore) * 0.1
    }

    const finalScore = Math.max(0, Math.min(100, Math.round(totalScore)))
    return new PerformanceScore(finalScore, this.calculateGrade(finalScore), factors)
  }

  private static calculateGrade(score: number): PerformanceGrade {
    if (score >= 90) return 'A'
    if (score >= 75) return 'B'
    if (score >= 60) return 'C'
    if (score >= 40) return 'D'
    return 'F'
  }

  private static scoreElapsedTime(ms: number): number {
    if (ms <= 10) return 100
    if (ms <= 100) return 90
    if (ms <= 500) return 75
    if (ms <= 1000) return 60
    if (ms <= 5000) return 40
    return 20
  }

  private static scoreBufferGets(gets: number, executions: number): number {
    const getsPerExec = executions > 0 ? gets / executions : gets
    if (getsPerExec <= 100) return 100
    if (getsPerExec <= 1000) return 85
    if (getsPerExec <= 10000) return 70
    if (getsPerExec <= 100000) return 50
    return 25
  }

  private static scoreCpuTime(cpuMs: number, elapsedMs: number): number {
    if (elapsedMs === 0) return 100
    const ratio = cpuMs / elapsedMs
    if (ratio >= 0.9) return 100  // CPU bound is good
    if (ratio >= 0.7) return 85
    if (ratio >= 0.5) return 70
    if (ratio >= 0.3) return 50
    return 30  // Too much wait time
  }

  private static scoreDiskReads(reads: number, bufferGets: number): number {
    if (bufferGets === 0) return 100
    const ratio = reads / bufferGets
    if (ratio <= 0.01) return 100  // Excellent cache hit
    if (ratio <= 0.05) return 85
    if (ratio <= 0.1) return 70
    if (ratio <= 0.2) return 50
    return 30
  }

  private static scoreRowsPerExec(rowsPerExec: number): number {
    if (rowsPerExec <= 10) return 100
    if (rowsPerExec <= 100) return 90
    if (rowsPerExec <= 1000) return 75
    if (rowsPerExec <= 10000) return 60
    return 40
  }

  isGood(): boolean {
    return this.value >= 75
  }

  needsOptimization(): boolean {
    return this.value < 60
  }

  getWorstFactor(): ScoreFactor | undefined {
    return this.factors.reduce((worst, current) =>
      current.score < (worst?.score ?? 100) ? current : worst
    , undefined as ScoreFactor | undefined)
  }
}

/**
 * Score Factor Value Object
 */
export interface ScoreFactor {
  name: string
  score: number
  weight: number
  details?: string
}

/**
 * Analysis Context Value Object
 */
export class AnalysisContext {
  private constructor(
    public readonly type: AnalysisContextType,
    public readonly language: SupportedLanguage,
    public readonly options: AnalysisOptions
  ) {}

  static create(
    type: AnalysisContextType,
    language: SupportedLanguage = 'ko',
    options: Partial<AnalysisOptions> = {}
  ): AnalysisContext {
    return new AnalysisContext(type, language, {
      includeIndexSuggestions: options.includeIndexSuggestions ?? true,
      includeRewriteSuggestions: options.includeRewriteSuggestions ?? true,
      maxSuggestions: options.maxSuggestions ?? 5,
      detailLevel: options.detailLevel ?? 'standard',
    })
  }

  withLanguage(language: SupportedLanguage): AnalysisContext {
    return new AnalysisContext(this.type, language, this.options)
  }

  withOptions(options: Partial<AnalysisOptions>): AnalysisContext {
    return new AnalysisContext(this.type, this.language, {
      ...this.options,
      ...options,
    })
  }
}

export type AnalysisContextType = 'tuning' | 'explain' | 'index' | 'rewrite' | 'pattern' | 'comparison'
export type SupportedLanguage = 'ko' | 'en'

export interface AnalysisOptions {
  includeIndexSuggestions: boolean
  includeRewriteSuggestions: boolean
  maxSuggestions: number
  detailLevel: 'brief' | 'standard' | 'detailed'
}

/**
 * LLM Request Value Object
 */
export interface LLMRequest {
  messages: ChatMessage[]
  maxTokens?: number
  temperature?: number
  stream?: boolean
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * LLM Response Value Object
 */
export interface LLMResponse {
  content: string
  model: string
  tokensUsed?: number
  processingTimeMs: number
}
