/**
 * LLM Health Check API
 * GET /api/llm/health
 *
 * Checks if the LLM server is available and responding
 */

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { healthCheck, isLLMEnabled, getLLMConfig } from '@/lib/llm'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if LLM feature is enabled
    if (!isLLMEnabled()) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FEATURE_DISABLED',
            message: 'AI Tuning Guide feature is disabled',
          },
          config: {
            enabled: false,
          },
        },
        { status: 503 }
      )
    }

    // Perform health check
    const health = await healthCheck()
    const config = getLLMConfig()

    if (health.healthy) {
      return NextResponse.json({
        success: true,
        data: {
          healthy: true,
          model: health.model,
          latency: health.latency,
          timestamp: health.timestamp,
        },
        config: {
          enabled: true,
          apiType: config.apiType,
          baseUrl: config.baseUrl,
          modelName: config.modelName,
        },
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'LLM_UNAVAILABLE',
            message: health.error || 'LLM server is not responding',
            fallbackAvailable: true,
          },
          data: {
            healthy: false,
            model: health.model,
            latency: health.latency,
            timestamp: health.timestamp,
          },
          config: {
            enabled: true,
            apiType: config.apiType,
            baseUrl: config.baseUrl,
            modelName: config.modelName,
          },
        },
        { status: 503 }
      )
    }
  } catch (error) {
    console.error('LLM health check error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: errorMessage,
          fallbackAvailable: true,
        },
      },
      { status: 500 }
    )
  }
}
