import 'server-only';

/**
 * Database Schemas API
 * GET: 데이터베이스의 모든 유저 스키마 목록 조회
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

export async function GET(request: NextRequest) {
  try {
    // 현재 사용자 확인 (Next-Auth 세션 사용)
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    const connectionId = searchParams.get('connection_id');

    if (!connectionId || connectionId === 'all') {
      return NextResponse.json({
        data: [],
      });
    }

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connectionId);

    // 모든 유저 스키마 조회 (시스템 스키마 제외)
    const query = `
      SELECT username as schema_name
      FROM dba_users
      WHERE username NOT IN (
        'SYS', 'SYSTEM', 'XS$NULL', 'OUTLN', 'SYS$UMF',
        'APPQOSSYS', 'DBSFWUSER', 'GGSYS', 'ANONYMOUS',
        'GSMADMIN_INTERNAL', 'XDB', 'WMSYS', 'GSMCATUSER',
        'REMOTE_SCHEDULER_AGENT', 'SYSBACKUP', 'SYSRAC',
        'AUDSYS', 'DIP', 'SYSKM', 'SYSDG', 'GSMUSER'
      )
      AND account_status = 'OPEN'
      ORDER BY username
    `;

    const result = await executeQuery(config, query);

    const schemas = result.rows.map((row: any) => row.SCHEMA_NAME);

    return NextResponse.json({
      data: schemas,
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch schemas from Oracle' }, { status: 500 });
  }
}
