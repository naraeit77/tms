/**
 * Presentation Layer - Pattern Detection Hook
 * React hook for SQL pattern detection using LLM
 */

'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { DetectPatternsRequest, DetectPatternsResponse } from '@/application/llm-analysis'

export function usePatternDetection() {
  const queryClient = useQueryClient()

  return useMutation<DetectPatternsResponse, Error, DetectPatternsRequest>({
    mutationFn: async (request) => {
      const response = await fetch('/api/llm/analysis/patterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error?.message || 'Pattern detection failed')
      }

      const result = await response.json()
      return result.data as DetectPatternsResponse
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pattern-detection'] })
    },
  })
}
