/**
 * DBMS_XPLAN.DISPLAY_CURSOR API Route
 * Shared Pool에 캐시된 실행계획 조회
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
    const sqlId = searchParams.get('sql_id');
    const childNumberParam = searchParams.get('child_number');
    const format = searchParams.get('format') || 'TYPICAL';

    if (!connectionId || !sqlId) {
      return NextResponse.json(
        { error: 'connection_id and sql_id are required' },
        { status: 400 }
      );
    }

    // Supabase에서 연결 정보 조회
    const supabase = await createPureClient();

    console.log('🔍 Fetching connection:', {
      connectionId,
      userId: session.user.id,
    });

    const { data: connection, error: dbError } = await supabase
      .from('oracle_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('created_by', session.user.id)
      .single();

    if (dbError || !connection) {
      console.error('❌ Connection fetch error:', {
        error: dbError,
        connectionId,
        userId: session.user.id,
      });
      return NextResponse.json({
        error: 'Connection not found',
        details: dbError?.message || 'No connection data',
        connectionId,
      }, { status: 404 });
    }

    console.log('✅ Connection found:', connection.name);

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

    // DBMS_XPLAN.DISPLAY_CURSOR SQL 구성
    const childNumber = childNumberParam ? parseInt(childNumberParam) : null;

    let sql = `
      SELECT plan_table_output
      FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(
        sql_id => :1,
        cursor_child_no => ${childNumber !== null ? ':2' : 'NULL'},
        format => :${childNumber !== null ? '3' : '2'}
      ))
    `;

    const binds: any[] = [sqlId];
    if (childNumber !== null) {
      binds.push(childNumber);
    }
    binds.push(format);

    // 실행계획 조회
    const result = await executeQuery<{ PLAN_TABLE_OUTPUT: string }>(config, sql, binds);

    // SQL 메타정보 조회
    let metaSql = `
      SELECT
        sql_id,
        plan_hash_value,
        child_number
      FROM v$sql
      WHERE sql_id = :1
    `;

    const metaBinds: any[] = [sqlId];
    if (childNumber !== null) {
      metaSql += ' AND child_number = :2';
      metaBinds.push(childNumber);
    }
    metaSql += ' AND rownum = 1';

    const metaResult = await executeQuery<{
      SQL_ID: string;
      PLAN_HASH_VALUE: number;
      CHILD_NUMBER: number;
    }>(config, metaSql, metaBinds);

    const planOutput = result.rows.map((row) => row.PLAN_TABLE_OUTPUT);
    const meta = metaResult.rows[0];

    return NextResponse.json({
      plan_table_output: planOutput,
      sql_id: meta?.SQL_ID,
      plan_hash_value: meta?.PLAN_HASH_VALUE,
      child_number: meta?.CHILD_NUMBER,
    });
  } catch (error) {
    console.error('DBMS_XPLAN.DISPLAY_CURSOR error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to execute DBMS_XPLAN.DISPLAY_CURSOR',
      },
      { status: 500 }
    );
  }
}
