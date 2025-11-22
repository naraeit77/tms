/**
 * Table Statistics API
 * DBA_TABLES 뷰에서 테이블 통계 정보 조회
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/crypto';
import { executeQuery } from '@/lib/oracle';
import type { OracleConnectionConfig } from '@/lib/oracle/types';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
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
    const { data: connection, error: connError } = await supabase
      .from('oracle_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('is_active', true)
      .single();

    if (connError || !connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    const password = decrypt(connection.password_encrypted);

    const oracleConfig: OracleConnectionConfig = {
      id: connection.id,
      name: connection.name,
      host: connection.host,
      port: connection.port,
      serviceName: connection.service_name || undefined,
      sid: connection.sid || undefined,
      username: connection.username,
      password,
      connectionType: connection.connection_type,
    };

    // Build query with optional filters
    // Note: STALE_STATS and STATTYPE_LOCKED are only available in Oracle 10g+
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

    // Execute query
    const result = await executeQuery(oracleConfig, query, binds);

    // Transform result to match interface
    const tables = result.rows.map((row: any) => ({
      owner: row.OWNER || row.owner,
      table_name: row.TABLE_NAME || row.table_name,
      num_rows: row.NUM_ROWS !== undefined ? row.NUM_ROWS : (row.num_rows !== undefined ? row.num_rows : null),
      blocks: row.BLOCKS !== undefined ? row.BLOCKS : (row.blocks !== undefined ? row.blocks : null),
      avg_row_len: row.AVG_ROW_LEN !== undefined ? row.AVG_ROW_LEN : (row.avg_row_len !== undefined ? row.avg_row_len : null),
      last_analyzed: row.LAST_ANALYZED || row.last_analyzed || null,
      stale_stats: 'NO', // Default value - requires Oracle 10g+
      stattype_locked: null, // Default value - requires Oracle 10g+
    }));

    return NextResponse.json({ data: tables });
  } catch (error: any) {
    console.error('Error fetching table stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch table statistics', details: error.message },
      { status: 500 }
    );
  }
}
