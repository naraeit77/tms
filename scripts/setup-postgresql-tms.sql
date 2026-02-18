-- ============================================================
-- TMS 데이터베이스 스키마 권한 설정
-- tms 데이터베이스에 연결한 후 실행
-- ============================================================
-- 실행 방법:
-- psql -U postgres -d tms -f scripts/setup-postgresql-tms.sql
-- ============================================================

-- Step 1: public 스키마에 대한 권한 부여
-- ============================================================
GRANT USAGE ON SCHEMA public TO tms_app;
GRANT CREATE ON SCHEMA public TO tms_app;

-- Step 2: 기존 테이블에 대한 권한 부여
-- ============================================================
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO tms_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO tms_app;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO tms_app;

-- Step 3: 향후 생성될 객체에 대한 기본 권한 설정
-- ============================================================
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO tms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO tms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO tms_app;

-- Step 4: uuid-ossp 확장 설치 (UUID 생성 지원)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Step 5: pgcrypto 확장 설치 (gen_random_uuid 지원 - PostgreSQL 13+)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Step 6: 인덱스 성능을 위한 pg_trgm 확장 설치
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Step 7: updated_at 자동 업데이트 트리거 함수 생성
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 8: 연결 테스트용 쿼리
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TMS 데이터베이스 스키마 설정 완료';
    RAISE NOTICE '========================================';
    RAISE NOTICE '설치된 확장:';
    RAISE NOTICE '  - uuid-ossp (UUID 생성)';
    RAISE NOTICE '  - pgcrypto (암호화 함수)';
    RAISE NOTICE '  - pg_trgm (텍스트 검색 인덱스)';
    RAISE NOTICE '========================================';
    RAISE NOTICE '다음 단계:';
    RAISE NOTICE '  npm run db:generate';
    RAISE NOTICE '  npm run db:migrate';
    RAISE NOTICE '  npm run db:seed';
    RAISE NOTICE '========================================';
END
$$;

-- 설치된 확장 확인
SELECT extname, extversion FROM pg_extension WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pg_trgm');
