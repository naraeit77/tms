/**
 * Infrastructure Layer - LLM Adapters
 * Export all adapters and factory function
 */

import type { ILLMAdapter, LLMAdapterConfig } from '@/application/llm-analysis'
import { OllamaAdapter } from './OllamaAdapter'
import { VLLMAdapter } from './VLLMAdapter'

export { OllamaAdapter } from './OllamaAdapter'
export { VLLMAdapter } from './VLLMAdapter'

/**
 * Create LLM adapter based on configuration
 * Factory function that returns the appropriate adapter
 */
export function createLLMAdapter(config?: Partial<LLMAdapterConfig>): ILLMAdapter {
  const apiType = config?.apiType || (process.env.LLM_API_TYPE as 'ollama' | 'openai') || 'ollama'

  if (apiType === 'openai') {
    return new VLLMAdapter(config)
  }

  return new OllamaAdapter(config)
}

/**
 * Get default LLM configuration from environment
 */
export function getDefaultLLMConfig(): LLMAdapterConfig {
  return {
    baseUrl: process.env.LLM_BASE_URL || 'http://localhost:11434',
    modelName: process.env.LLM_MODEL_NAME || 'qwen2:1.5b',
    apiType: (process.env.LLM_API_TYPE as 'ollama' | 'openai') || 'ollama',
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '2048', 10),
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.1'),
    timeout: parseInt(process.env.LLM_TIMEOUT || '60000', 10),
  }
}

/**
 * Check if LLM feature is enabled
 */
export function isLLMEnabled(): boolean {
  return process.env.FEATURE_AI_TUNING_GUIDE === 'true'
}
