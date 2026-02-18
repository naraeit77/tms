/**
 * Domain Layer - Query Artifacts Value Objects
 * Immutable value objects with domain logic
 */

import type { SelectivityGrade } from '../entities'

/**
 * Selectivity Value Object
 * Encapsulates selectivity calculation logic
 */
export class Selectivity {
  private readonly _value: number
  private readonly _grade: SelectivityGrade

  constructor(numDistinct: number, numRows: number) {
    this._value = numRows > 0 ? numDistinct / numRows : 1
    this._grade = this.calculateGrade(this._value)
  }

  get value(): number {
    return this._value
  }

  get grade(): SelectivityGrade {
    return this._grade
  }

  get percentage(): string {
    return `${(this._value * 100).toFixed(2)}%`
  }

  get isGoodForIndex(): boolean {
    return this._value <= 0.05 // 5% or better
  }

  private calculateGrade(selectivity: number): SelectivityGrade {
    if (selectivity <= 0.001) return 'EXCELLENT' // 0.1% or less
    if (selectivity <= 0.01) return 'GOOD' // 1% or less
    if (selectivity <= 0.05) return 'FAIR' // 5% or less
    if (selectivity <= 0.10) return 'POOR' // 10% or less
    return 'VERY_POOR' // More than 10%
  }

  static fromStatistics(numDistinct: number, numRows: number): Selectivity {
    return new Selectivity(numDistinct, numRows)
  }
}

/**
 * Health Score Value Object
 * Represents query health based on index coverage
 */
export class HealthScore {
  private readonly _value: number

  constructor(
    existingIndexCount: number,
    requiredIndexCount: number,
    criticalIssueCount: number
  ) {
    let score = 100

    // Deduct for missing indexes
    const missingCount = Math.max(0, requiredIndexCount - existingIndexCount)
    score -= missingCount * 10

    // Deduct heavily for critical issues
    score -= criticalIssueCount * 30

    this._value = Math.max(0, Math.min(100, score))
  }

  get value(): number {
    return this._value
  }

  get grade(): string {
    if (this._value >= 90) return 'A'
    if (this._value >= 75) return 'B'
    if (this._value >= 60) return 'C'
    if (this._value >= 40) return 'D'
    return 'F'
  }

  get color(): string {
    if (this._value >= 90) return '#22c55e' // green
    if (this._value >= 75) return '#84cc16' // lime
    if (this._value >= 60) return '#f59e0b' // amber
    if (this._value >= 40) return '#ef4444' // red
    return '#dc2626' // dark red
  }

  get label(): string {
    if (this._value >= 90) return 'Excellent'
    if (this._value >= 75) return 'Good'
    if (this._value >= 60) return 'Average'
    if (this._value >= 40) return 'Warning'
    return 'Critical'
  }
}

/**
 * Index Candidate Score Value Object
 * Calculates index candidate eligibility score
 */
export class IndexCandidateScore {
  private readonly _score: number
  private readonly _reasons: string[]
  private readonly _excludeReasons: string[]

  constructor(
    conditionType: string,
    operator: string,
    selectivity?: number,
    nullRatio?: number
  ) {
    let score = 50 // Base score
    const reasons: string[] = []
    const excludeReasons: string[] = []

    // Evaluate condition type
    if (conditionType === 'JOIN') {
      score += 30
      reasons.push('조인 연결 컬럼 - 인덱스 필수')
    }

    // Evaluate operator
    if (operator === '=') {
      score += 20
      reasons.push('등호(=) 조건 - 인덱스 효율 높음')
    } else if (operator === 'LIKE') {
      score -= 30
      excludeReasons.push('LIKE 조건 - 인덱스 사용 제한적')
    } else if (['BETWEEN', '>', '<', '>=', '<='].includes(operator)) {
      score += 10
      reasons.push('범위 조건 - 인덱스 부분 사용')
    } else if (operator === 'IN') {
      score += 15
      reasons.push('IN 조건 - 인덱스 사용 가능')
    }

    // Evaluate selectivity
    if (selectivity !== undefined) {
      if (selectivity <= 0.01) {
        score += 20
        reasons.push(`선택도 우수 (${(selectivity * 100).toFixed(2)}%)`)
      } else if (selectivity >= 0.50) {
        score -= 30
        excludeReasons.push(
          `선택도 나쁨 (${(selectivity * 100).toFixed(0)}%) - 풀스캔 권장`
        )
      }
    }

    // Evaluate NULL ratio
    if (nullRatio !== undefined && nullRatio > 0.5) {
      score -= 20
      excludeReasons.push(`NULL 비율 높음 (${(nullRatio * 100).toFixed(0)}%)`)
    }

    this._score = Math.max(0, Math.min(100, score))
    this._reasons = reasons
    this._excludeReasons = excludeReasons
  }

  get score(): number {
    return this._score
  }

  get isCandidate(): boolean {
    return this._score >= 50 && this._excludeReasons.length === 0
  }

  get reasons(): string[] {
    return [...this._reasons]
  }

  get excludeReasons(): string[] {
    return [...this._excludeReasons]
  }
}

/**
 * Table Name Value Object
 * Handles schema.table naming conventions
 */
export class TableName {
  private readonly _schema?: string
  private readonly _name: string
  private readonly _alias?: string

  constructor(name: string, schema?: string, alias?: string) {
    this._name = name.toUpperCase()
    this._schema = schema?.toUpperCase()
    this._alias = alias?.toUpperCase()
  }

  get name(): string {
    return this._name
  }

  get schema(): string | undefined {
    return this._schema
  }

  get alias(): string | undefined {
    return this._alias
  }

  get fullName(): string {
    return this._schema ? `${this._schema}.${this._name}` : this._name
  }

  get displayName(): string {
    return this._alias || this._name
  }

  equals(other: TableName): boolean {
    return this._name === other._name && this._schema === other._schema
  }

  static parse(input: string): TableName {
    const parts = input.trim().split(/\s+/)
    const namePart = parts[0]
    const alias = parts[1]

    if (namePart.includes('.')) {
      const [schema, name] = namePart.split('.')
      return new TableName(name, schema, alias)
    }

    return new TableName(namePart, undefined, alias)
  }
}
