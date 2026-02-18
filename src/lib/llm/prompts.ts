/**
 * System Prompts for Oracle SQL Tuning Expert
 * Kanana 1.5 8B optimized prompts - 한국어 기반
 */

import type { AnalysisContext, SupportedLanguage, SQLMetrics } from './types'

/**
 * Base system prompt for Oracle SQL tuning expert
 * Kanana 1.5 8B는 한국어를 잘 지원하므로 한글 프롬프트 사용
 */
export const SYSTEM_PROMPT_KO = `당신은 Oracle 데이터베이스 SQL 튜닝 전문가입니다.

## 역할
- SQL 성능 분석 및 최적화 권장
- 실행계획 해석 및 문제점 진단
- 인덱스 설계 및 SQL 재작성 제안

## 응답 규칙
- 한국어로 명확하고 간결하게 답변
- 기술 용어는 영어 그대로 사용 (예: Full Table Scan, Buffer Gets)
- SQL 코드는 Oracle 문법 사용
- 구체적인 개선 효과 수치 제시`

export const SYSTEM_PROMPT_EN = `You are an Oracle database SQL tuning expert.

## Role
- SQL performance analysis and optimization recommendations
- Execution plan interpretation and problem diagnosis
- Index design and SQL rewrite suggestions

## Response Rules
- Clear and concise answers
- Use Oracle SQL syntax
- Provide specific improvement metrics`

/**
 * Context-specific prompts - 한글 기반
 */
export const CONTEXT_PROMPTS: Record<AnalysisContext, Record<SupportedLanguage, string>> = {
  tuning: {
    ko: `다음 SQL을 분석하고 성능 개선 방안을 제시해주세요.

## 응답 형식
### 1. 현재 문제점
- 성능 저하 원인 분석

### 2. 개선 방안
- 구체적인 해결책과 수정된 SQL

### 3. 예상 효과
- 개선 시 기대되는 성능 향상`,
    en: `Analyze the following SQL and suggest performance improvements.

## Response Format
### 1. Current Issues
### 2. Solutions (with SQL)
### 3. Expected Effect`,
  },
  explain: {
    ko: `다음 SQL과 실행계획을 분석하여 쉽게 설명해주세요.

## 응답 형식
### 1. SQL 목적
- 이 쿼리가 하는 일

### 2. 실행 흐름
- 데이터 접근 순서와 방식

### 3. 주요 비용 발생 구간
- 성능에 영향을 주는 부분`,
    en: `Explain the following SQL and execution plan simply.

## Response Format
### 1. Purpose
### 2. Execution Flow
### 3. High Cost Areas`,
  },
  index: {
    ko: `다음 SQL에 대한 인덱스 설계를 제안해주세요.

## 응답 형식
### 1. 현재 문제점
- 인덱스 미사용 또는 비효율적 사용 분석

### 2. 권장 인덱스
\`\`\`sql
CREATE INDEX 문장
\`\`\`

### 3. 예상 효과
- 인덱스 적용 시 개선 효과`,
    en: `Suggest index design for the following SQL.

## Response Format
### 1. Current Problem
### 2. Recommended Index (CREATE INDEX DDL)
### 3. Expected Effect`,
  },
  rewrite: {
    ko: `다음 SQL을 더 효율적으로 재작성해주세요.

## 응답 형식
### 1. 현재 문제점
- 비효율적인 구문 분석

### 2. 개선된 SQL
\`\`\`sql
재작성된 SQL
\`\`\`

### 3. 변경 이유
- 왜 이렇게 변경하면 좋은지 설명`,
    en: `Rewrite the following SQL more efficiently.

## Response Format
### 1. Current Issue
### 2. Improved SQL
### 3. Why This Change`,
  },
}

/**
 * Format SQL metrics for prompt - 한글 기반
 */
export function formatMetricsForPrompt(metrics: SQLMetrics, lang: SupportedLanguage = 'ko'): string {
  const avg = metrics.executions > 0 ? {
    elapsed: (metrics.elapsed_time_ms / metrics.executions).toFixed(1),
    buffer: Math.round(metrics.buffer_gets / metrics.executions),
  } : { elapsed: '0', buffer: 0 }

  if (lang === 'ko') {
    return `## 성능 메트릭
- 총 실행 횟수: ${metrics.executions.toLocaleString()}회
- 총 경과 시간: ${metrics.elapsed_time_ms.toLocaleString()}ms (평균: ${avg.elapsed}ms)
- 총 CPU 시간: ${metrics.cpu_time_ms.toLocaleString()}ms
- Buffer Gets: ${metrics.buffer_gets.toLocaleString()} (평균: ${avg.buffer})
- Disk Reads: ${metrics.disk_reads.toLocaleString()}`
  }

  return `## Performance Metrics
- Executions: ${metrics.executions.toLocaleString()}
- Elapsed Time: ${metrics.elapsed_time_ms.toLocaleString()}ms (avg: ${avg.elapsed}ms)
- CPU Time: ${metrics.cpu_time_ms.toLocaleString()}ms
- Buffer Gets: ${metrics.buffer_gets.toLocaleString()} (avg: ${avg.buffer})
- Disk Reads: ${metrics.disk_reads.toLocaleString()}`
}

/**
 * Build complete prompt for analysis - 한글 기반
 */
export function buildAnalysisPrompt(params: {
  sqlText: string
  executionPlan?: string
  metrics?: SQLMetrics
  context: AnalysisContext
  language: SupportedLanguage
}): string {
  const { sqlText, executionPlan, metrics, context, language } = params
  const isKorean = language === 'ko'

  let prompt = CONTEXT_PROMPTS[context][language]

  // SQL 섹션
  prompt += isKorean
    ? '\n\n## 분석 대상 SQL\n```sql\n' + sqlText + '\n```'
    : '\n\n## Target SQL\n```sql\n' + sqlText + '\n```'

  // 실행계획 섹션
  if (executionPlan) {
    prompt += isKorean
      ? '\n\n## 실행계획\n```\n' + executionPlan + '\n```'
      : '\n\n## Execution Plan\n```\n' + executionPlan + '\n```'
  }

  // 성능 메트릭 섹션
  if (metrics && metrics.executions > 0) {
    prompt += '\n\n' + formatMetricsForPrompt(metrics, language)
  }

  return prompt
}

/**
 * Get system prompt by language
 */
export function getSystemPrompt(language: SupportedLanguage = 'ko'): string {
  return language === 'ko' ? SYSTEM_PROMPT_KO : SYSTEM_PROMPT_EN
}

/**
 * Quick analysis prompt templates
 */
export const QUICK_PROMPTS = {
  ko: {
    fullTableScan: '이 SQL에서 Full Table Scan이 발생하는 이유와 해결 방법을 알려주세요.',
    slowQuery: '이 쿼리가 느린 이유를 분석하고 개선 방법을 제안해주세요.',
    indexUsage: '이 SQL에서 인덱스가 제대로 활용되고 있는지 확인해주세요.',
    joinOptimization: '조인 순서와 방식을 최적화할 수 있는 방법을 알려주세요.',
    subqueryToJoin: '이 서브쿼리를 조인으로 변환할 수 있는지 확인해주세요.',
  },
  en: {
    fullTableScan: 'Explain why a Full Table Scan is occurring in this SQL and how to resolve it.',
    slowQuery: 'Analyze why this query is slow and suggest improvements.',
    indexUsage: 'Check if indexes are being properly utilized in this SQL.',
    joinOptimization: 'Suggest ways to optimize the join order and method.',
    subqueryToJoin: 'Check if this subquery can be converted to a join.',
  },
} as const
