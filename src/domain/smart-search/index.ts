/**
 * Domain Layer - Smart Search Module
 * Aggregates all smart search domain components
 */

// Value Objects
export { SearchQuery, ParsedIntent, type IntentType, type ConfidenceLevel, type MatchedRule } from './value-objects'

// Ports (Interfaces)
export type { IQueryParser, IParsingRule, IRuleRegistry } from './ports'
