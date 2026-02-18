'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface DataCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive?: boolean;
    label?: string;
  };
  loading?: boolean;
  variant?: 'default' | 'blue' | 'green' | 'purple' | 'orange' | 'red';
  size?: 'sm' | 'md' | 'lg';
}

const variantStyles = {
  default: {
    border: 'hover:border-primary/30',
    shadow: 'hover:shadow-primary/10',
    bg: 'from-primary/5 to-transparent',
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
  },
  blue: {
    border: 'hover:border-blue-500/30',
    shadow: 'hover:shadow-blue-500/10',
    bg: 'from-blue-500/5 to-transparent',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-500',
  },
  green: {
    border: 'hover:border-green-500/30',
    shadow: 'hover:shadow-green-500/10',
    bg: 'from-green-500/5 to-transparent',
    iconBg: 'bg-green-500/10',
    iconColor: 'text-green-500',
  },
  purple: {
    border: 'hover:border-purple-500/30',
    shadow: 'hover:shadow-purple-500/10',
    bg: 'from-purple-500/5 to-transparent',
    iconBg: 'bg-purple-500/10',
    iconColor: 'text-purple-500',
  },
  orange: {
    border: 'hover:border-orange-500/30',
    shadow: 'hover:shadow-orange-500/10',
    bg: 'from-orange-500/5 to-transparent',
    iconBg: 'bg-orange-500/10',
    iconColor: 'text-orange-500',
  },
  red: {
    border: 'hover:border-red-500/30',
    shadow: 'hover:shadow-red-500/10',
    bg: 'from-red-500/5 to-transparent',
    iconBg: 'bg-red-500/10',
    iconColor: 'text-red-500',
  },
};

export function DataCard({
  title,
  value,
  description,
  icon,
  trend,
  loading = false,
  variant = 'default',
  size = 'md',
  className,
  ...props
}: DataCardProps) {
  const styles = variantStyles[variant];

  const sizeStyles = {
    sm: { value: 'text-xl', title: 'text-xs' },
    md: { value: 'text-2xl sm:text-3xl', title: 'text-sm' },
    lg: { value: 'text-3xl sm:text-4xl', title: 'text-base' },
  };

  return (
    <Card
      className={cn(
        'glass border-2 border-transparent transition-all duration-300 hover:shadow-2xl group relative overflow-hidden',
        styles.border,
        styles.shadow,
        className
      )}
      {...props}
    >
      <div
        className={cn(
          'absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity rounded-xl',
          styles.bg
        )}
      />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
        <CardTitle className={cn('font-medium text-muted-foreground', sizeStyles[size].title)}>
          {title}
        </CardTitle>
        {icon && (
          <div className={cn('p-2 rounded-lg', styles.iconBg)}>
            <div className={styles.iconColor}>
              {icon}
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="relative">
        {loading ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          <>
            <div className={cn('font-bold gradient-text', sizeStyles[size].value)}>
              {typeof value === 'number' ? value.toLocaleString() : value}
            </div>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">
                {description}
              </p>
            )}
            {trend && (
              <div className={cn(
                'text-xs mt-2 flex items-center gap-1',
                trend.isPositive ? 'text-green-600' : 'text-red-600'
              )}>
                <span>{trend.isPositive ? '↑' : '↓'}</span>
                <span>{Math.abs(trend.value)}%</span>
                {trend.label && <span className="text-muted-foreground">{trend.label}</span>}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface DataCardGridProps extends React.HTMLAttributes<HTMLDivElement> {
  columns?: 2 | 3 | 4 | 5;
}

export function DataCardGrid({
  columns = 4,
  className,
  children,
  ...props
}: DataCardGridProps) {
  const gridCols = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
    5: 'md:grid-cols-2 lg:grid-cols-5',
  };

  return (
    <div
      className={cn('grid gap-4 sm:gap-6', gridCols[columns], className)}
      {...props}
    >
      {children}
    </div>
  );
}
