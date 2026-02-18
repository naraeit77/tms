-- Migration: Optimize Monitoring Page Performance
-- Created: 2025-11-27
-- Purpose: Add additional indexes to improve real-time monitoring page performance

-- ==============================================================================
-- sql_statistics 테이블 추가 최적화
-- ==============================================================================

-- 모니터링 페이지에서 자주 사용하는 복합 쿼리 최적화
-- WHERE oracle_connection_id = ? ORDER BY elapsed_time_ms DESC LIMIT 10
CREATE INDEX IF NOT EXISTS idx_sql_statistics_conn_elapsed_top
ON sql_statistics(oracle_connection_id, elapsed_time_ms DESC, sql_id, buffer_gets, cpu_time_ms, executions);

-- WHERE oracle_connection_id = ? AND status IN ('CRITICAL', 'WARNING') ORDER BY collected_at DESC
CREATE INDEX IF NOT EXISTS idx_sql_statistics_conn_critical_time
ON sql_statistics(oracle_connection_id, status, collected_at DESC, sql_id, elapsed_time_ms)
WHERE status IN ('CRITICAL', 'WARNING');

-- 최근 수집된 데이터의 평균 계산 최적화 (대시보드 메트릭) - WHERE 조건 제거
CREATE INDEX IF NOT EXISTS idx_sql_statistics_recent_hour
ON sql_statistics(oracle_connection_id, collected_at DESC, elapsed_time_ms, cpu_time_ms, buffer_gets, executions);

-- SQL ID로 빠른 조회 (SQL 상세 분석 모달) - 복합 인덱스로 covering
CREATE INDEX IF NOT EXISTS idx_sql_statistics_sqlid_detail
ON sql_statistics(sql_id, oracle_connection_id, elapsed_time_ms, cpu_time_ms, buffer_gets, executions);

-- ==============================================================================
-- wait_events 테이블 최적화
-- ==============================================================================

-- 연결별 최근 대기 이벤트 조회 - 복합 인덱스로 covering
CREATE INDEX IF NOT EXISTS idx_wait_events_conn_time_detail
ON wait_events(oracle_connection_id, collected_at DESC, event_name, wait_class, average_wait_ms, total_waits);

-- 높은 대기 시간 이벤트 필터링 - 복합 인덱스로 covering
CREATE INDEX IF NOT EXISTS idx_wait_events_high_wait_detail
ON wait_events(oracle_connection_id, average_wait_ms DESC, event_name, wait_class, total_waits)
WHERE average_wait_ms > 100;

-- ==============================================================================
-- session_monitoring 테이블 최적화
-- ==============================================================================

-- 연결별 활성 세션 조회 - 복합 인덱스로 covering
CREATE INDEX IF NOT EXISTS idx_session_monitoring_active_detail
ON session_monitoring(oracle_connection_id, status, collected_at DESC, sid, serial_number, username, sql_id)
WHERE status = 'ACTIVE';

-- 블로킹 세션 빠른 조회 - 복합 인덱스로 covering
CREATE INDEX IF NOT EXISTS idx_session_monitoring_blocked_detail
ON session_monitoring(oracle_connection_id, collected_at DESC, sid, serial_number, username, sql_id, blocking_session)
WHERE blocking_session IS NOT NULL;

-- 최근 세션 활동 조회 - 복합 인덱스로 covering (WHERE 조건 제거)
CREATE INDEX IF NOT EXISTS idx_session_monitoring_recent_hour
ON session_monitoring(oracle_connection_id, collected_at DESC, status, username, program, cpu_time_ms);

-- ==============================================================================
-- oracle_connections 테이블 추가 최적화
-- ==============================================================================

-- 활성 연결의 마지막 상태 체크 최적화 - 복합 인덱스로 covering
CREATE INDEX IF NOT EXISTS idx_oracle_connections_active_status
ON oracle_connections(is_active, last_health_check_at DESC, id, name, health_status, host, port)
WHERE is_active = true;

-- ==============================================================================
-- 복합 통계 쿼리 최적화
-- ==============================================================================

-- 연결별 SQL 통계 요약 (COUNT, AVG, SUM 집계에 유리) - WHERE 조건 제거
CREATE INDEX IF NOT EXISTS idx_sql_statistics_daily_summary
ON sql_statistics(oracle_connection_id, status, elapsed_time_ms, cpu_time_ms, buffer_gets, executions);

-- 시간대별 성능 트렌드 분석 (date_trunc 제거하여 단순화)
CREATE INDEX IF NOT EXISTS idx_sql_statistics_trend_analysis
ON sql_statistics(oracle_connection_id, collected_at, elapsed_time_ms, cpu_time_ms, buffer_gets, executions);

-- ==============================================================================
-- 파티션별 통계 정보 업데이트
-- ==============================================================================

-- PostgreSQL 통계 정보 업데이트 (쿼리 플래너 최적화)
ANALYZE sql_statistics;
ANALYZE wait_events;
ANALYZE session_monitoring;
ANALYZE oracle_connections;

-- ==============================================================================
-- 인덱스 메타데이터 및 설명
-- ==============================================================================

COMMENT ON INDEX idx_sql_statistics_conn_elapsed_top IS 'Monitoring: Top slow queries by elapsed time with covering columns';
COMMENT ON INDEX idx_sql_statistics_conn_critical_time IS 'Monitoring: Recent critical/warning SQLs with covering columns';
COMMENT ON INDEX idx_sql_statistics_recent_hour IS 'Monitoring: Recent 24-hour metrics for dashboard calculations';
COMMENT ON INDEX idx_sql_statistics_sqlid_detail IS 'Monitoring: Fast SQL detail lookup by SQL ID with covering columns';

COMMENT ON INDEX idx_wait_events_conn_time_detail IS 'Monitoring: Recent wait events per connection with details';
COMMENT ON INDEX idx_wait_events_high_wait_detail IS 'Monitoring: High average wait time events with details';

COMMENT ON INDEX idx_session_monitoring_active_detail IS 'Monitoring: Active sessions with covering columns';
COMMENT ON INDEX idx_session_monitoring_blocked_detail IS 'Monitoring: Blocked sessions with covering columns';
COMMENT ON INDEX idx_session_monitoring_recent_hour IS 'Monitoring: Recent 1-hour session activity';

COMMENT ON INDEX idx_oracle_connections_active_status IS 'Monitoring: Active connections health status with covering columns';
COMMENT ON INDEX idx_sql_statistics_daily_summary IS 'Monitoring: Daily SQL statistics summary for aggregations';
COMMENT ON INDEX idx_sql_statistics_trend_analysis IS 'Monitoring: Time-series performance trend analysis';

-- ==============================================================================
-- 성능 모니터링 가이드
-- ==============================================================================

-- 다음 쿼리로 인덱스 사용률 확인 가능:
-- SELECT
--     schemaname,
--     tablename,
--     indexname,
--     idx_scan as scans,
--     idx_tup_read as tuples_read,
--     idx_tup_fetch as tuples_fetched,
--     pg_size_pretty(pg_relation_size(indexrelid)) as index_size
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
--   AND tablename IN ('sql_statistics', 'wait_events', 'session_monitoring', 'oracle_connections')
-- ORDER BY idx_scan DESC;

-- 느린 쿼리 확인:
-- SELECT query, calls, mean_exec_time, total_exec_time
-- FROM pg_stat_statements
-- WHERE query LIKE '%sql_statistics%'
-- ORDER BY mean_exec_time DESC
-- LIMIT 10;
