/**
 * Oracle SQL Query Execution API
 * SQL 쿼리 실행 엔드포인트
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { executeQuery } from '@/lib/oracle/client';
import { createPureClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/crypto';
import oracledb from 'oracledb';

export async function POST(request: NextRequest) {
  try {
    // 인증 확인
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { connectionId, query, options = {} } = body;

    if (!connectionId || !query) {
      return NextResponse.json({ error: 'Missing required fields: connectionId, query' }, { status: 400 });
    }

    console.log('[Execute API] Executing query for connection:', connectionId);

    // Fetch connection details from Supabase
    const supabase = await createPureClient();
    const { data: connection, error: connectionError } = await supabase
      .from('oracle_connections')
      .select('*')
      .eq('id', connectionId)
      .single();

    if (connectionError || !connection) {
      console.error('[Execute API] Connection error:', connectionError);
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    console.log('[Execute API] Connection found:', connection.name);

    // Decrypt password
    const password = decrypt(connection.password_encrypted);

    const config = {
      id: connection.id,
      name: connection.name,
      host: connection.host,
      port: connection.port,
      username: connection.username,
      password,
      serviceName: connection.service_name,
      sid: connection.sid,
      connectionType: connection.connection_type as 'SERVICE_NAME' | 'SID',
    };

    const startTime = Date.now();

    try {
      // 쿼리 정리: 세미콜론 제거 및 공백 정리
      const cleanQuery = query.trim().replace(/;+\s*$/, '');

      // 쿼리 타입 감지
      const queryType = detectQueryType(cleanQuery);
      console.log('[Execute API] Query type:', queryType);

      const maxRows = options.maxRows || 1000;
      const offset = options.offset || 0;
      const fetchSize = options.fetchSize || 100;

      // executeQuery 함수는 이미 연결 관리를 처리함
      const result = await executeQuery<any>(config, cleanQuery, [], {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        maxRows: queryType === 'SELECT' ? maxRows : undefined,
        autoCommit: queryType !== 'SELECT',
        fetchArraySize: queryType === 'SELECT' ? fetchSize : undefined,
      });

      const executionTime = Date.now() - startTime;

      console.log('[Execute API] Success! Execution time:', executionTime, 'ms');

      let resultData: any = {};

      if (queryType === 'SELECT') {
        const rows = result.rows || [];
        const hasMore = rows.length === maxRows;

        resultData = {
          rows,
          metaData: result.metaData || [],
          rowCount: rows.length,
          hasMore,
          offset,
          fetchedRows: rows.length,
        };
      } else {
        resultData = {
          rowsAffected: result.rowsAffected || 0,
          message: `Query executed successfully. ${result.rowsAffected || 0} row(s) affected.`,
        };
      }

      return NextResponse.json({
        success: true,
        queryType,
        executionTime,
        ...resultData,
      });
    } catch (error: any) {
      console.error('[Execute API] Query execution error:', error);

      return NextResponse.json(
        {
          error: error.message || 'Query execution failed',
          errorCode: error.errorNum,
          offset: error.offset,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[Execute API] Request error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

/**
 * SQL 쿼리 타입 감지
 */
function detectQueryType(query: string): string {
  const trimmedQuery = query.trim().toUpperCase();

  if (trimmedQuery.startsWith('SELECT') || trimmedQuery.startsWith('WITH')) {
    return 'SELECT';
  } else if (trimmedQuery.startsWith('INSERT')) {
    return 'INSERT';
  } else if (trimmedQuery.startsWith('UPDATE')) {
    return 'UPDATE';
  } else if (trimmedQuery.startsWith('DELETE')) {
    return 'DELETE';
  } else if (
    trimmedQuery.startsWith('CREATE') ||
    trimmedQuery.startsWith('ALTER') ||
    trimmedQuery.startsWith('DROP')
  ) {
    return 'DDL';
  } else if (trimmedQuery.startsWith('EXPLAIN')) {
    return 'EXPLAIN';
  } else {
    return 'OTHER';
  }
}
