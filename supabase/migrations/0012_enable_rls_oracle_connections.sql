-- =====================================================
-- TMS v2.0 Migration: Per-user RLS on oracle_connections (SaaS multi-tenancy 1단계)
-- Description:
--   사용자별로 자신이 만든 Oracle 연결만 보고/수정/삭제 가능하도록
--   PostgreSQL Row-Level Security 정책 적용.
--   세션 변수 app.user_id 를 SET LOCAL 로 주입한 트랜잭션에서만
--   created_by 가 일치하는 행이 노출됨.
-- Notes:
--   - 1단계 범위: oracle_connections, scheduler_jobs
--   - tuning_*, reports, monitoring_* 등 자식 테이블은 부모 ID 격리로 간접 보호
--     (다음 단계에서 RLS 명시적 적용 예정)
--   - app.user_id 미설정 시 모든 행 deny → 백그라운드 작업은
--     별도의 SECURITY DEFINER 함수 또는 BYPASSRLS 역할로 우회 필요
-- =====================================================

-- ---------- oracle_connections ----------

-- 1) 기존 NULL/orphan 행을 첫 admin user 에 백필
UPDATE oracle_connections oc
SET created_by = (
  SELECT up.id
  FROM user_profiles up
  LEFT JOIN user_roles ur ON ur.id = up.role_id
  WHERE up.is_active = true
  ORDER BY (CASE WHEN ur.name IN ('admin', 'owner', 'super_admin') THEN 0 ELSE 1 END), up.created_at ASC
  LIMIT 1
)
WHERE oc.created_by IS NULL;

-- 백필 후에도 NULL 이 남았다면 사용자가 없는 환경 → 행을 삭제 (orphan)
DELETE FROM oracle_connections WHERE created_by IS NULL;

-- 2) created_by NOT NULL 강제
ALTER TABLE oracle_connections
  ALTER COLUMN created_by SET NOT NULL;

-- 3) 글로벌 unique(name) → (created_by, name) 복합 unique
--    (사용자가 다르면 동일한 name 사용 가능)
ALTER TABLE oracle_connections
  DROP CONSTRAINT IF EXISTS oracle_connections_name_key;
ALTER TABLE oracle_connections
  ADD CONSTRAINT uq_oracle_connections_user_name UNIQUE (created_by, name);

-- 4) created_by 인덱스 (RLS USING 절 성능)
CREATE INDEX IF NOT EXISTS idx_oracle_connections_created_by
  ON oracle_connections (created_by);

-- 5) RLS 활성화
ALTER TABLE oracle_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE oracle_connections FORCE ROW LEVEL SECURITY;
-- FORCE: 테이블 owner 도 정책 적용받음. tms_app 이 owner 일 때 안전.

-- 6) 정책: 본인 행만 SELECT/INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS oracle_connections_owner_select ON oracle_connections;
CREATE POLICY oracle_connections_owner_select ON oracle_connections
  FOR SELECT
  USING (created_by = NULLIF(current_setting('app.user_id', true), '')::uuid);

DROP POLICY IF EXISTS oracle_connections_owner_insert ON oracle_connections;
CREATE POLICY oracle_connections_owner_insert ON oracle_connections
  FOR INSERT
  WITH CHECK (created_by = NULLIF(current_setting('app.user_id', true), '')::uuid);

DROP POLICY IF EXISTS oracle_connections_owner_update ON oracle_connections;
CREATE POLICY oracle_connections_owner_update ON oracle_connections
  FOR UPDATE
  USING (created_by = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (created_by = NULLIF(current_setting('app.user_id', true), '')::uuid);

DROP POLICY IF EXISTS oracle_connections_owner_delete ON oracle_connections;
CREATE POLICY oracle_connections_owner_delete ON oracle_connections
  FOR DELETE
  USING (created_by = NULLIF(current_setting('app.user_id', true), '')::uuid);

-- ---------- scheduler_jobs ----------

UPDATE scheduler_jobs sj
SET created_by = (
  SELECT up.id
  FROM user_profiles up
  LEFT JOIN user_roles ur ON ur.id = up.role_id
  WHERE up.is_active = true
  ORDER BY (CASE WHEN ur.name IN ('admin', 'owner', 'super_admin') THEN 0 ELSE 1 END), up.created_at ASC
  LIMIT 1
)
WHERE sj.created_by IS NULL;

DELETE FROM scheduler_jobs WHERE created_by IS NULL;

ALTER TABLE scheduler_jobs
  ALTER COLUMN created_by SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scheduler_jobs_created_by
  ON scheduler_jobs (created_by);

ALTER TABLE scheduler_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduler_jobs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scheduler_jobs_owner_select ON scheduler_jobs;
CREATE POLICY scheduler_jobs_owner_select ON scheduler_jobs
  FOR SELECT
  USING (created_by = NULLIF(current_setting('app.user_id', true), '')::uuid);

DROP POLICY IF EXISTS scheduler_jobs_owner_insert ON scheduler_jobs;
CREATE POLICY scheduler_jobs_owner_insert ON scheduler_jobs
  FOR INSERT
  WITH CHECK (created_by = NULLIF(current_setting('app.user_id', true), '')::uuid);

DROP POLICY IF EXISTS scheduler_jobs_owner_update ON scheduler_jobs;
CREATE POLICY scheduler_jobs_owner_update ON scheduler_jobs
  FOR UPDATE
  USING (created_by = NULLIF(current_setting('app.user_id', true), '')::uuid)
  WITH CHECK (created_by = NULLIF(current_setting('app.user_id', true), '')::uuid);

DROP POLICY IF EXISTS scheduler_jobs_owner_delete ON scheduler_jobs;
CREATE POLICY scheduler_jobs_owner_delete ON scheduler_jobs
  FOR DELETE
  USING (created_by = NULLIF(current_setting('app.user_id', true), '')::uuid);

COMMENT ON POLICY oracle_connections_owner_select ON oracle_connections IS
  'SET LOCAL app.user_id = ''<uuid>'' 를 발급한 트랜잭션에서만 본인 행 노출';
