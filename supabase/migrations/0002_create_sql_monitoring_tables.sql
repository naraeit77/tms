-- =====================================================
-- TMS v2.0 SQL Monitoring Tables Migration
-- Description: SQL 모니터링 및 성능 메트릭 테이블
-- =====================================================

-- =====================================================
-- 1. SQL Statistics (SQL 통계 정보)
-- =====================================================
CREATE TABLE IF NOT EXISTS sql_statistics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    oracle_connection_id UUID NOT NULL REFERENCES oracle_connections(id) ON DELETE CASCADE,
    sql_id VARCHAR(13) NOT NULL, -- Oracle SQL_ID (13 characters)
    plan_hash_value BIGINT,
    module VARCHAR(100),
    schema_name VARCHAR(100),
    sql_text TEXT NOT NULL,
    sql_fulltext TEXT,

    -- Performance Metrics
    elapsed_time_ms BIGINT DEFAULT 0, -- Total elapsed time in milliseconds
    cpu_time_ms BIGINT DEFAULT 0,
    buffer_gets BIGINT DEFAULT 0,
    disk_reads BIGINT DEFAULT 0,
    direct_writes BIGINT DEFAULT 0,
    executions INTEGER DEFAULT 0,
    parse_calls INTEGER DEFAULT 0,
    rows_processed BIGINT DEFAULT 0,

    -- Calculated Metrics
    avg_elapsed_time_ms NUMERIC(12, 2),
    avg_cpu_time_ms NUMERIC(12, 2),
    gets_per_exec NUMERIC(12, 2),
    rows_per_exec NUMERIC(12, 2),

    -- Wait Information
    application_wait_time_ms BIGINT DEFAULT 0,
    concurrency_wait_time_ms BIGINT DEFAULT 0,
    cluster_wait_time_ms BIGINT DEFAULT 0,
    user_io_wait_time_ms BIGINT DEFAULT 0,

    -- Timestamps
    first_load_time TIMESTAMPTZ,
    last_active_time TIMESTAMPTZ,
    last_load_time TIMESTAMPTZ,

    -- Collection Info
    collected_at TIMESTAMPTZ DEFAULT NOW(),
    snapshot_id BIGINT, -- AWR Snapshot ID if applicable

    -- Status
    status VARCHAR(20) CHECK (status IN ('NORMAL', 'WARNING', 'CRITICAL', 'TUNING')) DEFAULT 'NORMAL',
    priority VARCHAR(20) CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')) DEFAULT 'MEDIUM',

    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for sql_statistics
CREATE INDEX idx_sql_statistics_oracle_conn ON sql_statistics(oracle_connection_id);
CREATE INDEX idx_sql_statistics_sql_id ON sql_statistics(oracle_connection_id, sql_id);
CREATE INDEX idx_sql_statistics_collected ON sql_statistics(collected_at DESC);
CREATE INDEX idx_sql_statistics_status ON sql_statistics(status);
CREATE INDEX idx_sql_statistics_priority ON sql_statistics(priority);
CREATE INDEX idx_sql_statistics_elapsed ON sql_statistics(elapsed_time_ms DESC);
CREATE INDEX idx_sql_statistics_buffer ON sql_statistics(buffer_gets DESC);
CREATE INDEX idx_sql_statistics_cpu ON sql_statistics(cpu_time_ms DESC);

-- Partitioning by collected_at (for performance)
-- Note: This requires table to be created with PARTITION BY RANGE (collected_at)

-- =====================================================
-- 2. SQL Execution History (SQL 실행 이력)
-- =====================================================
CREATE TABLE IF NOT EXISTS sql_execution_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sql_statistics_id UUID REFERENCES sql_statistics(id) ON DELETE CASCADE,
    oracle_connection_id UUID NOT NULL REFERENCES oracle_connections(id) ON DELETE CASCADE,
    sql_id VARCHAR(13) NOT NULL,

    -- Execution Details
    execution_time TIMESTAMPTZ NOT NULL,
    elapsed_time_ms INTEGER,
    cpu_time_ms INTEGER,
    buffer_gets INTEGER,
    disk_reads INTEGER,
    rows_processed INTEGER,

    -- Session Info
    sid INTEGER,
    serial_number INTEGER,
    username VARCHAR(100),
    program VARCHAR(100),

    -- Execution Plan
    plan_hash_value BIGINT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for sql_execution_history
CREATE INDEX idx_sql_execution_history_sql_stats ON sql_execution_history(sql_statistics_id);
CREATE INDEX idx_sql_execution_history_sql_id ON sql_execution_history(oracle_connection_id, sql_id);
CREATE INDEX idx_sql_execution_history_time ON sql_execution_history(execution_time DESC);

-- =====================================================
-- 3. Wait Events (Wait Event 정보)
-- =====================================================
CREATE TABLE IF NOT EXISTS wait_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    oracle_connection_id UUID NOT NULL REFERENCES oracle_connections(id) ON DELETE CASCADE,
    event_name VARCHAR(100) NOT NULL,
    wait_class VARCHAR(50),

    -- Wait Statistics
    total_waits BIGINT DEFAULT 0,
    total_timeouts BIGINT DEFAULT 0,
    time_waited_ms BIGINT DEFAULT 0,
    average_wait_ms NUMERIC(12, 2),

    -- Percentage
    pct_db_time NUMERIC(5, 2),

    -- Collection Info
    collected_at TIMESTAMPTZ DEFAULT NOW(),
    snapshot_id BIGINT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for wait_events
CREATE INDEX idx_wait_events_oracle_conn ON wait_events(oracle_connection_id);
CREATE INDEX idx_wait_events_collected ON wait_events(collected_at DESC);
CREATE INDEX idx_wait_events_time_waited ON wait_events(time_waited_ms DESC);

