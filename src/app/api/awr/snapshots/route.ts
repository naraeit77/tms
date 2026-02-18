import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';
import { createEnterpriseFeatureResponse } from '@/lib/oracle/edition-guard';
import { getConnectionEdition } from '@/lib/oracle/edition-guard-server';

/**
 * GET /api/awr/snapshots
 * AWR 스냅샷 목록 조회
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection');

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    // Enterprise Edition 체크 (AWR은 Diagnostics Pack 필요)
    const edition = await getConnectionEdition(connectionId);
    const enterpriseCheck = createEnterpriseFeatureResponse('AWR', edition);
    if (enterpriseCheck) {
      return NextResponse.json(enterpriseCheck, { status: 403 });
    }

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connectionId);

    // AWR 스냅샷 정보 조회 (최근 100개)
    // end_interval_time: 스냅샷이 실제로 생성된 시간
    // begin_interval_time: 이전 스냅샷의 종료 시간 (수집 구간의 시작)
    const query = `
      SELECT * FROM (
      SELECT
        snap_id,
        end_interval_time as snap_time,
        startup_time,
        instance_number
      FROM
        dba_hist_snapshot
      ORDER BY
        snap_id DESC
      ) WHERE ROWNUM <= 100
    `;

    const result = await executeQuery(config, query);

    const snapshots = result.rows.map((row: any) => ({
      snap_id: row.SNAP_ID,
      snap_time: row.SNAP_TIME,
      startup_time: row.STARTUP_TIME,
      instance_number: row.INSTANCE_NUMBER,
    }));

    return NextResponse.json({
      success: true,
      data: snapshots,
      count: snapshots.length,
    });
  } catch (error) {
    console.error('AWR snapshots API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch snapshots' },
      { status: 500 }
    );
  }
}
