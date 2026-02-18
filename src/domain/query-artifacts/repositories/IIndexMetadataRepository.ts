/**
 * Domain Layer - Index Metadata Repository Port
 * Interface for index metadata persistence and retrieval
 */

import type { ExistingIndex, ColumnStatistics } from '../entities'

/**
 * Index Metadata Repository Port
 * Defines the contract for index metadata operations
 */
export interface IIndexMetadataRepository {
  /**
   * Get all indexes for specified tables
   * @param connectionId - Database connection ID
   * @param owner - Schema owner
   * @param tableNames - List of table names to query
   * @returns Map of table name to indexes
   */
  getIndexesForTables(
    connectionId: string,
    owner: string,
    tableNames: string[]
  ): Promise<Map<string, ExistingIndex[]>>

  /**
   * Get column statistics for specified columns
   * @param connectionId - Database connection ID
   * @param owner - Schema owner
   * @param tableName - Table name
   * @param columnNames - List of column names
   * @returns Column statistics array
   */
  getColumnStatistics(
    connectionId: string,
    owner: string,
    tableName: string,
    columnNames: string[]
  ): Promise<ColumnStatistics[]>

  /**
   * Get table row count
   * @param connectionId - Database connection ID
   * @param owner - Schema owner
   * @param tableName - Table name
   * @returns Number of rows in table
   */
  getTableRowCount(
    connectionId: string,
    owner: string,
    tableName: string
  ): Promise<number>
}
