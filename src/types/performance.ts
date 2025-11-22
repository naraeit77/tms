/**
 * Performance Types
 * SQL 성능 분석 및 클러스터링 관련 타입 정의
 */

export type PerformanceGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface PerformanceMetrics {
  elapsed_time: number;
  cpu_time: number;
  buffer_gets: number;
  disk_reads: number;
  executions: number;
  rows_processed: number;
  parse_calls: number;
  sorts: number;
}

export interface PerformancePoint {
  sql_id: string;
  x: number; // CPU Time or Elapsed Time
  y: number; // Logical Reads or Executions
  size: number; // Buffer Gets or Disk Reads
  grade: PerformanceGrade;
  label?: string;
  metrics: PerformanceMetrics;
}

export interface ChartConfig {
  xAxis: 'cpu_time' | 'elapsed_time';
  yAxis: 'buffer_gets' | 'executions' | 'disk_reads';
  sizeMetric: 'buffer_gets' | 'disk_reads' | 'rows_processed';
  timeRange: {
    start: Date;
    end: Date;
  };
  filters: {
    grades?: PerformanceGrade[];
    schemas?: string[];
    minExecutions?: number;
    maxExecutions?: number;
  };
}

export interface PerformanceTrend {
  timestamp: string;
  value: number;
  metric: string;
}

export interface ClusterData {
  id: string;
  name: string;
  points: PerformancePoint[];
  centroid: {
    x: number;
    y: number;
  };
  avgPerformanceScore: number;
  characteristics: {
    avgCpuTime: number;
    avgElapsedTime: number;
    avgBufferGets: number;
    totalExecutions: number;
  };
}

export interface OptimizationSuggestion {
  id: string;
  type: 'index' | 'query_rewrite' | 'statistics' | 'hint' | 'partitioning';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  expectedImprovement: {
    metric: string;
    percentage: number;
  };
  implementation?: string;
}

export interface SqlComparison {
  sql_id_1: string;
  sql_id_2: string;
  metrics: {
    name: string;
    value_1: number;
    value_2: number;
    difference: number;
    differencePercentage: number;
  }[];
  recommendation?: string;
}

export interface PatternAnalysis {
  id: string;
  clusterId: string;
  patternType: 'performance' | 'access' | 'timing' | 'resource';
  name: string;
  description: string;
  confidence: number; // 0-100
  frequency: number; // 출현 빈도
  impact: 'high' | 'medium' | 'low';
  characteristics: string[];
  metrics: {
    [key: string]: number;
  };
  recommendations: OptimizationSuggestion[];
  relatedSqlIds: string[];
}

export interface ClusterPattern {
  clusterId: string;
  clusterName: string;
  patterns: PatternAnalysis[];
  overallScore: number;
  dominantPatterns: string[];
  problemPatterns: string[];
  optimizationPotential: number; // 0-100
}