-- =====================================================
-- 4. Session Monitoring (세션 모니터링)
-- =====================================================
CREATE TABLE IF NOT EXISTS session_monitoring (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    oracle_connection_id UUID NOT NULL REFERENCES oracle_connections(id) ON DELETE CASCADE,

    -- Session Info
    sid INTEGER NOT NULL,
    serial_number INTEGER NOT NULL,
    username VARCHAR(100),
    osuser VARCHAR(100),
    machine VARCHAR(100),
    program VARCHAR(100),
    module VARCHAR(100),

    -- Status
    status VARCHAR(20), -- ACTIVE, INACTIVE, KILLED, etc.
    state VARCHAR(20),

    -- Current Activity
    sql_id VARCHAR(13),
    sql_text TEXT,
    event VARCHAR(100),
    wait_class VARCHAR(50),
    wait_time_ms INTEGER,

    -- Resource Usage
    logical_reads BIGINT,
    physical_reads BIGINT,
    cpu_time_ms BIGINT,

    -- Session Times
    logon_time TIMESTAMPTZ,
    last_call_et INTEGER, -- seconds since last user call

    -- Blocking Information
    blocking_session INTEGER,
    blocking_session_status VARCHAR(20),

    -- Collection Info
    collected_at TIMESTAMPTZ DEFAULT NOW(),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for session_monitoring
CREATE INDEX idx_session_monitoring_oracle_conn ON session_monitoring(oracle_connection_id);
CREATE INDEX idx_session_monitoring_sid ON session_monitoring(sid, serial_number);
CREATE INDEX idx_session_monitoring_sql_id ON session_monitoring(sql_id);
CREATE INDEX idx_session_monitoring_collected ON session_monitoring(collected_at DESC);
CREATE INDEX idx_session_monitoring_blocking ON session_monitoring(blocking_session) WHERE blocking_session IS NOT NULL;

-- =====================================================
-- 5. Execution Plans (실행 계획)
-- =====================================================
CREATE TABLE IF NOT EXISTS execution_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    oracle_connection_id UUID NOT NULL REFERENCES oracle_connections(id) ON DELETE CASCADE,
    sql_id VARCHAR(13) NOT NULL,
    plan_hash_value BIGINT NOT NULL,

    -- Plan Details
    plan_table JSONB NOT NULL, -- Array of plan operations
    plan_text TEXT,

    -- Plan Metadata
    optimizer VARCHAR(50),
    cost NUMERIC,
    cardinality BIGINT,
    bytes BIGINT,

    -- Timestamps
    timestamp TIMESTAMPTZ,
    first_load_time TIMESTAMPTZ,

    -- Plan Stats
    executions INTEGER DEFAULT 0,
    avg_elapsed_time_ms NUMERIC(12, 2),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(oracle_connection_id, sql_id, plan_hash_value)
);

-- Indexes for execution_plans
CREATE INDEX idx_execution_plans_sql_id ON execution_plans(oracle_connection_id, sql_id);
CREATE INDEX idx_execution_plans_hash ON execution_plans(plan_hash_value);

-- =====================================================
-- 6. SQL Bind Variables (바인드 변수)
-- =====================================================
CREATE TABLE IF NOT EXISTS sql_bind_variables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    oracle_connection_id UUID NOT NULL REFERENCES oracle_connections(id) ON DELETE CASCADE,
    sql_id VARCHAR(13) NOT NULL,

    -- Bind Info
    position INTEGER NOT NULL,
    name VARCHAR(100),
    datatype VARCHAR(50),
    value_string TEXT,

    -- Capture Time
    captured_at TIMESTAMPTZ DEFAULT NOW(),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for sql_bind_variables
CREATE INDEX idx_sql_bind_variables_sql_id ON sql_bind_variables(oracle_connection_id, sql_id);

-- =====================================================
-- Triggers for updated_at
-- =====================================================
CREATE TRIGGER update_sql_statistics_updated_at
    BEFORE UPDATE ON sql_statistics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_wait_events_updated_at
    BEFORE UPDATE ON wait_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_execution_plans_updated_at
    BEFORE UPDATE ON execution_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================

-- Enable RLS
ALTER TABLE sql_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE sql_execution_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE wait_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_monitoring ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE sql_bind_variables ENABLE ROW LEVEL SECURITY;

-- Basic read policy for all users
CREATE POLICY "Users can view sql statistics"
    ON sql_statistics FOR SELECT
    USING (true);

CREATE POLICY "Users can view execution history"
    ON sql_execution_history FOR SELECT
    USING (true);

CREATE POLICY "Users can view wait events"
    ON wait_events FOR SELECT
    USING (true);

CREATE POLICY "Users can view session monitoring"
    ON session_monitoring FOR SELECT
    USING (true);

CREATE POLICY "Users can view execution plans"
    ON execution_plans FOR SELECT
    USING (true);

CREATE POLICY "Users can view bind variables"
    ON sql_bind_variables FOR SELECT
    USING (true);

-- =====================================================
-- Comments
-- =====================================================
COMMENT ON TABLE sql_statistics IS 'SQL 통계 및 성능 메트릭';
COMMENT ON TABLE sql_execution_history IS 'SQL 실행 이력';
COMMENT ON TABLE wait_events IS 'Wait Event 통계';
COMMENT ON TABLE session_monitoring IS '세션 모니터링 데이터';
COMMENT ON TABLE execution_plans IS 'SQL 실행 계획';
COMMENT ON TABLE sql_bind_variables IS 'SQL 바인드 변수';
