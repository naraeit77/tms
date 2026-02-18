/**
 * LLM Streaming Chat API (Pages Router version)
 * POST /api/llm/stream-pages
 *
 * This uses Pages Router API which has better body parsing support
 * and avoids the "server-only" module issue from App Router imports
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { getToken } from 'next-auth/jwt'

// Direct LLM client import to avoid server-only chain
import { LLMClient } from '@/lib/llm/client'
import { getLLMConfig, isLLMEnabled } from '@/lib/llm/config'
import { getSystemPrompt, buildAnalysisPrompt } from '@/lib/llm/prompts'
import type { ChatMessage, AnalysisContext, SupportedLanguage, SQLMetrics } from '@/lib/llm/types'

// Disable body parser to handle streaming manually - NO, keep it enabled for JSON
export const config = {
  api: {
    bodyParser: true, // Enable body parser for JSON
  },
}

interface StreamRequest {
  sql_text: string
  execution_plan?: string
  metrics?: SQLMetrics
  context?: AnalysisContext
  language?: SupportedLanguage
  custom_prompt?: string
}

function validateRequest(body: unknown): { valid: boolean; errors: string[]; data?: StreamRequest } {
  const errors: string[] = []

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body must be an object'] }
  }

  const data = body as Record<string, unknown>

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('[LLM Stream Pages] Request received')
  const startTime = Date.now()

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Body is automatically parsed by Next.js Pages API
    const body = req.body
    console.log('[LLM Stream Pages] Body received:', typeof body, body ? Object.keys(body) : 'null')

    if (!body || Object.keys(body).length === 0) {
      console.log('[LLM Stream Pages] Empty body')
      return res.status(400).json({ error: 'Empty request body' })
    }

    // Check authentication using JWT token directly (avoids server-only import chain)
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    console.log('[LLM Stream Pages] Auth check:', token?.email ? 'OK' : 'FAILED')
    if (!token?.email) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    // Check if LLM feature is enabled
    const llmEnabled = isLLMEnabled()
    console.log('[LLM Stream Pages] Feature enabled:', llmEnabled)
    if (!llmEnabled) {
      return res.status(503).json({
        error: {
          code: 'FEATURE_DISABLED',
          message: 'AI Tuning Guide feature is disabled',
        },
      })
    }

    const validation = validateRequest(body)
    console.log('[LLM Stream Pages] Validation:', validation.valid, validation.errors)
    if (!validation.valid || !validation.data) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Validation failed',
          details: validation.errors.join(', '),
        },
      })
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

    console.log('[LLM Stream Pages] Starting stream, messages:', messages.length)

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    // Send initial connected message
    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`)

    // Create LLM client directly (avoiding createClient from index.ts which may import server-only)
    const llmConfig = getLLMConfig()
    const client = new LLMClient(llmConfig)
    console.log('[LLM Stream Pages] LLM client created, starting chat...')

    let chunkCount = 0
    try {
      for await (const chunk of client.streamChat(messages)) {
        chunkCount++
        if (chunkCount === 1) {
          console.log('[LLM Stream Pages] First chunk received in', Date.now() - startTime, 'ms')
        }
        switch (chunk.type) {
          case 'content':
            res.write(`data: ${JSON.stringify({ type: 'content', content: chunk.content })}\n\n`)
            break

          case 'done':
            console.log('[LLM Stream Pages] Completed in', Date.now() - startTime, 'ms, chunks:', chunkCount)
            res.write(`data: ${JSON.stringify({ type: 'done', timestamp: new Date().toISOString() })}\n\n`)
            res.end()
            return

          case 'error':
            res.write(`data: ${JSON.stringify({ type: 'error', error: chunk.error })}\n\n`)
            res.end()
            return
        }
      }

      // Ensure we close if loop ends without done
      res.end()
    } catch (streamError) {
      console.error('[LLM Stream Pages] Streaming error:', streamError)
      const errorMessage = streamError instanceof Error ? streamError.message : 'Unknown error'
      res.write(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`)
      res.end()
    }
  } catch (error) {
    console.error('[LLM Stream Pages] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    if (!res.headersSent) {
      return res.status(500).json({
        error: {
          code: 'UNKNOWN_ERROR',
          message: errorMessage,
        },
      })
    }
    res.end()
  }
}
