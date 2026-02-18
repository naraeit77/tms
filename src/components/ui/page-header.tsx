'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}

export function PageHeader({
  title,
  description,
  icon,
  actions,
  badge,
  breadcrumbs,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <div className={cn('space-y-4', className)} {...props}>
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="text-sm">
          <ol className="flex items-center space-x-2 text-muted-foreground">
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={crumb.label}>
                {index > 0 && <li className="text-muted-foreground/50">/</li>}
                <li>
                  {crumb.href ? (
                    <a
                      href={crumb.href}
                      className="hover:text-primary transition-colors"
                    >
                      {crumb.label}
                    </a>
                  ) : (
                    <span className="text-foreground font-medium">{crumb.label}</span>
                  )}
                </li>
              </React.Fragment>
            ))}
          </ol>
        </nav>
      )}

      {/* Header Content */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-purple-500/5 to-cyan-500/5 rounded-2xl blur-3xl" />
        <div className="relative glass p-6 rounded-2xl border border-primary/20">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              {icon && (
                <div className="p-3 bg-primary/10 rounded-xl">
                  {icon}
                </div>
              )}
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight gradient-text">
                    {title}
                  </h1>
                  {badge}
                </div>
                {description && (
                  <p className="text-sm sm:text-base text-muted-foreground mt-1.5">
                    {description}
                  </p>
                )}
              </div>
            </div>
            {actions && (
              <div className="flex items-center gap-2 flex-shrink-0">
                {actions}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface PageHeaderSimpleProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeaderSimple({
  title,
  description,
  actions,
  className,
  ...props
}: PageHeaderSimpleProps) {
  return (
    <div
      className={cn('flex flex-col sm:flex-row sm:items-center justify-between gap-4', className)}
      {...props}
    >
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground mt-1">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
