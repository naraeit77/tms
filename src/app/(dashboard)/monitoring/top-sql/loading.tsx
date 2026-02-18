'use client'

/**
 * Top SQL Loading State
 * Top SQL 페이지 로딩 중 표시되는 스켈레톤 UI
 */

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function TopSQLLoading() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* 헤더 */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-9" />
        </div>
      </div>

      {/* 메트릭 카드 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={`metric-${i}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-24 mb-1" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 필터 영역 */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-5 w-24" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={`filter-${i}`}>
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 테이블 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5" />
              <Skeleton className="h-5 w-32" />
            </div>
            <Skeleton className="h-9 w-48" />
          </div>
        </CardHeader>
        <CardContent>
          {/* 테이블 헤더 */}
          <div className="border rounded-lg">
            <div className="grid grid-cols-8 gap-4 p-4 border-b bg-muted/50">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={`header-${i}`} className="h-4 w-full" />
              ))}
            </div>
            {/* 테이블 행 */}
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={`row-${i}`} className="grid grid-cols-8 gap-4 p-4 border-b last:border-b-0">
                {Array.from({ length: 8 }).map((_, j) => (
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
