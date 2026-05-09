/**
 * Oracle Edition Guard - Server-Only Functions
 *
 * DB 접근이 필요한 서버 전용 함수들.
 * 클라이언트 컴포넌트에서는 edition-guard.ts의 순수 함수만 사용하세요.
 */

import { oracleConnections } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { withUserContext, getSessionUserId } from '@/db/with-user';
import { parseOracleEdition, type OracleEdition } from './edition-guard';

/**
 * DB에서 connectionId로 Oracle 에디션 조회 (RLS: 본인 소유 연결만)
 */
export async function getConnectionEdition(connectionId: string): Promise<OracleEdition> {
  try {
    const userId = await getSessionUserId();
    if (!userId) return 'Unknown';
    const connection = await withUserContext(userId, async (tx) => {
      const [row] = await tx
        .select({ oracleEdition: oracleConnections.oracleEdition })
        .from(oracleConnections)
        .where(eq(oracleConnections.id, connectionId))
        .limit(1);
      return row;
    });
    return parseOracleEdition(connection?.oracleEdition);
  } catch {
    return 'Unknown';
  }
}
