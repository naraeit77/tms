-- Migration: Create SQL Performance History Table
-- Created: 2025-12-04
-- Purpose: Oracle AWR/V$SQL 데이터 독립 저장으로 안정적인 30일 성능 히스토리 제공
--
-- Benefits:
-- 1. Oracle Enterprise Edition 라이선스 불필요
-- 2. V$SQL 캐시 휘발성 문제 해결 (1-2일 → 30일 보관)
-- 3. Supabase에서 빠른 쿼리 (Oracle 부하 감소)
-- 4. 고급 분석 및 트렌드 비교 지원

-- ==============================================================================
-- 1. SQL Performance History Table (성능 히스토리 메인 테이블)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS sql_performance_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    oracle_connection_id UUID NOT NULL REFERENCES oracle_connections(id) ON DELETE CASCADE,

    -- SQL 식별 정보
    sql_id VARCHAR(13) NOT NULL,
    plan_hash_value BIGINT,
    parsing_schema_name VARCHAR(128),
    module VARCHAR(64),
    action VARCHAR(64),

    -- SQL 텍스트 (첫 4000자만 저장하여 공간 효율화)
    sql_text TEXT,

    -- 성능 메트릭 (수집 시점의 델타 값 또는 누적값)
    executions INTEGER DEFAULT 0,
    elapsed_time_ms NUMERIC(12,2) DEFAULT 0,      -- 평균 실행 시간 (ms)
    cpu_time_ms NUMERIC(12,2) DEFAULT 0,          -- 평균 CPU 시간 (ms)
    buffer_gets INTEGER DEFAULT 0,                 -- 평균 버퍼 읽기
    disk_reads INTEGER DEFAULT 0,                  -- 평균 디스크 읽기
    rows_processed BIGINT DEFAULT 0,               -- 처리된 로우 수

    -- 추가 성능 지표
    physical_read_requests INTEGER DEFAULT 0,
    physical_write_requests INTEGER DEFAULT 0,
    direct_reads INTEGER DEFAULT 0,
    direct_writes INTEGER DEFAULT 0,

    -- 대기 시간 정보
    application_wait_time_ms NUMERIC(10,2) DEFAULT 0,
    concurrency_wait_time_ms NUMERIC(10,2) DEFAULT 0,
    cluster_wait_time_ms NUMERIC(10,2) DEFAULT 0,
    user_io_wait_time_ms NUMERIC(10,2) DEFAULT 0,

    -- 성능 등급 (A-F, 조회 시 빠른 필터링용)
    performance_grade CHAR(1) CHECK (performance_grade IN ('A', 'B', 'C', 'D', 'F')),

    -- 수집 메타데이터
    source VARCHAR(20) NOT NULL CHECK (source IN ('v$sql', 'awr', 'manual')),
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    collection_hour SMALLINT GENERATED ALWAYS AS (EXTRACT(HOUR FROM collected_at)::SMALLINT) STORED,
    collection_date DATE GENERATED ALWAYS AS (collected_at::DATE) STORED,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 2. 성능 최적화 인덱스
-- ==============================================================================

-- 기본 조회: 연결 + 날짜 기준 (가장 빈번한 쿼리 패턴)
CREATE INDEX IF NOT EXISTS idx_perf_history_conn_date
ON sql_performance_history(oracle_connection_id, collection_date DESC, collected_at DESC);

-- 시간 범위 필터링: 연결 + 날짜 + 시간
CREATE INDEX IF NOT EXISTS idx_perf_history_conn_datetime
ON sql_performance_history(oracle_connection_id, collected_at DESC);

-- SQL ID 검색
CREATE INDEX IF NOT EXISTS idx_perf_history_sql_id
ON sql_performance_history(oracle_connection_id, sql_id, collected_at DESC);

-- 성능 등급별 필터링 (문제 SQL 빠른 조회)
CREATE INDEX IF NOT EXISTS idx_perf_history_grade
ON sql_performance_history(oracle_connection_id, collection_date, performance_grade)
WHERE performance_grade IN ('D', 'F');

