'use client'

/**
 * Monitoring Data Prefetch Hook
 * 모니터링 데이터 프리페칭으로 페이지 전환 시 즉시 로딩
 */

import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'
import { useSelectedDatabase } from './use-selected-database'

// 메트릭 데이터 타입
interface MetricsData {
  database: any
  sessions: any
  sql_statistics: any
  memory: any
  tablespaces: any[]
  top_waits: any[]
  top_sql: any[]
  performance: any
  timestamp: string
}

/**
 * 모니터링 메트릭 데이터를 프리페치하는 훅
 * 사이드바 네비게이션에서 마우스 오버 시 데이터를 미리 로드
 */
export function usePrefetchMonitoring() {
  const queryClient = useQueryClient()
  const { selectedConnectionId } = useSelectedDatabase()

  // 메트릭 데이터 프리페치 (에러 무시, 조용히 실패)
  const prefetchMetrics = useCallback(async () => {
    if (!selectedConnectionId) return

    // 이미 캐시에 있으면 스킵
    const cachedData = queryClient.getQueryData(['monitoring-metrics', selectedConnectionId])
    if (cachedData) return

    try {
      await queryClient.prefetchQuery({
        queryKey: ['monitoring-metrics', selectedConnectionId],
        queryFn: async () => {
          const response = await fetch(`/api/monitoring/metrics?connection_id=${selectedConnectionId}`)
          if (!response.ok) return null
          const result = await response.json()
          return result.data
        },
        staleTime: 30 * 1000,
        retry: false, // 재시도 비활성화
      })
    } catch {
      // 프리페치 실패는 무시
    }
  }, [queryClient, selectedConnectionId])

  // 대시보드 메트릭 프리페치 (에러 무시, 조용히 실패)
  const prefetchDashboard = useCallback(async () => {
    if (!selectedConnectionId) return

    const cachedData = queryClient.getQueryData(['oracle-dashboard-metrics', selectedConnectionId])
    if (cachedData) return

    try {
      await queryClient.prefetchQuery({
        queryKey: ['oracle-dashboard-metrics', selectedConnectionId],
        queryFn: async () => {
          const res = await fetch(`/api/monitoring/metrics?connection_id=${selectedConnectionId}`)
          if (!res.ok) return null
          const result = await res.json()
          return result.data
        },
        staleTime: 30 * 1000,
        retry: false,
      })
    } catch {
      // 프리페치 실패는 무시
    }
  }, [queryClient, selectedConnectionId])

  // 세션 데이터 프리페치 (에러 무시, 조용히 실패)
  const prefetchSessions = useCallback(async () => {
    if (!selectedConnectionId) return

    const cachedData = queryClient.getQueryData(['sessions', selectedConnectionId])
    if (cachedData) return

    try {
      await queryClient.prefetchQuery({
        queryKey: ['sessions', selectedConnectionId],
        queryFn: async () => {
          const response = await fetch(`/api/monitoring/sessions?connection_id=${selectedConnectionId}`)
          if (!response.ok) return { data: [] }
          return response.json()
        },
        staleTime: 30 * 1000,
        retry: false,
      })
    } catch {
      // 프리페치 실패는 무시
    }
  }, [queryClient, selectedConnectionId])

  // Top SQL 데이터 프리페치 (에러 무시, 조용히 실패)
  const prefetchTopSQL = useCallback(async () => {
    if (!selectedConnectionId) return

    const cachedData = queryClient.getQueryData(['top-sql', selectedConnectionId, 'all', 'buffer_gets', 'all', '', '', ''])
    if (cachedData) return

    try {
      await queryClient.prefetchQuery({
        queryKey: ['top-sql', selectedConnectionId, 'all', 'buffer_gets', 'all', '', '', ''],
        queryFn: async () => {
          const params = new URLSearchParams({
            connection_id: selectedConnectionId,
            order_by: 'buffer_gets',
            limit: '100',
          })
          const response = await fetch(`/api/monitoring/sql-statistics?${params}`)
          if (!response.ok) return { data: [] }
          return response.json()
        },
        staleTime: 60 * 1000,
        retry: false,
      })
    } catch {
      // 프리페치 실패는 무시
    }
  }, [queryClient, selectedConnectionId])

  // 모든 모니터링 데이터 프리페치
  const prefetchAll = useCallback(async () => {
    await Promise.all([
      prefetchMetrics(),
      prefetchDashboard(),
      prefetchSessions(),
      prefetchTopSQL(),
    ])
  }, [prefetchMetrics, prefetchDashboard, prefetchSessions, prefetchTopSQL])

  return {
    prefetchMetrics,
    prefetchDashboard,
    prefetchSessions,
    prefetchTopSQL,
    prefetchAll,
  }
}

/**
 * 앱 시작 시 기본 데이터 프리페치
 */
export function useInitialPrefetch() {
  const { prefetchAll } = usePrefetchMonitoring()
  const { selectedConnectionId } = useSelectedDatabase()

  useEffect(() => {
    if (selectedConnectionId) {
      // 약간의 지연 후 프리페치 시작 (초기 렌더링 방해 방지)
      const timer = setTimeout(() => {
        prefetchAll()
      }, 1000)

      return () => clearTimeout(timer)
    }
  }, [selectedConnectionId, prefetchAll])
}
