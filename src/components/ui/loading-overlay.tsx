'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, Loader2 } from 'lucide-react';

interface LoadingOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  loading?: boolean;
  message?: string;
  variant?: 'spinner' | 'skeleton' | 'pulse';
  blur?: boolean;
}

export function LoadingOverlay({
  loading = true,
  message,
  variant = 'spinner',
  blur = true,
  className,
  children,
  ...props
}: LoadingOverlayProps) {
  if (!loading) {
    return <>{children}</>;
  }

  return (
    <div className={cn('relative', className)} {...props}>
      {children}
      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center z-10',
          blur ? 'bg-background/80 backdrop-blur-sm' : 'bg-background/60'
        )}
      >
        {variant === 'spinner' && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            {message && (
              <p className="text-sm text-muted-foreground">{message}</p>
            )}
          </div>
        )}
        {variant === 'pulse' && (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
              <div className="h-3 w-3 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
              <div className="h-3 w-3 bg-primary rounded-full animate-bounce" />
            </div>
            {message && (
              <p className="text-sm text-muted-foreground">{message}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}

export function LoadingSpinner({
  size = 'md',
  message,
  className,
  ...props
}: LoadingSpinnerProps) {
  const sizeStyles = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3', className)}
      {...props}
    >
      <Loader2 className={cn('animate-spin text-primary', sizeStyles[size])} />
      {message && (
        <p className="text-sm text-muted-foreground">{message}</p>
      )}
    </div>
  );
}

interface RefreshIndicatorProps extends React.HTMLAttributes<HTMLDivElement> {
  isRefreshing?: boolean;
  lastUpdated?: Date;
}

export function RefreshIndicator({
  isRefreshing = false,
  lastUpdated,
  className,
  ...props
}: RefreshIndicatorProps) {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div
      className={cn('flex items-center gap-2 text-xs text-muted-foreground', className)}
      {...props}
    >
      <RefreshCw
        className={cn('h-3 w-3', isRefreshing && 'animate-spin')}
      />
      {isRefreshing ? (
        <span>갱신 중...</span>
      ) : lastUpdated ? (
        <span>마지막 갱신: {formatTime(lastUpdated)}</span>
      ) : null}
    </div>
  );
}

interface CardSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  rows?: number;
  showHeader?: boolean;
  showActions?: boolean;
}

export function CardSkeleton({
  rows = 3,
  showHeader = true,
  showActions = false,
  className,
  ...props
}: CardSkeletonProps) {
  return (
    <div
      className={cn('p-6 space-y-4 rounded-lg border bg-card', className)}
      {...props}
    >
      {showHeader && (
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          {showActions && <Skeleton className="h-9 w-24" />}
        </div>
      )}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}

interface TableSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({
  rows = 5,
  columns = 4,
  className,
  ...props
}: TableSkeletonProps) {
  return (
    <div className={cn('space-y-3', className)} {...props}>
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-3 bg-muted/50 rounded-t-lg">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`header-${i}`} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={`row-${rowIndex}`}
          className="flex items-center gap-4 px-4 py-3 border-b"
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={`cell-${rowIndex}-${colIndex}`} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

interface ChartSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  height?: number;
}

export function ChartSkeleton({
  height = 300,
  className,
  ...props
}: ChartSkeletonProps) {
  return (
    <div
      className={cn('flex flex-col gap-4', className)}
      style={{ height }}
      {...props}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
      <Skeleton className="flex-1 w-full" />
      <div className="flex justify-between">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  );
}
