/**
 * SQL 등급 시스템 (A ~ F)
 * TMS 2.0 구현 가이드 기반 SQL 성능 등급 산정
 */

// A,B,C,D,F 5등급 시스템 (대시보드와 동일)
export type SQLGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface SQLGradeInfo {
  grade: SQLGrade;
  color: string;
  bgColor: string;
  label: string;
  description: string;
  criteria: string;
}

// 대시보드와 동일한 색상 체계 사용
export const SQL_GRADES: Record<SQLGrade, Omit<SQLGradeInfo, 'grade'>> = {
  A: {
    color: '#22c55e', // green-500
    bgColor: 'rgba(34, 197, 94, 0.1)',
    label: 'Excellent',
    description: '최적화된 SQL',
    criteria: 'Elapsed/Exec ≤ 200ms',
  },
  B: {
    color: '#84cc16', // lime-500
    bgColor: 'rgba(132, 204, 22, 0.1)',
    label: 'Good',
    description: '양호한 SQL',
    criteria: 'Elapsed/Exec ≤ 500ms',
  },
  C: {
    color: '#f59e0b', // amber-500
    bgColor: 'rgba(245, 158, 11, 0.1)',
    label: 'Average',
    description: '보통 수준',
    criteria: 'Elapsed/Exec ≤ 1,000ms',
  },
  D: {
    color: '#ef4444', // red-500
    bgColor: 'rgba(239, 68, 68, 0.1)',
    label: 'Warning',
    description: '주의 필요',
    criteria: 'Elapsed/Exec ≤ 2,000ms',
  },
  F: {
    color: '#dc2626', // red-600
    bgColor: 'rgba(220, 38, 38, 0.2)',
    label: 'Critical',
    description: '즉시 튜닝 필요',
    criteria: 'Elapsed/Exec > 2,000ms',
  },
};

export interface SQLMetrics {
  elapsedSec: number;
  cpuSec: number;
  executions: number;
  bufferGets: number;
  diskReads: number;
  rowsProcessed?: number;
}

/**
 * SQL 등급 계산 알고리즘
 * 대시보드와 동일한 기준 사용 (elapsed_time 기반)
 * A: ≤200ms, B: ≤500ms, C: ≤1000ms, D: ≤2000ms, F: >2000ms
 */
export function calculateSQLGrade(metrics: SQLMetrics): SQLGrade {
  const { elapsedSec, executions } = metrics;

  // 실행당 경과시간 (밀리초 단위)
  const elapsedPerExecMs = (elapsedSec / Math.max(executions, 1)) * 1000;

  // 대시보드와 동일한 등급 기준
  if (elapsedPerExecMs <= 200) return 'A';
  if (elapsedPerExecMs <= 500) return 'B';
  if (elapsedPerExecMs <= 1000) return 'C';
  if (elapsedPerExecMs <= 2000) return 'D';
  return 'F';
}

/**
 * SQL 등급 정보 가져오기
 */
export function getGradeInfo(grade: SQLGrade): SQLGradeInfo {
  return {
    grade,
    ...SQL_GRADES[grade],
  };
}

/**
 * 등급별 색상 가져오기
 */
export function getGradeColor(grade: SQLGrade): string {
  return SQL_GRADES[grade].color;
}

/**
 * 클러스터 차트용 데이터 변환
 */
export interface SQLClusterPoint {
  sqlId: string;
  grade: SQLGrade;
  gradeColor: string;
  executions: number;
  elapsedSec: number;
  cpuSec: number;
  bufferGets: number;
  diskReads: number;
  rowsProcessed: number;
  module?: string;
  waitClass?: string;
  elapsedPerExec: number;
  bufferPerExec: number;
  // SQL 텍스트 및 바인드 변수
  sqlText?: string;
  sqlFullText?: string;
  bindVariables?: string;
  // 차트용 좌표 (로그 스케일)
  x: number; // log10(elapsed/exec * 1000) - ms 단위
  y: number; // log10(buffer/exec)
  z: number; // 버블 크기 (실행 횟수 기반)
}

export function transformToClusterPoint(
  sql: {
    sql_id: string;
    elapsed_time?: number; // microseconds
    elapsed_sec?: number;
    cpu_time?: number; // microseconds
    cpu_sec?: number;
    executions?: number;
    buffer_gets?: number;
    disk_reads?: number;
    rows_processed?: number;
    module?: string;
    wait_class?: string;
    sql_text?: string;
    sql_fulltext?: string;
    bind_variables?: string;
  }
): SQLClusterPoint {
  // 시간 단위 정규화 (microseconds -> seconds)
  const elapsedSec = sql.elapsed_sec ?? (sql.elapsed_time ?? 0) / 1000000;
  const cpuSec = sql.cpu_sec ?? (sql.cpu_time ?? 0) / 1000000;
  const executions = sql.executions ?? 1;
  const bufferGets = sql.buffer_gets ?? 0;
  const diskReads = sql.disk_reads ?? 0;
  const rowsProcessed = sql.rows_processed ?? 0;

  const grade = calculateSQLGrade({
    elapsedSec,
    cpuSec,
    executions,
    bufferGets,
    diskReads,
  });

  const elapsedPerExec = elapsedSec / Math.max(executions, 1);
  const bufferPerExec = bufferGets / Math.max(executions, 1);

  return {
    sqlId: sql.sql_id,
    grade,
    gradeColor: SQL_GRADES[grade].color,
    executions,
    elapsedSec,
    cpuSec,
    bufferGets,
    diskReads,
    rowsProcessed,
    module: sql.module,
    waitClass: sql.wait_class,
    elapsedPerExec,
    bufferPerExec,
    // SQL 텍스트 및 바인드 변수
    sqlText: sql.sql_text,
    sqlFullText: sql.sql_fulltext,
    bindVariables: sql.bind_variables,
    // 로그 스케일 좌표
    x: Math.log10(Math.max(elapsedPerExec, 0.0001) * 1000), // ms 로그 스케일
    y: Math.log10(Math.max(bufferPerExec, 1)), // buffer 로그 스케일
    z: Math.log10(Math.max(executions, 1)) * 100, // 버블 크기
  };
}

/**
 * Wait Class 색상
 */
export const WAIT_CLASS_COLORS: Record<string, string> = {
  'CPU': '#10b981',
  'User I/O': '#3b82f6',
  'System I/O': '#8b5cf6',
  'Concurrency': '#f59e0b',
  'Application': '#f97316',
  'Commit': '#ef4444',
  'Configuration': '#ec4899',
  'Administrative': '#6b7280',
  'Network': '#06b6d4',
  'Scheduler': '#84cc16',
  'Cluster': '#a855f7',
  'Other': '#6b7280',
  'Idle': '#9ca3af',
};

export function getWaitClassColor(waitClass: string): string {
  return WAIT_CLASS_COLORS[waitClass] || WAIT_CLASS_COLORS['Other'];
}
