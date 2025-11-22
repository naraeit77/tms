-- =====================================================
-- TMS v2.0 Core Tables Migration
-- Description: 핵심 테이블 생성 (Oracle DB 연결, 사용자, 역할)
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. Oracle Database Connections (오라클 DB 연결 정보)
-- =====================================================
CREATE TABLE IF NOT EXISTS oracle_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    host VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL DEFAULT 1521,
    service_name VARCHAR(100),
    sid VARCHAR(100),
    username VARCHAR(100) NOT NULL,
    password_encrypted TEXT NOT NULL, -- AES-256 encrypted
    connection_type VARCHAR(20) NOT NULL CHECK (connection_type IN ('SERVICE_NAME', 'SID')),
    oracle_version VARCHAR(20), -- 11g, 12c, 19c, 21c
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    max_connections INTEGER DEFAULT 10,
    connection_timeout INTEGER DEFAULT 30000, -- milliseconds
    last_connected_at TIMESTAMPTZ,
    last_health_check_at TIMESTAMPTZ,
    health_status VARCHAR(20) CHECK (health_status IN ('HEALTHY', 'WARNING', 'ERROR', 'UNKNOWN')),
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for oracle_connections
CREATE INDEX idx_oracle_connections_active ON oracle_connections(is_active);
CREATE INDEX idx_oracle_connections_default ON oracle_connections(is_default);

-- =====================================================
-- 2. User Roles (사용자 역할)
-- =====================================================
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '{}', -- { "sql_monitoring": ["read"], "tuning": ["read", "write"], ... }
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default roles
INSERT INTO user_roles (name, display_name, description, permissions) VALUES
('admin', 'Administrator', '전체 권한', '{"sql_monitoring": ["read", "write", "delete"], "tuning": ["read", "write", "delete", "approve"], "settings": ["read", "write", "delete"], "users": ["read", "write", "delete"]}'),
('tuner', 'SQL Tuner', '튜닝 작업 권한', '{"sql_monitoring": ["read", "write"], "tuning": ["read", "write"], "settings": ["read"]}'),
('viewer', 'Viewer', '조회 권한', '{"sql_monitoring": ["read"], "tuning": ["read"], "settings": ["read"]}')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- 3. User Profiles (사용자 프로필)
-- =====================================================
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES user_roles(id),
    full_name VARCHAR(100),
    email VARCHAR(255) NOT NULL UNIQUE,
    department VARCHAR(100),
    phone VARCHAR(20),
    avatar_url TEXT,
    preferences JSONB DEFAULT '{}', -- 사용자 설정 (테마, 언어 등)
    last_login_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for user_profiles
CREATE INDEX idx_user_profiles_email ON user_profiles(email);
CREATE INDEX idx_user_profiles_role ON user_profiles(role_id);

-- =====================================================
-- 4. System Settings (시스템 설정)
-- =====================================================
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category VARCHAR(50) NOT NULL, -- monitoring, alert, performance, etc.
    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(category, key)
);

-- Insert default system settings
INSERT INTO system_settings (category, key, value, description) VALUES
('monitoring', 'collection_interval', '{"value": 300, "unit": "seconds"}', 'SQL 수집 주기'),
('monitoring', 'retention_days', '{"value": 90}', '데이터 보관 기간'),
('monitoring', 'auto_collect_enabled', '{"value": true}', '자동 수집 활성화'),
('threshold', 'elapsed_time_critical', '{"value": 10000, "unit": "ms"}', 'Critical Elapsed Time 임계값'),
('threshold', 'elapsed_time_warning', '{"value": 5000, "unit": "ms"}', 'Warning Elapsed Time 임계값'),
('threshold', 'buffer_gets_critical', '{"value": 1000000}', 'Critical Buffer Gets 임계값'),
('threshold', 'buffer_gets_warning', '{"value": 500000}', 'Warning Buffer Gets 임계값'),
('alert', 'email_enabled', '{"value": false}', '이메일 알림 활성화'),
('alert', 'slack_enabled', '{"value": false}', 'Slack 알림 활성화')
ON CONFLICT (category, key) DO NOTHING;

-- =====================================================
-- 5. Audit Logs (감사 로그)
-- =====================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    action VARCHAR(50) NOT NULL, -- CREATE, UPDATE, DELETE, LOGIN, etc.
    resource_type VARCHAR(50), -- oracle_connection, sql_tuning, etc.
    resource_id UUID,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for audit_logs
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- =====================================================
-- Triggers for updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER update_oracle_connections_updated_at
    BEFORE UPDATE ON oracle_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_roles_updated_at
    BEFORE UPDATE ON user_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_settings_updated_at
    BEFORE UPDATE ON system_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================

-- Enable RLS
ALTER TABLE oracle_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policies for oracle_connections
CREATE POLICY "Users can view active connections"
    ON oracle_connections FOR SELECT
    USING (is_active = true);

CREATE POLICY "Admins can manage connections"
    ON oracle_connections FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            JOIN user_roles ur ON up.role_id = ur.id
            WHERE up.id = auth.uid() AND ur.name = 'admin'
        )
    );

-- Policies for user_profiles
CREATE POLICY "Users can view own profile"
    ON user_profiles FOR SELECT
    USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
    ON user_profiles FOR UPDATE
    USING (id = auth.uid());

CREATE POLICY "Admins can view all profiles"
    ON user_profiles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            JOIN user_roles ur ON up.role_id = ur.id
            WHERE up.id = auth.uid() AND ur.name = 'admin'
        )
    );

-- Policies for audit_logs
CREATE POLICY "Users can view own audit logs"
    ON audit_logs FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Admins can view all audit logs"
    ON audit_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            JOIN user_roles ur ON up.role_id = ur.id
            WHERE up.id = auth.uid() AND ur.name = 'admin'
        )
    );

-- =====================================================
-- Comments
-- =====================================================
COMMENT ON TABLE oracle_connections IS 'Oracle 데이터베이스 연결 정보';
COMMENT ON TABLE user_roles IS '사용자 역할 정의';
COMMENT ON TABLE user_profiles IS '사용자 프로필 정보';
COMMENT ON TABLE system_settings IS '시스템 설정';
COMMENT ON TABLE audit_logs IS '감사 로그';
