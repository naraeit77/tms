/**
 * DBMS_XPLAN.DISPLAY_AWR API Route
 * AWR 저장소에서 과거 실행계획 조회
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
    const sqlId = searchParams.get('sql_id');
    const planHashValue = searchParams.get('plan_hash_value');
    const dbId = searchParams.get('db_id');
    const format = searchParams.get('format') || 'TYPICAL';

    if (!connectionId || !sqlId) {
      return NextResponse.json(
        { error: 'connection_id and sql_id are required' },
        { status: 400 }
      );
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

    // DBMS_XPLAN.DISPLAY_AWR SQL 구성
    let sql = `
      SELECT plan_table_output
      FROM TABLE(DBMS_XPLAN.DISPLAY_AWR(
        sql_id => :1,
        plan_hash_value => ${planHashValue ? ':2' : 'NULL'},
        db_id => ${dbId ? (planHashValue ? ':3' : ':2') : 'NULL'},
        format => :${planHashValue && dbId ? '4' : planHashValue || dbId ? '3' : '2'}
      ))
    `;

    const binds: any[] = [sqlId];
    if (planHashValue) {
      binds.push(parseInt(planHashValue));
    }
    if (dbId) {
      binds.push(parseInt(dbId));
    }
    binds.push(format);

    // 실행계획 조회
    const result = await executeQuery<{ PLAN_TABLE_OUTPUT: string }>(config, sql, binds);

    // AWR 메타정보 조회
    let metaSql = `
      SELECT
        sql_id,
        plan_hash_value
      FROM dba_hist_sql_plan
      WHERE sql_id = :1
    `;

    const metaBinds: any[] = [sqlId];
    let bindIndex = 2;

    if (planHashValue) {
      metaSql += ` AND plan_hash_value = :${bindIndex}`;
      metaBinds.push(parseInt(planHashValue));
      bindIndex++;
    }
    if (dbId) {
      metaSql += ` AND dbid = :${bindIndex}`;
      metaBinds.push(parseInt(dbId));
    }

    metaSql += ` AND rownum = 1`;

    const metaResult = await executeQuery<{
      SQL_ID: string;
      PLAN_HASH_VALUE: number;
    }>(config, metaSql, metaBinds);

    const planOutput = result.rows.map((row) => row.PLAN_TABLE_OUTPUT);
    const meta = metaResult.rows[0];

    return NextResponse.json({
      plan_table_output: planOutput,
      sql_id: meta?.SQL_ID,
      plan_hash_value: meta?.PLAN_HASH_VALUE,
    });
  } catch (error) {
    console.error('DBMS_XPLAN.DISPLAY_AWR error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to execute DBMS_XPLAN.DISPLAY_AWR',
      },
      { status: 500 }
    );
  }
}
