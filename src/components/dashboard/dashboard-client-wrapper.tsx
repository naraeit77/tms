'use client';

import { ReactNode } from 'react';

interface DashboardClientWrapperProps {
  children: ReactNode;
}

/**
 * 대시보드 클라이언트 래퍼
 * 클라이언트 측 초기화 담당
 */
export function DashboardClientWrapper({ children }: DashboardClientWrapperProps) {
  return <>{children}</>;
}
