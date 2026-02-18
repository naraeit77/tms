import { pool } from './index';

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Default user roles
    await client.query(`
      INSERT INTO user_roles (name, display_name, description, permissions)
      VALUES
        ('admin', '관리자', '시스템 전체 관리 권한', '{"manage_users": true, "manage_connections": true, "manage_settings": true, "view_all_data": true, "manage_tuning": true, "export_data": true}'),
        ('tuner', 'SQL 튜너', 'SQL 튜닝 및 분석 권한', '{"manage_connections": false, "manage_settings": false, "view_all_data": true, "manage_tuning": true, "export_data": true}'),
        ('viewer', '조회자', '읽기 전용 권한', '{"manage_connections": false, "manage_settings": false, "view_all_data": true, "manage_tuning": false, "export_data": false}')
      ON CONFLICT (name) DO NOTHING;
    `);

    // 2. Default system settings
    await client.query(`
      INSERT INTO system_settings (category, key, value, description)
      VALUES
        ('monitoring', 'collection_interval', '300', '성능 데이터 수집 주기 (초)'),
        ('monitoring', 'retention_days', '90', '성능 데이터 보관 기간 (일)'),
        ('monitoring', 'auto_collect_enabled', 'false', '자동 수집 활성화'),
        ('threshold', 'elapsed_time_critical', '10000', 'Elapsed Time Critical 임계값 (ms)'),
        ('threshold', 'elapsed_time_warning', '5000', 'Elapsed Time Warning 임계값 (ms)'),
        ('threshold', 'buffer_gets_critical', '1000000', 'Buffer Gets Critical 임계값'),
        ('threshold', 'buffer_gets_warning', '500000', 'Buffer Gets Warning 임계값'),
        ('alert', 'email_enabled', 'false', '이메일 알림 활성화'),
        ('alert', 'slack_enabled', 'false', 'Slack 알림 활성화')
      ON CONFLICT (category, key) DO NOTHING;
    `);

    // 3. Default report templates
    await client.query(`
      INSERT INTO report_templates (name, description, type, sections, default_config)
      VALUES
        ('performance_summary', '성능 요약 리포트', 'summary', ARRAY['overview', 'top_sql', 'wait_events', 'recommendations'], '{"period": "daily", "top_n": 10}'),
        ('detailed_analysis', '상세 분석 리포트', 'detailed', ARRAY['overview', 'sql_analysis', 'execution_plans', 'wait_events', 'session_analysis', 'recommendations'], '{"period": "weekly", "top_n": 20}'),
        ('trend_analysis', '트렌드 분석 리포트', 'trend', ARRAY['overview', 'performance_trends', 'workload_trends', 'capacity_planning'], '{"period": "monthly", "comparison_periods": 3}'),
        ('database_comparison', '데이터베이스 비교 리포트', 'comparison', ARRAY['overview', 'performance_comparison', 'workload_comparison', 'configuration_comparison'], '{"comparison_type": "database"}')
      ON CONFLICT (name) DO NOTHING;
    `);

    await client.query('COMMIT');
    console.log('Seed data inserted successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
