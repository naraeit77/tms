-- Create reports-related tables
-- Migration: 0007_create_reports_tables.sql
-- Description: Creates tables for report generation, scheduling, and activity tracking

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create report templates table
CREATE TABLE IF NOT EXISTS public.report_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  type VARCHAR(50) NOT NULL CHECK (type IN ('summary', 'detailed', 'trend', 'comparison')),
  sections TEXT[] NOT NULL DEFAULT '{}',
  default_config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.report_templates IS '보고서 템플릿';
COMMENT ON COLUMN public.report_templates.type IS '보고서 유형 (summary, detailed, trend, comparison)';
COMMENT ON COLUMN public.report_templates.sections IS '보고서에 포함될 섹션 목록';
COMMENT ON COLUMN public.report_templates.default_config IS '기본 설정 (JSON)';

-- Create reports metadata table
CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id VARCHAR(100),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL CHECK (type IN ('summary', 'detailed', 'trend', 'comparison')),
  config JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'completed', 'failed', 'scheduled')),
  file_path TEXT,
  file_size BIGINT,
  generated_at TIMESTAMPTZ,
  error_message TEXT,
  tags TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.reports IS '보고서 메타데이터';
COMMENT ON COLUMN public.reports.config IS '보고서 생성 설정 (period, databases, filters 등)';
COMMENT ON COLUMN public.reports.status IS '보고서 상태 (draft, generating, completed, failed, scheduled)';
COMMENT ON COLUMN public.reports.file_path IS '생성된 보고서 파일 경로';

-- Create report schedules table
CREATE TABLE IF NOT EXISTS public.report_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  frequency VARCHAR(50) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
  day_of_month INTEGER CHECK (day_of_month BETWEEN 1 AND 31),
  time VARCHAR(10) NOT NULL,
  timezone VARCHAR(100) NOT NULL DEFAULT 'Asia/Seoul',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.report_schedules IS '보고서 예약 일정';
COMMENT ON COLUMN public.report_schedules.frequency IS '주기 (daily, weekly, monthly)';
COMMENT ON COLUMN public.report_schedules.day_of_week IS '주간 스케줄의 요일 (0=일요일, 6=토요일)';
COMMENT ON COLUMN public.report_schedules.day_of_month IS '월간 스케줄의 날짜 (1-31)';

-- Create report activities table
CREATE TABLE IF NOT EXISTS public.report_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL CHECK (action IN ('generated', 'downloaded', 'shared', 'deleted', 'scheduled', 'viewed')),
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.report_activities IS '보고서 활동 이력';
COMMENT ON COLUMN public.report_activities.action IS '수행된 작업 (generated, downloaded, shared, deleted, scheduled, viewed)';

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_reports_user_id ON public.reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_type ON public.reports(type);
CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON public.reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_tags ON public.reports USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_report_schedules_user_id ON public.report_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_report_schedules_next_run_at ON public.report_schedules(next_run_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_report_activities_report_id ON public.report_activities(report_id);
CREATE INDEX IF NOT EXISTS idx_report_activities_user_id ON public.report_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_report_activities_created_at ON public.report_activities(created_at DESC);

-- Create trigger function for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at columns
CREATE TRIGGER update_report_templates_updated_at
    BEFORE UPDATE ON public.report_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reports_updated_at
    BEFORE UPDATE ON public.reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_report_schedules_updated_at
    BEFORE UPDATE ON public.report_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_activities ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for report_templates (public read, admin write)
CREATE POLICY "Report templates are viewable by all authenticated users"
  ON public.report_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Report templates are editable by admins only"
  ON public.report_templates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role_id IN (
        SELECT id FROM public.user_roles WHERE name = 'admin'
      )
    )
  );

-- Create RLS policies for reports
CREATE POLICY "Users can view their own reports"
  ON public.reports FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own reports"
  ON public.reports FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own reports"
  ON public.reports FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own reports"
  ON public.reports FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Create RLS policies for report_schedules
CREATE POLICY "Users can view their own report schedules"
  ON public.report_schedules FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own report schedules"
  ON public.report_schedules FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own report schedules"
  ON public.report_schedules FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own report schedules"
  ON public.report_schedules FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Create RLS policies for report_activities
CREATE POLICY "Users can view their own report activities"
  ON public.report_activities FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own report activities"
  ON public.report_activities FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Insert default report templates
INSERT INTO public.report_templates (name, description, type, sections, default_config)
VALUES
  ('performance_summary', '성능 요약 보고서 템플릿', 'summary',
   ARRAY['executive_summary', 'top_sqls', 'performance_metrics', 'recommendations'],
   '{"period": "7d", "include_charts": true, "include_recommendations": true}'::jsonb),
  ('detailed_analysis', '상세 SQL 분석 보고서 템플릿', 'detailed',
   ARRAY['sql_details', 'execution_plans', 'wait_events', 'bind_variables', 'tuning_suggestions'],
   '{"period": "24h", "include_raw_data": true, "include_charts": true}'::jsonb),
  ('trend_analysis', '성능 트렌드 분석 보고서 템플릿', 'trend',
   ARRAY['trend_overview', 'time_series_charts', 'comparative_analysis', 'pattern_detection'],
   '{"period": "30d", "include_charts": true, "include_recommendations": false}'::jsonb),
  ('database_comparison', 'DB 간 성능 비교 보고서 템플릿', 'comparison',
   ARRAY['comparison_summary', 'side_by_side_metrics', 'performance_gaps', 'best_practices'],
   '{"period": "7d", "include_charts": true, "include_recommendations": true}'::jsonb)
ON CONFLICT (name) DO NOTHING;
