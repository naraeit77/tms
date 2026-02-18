/**
 * LLM Client Library for TMS v2.0
 * Supports both Ollama and vLLM (OpenAI-compatible) backends
 */

import {
  type LLMConfig,
  type ChatMessage,
  type LLMHealthResponse,
  type LLMStreamChunk,
  type OllamaChatRequest,
  type OllamaChatResponse,
  type OllamaStreamChunk,
  type OpenAIChatRequest,
  type OpenAIChatResponse,
  type OpenAIStreamChunk,
  type LLMError,
  type LLMErrorCode,
} from './types'
import { getLLMConfig, getChatEndpoint, getHealthEndpoint } from './config'

/**
 * Create an LLM error object
 */
function createLLMError(
  code: LLMErrorCode,
  message: string,
  details?: string
): LLMError {
  return {
    code,
    message,
    details,
    fallbackAvailable: code !== 'INVALID_REQUEST',
  }
}

/**
 * Parse error response and return appropriate LLM error
 */
function parseError(error: unknown, context: string): LLMError {
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return createLLMError('LLM_TIMEOUT', `Request timed out: ${context}`, error.message)
    }
    if (error.message.includes('fetch') || error.message.includes('connect')) {
      return createLLMError('LLM_UNAVAILABLE', `LLM server unavailable: ${context}`, error.message)
    }
    if (error.message.includes('rate') || error.message.includes('429')) {
      return createLLMError('LLM_RATE_LIMIT', `Rate limit exceeded: ${context}`, error.message)
    }
    return createLLMError('UNKNOWN_ERROR', error.message, context)
  }
  return createLLMError('UNKNOWN_ERROR', 'An unknown error occurred', context)
}

/**
 * Retry logic with exponential backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // Don't retry on validation errors
      if (error instanceof Error && error.message.includes('INVALID_REQUEST')) {
        throw error
      }

      // Wait before retry with exponential backoff
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}

/**
 * LLM Client class
 */
export class LLMClient {
  private config: LLMConfig

  constructor(config?: Partial<LLMConfig>) {
    this.config = {
      ...getLLMConfig(),
      ...config,
    }
  }

