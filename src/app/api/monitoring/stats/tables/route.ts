/**
 * Table Statistics API
 * DBA_TABLES 뷰에서 테이블 통계 정보 조회
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { oracleConnections } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { decrypt } from '@/lib/crypto';
import { executeQuery } from '@/lib/oracle';
import type { OracleConnectionConfig } from '@/lib/oracle/types';

export async function GET(request: NextRequest) {
  try {
    // 현재 사용자 확인 (Next-Auth 세션 사용)
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');
    const owner = searchParams.get('owner');
    const tableName = searchParams.get('table_name');

    if (!connectionId || connectionId === 'all') {
      return NextResponse.json({ error: 'Connection ID required' }, { status: 400 });
    }

    // Get connection config
    const connections = await db
      .select()
      .from(oracleConnections)
      .where(
        and(
          eq(oracleConnections.id, connectionId),
          eq(oracleConnections.isActive, true)
        )
      )
      .limit(1);

    const connection = connections[0];
    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    const password = decrypt(connection.passwordEncrypted);

    const oracleConfig: OracleConnectionConfig = {
      id: connection.id,
      name: connection.name,
      host: connection.host,
      port: connection.port!,
      serviceName: connection.serviceName || undefined,
      sid: connection.sid || undefined,
      username: connection.username,
      password,
      connectionType: connection.connectionType!,
      privilege: connection.privilege || undefined,
    };

    // Build query with optional filters
    // DBA_TABLES 접근 권한이 없을 수 있으므로 ALL_TABLES로 폴백 시도
    let query = `
      SELECT
        owner,
        table_name,
        num_rows,
        blocks,
        avg_row_len,
        last_analyzed
      FROM dba_tables
      WHERE owner NOT IN ('SYS', 'SYSTEM', 'OUTLN', 'XDB', 'WMSYS', 'CTXSYS', 'MDSYS', 'OLAPSYS', 'ORDSYS')
    `;

    let useDbaTables = true;

    const binds: any[] = [];
    let bindIndex = 1;

    if (owner) {
      query += ` AND owner = :${bindIndex}`;
      binds.push(owner.toUpperCase());
      bindIndex++;
    }

    if (tableName) {
      query += ` AND table_name LIKE :${bindIndex}`;
      binds.push(`%${tableName.toUpperCase()}%`);
      bindIndex++;
    }

    query += ` ORDER BY owner, table_name`;

    // Execute query - DBA_TABLES 접근 권한이 없으면 ALL_TABLES로 폴백
    let result;
    try {
      result = await executeQuery(oracleConfig, query, binds, { timeout: 30000 });
    } catch (dbaError: any) {
      // DBA_TABLES 접근 권한이 없으면 ALL_TABLES 사용 (현재 사용자의 테이블만 조회)
      if (dbaError.message?.includes('ORA-00942') || dbaError.message?.includes('table or view does not exist')) {
        console.log('[Stats Tables API] DBA_TABLES not accessible, falling back to ALL_TABLES');

        let allTablesQuery = `
          SELECT
            owner,
            table_name,
            num_rows,
            blocks,
            avg_row_len,
            last_analyzed
          FROM all_tables
          WHERE owner NOT IN ('SYS', 'SYSTEM', 'OUTLN', 'XDB', 'WMSYS', 'CTXSYS', 'MDSYS', 'OLAPSYS', 'ORDSYS')
        `;

        const allTablesBinds: any[] = [];
        let allTablesBindIndex = 1;

        if (owner) {
          allTablesQuery += ` AND owner = :${allTablesBindIndex}`;
          allTablesBinds.push(owner.toUpperCase());
          allTablesBindIndex++;
        }

        if (tableName) {
          allTablesQuery += ` AND table_name LIKE :${allTablesBindIndex}`;
          allTablesBinds.push(`%${tableName.toUpperCase()}%`);
          allTablesBindIndex++;
        }

        allTablesQuery += ` ORDER BY owner, table_name`;

        result = await executeQuery(oracleConfig, allTablesQuery, allTablesBinds, { timeout: 30000 });
      } else {
        throw dbaError;
      }
    }

    // Transform result to match interface
    const tables = result.rows.map((row: any) => ({
      owner: row.OWNER || row.owner,
      table_name: row.TABLE_NAME || row.table_name,
      num_rows: row.NUM_ROWS !== undefined ? row.NUM_ROWS : (row.num_rows !== undefined ? row.num_rows : null),
      blocks: row.BLOCKS !== undefined ? row.BLOCKS : (row.blocks !== undefined ? row.blocks : null),
      avg_row_len: row.AVG_ROW_LEN !== undefined ? row.AVG_ROW_LEN : (row.avg_row_len !== undefined ? row.avg_row_len : null),
      last_analyzed: row.LAST_ANALYZED || row.last_analyzed || null,
      stale_stats: 'NO', // Default value - STALE_STATS 컬럼은 DBA_TABLES에서만 사용 가능
      stattype_locked: null, // Default value - STATTYPE_LOCKED 컬럼은 DBA_TABLES에서만 사용 가능
    }));

    return NextResponse.json({ data: tables });
  } catch (error: any) {
    console.error('[Stats Tables API] Error fetching table stats:', error);
    const errorMessage = error.message || 'Failed to fetch table statistics';

    // Oracle 에러 코드에 따른 상세 메시지 제공
    let userFriendlyMessage = errorMessage;
    if (errorMessage.includes('ORA-00942')) {
      userFriendlyMessage = 'DBA_TABLES 뷰에 접근할 권한이 없습니다. 데이터베이스 관리자에게 권한을 요청하세요.';
    } else if (errorMessage.includes('ORA-01017')) {
      userFriendlyMessage = '데이터베이스 인증에 실패했습니다. 연결 정보를 확인하세요.';
    } else if (errorMessage.includes('ORA-12154')) {
      userFriendlyMessage = '데이터베이스 연결에 실패했습니다. 연결 정보를 확인하세요.';
    }

    return NextResponse.json(
      {
        error: 'Failed to fetch table statistics',
        details: userFriendlyMessage,
        originalError: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    );
  }
}
