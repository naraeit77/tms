-- ============================================================
-- TMS (SQL Tuning Management System) PostgreSQL 17 초기 설정
-- 주식회사 나래정보기술
-- ============================================================
-- 실행 순서:
-- 1. PostgreSQL superuser(postgres)로 이 스크립트 실행
-- 2. npm run db:generate (Drizzle 마이그레이션 생성)
-- 3. npm run db:migrate (마이그레이션 적용)
-- 4. npm run db:seed (초기 데이터 생성)
-- ============================================================

-- Step 1: 데이터베이스 생성 (존재하지 않을 경우)
-- ============================================================
-- 주의: 이 명령은 psql에서 직접 실행해야 합니다
-- CREATE DATABASE는 트랜잭션 블록 내에서 실행할 수 없습니다

-- 데이터베이스가 이미 존재하는지 확인 후 생성
SELECT 'CREATE DATABASE tms ENCODING ''UTF8'' LC_COLLATE ''en_US.UTF-8'' LC_CTYPE ''en_US.UTF-8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tms');

-- Step 2: 애플리케이션 사용자 생성
-- ============================================================
DO $$
BEGIN
    -- tms_app 사용자가 존재하지 않으면 생성
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tms_app') THEN
        CREATE ROLE tms_app WITH LOGIN PASSWORD 'song7409';
        RAISE NOTICE 'User tms_app created successfully';
    ELSE
        RAISE NOTICE 'User tms_app already exists';
    END IF;
END
$$;

-- Step 3: 사용자 속성 설정
-- ============================================================
ALTER ROLE tms_app WITH
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    INHERIT
    NOREPLICATION
    CONNECTION LIMIT -1;

-- 비밀번호 설정 (이미 존재하는 경우에도 업데이트)
ALTER ROLE tms_app WITH PASSWORD 'song7409';

-- Step 4: 데이터베이스 연결 권한 부여
-- ============================================================
-- tms 데이터베이스에 연결 권한 부여
GRANT CONNECT ON DATABASE tms TO tms_app;

-- Step 5: tms 데이터베이스로 전환 후 실행할 내용
-- ============================================================
-- 아래 내용은 tms 데이터베이스에 연결한 후 실행해야 합니다

-- \c tms

-- public 스키마에 대한 권한 부여
-- GRANT USAGE ON SCHEMA public TO tms_app;
-- GRANT CREATE ON SCHEMA public TO tms_app;

-- 모든 테이블에 대한 권한 부여
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO tms_app;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO tms_app;
-- GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO tms_app;

-- 향후 생성될 객체에 대한 기본 권한 설정
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO tms_app;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO tms_app;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO tms_app;

-- ============================================================
-- 참고: updated_at 자동 업데이트를 위한 트리거 함수
-- Drizzle ORM이 마이그레이션 시 자동 생성하므로 필요 없을 수 있음
-- ============================================================
-- CREATE OR REPLACE FUNCTION update_updated_at_column()
-- RETURNS TRIGGER AS $$
-- BEGIN
--     NEW.updated_at = CURRENT_TIMESTAMP;
--     RETURN NEW;
-- END;
-- $$ language 'plpgsql';

-- ============================================================
-- 완료 메시지
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TMS PostgreSQL 초기 설정 완료';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Database: tms';
    RAISE NOTICE 'User: tms_app';
    RAISE NOTICE 'Password: song7409 (env 파일에서 관리)';
    RAISE NOTICE '========================================';
    RAISE NOTICE '다음 단계:';
    RAISE NOTICE '1. psql -U postgres -d tms 로 tms DB 연결';
    RAISE NOTICE '2. scripts/setup-postgresql-tms.sql 실행';
    RAISE NOTICE '3. npm run db:generate';
    RAISE NOTICE '4. npm run db:migrate';
    RAISE NOTICE '5. npm run db:seed';
    RAISE NOTICE '========================================';
END
$$;
