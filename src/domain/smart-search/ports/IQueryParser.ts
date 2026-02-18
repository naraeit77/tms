/**
 * Domain Layer - IQueryParser Port Interface
 * Defines the contract for parsing natural language queries into search filters
 *
 * This is a Port in Clean Architecture - it defines WHAT we need,
 * not HOW it's implemented. Implementation details are in Infrastructure layer.
 */

import type { SearchQuery, ParsedIntent } from '../value-objects'

/**
 * Query Parser Port Interface
 * Abstracts the query parsing logic for rule-based smart search
 */
export interface IQueryParser {
  /**
   * Parses a SearchQuery into a ParsedIntent
   * @param query - The search query to parse
   * @returns ParsedIntent with extracted filters and interpretation
   */
  parse(query: SearchQuery): ParsedIntent

  /**
   * Checks if the parser can handle this query
   * @param query - The search query to check
   * @returns true if the parser can handle this query
   */
  canHandle(query: SearchQuery): boolean
}

/**
 * Parsing Rule Interface
 * Defines a single parsing rule for extracting information from queries
 */
export interface IParsingRule {
  /**
   * Unique identifier for the rule
   */
  readonly name: string

  /**
   * Priority of the rule (higher = processed first)
   */
  readonly priority: number

  /**
   * Checks if this rule matches the query
   * @param query - The search query to check
   * @returns true if the rule matches
   */
  matches(query: SearchQuery): boolean

  /**
   * Applies the rule to extract a partial ParsedIntent
   * @param query - The search query to process
   * @returns Partial ParsedIntent with extracted information
   */
  apply(query: SearchQuery): Partial<ParsedIntent>
}

/**
 * Rule Registry Port Interface
 * Manages collection of parsing rules
 */
export interface IRuleRegistry {
  /**
   * Registers a new parsing rule
   */
  register(rule: IParsingRule): void

  /**
   * Gets all registered rules sorted by priority
   */
  getRules(): IParsingRule[]

  /**
   * Gets rules that match the given query
   */
  getMatchingRules(query: SearchQuery): IParsingRule[]
}
