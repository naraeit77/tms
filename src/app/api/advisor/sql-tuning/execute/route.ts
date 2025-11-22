import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * POST /api/advisor/sql-tuning/execute
 * SQL Tuning Advisor 작업 실행
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { connection_id, task_name } = body;

    if (!connection_id || !task_name) {
      return NextResponse.json(
        { error: 'Connection ID and task name are required' },
        { status: 400 }
      );
    }

    const config = await getOracleConfig(connection_id);

    // 작업 실행
    const executeSQL = `
      BEGIN
        DBMS_SQLTUNE.EXECUTE_TUNING_TASK(task_name => :task_name);
      END;
    `;

    await executeQuery(config, executeSQL, { task_name });

    return NextResponse.json({
      success: true,
      data: {
        task_name,
        status: 'EXECUTED',
      },
      message: 'SQL Tuning task executed successfully',
    });
  } catch (error) {
    console.error('Error executing SQL Tuning Advisor task:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to execute tuning task',
      },
      { status: 500 }
    );
  }
}
