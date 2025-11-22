-- =====================================================
-- STATSPACK Tables
-- Standard Edition용 성능 모니터링 (AWR/ADDM/ASH 대체)
-- =====================================================

-- STATSPACK 스냅샷 테이블
CREATE TABLE IF NOT EXISTS statspack_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oracle_connection_id UUID NOT NULL REFERENCES oracle_connections(id) ON DELETE CASCADE,
  snap_id INTEGER NOT NULL,
  snap_time TIMESTAMP NOT NULL,
  startup_time TIMESTAMP NOT NULL,
  session_count INTEGER DEFAULT 0,
  transaction_count INTEGER DEFAULT 0,
  db_time_ms BIGINT DEFAULT 0,
  cpu_time_ms BIGINT DEFAULT 0,
  physical_reads BIGINT DEFAULT 0,
  logical_reads BIGINT DEFAULT 0,
  redo_size_mb NUMERIC(12, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (oracle_connection_id, snap_id)
);

-- STATSPACK 리포트 테이블
CREATE TABLE IF NOT EXISTS statspack_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oracle_connection_id UUID NOT NULL REFERENCES oracle_connections(id) ON DELETE CASCADE,
  begin_snap_id INTEGER NOT NULL,
  end_snap_id INTEGER NOT NULL,
  report_type VARCHAR(10) NOT NULL CHECK (report_type IN ('TEXT', 'HTML')),
  report_content TEXT NOT NULL,
  begin_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_statspack_snapshots_connection
  ON statspack_snapshots(oracle_connection_id);
CREATE INDEX IF NOT EXISTS idx_statspack_snapshots_snap_time
  ON statspack_snapshots(snap_time);
CREATE INDEX IF NOT EXISTS idx_statspack_reports_connection
  ON statspack_reports(oracle_connection_id);
CREATE INDEX IF NOT EXISTS idx_statspack_reports_snap_range
  ON statspack_reports(begin_snap_id, end_snap_id);

-- updated_at 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_statspack_snapshots_updated_at ON statspack_snapshots;
CREATE TRIGGER update_statspack_snapshots_updated_at
  BEFORE UPDATE ON statspack_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_statspack_reports_updated_at ON statspack_reports;
CREATE TRIGGER update_statspack_reports_updated_at
  BEFORE UPDATE ON statspack_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS (Row Level Security) 정책
ALTER TABLE statspack_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE statspack_reports ENABLE ROW LEVEL SECURITY;

-- 모든 인증된 사용자가 조회 가능
DROP POLICY IF EXISTS "Allow authenticated users to view statspack_snapshots" ON statspack_snapshots;
CREATE POLICY "Allow authenticated users to view statspack_snapshots"
  ON statspack_snapshots FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to view statspack_reports" ON statspack_reports;
CREATE POLICY "Allow authenticated users to view statspack_reports"
  ON statspack_reports FOR SELECT
  TO authenticated
  USING (true);

-- 모든 인증된 사용자가 생성 가능
DROP POLICY IF EXISTS "Allow authenticated users to insert statspack_snapshots" ON statspack_snapshots;
CREATE POLICY "Allow authenticated users to insert statspack_snapshots"
  ON statspack_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users to insert statspack_reports" ON statspack_reports;
CREATE POLICY "Allow authenticated users to insert statspack_reports"
  ON statspack_reports FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 모든 인증된 사용자가 삭제 가능
DROP POLICY IF EXISTS "Allow authenticated users to delete statspack_snapshots" ON statspack_snapshots;
CREATE POLICY "Allow authenticated users to delete statspack_snapshots"
  ON statspack_snapshots FOR DELETE
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow authenticated users to delete statspack_reports" ON statspack_reports;
CREATE POLICY "Allow authenticated users to delete statspack_reports"
  ON statspack_reports FOR DELETE
  TO authenticated
  USING (true);

-- 코멘트
COMMENT ON TABLE statspack_snapshots IS 'STATSPACK 성능 스냅샷 (Standard Edition용)';
COMMENT ON TABLE statspack_reports IS 'STATSPACK 성능 분석 리포트';

COMMENT ON COLUMN statspack_snapshots.snap_id IS '스냅샷 ID (연결별 순차번호)';
COMMENT ON COLUMN statspack_snapshots.snap_time IS '스냅샷 수집 시간';
COMMENT ON COLUMN statspack_snapshots.startup_time IS '인스턴스 시작 시간';
COMMENT ON COLUMN statspack_snapshots.session_count IS '세션 수';
COMMENT ON COLUMN statspack_snapshots.transaction_count IS '트랜잭션 수';
COMMENT ON COLUMN statspack_snapshots.db_time_ms IS 'DB Time (밀리초)';
COMMENT ON COLUMN statspack_snapshots.cpu_time_ms IS 'CPU Time (밀리초)';
COMMENT ON COLUMN statspack_snapshots.physical_reads IS 'Physical Reads';
COMMENT ON COLUMN statspack_snapshots.logical_reads IS 'Logical Reads (Buffer Gets)';
COMMENT ON COLUMN statspack_snapshots.redo_size_mb IS 'Redo 생성량 (MB)';

COMMENT ON COLUMN statspack_reports.begin_snap_id IS '시작 스냅샷 ID';
COMMENT ON COLUMN statspack_reports.end_snap_id IS '종료 스냅샷 ID';
COMMENT ON COLUMN statspack_reports.report_type IS '리포트 형식 (TEXT/HTML)';
COMMENT ON COLUMN statspack_reports.report_content IS '리포트 내용';
COMMENT ON COLUMN statspack_reports.begin_time IS '분석 시작 시간';
COMMENT ON COLUMN statspack_reports.end_time IS '분석 종료 시간';
