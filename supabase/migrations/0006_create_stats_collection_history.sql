-- Migration: Create stats_collection_history table
-- Description: 통계 수집 이력 관리 테이블 생성
-- DBMS_STATS 패키지를 이용한 통계 수집 작업 이력을 저장

-- Create stats_collection_history table
CREATE TABLE IF NOT EXISTS stats_collection_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oracle_connection_id UUID NOT NULL REFERENCES oracle_connections(id) ON DELETE CASCADE,
  owner VARCHAR(128) NOT NULL,
  table_name VARCHAR(128) NOT NULL,
  operation VARCHAR(50) NOT NULL DEFAULT 'GATHER_TABLE_STATS',
  status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'SUCCESS', 'FAILED')),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_seconds INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_stats_history_connection ON stats_collection_history(oracle_connection_id);
CREATE INDEX IF NOT EXISTS idx_stats_history_status ON stats_collection_history(status);
CREATE INDEX IF NOT EXISTS idx_stats_history_created_at ON stats_collection_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stats_history_owner_table ON stats_collection_history(owner, table_name);

-- Add comment to table
COMMENT ON TABLE stats_collection_history IS 'DBMS_STATS 통계 수집 작업 이력';

-- Add comments to columns
COMMENT ON COLUMN stats_collection_history.id IS '이력 고유 ID';
COMMENT ON COLUMN stats_collection_history.oracle_connection_id IS 'Oracle 연결 ID';
COMMENT ON COLUMN stats_collection_history.owner IS '스키마 소유자';
COMMENT ON COLUMN stats_collection_history.table_name IS '테이블명';
COMMENT ON COLUMN stats_collection_history.operation IS '수행된 작업 (GATHER_TABLE_STATS 등)';
COMMENT ON COLUMN stats_collection_history.status IS '작업 상태 (IN_PROGRESS, SUCCESS, FAILED)';
COMMENT ON COLUMN stats_collection_history.start_time IS '작업 시작 시간';
COMMENT ON COLUMN stats_collection_history.end_time IS '작업 완료 시간';
COMMENT ON COLUMN stats_collection_history.duration_seconds IS '작업 소요 시간(초)';
COMMENT ON COLUMN stats_collection_history.error_message IS '에러 발생 시 에러 메시지';
COMMENT ON COLUMN stats_collection_history.created_at IS '레코드 생성 시간';
COMMENT ON COLUMN stats_collection_history.updated_at IS '레코드 수정 시간';

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_stats_collection_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_stats_collection_history_updated_at
  BEFORE UPDATE ON stats_collection_history
  FOR EACH ROW
  EXECUTE FUNCTION update_stats_collection_history_updated_at();

-- Enable Row Level Security (RLS)
ALTER TABLE stats_collection_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can only see their own stats collection history through oracle_connections
CREATE POLICY stats_collection_history_select_policy ON stats_collection_history
  FOR SELECT
  USING (
    oracle_connection_id IN (
      SELECT id FROM oracle_connections WHERE created_by = auth.uid()
    )
  );

CREATE POLICY stats_collection_history_insert_policy ON stats_collection_history
  FOR INSERT
  WITH CHECK (
    oracle_connection_id IN (
      SELECT id FROM oracle_connections WHERE created_by = auth.uid()
    )
  );

CREATE POLICY stats_collection_history_update_policy ON stats_collection_history
  FOR UPDATE
  USING (
    oracle_connection_id IN (
      SELECT id FROM oracle_connections WHERE created_by = auth.uid()
    )
  );

CREATE POLICY stats_collection_history_delete_policy ON stats_collection_history
  FOR DELETE
  USING (
    oracle_connection_id IN (
      SELECT id FROM oracle_connections WHERE created_by = auth.uid()
    )
  );
