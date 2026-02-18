/**
 * Presentation Layer - LLM Health Hook
 * React hook for monitoring LLM service health
 * Uses existing /api/llm/health endpoint from ai-tuning-guide
 */

'use client'

import { useQuery } from '@tanstack/react-query'

export interface LLMHealthData {
  healthy: boolean
  model: string
  latencyMs: number
  error?: string
  timestamp: string
  config?: {
    enabled: boolean
    apiType?: string
    baseUrl?: string
    modelName?: string
  }
}

// API response format from /api/llm/health
interface LLMHealthApiResponse {
  success: boolean
  data?: {
    healthy: boolean
    model: string
    latency: number
    timestamp: string
  }
  error?: {
    code: string
    message: string
    fallbackAvailable?: boolean
  }
  config?: {
    enabled: boolean
    apiType?: string
    baseUrl?: string
    modelName?: string
  }
}

export function useLLMHealth(options?: { enabled?: boolean; refetchInterval?: number }) {
  return useQuery<LLMHealthData>({
    queryKey: ['llm-health'],
    queryFn: async () => {
      const response = await fetch('/api/llm/health')
      const data: LLMHealthApiResponse = await response.json()

      // Handle disabled feature or error states
      if (!data.success) {
        return {
          healthy: false,
          model: data.config?.modelName || 'unknown',
          latencyMs: 0,
          error: data.error?.message || 'LLM service unavailable',
          timestamp: new Date().toISOString(),
          config: data.config,
        }
      }

      // Transform successful response
      return {
        healthy: data.data?.healthy ?? false,
        model: data.data?.model || data.config?.modelName || 'unknown',
        latencyMs: data.data?.latency ?? 0,
        timestamp: data.data?.timestamp || new Date().toISOString(),
        config: data.config,
      }
    },
    enabled: options?.enabled !== false,
    refetchInterval: options?.refetchInterval ?? 30000, // 30 seconds
    staleTime: 10000, // 10 seconds
    retry: false, // Don't retry health checks
  })
}
