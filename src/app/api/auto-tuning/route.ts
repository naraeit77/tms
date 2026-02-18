/**
 * Auto Tuning API
 * GET: 자동 튜닝 상태 조회
 * POST: 수동으로 자동 튜닝 실행
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { userSettings, sqlStatistics, auditLogs } from '@/db/schema';
import { eq, ne, desc, and } from 'drizzle-orm';
import { processAutoTuning, getAutoTuningStatus } from '@/lib/services/auto-tuning';

/**
 * GET /api/auto-tuning
 * 자동 튜닝 상태 조회
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const status = await getAutoTuningStatus(session.user.id);

    return NextResponse.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('Auto-tuning status error:', error);
    return NextResponse.json(
      { error: 'Failed to get auto-tuning status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auto-tuning
 * 수동으로 자동 튜닝 실행 (임계값 초과 SQL 스캔 및 등록)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json().catch(() => ({}));
    const { connection_id } = body;

    // 사용자 설정 확인
    const [settings] = await db
      .select({ autoTuningEnabled: userSettings.autoTuningEnabled })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (!settings?.autoTuningEnabled) {
      return NextResponse.json({
        success: false,
        message: '자동 튜닝이 비활성화되어 있습니다. 설정에서 활성화해주세요.',
      });
    }

    // SQL 통계 조회
    const whereConditions = connection_id
      ? and(ne(sqlStatistics.status, 'TUNING'), eq(sqlStatistics.oracleConnectionId, connection_id))
      : ne(sqlStatistics.status, 'TUNING');

    const filteredStats = await db
      .select({
        id: sqlStatistics.id,
        oracleConnectionId: sqlStatistics.oracleConnectionId,
        sqlId: sqlStatistics.sqlId,
        sqlText: sqlStatistics.sqlText,
        elapsedTimeMs: sqlStatistics.elapsedTimeMs,
        cpuTimeMs: sqlStatistics.cpuTimeMs,
        bufferGets: sqlStatistics.bufferGets,
        executions: sqlStatistics.executions,
        status: sqlStatistics.status,
      })
      .from(sqlStatistics)
      .where(whereConditions)
      .orderBy(desc(sqlStatistics.bufferGets))
      .limit(200);

    if (!filteredStats || filteredStats.length === 0) {
      return NextResponse.json({
        success: true,
        message: '분석할 SQL 통계가 없습니다.',
        result: { processed: 0, registered: 0, skipped: 0 },
      });
    }

    // Convert to the expected interface format (snake_case for service)
    const sqlStatsForService = filteredStats.map(s => ({
      id: s.id,
      oracle_connection_id: s.oracleConnectionId,
      sql_id: s.sqlId,
      sql_text: s.sqlText,
      elapsed_time_ms: Number(s.elapsedTimeMs) || 0,
      cpu_time_ms: Number(s.cpuTimeMs) || 0,
      buffer_gets: Number(s.bufferGets) || 0,
      executions: s.executions || 0,
      status: s.status,
    }));

    // 자동 튜닝 실행
    const result = await processAutoTuning(sqlStatsForService, userId);

    // 감사 로그
    await db.insert(auditLogs).values({
      userId: userId,
      action: 'AUTO_TUNING_MANUAL',
      resourceType: 'auto_tuning',
      details: {
        connection_id,
        result,
      },
    });

    return NextResponse.json({
      success: true,
      message: result.registered > 0
        ? `${result.registered}개의 SQL이 튜닝 대상으로 등록되었습니다.`
        : '새로 등록할 SQL이 없습니다.',
      result,
    });
  } catch (error) {
    console.error('Auto-tuning execution error:', error);
    return NextResponse.json(
      { error: 'Failed to execute auto-tuning' },
      { status: 500 }
    );
  }
}
