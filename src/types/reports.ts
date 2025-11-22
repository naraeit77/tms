// Report-related TypeScript interfaces and types

export interface ReportTemplate {
  id: string;
  name: string;
  description?: string;
  type: 'summary' | 'detailed' | 'trend' | 'comparison';
  sections: string[];
  default_config: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ReportConfiguration {
  period: string;
  databases: string[];
  include_charts: boolean;
  include_recommendations: boolean;
  include_raw_data: boolean;
  format: 'pdf' | 'excel' | 'html' | 'csv' | 'json';
  filters: {
    performance_grade?: string[];
    min_executions?: number;
    cpu_threshold?: number;
    include_system_sql?: boolean;
    schemas?: string[];
    date_range?: {
      start: string;
      end: string;
    };
  };
  recipients?: string[];
  schedule?: {
    enabled: boolean;
    frequency: 'daily' | 'weekly' | 'monthly';
    day_of_week?: number;
    day_of_month?: number;
    time: string;
    timezone?: string;
  };
}

export interface ReportMetadata {
  id: string;
  user_id: string;
  template_id?: string;
  name: string;
  description?: string;
  type: 'summary' | 'detailed' | 'trend' | 'comparison';
  config: ReportConfiguration;
  status: 'draft' | 'generating' | 'completed' | 'failed' | 'scheduled';
  file_path?: string;
  file_size?: number;
  generated_at?: string;
  error_message?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export interface ReportSchedule {
  id: string;
  report_id: string;
  user_id: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  day_of_week?: number;
  day_of_month?: number;
  time: string;
  timezone: string;
  is_active: boolean;
  last_run_at?: string;
  next_run_at: string;
  created_at: string;
  updated_at: string;
}

export interface ReportActivity {
  id: string;
  report_id: string;
  user_id: string;
  action: 'generated' | 'downloaded' | 'shared' | 'deleted' | 'scheduled' | 'viewed';
  details?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

// Frontend-specific interfaces for UI display
export interface ReportListItem {
  id: string;
  title: string;
  description: string;
  type: 'summary' | 'detailed' | 'trend' | 'comparison';
  period: string;
  generatedAt: Date;
  size: string;
  status: 'completed' | 'generating' | 'failed';
  tags: string[];
  author?: string;
  config?: ReportConfiguration;
  filePath?: string;
  errorMessage?: string;
}

export interface ReportSummaryData {
  totalReports: number;
  reportsThisMonth: number;
  avgGenerationTime: number;
  popularReportTypes: {
    type: string;
    count: number;
    percentage: number;
  }[];
  recentActivity: {
    date: string;
    action: string;
    reportName: string;
    user?: string;
  }[];
}

export interface ReportUsageData {
  date: string;
  generated: number;
  downloaded: number;
  views: number;
}

export interface ExportOptions {
  format: 'pdf' | 'excel' | 'csv' | 'json' | 'html';
  includeCharts: boolean;
  includeRawData: boolean;
  includeMetadata: boolean;
  dateRange?: string;
  customFilename?: string;
  email?: {
    enabled: boolean;
    recipients: string[];
    subject: string;
    message: string;
  };
}

export interface AdvancedFilters {
  dateRange: {
    start?: string;
    end?: string;
    preset?: 'today' | '7d' | '30d' | '90d' | 'custom';
  };
  reportTypes: string[];
  authors: string[];
  tags: string[];
  status: string[];
  sizeRange: {
    min?: number;
    max?: number;
  };
  customConditions: {
    field: string;
    operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'between' | 'in';
    value: string | number | string[];
    label?: string;
  }[];
}
