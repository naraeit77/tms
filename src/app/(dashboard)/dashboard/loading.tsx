'use client'

/**
 * Dashboard Loading State
 * 대시보드 페이지 로딩 중 표시되는 스켈레톤 UI
 */

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

// 메트릭 카드 스켈레톤
function MetricCardSkeleton() {
  return (
    <Card className="glass border-2 border-transparent">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20 mb-2" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-1.5 w-full mt-3 rounded-full" />
      </CardContent>
    </Card>
  )
}

// 차트 카드 스켈레톤
function ChartCardSkeleton({ height = 400 }: { height?: number }) {
  return (
    <Card className="glass border border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-6 w-48 mb-2" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="w-full" style={{ height }} />
      </CardContent>
    </Card>
  )
}

// SQL 리스트 카드 스켈레톤
function SQLListCardSkeleton() {
  return (
    <Card className="glass border border-red-500/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-6 w-40 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={`sql-skeleton-${i}`} className="p-4 rounded-lg border">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-full" />
                </div>
                <div className="text-right">
                  <Skeleton className="h-5 w-16 mb-1" />
                  <Skeleton className="h-3 w-12" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default function DashboardLoading() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* 페이지 헤더 스켈레톤 */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-cyan-500/10 rounded-2xl blur-3xl" />
        <div className="relative glass p-6 rounded-2xl border border-primary/20">
          <div className="flex items-center justify-between">
            <div>
              <Skeleton className="h-10 w-72 mb-2" />
              <Skeleton className="h-5 w-96" />
              <div className="flex items-center gap-2 mt-3">
                <Skeleton className="h-2 w-2 rounded-full" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
            <Skeleton className="h-16 w-32 rounded-xl" />
          </div>
        </div>
      </div>

      {/* 메트릭 카드 그리드 */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <MetricCardSkeleton key={`metric-${i}`} />
        ))}
      </div>

      {/* SQL 성능 분석 섹션 */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCardSkeleton height={400} />
        </div>
        <Card className="glass border border-primary/20">
          <CardHeader>
            <Skeleton className="h-6 w-32" />
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
                <div key={`grade-${i}`} className="flex items-center justify-between">
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

      {/* 성능 트렌드 차트 */}
      <ChartCardSkeleton height={400} />

      {/* 주요 섹션 그리드 */}
      <div className="grid gap-6 md:grid-cols-2">
        <SQLListCardSkeleton />
        <Card className="glass border border-blue-500/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <Skeleton className="h-6 w-32 mb-2" />
                <Skeleton className="h-4 w-40" />
              </div>
              <Skeleton className="h-8 w-20" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-4 rounded-lg border">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-20" />
              </div>
              <div className="p-4 rounded-lg border">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-12" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 빠른 액세스 링크 */}
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={`quick-${i}`} className="glass border-2 border-transparent">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-xl" />
                <div>
                  <Skeleton className="h-5 w-32 mb-1" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-5 w-5 ml-auto" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
