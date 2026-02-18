import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * GET /api/advisor/undo
 * Undo Advisor 분석 결과 조회
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');
    const retentionHours = parseInt(searchParams.get('retention_hours') || '24', 10);

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    const config = await getOracleConfig(connectionId);

    // Undo 테이블스페이스 현재 상태 조회
    // DBA_DATA_FILES 뷰 사용 시도, 실패시 V$ 뷰 기반 대안 사용
    let undoStats;
    try {
      const undoStatsQuery = `
        SELECT
          SUM(BYTES) as CURRENT_SIZE,
          SUM(BYTES) - SUM(NVL(FREE_BYTES, 0)) as CURRENT_USAGE,
          SUM(MAXBYTES) as MAX_SIZE
        FROM (
          SELECT
            d.BYTES,
            d.MAXBYTES,
            NVL(f.FREE_BYTES, 0) as FREE_BYTES
          FROM DBA_DATA_FILES d
          LEFT JOIN (
            SELECT TABLESPACE_NAME, SUM(BYTES) as FREE_BYTES
            FROM DBA_FREE_SPACE
            GROUP BY TABLESPACE_NAME
          ) f ON d.TABLESPACE_NAME = f.TABLESPACE_NAME
          WHERE d.TABLESPACE_NAME IN (
            SELECT VALUE FROM V$PARAMETER WHERE NAME = 'undo_tablespace'
          )
        )
      `;
      undoStats = await executeQuery(config, undoStatsQuery);
    } catch (dbaError) {
      console.log('[Undo Advisor] DBA views not accessible, using V$UNDOSTAT fallback');
      // V$UNDOSTAT 기반 대안 쿼리
      const fallbackQuery = `
        SELECT
          NVL(SUM(UNDOBLKS) * 8192, 0) as CURRENT_SIZE,
          NVL(SUM(ACTIVEBLKS) * 8192, 0) as CURRENT_USAGE,
          NVL(SUM(UNDOBLKS) * 8192, 0) as MAX_SIZE
        FROM V$UNDOSTAT
        WHERE BEGIN_TIME >= SYSDATE - 1
      `;
      undoStats = await executeQuery(config, fallbackQuery);
    }

    // Undo Retention 설정 조회
    const retentionQuery = `
      SELECT VALUE as RETENTION_TIME
      FROM V$PARAMETER
      WHERE NAME = 'undo_retention'
    `;

    const retentionResult = await executeQuery(config, retentionQuery);

    // Retention Guarantee 설정 조회
    // DBA_TABLESPACES 접근 실패시 기본값 사용
    let guaranteeResult = { rows: [{ RETENTION: 'NOGUARANTEE' }] };
    try {
      const guaranteeQuery = `
        SELECT RETENTION
        FROM DBA_TABLESPACES
        WHERE TABLESPACE_NAME IN (
          SELECT VALUE FROM V$PARAMETER WHERE NAME = 'undo_tablespace'
        )
      `;
      guaranteeResult = await executeQuery(config, guaranteeQuery);
    } catch (dbaError) {
      console.log('[Undo Advisor] DBA_TABLESPACES not accessible, using default retention guarantee');
    }

    // Snapshot Too Old 오류 횟수 조회 (최근 7일)
    // DBA_HIST_ACTIVE_SESS_HISTORY 접근 불가 시 0으로 처리
    let snapshotErrorCount = 0;
    try {
      const snapshotErrorQuery = `
        SELECT COUNT(*) as ERROR_COUNT
        FROM DBA_HIST_ACTIVE_SESS_HISTORY
        WHERE EVENT = 'snapshot too old'
          AND SAMPLE_TIME >= SYSDATE - 7
      `;
      const snapshotResult = await executeQuery(config, snapshotErrorQuery);
      snapshotErrorCount = snapshotResult.rows[0]?.ERROR_COUNT || 0;
    } catch (error) {
      // AWR이 없거나 DBA 권한이 없는 경우 무시
      console.log('[Undo Advisor] AWR data not available for snapshot too old errors');
    }

    // 최대 Undo 사용량 분석 (V$UNDOSTAT에서 최근 24시간)
    const undoHistoryQuery = `
      SELECT MAX(MAXQUERYLEN) as MAX_QUERY_LEN,
             MAX(UNDOBLKS) as MAX_UNDO_BLOCKS,
             AVG(UNDOBLKS) as AVG_UNDO_BLOCKS,
             AVG((END_TIME - BEGIN_TIME) * 86400) as AVG_INTERVAL_SECS
      FROM V$UNDOSTAT
      WHERE BEGIN_TIME >= SYSDATE - 1
    `;

    const undoHistory = await executeQuery(config, undoHistoryQuery);

    // 권장 크기 계산
    const currentSize = undoStats.rows[0]?.CURRENT_SIZE || 0;
    const currentUsage = undoStats.rows[0]?.CURRENT_USAGE || 0;
    const maxQueryLen = undoHistory.rows[0]?.MAX_QUERY_LEN || 0;
    const maxUndoBlocks = undoHistory.rows[0]?.MAX_UNDO_BLOCKS || 0;
    const avgUndoBlocks = undoHistory.rows[0]?.AVG_UNDO_BLOCKS || 0;
    const avgIntervalSecs = undoHistory.rows[0]?.AVG_INTERVAL_SECS || 600; // 기본 10분

    // Oracle 표준 공식: Undo Size = (UR × UPS) + overhead
    // UPS (Undo blocks Per Second) = avgUndoBlocks / avgIntervalSecs
    // UR (Undo Retention) = 사용자가 원하는 retention 시간 (초)
    const blockSize = 8192; // 8KB 기본 블록 크기
    const desiredRetentionSeconds = retentionHours * 3600;
    const undoBlocksPerSecond = avgUndoBlocks / avgIntervalSecs;

    // 권장 크기: (UPS × UR × BlockSize) + 20% overhead
    const calculatedSize = undoBlocksPerSecond * desiredRetentionSeconds * blockSize * 1.2;
    const recommendedSize = Math.max(
      calculatedSize,
      currentSize * 0.5 // 최소한 현재 크기의 50% 이상
    );

    // 권장사항 생성
    const recommendations: string[] = [];
    const currentRetentionTime = retentionResult.rows[0]?.RETENTION_TIME || 0;
    const retentionGuarantee = guaranteeResult.rows[0]?.RETENTION === 'GUARANTEE';

    // 1. Snapshot Too Old 오류 체크
    if (snapshotErrorCount > 0) {
      const requiredRetentionHours = Math.ceil(maxQueryLen / 3600);
      recommendations.push(
        `⚠️ "Snapshot too old" 오류가 ${snapshotErrorCount}건 발생했습니다. Undo Retention을 최소 ${requiredRetentionHours}시간 이상으로 증가시키세요.`
      );
    }

    // 2. 사용자가 원하는 retention 시간과 현재 설정 비교
    if (desiredRetentionSeconds > currentRetentionTime) {
      recommendations.push(
        `현재 Undo Retention (${Math.floor(currentRetentionTime / 3600)}시간)이 원하는 값 (${retentionHours}시간)보다 낮습니다. ALTER SYSTEM SET UNDO_RETENTION = ${desiredRetentionSeconds}; 로 증가시키세요.`
      );
    }

    // 3. 권장 크기와 현재 크기 비교 (20% 이상 차이 시 권장)
    if (recommendedSize > currentSize * 1.2) {
      const recommendedGB = Math.ceil(recommendedSize / 1024 / 1024 / 1024);
      const currentGB = Math.ceil(currentSize / 1024 / 1024 / 1024);
      recommendations.push(
        `${retentionHours}시간 보존을 위해 Undo 테이블스페이스를 ${currentGB}GB → ${recommendedGB}GB로 증가시키는 것을 권장합니다.`
      );
    } else if (recommendedSize < currentSize * 0.7) {
      const recommendedGB = Math.ceil(recommendedSize / 1024 / 1024 / 1024);
      const reclaimableGB = Math.ceil((currentSize - recommendedSize) / 1024 / 1024 / 1024);
      recommendations.push(
        `현재 Undo 크기가 과도합니다. ${reclaimableGB}GB를 회수하여 ${recommendedGB}GB로 줄일 수 있습니다.`
      );
    }

    // 4. 현재 사용률 체크
    if (currentUsage / currentSize > 0.9) {
      recommendations.push(
        `⚠️ Undo 테이블스페이스 사용률이 ${Math.round((currentUsage / currentSize) * 100)}%로 매우 높습니다. 데이터파일 자동 확장을 활성화하거나 크기를 즉시 증가시키세요.`
      );
    } else if (currentUsage / currentSize > 0.8) {
      recommendations.push(
        `Undo 테이블스페이스 사용률이 ${Math.round((currentUsage / currentSize) * 100)}%입니다. 여유 공간 확보를 권장합니다.`
      );
    }

    // 5. Retention Guarantee 권장
    if (!retentionGuarantee && (snapshotErrorCount > 0 || retentionHours > 24)) {
      recommendations.push(
        `장시간 쿼리 보호를 위해 Retention Guarantee를 활성화하세요: ALTER TABLESPACE UNDOTBS1 RETENTION GUARANTEE;`
      );
    }

    // 6. 최적 상태 메시지
    if (recommendations.length === 0) {
      recommendations.push(
        `✅ 현재 Undo 설정이 ${retentionHours}시간 보존에 최적 상태입니다.`
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        current_size: currentSize,
        current_usage: currentUsage,
        recommended_size: recommendedSize,
        retention_guarantee: retentionGuarantee,
        retention_time: retentionResult.rows[0]?.RETENTION_TIME || 0,
        snapshot_too_old_count: snapshotErrorCount,
        analysis_period_hours: 24,
        peak_usage: maxUndoBlocks * blockSize,
        recommendations,
      },
      isEnterprise: true,
    });
  } catch (error) {
    console.error('Error fetching Undo Advisor data:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch undo advisor data',
      },
      { status: 500 }
    );
  }
}
