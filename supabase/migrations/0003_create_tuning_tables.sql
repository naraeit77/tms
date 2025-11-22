-- =====================================================
-- TMS v2.0 Tuning Management Tables Migration
-- Description: 튜닝 관리 및 워크플로우 테이블
-- =====================================================

-- =====================================================
-- 1. SQL Tuning Tasks (튜닝 대상 SQL)
-- =====================================================
CREATE TABLE IF NOT EXISTS sql_tuning_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    oracle_connection_id UUID NOT NULL REFERENCES oracle_connections(id) ON DELETE CASCADE,
    sql_statistics_id UUID REFERENCES sql_statistics(id) ON DELETE SET NULL,
    sql_id VARCHAR(13) NOT NULL,
    sql_text TEXT NOT NULL,

    -- Task Info
    title VARCHAR(255) NOT NULL,
    description TEXT,

    -- Priority & Status
    priority VARCHAR(20) CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')) DEFAULT 'MEDIUM',
    status VARCHAR(20) CHECK (status IN ('IDENTIFIED', 'ASSIGNED', 'IN_PROGRESS', 'REVIEW', 'COMPLETED', 'CANCELLED')) DEFAULT 'IDENTIFIED',

    -- Assignment
    assigned_to UUID REFERENCES auth.users(id),
    assigned_at TIMESTAMPTZ,
    assigned_by UUID REFERENCES auth.users(id),

    -- Performance Metrics (Before Tuning)
    before_elapsed_time_ms BIGINT,
    before_cpu_time_ms BIGINT,
    before_buffer_gets BIGINT,
    before_disk_reads BIGINT,
    before_executions INTEGER,
    before_plan_hash_value BIGINT,

    -- Performance Metrics (After Tuning)
    after_elapsed_time_ms BIGINT,
    after_cpu_time_ms BIGINT,
    after_buffer_gets BIGINT,
    after_disk_reads BIGINT,
    after_executions INTEGER,
    after_plan_hash_value BIGINT,

    -- Improvement Metrics
    improvement_rate NUMERIC(5, 2), -- Percentage
    elapsed_time_improved_pct NUMERIC(5, 2),
    buffer_gets_improved_pct NUMERIC(5, 2),
    cpu_time_improved_pct NUMERIC(5, 2),

    -- Tuning Details
    tuning_method VARCHAR(100), -- Index, SQL Rewrite, Statistics, Partitioning, etc.
    tuning_details TEXT,
    implemented_changes TEXT,

    -- Timeline
    identified_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    estimated_completion_date DATE,

    -- Review & Approval
    reviewed_by UUID REFERENCES auth.users(id),
    reviewed_at TIMESTAMPTZ,
    review_comments TEXT,
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMPTZ,

    -- Tags & Labels
    tags TEXT[], -- Array of tags
    labels JSONB DEFAULT '{}',

    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for sql_tuning_tasks
CREATE INDEX idx_sql_tuning_tasks_oracle_conn ON sql_tuning_tasks(oracle_connection_id);
CREATE INDEX idx_sql_tuning_tasks_sql_id ON sql_tuning_tasks(sql_id);
CREATE INDEX idx_sql_tuning_tasks_status ON sql_tuning_tasks(status);
CREATE INDEX idx_sql_tuning_tasks_priority ON sql_tuning_tasks(priority);
CREATE INDEX idx_sql_tuning_tasks_assigned ON sql_tuning_tasks(assigned_to);
CREATE INDEX idx_sql_tuning_tasks_created ON sql_tuning_tasks(created_at DESC);

-- =====================================================
-- 2. Tuning History (튜닝 이력)
-- =====================================================
CREATE TABLE IF NOT EXISTS tuning_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tuning_task_id UUID NOT NULL REFERENCES sql_tuning_tasks(id) ON DELETE CASCADE,
    oracle_connection_id UUID NOT NULL REFERENCES oracle_connections(id) ON DELETE CASCADE,
    sql_id VARCHAR(13) NOT NULL,

    -- Activity Info
    activity_type VARCHAR(50) NOT NULL, -- STATUS_CHANGE, ASSIGNMENT, COMMENT, TUNING_ACTION, etc.
    description TEXT NOT NULL,

    -- Old vs New Values (for tracking changes)
    old_value JSONB,
    new_value JSONB,

    -- Performance Snapshot (at time of activity)
    elapsed_time_ms BIGINT,
    buffer_gets BIGINT,
    cpu_time_ms BIGINT,

    -- Actor
    performed_by UUID REFERENCES auth.users(id),
    performed_at TIMESTAMPTZ DEFAULT NOW(),

    -- Additional Data
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for tuning_history
CREATE INDEX idx_tuning_history_task ON tuning_history(tuning_task_id);
CREATE INDEX idx_tuning_history_performed ON tuning_history(performed_at DESC);
CREATE INDEX idx_tuning_history_type ON tuning_history(activity_type);

