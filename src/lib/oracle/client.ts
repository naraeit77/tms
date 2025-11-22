/**
 * Real Oracle Client using oracledb
 * 실제 Oracle DB 연결 클라이언트
 */

import 'server-only';

import oracledb from 'oracledb';
import type {
  OracleConnectionConfig,
  OracleQueryOptions,
  OracleQueryResult,
  SQLStatisticsRow,
  WaitEventRow,
  SessionRow,
  HealthCheckResult,
} from './types';

// Thick 모드 초기화 (선택적)
let thickModeInitialized = false;
const ORACLE_THICK_MODE = process.env.ORACLE_THICK_MODE === 'true';
const ORACLE_CLIENT_LIB_DIR = process.env.ORACLE_CLIENT_LIB_DIR;

if (ORACLE_THICK_MODE && !thickModeInitialized) {
  try {
    const initOpts: any = {};

    // Instant Client 라이브러리 경로가 제공된 경우
    if (ORACLE_CLIENT_LIB_DIR) {
      initOpts.libDir = ORACLE_CLIENT_LIB_DIR;
    }

    oracledb.initOracleClient(initOpts);
    thickModeInitialized = true;
    console.log('✓ Oracle Thick mode initialized');

    if (ORACLE_CLIENT_LIB_DIR) {
      console.log(`  Library directory: ${ORACLE_CLIENT_LIB_DIR}`);
    }
  } catch (err) {
    console.error('✗ Oracle Thick mode initialization failed:', err);
    console.error('  Falling back to Thin mode');
    console.error('  Note: Some password verifier types may not be supported in Thin mode');
  }
}

// Oracle Client 초기 설정
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = true;

// Connection Pool 저장소
const pools = new Map<string, oracledb.Pool>();

/**
 * Oracle Connection Pool 가져오기 또는 생성
 */
export async function getOraclePool(config: OracleConnectionConfig): Promise<oracledb.Pool> {
  const poolKey = `${config.host}:${config.port}:${config.serviceName || config.sid}`;

  if (pools.has(poolKey)) {
    return pools.get(poolKey)!;
  }

  const connectString =
    config.connectionType === 'SERVICE_NAME'
      ? `${config.host}:${config.port}/${config.serviceName}`
      : `${config.host}:${config.port}/${config.sid}`;

  const pool = await oracledb.createPool({
    user: config.username,
    password: config.password,
    connectString,
    poolMin: 2,
    poolMax: 10,
    poolIncrement: 1,
    poolTimeout: 60,
    queueTimeout: 60000,
    enableStatistics: true,
  });

  pools.set(poolKey, pool);
  return pool;
}

/**
 * Oracle 연결 가져오기
 */
export async function getConnection(
  config: OracleConnectionConfig
): Promise<oracledb.Connection> {
  const pool = await getOraclePool(config);
  return await pool.getConnection();
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
  let connection: oracledb.Connection | null = null;

  try {
    connection = await getConnection(config);

    const result = await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      fetchInfo: {
        SQL_FULLTEXT: { type: oracledb.STRING },
        SQL_TEXT: { type: oracledb.STRING },
      },
      ...options,
    });

    return {
      rows: (result.rows || []) as T[],
      metadata: result.metaData,
      rowsAffected: result.rowsAffected,
    };
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    }
  }
}

/**
 * Health Check
 */
