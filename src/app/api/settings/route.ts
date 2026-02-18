import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { systemSettings, userSettings } from '@/db/schema';
import { eq, and, sql } from 'drizzle-orm';

/**
 * GET /api/settings
 * 시스템 설정 조회
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 사용자 ID 가져오기 (session.user.id 사용)
    const userId = session.user.id;

    // user_settings를 system_settings 테이블에서 category='user_settings', key=userId로 조회
    const rows = await db
      .select()
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.category, 'user_settings'),
          eq(systemSettings.key, userId)
        )
      )
      .limit(1);

    const data = rows[0];

    // user_settings 테이블에서 auto_tuning 관련 실제 값 조회
    const [userSettingsRow] = await db
      .select({
        autoTuningEnabled: userSettings.autoTuningEnabled,
        performanceThresholdMs: userSettings.performanceThresholdMs,
        bufferGetsThreshold: userSettings.bufferGetsThreshold,
        cpuTimeThresholdMs: userSettings.cpuTimeThresholdMs,
      })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    // 설정이 없으면 기본값 반환
    if (!data) {
      const defaultSettings = {
        monitoring_interval_seconds: 60,
        sql_retention_days: 30,
        alert_enabled: true,
        alert_email: session.user.email,
        performance_threshold_ms: userSettingsRow?.performanceThresholdMs ?? 1000,
        buffer_gets_threshold: userSettingsRow?.bufferGetsThreshold ?? 10000,
        cpu_time_threshold_ms: userSettingsRow?.cpuTimeThresholdMs ?? 5000,
        auto_tuning_enabled: userSettingsRow?.autoTuningEnabled ?? false,
      };

      return NextResponse.json({
        success: true,
        data: defaultSettings,
      });
    }

    // system_settings의 값에 user_settings 실제 값을 병합하여 반환
    const mergedData = {
      ...(data.value as Record<string, unknown>),
      auto_tuning_enabled: userSettingsRow?.autoTuningEnabled ?? false,
      performance_threshold_ms: userSettingsRow?.performanceThresholdMs ?? 1000,
      buffer_gets_threshold: userSettingsRow?.bufferGetsThreshold ?? 10000,
      cpu_time_threshold_ms: userSettingsRow?.cpuTimeThresholdMs ?? 5000,
    };

    return NextResponse.json({
      success: true,
      data: mergedData,
    });
  } catch (error) {
    console.error('Settings API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/settings
 * 시스템 설정 업데이트
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // 사용자 ID 가져오기 (session.user.id 사용)
    const userId = session.user.id;

    // 기존 설정 확인
    const existing = await db
      .select()
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.category, 'user_settings'),
          eq(systemSettings.key, userId)
        )
      )
      .limit(1);

    let result;
    if (existing.length > 0) {
      // 기존 설정 업데이트 - value 필드에 전체 settings 객체를 병합
      const mergedValue = { ...(existing[0].value as Record<string, unknown>), ...body };
      const updated = await db
        .update(systemSettings)
        .set({
          value: mergedValue,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(systemSettings.category, 'user_settings'),
            eq(systemSettings.key, userId)
          )
        )
        .returning();

      if (updated.length === 0) {
        return NextResponse.json(
          { error: 'Failed to update settings' },
          { status: 500 }
        );
      }
      result = updated[0].value;
    } else {
      // 새 설정 생성
      const inserted = await db
        .insert(systemSettings)
        .values({
          category: 'user_settings',
          key: userId,
          value: body,
          description: `User settings for ${session.user.email}`,
        })
        .returning();

      if (inserted.length === 0) {
        return NextResponse.json(
          { error: 'Failed to create settings' },
          { status: 500 }
        );
      }
      result = inserted[0].value;
    }

    // user_settings 테이블도 동기화 (auto-tuning 서비스가 이 테이블을 참조)
    if (
      body.auto_tuning_enabled !== undefined ||
      body.performance_threshold_ms !== undefined ||
      body.buffer_gets_threshold !== undefined ||
      body.cpu_time_threshold_ms !== undefined
    ) {
      const userSettingsUpdate: Record<string, unknown> = { updatedAt: new Date() };
      if (body.auto_tuning_enabled !== undefined) {
        userSettingsUpdate.autoTuningEnabled = body.auto_tuning_enabled;
      }
      if (body.performance_threshold_ms !== undefined) {
        userSettingsUpdate.performanceThresholdMs = body.performance_threshold_ms;
      }
      if (body.buffer_gets_threshold !== undefined) {
        userSettingsUpdate.bufferGetsThreshold = body.buffer_gets_threshold;
      }
      if (body.cpu_time_threshold_ms !== undefined) {
        userSettingsUpdate.cpuTimeThresholdMs = body.cpu_time_threshold_ms;
      }

      const existingUserSettings = await db
        .select({ id: userSettings.id })
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1);

      if (existingUserSettings.length > 0) {
        await db
          .update(userSettings)
          .set(userSettingsUpdate)
          .where(eq(userSettings.userId, userId));
      } else {
        await db
          .insert(userSettings)
          .values({
            userId,
            autoTuningEnabled: body.auto_tuning_enabled ?? false,
            performanceThresholdMs: body.performance_threshold_ms ?? 1000,
            bufferGetsThreshold: body.buffer_gets_threshold ?? 10000,
            cpuTimeThresholdMs: body.cpu_time_threshold_ms ?? 5000,
          });
      }
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Settings API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
