-- AWR/ADDM 리포트 저장 테이블
CREATE TABLE IF NOT EXISTS awr_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES oracle_connections(id) ON DELETE CASCADE,
  report_type VARCHAR(10) NOT NULL CHECK (report_type IN ('AWR', 'ADDM')),
  begin_snap_id INTEGER NOT NULL,
  end_snap_id INTEGER NOT NULL,
  report_name VARCHAR(500) NOT NULL,
  file_size INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('GENERATING', 'COMPLETED', 'FAILED')),
  error_message TEXT,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_awr_reports_user_id ON awr_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_awr_reports_connection_id ON awr_reports(connection_id);
CREATE INDEX IF NOT EXISTS idx_awr_reports_generated_at ON awr_reports(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_awr_reports_status ON awr_reports(status);

-- RLS (Row Level Security) 활성화
ALTER TABLE awr_reports ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 사용자는 자신의 리포트만 조회 가능
DROP POLICY IF EXISTS "Users can view own reports" ON awr_reports;
CREATE POLICY "Users can view own reports"
  ON awr_reports FOR SELECT
  USING (auth.uid() = user_id);

-- RLS 정책: 사용자는 자신의 리포트만 생성 가능
DROP POLICY IF EXISTS "Users can create own reports" ON awr_reports;
CREATE POLICY "Users can create own reports"
  ON awr_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS 정책: 사용자는 자신의 리포트만 삭제 가능
DROP POLICY IF EXISTS "Users can delete own reports" ON awr_reports;
CREATE POLICY "Users can delete own reports"
  ON awr_reports FOR DELETE
  USING (auth.uid() = user_id);

-- updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_awr_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_awr_reports_updated_at ON awr_reports;
CREATE TRIGGER update_awr_reports_updated_at
  BEFORE UPDATE ON awr_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_awr_reports_updated_at();

-- 코멘트 추가
COMMENT ON TABLE awr_reports IS 'AWR/ADDM 리포트 메타데이터 저장';
COMMENT ON COLUMN awr_reports.report_type IS '리포트 타입 (AWR/ADDM)';
COMMENT ON COLUMN awr_reports.begin_snap_id IS 'AWR 시작 스냅샷 ID';
COMMENT ON COLUMN awr_reports.end_snap_id IS 'AWR 종료 스냅샷 ID';
COMMENT ON COLUMN awr_reports.report_name IS '생성된 리포트 파일명';
COMMENT ON COLUMN awr_reports.file_size IS '리포트 파일 크기 (bytes)';
COMMENT ON COLUMN awr_reports.status IS '리포트 생성 상태';
