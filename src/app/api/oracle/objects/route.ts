import { NextRequest, NextResponse } from 'next/server';
import { executeQuery } from '@/lib/oracle/client';
import { createPureClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/crypto';

/**
 * GET /api/oracle/objects
 * Fetch database objects (tables, views, etc.) for a specific schema
 */
export async function GET(request: NextRequest) {
  try {
    const connectionId = request.nextUrl.searchParams.get('connectionId');
    const schemaName = request.nextUrl.searchParams.get('schema');
    const objectType = request.nextUrl.searchParams.get('type') || 'TABLE'; // TABLE, VIEW, PROCEDURE, FUNCTION, etc.

    if (!connectionId || !schemaName) {
      console.error('[Objects API] Missing required parameters');
      return NextResponse.json(
        { error: 'Connection ID and schema name are required' },
        { status: 400 }
      );
    }

    console.log('[Objects API] Fetching objects for connection:', connectionId, 'schema:', schemaName, 'type:', objectType);

    // Fetch connection details from Supabase
    const supabase = await createPureClient();
    const { data: connection, error: connectionError } = await supabase
      .from('oracle_connections')
      .select('*')
      .eq('id', connectionId)
      .single();

    if (connectionError) {
      console.error('[Objects API] Supabase error:', connectionError);
      return NextResponse.json({ error: 'Failed to fetch connection details' }, { status: 500 });
    }

    if (!connection) {
      console.error('[Objects API] Connection not found:', connectionId);
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    console.log('[Objects API] Connection found:', connection.name);

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

    // Query based on object type
    if (objectType === 'TABLE') {
      const sql = `
        SELECT
          t.table_name as OBJECT_NAME,
          'TABLE' as OBJECT_TYPE,
          tc.comments as COMMENTS,
          t.num_rows as NUM_ROWS,
          t.tablespace_name as TABLESPACE_NAME,
          t.last_analyzed as LAST_ANALYZED
        FROM all_tables t
        LEFT JOIN all_tab_comments tc ON t.owner = tc.owner AND t.table_name = tc.table_name
        WHERE t.owner = :schema
        ORDER BY t.table_name
      `;

      const result = await executeQuery(config, sql, [schemaName]);
      return NextResponse.json(result.rows);
    } else if (objectType === 'VIEW') {
      const sql = `
        SELECT
          view_name as OBJECT_NAME,
          'VIEW' as OBJECT_TYPE,
          text_length as TEXT_LENGTH
        FROM all_views
        WHERE owner = :schema
        ORDER BY view_name
      `;

      const result = await executeQuery(config, sql, [schemaName]);
      return NextResponse.json(result.rows);
    } else if (objectType === 'ALL') {
      // Get all object types
      const sql = `
        SELECT
          object_name as OBJECT_NAME,
          object_type as OBJECT_TYPE,
          status as STATUS,
          created as CREATED,
          last_ddl_time as LAST_DDL_TIME
        FROM all_objects
        WHERE owner = :schema
        AND object_type IN ('TABLE', 'VIEW', 'INDEX', 'SEQUENCE', 'SYNONYM', 'PROCEDURE', 'FUNCTION', 'PACKAGE', 'TRIGGER')
        ORDER BY object_type, object_name
      `;

      const result = await executeQuery(config, sql, [schemaName]);
      console.log('[Objects API] Success! Found', result.rows.length, 'objects');
      return NextResponse.json(result.rows);
    } else {
      const sql = `
        SELECT
          object_name as OBJECT_NAME,
          object_type as OBJECT_TYPE,
          status as STATUS,
          created as CREATED,
          last_ddl_time as LAST_DDL_TIME
        FROM all_objects
        WHERE owner = :schema
        AND object_type = :object_type
        ORDER BY object_name
      `;

      const result = await executeQuery(config, sql, [schemaName, objectType]);
      console.log('[Objects API] Success! Found', result.rows.length, 'objects');
      return NextResponse.json(result.rows);
    }
  } catch (error) {
    console.error('[Objects API] Error fetching database objects:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch database objects' },
      { status: 500 }
    );
  }
}
