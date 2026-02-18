/**
 * Domain Layer - SQL Parser Port
 * Interface for SQL parsing abstraction
 */

import type { ParsedSQL } from '../entities'

/**
 * SQL Parser Port
 * Defines the contract for SQL parsing implementations
 */
export interface ISQLParser {
  /**
   * Parse a SQL statement and extract tables, columns, joins, etc.
   * @param sql - The SQL statement to parse
   * @returns Parsed SQL structure
   */
  parse(sql: string): ParsedSQL

  /**
   * Normalize SQL for consistent processing
   * @param sql - Raw SQL statement
   * @returns Normalized SQL (uppercase, trimmed, comments removed)
   */
  normalize(sql: string): string

  /**
   * Check if the SQL is supported for parsing
   * @param sql - SQL statement to check
   * @returns True if the SQL can be parsed
   */
  isSupported(sql: string): boolean
}