-- =====================================================
-- 3. Tuning Comments (튜닝 코멘트)
-- =====================================================
CREATE TABLE IF NOT EXISTS tuning_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tuning_task_id UUID NOT NULL REFERENCES sql_tuning_tasks(id) ON DELETE CASCADE,
    parent_comment_id UUID REFERENCES tuning_comments(id) ON DELETE CASCADE,

    -- Comment Content
    comment TEXT NOT NULL,
    comment_type VARCHAR(20) CHECK (comment_type IN ('COMMENT', 'QUESTION', 'SOLUTION', 'ISSUE')) DEFAULT 'COMMENT',

    -- Attachments
    attachments JSONB DEFAULT '[]', -- Array of file references

    -- Author
    author_id UUID NOT NULL REFERENCES auth.users(id),
    author_name VARCHAR(100),

    -- Mentions
    mentions UUID[], -- Array of user IDs mentioned in comment

    -- Status
    is_resolved BOOLEAN DEFAULT false,
    resolved_by UUID REFERENCES auth.users(id),
    resolved_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for tuning_comments
CREATE INDEX idx_tuning_comments_task ON tuning_comments(tuning_task_id);
CREATE INDEX idx_tuning_comments_parent ON tuning_comments(parent_comment_id);
CREATE INDEX idx_tuning_comments_author ON tuning_comments(author_id);
CREATE INDEX idx_tuning_comments_created ON tuning_comments(created_at DESC);

-- =====================================================
-- 4. Tuning Recommendations (튜닝 권장사항)
-- =====================================================
CREATE TABLE IF NOT EXISTS tuning_recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tuning_task_id UUID REFERENCES sql_tuning_tasks(id) ON DELETE CASCADE,
    oracle_connection_id UUID NOT NULL REFERENCES oracle_connections(id) ON DELETE CASCADE,
    sql_id VARCHAR(13) NOT NULL,

    -- Recommendation Details
    recommendation_type VARCHAR(50) NOT NULL, -- INDEX, REWRITE, STATISTICS, HINT, PARTITION, etc.
    title VARCHAR(255) NOT NULL,
    description TEXT,
    rationale TEXT, -- Why this recommendation is suggested

    -- Implementation Details
    implementation_sql TEXT,
    implementation_steps TEXT[],
    estimated_effort VARCHAR(20), -- LOW, MEDIUM, HIGH

    -- Expected Impact
    expected_improvement_pct NUMERIC(5, 2),
    expected_benefit TEXT,
    potential_risks TEXT,

    -- Priority & Status
    priority VARCHAR(20) CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')) DEFAULT 'MEDIUM',
    status VARCHAR(20) CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'IMPLEMENTED')) DEFAULT 'PENDING',

    -- AI/Auto-generated flag
    is_auto_generated BOOLEAN DEFAULT false,
    generated_by VARCHAR(50), -- AI_ADVISOR, MANUAL, AWR, ADDM, etc.

    -- Decision
    decision_by UUID REFERENCES auth.users(id),
    decision_at TIMESTAMPTZ,
    decision_notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for tuning_recommendations
CREATE INDEX idx_tuning_recommendations_task ON tuning_recommendations(tuning_task_id);
CREATE INDEX idx_tuning_recommendations_status ON tuning_recommendations(status);
CREATE INDEX idx_tuning_recommendations_type ON tuning_recommendations(recommendation_type);

-- =====================================================
-- 5. Plan Baselines (실행 계획 베이스라인)
-- =====================================================
CREATE TABLE IF NOT EXISTS plan_baselines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    oracle_connection_id UUID NOT NULL REFERENCES oracle_connections(id) ON DELETE CASCADE,
    sql_id VARCHAR(13) NOT NULL,
    plan_hash_value BIGINT NOT NULL,

    -- Baseline Info
    plan_name VARCHAR(100) UNIQUE NOT NULL,
    sql_handle VARCHAR(100),
    is_enabled BOOLEAN DEFAULT true,
    is_accepted BOOLEAN DEFAULT true,
    is_fixed BOOLEAN DEFAULT false,

    -- Plan Details
    plan_table JSONB NOT NULL,
    cost NUMERIC,

    -- Performance Stats
    executions INTEGER DEFAULT 0,
    avg_elapsed_time_ms NUMERIC(12, 2),
    avg_buffer_gets NUMERIC(12, 2),

    -- Timestamps
    created_in_oracle_at TIMESTAMPTZ,
    last_modified_at TIMESTAMPTZ,

    -- Management
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(oracle_connection_id, sql_id, plan_hash_value)
);

-- Indexes for plan_baselines
CREATE INDEX idx_plan_baselines_oracle_conn ON plan_baselines(oracle_connection_id);
CREATE INDEX idx_plan_baselines_sql_id ON plan_baselines(sql_id);
CREATE INDEX idx_plan_baselines_enabled ON plan_baselines(is_enabled);