-- Top SQL 조회 (elapsed_time 정렬)
CREATE INDEX IF NOT EXISTS idx_perf_history_elapsed
ON sql_performance_history(oracle_connection_id, collection_date, elapsed_time_ms DESC);

-- 스키마별 분석
CREATE INDEX IF NOT EXISTS idx_perf_history_schema
ON sql_performance_history(oracle_connection_id, parsing_schema_name, collection_date);

-- 시간대별 분석 (hourly aggregation)
CREATE INDEX IF NOT EXISTS idx_perf_history_hourly
ON sql_performance_history(oracle_connection_id, collection_date, collection_hour, elapsed_time_ms);

-- 30일 이전 데이터 삭제용 인덱스
CREATE INDEX IF NOT EXISTS idx_perf_history_cleanup
ON sql_performance_history(collected_at)
WHERE collected_at < NOW() - INTERVAL '30 days';

-- ==============================================================================
-- 3. 일별 요약 테이블 (대시보드 빠른 조회용)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS sql_performance_daily_summary (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    oracle_connection_id UUID NOT NULL REFERENCES oracle_connections(id) ON DELETE CASCADE,
    summary_date DATE NOT NULL,

    -- 집계 통계
    total_sqls INTEGER DEFAULT 0,
    total_executions BIGINT DEFAULT 0,

    -- 평균 성능 지표
    avg_elapsed_time_ms NUMERIC(12,2) DEFAULT 0,
    avg_cpu_time_ms NUMERIC(12,2) DEFAULT 0,
    avg_buffer_gets NUMERIC(12,2) DEFAULT 0,
    avg_disk_reads NUMERIC(12,2) DEFAULT 0,

    -- 최댓값 (성능 이상치 탐지)
    max_elapsed_time_ms NUMERIC(12,2) DEFAULT 0,
    max_buffer_gets INTEGER DEFAULT 0,

    -- 성능 등급 분포
    grade_a_count INTEGER DEFAULT 0,
    grade_b_count INTEGER DEFAULT 0,
    grade_c_count INTEGER DEFAULT 0,
    grade_d_count INTEGER DEFAULT 0,
    grade_f_count INTEGER DEFAULT 0,

    -- 시간대별 피크 (0-23시)
    peak_hour SMALLINT,
    peak_hour_executions INTEGER,

    -- 수집 정보
    collection_count INTEGER DEFAULT 0,  -- 해당 날짜 수집 횟수
    first_collection_at TIMESTAMPTZ,
    last_collection_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(oracle_connection_id, summary_date)
);

-- 일별 요약 인덱스
CREATE INDEX IF NOT EXISTS idx_daily_summary_conn_date
ON sql_performance_daily_summary(oracle_connection_id, summary_date DESC);

-- 트렌드 분석용 (최근 30일)
CREATE INDEX IF NOT EXISTS idx_daily_summary_trend
ON sql_performance_daily_summary(oracle_connection_id, summary_date DESC, avg_elapsed_time_ms, total_executions);

