/**
 * Mock Oracle Client for Development
 * 실제 Oracle DB 없이 개발/테스트를 위한 Mock 클라이언트
 */

import type {
  OracleConnectionConfig,
  OracleQueryOptions,
  OracleQueryResult,
  SQLStatisticsRow,
  WaitEventRow,
  SessionRow,
  HealthCheckResult,
} from './types';

// Mock 데이터 생성기
class MockOracleClient {
  private config: OracleConnectionConfig;

  constructor(config: OracleConnectionConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    // Simulate connection delay
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  async disconnect(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  async execute<T = any>(
    sql: string,
    binds: any[] = [],
    options: OracleQueryOptions = {}
  ): Promise<OracleQueryResult<T>> {
    // Simulate query execution
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 500));

    // Generate mock data based on query
    if (sql.includes('v$sql') || sql.includes('V$SQL')) {
      return this.generateSQLStats() as OracleQueryResult<T>;
    }

    if (sql.includes('v$system_event') || sql.includes('V$SYSTEM_EVENT')) {
      return this.generateWaitEvents() as OracleQueryResult<T>;
    }

    if (sql.includes('v$session') || sql.includes('V$SESSION')) {
      return this.generateSessions() as OracleQueryResult<T>;
    }

    if (sql.includes('sql_fulltext') || sql.includes('SQL_FULLTEXT')) {
      return {
        rows: [
          {
            SQL_FULLTEXT: this.generateMockSQL(),
          },
        ] as T[],
      };
    }

    if (sql.includes('v$version') || sql.includes('V$VERSION')) {
      return {
        rows: [
          {
            BANNER: 'Oracle Database 19c Enterprise Edition Release 19.0.0.0.0 - Production',
          },
        ] as T[],
      };
    }

    if (sql.includes('v$instance') || sql.includes('V$INSTANCE')) {
      return {
        rows: [
          {
            INSTANCE_NAME: this.config.name || 'ORCL',
            STATUS: 'OPEN',
            VERSION: '19.0.0.0.0',
          },
        ] as T[],
      };
    }

    return { rows: [] };
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      await this.connect();

      // Query actual version and instance information
      const versionResult = await this.execute<{ BANNER: string }>(
        'SELECT banner FROM v$version WHERE ROWNUM = 1',
        []
      );

      const instanceResult = await this.execute<{ INSTANCE_NAME: string; VERSION: string; STATUS: string }>(
        'SELECT instance_name, version, status FROM v$instance',
        []
      );

      const responseTime = Date.now() - startTime;

      // Extract version from BANNER (e.g., "Oracle Database 19c Enterprise Edition Release 19.0.0.0.0")
      const banner = versionResult.rows[0]?.BANNER || '';
      const versionMatch = banner.match(/(\d+c|Release\s+[\d.]+)/i);
      const version = versionMatch ? versionMatch[0].replace('Release ', '') : instanceResult.rows[0]?.VERSION || 'Unknown';

      return {
        isHealthy: true,
        responseTime,
        version,
        instanceName: instanceResult.rows[0]?.INSTANCE_NAME || this.config.name || 'ORCL',
        status: instanceResult.rows[0]?.STATUS || 'OPEN',
      };
    } catch (error) {
      return {
        isHealthy: false,
        responseTime: Date.now() - startTime,
        version: '',
        instanceName: '',
        status: 'ERROR',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private generateSQLStats(): OracleQueryResult<SQLStatisticsRow> {
    const count = 100;
    const rows: SQLStatisticsRow[] = [];

    const modules = [
      'HR_APP',
      'SALES_RPT',
      'INV_MGMT',
      'ANALYTICS',
      'CRM_APP',
      'BATCH_JOB',
      'FINANCE',
      'REPORTING',
      'ETL_PROC',
      'WEB_SERVICE',
    ];

    const schemas = ['HR', 'SALES', 'INVENTORY', 'DW', 'CRM', 'BATCH', 'FIN', 'RPT', 'ETL', 'WEB'];

    for (let i = 0; i < count; i++) {
      rows.push({
        SQL_ID: this.generateSQLId(),
        PLAN_HASH_VALUE: Math.floor(Math.random() * 9999999999),
        MODULE: modules[Math.floor(Math.random() * modules.length)],
        SCHEMA_NAME: schemas[Math.floor(Math.random() * schemas.length)],
        ELAPSED_TIME_MS: Math.floor(Math.random() * 20000) + 100,
        CPU_TIME_MS: Math.floor(Math.random() * 15000) + 50,
        BUFFER_GETS: Math.floor(Math.random() * 5000000) + 1000,
        DISK_READS: Math.floor(Math.random() * 500000) + 100,
        DIRECT_WRITES: Math.floor(Math.random() * 10000),
        EXECUTIONS: Math.floor(Math.random() * 10000) + 1,
        PARSE_CALLS: Math.floor(Math.random() * 5000) + 1,
        ROWS_PROCESSED: Math.floor(Math.random() * 1000000) + 100,
        APPLICATION_WAIT_TIME_MS: Math.floor(Math.random() * 5000),
        CONCURRENCY_WAIT_TIME_MS: Math.floor(Math.random() * 3000),
        CLUSTER_WAIT_TIME_MS: Math.floor(Math.random() * 1000),
        USER_IO_WAIT_TIME_MS: Math.floor(Math.random() * 8000),
        FIRST_LOAD_TIME: this.generateRandomDate(-30),
        LAST_ACTIVE_TIME: this.generateRandomDate(-1),
        LAST_LOAD_TIME: this.generateRandomDate(-7),
      });
    }

    return { rows };
  }

  private generateWaitEvents(): OracleQueryResult<WaitEventRow> {
    const events = [
      { name: 'db file sequential read', wait_class: 'User I/O' },
      { name: 'db file scattered read', wait_class: 'User I/O' },
      { name: 'log file sync', wait_class: 'Commit' },
      { name: 'SQL*Net message from client', wait_class: 'Idle' },
      { name: 'buffer busy waits', wait_class: 'Concurrency' },
      { name: 'latch: cache buffers chains', wait_class: 'Concurrency' },
      { name: 'enq: TX - row lock contention', wait_class: 'Application' },
      { name: 'direct path read', wait_class: 'User I/O' },
      { name: 'log file parallel write', wait_class: 'System I/O' },
      { name: 'library cache lock', wait_class: 'Concurrency' },
    ];

    const rows: WaitEventRow[] = events.map((event) => ({
      EVENT: event.name,
      WAIT_CLASS: event.wait_class,
      TOTAL_WAITS: Math.floor(Math.random() * 50000) + 1000,
      TOTAL_TIMEOUTS: Math.floor(Math.random() * 100),
      TIME_WAITED_MS: Math.floor(Math.random() * 500000) + 1000,
      AVERAGE_WAIT_MS: Math.random() * 100 + 10,
    }));

    return { rows };
  }

  private generateSessions(): OracleQueryResult<SessionRow> {
    const count = 50;
    const rows: SessionRow[] = [];

    const programs = ['sqlplus', 'JDBC Thin Client', 'SQL Developer', 'TOAD', 'Application Server'];
    const statuses = ['ACTIVE', 'INACTIVE', 'KILLED', 'CACHED', 'SNIPED'];

    for (let i = 0; i < count; i++) {
      rows.push({
        SID: 100 + i,
        'SERIAL#': Math.floor(Math.random() * 99999),
        USERNAME: `USER${Math.floor(Math.random() * 20) + 1}`,
        OSUSER: `os_user${i}`,
        MACHINE: `MACHINE${Math.floor(Math.random() * 10)}`,
        PROGRAM: programs[Math.floor(Math.random() * programs.length)],
        MODULE: `MODULE${Math.floor(Math.random() * 5)}`,
        STATUS: statuses[Math.floor(Math.random() * statuses.length)],
        STATE: 'WAITING',
        SQL_ID: this.generateSQLId(),
        EVENT: 'db file sequential read',
        WAIT_CLASS: 'User I/O',
        WAIT_TIME_MS: Math.floor(Math.random() * 1000),
        LOGICAL_READS: Math.floor(Math.random() * 100000),
        PHYSICAL_READS: Math.floor(Math.random() * 10000),
        CPU_TIME_MS: Math.floor(Math.random() * 5000),
        LOGON_TIME: this.generateRandomDate(-10),
        LAST_CALL_ET: Math.floor(Math.random() * 3600),
        BLOCKING_SESSION: Math.random() > 0.9 ? 100 + Math.floor(Math.random() * 50) : null,
      });
    }

    return { rows };
  }

  private generateSQLId(): string {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    let sqlId = '';
    for (let i = 0; i < 13; i++) {
      sqlId += chars[Math.floor(Math.random() * chars.length)];
    }
    return sqlId;
  }

  private generateMockSQL(): string {
    const templates = [
      'SELECT * FROM employees WHERE department_id = :1 AND salary > :2',
      'SELECT COUNT(*) FROM orders WHERE order_date >= :1',
      'UPDATE products SET price = :1 WHERE product_id = :2',
      'DELETE FROM logs WHERE log_date < :1',
      'INSERT INTO transactions SELECT * FROM staging_transactions WHERE status = :1',
      'SELECT e.*, d.department_name FROM employees e JOIN departments d ON e.department_id = d.department_id WHERE e.hire_date >= :1',
    ];

    return templates[Math.floor(Math.random() * templates.length)];
  }

  private generateRandomDate(daysAgo: number): string {
    const date = new Date();
    date.setDate(date.getDate() + daysAgo + Math.random() * Math.abs(daysAgo));
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }
}

// Connection pool for mock clients
const mockPools = new Map<string, MockOracleClient>();

export async function getMockConnection(config: OracleConnectionConfig): Promise<MockOracleClient> {
  const poolKey = `${config.host}:${config.port}`;

  if (!mockPools.has(poolKey)) {
    const client = new MockOracleClient(config);
    await client.connect();
    mockPools.set(poolKey, client);
  }

  return mockPools.get(poolKey)!;
}

export async function closeMockPools(): Promise<void> {
  for (const [key, client] of mockPools.entries()) {
    await client.disconnect();
    mockPools.delete(key);
  }
}

export { MockOracleClient };
