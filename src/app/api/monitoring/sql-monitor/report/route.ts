import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';
import oracledb from 'oracledb';

/**
 * POST /api/monitoring/sql-monitor/report
 * SQL Monitor 리포트 생성
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { connection_id, sql_id, sql_exec_id } = body;

    console.log('[SQL Monitor Report] Request received:', { connection_id, sql_id, sql_exec_id });

    if (!connection_id || !sql_id || !sql_exec_id) {
      return NextResponse.json(
        { error: 'Connection ID, SQL ID, and SQL Exec ID are required' },
        { status: 400 }
      );
    }

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connection_id);
    console.log('[SQL Monitor Report] Config loaded successfully');

    // HTML 형식의 SQL Monitor 리포트 생성 (DBMS_SQLTUNE 사용)
    const htmlReportQuery = `
      SELECT
        DBMS_SQLTUNE.REPORT_SQL_MONITOR(
          sql_id => :sql_id,
          sql_exec_id => :sql_exec_id,
          type => 'HTML',
          report_level => 'ALL'
        ) AS HTML_REPORT
      FROM DUAL
    `;

    const htmlResult = await executeQuery(config, htmlReportQuery, {
      sql_id: sql_id,
      sql_exec_id: Number(sql_exec_id),
    }, {
      fetchInfo: {
        HTML_REPORT: { type: oracledb.STRING }
      }
    });

    const htmlReportString = htmlResult.rows?.[0]?.HTML_REPORT || null;
    console.log('[SQL Monitor Report] HTML Result converted:', htmlReportString ? 'success' : 'null');

    // TEXT 형식의 SQL Monitor 리포트 생성
    const textReportQuery = `
      SELECT
        DBMS_SQLTUNE.REPORT_SQL_MONITOR(
          sql_id => :sql_id,
          sql_exec_id => :sql_exec_id,
          type => 'TEXT',
          report_level => 'ALL'
        ) AS TEXT_REPORT
      FROM DUAL
    `;

    const textResult = await executeQuery(config, textReportQuery, {
      sql_id: sql_id,
      sql_exec_id: Number(sql_exec_id),
    }, {
      fetchInfo: {
        TEXT_REPORT: { type: oracledb.STRING }
      }
    });

    const textReportString = textResult.rows?.[0]?.TEXT_REPORT || null;
    console.log('[SQL Monitor Report] TEXT Result converted:', textReportString ? 'success' : 'null');

    // XML 형식의 SQL Monitor 리포트 생성 (추가 분석용)
    const xmlReportQuery = `
      SELECT
        DBMS_SQLTUNE.REPORT_SQL_MONITOR(
          sql_id => :sql_id,
          sql_exec_id => :sql_exec_id,
          type => 'XML',
          report_level => 'ALL'
        ) AS XML_REPORT
      FROM DUAL
    `;

    const xmlResult = await executeQuery(config, xmlReportQuery, {
      sql_id: sql_id,
      sql_exec_id: Number(sql_exec_id),
    }, {
      fetchInfo: {
        XML_REPORT: { type: oracledb.STRING }
      }
    });

    const xmlReportString = xmlResult.rows?.[0]?.XML_REPORT || null;
    console.log('[SQL Monitor Report] XML Result converted:', xmlReportString ? 'success' : 'null');

    // 추가 통계 정보 가져오기
    const statsQuery = `
      SELECT
        m.STATUS,
        m.USERNAME,
        m.MODULE,
        m.SQL_EXEC_START,
        m.ELAPSED_TIME / 1000000 AS ELAPSED_TIME_SEC,
        m.CPU_TIME / 1000000 AS CPU_TIME_SEC,
        m.BUFFER_GETS,
        m.DISK_READS,
        m.PHYSICAL_READ_BYTES,
        m.PHYSICAL_WRITE_BYTES,
        m.PX_SERVERS_ALLOCATED,
        s.SQL_TEXT
      FROM
        V$SQL_MONITOR m
        LEFT JOIN V$SQL s ON m.SQL_ID = s.SQL_ID
      WHERE
        m.SQL_ID = :sql_id
        AND m.SQL_EXEC_ID = :sql_exec_id
    `;

    const statsResult = await executeQuery(config, statsQuery, {
      sql_id: sql_id,
      sql_exec_id: Number(sql_exec_id),
    }, {
      fetchInfo: {
        SQL_TEXT: { type: oracledb.STRING }
      }
    });

    const stats = statsResult.rows?.[0] || {};
    const sqlTextString = stats.SQL_TEXT || null;

    // 리포트 데이터 구성
    const reportData = {
      sql_id,
      sql_exec_id,
      generated_at: new Date().toISOString(),
      reports: {
        html: htmlReportString,
        text: textReportString,
        xml: xmlReportString,
      },
      statistics: {
        status: stats.STATUS,
        username: stats.USERNAME,
        module: stats.MODULE,
        sql_exec_start: stats.SQL_EXEC_START,
        elapsed_time_sec: stats.ELAPSED_TIME_SEC ? Number(stats.ELAPSED_TIME_SEC) : null,
        cpu_time_sec: stats.CPU_TIME_SEC ? Number(stats.CPU_TIME_SEC) : null,
        buffer_gets: stats.BUFFER_GETS ? Number(stats.BUFFER_GETS) : null,
        disk_reads: stats.DISK_READS ? Number(stats.DISK_READS) : null,
        physical_read_bytes: stats.PHYSICAL_READ_BYTES ? Number(stats.PHYSICAL_READ_BYTES) : null,
        physical_write_bytes: stats.PHYSICAL_WRITE_BYTES ? Number(stats.PHYSICAL_WRITE_BYTES) : null,
        parallel_servers: stats.PX_SERVERS_ALLOCATED ? Number(stats.PX_SERVERS_ALLOCATED) : null,
        sql_text: sqlTextString,
      },
      message: 'SQL Monitor report generated successfully',
    };

    console.log(`[SQL Monitor Report API] Generated report for SQL_ID: ${sql_id}, EXEC_ID: ${sql_exec_id}`);

    return NextResponse.json({
      success: true,
      data: reportData,
    });

  } catch (error) {
    console.error('SQL Monitor report API error:', error);

    if (error instanceof Error) {
      if (error.message.includes('ORA-06550') || error.message.includes('DBMS_SQLTUNE')) {
        return NextResponse.json(
          {
            error: 'DBMS_SQLTUNE package not available. Enterprise Edition with Diagnostic and Tuning Pack required.',
          },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to generate SQL Monitor report' },
      { status: 500 }
    );
  }
}