/**
 * Infrastructure Layer - Oracle Index Metadata Repository
 * Implements IIndexMetadataRepository for Oracle database
 */

import type { IIndexMetadataRepository } from '@/domain/query-artifacts/repositories/IIndexMetadataRepository'
import type {
  ExistingIndex,
  ColumnStatistics,
  IndexColumn,
  IndexType,
  IndexStatus,
  SelectivityGrade,
} from '@/domain/query-artifacts/entities'
import type { OracleConnectionConfig } from '@/lib/oracle/types'
import { executeQuery } from '@/lib/oracle/client'

/**
 * Oracle implementation of Index Metadata Repository
 * Uses connectionId to lookup connection config from stored connections
 */
export class OracleIndexMetadataRepository implements IIndexMetadataRepository {
  private connectionConfigResolver: (connectionId: string) => Promise<OracleConnectionConfig>

  constructor(configResolver: (connectionId: string) => Promise<OracleConnectionConfig>) {
    this.connectionConfigResolver = configResolver
  }

  /**
   * Get indexes for specified tables
   */
  async getIndexesForTables(
    connectionId: string,
    owner: string,
    tableNames: string[]
  ): Promise<Map<string, ExistingIndex[]>> {
    const config = await this.connectionConfigResolver(connectionId)
    const result = new Map<string, ExistingIndex[]>()

    if (tableNames.length === 0) {
      return result
    }

    // Build placeholders for table names
    const tableBinds: Record<string, string> = {}
    const tablePlaceholders = tableNames.map((name, i) => {
      tableBinds[`table${i}`] = name.toUpperCase()
      return `:table${i}`
    }).join(', ')

    const query = `
      SELECT
        i.index_name as INDEX_NAME,
        i.table_name as TABLE_NAME,
        i.uniqueness as UNIQUENESS,
        i.index_type as INDEX_TYPE,
        i.status as STATUS,
        TO_CHAR(i.last_analyzed, 'YYYY-MM-DD HH24:MI:SS') as LAST_ANALYZED,
        i.distinct_keys as DISTINCT_KEYS,
        i.clustering_factor as CLUSTERING_FACTOR,
        ic.column_name as COLUMN_NAME,
        ic.column_position as COLUMN_POSITION,
        ic.descend as DESCEND
      FROM all_indexes i
      JOIN all_ind_columns ic ON i.index_name = ic.index_name AND i.owner = ic.index_owner
      WHERE i.table_name IN (${tablePlaceholders})
      AND i.owner = :owner
      ORDER BY i.index_name, ic.column_position
    `

    const binds = { ...tableBinds, owner: owner.toUpperCase() }

    try {
      const queryResult = await executeQuery<Record<string, unknown>>(config, query, binds)
      const indexMap = this.parseIndexResults(queryResult.rows || [])

      // Group by table name
      for (const [, index] of indexMap) {
        const tableIndexes = result.get(index.tableName) || []
        tableIndexes.push(index)
        result.set(index.tableName, tableIndexes)
      }
    } catch (error) {
      console.error('[OracleIndexMetadataRepository] Failed to get indexes:', error)
      // Return empty map on error
    }

    return result
  }

  /**
   * Get column statistics for analysis
   */
  async getColumnStatistics(
    connectionId: string,
    owner: string,
    tableName: string,
    columnNames: string[]
  ): Promise<ColumnStatistics[]> {
    const config = await this.connectionConfigResolver(connectionId)

    if (columnNames.length === 0) {
      return []
    }

    // Build placeholders for column names
    const columnBinds: Record<string, string> = {}
    const columnPlaceholders = columnNames.map((name, i) => {
      columnBinds[`col${i}`] = name.toUpperCase()
      return `:col${i}`
    }).join(', ')

    const query = `
      SELECT
        c.table_name as TABLE_NAME,
        c.column_name as COLUMN_NAME,
        c.num_distinct as NUM_DISTINCT,
        c.num_nulls as NUM_NULLS,
        c.density as DENSITY,
        c.histogram as HISTOGRAM,
        t.num_rows as NUM_ROWS
      FROM all_tab_col_statistics c
      JOIN all_tables t ON c.table_name = t.table_name AND c.owner = t.owner
      WHERE c.table_name = :tableName
      AND c.column_name IN (${columnPlaceholders})
      AND c.owner = :owner
    `

    const binds = {
      ...columnBinds,
      tableName: tableName.toUpperCase(),
      owner: owner.toUpperCase(),
    }

    try {
      const result = await executeQuery<Record<string, unknown>>(config, query, binds)
      return this.parseStatisticsResults(result.rows || [])
    } catch (error) {
      console.error('[OracleIndexMetadataRepository] Failed to get column statistics:', error)
      return []
    }
  }

