-- Migration: Add Performance Optimization Indexes
-- Created: 2025-11-27
-- Purpose: Improve query performance for dashboard and monitoring pages

-- ==============================================================================
-- oracle_connections 테이블 인덱스
-- ==============================================================================

-- 사용자별 활성 연결 조회 최적화 (WHERE user_id = ? AND is_active = true)
CREATE INDEX IF NOT EXISTS idx_oracle_connections_user_active
ON oracle_connections(user_id, is_active)
WHERE is_active = true;

-- 건강한 연결 상태 필터링 최적화 (WHERE health_status = 'HEALTHY')
CREATE INDEX IF NOT EXISTS idx_oracle_connections_health
ON oracle_connections(health_status)
WHERE health_status = 'HEALTHY';

-- 복합 조회 최적화 (사용자별 활성화되고 건강한 연결)
CREATE INDEX IF NOT EXISTS idx_oracle_connections_user_health_active
ON oracle_connections(user_id, health_status, is_active)
WHERE is_active = true AND health_status = 'HEALTHY';

-- ==============================================================================
-- sql_statistics 테이블 인덱스
-- ==============================================================================

-- 연결별 최신 통계 조회 최적화 (ORDER BY collected_at DESC)
CREATE INDEX IF NOT EXISTS idx_sql_statistics_connection_collected
ON sql_statistics(oracle_connection_id, collected_at DESC);

-- 상태 및 우선순위 필터링 최적화 (WHERE status IN ('CRITICAL', 'WARNING'))
CREATE INDEX IF NOT EXISTS idx_sql_statistics_status_priority
ON sql_statistics(status, priority)
WHERE status IN ('CRITICAL', 'WARNING');

-- 성능 지표 정렬 최적화 (ORDER BY buffer_gets DESC, elapsed_time_ms DESC)
CREATE INDEX IF NOT EXISTS idx_sql_statistics_performance
ON sql_statistics(oracle_connection_id, buffer_gets DESC, elapsed_time_ms DESC)
WHERE buffer_gets > 10000;

-- 실행 횟수 기준 정렬 최적화 (ORDER BY executions DESC)
CREATE INDEX IF NOT EXISTS idx_sql_statistics_executions
ON sql_statistics(oracle_connection_id, executions DESC)
WHERE executions > 100;

-- CPU 시간 기준 정렬 최적화 (ORDER BY cpu_time_ms DESC)
CREATE INDEX IF NOT EXISTS idx_sql_statistics_cpu_time
ON sql_statistics(oracle_connection_id, cpu_time_ms DESC)
WHERE cpu_time_ms > 1000;

-- 복합 필터 조회 최적화 (연결 + 상태 + 수집 시간)
CREATE INDEX IF NOT EXISTS idx_sql_statistics_connection_status_collected
ON sql_statistics(oracle_connection_id, status, collected_at DESC);

-- SQL ID 조회 최적화
CREATE INDEX IF NOT EXISTS idx_sql_statistics_sql_id
ON sql_statistics(sql_id, oracle_connection_id);

-- ==============================================================================
-- tuning_recommendations 테이블 인덱스
-- ==============================================================================

-- SQL 통계별 튜닝 권장사항 조회 최적화
CREATE INDEX IF NOT EXISTS idx_tuning_recommendations_sql_status
ON tuning_recommendations(sql_statistic_id, status);

-- 연결별 권장사항 조회 최적화
CREATE INDEX IF NOT EXISTS idx_tuning_recommendations_connection_created
ON tuning_recommendations(oracle_connection_id, created_at DESC);

-- 상태별 권장사항 필터링 최적화
CREATE INDEX IF NOT EXISTS idx_tuning_recommendations_status
ON tuning_recommendations(status)
WHERE status IN ('PENDING', 'APPLIED');

-- ==============================================================================
-- awr_reports 테이블 인덱스
-- ==============================================================================

-- 연결별 최신 AWR 리포트 조회 최적화
CREATE INDEX IF NOT EXISTS idx_awr_reports_connection_created
ON awr_reports(oracle_connection_id, created_at DESC);

-- 리포트 타입별 조회 최적화
CREATE INDEX IF NOT EXISTS idx_awr_reports_type_created
ON awr_reports(report_type, created_at DESC);

-- 스냅샷 범위 조회 최적화
CREATE INDEX IF NOT EXISTS idx_awr_reports_snapshots
ON awr_reports(begin_snap_id, end_snap_id);

-- ==============================================================================
-- statspack_snapshots 테이블 인덱스
-- ==============================================================================

-- 연결별 최신 스냅샷 조회 최적화
CREATE INDEX IF NOT EXISTS idx_statspack_snapshots_connection_time
ON statspack_snapshots(oracle_connection_id, snapshot_time DESC);

-- 스냅샷 ID 조회 최적화
CREATE INDEX IF NOT EXISTS idx_statspack_snapshots_snap_id
ON statspack_snapshots(oracle_connection_id, snap_id);

-- ==============================================================================
-- stats_collection_history 테이블 인덱스
-- ==============================================================================

-- 연결별 수집 이력 조회 최적화
CREATE INDEX IF NOT EXISTS idx_stats_collection_connection_started
ON stats_collection_history(oracle_connection_id, started_at DESC);

-- 상태별 수집 이력 필터링 최적화
CREATE INDEX IF NOT EXISTS idx_stats_collection_status
ON stats_collection_history(status, started_at DESC)
WHERE status IN ('RUNNING', 'FAILED');

-- 수집 타입별 조회 최적화
CREATE INDEX IF NOT EXISTS idx_stats_collection_type_started
ON stats_collection_history(collection_type, started_at DESC);

-- ==============================================================================
-- 성능 향상을 위한 통계 정보 수집
-- ==============================================================================

-- PostgreSQL의 통계 정보를 최신 상태로 유지
ANALYZE oracle_connections;
ANALYZE sql_statistics;
ANALYZE tuning_recommendations;
ANALYZE awr_reports;
ANALYZE statspack_snapshots;
ANALYZE stats_collection_history;

-- ==============================================================================
-- 인덱스 효과 검증 쿼리
-- ==============================================================================

-- 생성된 인덱스 확인
COMMENT ON INDEX idx_oracle_connections_user_active IS 'Performance: 사용자별 활성 연결 조회 최적화';
COMMENT ON INDEX idx_sql_statistics_connection_collected IS 'Performance: 연결별 최신 통계 조회 최적화';
COMMENT ON INDEX idx_sql_statistics_performance IS 'Performance: 성능 지표 정렬 최적화';
COMMENT ON INDEX idx_awr_reports_connection_created IS 'Performance: 연결별 최신 AWR 리포트 조회 최적화';

-- 인덱스 사용률 모니터링 쿼리 (나중에 확인용)
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
-- FROM pg_stat_user_indexes
-- WHERE indexname LIKE 'idx_%'
-- ORDER BY idx_scan DESC;
