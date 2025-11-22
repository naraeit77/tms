import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/oracle/client';
import { createPureClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/crypto';

/**
 * GET /api/oracle/columns
 * Fetch columns for a specific table
 */
export async function GET(request: NextRequest) {
  try {
    const connectionId = request.nextUrl.searchParams.get('connectionId');
    const schemaName = request.nextUrl.searchParams.get('schema');
    const tableName = request.nextUrl.searchParams.get('table');

    if (!connectionId || !schemaName || !tableName) {
      console.error('[Columns API] Missing required parameters');
      return NextResponse.json(
        { error: 'Connection ID, schema name, and table name are required' },
        { status: 400 }
      );
    }

    console.log('[Columns API] Fetching columns for connection:', connectionId, 'schema:', schemaName, 'table:', tableName);

    // Fetch connection details from Supabase
    const supabase = await createPureClient();
    const { data: connection, error: connectionError } = await supabase
      .from('oracle_connections')
      .select('*')
      .eq('id', connectionId)
      .single();

    if (connectionError) {
      console.error('[Columns API] Supabase error:', connectionError);
      return NextResponse.json({ error: 'Failed to fetch connection details' }, { status: 500 });
    }

    if (!connection) {
      console.error('[Columns API] Connection not found:', connectionId);
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    console.log('[Columns API] Connection found:', connection.name);

    // Decrypt password
    const password = decrypt(connection.password_encrypted);

    const sql = `
      SELECT
        c.column_name as COLUMN_NAME,
        c.data_type as DATA_TYPE,
        c.data_length as DATA_LENGTH,
        c.data_precision as DATA_PRECISION,
        c.data_scale as DATA_SCALE,
        c.nullable as NULLABLE,
        c.column_id as COLUMN_ID,
        cc.comments as COMMENTS,
        CASE
          WHEN pk.column_name IS NOT NULL THEN 'Y'
          ELSE 'N'
        END as IS_PRIMARY_KEY
      FROM all_tab_columns c
      LEFT JOIN all_col_comments cc ON c.owner = cc.owner
        AND c.table_name = cc.table_name
        AND c.column_name = cc.column_name
      LEFT JOIN (
        SELECT acc.owner, acc.table_name, acc.column_name
        FROM all_constraints ac
        JOIN all_cons_columns acc ON ac.owner = acc.owner
          AND ac.constraint_name = acc.constraint_name
        WHERE ac.constraint_type = 'P'
      ) pk ON c.owner = pk.owner
        AND c.table_name = pk.table_name
        AND c.column_name = pk.column_name
      WHERE c.owner = :schema
      AND c.table_name = :table_name
      ORDER BY c.column_id
    `;

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

    console.log('[Columns API] Executing query...');
    const result = await executeQuery(config, sql, [schemaName, tableName]);

    console.log('[Columns API] Success! Found', result.rows.length, 'columns');
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('[Columns API] Error fetching columns:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch columns' },
      { status: 500 }
    );
  }
}
