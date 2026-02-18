/**
 * Infrastructure Layer - RuleRegistry
 * Manages collection of parsing rules
 */

import type { SearchQuery, IParsingRule, IRuleRegistry } from '@/domain/smart-search'

/**
 * Rule Registry Implementation
 * Singleton pattern for managing parsing rules
 */
export class RuleRegistry implements IRuleRegistry {
  private rules: IParsingRule[] = []
  private static instance: RuleRegistry | null = null

  private constructor() {}

  /**
   * Gets the singleton instance
   */
  static getInstance(): RuleRegistry {
    if (!RuleRegistry.instance) {
      RuleRegistry.instance = new RuleRegistry()
    }
    return RuleRegistry.instance
  }

  /**
   * Resets the singleton (useful for testing)
   */
  static reset(): void {
    RuleRegistry.instance = null
  }

  /**
   * Registers a new parsing rule
   */
  register(rule: IParsingRule): void {
    // Avoid duplicate registration
    if (this.rules.some(r => r.name === rule.name)) {
      return
    }
    this.rules.push(rule)
    // Sort by priority (descending)
    this.rules.sort((a, b) => b.priority - a.priority)
  }

  /**
   * Registers multiple rules at once
   */
  registerAll(rules: IParsingRule[]): void {
    for (const rule of rules) {
      this.register(rule)
    }
  }

  /**
   * Gets all registered rules sorted by priority
   */
  getRules(): IParsingRule[] {
    return [...this.rules]
  }

  /**
   * Gets rules that match the given query
   */
  getMatchingRules(query: SearchQuery): IParsingRule[] {
    return this.rules.filter(rule => rule.matches(query))
  }

  /**
   * Gets the count of registered rules
   */
  get ruleCount(): number {
    return this.rules.length
  }

  /**
   * Clears all registered rules
   */
  clear(): void {
    this.rules = []
  }
}
