// TMS v2.0 - Supabase Database Types
// Auto-generated types for type-safe database operations

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Enums
export type ConnectionType = 'SERVICE_NAME' | 'SID'
export type HealthStatus = 'HEALTHY' | 'WARNING' | 'ERROR' | 'UNKNOWN'
export type UserRole = 'admin' | 'tuner' | 'viewer'
export type SQLStatus = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'TUNING'
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type TuningTaskStatus = 'IDENTIFIED' | 'ASSIGNED' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED' | 'CANCELLED'
export type TuningMethod = 'INDEX' | 'SQL_REWRITE' | 'STATISTICS' | 'PARTITIONING' | 'HINT' | 'OTHER'
export type RecommendationType = 'INDEX' | 'REWRITE' | 'STATISTICS' | 'HINT' | 'PARTITION' | 'MATERIALIZED_VIEW'
export type RecommendationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'IMPLEMENTED'

// Database Tables

export interface OracleConnection {
  id: string
  name: string
  description?: string
  host: string
  port: number
  service_name?: string
  sid?: string
  username: string
  password_encrypted: string
  connection_type: ConnectionType
  oracle_version?: string
  is_active: boolean
  is_default: boolean
  max_connections: number
  connection_timeout: number
  last_connected_at?: string
  last_health_check_at?: string
  health_status?: HealthStatus
  metadata: Json
  created_by?: string
  created_at: string
  updated_at: string
}

