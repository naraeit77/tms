'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Database,
  FileX,
  Search,
  Inbox,
  AlertCircle,
  FolderOpen,
  Settings,
  Wifi,
  RefreshCw
} from 'lucide-react';

type EmptyStateVariant =
  | 'no-data'
  | 'no-results'
  | 'no-connection'
  | 'error'
  | 'empty-folder'
  | 'not-configured'
  | 'offline';

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: EmptyStateVariant;
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  size?: 'sm' | 'md' | 'lg';
  withCard?: boolean;
}

const variantDefaults: Record<EmptyStateVariant, {
  icon: React.ReactNode;
  title: string;
  description: string;
}> = {
  'no-data': {
    icon: <Database className="h-12 w-12" />,
    title: '데이터가 없습니다',
    description: '표시할 데이터가 없습니다. 새로운 데이터를 추가해주세요.',
  },
  'no-results': {
    icon: <Search className="h-12 w-12" />,
    title: '검색 결과가 없습니다',
    description: '검색 조건에 맞는 결과가 없습니다. 다른 검색어를 시도해보세요.',
  },
  'no-connection': {
    icon: <Wifi className="h-12 w-12" />,
    title: '데이터베이스 연결 필요',
    description: '분석을 시작하려면 상단에서 데이터베이스 연결을 선택해주세요.',
  },
  'error': {
    icon: <AlertCircle className="h-12 w-12" />,
    title: '오류가 발생했습니다',
    description: '데이터를 불러오는 중 문제가 발생했습니다. 다시 시도해주세요.',
  },
  'empty-folder': {
    icon: <FolderOpen className="h-12 w-12" />,
    title: '비어있습니다',
    description: '이 폴더에는 항목이 없습니다.',
  },
  'not-configured': {
    icon: <Settings className="h-12 w-12" />,
    title: '설정이 필요합니다',
    description: '이 기능을 사용하려면 먼저 설정을 완료해주세요.',
  },
  'offline': {
    icon: <Wifi className="h-12 w-12" />,
    title: '오프라인 상태',
    description: '네트워크 연결을 확인해주세요.',
  },
};

export function EmptyState({
  variant = 'no-data',
  title,
  description,
  icon,
  action,
  secondaryAction,
  size = 'md',
  withCard = true,
  className,
  ...props
}: EmptyStateProps) {
  const defaults = variantDefaults[variant];

  const sizeStyles = {
    sm: {
      icon: 'h-8 w-8',
      title: 'text-base',
      description: 'text-xs',
      padding: 'py-6',
    },
    md: {
      icon: 'h-12 w-12',
      title: 'text-lg',
      description: 'text-sm',
      padding: 'py-12',
    },
    lg: {
      icon: 'h-16 w-16',
      title: 'text-xl',
      description: 'text-base',
      padding: 'py-16',
    },
  };

  const content = (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        sizeStyles[size].padding,
        !withCard && className
      )}
      {...(!withCard ? props : {})}
    >
      <div className="text-muted-foreground/40 mb-4">
        {icon || (React.isValidElement(defaults.icon) &&
          React.cloneElement(defaults.icon as React.ReactElement<{ className?: string }>, {
            className: sizeStyles[size].icon,
          })
        )}
      </div>
      <h3 className={cn('font-semibold text-foreground mb-1', sizeStyles[size].title)}>
        {title || defaults.title}
      </h3>
      <p className={cn('text-muted-foreground max-w-sm', sizeStyles[size].description)}>
        {description || defaults.description}
      </p>
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3 mt-4">
          {action && (
            <Button onClick={action.onClick} size={size === 'sm' ? 'sm' : 'default'}>
              {action.icon}
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              variant="outline"
              onClick={secondaryAction.onClick}
              size={size === 'sm' ? 'sm' : 'default'}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );

  if (!withCard) {
    return content;
  }

  return (
    <Card className={cn('border-dashed', className)} {...props}>
      <CardContent className="p-0">
        {content}
      </CardContent>
    </Card>
  );
}

interface ConnectionRequiredProps extends React.HTMLAttributes<HTMLDivElement> {
  feature?: string;
}

export function ConnectionRequired({
  feature = '이 기능',
  className,
  ...props
}: ConnectionRequiredProps) {
  return (
    <EmptyState
      variant="no-connection"
      title="데이터베이스 연결 필요"
      description={`${feature}을(를) 사용하려면 상단 헤더에서 데이터베이스 연결을 선택해주세요.`}
      className={className}
      {...props}
    />
  );
}

interface LoadingErrorProps extends React.HTMLAttributes<HTMLDivElement> {
  message?: string;
  onRetry?: () => void;
}

export function LoadingError({
  message = '데이터를 불러오는 중 오류가 발생했습니다.',
  onRetry,
  className,
  ...props
}: LoadingErrorProps) {
  return (
    <EmptyState
      variant="error"
      description={message}
      action={onRetry ? {
        label: '다시 시도',
        onClick: onRetry,
        icon: <RefreshCw className="h-4 w-4 mr-2" />,
      } : undefined}
      className={className}
      {...props}
    />
  );
}
