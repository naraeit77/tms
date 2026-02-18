/**
 * LLM SQL Optimization API
 * POST /api/llm/analysis/optimize
 *
 * Clean Architecture integration - routes request to Application Layer Use Case
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { GenerateOptimizationUseCase, type GenerateOptimizationRequest } from '@/application/llm-analysis'
import { createLLMAdapter } from '@/infrastructure/llm'
import { isLLMEnabled } from '@/lib/llm'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    // Feature flag check
    if (!isLLMEnabled()) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FEATURE_DISABLED',
            message: 'AI analysis feature is disabled',
            fallbackAvailable: true,
          },
        },
        { status: 503 }
      )
    }

    // Parse request body
    let body: GenerateOptimizationRequest
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'Invalid JSON body' } },
        { status: 400 }
      )
    }

    // Validate required fields
    if (!body.sqlText) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'sqlText is required' } },
        { status: 400 }
      )
    }

    // Execute Use Case
    const adapter = createLLMAdapter()
    const useCase = new GenerateOptimizationUseCase(adapter)

    const startTime = Date.now()
    const result = await useCase.execute({
      sqlText: body.sqlText,
      sqlId: body.sqlId,
      executionPlan: body.executionPlan,
      metrics: body.metrics,
      targetImprovement: body.targetImprovement || 'both',
      language: body.language || 'ko',
    })
    const duration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      data: result,
      meta: {
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('LLM SQL optimization error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    let errorCode = 'UNKNOWN_ERROR'
    if (errorMessage.includes('timeout')) errorCode = 'LLM_TIMEOUT'
    else if (errorMessage.includes('unavailable')) errorCode = 'LLM_UNAVAILABLE'
    else if (errorMessage.includes('rate')) errorCode = 'LLM_RATE_LIMIT'

    return NextResponse.json(
      {
        success: false,
        error: {
          code: errorCode,
          message: errorMessage,
          fallbackAvailable: true,
        },
      },
      { status: 503 }
    )
  }
}