-- =====================================================
-- 6. Tuning Reports (튜닝 리포트)
-- =====================================================
CREATE TABLE IF NOT EXISTS tuning_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_type VARCHAR(50) NOT NULL, -- DAILY, WEEKLY, MONTHLY, CUSTOM, TUNING_SUMMARY
    title VARCHAR(255) NOT NULL,

    -- Report Period
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,

    -- Report Content
    summary JSONB, -- High-level summary statistics
    content JSONB, -- Detailed report content
    format VARCHAR(20) CHECK (format IN ('HTML', 'PDF', 'JSON', 'EXCEL')) DEFAULT 'HTML',

    -- Filters Applied
    oracle_connection_id UUID REFERENCES oracle_connections(id),
    filters JSONB DEFAULT '{}',

    -- Generation Info
    generated_by UUID REFERENCES auth.users(id),
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    generation_time_ms INTEGER,

    -- Distribution
    recipients JSONB DEFAULT '[]', -- Array of email addresses or user IDs
    sent_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for tuning_reports
CREATE INDEX idx_tuning_reports_type ON tuning_reports(report_type);
CREATE INDEX idx_tuning_reports_period ON tuning_reports(start_date, end_date);
CREATE INDEX idx_tuning_reports_generated ON tuning_reports(generated_at DESC);

-- =====================================================
-- Triggers for updated_at
-- =====================================================
CREATE TRIGGER update_sql_tuning_tasks_updated_at
    BEFORE UPDATE ON sql_tuning_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tuning_comments_updated_at
    BEFORE UPDATE ON tuning_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tuning_recommendations_updated_at
    BEFORE UPDATE ON tuning_recommendations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plan_baselines_updated_at
    BEFORE UPDATE ON plan_baselines
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================

-- Enable RLS
ALTER TABLE sql_tuning_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuning_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuning_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuning_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuning_reports ENABLE ROW LEVEL SECURITY;

-- Basic read policy for all authenticated users
CREATE POLICY "Users can view tuning tasks"
    ON sql_tuning_tasks FOR SELECT
    USING (true);

CREATE POLICY "Users can view tuning history"
    ON tuning_history FOR SELECT
    USING (true);

CREATE POLICY "Users can view comments"
    ON tuning_comments FOR SELECT
    USING (true);

CREATE POLICY "Tuners can create tasks"
    ON sql_tuning_tasks FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM user_profiles up
            JOIN user_roles ur ON up.role_id = ur.id
            WHERE up.id = auth.uid()
            AND (ur.name = 'admin' OR ur.name = 'tuner')
        )
    );

CREATE POLICY "Assigned users can update tasks"
    ON sql_tuning_tasks FOR UPDATE
    USING (
        assigned_to = auth.uid() OR
        created_by = auth.uid() OR
        EXISTS (
            SELECT 1 FROM user_profiles up
            JOIN user_roles ur ON up.role_id = ur.id
            WHERE up.id = auth.uid() AND ur.name = 'admin'
        )
    );

-- =====================================================
-- Functions for Tuning Workflow
-- =====================================================

-- Function to calculate improvement rate
CREATE OR REPLACE FUNCTION calculate_improvement_rate(
    p_before_value BIGINT,
    p_after_value BIGINT
) RETURNS NUMERIC(5, 2) AS $$
BEGIN
    IF p_before_value = 0 OR p_before_value IS NULL THEN
        RETURN 0;
    END IF;

    IF p_after_value IS NULL THEN
        RETURN 0;
    END IF;

    RETURN ROUND(((p_before_value - p_after_value)::NUMERIC / p_before_value::NUMERIC) * 100, 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to automatically create tuning history entry on status change
CREATE OR REPLACE FUNCTION log_tuning_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO tuning_history (
            tuning_task_id,
            oracle_connection_id,
            sql_id,
            activity_type,
            description,
            old_value,
            new_value,
            performed_by
        ) VALUES (
            NEW.id,
            NEW.oracle_connection_id,
            NEW.sql_id,
            'STATUS_CHANGE',
            'Status changed from ' || COALESCE(OLD.status, 'NULL') || ' to ' || NEW.status,
            jsonb_build_object('status', OLD.status),
            jsonb_build_object('status', NEW.status),
            auth.uid()
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply trigger
CREATE TRIGGER log_tuning_task_status_change
    AFTER UPDATE ON sql_tuning_tasks
    FOR EACH ROW
    EXECUTE FUNCTION log_tuning_status_change();

-- =====================================================
-- Comments
-- =====================================================
COMMENT ON TABLE sql_tuning_tasks IS 'SQL 튜닝 작업 관리';
COMMENT ON TABLE tuning_history IS '튜닝 작업 이력';
COMMENT ON TABLE tuning_comments IS '튜닝 작업 코멘트';
COMMENT ON TABLE tuning_recommendations IS 'AI/자동 튜닝 권장사항';
COMMENT ON TABLE plan_baselines IS 'SQL 실행계획 베이스라인';
COMMENT ON TABLE tuning_reports IS '튜닝 리포트';
