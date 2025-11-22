/**
 * DBMS_XPLAN.DISPLAY_SQLSET API Route
 * SQL Tuning Set에서 실행계획 조회
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createPureClient } from '@/lib/supabase/server';
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
    const sqlsetName = searchParams.get('sqlset_name');
    const sqlsetOwner = searchParams.get('sqlset_owner');
    const sqlId = searchParams.get('sql_id');
    const format = searchParams.get('format') || 'TYPICAL';

    if (!connectionId || !sqlsetName || !sqlId) {
      return NextResponse.json(
        { error: 'connection_id, sqlset_name, and sql_id are required' },
        { status: 400 }
      );
    }

    // Supabase에서 연결 정보 조회
    const supabase = await createPureClient();
    const { data: connection, error: dbError } = await supabase
      .from('oracle_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('created_by', session.user.id)
      .single();

    if (dbError || !connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    // Oracle 연결 설정
    const password = decrypt(connection.password_encrypted);
    const config: OracleConnectionConfig = {
      id: connection.id,
      name: connection.name,
      host: connection.host,
      port: connection.port,
      serviceName: connection.service_name,
      sid: connection.sid,
      username: connection.username,
      password,
      connectionType: connection.connection_type as 'SERVICE_NAME' | 'SID',
    };

    // DBMS_XPLAN.DISPLAY_SQLSET SQL 구성
    let sql = `
      SELECT plan_table_output
      FROM TABLE(DBMS_XPLAN.DISPLAY_SQLSET(
        sqlset_name => :1,
        sqlset_owner => ${sqlsetOwner ? ':2' : 'NULL'},
        sql_id => :${sqlsetOwner ? '3' : '2'},
        format => :${sqlsetOwner ? '4' : '3'}
      ))
    `;

    const binds: any[] = [sqlsetName];
    if (sqlsetOwner) {
      binds.push(sqlsetOwner);
    }
    binds.push(sqlId);
    binds.push(format);

    // 실행계획 조회
    const result = await executeQuery<{ PLAN_TABLE_OUTPUT: string }>(config, sql, binds);

    const planOutput = result.rows.map((row) => row.PLAN_TABLE_OUTPUT);

    return NextResponse.json({
      plan_table_output: planOutput,
      sql_id: sqlId,
    });
  } catch (error) {
    console.error('DBMS_XPLAN.DISPLAY_SQLSET error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to execute DBMS_XPLAN.DISPLAY_SQLSET',
      },
      { status: 500 }
    );
  }
}
