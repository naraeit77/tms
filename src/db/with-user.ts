// 요청별 RLS 컨텍스트 주입 헬퍼 — SET LOCAL app.user_id 후 트랜잭션 내에서 쿼리 실행

import 'server-only';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { pool } from '@/db';
import * as schema from '@/db/schema';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

type Tx = ReturnType<typeof drizzle<typeof schema>>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(userId: string): string {
  if (!UUID_RE.test(userId)) {
    throw new Error('withUserContext: userId가 UUID 형식이 아닙니다.');
  }
  return userId;
}

/**
 * RLS 컨텍스트가 주입된 트랜잭션 안에서 fn 을 실행한다.
 * fn 내부의 모든 쿼리는 oracle_connections / scheduler_jobs 등 RLS 적용 테이블에 대해
 * 해당 user 의 행만 보거나 쓸 수 있다.
 */
export async function withUserContext<T>(
  userId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const safeId = assertUuid(userId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // SET LOCAL 은 현재 트랜잭션에만 적용 → 풀로 반환된 뒤 다른 요청에 누수되지 않음
    await client.query(`SET LOCAL app.user_id = '${safeId}'`);
    const tx = drizzle(client, { schema });
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // 이미 끊어졌을 수 있음
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * NextAuth 세션에서 user.id 를 꺼낸다. 세션이 없으면 null.
 */
export async function getSessionUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  return typeof id === 'string' && UUID_RE.test(id) ? id : null;
}

/**
 * 라우트에서 짧게 쓰기 위한 콤보 헬퍼:
 * 세션 있으면 withUserContext 로 fn 실행, 없으면 throw.
 */
export async function withSessionContext<T>(
  fn: (tx: Tx, userId: string) => Promise<T>,
): Promise<T> {
  const userId = await getSessionUserId();
  if (!userId) {
    throw new UnauthorizedError();
  }
  return withUserContext(userId, (tx) => fn(tx, userId));
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export type { Tx };
