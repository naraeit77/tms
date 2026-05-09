-- =====================================================
-- TMS v2.0 Migration: 사용자 삭제 시 외래키 충돌 해소
-- Description:
--   users.id 를 참조하는 13개 FK 가 ON DELETE NO ACTION 이라
--   audit_log 한 건만 있어도 사용자 삭제가 차단됨.
--   협업/이력성 테이블은 SET NULL 로 (행은 보존, 작성자/담당자만 NULL),
--   개인 소유물(scheduler_jobs)은 CASCADE 로 변경.
-- =====================================================

-- ---------- audit_logs (감사 로그 — 보존 + 작성자 NULL) ----------
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_users_id_fk;
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_user_id_users_id_fk
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- ---------- plan_baselines ----------
ALTER TABLE plan_baselines DROP CONSTRAINT IF EXISTS plan_baselines_created_by_users_id_fk;
ALTER TABLE plan_baselines
  ADD CONSTRAINT plan_baselines_created_by_users_id_fk
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- ---------- sql_tuning_tasks (5개 컬럼) ----------
ALTER TABLE sql_tuning_tasks DROP CONSTRAINT IF EXISTS sql_tuning_tasks_created_by_users_id_fk;
ALTER TABLE sql_tuning_tasks
  ADD CONSTRAINT sql_tuning_tasks_created_by_users_id_fk
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE sql_tuning_tasks DROP CONSTRAINT IF EXISTS sql_tuning_tasks_approved_by_users_id_fk;
ALTER TABLE sql_tuning_tasks
  ADD CONSTRAINT sql_tuning_tasks_approved_by_users_id_fk
  FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE sql_tuning_tasks DROP CONSTRAINT IF EXISTS sql_tuning_tasks_assigned_to_users_id_fk;
ALTER TABLE sql_tuning_tasks
  ADD CONSTRAINT sql_tuning_tasks_assigned_to_users_id_fk
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE sql_tuning_tasks DROP CONSTRAINT IF EXISTS sql_tuning_tasks_assigned_by_users_id_fk;
ALTER TABLE sql_tuning_tasks
  ADD CONSTRAINT sql_tuning_tasks_assigned_by_users_id_fk
  FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE sql_tuning_tasks DROP CONSTRAINT IF EXISTS sql_tuning_tasks_reviewed_by_users_id_fk;
ALTER TABLE sql_tuning_tasks
  ADD CONSTRAINT sql_tuning_tasks_reviewed_by_users_id_fk
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

-- ---------- tuning_comments ----------
ALTER TABLE tuning_comments DROP CONSTRAINT IF EXISTS tuning_comments_author_id_users_id_fk;
ALTER TABLE tuning_comments
  ADD CONSTRAINT tuning_comments_author_id_users_id_fk
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE tuning_comments DROP CONSTRAINT IF EXISTS tuning_comments_resolved_by_users_id_fk;
ALTER TABLE tuning_comments
  ADD CONSTRAINT tuning_comments_resolved_by_users_id_fk
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL;

-- ---------- tuning_history ----------
ALTER TABLE tuning_history DROP CONSTRAINT IF EXISTS tuning_history_performed_by_users_id_fk;
ALTER TABLE tuning_history
  ADD CONSTRAINT tuning_history_performed_by_users_id_fk
  FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL;

-- ---------- tuning_recommendations ----------
ALTER TABLE tuning_recommendations DROP CONSTRAINT IF EXISTS tuning_recommendations_decision_by_users_id_fk;
ALTER TABLE tuning_recommendations
  ADD CONSTRAINT tuning_recommendations_decision_by_users_id_fk
  FOREIGN KEY (decision_by) REFERENCES users(id) ON DELETE SET NULL;

-- ---------- tuning_reports ----------
ALTER TABLE tuning_reports DROP CONSTRAINT IF EXISTS tuning_reports_generated_by_users_id_fk;
ALTER TABLE tuning_reports
  ADD CONSTRAINT tuning_reports_generated_by_users_id_fk
  FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL;

-- ---------- scheduler_jobs (개인 소유물 → CASCADE) ----------
ALTER TABLE scheduler_jobs DROP CONSTRAINT IF EXISTS scheduler_jobs_created_by_fkey;
ALTER TABLE scheduler_jobs
  ADD CONSTRAINT scheduler_jobs_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE;
