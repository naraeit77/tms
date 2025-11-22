import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';
import oracledb from 'oracledb';

/**
 * GET /api/monitoring/sql-monitor/detail
 * SQL Monitor 상세 정보 조회
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');
    const sqlId = searchParams.get('sql_id');
    const sqlExecId = searchParams.get('sql_exec_id');

    if (!connectionId || !sqlId || !sqlExecId) {
      return NextResponse.json(
        { error: 'Connection ID, SQL ID, and SQL Exec ID are required' },
        { status: 400 }
      );
    }

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connectionId);

    // SQL Monitor 상세 정보 조회
    const monitorDetailQuery = `
      SELECT
        m.KEY,
        m.SQL_ID,
        m.SQL_EXEC_ID,
        m.SQL_EXEC_START,
        m.STATUS,
        m.USERNAME,
        m.MODULE,
        m.ACTION,
        m.SERVICE_NAME,
        m.ELAPSED_TIME / 1000 AS ELAPSED_TIME,
        m.CPU_TIME / 1000 AS CPU_TIME,
        m.QUEUING_TIME / 1000 AS QUEUING_TIME,
        m.APPLICATION_WAIT_TIME / 1000 AS APPLICATION_WAIT_TIME,
        m.CONCURRENCY_WAIT_TIME / 1000 AS CONCURRENCY_WAIT_TIME,
        m.USER_IO_WAIT_TIME / 1000 AS USER_IO_WAIT_TIME,
        m.BUFFER_GETS,
        m.DISK_READS,
        m.DIRECT_WRITES,
        m.PHYSICAL_READ_BYTES,
        m.PHYSICAL_WRITE_BYTES,
        m.IO_INTERCONNECT_BYTES,
        m.FETCHES,
        m.ERROR_MESSAGE,
        m.SQL_PLAN_HASH_VALUE,
        m.PX_SERVERS_REQUESTED,
        m.PX_SERVERS_ALLOCATED,
        m.BINDS_XML,
        m.OTHER_XML,
        s.SQL_TEXT,
        s.SQL_FULLTEXT
      FROM
        V$SQL_MONITOR m
        LEFT JOIN V$SQL s ON m.SQL_ID = s.SQL_ID
      WHERE
        m.SQL_ID = :sql_id
        AND m.SQL_EXEC_ID = :sql_exec_id
    `;

    const monitorResult = await executeQuery(config, monitorDetailQuery, {
      sql_id: sqlId,
      sql_exec_id: Number(sqlExecId),
    }, {
      fetchInfo: {
        SQL_TEXT: { type: oracledb.STRING },
        SQL_FULLTEXT: { type: oracledb.STRING }
      }
    });

    if (!monitorResult.rows || monitorResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'SQL Monitor entry not found' },
        { status: 404 }
      );
    }

    const monitorData = monitorResult.rows[0];
    const sqlFulltextString = monitorData.SQL_FULLTEXT || null;
    const sqlTextString = monitorData.SQL_TEXT || null;

    // 실행 계획 가져오기 (DBMS_SQLTUNE.REPORT_SQL_MONITOR 사용)
    let planReport = null;
    try {
      const reportQuery = `
        SELECT
          DBMS_SQLTUNE.REPORT_SQL_MONITOR(
            sql_id => :sql_id,
            sql_exec_id => :sql_exec_id,
            type => 'TEXT',
            report_level => 'ALL'
          ) AS REPORT
        FROM DUAL
      `;

      const reportResult = await executeQuery(config, reportQuery, {
        sql_id: sqlId,
        sql_exec_id: Number(sqlExecId),
      }, {
        fetchInfo: {
          REPORT: { type: oracledb.STRING }
        }
      });

      if (reportResult.rows && reportResult.rows.length > 0) {
        planReport = reportResult.rows[0].REPORT || null;
      }
    } catch (error) {
      console.error('Failed to generate SQL Monitor report:', error);
      // 리포트 생성 실패는 무시하고 계속 진행
    }

    // 활동 통계 가져오기
    const activityQuery = `
      SELECT
        p.PLAN_LINE_ID,
        p.PLAN_OPERATION,
        p.PLAN_OPTIONS,
        p.PLAN_OBJECT_NAME,
        p.PLAN_CARDINALITY,
        p.PLAN_BYTES,
        p.PLAN_COST,
        p.PLAN_CPU_COST,
        p.PLAN_IO_COST,
        p.PLAN_TEMP_SPACE,
        p.STARTS,
        p.OUTPUT_ROWS,
        p.FIRST_CHANGE_TIME,
        p.LAST_CHANGE_TIME,
        p.FIRST_REFRESH_TIME,
        p.LAST_REFRESH_TIME
      FROM
        V$SQL_PLAN_MONITOR p
      WHERE
        p.SQL_ID = :sql_id
        AND p.SQL_EXEC_ID = :sql_exec_id
      ORDER BY
        p.PLAN_LINE_ID
    `;

    let activityData = [];
    try {
      const activityResult = await executeQuery(config, activityQuery, {
        sql_id: sqlId,
        sql_exec_id: Number(sqlExecId),
      });
      activityData = activityResult.rows || [];
    } catch (error) {
      console.error('Failed to fetch SQL Monitor activity data:', error);
      // 활동 데이터 조회 실패는 무시
    }

    // 응답 데이터 구성
    const responseData = {
      monitor: {
        key: monitorData.KEY,
        sql_id: monitorData.SQL_ID,
        sql_exec_id: monitorData.SQL_EXEC_ID,
        sql_exec_start: monitorData.SQL_EXEC_START,
        status: monitorData.STATUS,
        username: monitorData.USERNAME,
        module: monitorData.MODULE,
        action: monitorData.ACTION,
        service_name: monitorData.SERVICE_NAME,
        elapsed_time: monitorData.ELAPSED_TIME ? Number(monitorData.ELAPSED_TIME) : null,
        cpu_time: monitorData.CPU_TIME ? Number(monitorData.CPU_TIME) : null,
        queuing_time: monitorData.QUEUING_TIME ? Number(monitorData.QUEUING_TIME) : null,
        application_wait_time: monitorData.APPLICATION_WAIT_TIME ? Number(monitorData.APPLICATION_WAIT_TIME) : null,
        concurrency_wait_time: monitorData.CONCURRENCY_WAIT_TIME ? Number(monitorData.CONCURRENCY_WAIT_TIME) : null,
        user_io_wait_time: monitorData.USER_IO_WAIT_TIME ? Number(monitorData.USER_IO_WAIT_TIME) : null,
        buffer_gets: monitorData.BUFFER_GETS ? Number(monitorData.BUFFER_GETS) : null,
        disk_reads: monitorData.DISK_READS ? Number(monitorData.DISK_READS) : null,
        direct_writes: monitorData.DIRECT_WRITES ? Number(monitorData.DIRECT_WRITES) : null,
        physical_read_bytes: monitorData.PHYSICAL_READ_BYTES ? Number(monitorData.PHYSICAL_READ_BYTES) : null,
        physical_write_bytes: monitorData.PHYSICAL_WRITE_BYTES ? Number(monitorData.PHYSICAL_WRITE_BYTES) : null,
        io_interconnect_bytes: monitorData.IO_INTERCONNECT_BYTES ? Number(monitorData.IO_INTERCONNECT_BYTES) : null,
        fetches: monitorData.FETCHES ? Number(monitorData.FETCHES) : null,
        error_message: monitorData.ERROR_MESSAGE,
        sql_plan_hash_value: monitorData.SQL_PLAN_HASH_VALUE,
        px_servers_requested: monitorData.PX_SERVERS_REQUESTED ? Number(monitorData.PX_SERVERS_REQUESTED) : null,
        px_servers_allocated: monitorData.PX_SERVERS_ALLOCATED ? Number(monitorData.PX_SERVERS_ALLOCATED) : null,
        sql_text: sqlFulltextString || sqlTextString,
      },
      plan: planReport,
      activity: activityData.map((row: any) => ({
        plan_line_id: row.PLAN_LINE_ID,
        operation: row.PLAN_OPERATION,
        options: row.PLAN_OPTIONS,
        object_name: row.PLAN_OBJECT_NAME,
        cardinality: row.PLAN_CARDINALITY ? Number(row.PLAN_CARDINALITY) : null,
        bytes: row.PLAN_BYTES ? Number(row.PLAN_BYTES) : null,
        cost: row.PLAN_COST ? Number(row.PLAN_COST) : null,
        cpu_cost: row.PLAN_CPU_COST ? Number(row.PLAN_CPU_COST) : null,
        io_cost: row.PLAN_IO_COST ? Number(row.PLAN_IO_COST) : null,
        temp_space: row.PLAN_TEMP_SPACE ? Number(row.PLAN_TEMP_SPACE) : null,
        starts: row.STARTS ? Number(row.STARTS) : null,
        output_rows: row.OUTPUT_ROWS ? Number(row.OUTPUT_ROWS) : null,
        first_change_time: row.FIRST_CHANGE_TIME,
        last_change_time: row.LAST_CHANGE_TIME,
      })),
    };

    return NextResponse.json({
      success: true,
      data: responseData,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('SQL Monitor detail API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch SQL Monitor detail' },
      { status: 500 }
    );
  }
}