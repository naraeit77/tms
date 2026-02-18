import { db } from '@/db';
import { oracleConnections } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { decrypt } from '@/lib/crypto';
import type { OracleConnectionConfig } from './types';

interface ConnectionCacheEntry {
  config: OracleConnectionConfig;
  timestamp: number;
}

const connectionCache = new Map<string, ConnectionCacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5분

function getCachedConfig(connectionId: string): OracleConnectionConfig | null {
  const entry = connectionCache.get(connectionId);
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.timestamp > CACHE_TTL) {
    connectionCache.delete(connectionId);
    return null;
  }

  return entry.config;
}

function setCachedConfig(connectionId: string, config: OracleConnectionConfig): void {
  connectionCache.set(connectionId, {
    config,
    timestamp: Date.now(),
  });
}

export function invalidateConnectionCache(connectionId: string): void {
  connectionCache.delete(connectionId);
}

export function clearConnectionCache(): void {
  connectionCache.clear();
}

export async function getOracleConfig(connectionId: string): Promise<OracleConnectionConfig> {
  const cachedConfig = getCachedConfig(connectionId);
  if (cachedConfig) {
    return cachedConfig;
  }

  // Drizzle ORM으로 Oracle 연결 정보 조회
  const [connection] = await db
    .select()
    .from(oracleConnections)
    .where(eq(oracleConnections.id, connectionId))
    .limit(1);

  if (!connection) {
    throw new Error(`Oracle connection not found: ${connectionId}`);
  }

  const decryptedPassword = decrypt(connection.passwordEncrypted);

  const config: OracleConnectionConfig = {
    id: connection.id,
    name: connection.name,
    host: connection.host,
    port: connection.port!,
    username: connection.username,
    password: decryptedPassword,
    serviceName: connection.serviceName,
    sid: connection.sid,
    connectionType: connection.connectionType || 'SERVICE_NAME',
    privilege: connection.privilege || undefined,
  };

  setCachedConfig(connectionId, config);

  return config;
}

export function convertSqlText(sqlText: any): string {
  if (!sqlText) return '';

  if (typeof sqlText === 'string') {
    return sqlText;
  }

  if (Buffer.isBuffer(sqlText)) {
    return sqlText.toString('utf-8');
  }

  if (sqlText.toString) {
    return sqlText.toString();
  }

  return String(sqlText);
}

export function safeNumber(value: any, defaultValue: number = 0): number {
  const num = Number(value);
  return isNaN(num) ? defaultValue : Math.floor(num);
}
