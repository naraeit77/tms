'use client'

/**
 * Sessions Loading State
 * 세션 모니터링 페이지 로딩 중 표시되는 스켈레톤 UI
 */

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function SessionsLoading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* 헤더 */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <Skeleton className="h-8 w-40 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9" />
        </div>
      </div>

      {/* 필터 영역 */}
      <div className="flex flex-wrap gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-40" />
      </div>

      {/* 세션 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={`stat-${i}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 세션 테이블 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-5 w-20" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg">
            {/* 테이블 헤더 */}
            <div className="grid grid-cols-7 gap-4 p-4 border-b bg-muted/50">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={`header-${i}`} className="h-4 w-full" />
              ))}
            </div>
            {/* 테이블 행 */}
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={`row-${i}`} className="grid grid-cols-7 gap-4 p-4 border-b last:border-b-0">
                {Array.from({ length: 7 }).map((_, j) => (
                  <Skeleton key={`cell-${i}-${j}`} className="h-4 w-full" />
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
