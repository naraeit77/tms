/**
 * Application Layer - LLM Analysis Module
 * Export all use cases, DTOs, and ports
 */

// Use Cases
export * from './use-cases'

// DTOs
export * from './dto'

// Ports (Interfaces)
export type { ILLMAdapter, LLMChatOptions, LLMHealthStatus, LLMAdapterConfig } from './ports/ILLMAdapter'

// Prompts & Mappings (for testing and extension)
export {
  ALL_EXAMPLES as SMART_SEARCH_EXAMPLES,
  getExamplesByCategory,
  getBalancedExamples,
  formatExamplesForPrompt,
} from './prompts/smart-search-examples'

export type { FewShotExample } from './prompts/smart-search-examples'

export {
  TIME_SYNONYMS,
  PERFORMANCE_SYNONYMS,
  SQL_TYPE_SYNONYMS,
  SORT_SYNONYMS,
  THRESHOLD_PATTERNS,
  preprocessUserInput,
  generateHintContext,
  normalizeTimeRange,
  extractSqlType,
  extractPerformanceFocus,
  extractSortOrder,
  extractThresholds,
  extractSchemaTable,
} from './prompts/synonym-mappings'
