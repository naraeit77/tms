/**
 * EXPLAIN PLAN FOR API Route
 * SQL에 대한 실행계획 생성
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { oracleConnections } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { executeQuery } from '@/lib/oracle/client';
import type { OracleConnectionConfig } from '@/lib/oracle/types';
import { decrypt } from '@/lib/crypto';

export async function POST(request: NextRequest) {
  try {
    // 인증 확인
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 요청 본문 파싱
    const body = await request.json();
    const { connection_id, sql, statement_id } = body;

    if (!connection_id || !sql) {
      return NextResponse.json(
        { error: 'connection_id and sql are required' },
        { status: 400 }
      );
    }

    // DB에서 연결 정보 조회
    const [connection] = await db
      .select()
      .from(oracleConnections)
      .where(
        and(
          eq(oracleConnections.id, connection_id),
          eq(oracleConnections.isActive, true)
        )
      )
      .limit(1);

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    // Oracle 연결 설정
    const password = decrypt(connection.passwordEncrypted);
    const config: OracleConnectionConfig = {
      id: connection.id,
      name: connection.name,
      host: connection.host,
      port: connection.port,
      serviceName: connection.serviceName,
      sid: connection.sid,
      username: connection.username,
      password,
      connectionType: connection.connectionType as 'SERVICE_NAME' | 'SID',
      privilege: connection.privilege || undefined,
    };

    // Statement ID 생성 (제공되지 않은 경우)
    const finalStatementId = statement_id || `STMT_${Date.now()}`;

    // EXPLAIN PLAN FOR 실행
    let explainSql = '';
    if (statement_id) {
      explainSql = `EXPLAIN PLAN SET STATEMENT_ID = '${finalStatementId}' FOR ${sql}`;
    } else {
      explainSql = `EXPLAIN PLAN FOR ${sql}`;
    }

    await executeQuery(config, explainSql);

    return NextResponse.json({
      success: true,
      statement_id: finalStatementId,
      message: 'EXPLAIN PLAN executed successfully',
    });
  } catch (error) {
    console.error('EXPLAIN PLAN error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to execute EXPLAIN PLAN',
      },
      { status: 500 }
    );
  }
}
