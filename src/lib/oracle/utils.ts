import { oracleConnections } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { decrypt } from '@/lib/crypto';
import { withUserContext, getSessionUserId } from '@/db/with-user';
import type { OracleConnectionConfig } from './types';

interface ConnectionCacheEntry {
  config: OracleConnectionConfig;
  timestamp: number;
}

// 캐시 키는 (userId, connectionId) — 같은 connectionId를 다른 사용자가 가져갈 수 없음
const connectionCache = new Map<string, ConnectionCacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5분

function cacheKey(userId: string, connectionId: string): string {
  return `${userId}::${connectionId}`;
}

function getCachedConfig(userId: string, connectionId: string): OracleConnectionConfig | null {
  const entry = connectionCache.get(cacheKey(userId, connectionId));
  if (!entry) return null;

  if (Date.now() - entry.timestamp > CACHE_TTL) {
    connectionCache.delete(cacheKey(userId, connectionId));
    return null;
  }
  return entry.config;
}

function setCachedConfig(userId: string, connectionId: string, config: OracleConnectionConfig): void {
  connectionCache.set(cacheKey(userId, connectionId), {
    config,
    timestamp: Date.now(),
  });
}

/** connectionId 기준으로 모든 사용자 캐시를 비운다 (연결 정보가 바뀌었거나 삭제됐을 때) */
export function invalidateConnectionCache(connectionId: string): void {
  for (const key of connectionCache.keys()) {
    if (key.endsWith(`::${connectionId}`)) connectionCache.delete(key);
  }
}

export function clearConnectionCache(): void {
  connectionCache.clear();
}

/**
 * Oracle 연결 설정을 가져온다. 세션 user 가 소유한 연결만 RLS 로 조회 가능.
 * 백그라운드 작업처럼 세션이 없는 컨텍스트에서는 ownerUserId 를 명시적으로 넘긴다.
 */
export async function getOracleConfig(
  connectionId: string,
  ownerUserId?: string,
): Promise<OracleConnectionConfig> {
  const userId = ownerUserId ?? (await getSessionUserId());
  if (!userId) {
    throw new Error('getOracleConfig: 세션이 없거나 ownerUserId 가 필요합니다.');
  }

  const cached = getCachedConfig(userId, connectionId);
  if (cached) return cached;

  const connection = await withUserContext(userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(oracleConnections)
      .where(eq(oracleConnections.id, connectionId))
      .limit(1);
    return row;
  });

  if (!connection) {
    throw new Error(`Oracle connection not found: ${connectionId}`);
  }

  const config: OracleConnectionConfig = {
    id: connection.id,
    name: connection.name,
    host: connection.host,
    port: connection.port!,
    username: connection.username,
    password: decrypt(connection.passwordEncrypted),
    serviceName: connection.serviceName,
    sid: connection.sid,
    connectionType: connection.connectionType || 'SERVICE_NAME',
    privilege: connection.privilege || undefined,
  };

  setCachedConfig(userId, connectionId, config);
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
