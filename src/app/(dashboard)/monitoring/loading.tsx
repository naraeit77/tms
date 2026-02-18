'use client'

/**
 * Monitoring Loading State
 * 모니터링 페이지 로딩 중 표시되는 스켈레톤 UI
 */

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

// 메트릭 카드 스켈레톤
function MetricCardSkeleton() {
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

// 차트 스켈레톤
function ChartSkeleton({ height = 400 }: { height?: number }) {
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

// Top SQL 스켈레톤
function TopSqlSkeleton() {
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

// 데이터베이스 정보 스켈레톤
function DatabaseInfoSkeleton() {
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

export default function MonitoringLoading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Breadcrumb */}
      <nav className="text-sm mb-6">
        <div className="flex items-center space-x-2">
          <Skeleton className="h-4 w-8" />
          <span className="text-gray-300">/</span>
          <Skeleton className="h-4 w-24" />
        </div>
      </nav>

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-9 w-9" />
        </div>
      </div>

      {/* DB 정보 */}
      <DatabaseInfoSkeleton />

      {/* 탭 */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid grid-cols-4 w-full max-w-md">
          <TabsTrigger value="overview" disabled>
            <Skeleton className="h-4 w-16" />
          </TabsTrigger>
          <TabsTrigger value="performance" disabled>
            <Skeleton className="h-4 w-16" />
          </TabsTrigger>
          <TabsTrigger value="details" disabled>
            <Skeleton className="h-4 w-16" />
          </TabsTrigger>
          <TabsTrigger value="alerts" disabled>
            <Skeleton className="h-4 w-16" />
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Overview 컨텐츠 */}
      <div className="space-y-6">
        {/* 시스템 메트릭 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <MetricCardSkeleton key={`sys-metric-${i}`} />
          ))}
        </div>

        {/* 데이터베이스 통계 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <MetricCardSkeleton key={`db-stat-${i}`} />
          ))}
        </div>

        {/* Top SQL */}
        <TopSqlSkeleton />
      </div>
    </div>
  )
}
