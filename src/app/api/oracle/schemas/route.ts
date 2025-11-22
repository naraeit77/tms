import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/oracle/client';
import { createPureClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/crypto';

/**
 * GET /api/oracle/schemas
 * Fetch all schemas (users) in the Oracle database
 */
export async function GET(request: NextRequest) {
  try {
    const connectionId = request.nextUrl.searchParams.get('connectionId');

    if (!connectionId) {
      console.error('[Schemas API] Missing connectionId');
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    console.log('[Schemas API] Fetching schemas for connection:', connectionId);

    // Fetch connection details from Supabase
    const supabase = await createPureClient();
    const { data: connection, error: connectionError } = await supabase
      .from('oracle_connections')
      .select('*')
      .eq('id', connectionId)
      .single();

    if (connectionError) {
      console.error('[Schemas API] Supabase error:', connectionError);
      return NextResponse.json({ error: 'Failed to fetch connection details' }, { status: 500 });
    }

    if (!connection) {
      console.error('[Schemas API] Connection not found:', connectionId);
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    console.log('[Schemas API] Connection found:', connection.name);

    // Decrypt password
    const password = decrypt(connection.password_encrypted);

    // Query to get all schemas (users)
    // Use simple query that works with all Oracle versions
    const sql = `
      SELECT
        username as SCHEMA_NAME,
        created as CREATED
      FROM all_users
      WHERE username NOT IN ('SYS', 'SYSTEM', 'DBSNMP', 'SYSMAN', 'WMSYS', 'CTXSYS', 'MDSYS', 'OLAPSYS', 'ORDDATA', 'ORDPLUGINS', 'ORDSYS', 'OUTLN', 'SI_INFORMTN_SCHEMA', 'SPATIAL_CSW_ADMIN_USR', 'SPATIAL_WFS_ADMIN_USR', 'XDB', 'APEX_PUBLIC_USER', 'FLOWS_FILES', 'ANONYMOUS', 'AUDSYS', 'DIP', 'GSMADMIN_INTERNAL', 'LBACSYS', 'ORACLE_OCM', 'REMOTE_SCHEDULER_AGENT', 'XS$NULL')
      ORDER BY username
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

    console.log('[Schemas API] Executing query...');
    const result = await executeQuery<{
      SCHEMA_NAME: string;
      CREATED: Date;
    }>(config, sql);

    console.log('[Schemas API] Success! Found', result.rows.length, 'schemas');
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('[Schemas API] Error fetching schemas:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch schemas' },
      { status: 500 }
    );
  }
}
