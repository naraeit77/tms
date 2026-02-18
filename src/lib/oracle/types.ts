/**
 * Oracle 관련 타입 정의
 */

export interface OracleConnectionConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  serviceName?: string;
  sid?: string;
  username: string;
  password: string;
  connectionType: 'SERVICE_NAME' | 'SID';
  privilege?: 'SYSDBA' | 'SYSOPER' | 'NORMAL';
  maxConnections?: number;
  connectionTimeout?: number;
}

export interface OracleQueryOptions {
  outFormat?: 'OBJECT' | 'ARRAY';
  autoCommit?: boolean;
  maxRows?: number;
  fetchInfo?: Record<string, { type: any }>;
  [key: string]: any; // Allow additional oracledb options
}

export interface OracleQueryResult<T = any> {
  rows: T[];
  rowsAffected?: number;
  metadata?: any[];
  outBinds?: any;
}

export interface SQLStatisticsRow {
  SQL_ID: string;
  PLAN_HASH_VALUE: number;
  MODULE: string;
  SCHEMA_NAME: string;
  ELAPSED_TIME_MS: number;
  CPU_TIME_MS: number;
  BUFFER_GETS: number;
  DISK_READS: number;
  DIRECT_WRITES: number;
  EXECUTIONS: number;
  PARSE_CALLS: number;
  ROWS_PROCESSED: number;
  APPLICATION_WAIT_TIME_MS: number;
  CONCURRENCY_WAIT_TIME_MS: number;
  CLUSTER_WAIT_TIME_MS: number;
  USER_IO_WAIT_TIME_MS: number;
  FIRST_LOAD_TIME: string;
  LAST_ACTIVE_TIME: string;
  LAST_LOAD_TIME: string;
}

export interface WaitEventRow {
  EVENT: string;
  WAIT_CLASS: string;
  TOTAL_WAITS: number;
  TOTAL_TIMEOUTS: number;
  TIME_WAITED_MS: number;
  AVERAGE_WAIT_MS: number;
}

export interface SessionRow {
  SID: number;
  'SERIAL#': number;
  USERNAME: string;
  OSUSER: string;
  MACHINE: string;
  PROGRAM: string;
  MODULE: string;
  STATUS: string;
  STATE: string;
  SQL_ID: string;
  EVENT: string;
  WAIT_CLASS: string;
  WAIT_TIME_MS: number;
  LOGICAL_READS: number;
  PHYSICAL_READS: number;
  CPU_TIME_MS: number;
  LOGON_TIME: string;
  LAST_CALL_ET: number;
  BLOCKING_SESSION: number | null;
}

export interface HealthCheckResult {
  isHealthy: boolean;
  responseTime: number;
  version: string;
  edition?: string;
  instanceName: string;
  status: string;
  error?: string;
}