-- ==============================================================================
-- 4. 데이터 수집 설정 테이블
-- ==============================================================================
CREATE TABLE IF NOT EXISTS performance_collection_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    oracle_connection_id UUID NOT NULL REFERENCES oracle_connections(id) ON DELETE CASCADE,

    -- 수집 활성화 여부
    is_enabled BOOLEAN DEFAULT true,

    -- 수집 주기 (분 단위, 5/10/15/30/60)
    collection_interval_minutes INTEGER DEFAULT 10 CHECK (collection_interval_minutes IN (5, 10, 15, 30, 60)),

    -- 데이터 보관 기간 (일)
    retention_days INTEGER DEFAULT 30 CHECK (retention_days BETWEEN 7 AND 90),

    -- 수집 대상 필터
    min_executions INTEGER DEFAULT 1,              -- 최소 실행 횟수
    min_elapsed_time_ms NUMERIC(10,2) DEFAULT 0,   -- 최소 실행 시간
    excluded_schemas TEXT[] DEFAULT ARRAY['SYS', 'SYSTEM', 'DBSNMP', 'SYSMAN', 'OUTLN', 'MDSYS', 'ORDSYS', 'EXFSYS', 'WMSYS', 'CTXSYS', 'XDB'],

    -- Top SQL 제한
    top_sql_limit INTEGER DEFAULT 500 CHECK (top_sql_limit BETWEEN 100 AND 1000),

    -- 수집 시간대 설정 (비즈니스 시간만 수집 옵션)
    collect_all_hours BOOLEAN DEFAULT true,
    collect_start_hour SMALLINT DEFAULT 0 CHECK (collect_start_hour BETWEEN 0 AND 23),
    collect_end_hour SMALLINT DEFAULT 23 CHECK (collect_end_hour BETWEEN 0 AND 23),

    -- 마지막 수집 정보
    last_collection_at TIMESTAMPTZ,
    last_collection_status VARCHAR(20) CHECK (last_collection_status IN ('SUCCESS', 'FAILED', 'PARTIAL', 'RUNNING')),
    last_collection_count INTEGER DEFAULT 0,
    last_error_message TEXT,

    -- 통계
    total_collections INTEGER DEFAULT 0,
    successful_collections INTEGER DEFAULT 0,
    failed_collections INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(oracle_connection_id)
);

-- 수집 설정 인덱스
CREATE INDEX IF NOT EXISTS idx_collection_settings_enabled
ON performance_collection_settings(is_enabled, oracle_connection_id)
WHERE is_enabled = true;

-- ==============================================================================
-- 5. 수집 실행 로그 테이블
-- ==============================================================================
CREATE TABLE IF NOT EXISTS performance_collection_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    oracle_connection_id UUID NOT NULL REFERENCES oracle_connections(id) ON DELETE CASCADE,

    -- 실행 정보
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,

    -- 결과
    status VARCHAR(20) NOT NULL CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED', 'PARTIAL')),
    records_collected INTEGER DEFAULT 0,
    records_inserted INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,

    -- 데이터 소스
    source VARCHAR(20) NOT NULL CHECK (source IN ('v$sql', 'awr', 'mixed')),

    -- 에러 정보
    error_message TEXT,
    error_details JSONB,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 수집 로그 인덱스 (최근 로그 조회)
CREATE INDEX IF NOT EXISTS idx_collection_logs_recent
ON performance_collection_logs(oracle_connection_id, started_at DESC);

-- 실패 로그 빠른 조회
CREATE INDEX IF NOT EXISTS idx_collection_logs_failed
ON performance_collection_logs(oracle_connection_id, started_at DESC)
WHERE status = 'FAILED';

-- 오래된 로그 정리용
CREATE INDEX IF NOT EXISTS idx_collection_logs_cleanup
ON performance_collection_logs(started_at)
WHERE started_at < NOW() - INTERVAL '7 days';

-- ==============================================================================
-- 6. Triggers
-- ==============================================================================

-- updated_at 자동 업데이트
CREATE TRIGGER update_daily_summary_updated_at
    BEFORE UPDATE ON sql_performance_daily_summary
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_collection_settings_updated_at
    BEFORE UPDATE ON performance_collection_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 7. Row Level Security (RLS)
-- ==============================================================================

ALTER TABLE sql_performance_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE sql_performance_daily_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_collection_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_collection_logs ENABLE ROW LEVEL SECURITY;

-- Read policies
CREATE POLICY "Users can view performance history"
    ON sql_performance_history FOR SELECT
    USING (true);

CREATE POLICY "Users can view daily summary"
    ON sql_performance_daily_summary FOR SELECT
    USING (true);

CREATE POLICY "Users can view collection settings"
    ON performance_collection_settings FOR SELECT
    USING (true);

CREATE POLICY "Users can view collection logs"
    ON performance_collection_logs FOR SELECT
    USING (true);

