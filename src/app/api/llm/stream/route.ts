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
import { getOracleConfig } from '@/lib/oracle/utils'
import { OracleIndexMetadataRepository } from '@/infrastructure/query-artifacts/repositories/OracleIndexMetadataRepository'
import { RegexSQLParser } from '@/infrastructure/query-artifacts/parsers/RegexSQLParser'

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
  connection_id?: string
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
      connection_id: data.connection_id as string | undefined,
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
      user_question,
      connection_id,
    } = validation.data

    // Fetch existing index metadata and table statistics if connection_id is available
    let indexMetadataPrompt = ''
    if (connection_id && sql_text && !follow_up) {
      try {
        indexMetadataPrompt = await fetchIndexMetadataForPrompt(connection_id, sql_text, language)
      } catch (error) {
        console.warn('[LLM Stream] Could not fetch index metadata:', error)
      }
      try {
        const tableStatsPrompt = await fetchTableStatsForPrompt(connection_id, sql_text, language)
        if (tableStatsPrompt) {
          indexMetadataPrompt = indexMetadataPrompt
            ? indexMetadataPrompt + '\n' + tableStatsPrompt
            : tableStatsPrompt
        }
      } catch (error) {
        console.warn('[LLM Stream] Could not fetch table statistics:', error)
      }
    }

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
      const analysisPrompt = custom_prompt || buildAnalysisPrompt({
        sqlText: sql_text,
        executionPlan: execution_plan,
        metrics,
        context: context!,
        language: language!,
      })

      messages = [
        {
          role: 'system',
          content: getSystemPrompt(language),
        },
        {
          role: 'user',
          content: indexMetadataPrompt
            ? indexMetadataPrompt + '\n\n' + analysisPrompt
            : analysisPrompt,
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

/**
 * Fetch existing index metadata for tables referenced in SQL
 * Returns formatted string to append to the LLM prompt
 */
async function fetchIndexMetadataForPrompt(
  connectionId: string,
  sqlText: string,
  language: SupportedLanguage = 'ko'
): Promise<string> {
  const parser = new RegexSQLParser()

  if (!parser.isSupported(sqlText)) {
    return ''
  }

  const parsed = parser.parse(sqlText)
  if (parsed.tables.length === 0) {
    return ''
  }

  const indexRepo = new OracleIndexMetadataRepository(getOracleConfig)
  const tableNames = parsed.tables.map(t => t.name)

  // Use schema from SQL or empty (will fall back to connection username)
  const schemas = new Set(
    parsed.tables.filter(t => t.schema).map(t => t.schema!.toUpperCase())
  )
  const schema = schemas.size === 1 ? [...schemas][0] : ''

  const existingIndexes = await indexRepo.getIndexesForTables(connectionId, schema, tableNames)

  if (existingIndexes.size === 0) {
    return ''
  }

  const isKo = language === 'ko'
  let result = isKo
    ? '\n\n---\n## ⚠️ 기존 인덱스 정보 (중복 생성 금지)\n아래는 데이터베이스에서 실제로 조회한 기존 인덱스 목록입니다.\n**아래 목록에 있는 컬럼의 인덱스는 이미 존재하므로 절대로 CREATE INDEX를 권장하지 마세요.**\n\n'
    : '\n\n---\n## ⚠️ Existing Index Information (DO NOT duplicate)\nBelow are existing indexes queried from the actual database.\n**These indexes ALREADY EXIST - do NOT recommend CREATE INDEX for any column that is already indexed below.**\n\n'

  for (const [tableName, indexes] of existingIndexes) {
    result += `### ${tableName}\n`
    for (const idx of indexes) {
      const columns = idx.columns
        .sort((a, b) => a.position - b.position)
        .map(c => c.columnName)
        .join(', ')
      const unique = idx.isUnique ? 'UNIQUE ' : ''
      result += `- ${unique}${idx.indexName}(${columns}) — 이미 존재함\n`
    }
    result += '\n'
  }

  if (isKo) {
    result += '**위 인덱스들은 이미 생성되어 있습니다. 새로운 인덱스만 권장하세요.**\n'
  } else {
    result += '**The above indexes already exist. Only recommend NEW indexes.**\n'
  }

  return result
}

/**
 * Fetch table row counts and join direction information for LLM prompt
 * Returns formatted string with table statistics to help LLM recommend proper join direction
 */
async function fetchTableStatsForPrompt(
  connectionId: string,
  sqlText: string,
  language: SupportedLanguage = 'ko'
): Promise<string> {
  const parser = new RegexSQLParser()

  if (!parser.isSupported(sqlText)) {
    return ''
  }

  const parsed = parser.parse(sqlText)
  if (parsed.tables.length < 2) {
    return '' // No join direction to analyze for single table
  }

  const indexRepo = new OracleIndexMetadataRepository(getOracleConfig)

  // Use schema from SQL or empty (will fall back to connection username)
  const schemas = new Set(
    parsed.tables.filter(t => t.schema).map(t => t.schema!.toUpperCase())
  )
  const schema = schemas.size === 1 ? [...schemas][0] : ''

  // Fetch row counts for all tables
  const tableStats: Array<{ name: string; rowCount: number }> = []
  for (const table of parsed.tables) {
    try {
      const rowCount = await indexRepo.getTableRowCount(connectionId, schema, table.name)
      tableStats.push({ name: table.name, rowCount })
    } catch {
      tableStats.push({ name: table.name, rowCount: 0 })
    }
  }

  // Only include if we got actual row counts
  const hasStats = tableStats.some(t => t.rowCount > 0)
  if (!hasStats) {
    return ''
  }

  const isKo = language === 'ko'

  let result = isKo
    ? '\n\n---\n## 📊 테이블 통계 및 조인 방향 정보\n아래는 데이터베이스에서 조회한 실제 테이블 행 수입니다. 조인 순서 및 방향 권장 시 반드시 참고하세요.\n\n'
    : '\n\n---\n## 📊 Table Statistics & Join Direction\nBelow are actual table row counts from the database. Use these for join order recommendations.\n\n'

  // Sort by row count for display
  const sorted = [...tableStats].sort((a, b) => a.rowCount - b.rowCount)

  result += '| ' + (isKo ? '테이블' : 'Table') + ' | ' + (isKo ? '행 수' : 'Row Count') + ' |\n'
  result += '|--------|----------|\n'
  for (const stat of sorted) {
    result += `| ${stat.name} | ${stat.rowCount > 0 ? stat.rowCount.toLocaleString() : 'N/A'} |\n`
  }

  // Add join direction recommendation based on row counts
  if (sorted.length >= 2 && sorted[0].rowCount > 0 && sorted[sorted.length - 1].rowCount > 0) {
    const smallest = sorted[0]
    const largest = sorted[sorted.length - 1]

    if (isKo) {
      result += `\n**조인 방향 참고사항:**\n`
      result += `- 가장 작은 테이블: ${smallest.name} (${smallest.rowCount.toLocaleString()}행)\n`
      result += `- 가장 큰 테이블: ${largest.name} (${largest.rowCount.toLocaleString()}행)\n`
      result += `- Nested Loop Join 시, 작은 결과 집합의 테이블이 드라이빙 테이블(외부 테이블)이 되어야 합니다.\n`
      result += `- LEADING 힌트 권장 시 실제 행 수를 기반으로 조인 순서를 제안하세요.\n`
    } else {
      result += `\n**Join Direction Notes:**\n`
      result += `- Smallest table: ${smallest.name} (${smallest.rowCount.toLocaleString()} rows)\n`
      result += `- Largest table: ${largest.name} (${largest.rowCount.toLocaleString()} rows)\n`
      result += `- For Nested Loop Join, smaller result set should be the driving (outer) table.\n`
      result += `- Base LEADING hint recommendations on actual row counts.\n`
    }
  }

  return result
}
