import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * GET /api/monitoring/statspack/snapshots
 * STATSPACK 스냅샷 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connectionId);

    // STATSPACK 스냅샷 조회 (PERFSTAT 스키마 명시)
    // 기본 컬럼만 사용 (Oracle 버전 호환성)
    const query = `
      SELECT * FROM (
      SELECT
        snap_id,
        TO_CHAR(snap_time, 'YYYY-MM-DD HH24:MI:SS') as snap_time,
        TO_CHAR(startup_time, 'YYYY-MM-DD HH24:MI:SS') as startup_time,
        dbid,
        instance_number
      FROM
        perfstat.stats$snapshot
      ORDER BY
        snap_id DESC
      ) WHERE ROWNUM <= 100
    `;

    let result;
    try {
      result = await executeQuery(config, query);
    } catch (queryError: any) {
      // STATSPACK이 설치되지 않은 경우
      if (queryError.message?.includes('ORA-00942') || queryError.message?.includes('ORA-01031')) {
        console.warn('[Statspack API] STATSPACK not installed or insufficient privileges');
        return NextResponse.json({
          success: true,
          data: [],
          count: 0,
          message: 'STATSPACK이 설치되지 않았거나 권한이 없습니다.',
        });
      }
      throw queryError;
    }

    // 스냅샷 데이터 변환
    const snapshots = (result.rows || []).map((row: any) => ({
      id: `${connectionId}-${row.SNAP_ID}`,
      oracle_connection_id: connectionId,
      snap_id: row.SNAP_ID,
      snap_time: row.SNAP_TIME,
      startup_time: row.STARTUP_TIME,
      session_count: Number(row.SESSION_COUNT) || 0,
      dbid: row.DBID,
      instance_number: row.INSTANCE_NUMBER,
      cursor_count: 0,
      transaction_count: 0,
      db_time_ms: 0,
      cpu_time_ms: 0,
      physical_reads: 0,
      logical_reads: 0,
      redo_size_mb: 0,
      created_at: row.SNAP_TIME,
    }));

    console.log(`[Statspack API] Fetched ${snapshots.length} snapshots for connection ${connectionId}`);

    return NextResponse.json({
      success: true,
      data: snapshots,
      count: snapshots.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Statspack API] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json(
        {
          error: 'Failed to fetch statspack snapshots',
          details: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to fetch statspack snapshots' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/monitoring/statspack/snapshots
 * STATSPACK 스냅샷 생성
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
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connection_id);

    // STATSPACK 스냅샷 생성 - PERFSTAT 스키마의 STATSPACK 패키지 사용
    const query = `
      BEGIN
        perfstat.statspack.snap;
      END;
    `;

    try {
      console.log('[Statspack API] Trying perfstat.statspack.snap...');
      await executeQuery(config, query, [], { timeout: 60000 });
      console.log('[Statspack API] perfstat.statspack.snap succeeded');
    } catch (queryError: any) {
      const errorMsg = queryError.message || '';
      console.log('[Statspack API] First attempt failed:', errorMsg);

      // STATSPACK이 설치되지 않은 경우 또는 권한 없음
      if (errorMsg.includes('ORA-00942') ||
          errorMsg.includes('ORA-06550') ||
          errorMsg.includes('ORA-01031') ||
          errorMsg.includes('PLS-00201')) {

        // PERFSTAT 스키마 없이 시도
        try {
          console.log('[Statspack API] Trying statspack.snap without schema...');
          const fallbackQuery = `
            BEGIN
              statspack.snap;
            END;
          `;
          await executeQuery(config, fallbackQuery, [], { timeout: 60000 });
          console.log('[Statspack API] statspack.snap succeeded');
        } catch (fallbackError: any) {
          const fallbackMsg = fallbackError.message || '';
          console.log('[Statspack API] Second attempt failed:', fallbackMsg);

          // 전체 에러 메시지 포함
          let detailMessage = `STATSPACK 실행 실패. 오류: ${fallbackMsg}`;

          if (fallbackMsg.includes('ORA-01031') || fallbackMsg.includes('insufficient privileges')) {
            detailMessage = `STATSPACK 실행 권한이 없습니다. DBA에게 권한을 요청하세요.\n\nGRANT EXECUTE ON PERFSTAT.STATSPACK TO <user>;\n\n원본 오류: ${fallbackMsg}`;
          } else if (fallbackMsg.includes('PLS-00201') || fallbackMsg.includes('ORA-06550')) {
            detailMessage = `STATSPACK 패키지를 찾을 수 없습니다.\n\n$ORACLE_HOME/rdbms/admin/spcreate.sql 실행 필요\n\n원본 오류: ${fallbackMsg}`;
          }

          return NextResponse.json(
            {
              error: 'STATSPACK not available',
              details: detailMessage,
              originalError: fallbackMsg,
            },
            { status: 400 }
          );
        }
      } else {
        // 다른 오류는 그대로 전달
        console.log('[Statspack API] Unexpected error:', errorMsg);
        return NextResponse.json(
          {
            error: 'STATSPACK execution failed',
            details: errorMsg,
          },
          { status: 500 }
        );
      }
    }

    console.log(`[Statspack API] Created snapshot for connection ${connection_id}`);

    return NextResponse.json({
      success: true,
      message: 'Snapshot created successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Statspack API] Error creating snapshot:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json(
        {
          error: 'Failed to create statspack snapshot',
          details: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create statspack snapshot' },
      { status: 500 }
    );
  }
}
