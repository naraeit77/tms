'use client'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * 모니터링 페이지 Skeleton 로딩 컴포넌트
 * 데이터 로딩 중 사용자에게 레이아웃 미리보기 제공
 */

// 메트릭 카드 스켈레톤
export function MetricCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4 rounded" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20 mb-2" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  )
}

// 시스템 메트릭 그리드 스켈레톤
export function SystemMetricsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <MetricCardSkeleton key={`sys-metric-${i}`} />
      ))}
    </div>
  )
}

// 데이터베이스 통계 그리드 스켈레톤
export function DatabaseStatsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <MetricCardSkeleton key={`db-stat-${i}`} />
      ))}
    </div>
  )
}

// 차트 스켈레톤
export function ChartSkeleton({ height = 400 }: { height?: number }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-48" />
        </div>
        <Skeleton className="h-4 w-72 mt-1" />
      </CardHeader>
      <CardContent>
        <Skeleton className="w-full" style={{ height }} />
      </CardContent>
    </Card>
  )
}

// Top SQL 리스트 스켈레톤
export function TopSqlSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-40" />
        </div>
        <Skeleton className="h-4 w-64 mt-1" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={`top-sql-${i}`} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center space-x-4 flex-1">
                <Skeleton className="w-8 h-8 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-3 w-64" />
                </div>
              </div>
              <div className="text-right space-y-1">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// 알림 리스트 스켈레톤
export function AlertsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-24" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={`alert-${i}`} className="flex items-start justify-between p-4 border rounded-lg">
              <div className="flex items-start space-x-3">
                <Skeleton className="h-4 w-4 mt-1 rounded" />
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-4 w-72 mb-1" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
              <div className="flex space-x-2">
                <Skeleton className="h-8 w-12 rounded" />
                <Skeleton className="h-8 w-12 rounded" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// 데이터베이스 연결 정보 카드 스켈레톤
export function DatabaseInfoSkeleton() {
  return (
    <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-blue-200 dark:border-blue-800">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-48" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={`db-info-${i}`}>
              <Skeleton className="h-3 w-24 mb-2" />
              <Skeleton className="h-6 w-32" />
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </CardContent>
    </Card>
  )
}

// 전체 Overview 탭 스켈레톤
export function OverviewTabSkeleton() {
  return (
    <div className="space-y-6">
      <SystemMetricsSkeleton />
      <DatabaseStatsSkeleton />
      <TopSqlSkeleton />
    </div>
  )
}

// 성능 탭 스켈레톤
export function PerformanceTabSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <ChartSkeleton height={400} />
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-5 w-24" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-12" />
              </div>
            </div>
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={`perf-grade-${i}`} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="w-3 h-3 rounded-full" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="h-4 w-8" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// 상세 분석 탭 스켈레톤
export function DetailsTabSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6">
      <ChartSkeleton height={400} />
      <ChartSkeleton height={400} />
    </div>
  )
}

// 로딩 인디케이터 (작은 크기)
export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  }

  return (
    <div className="flex items-center justify-center">
      <div className={`animate-spin rounded-full border-b-2 border-blue-600 ${sizeClasses[size]}`} />
    </div>
  )
}

// 인라인 로딩 (데이터 갱신 중)
export function RefreshingIndicator() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <div className="animate-spin h-3 w-3 rounded-full border-b-2 border-blue-600" />
      <span>데이터 갱신 중...</span>
    </div>
  )
}
