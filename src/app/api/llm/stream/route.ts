/**
 * LLM Streaming Chat API
 * POST /api/llm/stream
 *
 * Server-Sent Events (SSE) endpoint for streaming LLM responses
 */

import { NextRequest } from 'next/server'
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
export const maxDuration = 60 // 1 minute max for streaming (optimized for small models)
export const runtime = 'nodejs' // Use Node.js runtime for better body handling

interface StreamRequest {
  sql_text: string
  execution_plan?: string
  metrics?: SQLMetrics
  context?: AnalysisContext
  language?: SupportedLanguage
  custom_prompt?: string
  follow_up?: boolean
  conversation_history?: ChatMessage[]
  user_question?: string
}

/**
 * Validate request body
 */
function validateRequest(body: unknown): { valid: boolean; errors: string[]; data?: StreamRequest } {
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

  if (data.follow_up && typeof data.follow_up !== 'boolean') {
    errors.push('follow_up must be a boolean')
  }

  if (data.conversation_history && !Array.isArray(data.conversation_history)) {
    errors.push('conversation_history must be an array')
  }

  if (data.user_question && typeof data.user_question !== 'string') {
    errors.push('user_question must be a string')
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
      follow_up: data.follow_up as boolean | undefined,
      conversation_history: data.conversation_history as ChatMessage[] | undefined,
      user_question: data.user_question as string | undefined,
    },
  }
}

export async function POST(request: NextRequest) {
  console.log('[LLM Stream] Request received')
  const startTime = Date.now()

  // Create encoder for streaming
  const encoder = new TextEncoder()

  // Helper function to create SSE message
  const createSSEMessage = (data: object) => {
    return encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
  }

  try {
    // Parse request body
    let body: unknown
    try {
      const text = await request.text()
      if (!text) {
        console.error('[LLM Stream] Empty body text received')
        return new Response(
          JSON.stringify({ error: 'Empty request body' }),
          { status: 400 }
        )
      }
      body = JSON.parse(text)
      console.log('[LLM Stream] Body parsed successfully, keys:', Object.keys(body as object))
    } catch (e) {
      console.error('[LLM Stream] JSON parse error:', e)
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Check authentication
    const session = await getServerSession(authOptions)
    console.log('[LLM Stream] Auth check:', session?.user?.email ? 'OK' : 'FAILED')
    if (!session?.user?.email) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Check if LLM feature is enabled
    const llmEnabled = isLLMEnabled()
    console.log('[LLM Stream] Feature enabled:', llmEnabled)
    if (!llmEnabled) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'FEATURE_DISABLED',
            message: 'AI Tuning Guide feature is disabled',
          },
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    const validation = validateRequest(body)
    console.log('[LLM Stream] Validation:', validation.valid, validation.errors)
    if (!validation.valid || !validation.data) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Validation failed',
            details: validation.errors.join(', '),
          },
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    const {
      sql_text,
      execution_plan,
      metrics,
      context,
      language,
      custom_prompt,
      follow_up,
      conversation_history,
      user_question
    } = validation.data

    // Build messages
    let messages: ChatMessage[] = []

    if (follow_up && conversation_history && user_question) {
      // Follow-up question with history
      messages = [
        {
          role: 'system',
          content: getSystemPrompt(language),
        },
        ...conversation_history,
        {
          role: 'user',
          content: user_question,
        }
      ]
    } else {
      // Initial analysis
      messages = [
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
    }

    console.log('[LLM Stream] Starting stream, messages:', messages.length)

    // Create readable stream for SSE
    const stream = new ReadableStream({
      async start(controller) {
        const client = createClient()
        console.log('[LLM Stream] LLM client created, starting chat...')

        try {
          // Send initial connected message
          controller.enqueue(
            createSSEMessage({
              type: 'connected',
              timestamp: new Date().toISOString(),
            })
          )

          // Stream the response
          let chunkCount = 0
          for await (const chunk of client.streamChat(messages)) {
            chunkCount++
            if (chunkCount === 1) {
              console.log('[LLM Stream] First chunk received in', Date.now() - startTime, 'ms')
            }
            switch (chunk.type) {
              case 'content':
                controller.enqueue(
                  createSSEMessage({
                    type: 'content',
                    content: chunk.content,
                  })
                )
                break

              case 'done':
                console.log('[LLM Stream] Completed in', Date.now() - startTime, 'ms, chunks:', chunkCount)
                controller.enqueue(
                  createSSEMessage({
                    type: 'done',
                    timestamp: new Date().toISOString(),
                  })
                )
                controller.close()
                return

              case 'error':
                controller.enqueue(
                  createSSEMessage({
                    type: 'error',
                    error: chunk.error,
                  })
                )
                controller.close()
                return
            }
          }

          // Ensure we close if loop ends without done
          controller.close()
        } catch (error) {
          console.error('Streaming error:', error)
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'

          try {
            controller.enqueue(
              createSSEMessage({
                type: 'error',
                error: errorMessage,
              })
            )
          } catch {
            // Controller might be closed
          }

          try {
            controller.close()
          } catch {
            // Controller might already be closed
          }
        }
      },
    })

    // Return SSE response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable Nginx buffering
      },
    })
  } catch (error) {
    console.error('LLM stream error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return new Response(
      JSON.stringify({
        error: {
          code: 'UNKNOWN_ERROR',
          message: errorMessage,
        },
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
