/**
 * LLM Stop/Unload API
 * POST /api/llm/stop
 *
 * Stops/unloads the LLM model from memory to free up resources
 * Works with Ollama by setting keep_alive to 0
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getLLMConfig, isLLMEnabled } from '@/lib/llm'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  console.log('[LLM Stop] Request received')

  try {
    // Check authentication
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if LLM feature is enabled
    if (!isLLMEnabled()) {
      return NextResponse.json(
        { success: false, error: 'LLM feature is disabled' },
        { status: 503 }
      )
    }

    const config = getLLMConfig()

    // For Ollama: Send a request with keep_alive: "0" to unload the model
    if (config.apiType === 'ollama') {
      const baseUrl = config.baseUrl || 'http://localhost:11434'
      const endpoint = `${baseUrl}/api/generate`

      console.log('[LLM Stop] Sending unload request to Ollama:', endpoint, 'model:', config.modelName)

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.modelName,
          prompt: '',           // Empty prompt required for the request
          keep_alive: '0',      // String "0" tells Ollama to unload immediately
        }),
      })

      // Read the response body (Ollama returns streaming response even for this)
      const responseText = await response.text()
      console.log('[LLM Stop] Ollama response:', response.status, responseText.slice(0, 200))

      if (!response.ok) {
        console.error('[LLM Stop] Ollama unload failed:', responseText)
        return NextResponse.json(
          { success: false, error: `Failed to unload model: ${responseText}` },
          { status: 500 }
        )
      }

      console.log('[LLM Stop] Model unload request sent successfully')
      return NextResponse.json({
        success: true,
        message: `Model ${config.modelName} unload request sent`,
      })
    }

    // For vLLM/OpenAI-compatible: No direct unload mechanism
    // vLLM typically manages memory internally
    console.log('[LLM Stop] vLLM/OpenAI backend - no unload mechanism available')
    return NextResponse.json({
      success: true,
      message: 'vLLM backend does not require explicit unload',
    })

  } catch (error) {
    console.error('[LLM Stop] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}
