'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Badge, BadgeProps } from '@/components/ui/badge';

type StatusType =
  | 'success' | 'warning' | 'error' | 'info' | 'pending' | 'inactive'
  | 'critical' | 'high' | 'medium' | 'low'
  | 'active' | 'idle' | 'waiting' | 'running' | 'completed' | 'failed'
  | 'grade-a' | 'grade-b' | 'grade-c' | 'grade-d' | 'grade-f';

interface StatusBadgeProps extends Omit<BadgeProps, 'variant'> {
  status: StatusType;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
  icon?: React.ReactNode;
}

const statusStyles: Record<StatusType, { bg: string; text: string; border: string }> = {
  // 일반 상태
  success: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', border: 'border-green-200 dark:border-green-800' },
  warning: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', border: 'border-yellow-200 dark:border-yellow-800' },
  error: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', border: 'border-red-200 dark:border-red-800' },
  info: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800' },
  pending: { bg: 'bg-gray-100 dark:bg-gray-900/30', text: 'text-gray-700 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-800' },
  inactive: { bg: 'bg-gray-100 dark:bg-gray-900/30', text: 'text-gray-500 dark:text-gray-500', border: 'border-gray-200 dark:border-gray-800' },

  // 우선순위
  critical: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', border: 'border-red-200 dark:border-red-800' },
  high: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-800' },
  medium: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', border: 'border-yellow-200 dark:border-yellow-800' },
  low: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', border: 'border-green-200 dark:border-green-800' },

  // 프로세스 상태
  active: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', border: 'border-green-200 dark:border-green-800' },
  idle: { bg: 'bg-gray-100 dark:bg-gray-900/30', text: 'text-gray-600 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-800' },
  waiting: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400', border: 'border-yellow-200 dark:border-yellow-800' },
  running: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800' },
  completed: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', border: 'border-green-200 dark:border-green-800' },
  failed: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', border: 'border-red-200 dark:border-red-800' },

  // 등급
  'grade-a': { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800' },
  'grade-b': { bg: 'bg-lime-100 dark:bg-lime-900/30', text: 'text-lime-700 dark:text-lime-400', border: 'border-lime-200 dark:border-lime-800' },
  'grade-c': { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800' },
  'grade-d': { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', border: 'border-orange-200 dark:border-orange-800' },
  'grade-f': { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', border: 'border-red-200 dark:border-red-800' },
};

const statusLabels: Record<StatusType, string> = {
  success: '성공',
  warning: '경고',
  error: '오류',
  info: '정보',
  pending: '대기중',
  inactive: '비활성',
  critical: '심각',
  high: '높음',
  medium: '보통',
  low: '낮음',
  active: '활성',
  idle: '유휴',
  waiting: '대기',
  running: '실행중',
  completed: '완료',
  failed: '실패',
  'grade-a': 'Grade A',
  'grade-b': 'Grade B',
  'grade-c': 'Grade C',
  'grade-d': 'Grade D',
  'grade-f': 'Grade F',
};

export function StatusBadge({
  status,
  label,
  size = 'md',
  pulse = false,
  icon,
  className,
  ...props
}: StatusBadgeProps) {
  const styles = statusStyles[status];
  const displayLabel = label || statusLabels[status];

  const sizeStyles = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-xs px-2 py-0.5',
    lg: 'text-sm px-2.5 py-1',
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        styles.bg,
        styles.text,
        styles.border,
        sizeStyles[size],
        'font-medium',
        className
      )}
      {...props}
    >
      {pulse && (
        <span className={cn(
          'h-1.5 w-1.5 rounded-full mr-1.5 animate-pulse',
          status === 'active' || status === 'running' ? 'bg-green-500' :
          status === 'warning' || status === 'waiting' ? 'bg-yellow-500' :
          status === 'error' || status === 'failed' || status === 'critical' ? 'bg-red-500' :
          'bg-current'
        )} />
      )}
      {icon && <span className="mr-1">{icon}</span>}
      {displayLabel}
    </Badge>
  );
}

interface GradeBadgeProps extends Omit<BadgeProps, 'variant'> {
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function GradeBadge({
  grade,
  showLabel = true,
  size = 'md',
  className,
  ...props
}: GradeBadgeProps) {
  const statusMap: Record<string, StatusType> = {
    A: 'grade-a',
    B: 'grade-b',
    C: 'grade-c',
    D: 'grade-d',
    F: 'grade-f',
  };

  const gradeDescriptions: Record<string, string> = {
    A: '우수 (< 200ms)',
    B: '양호 (< 500ms)',
    C: '보통 (< 1000ms)',
    D: '주의 (< 2000ms)',
    F: '위험 (> 2000ms)',
  };

  return (
    <StatusBadge
      status={statusMap[grade]}
      label={showLabel ? `Grade ${grade}` : grade}
      size={size}
      className={className}
      {...props}
    />
  );
}

interface SessionStatusBadgeProps extends Omit<BadgeProps, 'variant'> {
  status: string;
  size?: 'sm' | 'md' | 'lg';
}

export function SessionStatusBadge({
  status,
  size = 'md',
  className,
  ...props
}: SessionStatusBadgeProps) {
  const normalizedStatus = status?.toUpperCase() || 'UNKNOWN';

  let statusType: StatusType = 'inactive';
  let label = status || 'UNKNOWN';

  switch (normalizedStatus) {
    case 'ACTIVE':
      statusType = 'active';
      label = '활성';
      break;
    case 'INACTIVE':
      statusType = 'inactive';
      label = '비활성';
      break;
    case 'KILLED':
      statusType = 'error';
      label = '종료됨';
      break;
    case 'CACHED':
      statusType = 'info';
      label = '캐시됨';
      break;
    case 'SNIPED':
      statusType = 'warning';
      label = 'Sniped';
      break;
    default:
      statusType = 'pending';
      label = status;
  }

  return (
    <StatusBadge
      status={statusType}
      label={label}
      size={size}
      pulse={normalizedStatus === 'ACTIVE'}
      className={className}
      {...props}
    />
  );
}
