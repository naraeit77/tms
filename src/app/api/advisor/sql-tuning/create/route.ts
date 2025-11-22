import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * POST /api/advisor/sql-tuning/create
 * SQL Tuning Advisor 작업 생성 및 실행
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { connection_id, sql_text, sql_id, task_name } = body;

    if (!connection_id || !task_name) {
      return NextResponse.json(
        { error: 'Connection ID and task name are required' },
        { status: 400 }
      );
    }

    if (!sql_text && !sql_id) {
      return NextResponse.json(
        { error: 'Either SQL text or SQL ID is required' },
        { status: 400 }
      );
    }

    const config = await getOracleConfig(connection_id);

    // 작업 생성 (PL/SQL 실행)
    let createTaskSQL: string;
    let executeTaskSQL: string;

    if (sql_text) {
      // SQL 텍스트로 작업 생성 (단순화된 호출)
      createTaskSQL = `
        DECLARE
          l_task_name VARCHAR2(30);
          l_sql_text CLOB := :sql_text;
        BEGIN
          l_task_name := DBMS_SQLTUNE.CREATE_TUNING_TASK(
            sql_text    => l_sql_text,
            task_name   => :task_name
          );
        END;
      `;

      await executeQuery(config, createTaskSQL, {
        task_name,
        sql_text,
      });
    } else if (sql_id) {
      // SQL ID로 작업 생성 (단순화된 호출)
      createTaskSQL = `
        DECLARE
          l_task_name VARCHAR2(30);
          l_sql_id VARCHAR2(13) := :sql_id;
        BEGIN
          l_task_name := DBMS_SQLTUNE.CREATE_TUNING_TASK(
            sql_id      => l_sql_id,
            task_name   => :task_name
          );
        END;
      `;

      await executeQuery(config, createTaskSQL, {
        task_name,
        sql_id,
      });
    }

    // 작업 즉시 실행
    executeTaskSQL = `
      BEGIN
        DBMS_SQLTUNE.EXECUTE_TUNING_TASK(task_name => :task_name);
      END;
    `;

    await executeQuery(config, executeTaskSQL, { task_name });

    return NextResponse.json({
      success: true,
      data: {
        task_name,
        status: 'CREATED_AND_EXECUTED',
      },
      message: 'SQL Tuning task created and executed successfully',
    });
  } catch (error) {
    console.error('Error creating SQL Tuning Advisor task:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create tuning task',
      },
      { status: 500 }
    );
  }
}