-- Insert policies (서버에서 수집)
CREATE POLICY "Service can insert performance history"
    ON sql_performance_history FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Service can insert daily summary"
    ON sql_performance_daily_summary FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Service can insert collection settings"
    ON performance_collection_settings FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Service can insert collection logs"
    ON performance_collection_logs FOR INSERT
    WITH CHECK (true);

-- Update policies
CREATE POLICY "Service can update daily summary"
    ON sql_performance_daily_summary FOR UPDATE
    USING (true);

CREATE POLICY "Users can update collection settings"
    ON performance_collection_settings FOR UPDATE
    USING (true);

CREATE POLICY "Service can update collection logs"
    ON performance_collection_logs FOR UPDATE
    USING (true);

-- Delete policies (정리 작업용)
CREATE POLICY "Service can delete old performance history"
    ON sql_performance_history FOR DELETE
    USING (true);

CREATE POLICY "Service can delete old daily summary"
    ON sql_performance_daily_summary FOR DELETE
    USING (true);

CREATE POLICY "Service can delete old collection logs"
    ON performance_collection_logs FOR DELETE
    USING (true);

-- ==============================================================================
-- 8. 데이터 정리 함수 (30일 이전 데이터 자동 삭제)
-- ==============================================================================
CREATE OR REPLACE FUNCTION cleanup_old_performance_data()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
    setting_row RECORD;
BEGIN
    -- 각 연결별 retention_days 설정에 따라 삭제
    FOR setting_row IN
        SELECT oracle_connection_id, retention_days
        FROM performance_collection_settings
    LOOP
        DELETE FROM sql_performance_history
        WHERE oracle_connection_id = setting_row.oracle_connection_id
          AND collected_at < NOW() - (setting_row.retention_days || ' days')::INTERVAL;

        deleted_count := deleted_count + (SELECT COUNT(*) FROM sql_performance_history WHERE 1=0);  -- placeholder

        DELETE FROM sql_performance_daily_summary
        WHERE oracle_connection_id = setting_row.oracle_connection_id
          AND summary_date < CURRENT_DATE - setting_row.retention_days;
    END LOOP;

    -- 기본 30일 정리 (설정 없는 연결용)
    DELETE FROM sql_performance_history
    WHERE collected_at < NOW() - INTERVAL '30 days'
      AND oracle_connection_id NOT IN (SELECT oracle_connection_id FROM performance_collection_settings);

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    -- 7일 이전 수집 로그 삭제
    DELETE FROM performance_collection_logs
    WHERE started_at < NOW() - INTERVAL '7 days';

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 9. 통계 정보 업데이트
-- ==============================================================================
ANALYZE sql_performance_history;
ANALYZE sql_performance_daily_summary;
ANALYZE performance_collection_settings;
ANALYZE performance_collection_logs;

-- ==============================================================================
-- 10. Comments
-- ==============================================================================
COMMENT ON TABLE sql_performance_history IS 'SQL 성능 히스토리 - Oracle AWR/V$SQL 데이터의 독립 저장소 (30일 보관)';
COMMENT ON TABLE sql_performance_daily_summary IS 'SQL 성능 일별 요약 - 대시보드 빠른 조회용';
COMMENT ON TABLE performance_collection_settings IS '성능 데이터 수집 설정 - 연결별 수집 주기 및 옵션';
COMMENT ON TABLE performance_collection_logs IS '성능 데이터 수집 로그 - 수집 실행 이력 및 에러 추적';

COMMENT ON COLUMN sql_performance_history.performance_grade IS '성능 등급: A(우수) B(양호) C(보통) D(주의) F(심각)';
COMMENT ON COLUMN sql_performance_history.source IS '데이터 소스: v$sql(현재 캐시), awr(AWR 히스토리), manual(수동 입력)';
COMMENT ON COLUMN sql_performance_history.collection_hour IS '수집 시간(0-23) - 시간대별 분석용';
COMMENT ON COLUMN sql_performance_history.collection_date IS '수집 날짜 - 일별 조회 최적화용';

COMMENT ON FUNCTION cleanup_old_performance_data() IS '오래된 성능 데이터 정리 - 각 연결별 retention_days 설정에 따라 삭제';
