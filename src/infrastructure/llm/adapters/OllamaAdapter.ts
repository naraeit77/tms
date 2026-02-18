/**
 * Infrastructure Layer - Ollama Adapter
 * Implementation of ILLMAdapter for Ollama backend
 */

import type { ILLMAdapter, LLMChatOptions, LLMHealthStatus, LLMAdapterConfig } from '@/application/llm-analysis'
import type { ChatMessage, LLMResponse } from '@/domain/llm-analysis'

export class OllamaAdapter implements ILLMAdapter {
  private readonly config: LLMAdapterConfig

  constructor(config?: Partial<LLMAdapterConfig>) {
    this.config = {
      baseUrl: config?.baseUrl || process.env.LLM_BASE_URL || 'http://localhost:11434',
      modelName: config?.modelName || process.env.LLM_MODEL_NAME || 'qwen2:1.5b',
      apiType: 'ollama',
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
      const response = await fetch(`${this.config.baseUrl}/api/chat`, {
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
          stream: false,
          options: {
            temperature: options?.temperature ?? this.config.temperature,
            num_predict: options?.maxTokens ?? this.config.maxTokens,
          },
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json() as OllamaChatResponse

      return {
        content: data.message?.content || '',
        model: data.model || this.config.modelName,
        tokensUsed: data.eval_count,
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
      const response = await fetch(`${this.config.baseUrl}/api/chat`, {
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
          stream: true,
          options: {
            temperature: options?.temperature ?? this.config.temperature,
            num_predict: options?.maxTokens ?? this.config.maxTokens,
          },
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Ollama API error: ${response.status} - ${errorText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter(line => line.trim())

        for (const line of lines) {
          try {
            const data = JSON.parse(line) as OllamaStreamChunk
            if (data.message?.content) {
              yield data.message.content
            }
            if (data.done) {
              return
            }
          } catch {
            // Skip invalid JSON lines
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
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout for health check

      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
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

      const data = await response.json() as OllamaTagsResponse

      // Check if our model is available
      const modelAvailable = data.models?.some(
        m => m.name === this.config.modelName || m.name.startsWith(this.config.modelName.split(':')[0])
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

// Ollama Response Types
interface OllamaChatResponse {
  model: string
  created_at: string
  message: {
    role: string
    content: string
  }
  done: boolean
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
  eval_count?: number
}

interface OllamaStreamChunk {
  model: string
  created_at: string
  message: {
    role: string
    content: string
  }
  done: boolean
}

interface OllamaTagsResponse {
  models: {
    name: string
    modified_at: string
    size: number
  }[]
}
