/**
 * LLM Configuration for TMS v2.0
 * Environment-based configuration for Ollama/vLLM backends
 */

import type { LLMConfig, LLMApiType, LLMFeatureFlags } from './types'

// Default configuration values (optimized for small models)
const DEFAULT_CONFIG = {
  baseUrl: 'http://localhost:11434',
  modelName: 'qwen2:1.5b',
  apiType: 'ollama' as LLMApiType,
  maxTokens: 512,
  temperature: 0.1,
  timeout: 30000, // 30 seconds
} as const

/**
 * Get LLM configuration from environment variables
 */
export function getLLMConfig(): LLMConfig {
  return {
    baseUrl: process.env.LLM_BASE_URL || DEFAULT_CONFIG.baseUrl,
    modelName: process.env.LLM_MODEL_NAME || DEFAULT_CONFIG.modelName,
    apiType: (process.env.LLM_API_TYPE as LLMApiType) || DEFAULT_CONFIG.apiType,
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || String(DEFAULT_CONFIG.maxTokens), 10),
    temperature: parseFloat(process.env.LLM_TEMPERATURE || String(DEFAULT_CONFIG.temperature)),
    timeout: parseInt(process.env.LLM_TIMEOUT || String(DEFAULT_CONFIG.timeout), 10),
  }
}

/**
 * Check if LLM features are enabled
 */
export function isLLMEnabled(): boolean {
  return process.env.FEATURE_AI_TUNING_GUIDE === 'true'
}

/**
 * Get feature flags for LLM functionality
 */
export function getLLMFeatureFlags(): LLMFeatureFlags {
  return {
    enabled: isLLMEnabled(),
    streamingEnabled: process.env.LLM_STREAMING_ENABLED !== 'false',
    historyEnabled: process.env.LLM_HISTORY_ENABLED !== 'false',
    exportEnabled: process.env.LLM_EXPORT_ENABLED !== 'false',
  }
}

/**
 * Get the chat endpoint URL based on API type
 */
export function getChatEndpoint(config: LLMConfig): string {
  if (config.apiType === 'ollama') {
    // Ollama native API
    return `${config.baseUrl}/api/chat`
  }
  // OpenAI-compatible API (vLLM)
  return `${config.baseUrl}/v1/chat/completions`
}

/**
 * Get the health check endpoint URL based on API type
 */
export function getHealthEndpoint(config: LLMConfig): string {
  if (config.apiType === 'ollama') {
    // Ollama health endpoint
    return `${config.baseUrl}/api/tags`
  }
  // OpenAI-compatible models endpoint (vLLM)
  return `${config.baseUrl}/v1/models`
}

/**
 * Validate LLM configuration
 */
export function validateConfig(config: LLMConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!config.baseUrl) {
    errors.push('LLM_BASE_URL is required')
  }

  if (!config.modelName) {
    errors.push('LLM_MODEL_NAME is required')
  }

  if (!['ollama', 'openai'].includes(config.apiType)) {
    errors.push('LLM_API_TYPE must be "ollama" or "openai"')
  }

  if (config.maxTokens < 1 || config.maxTokens > 32768) {
    errors.push('LLM_MAX_TOKENS must be between 1 and 32768')
  }

  if (config.temperature < 0 || config.temperature > 2) {
    errors.push('LLM_TEMPERATURE must be between 0 and 2')
  }

  if (config.timeout < 1000 || config.timeout > 600000) {
    errors.push('LLM_TIMEOUT must be between 1000ms and 600000ms (10 minutes)')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Get configuration with defaults for missing values
 */
export function getConfigWithDefaults(partial: Partial<LLMConfig> = {}): LLMConfig {
  const envConfig = getLLMConfig()
  return {
    ...envConfig,
    ...partial,
  }
}

/**
 * Environment variable names for documentation
 */
export const LLM_ENV_VARS = {
  LLM_BASE_URL: 'LLM server URL (default: http://localhost:11434)',
  LLM_MODEL_NAME: 'Model name (default: qwen2:1.5b)',
  LLM_API_TYPE: 'API type: "ollama" or "openai" (default: ollama)',
  LLM_MAX_TOKENS: 'Maximum tokens in response (default: 2048)',
  LLM_TEMPERATURE: 'Temperature for generation (default: 0.2)',
  LLM_TIMEOUT: 'Request timeout in ms (default: 60000)',
  FEATURE_AI_TUNING_GUIDE: 'Enable AI tuning guide feature (default: false)',
  LLM_STREAMING_ENABLED: 'Enable streaming responses (default: true)',
  LLM_HISTORY_ENABLED: 'Enable chat history (default: true)',
  LLM_EXPORT_ENABLED: 'Enable response export (default: true)',
} as const
