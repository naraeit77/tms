/**
 * STATSPACK Reports API
 * GET: 리포트 목록 조회
 * POST: 새로운 리포트 생성
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/crypto';
import { executeQuery } from '@/lib/oracle';
import type { OracleConnectionConfig } from '@/lib/oracle/types';

// GET: 리포트 목록 조회
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

    // 리포트 목록 조회
    const { data: reports, error } = await supabase
      .from('statspack_reports')
      .select('*')
      .eq('oracle_connection_id', connectionId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    return NextResponse.json({ data: reports || [] });
  } catch (error) {
    console.error('Failed to fetch reports:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch reports',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// POST: 리포트 생성
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
    const { connection_id, begin_snap_id, end_snap_id, report_type = 'TEXT' } = body;

    if (!connection_id || !begin_snap_id || !end_snap_id) {
      return NextResponse.json(
        { error: 'connection_id, begin_snap_id, and end_snap_id are required' },
        { status: 400 }
      );
    }

    if (begin_snap_id >= end_snap_id) {
      return NextResponse.json(
        { error: 'begin_snap_id must be less than end_snap_id' },
        { status: 400 }
      );
    }

    // 스냅샷 정보 조회
    const { data: beginSnap, error: beginError } = await supabase
      .from('statspack_snapshots')
      .select('*')
      .eq('oracle_connection_id', connection_id)
      .eq('snap_id', begin_snap_id)
      .single();

    const { data: endSnap, error: endError } = await supabase
      .from('statspack_snapshots')
      .select('*')
      .eq('oracle_connection_id', connection_id)
      .eq('snap_id', end_snap_id)
      .single();

    if (beginError || endError || !beginSnap || !endSnap) {
      return NextResponse.json({ error: 'Snapshots not found' }, { status: 404 });
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

    // STATSPACK 리포트 생성
    const reportContent = await generateStatspackReport(
      config,
      beginSnap,
      endSnap,
      report_type as 'TEXT' | 'HTML'
    );

    // 리포트 저장
    const { data: report, error: insertError } = await supabase
      .from('statspack_reports')
      .insert({
        oracle_connection_id: connection_id,
        begin_snap_id,
        end_snap_id,
        report_type,
        report_content: reportContent,
        begin_time: beginSnap.snap_time,
        end_time: endSnap.snap_time,
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
      resource_type: 'statspack_report',
      resource_id: report.id,
      details: {
        begin_snap_id,
        end_snap_id,
        report_type,
        connection_id,
      },
    });

    return NextResponse.json({
      message: 'Report created successfully',
      data: report,
    });
  } catch (error) {
    console.error('Failed to create report:', error);
    return NextResponse.json(
      {
        error: 'Failed to create report',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// STATSPACK 리포트 생성 함수
async function generateStatspackReport(
  config: OracleConnectionConfig,
  beginSnap: any,
  endSnap: any,
  reportType: 'TEXT' | 'HTML'
): Promise<string> {
  const lines: string[] = [];
  const isHtml = reportType === 'HTML';

  // 헤더
  if (isHtml) {
    lines.push('<html>');
    lines.push('<head><title>STATSPACK Report</title>');
    lines.push('<style>');
    lines.push('body { font-family: monospace; margin: 20px; }');
    lines.push('table { border-collapse: collapse; width: 100%; margin: 10px 0; }');
    lines.push('th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }');
    lines.push('th { background-color: #f2f2f2; }');
    lines.push('h1, h2, h3 { color: #333; }');
    lines.push('.metric { font-weight: bold; color: #0066cc; }');
    lines.push('</style></head>');
    lines.push('<body>');
    lines.push('<h1>STATSPACK Performance Report</h1>');
  } else {
    lines.push('='.repeat(80));
    lines.push('STATSPACK Performance Report');
    lines.push('='.repeat(80));
    lines.push('');
  }

  // 데이터베이스 정보
  if (isHtml) {
    lines.push('<h2>Database Information</h2>');
    lines.push('<table>');
    lines.push(`<tr><th>Connection</th><td>${config.name}</td></tr>`);
    lines.push(`<tr><th>Host</th><td>${config.host}:${config.port}</td></tr>`);
    lines.push(`<tr><th>Username</th><td>${config.username}</td></tr>`);
    lines.push('</table>');
  } else {
    lines.push('Database Information:');
    lines.push(`  Connection: ${config.name}`);
    lines.push(`  Host: ${config.host}:${config.port}`);
    lines.push(`  Username: ${config.username}`);
    lines.push('');
  }

  // 스냅샷 정보
  if (isHtml) {
    lines.push('<h2>Snapshot Information</h2>');
    lines.push('<table>');
    lines.push(`<tr><th>Begin Snap ID</th><td>${beginSnap.snap_id}</td></tr>`);
    lines.push(`<tr><th>Begin Time</th><td>${beginSnap.snap_time}</td></tr>`);
    lines.push(`<tr><th>End Snap ID</th><td>${endSnap.snap_id}</td></tr>`);
    lines.push(`<tr><th>End Time</th><td>${endSnap.snap_time}</td></tr>`);
    lines.push(`<tr><th>Elapsed Time</th><td>${calculateElapsedMinutes(beginSnap.snap_time, endSnap.snap_time)} minutes</td></tr>`);
    lines.push('</table>');
  } else {
    lines.push('Snapshot Information:');
    lines.push(`  Begin Snap ID: ${beginSnap.snap_id}`);
    lines.push(`  Begin Time: ${beginSnap.snap_time}`);
    lines.push(`  End Snap ID: ${endSnap.snap_id}`);
    lines.push(`  End Time: ${endSnap.snap_time}`);
    lines.push(`  Elapsed Time: ${calculateElapsedMinutes(beginSnap.snap_time, endSnap.snap_time)} minutes`);
    lines.push('');
  }

  // 성능 델타 계산
  const deltaDbTime = endSnap.db_time_ms - beginSnap.db_time_ms;
  const deltaCpuTime = endSnap.cpu_time_ms - beginSnap.cpu_time_ms;
  const deltaPhysicalReads = endSnap.physical_reads - beginSnap.physical_reads;
  const deltaLogicalReads = endSnap.logical_reads - beginSnap.logical_reads;
  const deltaRedoSize = endSnap.redo_size_mb - beginSnap.redo_size_mb;
  const deltaSessions = endSnap.session_count - beginSnap.session_count;

  // 캐시 히트율 계산
  const cacheHitRatio =
    deltaLogicalReads > 0 ? ((deltaLogicalReads - deltaPhysicalReads) / deltaLogicalReads) * 100 : 0;

  // Load Profile
  if (isHtml) {
    lines.push('<h2>Load Profile</h2>');
    lines.push('<table>');
    lines.push('<tr><th>Metric</th><th>Total</th><th>Per Second</th></tr>');
    lines.push(`<tr><td>DB Time (ms)</td><td class="metric">${deltaDbTime.toLocaleString()}</td><td>${(deltaDbTime / 60).toFixed(2)}</td></tr>`);
    lines.push(`<tr><td>CPU Time (ms)</td><td class="metric">${deltaCpuTime.toLocaleString()}</td><td>${(deltaCpuTime / 60).toFixed(2)}</td></tr>`);
    lines.push(`<tr><td>Physical Reads</td><td class="metric">${deltaPhysicalReads.toLocaleString()}</td><td>${(deltaPhysicalReads / 60).toFixed(2)}</td></tr>`);
    lines.push(`<tr><td>Logical Reads</td><td class="metric">${deltaLogicalReads.toLocaleString()}</td><td>${(deltaLogicalReads / 60).toFixed(2)}</td></tr>`);
    lines.push(`<tr><td>Redo Size (MB)</td><td class="metric">${deltaRedoSize.toFixed(2)}</td><td>${(deltaRedoSize / 60).toFixed(4)}</td></tr>`);
    lines.push('</table>');
  } else {
    lines.push('Load Profile:');
    lines.push('-'.repeat(80));
    lines.push(`${'Metric'.padEnd(30)} ${'Total'.padStart(20)} ${'Per Second'.padStart(15)}`);
    lines.push('-'.repeat(80));
    lines.push(`${'DB Time (ms)'.padEnd(30)} ${deltaDbTime.toLocaleString().padStart(20)} ${(deltaDbTime / 60).toFixed(2).padStart(15)}`);
    lines.push(`${'CPU Time (ms)'.padEnd(30)} ${deltaCpuTime.toLocaleString().padStart(20)} ${(deltaCpuTime / 60).toFixed(2).padStart(15)}`);
    lines.push(`${'Physical Reads'.padEnd(30)} ${deltaPhysicalReads.toLocaleString().padStart(20)} ${(deltaPhysicalReads / 60).toFixed(2).padStart(15)}`);
    lines.push(`${'Logical Reads'.padEnd(30)} ${deltaLogicalReads.toLocaleString().padStart(20)} ${(deltaLogicalReads / 60).toFixed(2).padStart(15)}`);
    lines.push(`${'Redo Size (MB)'.padEnd(30)} ${deltaRedoSize.toFixed(2).padStart(20)} ${(deltaRedoSize / 60).toFixed(4).padStart(15)}`);
    lines.push('');
  }

  // Instance Efficiency
  if (isHtml) {
    lines.push('<h2>Instance Efficiency Percentages</h2>');
    lines.push('<table>');
    lines.push('<tr><th>Metric</th><th>Value</th></tr>');
    lines.push(`<tr><td>Buffer Cache Hit Ratio</td><td class="metric">${cacheHitRatio.toFixed(2)}%</td></tr>`);
    lines.push(`<tr><td>CPU / DB Time Ratio</td><td class="metric">${deltaCpuTime > 0 ? ((deltaCpuTime / deltaDbTime) * 100).toFixed(2) : '0.00'}%</td></tr>`);
    lines.push('</table>');
  } else {
    lines.push('Instance Efficiency Percentages:');
    lines.push('-'.repeat(80));
    lines.push(`  Buffer Cache Hit Ratio: ${cacheHitRatio.toFixed(2)}%`);
    lines.push(`  CPU / DB Time Ratio: ${deltaCpuTime > 0 ? ((deltaCpuTime / deltaDbTime) * 100).toFixed(2) : '0.00'}%`);
    lines.push('');
  }

  // Top Wait Events (Oracle에서 조회)
  try {
    const waitEventsQuery = `
      SELECT event, wait_class, total_waits, time_waited / 100 as time_waited_ms
      FROM v$system_event
      WHERE wait_class != 'Idle'
      ORDER BY time_waited DESC
      FETCH FIRST 10 ROWS ONLY
    `;

    const waitResult = await executeQuery<{
      EVENT: string;
      WAIT_CLASS: string;
      TOTAL_WAITS: number;
      TIME_WAITED_MS: number;
    }>(config, waitEventsQuery);

    if (waitResult.rows && waitResult.rows.length > 0) {
      if (isHtml) {
        lines.push('<h2>Top 10 Wait Events</h2>');
        lines.push('<table>');
        lines.push('<tr><th>Event</th><th>Wait Class</th><th>Total Waits</th><th>Time Waited (ms)</th></tr>');
        waitResult.rows.forEach((row) => {
          lines.push(
            `<tr><td>${row.EVENT}</td><td>${row.WAIT_CLASS}</td><td>${Math.floor(Number(row.TOTAL_WAITS)).toLocaleString()}</td><td>${Math.floor(Number(row.TIME_WAITED_MS)).toLocaleString()}</td></tr>`
          );
        });
        lines.push('</table>');
      } else {
        lines.push('Top 10 Wait Events:');
        lines.push('-'.repeat(80));
        lines.push(`${'Event'.padEnd(40)} ${'Wait Class'.padEnd(15)} ${'Waits'.padStart(12)} ${'Time(ms)'.padStart(15)}`);
        lines.push('-'.repeat(80));
        waitResult.rows.forEach((row) => {
          lines.push(
            `${row.EVENT.substring(0, 39).padEnd(40)} ${row.WAIT_CLASS.substring(0, 14).padEnd(15)} ${Math.floor(Number(row.TOTAL_WAITS)).toLocaleString().padStart(12)} ${Math.floor(Number(row.TIME_WAITED_MS)).toLocaleString().padStart(15)}`
          );
        });
        lines.push('');
      }
    }
  } catch (err) {
    console.error('Failed to fetch wait events:', err);
  }

  // Top SQL (Oracle에서 조회)
  try {
    const topSqlQuery = `
      SELECT sql_id, executions, elapsed_time / 1000 as elapsed_ms, cpu_time / 1000 as cpu_ms,
             buffer_gets, disk_reads
      FROM v$sql
      WHERE executions > 0
      ORDER BY elapsed_time DESC
      FETCH FIRST 10 ROWS ONLY
    `;

    const sqlResult = await executeQuery<{
      SQL_ID: string;
      EXECUTIONS: number;
      ELAPSED_MS: number;
      CPU_MS: number;
      BUFFER_GETS: number;
      DISK_READS: number;
    }>(config, topSqlQuery);

    if (sqlResult.rows && sqlResult.rows.length > 0) {
      if (isHtml) {
        lines.push('<h2>Top 10 SQL by Elapsed Time</h2>');
        lines.push('<table>');
        lines.push('<tr><th>SQL ID</th><th>Executions</th><th>Elapsed (ms)</th><th>CPU (ms)</th><th>Buffer Gets</th><th>Disk Reads</th></tr>');
        sqlResult.rows.forEach((row) => {
          lines.push(
            `<tr><td>${row.SQL_ID}</td><td>${Math.floor(Number(row.EXECUTIONS)).toLocaleString()}</td><td>${Math.floor(Number(row.ELAPSED_MS)).toLocaleString()}</td><td>${Math.floor(Number(row.CPU_MS)).toLocaleString()}</td><td>${Math.floor(Number(row.BUFFER_GETS)).toLocaleString()}</td><td>${Math.floor(Number(row.DISK_READS)).toLocaleString()}</td></tr>`
          );
        });
        lines.push('</table>');
      } else {
        lines.push('Top 10 SQL by Elapsed Time:');
        lines.push('-'.repeat(80));
        lines.push(`${'SQL ID'.padEnd(15)} ${'Execs'.padStart(10)} ${'Elapsed'.padStart(12)} ${'CPU'.padStart(12)} ${'Gets'.padStart(12)} ${'Reads'.padStart(12)}`);
        lines.push('-'.repeat(80));
        sqlResult.rows.forEach((row) => {
          lines.push(
            `${row.SQL_ID.padEnd(15)} ${Math.floor(Number(row.EXECUTIONS)).toLocaleString().padStart(10)} ${Math.floor(Number(row.ELAPSED_MS)).toLocaleString().padStart(12)} ${Math.floor(Number(row.CPU_MS)).toLocaleString().padStart(12)} ${Math.floor(Number(row.BUFFER_GETS)).toLocaleString().padStart(12)} ${Math.floor(Number(row.DISK_READS)).toLocaleString().padStart(12)}`
          );
        });
        lines.push('');
      }
    }
  } catch (err) {
    console.error('Failed to fetch top SQL:', err);
  }

  // 푸터
  if (isHtml) {
    lines.push('<hr>');
    lines.push(`<p><small>Report generated at ${new Date().toISOString()}</small></p>`);
    lines.push('</body>');
    lines.push('</html>');
  } else {
    lines.push('='.repeat(80));
    lines.push(`Report generated at ${new Date().toISOString()}`);
    lines.push('='.repeat(80));
  }

  return lines.join('\n');
}

function calculateElapsedMinutes(beginTime: string, endTime: string): number {
  const begin = new Date(beginTime).getTime();
  const end = new Date(endTime).getTime();
  return Math.round((end - begin) / 1000 / 60);
}
