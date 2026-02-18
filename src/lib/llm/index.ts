/**
 * LLM Integration Module for TMS v2.0
 *
 * Provides integration with Kanana 1.5 8B LLM for SQL tuning guidance
 * Supports both Ollama (development) and vLLM (production) backends
 */

// Types
export type {
  LLMApiType,
  AnalysisContext,
  SupportedLanguage,
  LLMConfig,
  ChatMessage,
  SQLMetrics,
  LLMAnalyzeRequest,
  LLMChatRequest,
  LLMStreamChunk,
  LLMHealthResponse,
  LLMErrorCode,
  LLMError,
  LLMSuccessResponse,
  LLMErrorResponse,
  LLMResponse,
  SQLAnalysisResult,
  IndexSuggestion,
  RewriteSuggestion,
  LLMFeatureFlags,
} from './types'

// Configuration
export {
  getLLMConfig,
  isLLMEnabled,
  getLLMFeatureFlags,
  getChatEndpoint,
  getHealthEndpoint,
  validateConfig,
  getConfigWithDefaults,
  LLM_ENV_VARS,
} from './config'

// Client
export {
  LLMClient,
  getDefaultClient,
  createClient,
  healthCheck,
  chat,
  streamChat,
} from './client'

// Prompts
export {
  SYSTEM_PROMPT_KO,
  SYSTEM_PROMPT_EN,
  CONTEXT_PROMPTS,
  formatMetricsForPrompt,
  buildAnalysisPrompt,
  getSystemPrompt,
  QUICK_PROMPTS,
} from './prompts'
