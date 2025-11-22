/**
 * Statistics Gathering API
 * DBMS_STATS.GATHER_TABLE_STATS를 이용한 통계 수집
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/crypto';
import { executeQuery } from '@/lib/oracle';
import type { OracleConnectionConfig } from '@/lib/oracle/types';

interface GatherStatsRequest {
  connection_id: string;
  owner: string;
  table_name: string;
  estimate_percent?: number;
  cascade?: boolean;
  degree?: number;
  method_opt?: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: GatherStatsRequest = await request.json();
    const { connection_id, owner, table_name, estimate_percent = 10, cascade = true, degree = 4, method_opt = 'FOR ALL COLUMNS SIZE AUTO' } = body;

    if (!connection_id || !owner || !table_name) {
      return NextResponse.json(
        { error: 'Connection ID, owner, and table_name are required' },
        { status: 400 }
      );
    }

    // Get connection config
    const { data: connection, error: connError } = await supabase
      .from('oracle_connections')
      .select('*')
      .eq('id', connection_id)
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

    // Create history record - IN_PROGRESS
    const startTime = new Date();
    const { data: historyRecord, error: historyError } = await supabase
      .from('stats_collection_history')
      .insert({
        oracle_connection_id: connection_id,
        owner: owner.toUpperCase(),
        table_name: table_name.toUpperCase(),
        operation: 'GATHER_TABLE_STATS',
        status: 'IN_PROGRESS',
        start_time: startTime.toISOString(),
      })
      .select()
      .single();

    if (historyError) {
      console.error('Failed to create history record:', historyError);
    }

    try {
      // Execute DBMS_STATS.GATHER_TABLE_STATS
      const plsql = `
        BEGIN
          DBMS_STATS.GATHER_TABLE_STATS(
            ownname => :1,
            tabname => :2,
            estimate_percent => :3,
            cascade => :4,
            degree => :5,
            method_opt => :6
          );
        END;
      `;

      await executeQuery(oracleConfig, plsql, [
        owner.toUpperCase(),
        table_name.toUpperCase(),
        estimate_percent,
        cascade,
        degree,
        method_opt,
      ]);

      // Update history record - SUCCESS
      const endTime = new Date();
      const durationSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

      if (historyRecord) {
        await supabase
          .from('stats_collection_history')
          .update({
            status: 'SUCCESS',
            end_time: endTime.toISOString(),
            duration_seconds: durationSeconds,
          })
          .eq('id', historyRecord.id);
      }

      return NextResponse.json({
        success: true,
        message: `Statistics gathered successfully for ${owner}.${table_name}`,
        duration_seconds: durationSeconds,
      });
    } catch (error: any) {
      // Update history record - FAILED
      const endTime = new Date();
      const durationSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

      if (historyRecord) {
        await supabase
          .from('stats_collection_history')
          .update({
            status: 'FAILED',
            end_time: endTime.toISOString(),
            duration_seconds: durationSeconds,
            error_message: error.message,
          })
          .eq('id', historyRecord.id);
      }

      throw error;
    }
  } catch (error: any) {
    console.error('Error gathering statistics:', error);
    return NextResponse.json(
      { error: 'Failed to gather statistics', details: error.message },
      { status: 500 }
    );
  }
}
