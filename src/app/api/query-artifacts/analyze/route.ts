/**
 * Query Artifacts Analysis API
 * POST: Analyze SQL query and generate Index Creation Diagram
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getOracleConfig } from '@/lib/oracle/utils'
import { RegexSQLParser } from '@/infrastructure/query-artifacts/parsers/RegexSQLParser'
import { IndexAnalyzer } from '@/infrastructure/query-artifacts/analyzers/IndexAnalyzer'
import { OracleIndexMetadataRepository } from '@/infrastructure/query-artifacts/repositories/OracleIndexMetadataRepository'
import { AnalyzeQueryUseCase } from '@/application/query-artifacts/use-cases/AnalyzeQueryUseCase'
import type { AnalyzeQueryRequest } from '@/application/query-artifacts/dto'

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Auth check
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body = await request.json() as AnalyzeQueryRequest
    const { connectionId, sql, owner, options } = body

    // Validate required fields
    if (!connectionId) {
      return NextResponse.json(
        { error: 'connectionId is required' },
        { status: 400 }
      )
    }

    if (!sql || sql.trim().length === 0) {
      return NextResponse.json(
        { error: 'SQL query is required' },
        { status: 400 }
      )
    }

    // Initialize infrastructure components
    const sqlParser = new RegexSQLParser()
    const indexAnalyzer = new IndexAnalyzer()
    const indexRepository = new OracleIndexMetadataRepository(getOracleConfig)

    // Create and execute use case
    const useCase = new AnalyzeQueryUseCase(
      sqlParser,
      indexRepository,
      indexAnalyzer
    )

    const result = await useCase.execute({
      connectionId,
      sql,
      owner: owner || undefined,
      options: {
        includeStatistics: options?.includeStatistics ?? true,
        includeHints: options?.includeHints ?? false,
        targetSchema: owner || undefined,
      },
    })

    const executionTime = Date.now() - startTime

    // Check if use case returned an error
    if (!result.success || !result.data) {
      return NextResponse.json({
        success: false,
        error: result.error?.message || 'Analysis failed',
        metadata: {
          executionTimeMs: executionTime,
          analyzedAt: new Date().toISOString(),
        },
      }, { status: 400 })
    }

    // Return the QueryArtifactOutput directly (not the entire AnalyzeQueryResponse)
    return NextResponse.json({
      success: true,
      data: result.data,
      metadata: {
        executionTimeMs: executionTime,
        analyzedAt: new Date().toISOString(),
        analysisId: result.metadata.analysisId,
      },
    })
  } catch (error) {
    console.error('[Query Artifacts API] Analysis failed:', error)

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Handle specific error types
    if (errorMessage.includes('not found')) {
      return NextResponse.json(
        { error: 'Oracle connection not found' },
        { status: 404 }
      )
    }

    if (errorMessage.includes('Unsupported SQL')) {
      return NextResponse.json(
        { error: 'Unsupported SQL type. Only SELECT queries are supported.' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to analyze query', details: errorMessage },
      { status: 500 }
    )
  }
}

/**
 * GET: Get API information
 */
export async function GET() {
  return NextResponse.json({
    name: 'Query Artifacts Analysis API',
    version: '1.0.0',
    description: 'Analyze SQL queries and generate Index Creation Diagrams (인덱스 생성도)',
    endpoints: {
      'POST /api/query-artifacts/analyze': {
        description: 'Analyze SQL query',
        body: {
          connectionId: 'string (required) - Oracle connection ID',
          sql: 'string (required) - SQL query to analyze',
          owner: 'string (optional) - Schema owner, default: PUBLIC',
          options: {
            includeStatistics: 'boolean - Include column statistics',
            includeRecommendations: 'boolean - Include tuning recommendations',
            includeHints: 'boolean - Include optimizer hints',
          },
        },
      },
    },
  })
}
