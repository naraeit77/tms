/**
 * Infrastructure Layer - vLLM Adapter
 * Implementation of ILLMAdapter for vLLM (OpenAI-compatible) backend
 */

import type { ILLMAdapter, LLMChatOptions, LLMHealthStatus, LLMAdapterConfig } from '@/application/llm-analysis'
import type { ChatMessage, LLMResponse } from '@/domain/llm-analysis'

export class VLLMAdapter implements ILLMAdapter {
  private readonly config: LLMAdapterConfig

  constructor(config?: Partial<LLMAdapterConfig>) {
    this.config = {
      baseUrl: config?.baseUrl || process.env.LLM_BASE_URL || 'http://localhost:8000',
      modelName: config?.modelName || process.env.LLM_MODEL_NAME || 'Qwen/Qwen2-1.5B-Instruct',
      apiType: 'openai',
      maxTokens: config?.maxTokens || parseInt(process.env.LLM_MAX_TOKENS || '2048', 10),
      temperature: config?.temperature || parseFloat(process.env.LLM_TEMPERATURE || '0.1'),
      timeout: config?.timeout || parseInt(process.env.LLM_TIMEOUT || '60000', 10),
    }
  }

  async chat(messages: ChatMessage[], options?: LLMChatOptions): Promise<LLMResponse> {
    const startTime = Date.now()

    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      options?.timeout || this.config.timeout
    )

    try {
      const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.modelName,
          messages: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          max_tokens: options?.maxTokens ?? this.config.maxTokens,
          temperature: options?.temperature ?? this.config.temperature,
          stream: false,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`vLLM API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json() as OpenAIChatResponse

      const choice = data.choices?.[0]
      if (!choice) {
        throw new Error('No response from vLLM')
      }

      return {
        content: choice.message?.content || '',
        model: data.model || this.config.modelName,
        tokensUsed: data.usage?.total_tokens,
        processingTimeMs: Date.now() - startTime,
      }
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`LLM request timeout after ${options?.timeout || this.config.timeout}ms`)
        }
        throw error
      }

      throw new Error('Unknown LLM error')
    }
  }

  async *streamChat(messages: ChatMessage[], options?: LLMChatOptions): AsyncGenerator<string, void, unknown> {
    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      options?.timeout || this.config.timeout
    )

    try {
      const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.modelName,
          messages: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          max_tokens: options?.maxTokens ?? this.config.maxTokens,
          temperature: options?.temperature ?? this.config.temperature,
          stream: true,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`vLLM API error: ${response.status} - ${errorText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === 'data: [DONE]') continue

          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6)) as OpenAIStreamChunk
              const content = data.choices?.[0]?.delta?.content
              if (content) {
                yield content
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`LLM stream timeout after ${options?.timeout || this.config.timeout}ms`)
        }
        throw error
      }

      throw new Error('Unknown LLM streaming error')
    }
  }

  async healthCheck(): Promise<LLMHealthStatus> {
    const startTime = Date.now()

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(`${this.config.baseUrl}/v1/models`, {
        method: 'GET',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        return {
          healthy: false,
          model: this.config.modelName,
          latencyMs: Date.now() - startTime,
          error: `HTTP ${response.status}`,
          timestamp: new Date().toISOString(),
        }
      }

      const data = await response.json() as OpenAIModelsResponse

      // Check if our model is available
      const modelAvailable = data.data?.some(
        m => m.id === this.config.modelName || m.id.includes(this.config.modelName)
      )

      return {
        healthy: modelAvailable,
        model: this.config.modelName,
        latencyMs: Date.now() - startTime,
        error: modelAvailable ? undefined : `Model ${this.config.modelName} not found`,
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      return {
        healthy: false,
        model: this.config.modelName,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }
    }
  }

  getConfig(): LLMAdapterConfig {
    return { ...this.config }
  }
}

// OpenAI-compatible Response Types
interface OpenAIChatResponse {
  id: string
  object: string
  created: number
  model: string
  choices: {
    index: number
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

interface OpenAIStreamChunk {
  id: string
  object: string
  created: number
  model: string
  choices: {
    index: number
    delta: {
      role?: string
      content?: string
    }
    finish_reason: string | null
  }[]
}

interface OpenAIModelsResponse {
  object: string
  data: {
    id: string
    object: string
    created: number
    owned_by: string
  }[]
}