  /**
   * Get row count for a table
   */
  async getTableRowCount(
    connectionId: string,
    owner: string,
    tableName: string
  ): Promise<number> {
    const config = await this.connectionConfigResolver(connectionId)

    const query = `
      SELECT num_rows as NUM_ROWS
      FROM all_tables
      WHERE table_name = :tableName
      AND owner = :owner
    `

    const binds = {
      tableName: tableName.toUpperCase(),
      owner: owner.toUpperCase(),
    }

    try {
      const result = await executeQuery<{ NUM_ROWS: number }>(config, query, binds)
      if (result.rows && result.rows.length > 0) {
        return result.rows[0].NUM_ROWS || 0
      }
    } catch (error) {
      console.error('[OracleIndexMetadataRepository] Failed to get table row count:', error)
    }

    return 0
  }

  private parseIndexResults(rows: Record<string, unknown>[]): Map<string, ExistingIndex> {
    const indexMap = new Map<string, ExistingIndex>()

    for (const row of rows) {
      const indexName = row.INDEX_NAME as string
      const tableName = row.TABLE_NAME as string

      if (!indexMap.has(indexName)) {
        indexMap.set(indexName, {
          indexName,
          tableName,
          columns: [],
          isUnique: row.UNIQUENESS === 'UNIQUE',
          indexType: this.parseIndexType(row.INDEX_TYPE as string),
          status: this.parseIndexStatus(row.STATUS as string),
          lastAnalyzed: row.LAST_ANALYZED ? new Date(row.LAST_ANALYZED as string) : undefined,
          distinctKeys: row.DISTINCT_KEYS as number | undefined,
          clusteringFactor: row.CLUSTERING_FACTOR as number | undefined,
        })
      }

      const index = indexMap.get(indexName)!
      const column: IndexColumn = {
        columnName: row.COLUMN_NAME as string,
        position: row.COLUMN_POSITION as number,
        descOrder: row.DESCEND === 'DESC',
      }
      index.columns.push(column)
    }

    return indexMap
  }

  private parseStatisticsResults(rows: Record<string, unknown>[]): ColumnStatistics[] {
    return rows.map(row => {
      const numDistinct = (row.NUM_DISTINCT as number) || 0
      const numRows = (row.NUM_ROWS as number) || 0
      const selectivity = numRows > 0 ? numDistinct / numRows : 1

      return {
        columnName: row.COLUMN_NAME as string,
        tableName: row.TABLE_NAME as string,
        numDistinct,
        numRows,
        numNulls: (row.NUM_NULLS as number) || 0,
        density: (row.DENSITY as number) || 0,
        histogram: row.HISTOGRAM as string | undefined,
        selectivity,
        selectivityGrade: this.calculateSelectivityGrade(selectivity),
      }
    })
  }

  private parseIndexType(type: string): IndexType {
    if (!type) return 'NORMAL'
    if (type.includes('BITMAP')) return 'BITMAP'
    if (type.includes('FUNCTION')) return 'FUNCTION_BASED'
    if (type.includes('REVERSE')) return 'REVERSE'
    return 'NORMAL'
  }

  private parseIndexStatus(status: string): IndexStatus {
    if (status === 'VALID') return 'VALID'
    if (status === 'UNUSABLE') return 'UNUSABLE'
    return 'INVALID'
  }

  private calculateSelectivityGrade(selectivity: number): SelectivityGrade {
    if (selectivity <= 0.001) return 'EXCELLENT'
    if (selectivity <= 0.01) return 'GOOD'
    if (selectivity <= 0.05) return 'FAIR'
    if (selectivity <= 0.10) return 'POOR'
    return 'VERY_POOR'
  }
}
