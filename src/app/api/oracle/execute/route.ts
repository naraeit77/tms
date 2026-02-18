/**
 * Oracle SQL Query Execution API
 * SQL 쿼리 실행 엔드포인트
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getConnection } from '@/lib/oracle/client';
import { getOracleConfig } from '@/lib/oracle/utils';
import oracledb from 'oracledb';

export async function POST(request: NextRequest) {
  let connection: oracledb.Connection | null = null;

  try {
    // 인증 확인
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { connectionId, query, schema, options = {} } = body;

    if (!connectionId || !query) {
      return NextResponse.json({ error: 'Missing required fields: connectionId, query' }, { status: 400 });
    }

    console.log('[Execute API] Executing query for connection:', connectionId, 'schema:', schema || 'default');

    // 캐싱된 연결 설정 가져오기
    const config = await getOracleConfig(connectionId);
    console.log('[Execute API] Connection found:', config.name);

    const startTime = Date.now();

    try {
      // 하나의 연결을 사용하여 스키마 변경과 쿼리 실행을 함께 처리
      connection = await getConnection(config);

      // 스키마가 지정된 경우 현재 스키마 변경 (같은 connection에서)
      if (schema) {
        try {
          await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ${schema}`);
          console.log('[Execute API] Schema changed to:', schema);
        } catch (schemaError: any) {
          console.warn('[Execute API] Failed to change schema:', schemaError.message);
          // 스키마 변경 실패해도 쿼리는 계속 실행 (권한 문제일 수 있음)
        }
      }

      // 쿼리 정리: 세미콜론 제거 및 공백 정리
      const cleanQuery = query.trim().replace(/;+\s*$/, '');

      // 쿼리 타입 감지
      const queryType = detectQueryType(cleanQuery);
      console.log('[Execute API] Query type:', queryType);

      const maxRows = options.maxRows || 1000;
      const offset = options.offset || 0;
      const fetchSize = options.fetchSize || 100;

      // 같은 connection에서 쿼리 실행
      const result = await connection.execute(cleanQuery, [], {
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
  } finally {
    // 연결 정리
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('[Execute API] Error closing connection:', err);
      }
    }
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