export async function healthCheck(config: OracleConnectionConfig): Promise<HealthCheckResult> {
  const startTime = Date.now();

  try {
    const versionResult = await executeQuery<{ BANNER: string }>(
      config,
      'SELECT banner as BANNER FROM v$version WHERE rownum = 1'
    );

    const instanceResult = await executeQuery<{
      INSTANCE_NAME: string;
      STATUS: string;
      VERSION: string;
    }>(config, 'SELECT instance_name as INSTANCE_NAME, status as STATUS, version as VERSION FROM v$instance');

    const responseTime = Date.now() - startTime;
    const instance = instanceResult.rows[0];

    // Extract version from BANNER (e.g., "Oracle Database 12c Standard Edition Release 12.1.0.2.0")
    const banner = versionResult.rows[0]?.BANNER || '';
    const instanceVersion = instance?.VERSION || '';

    // Debug: Log BANNER and VERSION for troubleshooting
    console.log('Oracle Version Detection:');
    console.log('  BANNER:', banner);
    console.log('  VERSION:', instanceVersion);

    // Extract Oracle Edition from BANNER
    // Patterns: "Enterprise Edition", "Standard Edition", "Standard Edition One", "Express Edition"
    let edition = '';
    const editionMatch = banner.match(/\b(Enterprise Edition|Standard Edition One|Standard Edition|Express Edition|Personal Edition)\b/i);
    if (editionMatch) {
      edition = editionMatch[1];
      console.log('  ✓ Extracted Edition:', edition);
    }

    // Try to extract "Xc" or "Xg" format from BANNER
    // Match patterns like "11g", "12c", "18c", "19c", "21c"
    // Matches "Oracle Database 12c Standard Edition" or "Oracle Database 19c Enterprise Edition"
    const cVersionMatch = banner.match(/Database\s+(\d+[gc])\s+/i);
    if (cVersionMatch) {
      const version = cVersionMatch[1].toLowerCase();
      console.log('  ✓ Extracted from BANNER:', version);
      return {
        isHealthy: true,
        responseTime,
        version,
        edition,
        instanceName: instance?.INSTANCE_NAME || '',
        status: instance?.STATUS || '',
      };
    }

    // Fallback: Try to extract from numeric version (e.g., "12.1.0.2.0" -> "12c")
    const numericMatch = instanceVersion.match(/^(\d+)\./);
    if (numericMatch) {
      const majorVersion = parseInt(numericMatch[1]);
      let version: string;

      // Map numeric version to "Xc" format
      if (majorVersion >= 21) {
        version = '21c';
      } else if (majorVersion >= 19) {
        version = '19c';
      } else if (majorVersion >= 18) {
        version = '18c';
      } else if (majorVersion >= 12) {
        version = '12c';
      } else if (majorVersion >= 11) {
        version = '11g';
      } else {
        version = instanceVersion; // Keep original for older versions
      }

      return {
        isHealthy: true,
        responseTime,
        version,
        edition,
        instanceName: instance?.INSTANCE_NAME || '',
        status: instance?.STATUS || '',
      };
    }

    // Last resort fallback
    const version = instanceVersion || 'Unknown';

    return {
      isHealthy: true,
      responseTime,
      version,
      edition,
      instanceName: instance?.INSTANCE_NAME || '',
      status: instance?.STATUS || '',
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

/**
 * SQL Statistics 수집
 */
export async function collectSQLStatistics(
  config: OracleConnectionConfig,
  limit: number = 100
): Promise<SQLStatisticsRow[]> {
  try {
    const sql = `
      SELECT * FROM (
        SELECT
          sql_id as SQL_ID,
          plan_hash_value as PLAN_HASH_VALUE,
          module as MODULE,
          parsing_schema_name as SCHEMA_NAME,
          elapsed_time / 1000 as ELAPSED_TIME_MS,
          cpu_time / 1000 as CPU_TIME_MS,
          buffer_gets as BUFFER_GETS,
          disk_reads as DISK_READS,
          direct_writes as DIRECT_WRITES,
          executions as EXECUTIONS,
          parse_calls as PARSE_CALLS,
          rows_processed as ROWS_PROCESSED,
          application_wait_time / 1000 as APPLICATION_WAIT_TIME_MS,
          concurrency_wait_time / 1000 as CONCURRENCY_WAIT_TIME_MS,
          cluster_wait_time / 1000 as CLUSTER_WAIT_TIME_MS,
          user_io_wait_time / 1000 as USER_IO_WAIT_TIME_MS,
          first_load_time as FIRST_LOAD_TIME,
          TO_CHAR(last_active_time, 'YYYY-MM-DD HH24:MI:SS') as LAST_ACTIVE_TIME,
          last_load_time as LAST_LOAD_TIME
        FROM v$sql
        WHERE
          parsing_schema_name NOT IN ('SYS', 'DBSNMP', 'SYSMAN', 'WMSYS')
          AND sql_text NOT LIKE '%v$%'
          AND sql_text NOT LIKE '%V$%'
          AND command_type NOT IN (47)
          AND executions > 0
        ORDER BY elapsed_time DESC
      )
      WHERE ROWNUM <= :1
    `;

    console.log('Executing SQL statistics query with limit:', limit);
    const result = await executeQuery<SQLStatisticsRow>(config, sql, [limit]);
    console.log(`Query executed successfully, returned ${result.rows.length} rows`);
    
    return result.rows;
  } catch (error) {
    console.error('Error collecting SQL statistics:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      config: {
        host: config.host,
        port: config.port,
        username: config.username,
        connectionType: config.connectionType,
      },
    });
    
    // 더 구체적인 에러 메시지 제공
    if (error instanceof Error) {
      const errorMsg = error.message.toUpperCase();
      
      if (errorMsg.includes('ORA-00942') || errorMsg.includes('TABLE OR VIEW DOES NOT EXIST')) {
        throw new Error('v$sql 뷰에 접근할 권한이 없습니다. DBA 권한이 필요합니다.');
      }
      if (errorMsg.includes('ORA-01017') || errorMsg.includes('INVALID USERNAME/PASSWORD')) {
        throw new Error('Oracle 데이터베이스 인증 실패: 사용자명 또는 비밀번호가 올바르지 않습니다.');
      }
      if (errorMsg.includes('ORA-12541') || errorMsg.includes('TNS:NO LISTENER')) {
        throw new Error('Oracle 데이터베이스에 연결할 수 없습니다. 호스트와 포트를 확인해주세요.');
      }
      if (errorMsg.includes('ORA-12514') || errorMsg.includes('TNS:LISTENER DOES NOT CURRENTLY KNOW')) {
        throw new Error('Service Name 또는 SID가 올바르지 않습니다.');
      }
      if (errorMsg.includes('ORA-12505') || errorMsg.includes('TNS:LISTENER DOES NOT CURRENTLY KNOW OF SID')) {
        throw new Error('SID를 찾을 수 없습니다. SID 또는 Service Name을 확인해주세요.');
      }
      if (errorMsg.includes('ORA-01031') || errorMsg.includes('INSUFFICIENT PRIVILEGES')) {
        throw new Error('권한이 부족합니다. v$sql 뷰에 접근할 수 있는 권한이 필요합니다.');
      }
      if (errorMsg.includes('ORA-01722') || errorMsg.includes('INVALID NUMBER')) {
        throw new Error('데이터 형식 오류: 숫자 변환에 실패했습니다. v$sql 뷰의 데이터 형식을 확인해주세요.');
      }
    }
    
    throw new Error(`SQL 통계 수집 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
  }
}

/**
 * SQL Full Text 조회
 */
export async function getSQLFullText(
  config: OracleConnectionConfig,
  sqlId: string
): Promise<string> {
  const sql = `
    SELECT sql_fulltext as SQL_FULLTEXT
    FROM v$sql
    WHERE sql_id = :sql_id
    AND rownum = 1
  `;

  const result = await executeQuery<{ SQL_FULLTEXT: string }>(config, sql, [sqlId]);
  return result.rows[0]?.SQL_FULLTEXT || '';
}

/**
 * Wait Events 수집
 */
export async function collectWaitEvents(
  config: OracleConnectionConfig
): Promise<WaitEventRow[]> {
  const sql = `
    SELECT
      event as EVENT,
      wait_class as WAIT_CLASS,
      total_waits as TOTAL_WAITS,
      total_timeouts as TOTAL_TIMEOUTS,
      time_waited / 100 as TIME_WAITED_MS,
      average_wait / 100 as AVERAGE_WAIT_MS
    FROM v$system_event
    WHERE wait_class != 'Idle'
    ORDER BY time_waited DESC
  `;

  const result = await executeQuery<WaitEventRow>(config, sql);
  return result.rows;
}

/**
 * Active Sessions 수집
 */
export async function collectActiveSessions(
  config: OracleConnectionConfig
): Promise<SessionRow[]> {
  const sql = `
    SELECT
      s.sid as SID,
      s.serial# as "SERIAL#",
      s.username as USERNAME,
      s.osuser as OSUSER,
      s.machine as MACHINE,
      s.program as PROGRAM,
      s.module as MODULE,
      s.status as STATUS,
      s.state as STATE,
      s.sql_id as SQL_ID,
      s.event as EVENT,
      s.wait_class as WAIT_CLASS,
      s.wait_time as WAIT_TIME_MS,
      t.value as LOGICAL_READS,
      p.value as PHYSICAL_READS,
      c.value as CPU_TIME_MS,
      TO_CHAR(s.logon_time, 'YYYY-MM-DD HH24:MI:SS') as LOGON_TIME,
      s.last_call_et as LAST_CALL_ET,
      s.blocking_session as BLOCKING_SESSION
    FROM v$session s
    LEFT JOIN v$sesstat t ON s.sid = t.sid AND t.statistic# = (
      SELECT statistic# FROM v$statname WHERE name = 'session logical reads'
    )
    LEFT JOIN v$sesstat p ON s.sid = p.sid AND p.statistic# = (
      SELECT statistic# FROM v$statname WHERE name = 'physical reads'
    )
    LEFT JOIN v$sesstat c ON s.sid = c.sid AND c.statistic# = (
      SELECT statistic# FROM v$statname WHERE name = 'CPU used by this session'
    )
    WHERE s.type = 'USER'
    AND s.username IS NOT NULL
    ORDER BY s.status, s.sid
  `;

  const result = await executeQuery<SessionRow>(config, sql);
  return result.rows;
}

/**
 * Execution Plan 수집
 */
export async function collectExecutionPlan(
  config: OracleConnectionConfig,
  sqlId: string,
  planHashValue?: number
): Promise<any[]> {
  let sql = `
    SELECT
      id,
      parent_id,
      operation,
      options,
      object_name,
      object_owner,
      cost,
      cardinality,
      bytes,
      partition_start,
      partition_stop,
      access_predicates,
      filter_predicates,
      depth
    FROM v$sql_plan
    WHERE sql_id = :sql_id
  `;

  const binds: any[] = [sqlId];

  if (planHashValue) {
    sql += ' AND plan_hash_value = :plan_hash_value';
    binds.push(planHashValue);
  }

  sql += ' ORDER BY id';

  const result = await executeQuery(config, sql, binds);
  return result.rows;
}

/**
 * Pool 종료
 */
export async function closePools(): Promise<void> {
  for (const [key, pool] of pools.entries()) {
    try {
      await pool.close(10);
      pools.delete(key);
    } catch (err) {
      console.error(`Error closing pool ${key}:`, err);
    }
  }
}

/**
 * 특정 Pool 종료
 */
export async function closePool(config: OracleConnectionConfig): Promise<void> {
  const poolKey = `${config.host}:${config.port}:${config.serviceName || config.sid}`;
  const pool = pools.get(poolKey);

  if (pool) {
    try {
      await pool.close(10);
      pools.delete(poolKey);
    } catch (err) {
      console.error(`Error closing pool ${poolKey}:`, err);
    }
  }
}

/**
 * Pool 통계
 */
export function getPoolStatistics(config: OracleConnectionConfig): oracledb.PoolStatistics | null {
  const poolKey = `${config.host}:${config.port}:${config.serviceName || config.sid}`;
  const pool = pools.get(poolKey);

  if (pool) {
    return pool.getStatistics();
  }

  return null;
}
