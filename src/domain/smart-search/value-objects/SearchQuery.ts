/**
 * Domain Layer - SearchQuery Value Object
 * Encapsulates user's natural language search query
 */

export class SearchQuery {
  private constructor(
    public readonly rawInput: string,
    public readonly normalizedInput: string,
    public readonly tokens: string[]
  ) {}

  /**
   * Creates a SearchQuery from raw user input
   */
  static create(rawInput: string): SearchQuery {
    if (!rawInput || rawInput.trim().length === 0) {
      throw new Error('Search query cannot be empty')
    }

    const trimmed = rawInput.trim()
    const normalized = this.normalize(trimmed)
    const tokens = this.tokenize(normalized)

    return new SearchQuery(trimmed, normalized, tokens)
  }

  /**
   * Normalizes the input string
   * - Converts to lowercase
   * - Removes extra whitespace
   * - Normalizes Korean/English variations
   */
  private static normalize(input: string): string {
    return input
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/["""'']/g, '"') // Normalize quotes
      .trim()
  }

  /**
   * Tokenizes the normalized input into meaningful tokens
   */
  private static tokenize(normalized: string): string[] {
    // Split by spaces but keep quoted phrases together
    const tokens: string[] = []
    const regex = /"([^"]+)"|(\S+)/g
    let match

    while ((match = regex.exec(normalized)) !== null) {
      tokens.push(match[1] || match[2])
    }

    return tokens.filter(t => t.length > 0)
  }

  /**
   * Checks if query contains any of the given keywords
   */
  containsAny(keywords: string[]): boolean {
    const normalizedKeywords = keywords.map(k => k.toLowerCase())
    return this.tokens.some(token =>
      normalizedKeywords.some(keyword => token.includes(keyword))
    ) || normalizedKeywords.some(keyword =>
      this.normalizedInput.includes(keyword)
    )
  }

  /**
   * Checks if query contains all of the given keywords
   */
  containsAll(keywords: string[]): boolean {
    const normalizedKeywords = keywords.map(k => k.toLowerCase())
    return normalizedKeywords.every(keyword =>
      this.normalizedInput.includes(keyword)
    )
  }

  /**
   * Extracts numeric values from the query
   */
  extractNumbers(): number[] {
    const matches = this.normalizedInput.match(/\d+(\.\d+)?/g)
    return matches ? matches.map(Number) : []
  }

  /**
   * Gets the length of the query
   */
  get length(): number {
    return this.rawInput.length
  }

  /**
   * Checks if query is empty
   */
  get isEmpty(): boolean {
    return this.tokens.length === 0
  }

  /**
   * Returns string representation
   */
  toString(): string {
    return this.rawInput
  }
}
