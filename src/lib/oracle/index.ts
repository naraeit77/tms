/**
 * Oracle Client Factory
 * Mock과 Real Oracle 클라이언트를 환경변수에 따라 선택
 */

import 'server-only';

import type {
  OracleConnectionConfig,
  OracleQueryOptions,
  OracleQueryResult,
  SQLStatisticsRow,
  WaitEventRow,
  SessionRow,
  HealthCheckResult,
} from './types';

// 환경변수로 Mock/Real 클라이언트 선택
const USE_MOCK_ORACLE = process.env.USE_MOCK_ORACLE === 'true';

/**
 * SQL Statistics 수집
 */
export async function collectSQLStatistics(
  config: OracleConnectionConfig,
  limit: number = 100
): Promise<SQLStatisticsRow[]> {
  if (USE_MOCK_ORACLE) {
    const { getMockConnection } = await import('./mock-client');
    const client = await getMockConnection(config);
    const result = await client.execute<SQLStatisticsRow>(
      'SELECT * FROM v$sql ORDER BY elapsed_time DESC',
      [],
      {}
    );
    return result.rows.slice(0, limit);
  } else {
    const { collectSQLStatistics: realCollect } = await import('./client');
    return await realCollect(config, limit);
  }
}

/**
 * SQL Full Text 조회
 */
export async function getSQLFullText(
  config: OracleConnectionConfig,
  sqlId: string
): Promise<string> {
  if (USE_MOCK_ORACLE) {
    const { getMockConnection } = await import('./mock-client');
    const client = await getMockConnection(config);
    const result = await client.execute<{ SQL_FULLTEXT: string }>(
      'SELECT sql_fulltext FROM v$sql WHERE sql_id = :1',
      [sqlId],
      {}
    );
    return result.rows[0]?.SQL_FULLTEXT || '';
  } else {
    const { getSQLFullText: realGet } = await import('./client');
    return await realGet(config, sqlId);
  }
}

/**
 * SQL Full Text 일괄 조회
 */
export async function getSQLFullTextBatch(
  config: OracleConnectionConfig,
  sqlIds: string[]
): Promise<Map<string, string>> {
  if (USE_MOCK_ORACLE) {
    const result = new Map<string, string>();
    for (const sqlId of sqlIds) {
      const text = await getSQLFullText(config, sqlId);
      if (text) result.set(sqlId, text);
    }
    return result;
  } else {
    const { getSQLFullTextBatch: realGetBatch } = await import('./client');
    return await realGetBatch(config, sqlIds);
  }
}

/**
 * Wait Events 수집
 */
export async function collectWaitEvents(
  config: OracleConnectionConfig
): Promise<WaitEventRow[]> {
  if (USE_MOCK_ORACLE) {
    const { getMockConnection } = await import('./mock-client');
    const client = await getMockConnection(config);
    const result = await client.execute<WaitEventRow>(
      'SELECT * FROM v$system_event',
      [],
      {}
    );
    return result.rows;
  } else {
    const { collectWaitEvents: realCollect } = await import('./client');
    return await realCollect(config);
  }
}

/**
 * Active Sessions 수집
 */
export async function collectActiveSessions(
  config: OracleConnectionConfig
): Promise<SessionRow[]> {
  if (USE_MOCK_ORACLE) {
    const { getMockConnection } = await import('./mock-client');
    const client = await getMockConnection(config);
    const result = await client.execute<SessionRow>('SELECT * FROM v$session', [], {});
    return result.rows;
  } else {
    const { collectActiveSessions: realCollect } = await import('./client');
    return await realCollect(config);
  }
}

/**
 * Execution Plan 수집
 */
export async function collectExecutionPlan(
  config: OracleConnectionConfig,
  sqlId: string,
  planHashValue?: number
): Promise<any[]> {
  if (USE_MOCK_ORACLE) {
    // Mock에서는 빈 배열 반환
    return [];
  } else {
    const { collectExecutionPlan: realCollect } = await import('./client');
    return await realCollect(config, sqlId, planHashValue);
  }
}

/**
 * Health Check
 */
export async function healthCheck(
  config: OracleConnectionConfig
): Promise<HealthCheckResult> {
  if (USE_MOCK_ORACLE) {
    const { getMockConnection } = await import('./mock-client');
    const client = await getMockConnection(config);
    return await client.healthCheck();
  } else {
    const { healthCheck: realCheck } = await import('./client');
    return await realCheck(config);
  }
}

/**
 * SQL 쿼리 실행
 */
export async function executeQuery<T = any>(
  config: OracleConnectionConfig,
  sql: string,
  binds: any[] = [],
  options: OracleQueryOptions = {}
): Promise<OracleQueryResult<T>> {
  if (USE_MOCK_ORACLE) {
    const { getMockConnection } = await import('./mock-client');
    const client = await getMockConnection(config);
    return await client.execute<T>(sql, binds, options);
  } else {
    const { executeQuery: realExecute } = await import('./client');
    return await realExecute<T>(config, sql, binds, options);
  }
}

/**
 * Pool/Connection 종료
 */
export async function closePools(): Promise<void> {
  if (USE_MOCK_ORACLE) {
    const { closeMockPools } = await import('./mock-client');
    await closeMockPools();
  } else {
    const { closePools: realClose } = await import('./client');
    await realClose();
  }
}

/**
 * 특정 Pool 종료
 */
export async function closePool(config: OracleConnectionConfig): Promise<void> {
  if (USE_MOCK_ORACLE) {
    // Mock에서는 특정 pool close 동작 없음
    return;
  } else {
    const { closePool: realClosePool } = await import('./client');
    await realClosePool(config);
  }
}

// Export types
export * from './types';
