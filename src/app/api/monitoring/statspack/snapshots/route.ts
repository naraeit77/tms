/**
 * STATSPACK Snapshots API
 * GET: 스냅샷 목록 조회
 * POST: 새로운 스냅샷 생성
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/crypto';
import { executeQuery } from '@/lib/oracle';
import type { OracleConnectionConfig } from '@/lib/oracle/types';

// GET: 스냅샷 목록 조회
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

    if (!connectionId) {
      return NextResponse.json({ error: 'connection_id is required' }, { status: 400 });
    }

    // 스냅샷 목록 조회
    const { data: snapshots, error } = await supabase
      .from('statspack_snapshots')
      .select('*')
      .eq('oracle_connection_id', connectionId)
      .order('snap_time', { ascending: false })
      .limit(100);

    if (error) {
      throw error;
    }

    return NextResponse.json({ data: snapshots || [] });
  } catch (error) {
    console.error('Failed to fetch snapshots:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch snapshots',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// POST: 스냅샷 생성
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { connection_id } = body;

    if (!connection_id) {
      return NextResponse.json({ error: 'connection_id is required' }, { status: 400 });
    }

    // 연결 정보 조회
    const { data: connection, error: connError } = await supabase
      .from('oracle_connections')
      .select('*')
      .eq('id', connection_id)
      .eq('is_active', true)
      .single();

    if (connError || !connection) {
      return NextResponse.json({ error: 'Connection not found or inactive' }, { status: 404 });
    }

    const password = decrypt(connection.password_encrypted);

    const config: OracleConnectionConfig = {
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

    // STATSPACK 스냅샷 생성
    // 먼저 다음 snap_id 조회
    const { data: lastSnap } = await supabase
      .from('statspack_snapshots')
      .select('snap_id')
      .eq('oracle_connection_id', connection_id)
      .order('snap_id', { ascending: false })
      .limit(1)
      .single();

    const nextSnapId = (lastSnap?.snap_id || 0) + 1;

    // Oracle에서 현재 통계 정보 수집
    const statsQuery = `
      SELECT
        (SELECT COUNT(*) FROM v$session WHERE type = 'USER') as session_count,
        (SELECT COUNT(*) FROM v$transaction) as transaction_count,
        (SELECT value FROM v$sysstat WHERE name = 'DB time') / 1000 as db_time_ms,
        (SELECT value FROM v$sysstat WHERE name = 'CPU used by this session') / 1000 as cpu_time_ms,
        (SELECT value FROM v$sysstat WHERE name = 'physical reads') as physical_reads,
        (SELECT value FROM v$sysstat WHERE name = 'session logical reads') as logical_reads,
        (SELECT value FROM v$sysstat WHERE name = 'redo size') / 1024 / 1024 as redo_size_mb,
        TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI:SS') as snap_time,
        TO_CHAR(startup_time, 'YYYY-MM-DD HH24:MI:SS') as startup_time
      FROM v$instance
    `;

    const result = await executeQuery<{
      SESSION_COUNT: number;
      TRANSACTION_COUNT: number;
      DB_TIME_MS: number;
      CPU_TIME_MS: number;
      PHYSICAL_READS: number;
      LOGICAL_READS: number;
      REDO_SIZE_MB: number;
      SNAP_TIME: string;
      STARTUP_TIME: string;
    }>(config, statsQuery);

    if (!result.rows || result.rows.length === 0) {
      throw new Error('Failed to collect snapshot data from Oracle');
    }

    const stats = result.rows[0];

    // Supabase에 스냅샷 저장
    const { data: snapshot, error: insertError } = await supabase
      .from('statspack_snapshots')
      .insert({
        oracle_connection_id: connection_id,
        snap_id: nextSnapId,
        snap_time: stats.SNAP_TIME,
        startup_time: stats.STARTUP_TIME,
        session_count: Math.floor(Number(stats.SESSION_COUNT) || 0),
        transaction_count: Math.floor(Number(stats.TRANSACTION_COUNT) || 0),
        db_time_ms: Math.floor(Number(stats.DB_TIME_MS) || 0),
        cpu_time_ms: Math.floor(Number(stats.CPU_TIME_MS) || 0),
        physical_reads: Math.floor(Number(stats.PHYSICAL_READS) || 0),
        logical_reads: Math.floor(Number(stats.LOGICAL_READS) || 0),
        redo_size_mb: Math.floor(Number(stats.REDO_SIZE_MB) || 0),
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    // 감사 로그
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'CREATE',
      resource_type: 'statspack_snapshot',
      resource_id: snapshot.id,
      details: {
        snap_id: nextSnapId,
        connection_id,
      },
    });

    return NextResponse.json({
      message: 'Snapshot created successfully',
      data: snapshot,
    });
  } catch (error) {
    console.error('Failed to create snapshot:', error);
    return NextResponse.json(
      {
        error: 'Failed to create snapshot',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
