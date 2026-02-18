/**
 * LLM SQL Analysis API (Non-streaming)
 * POST /api/llm/analyze
 *
 * Performs SQL analysis using LLM and returns complete response
 * Use /api/llm/stream for streaming responses
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  createClient,
  isLLMEnabled,
  getSystemPrompt,
  buildAnalysisPrompt,
  type ChatMessage,
  type AnalysisContext,
  type SupportedLanguage,
  type SQLMetrics,
} from '@/lib/llm'

export const dynamic = 'force-dynamic'
export const maxDuration = 120 // 2 minutes max

interface AnalyzeRequest {
  sql_text: string
  execution_plan?: string
  metrics?: SQLMetrics
  context?: AnalysisContext
  language?: SupportedLanguage
  custom_prompt?: string
}

/**
 * Validate request body
 */
function validateRequest(body: unknown): { valid: boolean; errors: string[]; data?: AnalyzeRequest } {
  const errors: string[] = []

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body must be an object'] }
  }

  const data = body as Record<string, unknown>

  // sql_text is required unless custom_prompt is provided
  if (!data.sql_text && !data.custom_prompt) {
    errors.push('sql_text or custom_prompt is required')
  }

  if (data.sql_text && typeof data.sql_text !== 'string') {
    errors.push('sql_text must be a string')
  }

  if (data.execution_plan && typeof data.execution_plan !== 'string') {
    errors.push('execution_plan must be a string')
  }

  if (data.context && !['tuning', 'explain', 'index', 'rewrite'].includes(data.context as string)) {
    errors.push('context must be one of: tuning, explain, index, rewrite')
  }

  if (data.language && !['ko', 'en'].includes(data.language as string)) {
    errors.push('language must be one of: ko, en')
  }

  if (data.metrics && typeof data.metrics !== 'object') {
    errors.push('metrics must be an object')
  }

  if (errors.length > 0) {
    return { valid: false, errors }
  }

  return {
    valid: true,
    errors: [],
    data: {
      sql_text: data.sql_text as string,
      execution_plan: data.execution_plan as string | undefined,
      metrics: data.metrics as SQLMetrics | undefined,
      context: (data.context as AnalysisContext) || 'tuning',
      language: (data.language as SupportedLanguage) || 'ko',
      custom_prompt: data.custom_prompt as string | undefined,
    },
  }
}

export async function POST(request: NextRequest) {
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
            fallbackAvailable: true,
          },
        },
        { status: 503 }
      )
    }

    // Parse and validate request body
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Invalid JSON body',
          },
        },
        { status: 400 }
      )
    }

    const validation = validateRequest(body)
    if (!validation.valid || !validation.data) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Validation failed',
            details: validation.errors.join(', '),
          },
        },
        { status: 400 }
      )
    }

    const { sql_text, execution_plan, metrics, context, language, custom_prompt } = validation.data

    // Build messages
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: getSystemPrompt(language),
      },
      {
        role: 'user',
        content: custom_prompt || buildAnalysisPrompt({
          sqlText: sql_text,
          executionPlan: execution_plan,
          metrics,
          context: context!,
          language: language!,
        }),
      },
    ]

    // Create client and get response
    const client = createClient()
    const startTime = Date.now()

    try {
      const response = await client.chat(messages)
      const duration = Date.now() - startTime

      return NextResponse.json({
        success: true,
        data: {
          content: response,
          context,
          language,
          sql_id: sql_text.substring(0, 50), // First 50 chars as identifier
        },
        meta: {
          duration_ms: duration,
          timestamp: new Date().toISOString(),
          model: client.getConfig().modelName,
        },
      })
    } catch (llmError) {
      console.error('LLM analysis error:', llmError)
      const errorMessage = llmError instanceof Error ? llmError.message : 'Unknown LLM error'

      // Determine error code
      let errorCode: string = 'UNKNOWN_ERROR'
      if (errorMessage.includes('timeout') || errorMessage.includes('AbortError')) {
        errorCode = 'LLM_TIMEOUT'
      } else if (errorMessage.includes('unavailable') || errorMessage.includes('fetch')) {
        errorCode = 'LLM_UNAVAILABLE'
      } else if (errorMessage.includes('rate') || errorMessage.includes('429')) {
        errorCode = 'LLM_RATE_LIMIT'
      }

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
  } catch (error) {
    console.error('LLM analyze error:', error)
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
