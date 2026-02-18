/**
 * @deprecated This LLM-based SmartSearch API is deprecated.
 *
 * The frontend now uses the rule-based SmartSearch implementation directly
 * without API calls:
 * - Hook: @/presentation/analysis/hooks/useRuleBasedSearch
 * - Use Case: @/application/smart-search/RuleBasedSmartSearchUseCase
 *
 * This endpoint is kept for backward compatibility but should not be used
 * for new features. The rule-based implementation is synchronous and
 * doesn't require API calls.
 *
 * Original: LLM Smart Search API
 * POST /api/llm/analysis/search
 *
 * Clean Architecture integration - routes request to Application Layer Use Case
 * Converts natural language queries into SQL search filters
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SmartSearchUseCase, type SmartSearchRequest } from '@/application/llm-analysis'
import { createLLMAdapter } from '@/infrastructure/llm'
import { isLLMEnabled } from '@/lib/llm'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
    let body: SmartSearchRequest
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'Invalid JSON body' } },
        { status: 400 }
      )
    }

    // Validate required fields
    if (!body.query) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'query is required' } },
        { status: 400 }
      )
    }

    // Execute Use Case
    const adapter = createLLMAdapter()
    const useCase = new SmartSearchUseCase(adapter)

    const startTime = Date.now()
    const result = await useCase.execute({
      query: body.query,
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
    console.error('LLM smart search error:', error)
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
