/**
 * Application Layer - Port Interface
 * Defines the contract for LLM adapters (Infrastructure layer implements this)
 */

import type { LLMResponse, ChatMessage } from '@/domain/llm-analysis'

/**
 * LLM Adapter Interface
 * Port for LLM infrastructure adapters
 */
export interface ILLMAdapter {
  /**
   * Send a chat request and get a complete response
   */
  chat(messages: ChatMessage[], options?: LLMChatOptions): Promise<LLMResponse>

  /**
   * Send a chat request and stream the response
   */
  streamChat(messages: ChatMessage[], options?: LLMChatOptions): AsyncGenerator<string, void, unknown>

  /**
   * Check if the LLM service is healthy
   */
  healthCheck(): Promise<LLMHealthStatus>

  /**
   * Get the current configuration
   */
  getConfig(): LLMAdapterConfig
}

export interface LLMChatOptions {
  maxTokens?: number
  temperature?: number
  timeout?: number
}

export interface LLMHealthStatus {
  healthy: boolean
  model: string
  latencyMs: number
  error?: string
  timestamp: string
}

export interface LLMAdapterConfig {
  baseUrl: string
  modelName: string
  apiType: 'ollama' | 'openai'
  maxTokens: number
  temperature: number
  timeout: number
}
