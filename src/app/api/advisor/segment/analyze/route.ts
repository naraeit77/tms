import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * POST /api/advisor/segment/analyze
 * Segment Advisor 분석 실행
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { connection_id } = body;

    if (!connection_id) {
      return NextResponse.json(
        { error: 'Connection ID is required' },
        { status: 400 }
      );
    }

    const config = await getOracleConfig(connection_id);

    // Segment Advisor 작업 생성 및 실행
    const taskName = `SEG_TASK_${Date.now()}`;

    const analyzeSQL = `
      DECLARE
        l_task_name VARCHAR2(30) := :task_name;
        l_task_id NUMBER;
        l_obj_id NUMBER;
      BEGIN
        -- 1. Segment Advisor 작업 생성
        DBMS_ADVISOR.CREATE_TASK(
          advisor_name => 'Segment Advisor',
          task_name    => l_task_name,
          task_desc    => 'Segment space analysis task created via TMS'
        );

        -- 2. 단편화 가능성이 있는 세그먼트들을 분석 대상으로 등록
        FOR seg_rec IN (
          SELECT s.OWNER, s.SEGMENT_NAME
          FROM DBA_SEGMENTS s
          WHERE s.SEGMENT_TYPE = 'TABLE'
            AND s.OWNER NOT IN ('SYS', 'SYSTEM', 'WMSYS', 'CTXSYS', 'MDSYS', 'OLAPSYS', 'XDB')
            AND s.BYTES > 10485760
            AND ROWNUM <= 50
        ) LOOP
          BEGIN
            DBMS_ADVISOR.CREATE_OBJECT(
              task_name   => l_task_name,
              object_type => 'TABLE',
              attr1       => seg_rec.OWNER,
              attr2       => seg_rec.SEGMENT_NAME,
              attr3       => NULL,
              attr4       => NULL,
              attr5       => NULL,
              object_id   => l_obj_id
            );
          EXCEPTION
            WHEN OTHERS THEN
              NULL; -- 이미 등록된 객체는 무시
          END;
        END LOOP;

        -- 3. 작업 실행
        DBMS_ADVISOR.EXECUTE_TASK(task_name => l_task_name);
      END;
    `;

    await executeQuery(config, analyzeSQL, { task_name: taskName });

    return NextResponse.json({
      success: true,
      data: {
        task_name: taskName,
        status: 'EXECUTED',
      },
      message: 'Segment Advisor analysis completed successfully',
    });
  } catch (error) {
    console.error('Error executing Segment Advisor analysis:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to execute segment analysis',
      },
      { status: 500 }
    );
  }
}
