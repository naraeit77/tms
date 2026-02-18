/**
 * Infrastructure Layer - Regex SQL Parser
 * Implements ISQLParser using regex-based parsing
 *
 * Supports:
 * - SELECT queries (with/without CTE)
 * - UPDATE ... WHERE
 * - DELETE ... WHERE
 * - INSERT ... SELECT
 * - PL/SQL detection (returns unsupported)
 */

import type { ISQLParser } from '@/domain/query-artifacts/ports/ISQLParser'
import type {
  ParsedSQL,
  ParsedTable,
  ParsedColumn,
  ParsedJoin,
  SqlOperator,
  JoinType,
} from '@/domain/query-artifacts/entities'

/** SQL statement type classification */
type SqlStatementType =
  | 'SELECT'
  | 'WITH_SELECT'
  | 'UPDATE'
  | 'DELETE'
  | 'INSERT_SELECT'
  | 'INSERT_VALUES'
  | 'MERGE'
  | 'PLSQL'
  | 'UNSUPPORTED'

/**
 * Regex-based SQL Parser
 * Provides SQL parsing for Index Creation Diagram
 */
export class RegexSQLParser implements ISQLParser {
  private tableCounter = 0
  private columnCounter = 0
  private joinCounter = 0

  /**
   * Normalize SQL for consistent processing
   */
  normalize(sql: string): string {
    return sql
      .replace(/--.*$/gm, '') // Remove single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments (including hints)
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\s*,\s*/g, ', ') // Normalize commas
      .replace(/\s*=\s*/g, ' = ') // Normalize equals
      .replace(/\s*<>\s*/g, ' <> ') // Normalize not equals
      .replace(/\s*>=\s*/g, ' >= ') // Normalize >=
      .replace(/\s*<=\s*/g, ' <= ') // Normalize <=
      .trim()
      .toUpperCase()
  }

  /**
   * Check if SQL is supported for parsing
   */
  isSupported(sql: string): boolean {
    const normalized = this.normalize(sql)
    const type = this.detectStatementType(normalized)
    return type !== 'UNSUPPORTED' && type !== 'PLSQL' && type !== 'INSERT_VALUES' && type !== 'MERGE'
  }

  /**
   * Parse SQL statement
   */
  parse(sql: string): ParsedSQL {
    this.resetCounters()
    const normalizedSql = this.normalize(sql)

    // Preprocess SQL based on statement type to a SELECT-compatible form
    const processedSql = this.preprocessSQL(normalizedSql)

    const tables = this.parseTables(processedSql)
    const joins = this.parseJoins(processedSql, tables)
    const columns = this.parseColumns(processedSql, tables, joins)
    const orderByColumns = this.parseOrderBy(processedSql)
    const groupByColumns = this.parseGroupBy(processedSql)

    return {
      tables,
      columns,
      joins,
      orderByColumns,
      groupByColumns,
      originalSql: sql,
      normalizedSql,
    }
  }

  // ===========================================================================
  // Statement Type Detection
  // ===========================================================================

  /**
   * Detect SQL statement type
   */
  private detectStatementType(normalizedSql: string): SqlStatementType {
    // PL/SQL check first (contains embedded SQL)
    if (this.checkPLSQL(normalizedSql)) return 'PLSQL'

    if (/^\s*WITH\b/.test(normalizedSql)) return 'WITH_SELECT'
    if (/^\s*SELECT\b/.test(normalizedSql)) return 'SELECT'
    if (/^\s*UPDATE\b/.test(normalizedSql)) return 'UPDATE'
    if (/^\s*DELETE\b/.test(normalizedSql)) return 'DELETE'
    if (/^\s*MERGE\b/.test(normalizedSql)) return 'MERGE'
    if (/^\s*INSERT\b/.test(normalizedSql)) {
      // INSERT...SELECT vs INSERT...VALUES
      const selectIdx = this.findTopLevelKeyword(normalizedSql, 'SELECT')
      if (selectIdx >= 0) return 'INSERT_SELECT'
      return 'INSERT_VALUES'
    }
    return 'UNSUPPORTED'
  }

  /**
   * Check if SQL is a PL/SQL block
   */
  private checkPLSQL(sql: string): boolean {
    return /^\s*(DECLARE\b|BEGIN\b|CREATE\s+(OR\s+REPLACE\s+)?(PROCEDURE|FUNCTION|PACKAGE|TRIGGER|TYPE)\b)/i.test(sql)
  }

  // ===========================================================================
  // SQL Preprocessing (transform to SELECT-compatible form)
  // ===========================================================================

  /**
   * Preprocess SQL based on statement type
   * Transforms UPDATE/DELETE/INSERT/WITH to a SELECT form for unified parsing
   */
  private preprocessSQL(normalizedSql: string): string {
    const type = this.detectStatementType(normalizedSql)

    switch (type) {
      case 'WITH_SELECT': {
        const { mainSQL } = this.stripCTEs(normalizedSql)
        return mainSQL
      }
      case 'UPDATE':
        return this.transformUpdateToSelect(normalizedSql)
      case 'DELETE':
        return this.transformDeleteToSelect(normalizedSql)
      case 'INSERT_SELECT':
        return this.extractInsertSelect(normalizedSql)
      default:
        return normalizedSql
    }
  }

  /**
   * Strip CTE (WITH) definitions and return main SELECT
   * Handles nested parentheses in CTE bodies
   */
  private stripCTEs(sql: string): { mainSQL: string; cteNames: string[] } {
    const cteNames: string[] = []

    const withMatch = sql.match(/^(\s*WITH\s+)/i)
    if (!withMatch) return { mainSQL: sql, cteNames }

    let pos = withMatch[0].length

    while (pos < sql.length) {
      // Extract CTE name: NAME AS (
      const remaining = sql.substring(pos)
      const nameMatch = remaining.match(/^([A-Z_][A-Z0-9_]*)\s+AS\s*\(/i)
      if (!nameMatch) break

      cteNames.push(nameMatch[1])
      pos += nameMatch[0].length // Position after opening paren

      // Skip balanced parentheses
      let depth = 1
      while (pos < sql.length && depth > 0) {
        if (sql[pos] === '(') depth++
        else if (sql[pos] === ')') depth--
        pos++
      }

      // Skip whitespace
      while (pos < sql.length && /\s/.test(sql[pos])) pos++

      // Check for comma (more CTEs) or end
      if (pos < sql.length && sql[pos] === ',') {
        pos++
        while (pos < sql.length && /\s/.test(sql[pos])) pos++
      } else {
        break
      }
    }

    const mainSQL = sql.substring(pos).trim()
    return { mainSQL, cteNames }
  }

  /**
   * Transform UPDATE to SELECT for unified parsing
   * UPDATE [schema.]table [alias] SET ... WHERE ... → SELECT * FROM table [alias] WHERE ...
   */
  private transformUpdateToSelect(sql: string): string {
    // Match: UPDATE table_name
    const match = sql.match(/^\s*UPDATE\s+([A-Z_][A-Z0-9_]*(?:\.[A-Z_][A-Z0-9_]*)?)\s+/i)
    if (!match) return sql

    const tableName = match[1]
    let rest = sql.substring(match[0].length)
    let alias = ''

    // Check if next word is an alias (not SET)
    const nextWord = rest.match(/^([A-Z_][A-Z0-9_]*)\s+/i)
    if (nextWord && nextWord[1].toUpperCase() !== 'SET') {
      alias = ' ' + nextWord[1]
      rest = rest.substring(nextWord[0].length)
    }

    // Skip past SET keyword
    if (!/^SET\b/i.test(rest)) return sql
    const afterSet = rest.substring(3)

    // Find top-level WHERE after SET (not inside subquery parentheses)
    const whereIdx = this.findTopLevelKeyword(afterSet, 'WHERE')

    if (whereIdx >= 0) {
      return `SELECT * FROM ${tableName}${alias} ${afterSet.substring(whereIdx)}`
    }
    return `SELECT * FROM ${tableName}${alias}`
  }

  /**
   * Transform DELETE to SELECT for unified parsing
   * DELETE [FROM] [schema.]table [alias] WHERE ... → SELECT * FROM table [alias] WHERE ...
   */
  private transformDeleteToSelect(sql: string): string {
    // Match: DELETE [FROM] table_name
    const match = sql.match(/^\s*DELETE\s+(?:FROM\s+)?([A-Z_][A-Z0-9_]*(?:\.[A-Z_][A-Z0-9_]*)?)\s*/i)
    if (!match) return sql

    const tableName = match[1]
    let rest = sql.substring(match[0].length)
    let alias = ''

    // Check if next word is an alias (not WHERE, ORDER, etc.)
    const keywords = new Set(['WHERE', 'ORDER', 'GROUP', 'HAVING', 'RETURNING', 'LOG', 'SUBPARTITION', 'PARTITION'])
    const nextWord = rest.match(/^([A-Z_][A-Z0-9_]*)\s*/i)
    if (nextWord && !keywords.has(nextWord[1].toUpperCase())) {
      alias = ' ' + nextWord[1]
      rest = rest.substring(nextWord[0].length)
    }

    // Find WHERE clause
    const whereMatch = rest.match(/^(WHERE\b.*)/is)
    if (whereMatch) {
      return `SELECT * FROM ${tableName}${alias} ${whereMatch[1]}`
    }
    return `SELECT * FROM ${tableName}${alias}`
  }

  /**
   * Extract SELECT portion from INSERT...SELECT
   * INSERT INTO [schema.]table [(cols)] SELECT ... → SELECT ...
   */
  private extractInsertSelect(sql: string): string {
    const selectIdx = this.findTopLevelKeyword(sql, 'SELECT')
    if (selectIdx >= 0) {
      return sql.substring(selectIdx)
    }
    return sql
  }

  /**
   * Find keyword at top level (not inside parentheses)
   */
  private findTopLevelKeyword(sql: string, keyword: string): number {
    let depth = 0
    const len = keyword.length

    for (let i = 0; i <= sql.length - len; i++) {
      const ch = sql[i]
      if (ch === '(') { depth++; continue }
      if (ch === ')') { depth--; continue }
      if (ch === "'") {
        // Skip string literal
        i++
        while (i < sql.length && sql[i] !== "'") i++
        continue
      }

      if (depth === 0 && sql.substring(i, i + len) === keyword) {
        const before = i === 0 || /[\s,)]/.test(sql[i - 1])
        const after = i + len >= sql.length || /[\s(]/.test(sql[i + len])
        if (before && after) return i
      }
    }
    return -1
  }

  // ===========================================================================
  // Internal Counters
  // ===========================================================================

  private resetCounters(): void {
    this.tableCounter = 0
    this.columnCounter = 0
    this.joinCounter = 0
  }

  private generateTableId(): string {
    return `table_${++this.tableCounter}`
  }

  private generateColumnId(): string {
    return `column_${++this.columnCounter}`
  }

  private generateJoinId(): string {
    return `join_${++this.joinCounter}`
  }

  // ===========================================================================
  // Table Parsing
  // ===========================================================================

  /**
   * Parse tables from FROM and JOIN clauses
   */
  private parseTables(sql: string): ParsedTable[] {
    const tables: ParsedTable[] = []
    const tableMap = new Map<string, ParsedTable>()

    // Parse FROM clause
    const fromMatch = sql.match(/\bFROM\s+([A-Z_][A-Z0-9_]*(?:\.[A-Z_][A-Z0-9_]*)?)\s*(?:AS\s+)?([A-Z_][A-Z0-9_]*)?/i)
    if (fromMatch) {
      const table = this.createTable(fromMatch[1], fromMatch[2])
      tables.push(table)
      tableMap.set(table.alias, table)
    }

    // Parse JOIN clauses
    const joinRegex = /\b(LEFT\s+OUTER\s+JOIN|RIGHT\s+OUTER\s+JOIN|FULL\s+OUTER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|JOIN|CROSS\s+JOIN)\s+([A-Z_][A-Z0-9_]*(?:\.[A-Z_][A-Z0-9_]*)?)\s*(?:AS\s+)?([A-Z_][A-Z0-9_]*)?/gi
    let joinMatch
    while ((joinMatch = joinRegex.exec(sql)) !== null) {
      const joinType = this.normalizeJoinType(joinMatch[1])
      const isOuterJoinTarget = joinType.includes('OUTER') || joinType === 'LEFT_OUTER' || joinType === 'RIGHT_OUTER'
      const table = this.createTable(joinMatch[2], joinMatch[3], isOuterJoinTarget)
      if (!tableMap.has(table.alias)) {
        tables.push(table)
        tableMap.set(table.alias, table)
      }
    }

    // Parse comma-separated tables in FROM clause
    const fromClauseMatch = sql.match(/\bFROM\s+(.+?)(?:\bWHERE\b|\bORDER\s+BY\b|\bGROUP\s+BY\b|\bHAVING\b|$)/i)
    if (fromClauseMatch) {
      const fromClause = fromClauseMatch[1]
      // Only process if there are no JOINs in the clause
      if (!/\bJOIN\b/i.test(fromClause)) {
        const tableParts = fromClause.split(',')
        for (const part of tableParts) {
          const trimmed = part.trim()
          const tableMatch = trimmed.match(/^([A-Z_][A-Z0-9_]*(?:\.[A-Z_][A-Z0-9_]*)?)\s*(?:AS\s+)?([A-Z_][A-Z0-9_]*)?$/i)
          if (tableMatch && !tableMap.has(tableMatch[2] || tableMatch[1])) {
            const table = this.createTable(tableMatch[1], tableMatch[2])
            tables.push(table)
            tableMap.set(table.alias, table)
          }
        }
      }
    }

    return tables
  }

  private createTable(fullName: string, alias?: string, isOuterJoinTarget = false): ParsedTable {
    const parts = fullName.split('.')
    const schema = parts.length > 1 ? parts[0] : undefined
    const name = parts.length > 1 ? parts[1] : parts[0]
    const tableAlias = alias || name

    return {
      id: this.generateTableId(),
      name,
      schema,
      alias: tableAlias,
      isOuterJoinTarget,
    }
  }

  private normalizeJoinType(joinStr: string): JoinType {
    const upper = joinStr.toUpperCase().replace(/\s+/g, ' ')
    if (upper.includes('LEFT')) return 'LEFT_OUTER'
    if (upper.includes('RIGHT')) return 'RIGHT_OUTER'
    if (upper.includes('FULL')) return 'FULL_OUTER'
    if (upper.includes('CROSS')) return 'CROSS'
    return 'INNER'
  }

  // ===========================================================================
  // Join Parsing
  // ===========================================================================

  /**
   * Parse JOIN conditions
   */
  private parseJoins(sql: string, tables: ParsedTable[]): ParsedJoin[] {
    const joins: ParsedJoin[] = []
    const tableByAlias = new Map(tables.map(t => [t.alias, t]))
    const tableByName = new Map(tables.map(t => [t.name, t]))

    // Parse explicit JOIN ON conditions
    const joinOnRegex = /\b(LEFT\s+OUTER\s+JOIN|RIGHT\s+OUTER\s+JOIN|FULL\s+OUTER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|JOIN)\s+([A-Z_][A-Z0-9_]*(?:\.[A-Z_][A-Z0-9_]*)?)\s*(?:AS\s+)?([A-Z_][A-Z0-9_]*)?\s+ON\s+([^(LEFT|RIGHT|INNER|FULL|JOIN|WHERE|ORDER|GROUP|HAVING)]+)/gi
    let match
    while ((match = joinOnRegex.exec(sql)) !== null) {
      const joinType = this.normalizeJoinType(match[1])
      const targetTableName = match[2].includes('.') ? match[2].split('.')[1] : match[2]
      const targetAlias = match[3] || targetTableName
      const onCondition = match[4].trim()

      const parsedCondition = this.parseJoinCondition(onCondition, tableByAlias, tableByName, targetAlias)
      if (parsedCondition) {
        joins.push({
          id: this.generateJoinId(),
          ...parsedCondition,
          joinType,
        })
      }
    }

    // Parse WHERE clause join conditions (implicit joins)
    const whereMatch = sql.match(/\bWHERE\s+(.+?)(?:\bORDER\s+BY\b|\bGROUP\s+BY\b|\bHAVING\b|$)/i)
    if (whereMatch) {
      const whereClause = whereMatch[1]
      const implicitJoins = this.parseImplicitJoins(whereClause, tableByAlias, tableByName)
      joins.push(...implicitJoins)
    }

    return joins
  }

  private parseJoinCondition(
    condition: string,
    tableByAlias: Map<string, ParsedTable>,
    tableByName: Map<string, ParsedTable>,
    _targetAlias: string
  ): Omit<ParsedJoin, 'id' | 'joinType'> | null {
    // Pattern: alias1.column1 = alias2.column2
    const equalityMatch = condition.match(
      /([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)\s*=\s*([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)/i
    )

    if (equalityMatch) {
      const [, leftAlias, leftColumn, rightAlias, rightColumn] = equalityMatch
      const leftTable = tableByAlias.get(leftAlias) || tableByName.get(leftAlias)
      const rightTable = tableByAlias.get(rightAlias) || tableByName.get(rightAlias)

      if (leftTable && rightTable) {
        return {
          sourceTableId: leftTable.id,
          sourceColumnId: `${leftTable.id}_${leftColumn}`,
          targetTableId: rightTable.id,
          targetColumnId: `${rightTable.id}_${rightColumn}`,
        }
      }
    }

    return null
  }

  private parseImplicitJoins(
    whereClause: string,
    tableByAlias: Map<string, ParsedTable>,
    tableByName: Map<string, ParsedTable>
  ): ParsedJoin[] {
    const joins: ParsedJoin[] = []

    // Find all equality conditions between two table columns
    const joinConditionRegex = /([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)\s*=\s*([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)/gi
    let match
    while ((match = joinConditionRegex.exec(whereClause)) !== null) {
      const [, leftAlias, leftColumn, rightAlias, rightColumn] = match
      const leftTable = tableByAlias.get(leftAlias) || tableByName.get(leftAlias)
      const rightTable = tableByAlias.get(rightAlias) || tableByName.get(rightAlias)

      if (leftTable && rightTable && leftTable.id !== rightTable.id) {
        joins.push({
          id: this.generateJoinId(),
          sourceTableId: leftTable.id,
          sourceColumnId: `${leftTable.id}_${leftColumn}`,
          targetTableId: rightTable.id,
          targetColumnId: `${rightTable.id}_${rightColumn}`,
          joinType: 'INNER',
        })
      }
    }

    return joins
  }

  // ===========================================================================
  // Column Parsing
  // ===========================================================================

  /**
   * Parse columns from WHERE, SELECT, ORDER BY clauses
   */
  private parseColumns(sql: string, tables: ParsedTable[], joins: ParsedJoin[]): ParsedColumn[] {
    const columns: ParsedColumn[] = []
    const columnSet = new Set<string>()
    const tableByAlias = new Map(tables.map(t => [t.alias, t]))
    const tableByName = new Map(tables.map(t => [t.name, t]))

    // Build join column map for condition type detection
    const joinColumns = new Set<string>()
    for (const join of joins) {
      joinColumns.add(join.sourceColumnId)
      joinColumns.add(join.targetColumnId)
    }

    // Parse WHERE clause columns
    const whereMatch = sql.match(/\bWHERE\s+(.+?)(?:\bORDER\s+BY\b|\bGROUP\s+BY\b|\bHAVING\b|$)/i)
    if (whereMatch) {
      const whereColumns = this.parseWhereColumns(whereMatch[1], tableByAlias, tableByName, joinColumns)
      for (const col of whereColumns) {
        const key = `${col.tableId}_${col.name}`
        if (!columnSet.has(key)) {
          columnSet.add(key)
          columns.push(col)
        }
      }
    }

    // Parse ORDER BY columns
    const orderByMatch = sql.match(/\bORDER\s+BY\s+(.+?)(?:\bLIMIT\b|\bOFFSET\b|\bFETCH\b|$)/i)
    if (orderByMatch) {
      const orderColumns = this.parseOrderByColumns(orderByMatch[1], tableByAlias, tableByName)
      for (const col of orderColumns) {
        const key = `${col.tableId}_${col.name}`
        if (!columnSet.has(key)) {
          columnSet.add(key)
          columns.push(col)
        }
      }
    }

    // Parse GROUP BY columns
    const groupByMatch = sql.match(/\bGROUP\s+BY\s+(.+?)(?:\bHAVING\b|\bORDER\s+BY\b|$)/i)
    if (groupByMatch) {
      const groupColumns = this.parseGroupByColumns(groupByMatch[1], tableByAlias, tableByName)
      for (const col of groupColumns) {
        const key = `${col.tableId}_${col.name}`
        if (!columnSet.has(key)) {
          columnSet.add(key)
          columns.push(col)
        }
      }
    }

    return columns
  }

  private parseWhereColumns(
    whereClause: string,
    tableByAlias: Map<string, ParsedTable>,
    tableByName: Map<string, ParsedTable>,
    joinColumns: Set<string>
  ): ParsedColumn[] {
    const columns: ParsedColumn[] = []

    // Parse various condition patterns
    const patterns: Array<{ regex: RegExp; operator: SqlOperator }> = [
      { regex: /([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)\s*=\s*:([A-Z_][A-Z0-9_]*)/gi, operator: '=' },
      { regex: /([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)\s*=\s*'[^']*'/gi, operator: '=' },
      { regex: /([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)\s*=\s*\d+/gi, operator: '=' },
      { regex: /([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)\s+LIKE\s+/gi, operator: 'LIKE' },
      { regex: /([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)\s+BETWEEN\s+/gi, operator: 'BETWEEN' },
      { regex: /([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)\s+IN\s*\(/gi, operator: 'IN' },
      { regex: /([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)\s+NOT\s+IN\s*\(/gi, operator: 'NOT IN' },
      { regex: /([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)\s+IS\s+NULL/gi, operator: 'IS NULL' },
      { regex: /([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)\s+IS\s+NOT\s+NULL/gi, operator: 'IS NOT NULL' },
      { regex: /([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)\s*>=\s*/gi, operator: '>=' },
      { regex: /([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)\s*<=\s*/gi, operator: '<=' },
      { regex: /([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)\s*>\s*/gi, operator: '>' },
      { regex: /([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)\s*<\s*/gi, operator: '<' },
    ]

    for (const { regex, operator } of patterns) {
      let match
      while ((match = regex.exec(whereClause)) !== null) {
        const [fullMatch, alias, columnName] = match
        const table = tableByAlias.get(alias) || tableByName.get(alias)

        if (table) {
          const columnId = `${table.id}_${columnName}`
          const isJoinColumn = joinColumns.has(columnId)
          const isBindVariable = fullMatch.includes(':') || /\?/.test(fullMatch)

          columns.push({
            id: this.generateColumnId(),
            tableId: table.id,
            tableName: table.name,
            name: columnName,
            condition: {
              type: isJoinColumn ? 'JOIN' : 'WHERE',
              operator,
              isBindVariable,
            },
          })
        }
      }
    }

    // Also parse simple column references without alias prefix
    const simplePatterns: Array<{ regex: RegExp; operator: SqlOperator }> = [
      { regex: /\b([A-Z_][A-Z0-9_]*)\s*=\s*:([A-Z_][A-Z0-9_]*)/gi, operator: '=' },
      { regex: /\b([A-Z_][A-Z0-9_]*)\s*=\s*'[^']*'/gi, operator: '=' },
      { regex: /\b([A-Z_][A-Z0-9_]*)\s*=\s*\d+/gi, operator: '=' },
    ]

    for (const { regex, operator } of simplePatterns) {
      let match
      while ((match = regex.exec(whereClause)) !== null) {
        const [fullMatch, columnName] = match
        // Skip if it looks like table.column pattern
        if (/[A-Z_][A-Z0-9_]*\.[A-Z_][A-Z0-9_]*/i.test(fullMatch)) continue

        // Try to find the table for this column (use first table as default)
        const defaultTable = tableByAlias.values().next().value || tableByName.values().next().value
        if (defaultTable) {
          const isBindVariable = fullMatch.includes(':')
          columns.push({
            id: this.generateColumnId(),
            tableId: defaultTable.id,
            tableName: defaultTable.name,
            name: columnName,
            condition: {
              type: 'WHERE',
              operator,
              isBindVariable,
            },
          })
        }
      }
    }

    return columns
  }

  private parseOrderByColumns(
    orderByClause: string,
    tableByAlias: Map<string, ParsedTable>,
    tableByName: Map<string, ParsedTable>
  ): ParsedColumn[] {
    const columns: ParsedColumn[] = []
    const columnSet = new Set<string>()

    // SQL 예약어 및 무시할 키워드
    const ignoredKeywords = new Set([
      'ASC', 'DESC', 'NULLS', 'FIRST', 'LAST',
      'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT',
      'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET',
      'VALUE', 'RETURNING', 'CLOB', 'INTO', 'AS'
    ])

    // 테이블 별칭/이름 목록
    const tableAliases = new Set([...tableByAlias.keys(), ...tableByName.keys()])

    // ORDER BY 절을 쉼표로 분리
    const parts = orderByClause.split(',')

    for (const part of parts) {
      const trimmed = part.trim()

      // 테이블.컬럼 형식 파싱
      const aliasedMatch = trimmed.match(/^([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)/i)
      if (aliasedMatch) {
        const alias = aliasedMatch[1]
        const columnName = aliasedMatch[2]
        const table = tableByAlias.get(alias) || tableByName.get(alias)

        if (table && !columnSet.has(`${table.id}_${columnName}`)) {
          columnSet.add(`${table.id}_${columnName}`)
          columns.push({
            id: this.generateColumnId(),
            tableId: table.id,
            tableName: table.name,
            name: columnName,
            condition: {
              type: 'ORDER_BY',
              operator: '=',
              isBindVariable: false,
            },
          })
        }
        continue
      }

      // 단순 컬럼명 (테이블이 하나일 때만)
      const simpleMatch = trimmed.match(/^([A-Z_][A-Z0-9_]*)/i)
      if (simpleMatch) {
        const columnName = simpleMatch[1]

        // 예약어나 테이블 별칭은 무시
        if (ignoredKeywords.has(columnName) || tableAliases.has(columnName)) {
          continue
        }

        // 테이블이 하나일 때만 단순 컬럼명 처리
        if (tableByAlias.size === 1) {
          const table = tableByAlias.values().next().value
          if (table && !columnSet.has(`${table.id}_${columnName}`)) {
            columnSet.add(`${table.id}_${columnName}`)
            columns.push({
              id: this.generateColumnId(),
              tableId: table.id,
              tableName: table.name,
              name: columnName,
              condition: {
                type: 'ORDER_BY',
                operator: '=',
                isBindVariable: false,
              },
            })
          }
        }
      }
    }

    return columns
  }

  private parseGroupByColumns(
    groupByClause: string,
    tableByAlias: Map<string, ParsedTable>,
    tableByName: Map<string, ParsedTable>
  ): ParsedColumn[] {
    const columns: ParsedColumn[] = []
    const parts = groupByClause.split(',')

    for (const part of parts) {
      const trimmed = part.trim()
      const match = trimmed.match(/([A-Z_][A-Z0-9_]*)\.([A-Z_][A-Z0-9_]*)|([A-Z_][A-Z0-9_]*)/i)

      if (match) {
        const alias = match[1]
        const columnName = match[2] || match[3]

        const table = alias
          ? (tableByAlias.get(alias) || tableByName.get(alias))
          : tableByAlias.values().next().value

        if (table && columnName) {
          columns.push({
            id: this.generateColumnId(),
            tableId: table.id,
            tableName: table.name,
            name: columnName,
            condition: {
              type: 'GROUP_BY',
              operator: '=',
              isBindVariable: false,
            },
          })
        }
      }
    }

    return columns
  }

  // ===========================================================================
  // ORDER BY / GROUP BY Column Name Extraction
  // ===========================================================================

  /**
   * Parse ORDER BY column names
   */
  private parseOrderBy(sql: string): string[] {
    const match = sql.match(/\bORDER\s+BY\s+(.+?)(?:\bLIMIT\b|\bOFFSET\b|\bFETCH\b|$)/i)
    if (!match) return []

    const orderByClause = match[1]
    const columns: string[] = []
    const parts = orderByClause.split(',')

    for (const part of parts) {
      const trimmed = part.trim()
      const columnMatch = trimmed.match(/([A-Z_][A-Z0-9_]*\.)?([A-Z_][A-Z0-9_]*)/i)
      if (columnMatch) {
        columns.push(columnMatch[2])
      }
    }

    return columns
  }

  /**
   * Parse GROUP BY column names
   */
  private parseGroupBy(sql: string): string[] {
    const match = sql.match(/\bGROUP\s+BY\s+(.+?)(?:\bHAVING\b|\bORDER\s+BY\b|$)/i)
    if (!match) return []

    const groupByClause = match[1]
    const columns: string[] = []
    const parts = groupByClause.split(',')

    for (const part of parts) {
      const trimmed = part.trim()
      const columnMatch = trimmed.match(/([A-Z_][A-Z0-9_]*\.)?([A-Z_][A-Z0-9_]*)/i)
      if (columnMatch) {
        columns.push(columnMatch[2])
      }
    }

    return columns
  }
}
