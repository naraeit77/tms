/**
 * Presentation Layer - Execution Plan Analysis Hook
 * React hook for execution plan analysis using LLM
 */

'use client'

import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { AnalyzeExecutionPlanRequest, AnalyzeExecutionPlanResponse } from '@/application/llm-analysis'

export function useExecutionPlanAnalysis() {
  const queryClient = useQueryClient()

  return useMutation<AnalyzeExecutionPlanResponse, Error, AnalyzeExecutionPlanRequest>({
    mutationFn: async (request) => {
      const response = await fetch('/api/llm/analysis/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error?.message || 'Execution plan analysis failed')
      }

      const result = await response.json()
      return result.data as AnalyzeExecutionPlanResponse
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['execution-plan-analysis'] })
    },
  })
}

/**
 * Hook for streaming execution plan analysis
 */
export function useExecutionPlanAnalysisStream() {
  const [content, setContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const analyze = useCallback(async (request: AnalyzeExecutionPlanRequest) => {
    setIsStreaming(true)
    setContent('')
    setError(null)

    try {
      const response = await fetch('/api/llm/stream/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || 'Streaming analysis failed')
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        setContent(prev => prev + chunk)
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'))
    } finally {
      setIsStreaming(false)
    }
  }, [])

  const reset = useCallback(() => {
    setContent('')
    setError(null)
  }, [])

  return {
    content,
    isStreaming,
    error,
    analyze,
    reset,
  }
}
