import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * POST /api/monitoring/sessions/kill
 * Oracle 세션 강제 종료 (KILL)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { connection_id, sid, serial } = body;

    if (!connection_id || !sid || !serial) {
      return NextResponse.json(
        { error: 'Connection ID, SID, and Serial number are required' },
        { status: 400 }
      );
    }

    console.log(`[Session Kill API] Attempting to kill session SID: ${sid}, Serial: ${serial}`);

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connection_id);

    // Oracle ALTER SYSTEM KILL SESSION 명령 실행
    // IMMEDIATE 옵션으로 즉시 세션 종료
    const killQuery = `
      ALTER SYSTEM KILL SESSION '${sid},${serial}' IMMEDIATE
    `;

    try {
      await executeQuery(config, killQuery);

      console.log(`[Session Kill API] Successfully killed session SID: ${sid}, Serial: ${serial}`);

      return NextResponse.json({
        success: true,
        message: `세션 ${sid}:${serial}이(가) 성공적으로 종료되었습니다.`,
        data: {
          sid,
          serial,
          killed_at: new Date().toISOString(),
        },
      });
    } catch (killError: any) {
      console.error('[Session Kill API] Error killing session:', killError);

      // Oracle 에러 메시지 파싱
      const errorMsg = killError.message || '';

      if (errorMsg.includes('ORA-00031')) {
        return NextResponse.json(
          { error: '세션을 종료할 수 있는 권한이 없습니다. ALTER SYSTEM 권한이 필요합니다.' },
          { status: 403 }
        );
      } else if (errorMsg.includes('ORA-00030')) {
        return NextResponse.json(
          { error: '사용자 세션 ID가 존재하지 않습니다.' },
          { status: 404 }
        );
      } else if (errorMsg.includes('ORA-00027')) {
        return NextResponse.json(
          { error: '세션 종료 중 오류가 발생했습니다. 세션이 이미 종료되었거나 접근할 수 없습니다.' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: `세션 종료 실패: ${errorMsg}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Session kill API error:', error);
    return NextResponse.json(
      { error: 'Failed to kill session' },
      { status: 500 }
    );
  }
}