  /**
   * Health check - verify LLM server is available
   */
  async healthCheck(): Promise<LLMHealthResponse> {
    const startTime = Date.now()
    const endpoint = getHealthEndpoint(this.config)

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(endpoint, {
        method: 'GET',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`)
      }

      const latency = Date.now() - startTime

      // Parse response based on API type
      if (this.config.apiType === 'ollama') {
        const data = await response.json()
        const modelFound = data.models?.some((m: { name: string }) =>
          m.name.includes(this.config.modelName)
        )
        return {
          healthy: true,
          model: modelFound ? this.config.modelName : 'unknown',
          latency,
          timestamp: new Date().toISOString(),
        }
      } else {
        const data = await response.json()
        const modelFound = data.data?.some((m: { id: string }) =>
          m.id.includes(this.config.modelName)
        )
        return {
          healthy: true,
          model: modelFound ? this.config.modelName : 'unknown',
          latency,
          timestamp: new Date().toISOString(),
        }
      }
    } catch (error) {
      const llmError = parseError(error, 'healthCheck')
      return {
        healthy: false,
        model: this.config.modelName,
        latency: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        error: llmError.message,
      }
    }
  }

  /**
   * Non-streaming chat completion
   */
  async chat(
    messages: ChatMessage[],
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<string> {
    const endpoint = getChatEndpoint(this.config)
    const maxTokens = options?.maxTokens ?? this.config.maxTokens
    const temperature = options?.temperature ?? this.config.temperature

    return withRetry(async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

      try {
        let body: string

        if (this.config.apiType === 'ollama') {
          const request: OllamaChatRequest = {
            model: this.config.modelName,
            messages,
            stream: false,
            options: {
              temperature,
              num_predict: maxTokens,
            },
          }
          body = JSON.stringify(request)
        } else {
          const request: OpenAIChatRequest = {
            model: this.config.modelName,
            messages,
            stream: false,
            max_tokens: maxTokens,
            temperature,
          }
          body = JSON.stringify(request)
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body,
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          const errorText = await response.text()
          if (response.status === 429) {
            throw new Error(`LLM_RATE_LIMIT: ${errorText}`)
          }
          throw new Error(`Chat request failed: ${response.status} - ${errorText}`)
        }

        if (this.config.apiType === 'ollama') {
          const data: OllamaChatResponse = await response.json()
          return data.message.content
        } else {
          const data: OpenAIChatResponse = await response.json()
          return data.choices[0]?.message?.content || ''
        }
      } finally {
        clearTimeout(timeoutId)
      }
    })
  }

  /**
   * Streaming chat completion
   * Returns an async generator that yields content chunks
   */
  async *streamChat(
    messages: ChatMessage[],
    options?: { maxTokens?: number; temperature?: number }
  ): AsyncGenerator<LLMStreamChunk> {
    const endpoint = getChatEndpoint(this.config)
    const maxTokens = options?.maxTokens ?? this.config.maxTokens
    const temperature = options?.temperature ?? this.config.temperature

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

    try {
      let body: string

      if (this.config.apiType === 'ollama') {
        const request: OllamaChatRequest = {
          model: this.config.modelName,
          messages,
          stream: true,
          options: {
            temperature,
            num_predict: maxTokens,
          },
        }
        body = JSON.stringify(request)
      } else {
        const request: OpenAIChatRequest = {
          model: this.config.modelName,
          messages,
          stream: true,
          max_tokens: maxTokens,
          temperature,
        }
        body = JSON.stringify(request)
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        yield {
          type: 'error',
          error: `Request failed: ${response.status} - ${errorText}`,
        }
        return
      }

      if (!response.body) {
        yield { type: 'error', error: 'No response body' }
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          yield { type: 'done' }
          break
        }

        buffer += decoder.decode(value, { stream: true })

        // Process complete lines
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue

          try {
            if (this.config.apiType === 'ollama') {
              const chunk: OllamaStreamChunk = JSON.parse(line)
              if (chunk.message?.content) {
                yield { type: 'content', content: chunk.message.content }
              }
              if (chunk.done) {
                yield { type: 'done' }
                return
              }
            } else {
              // OpenAI format: data: {...}
              const dataLine = line.replace(/^data:\s*/, '')
              if (dataLine === '[DONE]') {
                yield { type: 'done' }
                return
              }
              const chunk: OpenAIStreamChunk = JSON.parse(dataLine)
              const content = chunk.choices[0]?.delta?.content
              if (content) {
                yield { type: 'content', content }
              }
              if (chunk.choices[0]?.finish_reason) {
                yield { type: 'done' }
                return
              }
            }
          } catch (parseError) {
            // Skip unparseable lines (might be incomplete)
            continue
          }
        }
      }
    } catch (error) {
      clearTimeout(timeoutId)
      const llmError = parseError(error, 'streamChat')
      yield { type: 'error', error: llmError.message }
    }
  }

  /**
   * Stream chat to a callback function
   * Useful for simpler consumption patterns
   */
  async streamChatToCallback(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    onComplete?: () => void,
    onError?: (error: string) => void,
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<string> {
    let fullContent = ''

    try {
      for await (const chunk of this.streamChat(messages, options)) {
        switch (chunk.type) {
          case 'content':
            if (chunk.content) {
              fullContent += chunk.content
              onChunk(chunk.content)
            }
            break
          case 'done':
            onComplete?.()
            break
          case 'error':
            onError?.(chunk.error || 'Unknown error')
            throw new Error(chunk.error)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      onError?.(message)
      throw error
    }

    return fullContent
  }

  /**
   * Get the current configuration
   */
  getConfig(): LLMConfig {
    return { ...this.config }
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<LLMConfig>): void {
    this.config = { ...this.config, ...updates }
  }
}

/**
 * Create a singleton client instance
 */
let defaultClient: LLMClient | null = null

export function getDefaultClient(): LLMClient {
  if (!defaultClient) {
    defaultClient = new LLMClient()
  }
  return defaultClient
}

/**
 * Create a new client instance
 */
export function createClient(config?: Partial<LLMConfig>): LLMClient {
  return new LLMClient(config)
}

/**
 * Export convenience functions using default client
 */
export async function healthCheck(): Promise<LLMHealthResponse> {
  return getDefaultClient().healthCheck()
}

export async function chat(
  messages: ChatMessage[],
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  return getDefaultClient().chat(messages, options)
}

export function streamChat(
  messages: ChatMessage[],
  options?: { maxTokens?: number; temperature?: number }
): AsyncGenerator<LLMStreamChunk> {
  return getDefaultClient().streamChat(messages, options)
}
