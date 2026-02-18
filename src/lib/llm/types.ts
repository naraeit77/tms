/**
 * LLM Integration Types for TMS v2.0
 * Supports both Ollama and vLLM (OpenAI-compatible) backends
 */

// API Types
export type LLMApiType = 'ollama' | 'openai'

// Analysis Context Types
export type AnalysisContext = 'tuning' | 'explain' | 'index' | 'rewrite'

// Language Support
export type SupportedLanguage = 'ko' | 'en'

// LLM Configuration
export interface LLMConfig {
  baseUrl: string
  modelName: string
  apiType: LLMApiType
  maxTokens: number
  temperature: number
  timeout: number
}

// Chat Message Types
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// SQL Metrics for Analysis
export interface SQLMetrics {
  elapsed_time_ms: number
  cpu_time_ms: number
  buffer_gets: number
  disk_reads: number
  executions: number
  rows_processed?: number
}

// LLM Analysis Request
export interface LLMAnalyzeRequest {
  sql_text: string
  execution_plan?: string
  metrics?: SQLMetrics
  context?: AnalysisContext
  language?: SupportedLanguage
}

// LLM Chat Request
export interface LLMChatRequest {
  messages: ChatMessage[]
  stream?: boolean
  maxTokens?: number
  temperature?: number
}

// Streaming Chunk Types
export interface LLMStreamChunk {
  type: 'content' | 'done' | 'error'
  content?: string
  error?: string
}

// Health Check Response
export interface LLMHealthResponse {
  healthy: boolean
  model: string
  latency: number
  timestamp: string
  error?: string
}

// Error Types
export type LLMErrorCode =
  | 'LLM_UNAVAILABLE'
  | 'LLM_TIMEOUT'
  | 'LLM_RATE_LIMIT'
  | 'INVALID_REQUEST'
  | 'UNKNOWN_ERROR'

export interface LLMError {
  code: LLMErrorCode
  message: string
  details?: string
  fallbackAvailable: boolean
}

// API Response Types
export interface LLMSuccessResponse<T = string> {
  success: true
  data: T
  timestamp: string
}

export interface LLMErrorResponse {
  success: false
  error: LLMError
}

export type LLMResponse<T = string> = LLMSuccessResponse<T> | LLMErrorResponse

// Ollama-specific Types
export interface OllamaChatRequest {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  options?: {
    temperature?: number
    num_predict?: number
    top_p?: number
    top_k?: number
    repeat_penalty?: number
    repeat_last_n?: number
    stop?: string[]
  }
}

export interface OllamaChatResponse {
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

export interface OllamaStreamChunk {
  model: string
  created_at: string
  message: {
    role: string
    content: string
  }
  done: boolean
}

// OpenAI-compatible Types (for vLLM)
export interface OpenAIChatRequest {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  max_tokens?: number
  temperature?: number
  top_p?: number
}

export interface OpenAIChatResponse {
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

export interface OpenAIStreamChunk {
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

// Analysis Result Types
export interface SQLAnalysisResult {
  summary: string
  issues: string[]
  recommendations: string[]
  indexSuggestions?: IndexSuggestion[]
  rewriteSuggestions?: RewriteSuggestion[]
  performanceScore?: number
  rawResponse: string
}

export interface IndexSuggestion {
  table: string
  columns: string[]
  type: 'btree' | 'bitmap' | 'function' | 'composite'
  ddl: string
  reason: string
  expectedImprovement: string
}

export interface RewriteSuggestion {
  original: string
  optimized: string
  explanation: string
  performanceGain: string
}

// Feature Flag Types
export interface LLMFeatureFlags {
  enabled: boolean
  streamingEnabled: boolean
  historyEnabled: boolean
  exportEnabled: boolean
}
