/**
 * SQL Statistics Collection API
 * POST: Oracle DB에서 SQL 통계를 수집하여 Supabase에 저장
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/crypto';
import { collectSQLStatistics, getSQLFullText } from '@/lib/oracle';
import type { OracleConnectionConfig, SQLStatisticsRow } from '@/lib/oracle/types';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 현재 사용자 확인
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

    // 시스템 설정에서 임계값 조회
    const { data: settings } = await supabase
      .from('system_settings')
      .select('*')
      .in('key', [
        'elapsed_time_critical',
        'elapsed_time_warning',
        'buffer_gets_critical',
        'buffer_gets_warning',
      ]);

    const thresholds = {
      elapsed_critical: (settings?.find((s) => s.key === 'elapsed_time_critical')?.value as any)?.value || 10000,
      elapsed_warning: (settings?.find((s) => s.key === 'elapsed_time_warning')?.value as any)?.value || 5000,
      buffer_critical: (settings?.find((s) => s.key === 'buffer_gets_critical')?.value as any)?.value || 1000000,
      buffer_warning: (settings?.find((s) => s.key === 'buffer_gets_warning')?.value as any)?.value || 500000,
    };

    // Oracle 연결 및 SQL 통계 수집
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

    // Oracle에서 SQL 통계 수집 (실제 클라이언트 사용)
    console.log('Collecting SQL statistics from Oracle...', {
      host: config.host,
      port: config.port,
      username: config.username,
      connectionType: config.connectionType,
      serviceName: config.serviceName,
      sid: config.sid,
    });

    let sqlStats: SQLStatisticsRow[];
    try {
      sqlStats = await collectSQLStatistics(config, 1000);
      console.log(`Collected ${sqlStats?.length || 0} SQL statistics`);
    } catch (collectError) {
      console.error('Error during SQL statistics collection:', collectError);
      const errorMessage = collectError instanceof Error ? collectError.message : 'Unknown error';
      const errorStack = collectError instanceof Error ? collectError.stack : undefined;
      
      return NextResponse.json(
        {
          error: 'Failed to collect SQL statistics',
          details: errorMessage,
          stack: process.env.NODE_ENV === 'development' ? errorStack : undefined,
        },
        { status: 500 }
      );
    }

    if (!sqlStats || sqlStats.length === 0) {
      return NextResponse.json({
        message: 'No SQL statistics found',
        collected: 0,
      });
    }

    let collected = 0;
    let errors = 0;

    // SQL 통계 저장
    for (const row of sqlStats) {
      try {
        // SQL Full Text 조회
        const sqlTextRaw = await getSQLFullText(config, row.SQL_ID);

        // sqlText를 문자열로 변환 (Buffer나 다른 타입일 수 있음)
        const sqlText = typeof sqlTextRaw === 'string'
          ? sqlTextRaw
          : String(sqlTextRaw || '');

        // 상태 및 우선순위 결정
        const status = determineStatus(row, thresholds);
        const priority = determinePriority(row, thresholds);

        // Upsert SQL 통계
        const { error: upsertError } = await supabase.from('sql_statistics').upsert(
          {
            oracle_connection_id: connection_id,
            sql_id: row.SQL_ID,
            plan_hash_value: row.PLAN_HASH_VALUE ? Math.floor(Number(row.PLAN_HASH_VALUE)) : null,
            module: row.MODULE,
            schema_name: row.SCHEMA_NAME,
            sql_text: sqlText.substring(0, 4000),
            sql_fulltext: sqlText,
            elapsed_time_ms: Math.floor(Number(row.ELAPSED_TIME_MS) || 0),
            cpu_time_ms: Math.floor(Number(row.CPU_TIME_MS) || 0),
            buffer_gets: Math.floor(Number(row.BUFFER_GETS) || 0),
            disk_reads: Math.floor(Number(row.DISK_READS) || 0),
            direct_writes: Math.floor(Number(row.DIRECT_WRITES) || 0),
            executions: Math.floor(Number(row.EXECUTIONS) || 0),
            parse_calls: Math.floor(Number(row.PARSE_CALLS) || 0),
            rows_processed: Math.floor(Number(row.ROWS_PROCESSED) || 0),
            avg_elapsed_time_ms: row.EXECUTIONS > 0 ? row.ELAPSED_TIME_MS / row.EXECUTIONS : 0,
            avg_cpu_time_ms: row.EXECUTIONS > 0 ? row.CPU_TIME_MS / row.EXECUTIONS : 0,
            gets_per_exec: row.EXECUTIONS > 0 ? row.BUFFER_GETS / row.EXECUTIONS : 0,
            rows_per_exec: row.EXECUTIONS > 0 ? row.ROWS_PROCESSED / row.EXECUTIONS : 0,
            application_wait_time_ms: Math.floor(Number(row.APPLICATION_WAIT_TIME_MS) || 0),
            concurrency_wait_time_ms: Math.floor(Number(row.CONCURRENCY_WAIT_TIME_MS) || 0),
            cluster_wait_time_ms: Math.floor(Number(row.CLUSTER_WAIT_TIME_MS) || 0),
            user_io_wait_time_ms: Math.floor(Number(row.USER_IO_WAIT_TIME_MS) || 0),
            first_load_time: row.FIRST_LOAD_TIME,
            last_active_time: row.LAST_ACTIVE_TIME,
            last_load_time: row.LAST_LOAD_TIME,
            collected_at: new Date().toISOString(),
            status,
            priority,
          },
          {
            onConflict: 'oracle_connection_id,sql_id,plan_hash_value',
          }
        );

        if (upsertError) {
          errors++;
          console.error(`Error upserting SQL ${row.SQL_ID}:`, upsertError);
        } else {
          collected++;
        }
      } catch (err) {
        errors++;
        console.error(`Error processing SQL ${row.SQL_ID}:`, err);
      }
    }

    // 감사 로그
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'COLLECT',
      resource_type: 'sql_statistics',
      resource_id: connection_id,
      details: {
        total: sqlStats.length,
        collected,
        errors,
      },
    });

    return NextResponse.json({
      message: 'SQL statistics collected successfully',
      total: sqlStats.length,
      collected,
      errors,
    });
  } catch (error) {
    console.error('Collection error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return NextResponse.json(
      {
        error: 'Failed to collect SQL statistics',
        details: errorMessage,
        stack: process.env.NODE_ENV === 'development' ? errorStack : undefined,
      },
      { status: 500 }
    );
  }
}

function determineStatus(row: SQLStatisticsRow, thresholds: any): 'NORMAL' | 'WARNING' | 'CRITICAL' {
  if (row.ELAPSED_TIME_MS >= thresholds.elapsed_critical || row.BUFFER_GETS >= thresholds.buffer_critical) {
    return 'CRITICAL';
  }

  if (row.ELAPSED_TIME_MS >= thresholds.elapsed_warning || row.BUFFER_GETS >= thresholds.buffer_warning) {
    return 'WARNING';
  }

  return 'NORMAL';
}

function determinePriority(row: SQLStatisticsRow, thresholds: any): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  const status = determineStatus(row, thresholds);

  if (status === 'CRITICAL') {
    return 'CRITICAL';
  } else if (status === 'WARNING') {
    return 'HIGH';
  } else {
    return 'MEDIUM';
  }
}