export interface UserRoleRecord {
  id: string
  name: string
  display_name: string
  description?: string
  permissions: Json
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UserProfile {
  id: string // References auth.users.id
  role_id?: string
  full_name?: string
  email: string
  department?: string
  phone?: string
  avatar_url?: string
  preferences: Json
  last_login_at?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SystemSetting {
  id: string
  category: string
  key: string
  value: Json
  description?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  user_id?: string
  action: string
  resource_type?: string
  resource_id?: string
  details?: Json
  ip_address?: string
  user_agent?: string
  created_at: string
}

export interface SQLStatistics {
  id: string
  oracle_connection_id: string
  sql_id: string
  plan_hash_value?: number
  module?: string
  schema_name?: string
  sql_text: string
  sql_fulltext?: string

  // Performance Metrics
  elapsed_time_ms: number
  cpu_time_ms: number
  buffer_gets: number
  disk_reads: number
  direct_writes: number
  executions: number
  parse_calls: number
  rows_processed: number

  // Calculated Metrics
  avg_elapsed_time_ms?: number
  avg_cpu_time_ms?: number
  gets_per_exec?: number
  rows_per_exec?: number

  // Wait Information
  application_wait_time_ms: number
  concurrency_wait_time_ms: number
  cluster_wait_time_ms: number
  user_io_wait_time_ms: number

  // Timestamps
  first_load_time?: string
  last_active_time?: string
  last_load_time?: string
  collected_at: string
  snapshot_id?: number

  // Status
  status: SQLStatus
  priority: Priority

  metadata: Json
  created_at: string
  updated_at: string
}

export interface SQLExecutionHistory {
  id: string
  sql_statistics_id?: string
  oracle_connection_id: string
  sql_id: string

  execution_time: string
  elapsed_time_ms?: number
  cpu_time_ms?: number
  buffer_gets?: number
  disk_reads?: number
  rows_processed?: number

  sid?: number
  serial_number?: number
  username?: string
  program?: string
  plan_hash_value?: number

  created_at: string
}

export interface WaitEvent {
  id: string
  oracle_connection_id: string
  event_name: string
  wait_class?: string

  total_waits: number
  total_timeouts: number
  time_waited_ms: number
  average_wait_ms?: number
  pct_db_time?: number

  collected_at: string
  snapshot_id?: number

  created_at: string
  updated_at: string
}

export interface SessionMonitoring {
  id: string
  oracle_connection_id: string

  sid: number
  serial_number: number
  username?: string
  osuser?: string
  machine?: string
  program?: string
  module?: string

  status?: string
  state?: string

  sql_id?: string
  sql_text?: string
  event?: string
  wait_class?: string
  wait_time_ms?: number

  logical_reads?: number
  physical_reads?: number
  cpu_time_ms?: number

  logon_time?: string
  last_call_et?: number

  blocking_session?: number
  blocking_session_status?: string

  collected_at: string
  created_at: string
}

export interface ExecutionPlan {
  id: string
  oracle_connection_id: string
  sql_id: string
  plan_hash_value: number

  plan_table: Json
  plan_text?: string

  optimizer?: string
  cost?: number
  cardinality?: number
  bytes?: number

  timestamp?: string
  first_load_time?: string

  executions: number
  avg_elapsed_time_ms?: number

  created_at: string
  updated_at: string
}

export interface SQLBindVariable {
  id: string
  oracle_connection_id: string
  sql_id: string

  position: number
  name?: string
  datatype?: string
  value_string?: string

  captured_at: string
  created_at: string
}

export interface SQLTuningTask {
  id: string
  oracle_connection_id: string
  sql_statistics_id?: string
  sql_id: string
  sql_text: string

  title: string
  description?: string

  priority: Priority
  status: TuningTaskStatus

  assigned_to?: string
  assigned_at?: string
  assigned_by?: string

  // Before metrics
  before_elapsed_time_ms?: number
  before_cpu_time_ms?: number
  before_buffer_gets?: number
  before_disk_reads?: number
  before_executions?: number
  before_plan_hash_value?: number

  // After metrics
  after_elapsed_time_ms?: number
  after_cpu_time_ms?: number
  after_buffer_gets?: number
  after_disk_reads?: number
  after_executions?: number
  after_plan_hash_value?: number

  // Improvements
  improvement_rate?: number
  elapsed_time_improved_pct?: number
  buffer_gets_improved_pct?: number
  cpu_time_improved_pct?: number

  tuning_method?: string
  tuning_details?: string
  implemented_changes?: string

  // Timeline
  identified_at: string
  started_at?: string
  completed_at?: string
  cancelled_at?: string
  estimated_completion_date?: string

  // Review
  reviewed_by?: string
  reviewed_at?: string
  review_comments?: string
  approved_by?: string
  approved_at?: string

  tags?: string[]
  labels: Json
  metadata: Json

  created_by?: string
  created_at: string
  updated_at: string
}

export interface TuningHistory {
  id: string
  tuning_task_id: string
  oracle_connection_id: string
  sql_id: string

  activity_type: string
  description: string

  old_value?: Json
  new_value?: Json

  elapsed_time_ms?: number
  buffer_gets?: number
  cpu_time_ms?: number

  performed_by?: string
  performed_at: string

  metadata: Json
  created_at: string
}

export interface TuningComment {
  id: string
  tuning_task_id: string
  parent_comment_id?: string

  comment: string
  comment_type: 'COMMENT' | 'QUESTION' | 'SOLUTION' | 'ISSUE'

  attachments: Json

  author_id: string
  author_name?: string

  mentions?: string[]

  is_resolved: boolean
  resolved_by?: string
  resolved_at?: string

  created_at: string
  updated_at: string
}

export interface TuningRecommendation {
  id: string
  tuning_task_id?: string
  oracle_connection_id: string
  sql_id: string

  recommendation_type: RecommendationType
  title: string
  description?: string
  rationale?: string

  implementation_sql?: string
  implementation_steps?: string[]
  estimated_effort?: 'LOW' | 'MEDIUM' | 'HIGH'

  expected_improvement_pct?: number
  expected_benefit?: string
  potential_risks?: string

  priority: Priority
  status: RecommendationStatus

  is_auto_generated: boolean
  generated_by?: string

  decision_by?: string
  decision_at?: string
  decision_notes?: string

  created_at: string
  updated_at: string
}

export interface PlanBaseline {
  id: string
  oracle_connection_id: string
  sql_id: string
  plan_hash_value: number

  plan_name: string
  sql_handle?: string
  is_enabled: boolean
  is_accepted: boolean
  is_fixed: boolean

  plan_table: Json
  cost?: number

  executions: number
  avg_elapsed_time_ms?: number
  avg_buffer_gets?: number

  created_in_oracle_at?: string
  last_modified_at?: string

  created_by?: string
  created_at: string
  updated_at: string
}

export interface TuningReport {
  id: string
  report_type: string
  title: string

  start_date: string
  end_date: string

  summary?: Json
  content?: Json
  format: 'HTML' | 'PDF' | 'JSON' | 'EXCEL'

  oracle_connection_id?: string
  filters: Json

  generated_by?: string
  generated_at: string
  generation_time_ms?: number

  recipients: Json
  sent_at?: string

  created_at: string
}

// Database
export interface Database {
  public: {
    Tables: {
      oracle_connections: {
        Row: OracleConnection
        Insert: Omit<OracleConnection, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<OracleConnection, 'id' | 'created_at'>>
      }
      user_roles: {
        Row: UserRoleRecord
        Insert: Omit<UserRoleRecord, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<UserRoleRecord, 'id' | 'created_at'>>
      }
      user_profiles: {
        Row: UserProfile
        Insert: Omit<UserProfile, 'created_at' | 'updated_at'>
        Update: Partial<Omit<UserProfile, 'id' | 'created_at'>>
      }
      system_settings: {
        Row: SystemSetting
        Insert: Omit<SystemSetting, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<SystemSetting, 'id' | 'created_at'>>
      }
      sql_statistics: {
        Row: SQLStatistics
        Insert: Omit<SQLStatistics, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<SQLStatistics, 'id' | 'created_at'>>
      }
      sql_tuning_tasks: {
        Row: SQLTuningTask
        Insert: Omit<SQLTuningTask, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<SQLTuningTask, 'id' | 'created_at'>>
      }
      tuning_history: {
        Row: TuningHistory
        Insert: Omit<TuningHistory, 'id' | 'created_at'>
        Update: Partial<Omit<TuningHistory, 'id' | 'created_at'>>
      }
    }
    Views: {}
    Functions: {
      calculate_improvement_rate: {
        Args: { p_before_value: number; p_after_value: number }
        Returns: number
      }
    }
    Enums: {}
  }
}
