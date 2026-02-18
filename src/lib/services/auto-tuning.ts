/**
 * Auto Tuning Service
 * 자동 튜닝 서비스 - 임계값 초과 SQL 자동 등록
 */

import { db } from '@/db';
import { userSettings, sqlTuningTasks, tuningHistory, sqlStatistics } from '@/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';

interface SQLStatistic {
  id: string;
  oracle_connection_id: string;
  sql_id: string;
  sql_text: string;
  elapsed_time_ms: number;
  cpu_time_ms: number;
  buffer_gets: number;
  executions: number;
  status?: string;
}

interface UserSettingsData {
  auto_tuning_enabled: boolean;
  performance_threshold_ms: number;
  buffer_gets_threshold: number;
  cpu_time_threshold_ms: number;
}

interface AutoTuningResult {
  processed: number;
  registered: number;
  skipped: number;
  errors: string[];
}

/**
 * 사용자 설정 조회
 */
async function getUserSettings(userId: string): Promise<UserSettingsData | null> {
  const [data] = await db
    .select({
      autoTuningEnabled: userSettings.autoTuningEnabled,
      performanceThresholdMs: userSettings.performanceThresholdMs,
      bufferGetsThreshold: userSettings.bufferGetsThreshold,
      cpuTimeThresholdMs: userSettings.cpuTimeThresholdMs,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  if (!data) {
    // 기본 설정 반환
    return {
      auto_tuning_enabled: false,
      performance_threshold_ms: 1000,
      buffer_gets_threshold: 10000,
      cpu_time_threshold_ms: 5000,
    };
  }

  return {
    auto_tuning_enabled: data.autoTuningEnabled ?? false,
    performance_threshold_ms: data.performanceThresholdMs ?? 1000,
    buffer_gets_threshold: data.bufferGetsThreshold ?? 10000,
    cpu_time_threshold_ms: data.cpuTimeThresholdMs ?? 5000,
  };
}

/**
 * SQL이 임계값을 초과하는지 확인
 */
function exceedsThreshold(sql: SQLStatistic, settings: UserSettingsData): { exceeds: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (sql.elapsed_time_ms > settings.performance_threshold_ms) {
    reasons.push(`실행시간 ${sql.elapsed_time_ms}ms > ${settings.performance_threshold_ms}ms`);
  }

  if (sql.buffer_gets > settings.buffer_gets_threshold) {
    reasons.push(`Buffer Gets ${sql.buffer_gets.toLocaleString()} > ${settings.buffer_gets_threshold.toLocaleString()}`);
  }

  if (sql.cpu_time_ms > settings.cpu_time_threshold_ms) {
    reasons.push(`CPU시간 ${sql.cpu_time_ms}ms > ${settings.cpu_time_threshold_ms}ms`);
  }

  return {
    exceeds: reasons.length > 0,
    reasons,
  };
}

/**
 * 이미 등록된 튜닝 작업인지 확인
 */
async function isAlreadyRegistered(connectionId: string, sqlId: string): Promise<boolean> {
  const data = await db
    .select({ id: sqlTuningTasks.id })
    .from(sqlTuningTasks)
    .where(
      and(
        eq(sqlTuningTasks.oracleConnectionId, connectionId),
        eq(sqlTuningTasks.sqlId, sqlId),
        inArray(sqlTuningTasks.status, ['IDENTIFIED', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW'])
      )
    )
    .limit(1);

  return data.length > 0;
}

/**
 * 튜닝 작업 자동 등록
 */
async function registerTuningTask(
  sql: SQLStatistic,
  reasons: string[],
  userId?: string
): Promise<{ success: boolean; taskId?: string; error?: string }> {
  // 우선순위 결정
  let priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM';
  if (reasons.length >= 3) {
    priority = 'CRITICAL';
  } else if (reasons.length === 2) {
    priority = 'HIGH';
  }

  try {
    const [data] = await db
      .insert(sqlTuningTasks)
      .values({
        oracleConnectionId: sql.oracle_connection_id,
        sqlId: sql.sql_id,
        sqlText: sql.sql_text,
        title: `[자동등록] ${sql.sql_id}`,
        description: `자동 튜닝에 의해 등록됨\n\n감지된 문제:\n${reasons.map(r => `- ${r}`).join('\n')}`,
        priority,
        status: 'IDENTIFIED',
        beforeElapsedTimeMs: sql.elapsed_time_ms,
        beforeBufferGets: sql.buffer_gets,
        beforeCpuTimeMs: sql.cpu_time_ms,
        beforeExecutions: sql.executions,
        identifiedAt: new Date(),
        createdBy: userId || null,
        metadata: {
          auto_registered: true,
          detection_reasons: reasons,
          registered_at: new Date().toISOString(),
        },
      })
      .returning({ id: sqlTuningTasks.id });

    if (!data) {
      return { success: false, error: 'Failed to insert tuning task' };
    }

    // 튜닝 이력 기록
    await db.insert(tuningHistory).values({
      tuningTaskId: data.id,
      oracleConnectionId: sql.oracle_connection_id,
      sqlId: sql.sql_id,
      activityType: 'AUTO_REGISTERED',
      description: `자동 튜닝에 의해 등록됨: ${reasons.join(', ')}`,
      performedBy: userId || null,
      metadata: { reasons },
    });

    return { success: true, taskId: data.id };
  } catch (error: any) {
    console.error('Failed to register tuning task:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 자동 튜닝 실행 - SQL 통계 목록을 분석하고 임계값 초과 시 자동 등록
 */
export async function processAutoTuning(
  sqlStatisticsData: SQLStatistic[],
  userId?: string
): Promise<AutoTuningResult> {
  const result: AutoTuningResult = {
    processed: 0,
    registered: 0,
    skipped: 0,
    errors: [],
  };

  // 사용자 설정 조회
  const settings = userId ? await getUserSettings(userId) : null;

  if (!settings?.auto_tuning_enabled) {
    return result;
  }

  for (const sql of sqlStatisticsData) {
    result.processed++;

    // 이미 TUNING 상태인 SQL은 스킵
    if (sql.status === 'TUNING') {
      result.skipped++;
      continue;
    }

    // 임계값 체크
    const { exceeds, reasons } = exceedsThreshold(sql, settings);

    if (!exceeds) {
      result.skipped++;
      continue;
    }

    // 이미 등록된 작업인지 확인
    const alreadyRegistered = await isAlreadyRegistered(sql.oracle_connection_id, sql.sql_id);

    if (alreadyRegistered) {
      result.skipped++;
      continue;
    }

    // 튜닝 작업 등록
    const registerResult = await registerTuningTask(sql, reasons, userId);

    if (registerResult.success) {
      result.registered++;

      // SQL 통계의 상태를 TUNING으로 업데이트
      await db
        .update(sqlStatistics)
        .set({ status: 'TUNING' })
        .where(eq(sqlStatistics.id, sql.id));
    } else {
      result.errors.push(`${sql.sql_id}: ${registerResult.error}`);
    }
  }

  return result;
}

/**
 * 단일 SQL에 대한 자동 튜닝 체크 및 등록
 */
export async function checkAndRegisterSQL(
  sql: SQLStatistic,
  userId?: string
): Promise<{ registered: boolean; taskId?: string; reason?: string }> {
  // 사용자 설정 조회
  const settings = userId ? await getUserSettings(userId) : null;

  if (!settings?.auto_tuning_enabled) {
    return { registered: false, reason: '자동 튜닝이 비활성화됨' };
  }

  // 임계값 체크
  const { exceeds, reasons } = exceedsThreshold(sql, settings);

  if (!exceeds) {
    return { registered: false, reason: '임계값 미달' };
  }

  // 이미 등록된 작업인지 확인
  const alreadyRegistered = await isAlreadyRegistered(sql.oracle_connection_id, sql.sql_id);

  if (alreadyRegistered) {
    return { registered: false, reason: '이미 등록됨' };
  }

  // 튜닝 작업 등록
  const result = await registerTuningTask(sql, reasons, userId);

  if (result.success) {
    return { registered: true, taskId: result.taskId };
  }

  return { registered: false, reason: result.error };
}

/**
 * 자동 튜닝 상태 조회
 */
export async function getAutoTuningStatus(userId: string): Promise<{
  enabled: boolean;
  thresholds: {
    performance_threshold_ms: number;
    buffer_gets_threshold: number;
    cpu_time_threshold_ms: number;
  };
  stats: {
    totalAutoRegistered: number;
    pendingTasks: number;
    completedTasks: number;
  };
}> {
  const settings = await getUserSettings(userId);

  // 자동 등록된 튜닝 작업 통계
  // Use PostgreSQL jsonb @> operator for contains check
  const autoRegisteredTasks = await db
    .select({ id: sqlTuningTasks.id, status: sqlTuningTasks.status, metadata: sqlTuningTasks.metadata })
    .from(sqlTuningTasks)
    .where(
      sql`${sqlTuningTasks.metadata} @> '{"auto_registered": true}'::jsonb`
    );

  const pendingTasks = autoRegisteredTasks.filter(t =>
    ['IDENTIFIED', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW'].includes(t.status || '')
  ).length;
  const completedTasks = autoRegisteredTasks.filter(t => t.status === 'COMPLETED').length;

  return {
    enabled: settings?.auto_tuning_enabled ?? false,
    thresholds: {
      performance_threshold_ms: settings?.performance_threshold_ms ?? 1000,
      buffer_gets_threshold: settings?.buffer_gets_threshold ?? 10000,
      cpu_time_threshold_ms: settings?.cpu_time_threshold_ms ?? 5000,
    },
    stats: {
      totalAutoRegistered: autoRegisteredTasks.length,
      pendingTasks,
      completedTasks,
    },
  };
}
