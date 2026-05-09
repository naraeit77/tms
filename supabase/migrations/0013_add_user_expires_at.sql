-- =====================================================
-- TMS v2.0 Migration: 사용기한(expires_at) 도입 (SaaS 요금제 1단계)
-- Description:
--   user_profiles.expires_at 컬럼 추가. NULL = 무제한.
--   기존 사용자는 NULL(무제한)로 두고, 신규 가입자만 가입 시점 + 30일 trial 부여.
--   로그인 시 expires_at <= now() 인 계정은 NextAuth authorize() 에서 차단.
-- =====================================================

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN user_profiles.expires_at IS
  '사용기한. NULL = 무제한. <= now() 이면 로그인 차단.';

-- 만료 임박/지난 계정 조회 효율
CREATE INDEX IF NOT EXISTS idx_user_profiles_expires_at
  ON user_profiles (expires_at)
  WHERE expires_at IS NOT NULL;
