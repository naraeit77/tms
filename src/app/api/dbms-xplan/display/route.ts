/**
 * DBMS_XPLAN.DISPLAY API Route
 * EXPLAIN PLAN으로 생성된 실행계획 조회
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

export async function GET(request: NextRequest) {
  try {
    // 인증 확인
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // URL 파라미터 추출
    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');
    const statementId = searchParams.get('statement_id');
    const format = searchParams.get('format') || 'TYPICAL';

    if (!connectionId) {
      return NextResponse.json({ error: 'connection_id is required' }, { status: 400 });
    }

    // DB에서 연결 정보 조회
    const [connection] = await db
      .select()
      .from(oracleConnections)
      .where(
        and(
          eq(oracleConnections.id, connectionId),
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

    // DBMS_XPLAN.DISPLAY SQL 구성
    let sql = `
      SELECT plan_table_output
      FROM TABLE(DBMS_XPLAN.DISPLAY(
        table_name => 'PLAN_TABLE',
        statement_id => ${statementId ? ':1' : 'NULL'},
        format => :${statementId ? '2' : '1'}
      ))
    `;

    const binds: any[] = [];
    if (statementId) {
      binds.push(statementId);
    }
    binds.push(format);

    // 실행계획 조회
    const result = await executeQuery<{ PLAN_TABLE_OUTPUT: string }>(config, sql, binds);

    const planOutput = result.rows.map((row) => row.PLAN_TABLE_OUTPUT);

    return NextResponse.json({
      plan_table_output: planOutput,
    });
  } catch (error) {
    console.error('DBMS_XPLAN.DISPLAY error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to execute DBMS_XPLAN.DISPLAY',
      },
      { status: 500 }
    );
  }
}
