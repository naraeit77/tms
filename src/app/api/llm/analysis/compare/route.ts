/**
 * LLM Performance Comparison API
 * POST /api/llm/analysis/compare
 *
 * Clean Architecture integration - routes request to Application Layer Use Case
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ComparePerformanceUseCase, type ComparePerformanceRequest } from '@/application/llm-analysis'
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
    let body: ComparePerformanceRequest
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'Invalid JSON body' } },
        { status: 400 }
      )
    }

    // Validate required fields
    if (!body.sqlA?.sqlText || !body.sqlB?.sqlText) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'Both sqlA and sqlB with sqlText are required' } },
        { status: 400 }
      )
    }

    // Execute Use Case
    const adapter = createLLMAdapter()
    const useCase = new ComparePerformanceUseCase(adapter)

    const startTime = Date.now()
    const result = await useCase.execute({
      sqlA: body.sqlA,
      sqlB: body.sqlB,
      language: body.language || 'ko',
      saveHistory: body.saveHistory,
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
    console.error('LLM performance comparison error:', error)
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
