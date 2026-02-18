import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';
import oracledb from 'oracledb';

// Helper function to convert CLOB to string
async function clobToString(clob: any): Promise<string | null> {
  if (!clob) return null;

  // If it's already a string, return it
  if (typeof clob === 'string') return clob;

  // If it's a Lob object, read it
  if (clob && typeof clob.getData === 'function') {
    try {
      const data = await clob.getData();
      return data;
    } catch (e) {
      console.error('Error reading CLOB data:', e);
      return null;
    }
  }

  // Try to convert to string
  return String(clob);
}

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

    // 긴 쿼리를 위한 타임아웃 설정 (60초 - DBMS_SQLTUNE 리포트 생성에 시간이 걸릴 수 있음)
    const reportTimeout = 60000;

    // Bind parameters as array
    const bindParams = [sql_id, Number(sql_exec_id)];

    // HTML 형식의 SQL Monitor 리포트 생성 (DBMS_SQLTUNE 사용)
    const htmlReportQuery = `
      SELECT
        DBMS_SQLTUNE.REPORT_SQL_MONITOR(
          sql_id => :1,
          sql_exec_id => :2,
          type => 'HTML',
          report_level => 'ALL'
        ) AS HTML_REPORT
      FROM DUAL
    `;

    let htmlReportString: string | null = null;
    try {
      const htmlResult = await executeQuery(config, htmlReportQuery, bindParams, {
        timeout: reportTimeout,
        fetchInfo: {
          HTML_REPORT: { type: oracledb.STRING }
        }
      });

      const rawHtml = htmlResult.rows?.[0]?.HTML_REPORT;
      htmlReportString = await clobToString(rawHtml);
      console.log('[SQL Monitor Report] HTML Result converted:', htmlReportString ? 'success' : 'null');
    } catch (htmlError) {
      console.error('[SQL Monitor Report] HTML generation failed:', htmlError);
    }

    // TEXT 형식의 SQL Monitor 리포트 생성
    const textReportQuery = `
      SELECT
        DBMS_SQLTUNE.REPORT_SQL_MONITOR(
          sql_id => :1,
          sql_exec_id => :2,
          type => 'TEXT',
          report_level => 'ALL'
        ) AS TEXT_REPORT
      FROM DUAL
    `;

    let textReportString: string | null = null;
    try {
      const textResult = await executeQuery(config, textReportQuery, bindParams, {
        timeout: reportTimeout,
        fetchInfo: {
          TEXT_REPORT: { type: oracledb.STRING }
        }
      });

      const rawText = textResult.rows?.[0]?.TEXT_REPORT;
      textReportString = await clobToString(rawText);
      console.log('[SQL Monitor Report] TEXT Result converted:', textReportString ? 'success' : 'null');
    } catch (textError) {
      console.error('[SQL Monitor Report] TEXT generation failed:', textError);
    }

    // XML 형식의 SQL Monitor 리포트 생성 (추가 분석용)
    const xmlReportQuery = `
      SELECT
        DBMS_SQLTUNE.REPORT_SQL_MONITOR(
          sql_id => :1,
          sql_exec_id => :2,
          type => 'XML',
          report_level => 'ALL'
        ) AS XML_REPORT
      FROM DUAL
    `;

    let xmlReportString: string | null = null;
    try {
      const xmlResult = await executeQuery(config, xmlReportQuery, bindParams, {
        timeout: reportTimeout,
        fetchInfo: {
          XML_REPORT: { type: oracledb.STRING }
        }
      });

      const rawXml = xmlResult.rows?.[0]?.XML_REPORT;
      xmlReportString = await clobToString(rawXml);
      console.log('[SQL Monitor Report] XML Result converted:', xmlReportString ? 'success' : 'null');
    } catch (xmlError) {
      console.error('[SQL Monitor Report] XML generation failed:', xmlError);
    }

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
        m.SQL_ID = :1
        AND m.SQL_EXEC_ID = :2
    `;

    const statsResult = await executeQuery(config, statsQuery, bindParams, {
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