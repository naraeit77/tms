'use client'

/**
 * 실시간 모니터링 페이지
 * 성능 최적화: 차트 컴포넌트 지연 로딩 및 React Query 캐싱 개선
 */

import { useState, useEffect, useMemo, Suspense } from 'react'

// Development-only logging helper (disabled by default to reduce console noise)
// Set NEXT_PUBLIC_DEBUG_MONITORING=true in .env.local to enable
const isDebugEnabled = process.env.NEXT_PUBLIC_DEBUG_MONITORING === 'true'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const devLog = (..._args: unknown[]) => {
  if (isDebugEnabled) {
    // Only log if explicitly enabled via environment variable
    console.log(..._args)
  }
}
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useSelectedDatabase } from '@/hooks/use-selected-database'
import {
  RefreshCw,
  Play,
  Pause,
  Filter,
  Settings,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Cpu,
  HardDrive,
  Zap,
  TrendingUp,
  TrendingDown,
  Server,
  Users,
  BarChart3,
  AlertCircle,
  LineChart,
  History,
  GitBranch,
  ChevronRight
} from 'lucide-react'
import { PerformancePoint } from '@/types/performance'
import { PerformanceTrendData } from '@/components/charts/performance-trend-chart'
import { ResourceData } from '@/components/charts/resource-analysis-chart'
import {
  SystemMetricsSkeleton,
  DatabaseStatsSkeleton,
  TopSqlSkeleton,
  ChartSkeleton,
  DatabaseInfoSkeleton,
  PerformanceTabSkeleton,
  DetailsTabSkeleton,
  AlertsSkeleton,
  RefreshingIndicator,
} from '@/components/monitoring/monitoring-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import dynamic from 'next/dynamic'

// 차트 컴포넌트 지연 로딩 - D3.js 기반 무거운 컴포넌트들을 코드 분할
const ScatterPlot = dynamic(
  () => import('@/components/charts/scatter-plot').then(mod => ({ default: mod.ScatterPlot })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[400px] flex items-center justify-center">
        <div className="space-y-4 w-full px-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="w-full h-[320px]" />
        </div>
      </div>
    )
  }
)

const PerformanceTrendChart = dynamic(
  () => import('@/components/charts/performance-trend-chart').then(mod => ({ default: mod.PerformanceTrendChart })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[400px] flex items-center justify-center">
        <div className="space-y-4 w-full px-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="w-full h-[320px]" />
        </div>
      </div>
    )
  }
)

const ResourceAnalysisChart = dynamic(
  () => import('@/components/charts/resource-analysis-chart').then(mod => ({ default: mod.ResourceAnalysisChart })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[400px] flex items-center justify-center">
        <div className="space-y-4 w-full px-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="w-full h-[320px]" />
        </div>
      </div>
    )
  }
)

// Note: System metrics and database stats are calculated from real Oracle API data
// in the processedMetrics useMemo hook (see below). No mock generators needed.

const generatePerformanceDataFromMetrics = (metrics: any): PerformancePoint[] => {
  const data: PerformancePoint[] = []

  // Use real SQL data from top_sql (대시보드와 동일하게 중복 허용)
  if (metrics.top_sql && metrics.top_sql.length > 0) {
    metrics.top_sql.forEach((sql: any) => {
      const executions = Math.max(sql.executions || 0, 1)
      const cpuTimeAvgMs = sql.avg_cpu_ms || 0
      const bufferGetsAvg = sql.avg_buffer_gets || 0
      const elapsedTimeAvgMs = sql.avg_elapsed_ms || 0

      // Grade based on performance (A-F, 5 levels - sql-grading.ts 기준)
      let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'A'
      if (elapsedTimeAvgMs > 2000) grade = 'F'
      else if (elapsedTimeAvgMs > 1000) grade = 'D'
      else if (elapsedTimeAvgMs > 500) grade = 'C'
      else if (elapsedTimeAvgMs > 200) grade = 'B'

      data.push({
        sql_id: sql.sql_id,
        x: elapsedTimeAvgMs,
        y: bufferGetsAvg,
        size: executions,
        grade,
        metrics: {
          elapsed_time: elapsedTimeAvgMs * executions,
          cpu_time: cpuTimeAvgMs * executions,
          buffer_gets: bufferGetsAvg * executions,
          disk_reads: 0,
          executions,
          rows_processed: 0,
          parse_calls: 0,
          sorts: 0,
        }
      })
    })
  }

  // 실제 데이터가 없으면 빈 배열 반환 (mock 데이터 생성하지 않음)

  return data
}

// generateTrendDataFromMetrics 삭제됨 - mock 데이터 대신 실제 API 데이터만 사용

/**
 * OS 레벨 리소스 데이터 생성 함수
 * osStats가 있으면 실제 Oracle V$OSSTAT 기반 데이터 사용
 * 없으면 추정치 기반 폴백 데이터 생성
 */
const generateResourceDataFromMetrics = (metrics: any, osStats?: any): ResourceData[] => {
  const data: ResourceData[] = []
  const now = new Date()
  const categories = ['현재', '1분전', '5분전', '10분전', '15분전']

  // OS 메트릭이 있으면 실제 데이터 사용
  if (osStats && osStats.cpu && osStats.memory) {
    devLog('[ResourceData] 실제 OS 메트릭 사용:', {
      cpu: osStats.cpu.usage_percent,
      memory: osStats.memory.usage_percent,
      io: osStats.io.mb_per_sec,
      network: osStats.network.mb_per_sec,
    })

    const cpuUsage = osStats.cpu.usage_percent || 0
    const memoryUsage = osStats.memory.usage_percent || 0
    const diskIO = osStats.io.mb_per_sec || 0
    const networkIO = osStats.network.mb_per_sec || 0

    // 현재 시점의 실제 데이터만 표시 (과거 데이터에 random 변동 추가하지 않음)
    categories.forEach((category, index) => {
      const timestamp = new Date(now.getTime() - index * 60 * 1000)
      data.push({
        category,
        cpuUsage: Math.max(0, Math.min(100, cpuUsage)),
        memoryUsage: Math.max(0, Math.min(100, memoryUsage)),
        diskIO: Math.max(0, diskIO),
        networkIO: Math.max(0, networkIO),
        timestamp
      })
    })

    return data
  }

  // 폴백: OS 메트릭이 없으면 Oracle 시스템 메트릭 기반 추정치 사용
  devLog('[ResourceData] OS 메트릭 없음, Oracle 시스템 메트릭 기반 추정치 사용')

  // V$SYSMETRIC 기반 실제 CPU 사용률 (Host CPU Utilization)
  const hostCpuUsage = metrics.system?.cpu_usage || 0
  const dbCpuUsage = metrics.system?.db_cpu_usage || 0
  // 실제 CPU 메트릭이 없으면 세션 기반 추정
  const cpuUsageEstimate = hostCpuUsage > 0 ? hostCpuUsage : (dbCpuUsage > 0 ? dbCpuUsage : Math.min(95, (metrics.sessions?.active || 0) * 2 + 10))

  // SGA 기반 메모리 사용률
  const sgaUsedGb = metrics.memory?.sga_used_gb || 0
  const sgaMaxGb = metrics.memory?.sga_max_gb || 0
  const memoryUsagePct = sgaMaxGb > 0 ? Math.min(100, (sgaUsedGb / sgaMaxGb) * 100) : 0

  // I/O 메트릭 (V$SYSMETRIC 기반)
  const diskIO = (metrics.io?.read_mbps || 0) + (metrics.io?.write_mbps || 0)
  const networkIO = (metrics.sessions?.total || 0) * 0.1

  categories.forEach((category, index) => {
    const timestamp = new Date(now.getTime() - index * 60 * 1000)
    data.push({
      category,
      cpuUsage: cpuUsageEstimate,
      memoryUsage: memoryUsagePct,
      diskIO,
      networkIO,
      timestamp
    })
  })

  return data
}

// Note: Top slow queries and alerts are generated from real Oracle API data
// in the processedMetrics useMemo hook based on actual performance thresholds.

// Database connection info type
interface DatabaseConnection {
  id: string
  name: string
  host: string
  port: number
  service_name: string | null
  sid: string | null
  oracle_version: string
  health_status: 'healthy' | 'warning' | 'error' | 'degraded' | 'unhealthy' | 'unknown'
  is_active: boolean
}

export default function MonitoringPage() {
  const router = useRouter()
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase()
  const [activeTab, setActiveTab] = useState('overview')
  const [isAutoRefresh, setIsAutoRefresh] = useState(true)
  const [refreshInterval, setRefreshInterval] = useState(30) // 30초 기본 갱신 주기
  const [timeRange, setTimeRange] = useState('10m')
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false)
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false)
  const [filterOptions, setFilterOptions] = useState({
    showOnlyCritical: false,
    minElapsedTime: 0,
    minBufferGets: 0,
  })

  // 시간 범위를 분으로 변환하는 함수
  const getMinutesFromTimeRange = (range: string): number => {
    switch (range) {
      case '1m': return 1
      case '5m': return 5
      case '10m': return 10
      case '15m': return 15
      case '30m': return 30
      case '1h': return 60
      default: return 10
    }
  }
  const [databases, setDatabases] = useState<DatabaseConnection[]>([])

  // 시간 범위 선택 관련 상태
  const [selectedTimeRange, setSelectedTimeRange] = useState<{ start: Date; end: Date } | null>(null)
  const [timeRangeSQLs, setTimeRangeSQLs] = useState<any[]>([])
  const [isTimeRangeDialogOpen, setIsTimeRangeDialogOpen] = useState(false)
  const [isLoadingTimeRangeSQLs, setIsLoadingTimeRangeSQLs] = useState(false)

  // State for different data types
  const [systemMetrics, setSystemMetrics] = useState({
    cpuUsage: 0,
    memoryUsage: 0,
    bufferCacheHitRate: 0,
    totalTransactions: 0,
    diskIO: 0,
    networkIO: 0,
    activeConnections: 0,
    blockedSessions: 0,
    avgResponseTime: 0,
    transactionsPerSecond: 0,
  })
  const [databaseStats, setDatabaseStats] = useState({
    totalSQL: 0,
    activeSQL: 0,
    problemSQL: 0,
    totalSessions: 0,
    activeSessions: 0,
    blockedQueries: 0,
    tablespaceUsage: 0,
    tablespaceTopName: 'N/A',
    tablespaces: [] as any[],
    redoLogSize: 0,
  })
  const [topSlowQueries, setTopSlowQueries] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [performanceData, setPerformanceData] = useState<PerformancePoint[]>([])
  const [selectedPoint, setSelectedPoint] = useState<PerformancePoint | null>(null)
  const [trendData, setTrendData] = useState<PerformanceTrendData[]>([])
  const [resourceData, setResourceData] = useState<ResourceData[]>([])
  const [showSqlDetailModal, setShowSqlDetailModal] = useState(false)
  const [showSqlText, setShowSqlText] = useState(false)
  const [sqlTextData, setSqlTextData] = useState<any>(null)
  const [loadingSqlText, setLoadingSqlText] = useState(false)
  const [showAlertDetailModal, setShowAlertDetailModal] = useState(false)
  const [selectedAlert, setSelectedAlert] = useState<any>(null)

  // Fetch databases using React Query (전역 캐시 공유)
  const { data: databasesData } = useQuery({
    queryKey: ['oracle-connections'], // 전역 쿼리 키로 통일
    queryFn: async () => {
      const response = await fetch('/api/oracle/connections')
      if (!response.ok) throw new Error('Failed to fetch databases')
      const data = await response.json()
      return data.map((conn: any) => ({
        id: conn.id,
        name: conn.name,
        host: conn.host,
        port: conn.port,
        service_name: conn.service_name,
        sid: conn.sid,
        oracle_version: conn.oracle_version,
        is_active: conn.is_active === true,
        health_status: (conn.health_status || 'unknown').toLowerCase(),
      })) || []
    },
    staleTime: 5 * 60 * 1000, // 5분
    gcTime: 10 * 60 * 1000, // 10분간 가비지 컬렉션 방지
    refetchOnWindowFocus: false, // 포커스 시 재요청 비활성화
  })

  // Update databases state when data changes
  useEffect(() => {
    if (databasesData) {
      setDatabases(databasesData)
    }
  }, [databasesData])


  // Fetch monitoring metrics using React Query with DMA cache support
  // 성능 최적화: staleTime을 늘려 초기 로딩 시 캐시 활용도 증가
  const { data: metricsData, isLoading: loading, isFetching, refetch: refetchMetrics } = useQuery({
    queryKey: ['monitoring-metrics', selectedConnectionId],
    queryFn: async () => {
      const response = await fetch(`/api/monitoring/metrics?connection_id=${selectedConnectionId}`)
      if (!response.ok) throw new Error('Failed to fetch metrics')
      const result = await response.json()
      return result.data
    },
    enabled: !!selectedConnectionId,
    staleTime: 45 * 1000, // 45초간 fresh 상태 유지 (캐시 히트율 증가)
    gcTime: 5 * 60 * 1000, // 5분간 캐시 유지
    refetchInterval: isAutoRefresh ? refreshInterval * 1000 : false,
    refetchIntervalInBackground: false,
    refetchOnMount: 'always', // 마운트 시 stale 데이터면 백그라운드 갱신
    refetchOnWindowFocus: false, // 윈도우 포커스 시 재요청 비활성화
    placeholderData: (previousData) => previousData, // 이전 데이터 유지하여 깜빡임 방지
  })

  // 성능 트렌드 데이터 - Oracle 서버 시간 기반 실제 데이터 조회 (모든 시간대 SQL 포함)
  // 메인 메트릭 로드 완료 후 지연 로드하여 초기 로딩 속도 개선
  const { data: performanceTrendData, refetch: refetchTrend, isLoading: trendLoading } = useQuery({
    queryKey: ['monitoring-performance-trend', selectedConnectionId, timeRange],
    queryFn: async () => {
      if (!selectedConnectionId) return null
      const minutes = getMinutesFromTimeRange(timeRange)
      const res = await fetch(`/api/monitoring/performance-trend?connection_id=${selectedConnectionId}&minutes=${minutes}`)
      if (!res.ok) throw new Error('Failed to fetch performance trend')
      const result = await res.json()
      return result
    },
    enabled: !!selectedConnectionId && !!metricsData, // 메트릭 로드 후 실행
    refetchInterval: isAutoRefresh ? 60000 : false, // 60초마다 갱신
    staleTime: 45 * 1000, // 45초로 증가
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: (previousData) => previousData,
  })

  // OS 레벨 리소스 메트릭 - Oracle V$OSSTAT 기반 실제 데이터 조회
  // 메인 메트릭 로드 완료 후 지연 로드하여 초기 로딩 속도 개선
  const { data: osStatsData, refetch: refetchOsStats } = useQuery({
    queryKey: ['monitoring-os-stats', selectedConnectionId],
    queryFn: async () => {
      if (!selectedConnectionId) return null
      const res = await fetch(`/api/monitoring/os-stats?connection_id=${selectedConnectionId}`)
      if (!res.ok) throw new Error('Failed to fetch OS stats')
      const result = await res.json()
      return result.data
    },
    enabled: !!selectedConnectionId && !!metricsData, // 메트릭 로드 후 실행
    refetchInterval: isAutoRefresh ? refreshInterval * 1000 : false, // 메인 갱신 주기와 동기화
    staleTime: 30 * 1000, // 30초로 증가
    gcTime: 2 * 60 * 1000, // 2분간 캐시 유지
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: (previousData) => previousData,
  })

  // 성능 트렌드 데이터가 변경되면 trendData state 직접 업데이트 (대시보드와 동일 패턴)
  // useMemo 대신 useEffect로 직접 state 업데이트하여 oracleTimestamp가 확실히 포함되도록 함
  useEffect(() => {
    if (performanceTrendData?.data && performanceTrendData.data.length > 0) {
      // Oracle 서버 시간 기반 실제 데이터 사용
      const chartData = performanceTrendData.data.map((item: any) => {
        const timestamp = new Date(item.timestamp.replace(' ', 'T'))
        // oracleTimestamp: API에서 제공하는 oracleTimestamp 또는 timestamp 문자열 사용
        const oracleTs = item.oracleTimestamp || item.timestamp
        return {
          timestamp,
          oracleTimestamp: oracleTs, // Oracle 서버 시간 문자열 (YYYY-MM-DD HH24:MI:SS)
          avgCpuTime: item.avgCpuTime || 0,
          avgElapsedTime: item.avgElapsedTime || 0,
          avgBufferGets: item.avgBufferGets || 0,
          totalExecutions: item.totalExecutions || 0,
          avgDiskReads: item.avgDiskReads || 0,
          activeQueries: item.activeQueries || 0,
          problemQueries: item.problemQueries || 0,
          source: item.source || performanceTrendData.source || 'unknown',
          sqls: item.sqls || [],
        }
      })
      setTrendData(chartData)

      if (process.env.NODE_ENV === 'development') {
        devLog('[Monitoring] 트렌드 데이터 직접 업데이트:', {
          count: chartData.length,
          source: performanceTrendData.source,
          firstOracleTimestamp: chartData[0]?.oracleTimestamp,
          lastOracleTimestamp: chartData[chartData.length - 1]?.oracleTimestamp,
        })
      }
    } else if (!trendLoading) {
      // API 데이터가 없으면 빈 배열 설정 (mock 데이터 생성하지 않음)
      setTrendData([])
    }
  }, [performanceTrendData, trendLoading, metricsData])

  // 시간 범위 선택 핸들러 - 선택된 시간대의 SQL 정보를 추출
  // 중요: 차트의 시간축은 Oracle 서버 시간 기준이므로, 드래그로 선택된 범위도
  // Oracle 서버 시간 문자열을 그대로 사용해야 정확한 매칭이 됩니다.
  const handleTimeRangeSelect = async (startTime: Date, endTime: Date) => {
    setSelectedTimeRange({ start: startTime, end: endTime })
    setIsTimeRangeDialogOpen(true)
    setIsLoadingTimeRangeSQLs(true)

    if (!selectedConnectionId) {
      setTimeRangeSQLs([])
      setIsLoadingTimeRangeSQLs(false)
      return
    }

    try {
      // 차트에 실제로 표시된 trendData를 사용하여 Oracle 서버 시간 문자열을 찾습니다.
      // trendData는 useMemo로 처리된 데이터로, timestamp는 Date 객체이고
      // oracleTimestamp에 원본 Oracle 서버 시간 문자열이 저장되어 있습니다.
      let startTimeStr = ''
      let endTimeStr = ''
      let dataSource = 'v$sql'

      if (trendData && trendData.length > 0) {
        // 디버그: trendData의 oracleTimestamp 필드 확인
        devLog('[TimeRangeSelect] trendData 샘플:', {
          first: {
            timestamp: trendData[0]?.timestamp,
            oracleTimestamp: trendData[0]?.oracleTimestamp,
            source: trendData[0]?.source,
          },
          last: {
            timestamp: trendData[trendData.length - 1]?.timestamp,
            oracleTimestamp: trendData[trendData.length - 1]?.oracleTimestamp,
            source: trendData[trendData.length - 1]?.source,
          }
        })

        // 선택된 시간 범위를 분 단위로 변환하여 비교 (밀리초 차이로 인한 매칭 실패 방지)
        const startTimeMs = startTime.getTime()
        const endTimeMs = endTime.getTime()

        // 차트 데이터에서 선택 범위와 겹치는 데이터 포인트 찾기
        // 1분 단위 데이터이므로, 30초 여유를 두고 비교
        const tolerance = 30 * 1000 // 30초 허용 오차
        const matchingData = trendData.filter((d: any) => {
          const dTime = d.timestamp instanceof Date ? d.timestamp.getTime() : new Date(d.timestamp).getTime()
          return dTime >= (startTimeMs - tolerance) && dTime <= (endTimeMs + tolerance)
        })

        devLog('[TimeRangeSelect] 매칭 결과:', {
          trendDataLength: trendData.length,
          matchingCount: matchingData.length,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          firstTrendTimestamp: trendData[0]?.timestamp instanceof Date ? trendData[0].timestamp.toISOString() : trendData[0]?.timestamp,
          lastTrendTimestamp: trendData[trendData.length - 1]?.timestamp instanceof Date ? trendData[trendData.length - 1].timestamp.toISOString() : trendData[trendData.length - 1]?.timestamp,
        })

        if (matchingData.length > 0) {
          // 매칭된 데이터 중 첫 번째와 마지막의 Oracle 서버 시간 문자열 사용
          startTimeStr = matchingData[0].oracleTimestamp || ''
          endTimeStr = matchingData[matchingData.length - 1].oracleTimestamp || ''
          dataSource = matchingData[0].source || 'v$sql'

          devLog('[TimeRangeSelect] 매칭된 데이터 사용:', {
            startTimeStr,
            endTimeStr,
            dataSource,
            matchingDataCount: matchingData.length,
          })
        } else {
          // 매칭되는 데이터가 없으면 가장 가까운 데이터 포인트 찾기
          let closestStart = trendData[0]
          let closestEnd = trendData[trendData.length - 1]
          let minStartDiff = Infinity
          let minEndDiff = Infinity

          for (const d of trendData) {
            const dTime = d.timestamp instanceof Date ? d.timestamp.getTime() : new Date(d.timestamp).getTime()
            const startDiff = Math.abs(dTime - startTimeMs)
            const endDiff = Math.abs(dTime - endTimeMs)

            if (startDiff < minStartDiff) {
              minStartDiff = startDiff
              closestStart = d
            }
            if (endDiff < minEndDiff) {
              minEndDiff = endDiff
              closestEnd = d
            }
          }

          startTimeStr = closestStart.oracleTimestamp || ''
          endTimeStr = closestEnd.oracleTimestamp || ''
          dataSource = closestStart.source || 'v$sql'

          devLog('[TimeRangeSelect] 가장 가까운 포인트 사용:', {
            closestStartTimestamp: closestStart.oracleTimestamp,
            closestEndTimestamp: closestEnd.oracleTimestamp,
            minStartDiff: minStartDiff / 1000 + 's',
            minEndDiff: minEndDiff / 1000 + 's',
          })
        }
      }

      // 차트 데이터가 없거나 oracleTimestamp가 없는 경우 클라이언트 시간 사용 (폴백)
      if (!startTimeStr || !endTimeStr) {
        devLog('[TimeRangeSelect] 폴백: 클라이언트 시간 사용')
        const formatDateTime = (date: Date): string => {
          const year = date.getFullYear()
          const month = String(date.getMonth() + 1).padStart(2, '0')
          const day = String(date.getDate()).padStart(2, '0')
          const hours = String(date.getHours()).padStart(2, '0')
          const minutes = String(date.getMinutes()).padStart(2, '0')
          const seconds = String(date.getSeconds()).padStart(2, '0')
          return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
        }
        startTimeStr = formatDateTime(startTime)
        endTimeStr = formatDateTime(endTime)
      }

      // API를 통해 해당 시간 범위의 SQL 목록 조회
      // sysmetric 소스는 시스템 레벨 통계만 제공하므로
      // SQL 상세 조회에는 ASH나 V$SQL을 사용해야 함
      // dataSource가 sysmetric이면 elapsed_time_ms 기준 정렬 사용
      const orderByParam = dataSource === 'ash' ? 'sample_count' : 'elapsed_time_ms'

      const params = new URLSearchParams({
        connection_id: selectedConnectionId,
        start_time: startTimeStr,
        end_time: endTimeStr,
        limit: '100',
        order_by: orderByParam
      })

      devLog('[TimeRangeSelect] API 호출:', {
        connection_id: selectedConnectionId,
        start_time: startTimeStr,
        end_time: endTimeStr,
        dataSource,
        orderBy: orderByParam,
      })

      const response = await fetch(`/api/monitoring/sql-statistics?${params}`)
      if (!response.ok) {
        throw new Error('Failed to fetch SQL statistics for time range')
      }

      const result = await response.json()
      devLog('[TimeRangeSelect] API 응답:', {
        count: result.data?.length || 0,
        source: result.source,
        total: result.total,
        warning: result.warning,
      })
      const sqlList = result.data || []

      // API 응답 데이터를 차트에 표시할 형식으로 변환
      const performancePoints = sqlList.map((sql: any, index: number) => {
        const elapsedTime = sql.avg_elapsed_ms || sql.elapsed_time_ms || 0
        const cpuTime = sql.avg_cpu_ms || sql.cpu_time_ms || 0
        const bufferGets = sql.avg_buffer_gets || sql.buffer_gets || 0

        // Grade 계산 (A-F, 5 levels - sql-grading.ts 기준)
        let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'A'
        if (elapsedTime > 2000) grade = 'F'
        else if (elapsedTime > 1000) grade = 'D'
        else if (elapsedTime > 500) grade = 'C'
        else if (elapsedTime > 200) grade = 'B'

        return {
          id: `${selectedConnectionId}-${sql.sql_id}-${sql.plan_hash_value || 0}-${index}-${Date.now()}`,
          sql_id: sql.sql_id,
          sql_snippet: sql.sql_text?.substring(0, 100) || sql.sql_snippet || '',
          x: cpuTime,
          y: bufferGets,
          size: bufferGets,
          grade,
          sample_count: sql.sample_count || 0,
          dataSource: dataSource,
          metrics: {
            elapsed_time: elapsedTime,
            cpu_time: cpuTime,
            buffer_gets: bufferGets,
            disk_reads: sql.disk_reads || 0,
            executions: sql.executions || 0,
            rows_processed: sql.rows_processed || 0,
            parse_calls: sql.parse_calls || 0,
            sorts: sql.sorts || 0,
          }
        }
      })

      // sample_count 또는 elapsed_time 기준으로 정렬
      if (dataSource === 'ash') {
        performancePoints.sort((a, b) => (b.sample_count || 0) - (a.sample_count || 0))
      } else {
        performancePoints.sort((a, b) => (b.metrics.elapsed_time || 0) - (a.metrics.elapsed_time || 0))
      }

      setTimeRangeSQLs(performancePoints)
    } catch (error) {
      console.error('Failed to fetch time range SQLs:', error)
      setTimeRangeSQLs([])
    } finally {
      setIsLoadingTimeRangeSQLs(false)
    }
  }

  // 데이터 갱신 중 표시 (초기 로딩이 아닌 백그라운드 갱신)
  const isRefreshing = isFetching && !loading

  // useMemo로 메트릭 데이터 처리 최적화 (불필요한 재계산 방지)
  const processedMetrics = useMemo(() => {
    if (!metricsData) return null

    const metrics = metricsData

    // 시스템 메트릭 계산
    const totalMemory = Object.values(metrics.memory || {}).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0)
    const memoryUsagePct = totalMemory > 0 ? Math.min(95, (totalMemory / 10000) * 100) : 60
    const cpuUsageEstimate = Math.min(95, (metrics.sessions?.active || 0) * 2 + 20)

    const systemMetricsData = {
      cpuUsage: cpuUsageEstimate,
      memoryUsage: memoryUsagePct,
      diskIO: (metrics.sql_statistics?.avg_buffer_gets || 0) * 0.01,
      networkIO: (metrics.sessions?.total || 0) * 5,
      activeConnections: metrics.sessions?.active || 0,
      blockedSessions: metrics.sessions?.blocked || 0,
      avgResponseTime: metrics.sql_statistics?.avg_elapsed_time || 0,
      transactionsPerSecond: metrics.performance?.transaction_tps || 0,
      totalTransactions: metrics.performance?.total_transactions || 0,
      bufferCacheHitRate: metrics.performance?.buffer_cache_hit_rate || 0,
    }

    // 데이터베이스 통계 계산
    const databaseStatsData = {
      totalSQL: metrics.sql_statistics?.unique_sql_count || 0,
      activeSQL: metrics.sessions?.active || 0,
      problemSQL: metrics.top_sql?.filter((sql: any) => sql.avg_elapsed_ms > 1000).length || 0,
      totalSessions: metrics.sessions?.total || 0,
      activeSessions: metrics.sessions?.active || 0,
      blockedQueries: metrics.sessions?.blocked || 0,
      tablespaceUsage: metrics.tablespaces?.[0]?.used_pct || 0,
      tablespaceTopName: metrics.tablespaces?.[0]?.name || 'N/A',
      tablespaces: metrics.tablespaces || [],
      redoLogSize: 1024,
    }

    // Top SQL 처리 (중복 sql_id 제거 후 부하 기준 정렬)
    // 부하 = 평균 실행 시간 * 실행 횟수 (총 실행 시간)
    const topSlowQueriesData = metrics.top_sql && metrics.top_sql.length > 0
      ? Array.from(
        new Map(
          metrics.top_sql.map((sql: any) => [sql.sql_id, {
            sql_id: sql.sql_id,
            elapsed_time: sql.avg_elapsed_ms,
            cpu_time: sql.avg_cpu_ms,
            executions: sql.executions,
            buffer_gets: sql.avg_buffer_gets,
            sql_text: sql.sql_snippet || '',
            // 총 부하 계산: 평균 실행 시간 * 실행 횟수
            total_load: (sql.avg_elapsed_ms || 0) * (sql.executions || 0),
          }])
        ).values()
      )
        // 총 부하(total_load) 기준으로 내림차순 정렬 후 상위 10개 선택
        .sort((a: any, b: any) => (b.total_load || 0) - (a.total_load || 0))
        .slice(0, 10)
      : []

    // 성능 데이터 생성
    const performanceDataPoints = generatePerformanceDataFromMetrics(metrics)
    // 트렌드 데이터는 실제 API 데이터 사용 (sqls 포함)
    const trendDataPoints = performanceTrendData?.data?.length > 0
      ? (() => {
        const mapped = performanceTrendData.data.map((item: any) => {
          // oracleTimestamp: API에서 제공하는 oracleTimestamp 또는 timestamp 문자열 사용
          const oracleTs = item.oracleTimestamp || item.timestamp;
          return {
            timestamp: new Date(item.timestamp.replace(' ', 'T')),
            oracleTimestamp: oracleTs, // Oracle 서버 시간 문자열 (YYYY-MM-DD HH24:MI:SS)
            avgCpuTime: item.avgCpuTime || 0,
            avgElapsedTime: item.avgElapsedTime || 0,
            avgBufferGets: item.avgBufferGets || 0,
            totalExecutions: item.totalExecutions || 0,
            avgDiskReads: item.avgDiskReads || 0,
            activeQueries: item.activeQueries || 0,
            problemQueries: item.problemQueries || 0,
            source: item.source || performanceTrendData.source || 'unknown',
            sqls: item.sqls || [],
          };
        });
        // 실제 데이터 사용 로그 (개발 환경에서만)
        if (process.env.NODE_ENV === 'development') {
          devLog('[Monitoring] 성능 트렌드 데이터 로드:', {
            count: mapped.length,
            source: performanceTrendData.source,
            interval: performanceTrendData.interval,
            firstTimestamp: mapped[0]?.timestamp,
            lastTimestamp: mapped[mapped.length - 1]?.timestamp,
          });
        }
        return mapped;
      })()
      : (() => {
        // 로딩 중일 때는 빈 배열 반환 (폴백 데이터 표시 방지)
        if (trendLoading) return [];

        // API 데이터가 없으면 빈 배열 반환 (mock 데이터 생성하지 않음)
        devLog('[Monitoring] 성능 트렌드 API 데이터 없음');
        return [];
      })()
    const resourceDataPoints = generateResourceDataFromMetrics(metrics, osStatsData)

    // 알림 생성
    const alertsData: any[] = []
    let alertId = 1

    if (metrics.sessions?.active > 50) {
      alertsData.push({
        id: alertId++,
        severity: 'warning' as const,
        message: `활성 세션 수가 높습니다: ${metrics.sessions.active}개`,
        timestamp: new Date(),
        acknowledged: false,
        source: 'Session Monitor',
      })
    }

    if (metrics.tablespaces && metrics.tablespaces.length > 0) {
      metrics.tablespaces.forEach((ts: any) => {
        if (ts.used_pct > 90) {
          alertsData.push({
            id: alertId++,
            severity: 'critical' as const,
            message: `테이블스페이스 사용량 심각: ${ts.name} (${ts.used_pct.toFixed(1)}%)`,
            timestamp: new Date(),
            acknowledged: false,
            source: 'Storage Monitor',
          })
        } else if (ts.used_pct > 80) {
          alertsData.push({
            id: alertId++,
            severity: 'warning' as const,
            message: `테이블스페이스 사용량 높음: ${ts.name} (${ts.used_pct.toFixed(1)}%)`,
            timestamp: new Date(),
            acknowledged: false,
            source: 'Storage Monitor',
          })
        }
      })
    }

    if (metrics.top_sql && metrics.top_sql.length > 0) {
      const criticalSql = metrics.top_sql.filter((sql: any) => sql.avg_elapsed_ms > 2000)
      if (criticalSql.length > 0) {
        alertsData.push({
          id: alertId++,
          severity: 'critical' as const,
          message: `심각한 성능 저하 SQL ${criticalSql.length}개 감지 (평균 응답시간 >2초)`,
          timestamp: new Date(),
          acknowledged: false,
          source: 'SQL Monitor',
        })
      }
    }

    if (metrics.sessions?.blocked > 0) {
      alertsData.push({
        id: alertId++,
        severity: metrics.sessions.blocked > 5 ? 'critical' as const : 'warning' as const,
        message: `블로킹 세션 감지: ${metrics.sessions.blocked}개`,
        timestamp: new Date(),
        acknowledged: false,
        source: 'Lock Monitor',
      })
    }

    if (metrics.top_waits && metrics.top_waits.length > 0) {
      const criticalWaits = metrics.top_waits.filter((wait: any) => wait.average_wait_ms > 100)
      if (criticalWaits.length > 0) {
        alertsData.push({
          id: alertId++,
          severity: 'warning' as const,
          message: `높은 대기 이벤트 감지: ${criticalWaits[0].event} (평균 ${criticalWaits[0].average_wait_ms.toFixed(0)}ms)`,
          timestamp: new Date(),
          acknowledged: false,
          source: 'Wait Event Monitor',
        })
      }
    }

    if (metrics.performance?.buffer_cache_hit_rate < 90) {
      alertsData.push({
        id: alertId++,
        severity: 'info' as const,
        message: `버퍼 캐시 히트율 낮음: ${metrics.performance.buffer_cache_hit_rate.toFixed(1)}%`,
        timestamp: new Date(),
        acknowledged: false,
        source: 'Performance Monitor',
      })
    }

    return {
      systemMetrics: systemMetricsData,
      databaseStats: databaseStatsData,
      topSlowQueries: topSlowQueriesData,
      performanceData: performanceDataPoints,
      trendData: trendDataPoints,
      resourceData: resourceDataPoints,
      alerts: alertsData,
    }
  }, [metricsData, performanceTrendData, trendLoading, osStatsData])

  // processedMetrics가 변경되면 상태 업데이트
  // 주의: trendData는 별도 useEffect에서 처리하므로 여기서 제외
  useEffect(() => {
    if (processedMetrics) {
      setSystemMetrics(processedMetrics.systemMetrics)
      setDatabaseStats(processedMetrics.databaseStats)
      setTopSlowQueries(processedMetrics.topSlowQueries)
      setPerformanceData(processedMetrics.performanceData)
      // trendData는 위의 useEffect에서 처리 (중복 방지)
      setResourceData(processedMetrics.resourceData)
      setAlerts(processedMetrics.alerts)
    }
  }, [processedMetrics])

  const handleRefresh = () => {
    refetchMetrics()
    refetchOsStats() // OS 메트릭도 함께 갱신
    refetchTrend() // 성능 트렌드도 함께 갱신
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />
      case 'info':
        return <CheckCircle2 className="h-4 w-4 text-blue-500" />
      default:
        return <Zap className="h-4 w-4 text-gray-500" />
    }
  }

  const getSeverityBadgeVariant = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'destructive'
      case 'warning':
        return 'default'
      case 'info':
        return 'secondary'
      default:
        return 'outline'
    }
  }

  // Fetch SQL text from API
  const fetchSqlText = async () => {
    if (!selectedPoint || !selectedConnectionId) return

    // 이미 표시되어 있으면 숨기기
    if (showSqlText) {
      setShowSqlText(false)
      return
    }

    setLoadingSqlText(true)
    try {
      const response = await fetch(
        `/api/monitoring/sql-text?connection_id=${selectedConnectionId}&sql_id=${selectedPoint.sql_id}`
      )

      const result = await response.json()

      if (!response.ok) {
        console.error('SQL text API error:', result.error, result.details)
        // 에러 시에도 기본 정보로 표시
        setShowSqlText(true)
        return
      }

      setSqlTextData(result.data)
      setShowSqlText(true)
    } catch (error) {
      console.error('Failed to fetch SQL text:', error)
      // 에러 시에도 기본 정보로 표시
      setShowSqlText(true)
    } finally {
      setLoadingSqlText(false)
    }
  }

  // 알림 확인 처리
  const handleAcknowledgeAlert = (alertId: number) => {
    setAlerts(prevAlerts =>
      prevAlerts.map(alert =>
        alert.id === alertId
          ? { ...alert, acknowledged: true }
          : alert
      )
    )
  }

  // 알림 상세 보기
  const handleShowAlertDetail = (alert: any) => {
    setSelectedAlert(alert)
    setShowAlertDetailModal(true)
  }

  const selectedDbInfo = databases.find(db => db.id === selectedConnectionId)

  // 실제 연결 상태 결정: metricsData가 있으면 연결된 것으로 간주
  const isConnected = !!metricsData && !loading
  const effectiveHealthStatus = isConnected ? 'healthy' : (selectedDbInfo?.health_status || 'unknown')
  const effectiveIsActive = isConnected || selectedDbInfo?.is_active

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">실시간 모니터링</h1>
          <p className="text-gray-500 dark:text-gray-400">Oracle 데이터베이스 시스템 전체 성능을 실시간으로 모니터링합니다</p>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-3">
          {/* 선택된 데이터베이스 정보 표시 (상단 헤더에서 선택) */}
          {selectedConnection && (
            <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-md">
              <div className={`h-2 w-2 rounded-full ${effectiveHealthStatus === 'healthy' ? 'bg-green-500' :
                effectiveHealthStatus === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                }`} />
              <Database className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{selectedConnection.name}</span>
            </div>
          )}

          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1m">최근 1분</SelectItem>
              <SelectItem value="5m">최근 5분</SelectItem>
              <SelectItem value="10m">최근 10분</SelectItem>
              <SelectItem value="15m">최근 15분</SelectItem>
              <SelectItem value="30m">최근 30분</SelectItem>
              <SelectItem value="1h">최근 1시간</SelectItem>
            </SelectContent>
          </Select>

          <Select value={refreshInterval.toString()} onValueChange={(value) => setRefreshInterval(parseInt(value))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5초마다</SelectItem>
              <SelectItem value="10">10초마다</SelectItem>
              <SelectItem value="30">30초마다</SelectItem>
              <SelectItem value="60">1분마다</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant={isAutoRefresh ? 'default' : 'outline'}
            size="icon"
            onClick={() => setIsAutoRefresh(!isAutoRefresh)}
            title={isAutoRefresh ? '자동 새로고침 중지' : '자동 새로고침 시작'}
          >
            {isAutoRefresh ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>

          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>

          {/* 백그라운드 갱신 중 인디케이터 */}
          {isRefreshing && <RefreshingIndicator />}

          <Button variant="outline" size="icon" onClick={() => setIsFilterDialogOpen(true)} title="필터 설정">
            <Filter className="h-4 w-4" />
          </Button>

          <Button variant="outline" size="icon" onClick={() => setIsSettingsDialogOpen(true)} title="모니터링 설정">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Database Connection Info Card */}
      {loading && !metricsData && <DatabaseInfoSkeleton />}
      {selectedDbInfo && !loading && (
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-blue-200 dark:border-blue-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              연결된 데이터베이스 정보
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">데이터베이스 이름</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">{selectedDbInfo.name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">호스트</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">{selectedDbInfo.host}:{selectedDbInfo.port}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Service Name / SID</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {selectedDbInfo.service_name || selectedDbInfo.sid || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Oracle 버전</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">{selectedDbInfo.oracle_version}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              {effectiveHealthStatus === 'healthy' && (
                <Badge className="bg-green-500 hover:bg-green-600 text-white border-0">
                  정상
                </Badge>
              )}
              {(effectiveHealthStatus === 'warning' || effectiveHealthStatus === 'degraded') && (
                <Badge variant="outline" className="border-yellow-500 text-yellow-700 dark:text-yellow-500">
                  경고
                </Badge>
              )}
              {(effectiveHealthStatus === 'error' || effectiveHealthStatus === 'unhealthy' || effectiveHealthStatus === 'unknown') && !isConnected && (
                <Badge variant="destructive">
                  오류
                </Badge>
              )}
              {effectiveIsActive ? (
                <Badge className="bg-blue-500 hover:bg-blue-600 text-white border-0">
                  활성
                </Badge>
              ) : (
                <Badge variant="secondary">
                  비활성
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">시스템 개요</TabsTrigger>
          <TabsTrigger value="performance">SQL 성능</TabsTrigger>
          <TabsTrigger value="details">상세 분석</TabsTrigger>
          <TabsTrigger value="alerts">알림 & 로그</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* System Metrics Cards - Skeleton or Data */}
          {loading && !metricsData ? (
            <SystemMetricsSkeleton />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">활성 세션</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{systemMetrics.activeConnections}</div>
                  <div className="flex items-center text-xs text-muted-foreground">
                    <Activity className="h-3 w-3 text-blue-500 mr-1" />
                    전체 {databaseStats.totalSessions}개 세션
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Buffer Cache Hit</CardTitle>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${systemMetrics.bufferCacheHitRate > 90 ? 'text-green-600' : 'text-yellow-600'}`}>
                    {systemMetrics.bufferCacheHitRate.toFixed(1)}%
                  </div>
                  <div className="flex items-center text-xs text-muted-foreground">
                    {systemMetrics.bufferCacheHitRate > 90 ? (
                      <TrendingUp className="h-3 w-3 text-green-500 mr-1" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-orange-500 mr-1" />
                    )}
                    캐시 히트율
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">트랜잭션 TPS</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{systemMetrics.transactionsPerSecond.toFixed(2)}</div>
                  <div className="flex items-center text-xs text-muted-foreground">
                    <Clock className="h-3 w-3 text-blue-500 mr-1" />
                    총 {systemMetrics.totalTransactions.toLocaleString()} 트랜잭션
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">평균 응답시간</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{systemMetrics.avgResponseTime.toFixed(2)}ms</div>
                  <div className="flex items-center text-xs text-muted-foreground">
                    {systemMetrics.avgResponseTime > 100 ? (
                      <TrendingUp className="h-3 w-3 text-orange-500 mr-1" />
                    ) : (
                      <TrendingDown className="h-3 w-3 text-green-500 mr-1" />
                    )}
                    평균 쿼리 응답시간
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Database Stats Cards */}
          {loading && !metricsData ? (
            <DatabaseStatsSkeleton />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">총 SQL 수</CardTitle>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{databaseStats.totalSQL.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">
                    활성: {databaseStats.activeSQL}개
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">문제성 SQL</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{databaseStats.problemSQL}</div>
                  <p className="text-xs text-muted-foreground">
                    Grade D 이하 성능
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">블로킹 세션</CardTitle>
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${databaseStats.blockedQueries > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {databaseStats.blockedQueries}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {databaseStats.blockedQueries > 0 ? '락 대기 중인 세션' : '정상 운영 중'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">테이블스페이스 (Top)</CardTitle>
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${databaseStats.tablespaceUsage > 85 ? 'text-red-600' : databaseStats.tablespaceUsage > 70 ? 'text-yellow-600' : 'text-green-600'}`}>
                    {databaseStats.tablespaceUsage.toFixed(1)}%
                  </div>
                  <p className="text-xs text-muted-foreground truncate" title={databaseStats.tablespaceTopName}>
                    {databaseStats.tablespaceTopName}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Tablespace Details */}
          {loading && !metricsData ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center">
                  <HardDrive className="h-4 w-4 mr-2" />
                  테이블스페이스 사용률 상세
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={`skeleton-tablespace-detail-${i}`} className="flex items-center justify-between">
                      <Skeleton className="h-4 w-32" />
                      <div className="flex items-center gap-3">
                        <Skeleton className="w-32 h-2 rounded-full" />
                        <Skeleton className="h-4 w-14" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : databaseStats.tablespaces.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center">
                  <HardDrive className="h-4 w-4 mr-2" />
                  테이블스페이스 사용률 상세
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {databaseStats.tablespaces.slice(0, 5).map((ts: any, index: number) => (
                    <div key={`tablespace-${ts.name || 'unnamed'}-${index}-${ts.used_pct || 0}`} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-sm font-medium truncate" title={ts.name}>{ts.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-32 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${ts.used_pct > 85 ? 'bg-red-500' : ts.used_pct > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                            style={{ width: `${Math.min(ts.used_pct, 100)}%` }}
                          />
                        </div>
                        <span className={`text-sm font-bold w-14 text-right ${ts.used_pct > 85 ? 'text-red-600' : ts.used_pct > 70 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {ts.used_pct?.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* Top Slow Queries */}
          {loading && !metricsData ? (
            <TopSqlSkeleton />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2" />
                  최고 부하 SQL Top 10
                </CardTitle>
                <CardDescription>실행 시간 기준 상위 성능 문제 SQL 목록</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-[60px] text-center">순위</TableHead>
                        <TableHead className="w-[150px]">SQL ID</TableHead>
                        <TableHead>SQL 텍스트</TableHead>
                        <TableHead className="text-right">실행 시간</TableHead>
                        <TableHead className="text-right">Buffer Gets</TableHead>
                        <TableHead className="text-right">실행 횟수</TableHead>
                        <TableHead className="w-[80px]">분석</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topSlowQueries.map((query, index) => (
                        <TableRow key={`top-sql-${query.sql_id}-${index}-${query.elapsed_time || 0}-${query.executions || 0}`}>
                          <TableCell className="text-center font-medium">
                            <Badge variant="outline" className="h-6 w-6 rounded-full p-0 flex items-center justify-center mx-auto">
                              {index + 1}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <button
                              onClick={() => {
                                const sqlPerformancePoint = {
                                  sql_id: query.sql_id,
                                  x: query.cpu_time,
                                  y: query.buffer_gets,
                                  size: query.buffer_gets,
                                  grade: query.elapsed_time > 2000 ? 'F' as const :
                                    query.elapsed_time > 1000 ? 'D' as const :
                                      query.elapsed_time > 500 ? 'C' as const :
                                        query.elapsed_time > 200 ? 'B' as const : 'A' as const,
                                  metrics: {
                                    elapsed_time: query.elapsed_time,
                                    cpu_time: query.cpu_time,
                                    buffer_gets: query.buffer_gets,
                                    disk_reads: 0,
                                    executions: query.executions,
                                    rows_processed: 0,
                                    parse_calls: 0,
                                    sorts: 0,
                                  }
                                }
                                setSelectedPoint(sqlPerformancePoint)
                                setShowSqlDetailModal(true)
                              }}
                              className="font-mono text-xs font-medium text-primary hover:underline"
                            >
                              {query.sql_id}
                            </button>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs text-muted-foreground truncate max-w-[300px]" title={query.sql_text}>
                              {query.sql_text}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className={`font-mono text-xs font-bold ${query.elapsed_time > 2000 ? 'text-red-500' : 'text-orange-500'}`}>
                              {query.elapsed_time.toFixed(0)}ms
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {(query.buffer_gets || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {query.executions.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                const sqlPerformancePoint = {
                                  sql_id: query.sql_id,
                                  x: query.cpu_time,
                                  y: query.buffer_gets,
                                  size: query.buffer_gets,
                                  grade: query.elapsed_time > 2000 ? 'F' as const :
                                    query.elapsed_time > 1000 ? 'D' as const :
                                      query.elapsed_time > 500 ? 'C' as const :
                                        query.elapsed_time > 200 ? 'B' as const : 'A' as const,
                                  metrics: {
                                    elapsed_time: query.elapsed_time,
                                    cpu_time: query.cpu_time,
                                    buffer_gets: query.buffer_gets,
                                    disk_reads: 0,
                                    executions: query.executions,
                                    rows_processed: 0,
                                    parse_calls: 0,
                                    sorts: 0,
                                  }
                                }
                                setSelectedPoint(sqlPerformancePoint)
                                setShowSqlDetailModal(true)
                              }}
                            >
                              <BarChart3 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          {loading && !metricsData ? (
            <PerformanceTabSkeleton />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Performance Chart */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <LineChart className="h-5 w-5" />
                      실시간 SQL 성능 분포
                    </CardTitle>
                    <CardDescription>
                      CPU 시간 vs Buffer Gets 성능 산점도 (실시간 업데이트)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <div className="flex items-center justify-center h-96">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                      </div>
                    ) : performanceData.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
                        <Database className="h-12 w-12 mb-4 opacity-30" />
                        <p className="text-lg font-medium">SQL 성능 데이터 없음</p>
                        <p className="text-sm mt-1">최근 10분 내 실행된 SQL이 없거나 V$SQL 접근 권한이 필요합니다.</p>
                      </div>
                    ) : (
                      <ScatterPlot
                        data={performanceData}
                        width={700}
                        height={400}
                        onPointClick={setSelectedPoint}
                        onRefresh={handleRefresh}
                        isRefreshing={isFetching}
                        xLabel="CPU Time (ms)"
                        yLabel="Buffer Gets"
                      />
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Performance Summary */}
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      성능 요약
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600 dark:text-gray-400">총 SQL 수</span>
                        <span className="text-2xl font-bold">{performanceData.length}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-green-500"></div>
                          Grade A
                        </span>
                        <span className="font-semibold">
                          {performanceData.filter(p => p.grade === 'A').length}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-lime-500"></div>
                          Grade B
                        </span>
                        <span className="font-semibold">
                          {performanceData.filter(p => p.grade === 'B').length}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                          Grade C
                        </span>
                        <span className="font-semibold">
                          {performanceData.filter(p => p.grade === 'C').length}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-red-500"></div>
                          Grade D
                        </span>
                        <span className="font-semibold">
                          {performanceData.filter(p => p.grade === 'D').length}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-red-600"></div>
                          Grade F
                        </span>
                        <span className="font-semibold text-red-600">
                          {performanceData.filter(p => p.grade === 'F').length}
                        </span>
                      </div>
                    </div>

                    <div className="pt-4 border-t">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-600 dark:text-gray-400">평균 CPU 시간</span>
                        <span className="font-semibold">
                          {(performanceData.reduce((sum, p) => sum + p.x, 0) / performanceData.length || 0).toFixed(2)}ms
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">문제성 SQL</span>
                        <span className="font-semibold text-red-600">
                          {performanceData.filter(p => p.grade === 'F').length}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {selectedPoint && (
                  <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                    <CardHeader>
                      <CardTitle className="text-lg">선택된 SQL</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="font-mono text-sm bg-white dark:bg-gray-800 p-2 rounded border">
                        {selectedPoint.sql_id}
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-gray-600 dark:text-gray-400 block mb-1">Grade</span>
                          <Badge
                            variant={selectedPoint.grade === 'A' ? 'default' : selectedPoint.grade === 'F' ? 'destructive' : 'secondary'}
                          >
                            {selectedPoint.grade}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-gray-600 dark:text-gray-400 block mb-1">Executions</span>
                          <span className="font-medium">{selectedPoint.metrics.executions}</span>
                        </div>
                        <div>
                          <span className="text-gray-600 dark:text-gray-400 block mb-1">CPU Time</span>
                          <span className="font-medium">{selectedPoint.x.toFixed(2)}ms</span>
                        </div>
                        <div>
                          <span className="text-gray-600 dark:text-gray-400 block mb-1">Buffer Gets</span>
                          <span className="font-medium">{selectedPoint.y.toFixed(0)}</span>
                        </div>
                        <div>
                          <span className="text-gray-600 dark:text-gray-400 block mb-1">Disk Reads</span>
                          <span className="font-medium">{selectedPoint.metrics.disk_reads}</span>
                        </div>
                        <div>
                          <span className="text-gray-600 dark:text-gray-400 block mb-1">Rows</span>
                          <span className="font-medium">{selectedPoint.metrics.rows_processed}</span>
                        </div>
                      </div>

                      <Button
                        className="w-full mt-2"
                        size="sm"
                        onClick={() => setShowSqlDetailModal(true)}
                      >
                        상세 분석 보기
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-6">
          {loading && !metricsData ? (
            <DetailsTabSkeleton />
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {/* Performance Trend Analysis */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        성능 트렌드 분석
                      </CardTitle>
                      <CardDescription>
                        시간대별 성능 지표 추이 (실시간 업데이트)
                        {trendData.length > 0 && trendData[0]?.source && (
                          <span className="ml-2 text-xs">
                            (데이터 소스: {trendData[0].source === 'ash' || trendData[0].source === 'ash-estimate' ? 'ASH (실시간)' :
                              trendData[0].source === 'sysmetric' ? '시스템 메트릭 (실시간)' :
                                trendData[0].source === 'sysmetric-current' ? 'V$SYSMETRIC (현재)' :
                                  trendData[0].source === 'v$sql' ? 'V$SQL (활동 기반)' :
                                    trendData[0].source === 'v$sql-snapshot' ? 'V$SQL (제한적)' :
                                      trendData[0].source === 'fallback' ? '추정값 (메트릭 기반)' :
                                        trendData[0].source})
                          </span>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {performanceTrendData?.source && (
                        <Badge variant={performanceTrendData.source === 'fallback' ? 'secondary' : 'outline'}>
                          {performanceTrendData.source === 'ash' || performanceTrendData.source === 'ash-estimate' ? 'ASH Live' :
                            performanceTrendData.source === 'sysmetric' ? 'SysMetric Live' :
                              performanceTrendData.source === 'sysmetric-current' ? 'SysMetric' :
                                performanceTrendData.source === 'v$sql' ? 'V$SQL' :
                                  performanceTrendData.source === 'v$sql-snapshot' ? 'V$SQL' :
                                    performanceTrendData.source === 'fallback' ? '추정값' : 'Live Data'}
                        </Badge>
                      )}
                      {trendData.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {trendData.length}개 포인트
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {loading || trendLoading ? (
                    <div className="flex items-center justify-center h-96">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    </div>
                  ) : trendData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-96 text-muted-foreground">
                      <TrendingUp className="h-12 w-12 mb-4 opacity-30" />
                      <p className="text-lg font-medium">성능 트렌드 데이터 없음</p>
                      <p className="text-sm mt-1">V$SYSMETRIC 또는 V$SQL 접근 권한을 확인하세요.</p>
                      <p className="text-xs mt-2 text-muted-foreground/60">
                        필요 권한: SELECT ON V$SYSMETRIC_HISTORY, V$SYSMETRIC, V$SQL
                      </p>
                    </div>
                  ) : (
                    <PerformanceTrendChart
                      data={trendData}
                      width={1000}
                      height={400}
                      onTimeRangeSelect={handleTimeRangeSelect}
                    />
                  )}
                </CardContent>
              </Card>

              {/* Resource Usage Analysis */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    리소스 사용량 분석
                  </CardTitle>
                  <CardDescription>
                    CPU, 메모리, I/O 사용량 (카테고리별)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex items-center justify-center h-96">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    </div>
                  ) : (
                    <ResourceAnalysisChart
                      data={resourceData}
                      width={900}
                      height={400}
                    />
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-6">
          {loading && !metricsData ? (
            <AlertsSkeleton />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center">
                    <AlertTriangle className="h-5 w-5 mr-2" />
                    활성 알림
                  </span>
                  <Badge variant="destructive">
                    {alerts.filter(alert => !alert.acknowledged).length}개 미확인
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`flex items-start justify-between p-4 border rounded-lg transition-colors ${alert.acknowledged ? 'bg-muted/20' : 'bg-background hover:bg-muted/50'
                        }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`mt-1 p-2 rounded-full flex-shrink-0 ${alert.severity === 'critical' ? 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400' :
                          alert.severity === 'warning' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400' :
                            'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                          }`}>
                          {getSeverityIcon(alert.severity)}
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={getSeverityBadgeVariant(alert.severity) as any} className="h-5 px-2 text-[10px]">
                              {alert.severity.toUpperCase()}
                            </Badge>
                            <span className="text-xs font-medium text-muted-foreground">
                              {alert.source}
                            </span>
                            <span className="text-[10px] text-muted-foreground">•</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {alert.timestamp.toLocaleString()}
                            </span>
                          </div>
                          <p className={`text-sm font-medium leading-relaxed ${alert.acknowledged ? 'text-muted-foreground' : 'text-foreground'}`}>
                            {alert.message}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!alert.acknowledged && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => handleAcknowledgeAlert(alert.id)}
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            확인
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => handleShowAlertDetail(alert)}
                        >
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* SQL Detail Modal */}
      <Dialog
        open={showSqlDetailModal}
        onOpenChange={(open) => {
          setShowSqlDetailModal(open)
          if (!open) {
            // 모달 닫을 때 SQL 텍스트 상태 초기화
            setShowSqlText(false)
            setSqlTextData(null)
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Database className="h-5 w-5" />
              SQL 상세 분석
            </DialogTitle>
            <DialogDescription>
              선택된 SQL 문의 성능 지표 및 최적화 권장사항
            </DialogDescription>
          </DialogHeader>

          {selectedPoint && (
            <div className="space-y-6">
              {/* SQL ID and Grade */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">SQL ID</div>
                  <div className="font-mono text-lg font-semibold">{selectedPoint.sql_id}</div>
                </div>
                <Badge
                  variant={selectedPoint.grade === 'A' ? 'default' : selectedPoint.grade === 'F' ? 'destructive' : 'secondary'}
                  className="text-lg px-4 py-2"
                >
                  Grade {selectedPoint.grade}
                </Badge>
              </div>

              {/* Performance Metrics Grid */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  성능 지표
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">실행 시간</div>
                      <div className="text-2xl font-bold text-blue-600">
                        {selectedPoint.metrics.elapsed_time.toFixed(2)}ms
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">CPU 시간</div>
                      <div className="text-2xl font-bold text-green-600">
                        {selectedPoint.x.toFixed(2)}ms
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Buffer Gets</div>
                      <div className="text-2xl font-bold text-orange-600">
                        {selectedPoint.y.toFixed(0)}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">실행 횟수</div>
                      <div className="text-2xl font-bold text-purple-600">
                        {selectedPoint.metrics.executions}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Detailed Statistics */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  상세 통계
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Disk Reads</span>
                    <span className="font-semibold">{selectedPoint.metrics.disk_reads}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Rows Processed</span>
                    <span className="font-semibold">{selectedPoint.metrics.rows_processed}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Parse Calls</span>
                    <span className="font-semibold">{selectedPoint.metrics.parse_calls}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Sorts</span>
                    <span className="font-semibold">{selectedPoint.metrics.sorts}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded">
                    <span className="text-sm text-gray-600 dark:text-gray-400">평균 실행 시간</span>
                    <span className="font-semibold">
                      {(selectedPoint.metrics.elapsed_time / Math.max(selectedPoint.metrics.executions, 1)).toFixed(2)}ms
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded">
                    <span className="text-sm text-gray-600 dark:text-gray-400">평균 Buffer Gets</span>
                    <span className="font-semibold">
                      {(selectedPoint.y / Math.max(selectedPoint.metrics.executions, 1)).toFixed(0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Performance Analysis */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  성능 분석
                </h3>
                <div className="space-y-3">
                  {selectedPoint.metrics.elapsed_time > 1000 && (
                    <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded">
                      <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                      <div>
                        <div className="font-semibold text-red-900 dark:text-red-100">높은 실행 시간</div>
                        <div className="text-sm text-red-700 dark:text-red-300">
                          실행 시간이 1초를 초과합니다. SQL 튜닝이 필요합니다.
                        </div>
                      </div>
                    </div>
                  )}
                  {selectedPoint.y > 10000 && (
                    <div className="flex items-start gap-3 p-3 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded">
                      <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5" />
                      <div>
                        <div className="font-semibold text-orange-900 dark:text-orange-100">높은 버퍼 읽기</div>
                        <div className="text-sm text-orange-700 dark:text-orange-300">
                          Buffer Gets가 높습니다. 인덱스 최적화를 고려하세요.
                        </div>
                      </div>
                    </div>
                  )}
                  {selectedPoint.x > 500 && (
                    <div className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded">
                      <Cpu className="h-5 w-5 text-yellow-600 mt-0.5" />
                      <div>
                        <div className="font-semibold text-yellow-900 dark:text-yellow-100">높은 CPU 사용량</div>
                        <div className="text-sm text-yellow-700 dark:text-yellow-300">
                          CPU 시간이 높습니다. 복잡한 연산이나 비효율적인 조인이 있는지 확인하세요.
                        </div>
                      </div>
                    </div>
                  )}
                  {selectedPoint.grade === 'A' && (
                    <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded">
                      <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                      <div>
                        <div className="font-semibold text-green-900 dark:text-green-100">우수한 성능</div>
                        <div className="text-sm text-green-700 dark:text-green-300">
                          현재 SQL 성능이 우수합니다. 현재 상태를 유지하세요.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Optimization Recommendations */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  최적화 권장사항
                </h3>
                <div className="space-y-2">
                  {selectedPoint.grade !== 'A' && (
                    <>
                      <div className="flex items-start gap-2 text-sm">
                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5"></div>
                        <div>실행 계획을 확인하고 Full Table Scan을 피하도록 인덱스를 추가하세요.</div>
                      </div>
                      <div className="flex items-start gap-2 text-sm">
                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5"></div>
                        <div>WHERE 절의 조건을 최적화하여 불필요한 데이터 읽기를 줄이세요.</div>
                      </div>
                      {selectedPoint.y > 10000 && (
                        <div className="flex items-start gap-2 text-sm">
                          <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5"></div>
                          <div>Buffer Gets를 줄이기 위해 적절한 인덱스를 생성하세요.</div>
                        </div>
                      )}
                      {selectedPoint.metrics.executions > 100 && (
                        <div className="flex items-start gap-2 text-sm">
                          <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5"></div>
                          <div>자주 실행되는 SQL이므로 바인드 변수 사용을 권장합니다.</div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* SQL Text Section */}
              {showSqlText && (
                <div>
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    SQL 텍스트
                  </h3>
                  {loadingSqlText ? (
                    <div className="flex items-center justify-center p-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 overflow-x-auto">
                        <pre className="text-sm text-gray-100 font-mono whitespace-pre-wrap break-words">
                          {sqlTextData?.sql_text || 'SQL 텍스트를 불러올 수 없습니다.'}
                        </pre>
                      </div>

                      {sqlTextData && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                          {sqlTextData.parsing_schema && (
                            <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900 rounded">
                              <span className="text-gray-600 dark:text-gray-400">스키마</span>
                              <span className="font-semibold">{sqlTextData.parsing_schema}</span>
                            </div>
                          )}
                          {sqlTextData.module && (
                            <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900 rounded">
                              <span className="text-gray-600 dark:text-gray-400">모듈</span>
                              <span className="font-semibold">{sqlTextData.module}</span>
                            </div>
                          )}
                          {sqlTextData.first_load_time && (
                            <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-900 rounded">
                              <span className="text-gray-600 dark:text-gray-400">최초 로드</span>
                              <span className="font-semibold">{sqlTextData.first_load_time}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowSqlDetailModal(false)}>
                  닫기
                </Button>
                <Button onClick={fetchSqlText} disabled={loadingSqlText}>
                  {showSqlText ? 'SQL 텍스트 숨기기' : 'SQL 텍스트 보기'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Alert Detail Modal */}
      <Dialog open={showAlertDetailModal} onOpenChange={setShowAlertDetailModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              알림 상세 정보
            </DialogTitle>
            <DialogDescription>
              알림에 대한 자세한 정보와 권장 조치사항을 확인하세요
            </DialogDescription>
          </DialogHeader>

          {selectedAlert && (
            <div className="space-y-6">
              {/* Alert Header */}
              <div className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0 mt-1">
                    {getSeverityIcon(selectedAlert.severity)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant={getSeverityBadgeVariant(selectedAlert.severity) as any}>
                        {selectedAlert.severity.toUpperCase()}
                      </Badge>
                      {selectedAlert.acknowledged && (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          확인됨
                        </Badge>
                      )}
                    </div>
                    <h3 className="font-semibold text-lg">{selectedAlert.message}</h3>
                  </div>
                </div>
              </div>

              {/* Alert Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">발생 시각</div>
                    <div className="font-semibold flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {selectedAlert.timestamp.toLocaleString('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">발생 소스</div>
                    <div className="font-semibold flex items-center gap-2">
                      <Server className="h-4 w-4" />
                      {selectedAlert.source}
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">심각도</div>
                    <div className="font-semibold">
                      {selectedAlert.severity === 'critical' ? '긴급' :
                        selectedAlert.severity === 'warning' ? '경고' : '정보'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">상태</div>
                    <div className="font-semibold">
                      {selectedAlert.acknowledged ? '확인됨' : '미확인'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Detailed Description */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  상세 설명
                </h3>
                <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {selectedAlert.severity === 'critical' && selectedAlert.message.includes('CPU') &&
                      'CPU 사용률이 임계값(90%)을 초과했습니다. 시스템 성능 저하가 발생할 수 있으며, 즉각적인 조치가 필요합니다. 현재 실행 중인 프로세스를 확인하고 리소스 사용량이 높은 쿼리를 최적화하거나 종료하세요.'}
                    {selectedAlert.severity === 'warning' && selectedAlert.message.includes('query') &&
                      '5분 이상 실행되는 장기 실행 쿼리가 감지되었습니다. 이러한 쿼리는 데이터베이스 리소스를 과도하게 사용하여 다른 작업의 성능에 영향을 줄 수 있습니다. SQL 실행 계획을 검토하고 인덱스 추가 또는 쿼리 최적화를 고려하세요.'}
                    {selectedAlert.severity === 'warning' && selectedAlert.message.includes('Tablespace') &&
                      '테이블스페이스 사용률이 85%를 초과했습니다. 디스크 공간 부족으로 인한 데이터베이스 작업 실패를 방지하기 위해 테이블스페이스를 확장하거나 불필요한 데이터를 정리하세요.'}
                    {selectedAlert.severity === 'info' && selectedAlert.message.includes('pattern') &&
                      'AI 분석기가 새로운 SQL 성능 패턴을 식별했습니다. 이 패턴은 향후 성능 최적화를 위한 참고 자료로 활용될 수 있습니다. 상세 분석 보고서를 확인하세요.'}
                  </p>
                </div>
              </div>

              {/* Recommended Actions */}
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  권장 조치사항
                </h3>
                <div className="space-y-2">
                  {selectedAlert.severity === 'critical' && selectedAlert.message.includes('CPU') && (
                    <>
                      <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-900 rounded">
                        <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                          1
                        </div>
                        <div>
                          <div className="font-medium">실행 중인 세션 확인</div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            활성 세션 탭에서 CPU 사용량이 높은 세션을 식별하세요
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-900 rounded">
                        <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                          2
                        </div>
                        <div>
                          <div className="font-medium">문제 쿼리 최적화</div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            SQL 성능 탭에서 Grade D/F 등급 쿼리를 확인하고 최적화하세요
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-900 rounded">
                        <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                          3
                        </div>
                        <div>
                          <div className="font-medium">리소스 스케일링 검토</div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            지속적인 고부하 시 CPU 리소스 증설을 고려하세요
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                  {selectedAlert.severity === 'warning' && selectedAlert.message.includes('query') && (
                    <>
                      <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-900 rounded">
                        <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                          1
                        </div>
                        <div>
                          <div className="font-medium">쿼리 실행 계획 분석</div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            EXPLAIN PLAN을 사용하여 쿼리의 실행 계획을 확인하세요
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-900 rounded">
                        <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                          2
                        </div>
                        <div>
                          <div className="font-medium">인덱스 최적화</div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            적절한 인덱스가 있는지 확인하고 필요시 추가하세요
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                  {selectedAlert.severity === 'warning' && selectedAlert.message.includes('Tablespace') && (
                    <>
                      <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-900 rounded">
                        <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                          1
                        </div>
                        <div>
                          <div className="font-medium">테이블스페이스 확장</div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            데이터 파일을 추가하거나 기존 파일 크기를 늘리세요
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-900 rounded">
                        <div className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                          2
                        </div>
                        <div>
                          <div className="font-medium">불필요한 데이터 정리</div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            오래된 데이터를 아카이브하거나 삭제하세요
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                  {selectedAlert.severity === 'info' && (
                    <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-gray-900 rounded">
                      <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs flex-shrink-0 mt-0.5">
                        ℹ️
                      </div>
                      <div>
                        <div className="font-medium">정보 확인</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          이 알림은 정보 제공 목적이며 즉각적인 조치가 필요하지 않습니다
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setShowAlertDetailModal(false)}>
                  닫기
                </Button>
                {!selectedAlert.acknowledged && (
                  <Button
                    onClick={() => {
                      handleAcknowledgeAlert(selectedAlert.id)
                      setShowAlertDetailModal(false)
                    }}
                  >
                    확인 처리
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 시간 범위 SQL 정보 모달 */}
      <Dialog open={isTimeRangeDialogOpen} onOpenChange={setIsTimeRangeDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              선택된 시간 구간의 SQL 정보
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 mt-2">
                {selectedTimeRange ? (
                  <>
                    <span className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {selectedTimeRange.start.toLocaleTimeString('ko-KR')} ~ {selectedTimeRange.end.toLocaleTimeString('ko-KR')}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        ({timeRangeSQLs.length}개 SQL 발견)
                      </span>
                    </span>
                    {/* 데이터 소스에 따른 안내 메시지 */}
                    {timeRangeSQLs.length > 0 && timeRangeSQLs[0]?.dataSource === 'ash' ? (
                      <div className="text-xs text-muted-foreground bg-green-50 dark:bg-green-950 p-2 rounded border border-green-200 dark:border-green-800">
                        ✅ <strong>Enterprise Edition</strong> - V$ACTIVE_SESSION_HISTORY(ASH)에서 해당 시간대에 실제 실행된 SQL을 조회합니다. (최근 ~1시간 데이터)
                      </div>
                    ) : timeRangeSQLs.length > 0 ? (
                      <div className="text-xs text-muted-foreground bg-yellow-50 dark:bg-yellow-950 p-2 rounded border border-yellow-200 dark:border-yellow-800">
                        ⚠️ <strong>Standard Edition</strong> - V$SQL의 last_active_time 기준으로 필터링합니다. 현재 메모리에 캐시된 SQL 중 해당 시간대에 마지막으로 실행된 SQL을 표시합니다.
                      </div>
                    ) : null}
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">시간 구간을 선택해주세요.</span>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {isLoadingTimeRangeSQLs ? (
              <div className="py-8 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-3"></div>
                <p className="text-sm text-muted-foreground">시간 범위의 SQL 데이터를 조회하고 있습니다...</p>
              </div>
            ) : timeRangeSQLs.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">선택된 시간 범위에 SQL 데이터가 없습니다.</p>
                <div className="mt-4 text-xs space-y-2 max-w-md mx-auto text-left bg-muted/50 p-4 rounded-lg">
                  <p className="font-medium text-foreground">가능한 원인:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                    <li><strong>Enterprise Edition (ASH)</strong>: 해당 시간대에 활성 세션이 없었거나, SQL이 1초 이내에 완료되어 샘플링되지 않았습니다.</li>
                    <li><strong>Standard Edition (V$SQL)</strong>: 해당 시간대에 실행된 SQL이 캐시에서 제거되었거나, 시스템 사용자(SYS, SYSTEM)의 SQL만 있었습니다.</li>
                    <li><strong>시간 범위</strong>: 선택한 시간 범위가 너무 짧거나 과거 데이터일 수 있습니다.</li>
                  </ul>
                  <p className="mt-3 text-muted-foreground">
                    <strong>팁:</strong> 차트에서 CPU 사용량이 높은 구간을 선택하면 관련 SQL을 찾을 가능성이 높습니다.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* SQL 목록 테이블 형식 */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b">
                      <tr className="text-left">
                        <th className="py-3 px-4 font-semibold">SQL ID</th>
                        <th className="py-3 px-4 font-semibold">등급</th>
                        {/* Enterprise Edition(ASH)인 경우에만 활성 시간 컬럼 표시 */}
                        {timeRangeSQLs[0]?.dataSource === 'ash' && (
                          <th className="py-3 px-4 font-semibold text-right">
                            <span title="ASH 샘플 수 (1초 간격 샘플링, 값이 클수록 해당 시간대에 오래 실행됨)">
                              활성 시간
                            </span>
                          </th>
                        )}
                        <th className="py-3 px-4 font-semibold text-right">CPU 시간</th>
                        <th className="py-3 px-4 font-semibold text-right">Buffer Gets</th>
                        <th className="py-3 px-4 font-semibold text-right">실행 횟수</th>
                        <th className="py-3 px-4 font-semibold">액션</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timeRangeSQLs.map((sql: any, idx) => (
                        <tr
                          key={sql.id || `time-range-${sql.sql_id}-${idx}-${sql.sample_count || 0}-${sql.metrics?.elapsed_time || 0}`}
                          className="border-b hover:bg-muted/50 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                              {sql.sql_id.replace(/^SQL_/, '')}
                            </code>
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              variant={sql.grade === 'F' ? 'destructive' : sql.grade === 'D' ? 'destructive' : sql.grade === 'C' ? 'outline' : 'secondary'}
                              className="text-xs"
                            >
                              Grade {sql.grade}
                            </Badge>
                          </td>
                          {/* Enterprise Edition(ASH)인 경우에만 활성 시간 셀 표시 */}
                          {sql.dataSource === 'ash' && (
                            <td className="py-3 px-4 text-right">
                              {sql.sample_count ? (
                                <Badge variant="outline" className="font-mono text-xs">
                                  {sql.sample_count}s
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                          )}
                          <td className="py-3 px-4 text-right font-mono">
                            {sql.metrics.cpu_time.toFixed(2)}ms
                          </td>
                          <td className="py-3 px-4 text-right font-mono">
                            {sql.metrics.buffer_gets.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-mono">
                            {sql.metrics.executions.toLocaleString()}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => {
                                  // SQL 상세 정보로 이동
                                  const sqlPerformancePoint = {
                                    sql_id: sql.sql_id,
                                    x: sql.metrics.cpu_time,
                                    y: sql.metrics.buffer_gets,
                                    size: sql.metrics.buffer_gets,
                                    grade: sql.grade,
                                    metrics: sql.metrics
                                  }
                                  setSelectedPoint(sqlPerformancePoint)
                                  setIsTimeRangeDialogOpen(false)
                                  setShowSqlDetailModal(true)
                                }}
                              >
                                <Database className="h-3 w-3 mr-1" />
                                상세
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => {
                                  router.push(`/tuning/history?sql_id=${sql.sql_id}&connection_id=${selectedConnectionId}`)
                                }}
                              >
                                <History className="h-3 w-3 mr-1" />
                                히스토리
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 등급별 요약 */}
                <div className="grid grid-cols-5 gap-3 p-4 bg-muted/30 rounded-lg">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {timeRangeSQLs.filter(s => s.grade === 'A').length}
                    </div>
                    <div className="text-xs text-muted-foreground">Grade A</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-lime-600">
                      {timeRangeSQLs.filter(s => s.grade === 'B').length}
                    </div>
                    <div className="text-xs text-muted-foreground">Grade B</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-amber-600">
                      {timeRangeSQLs.filter(s => s.grade === 'C').length}
                    </div>
                    <div className="text-xs text-muted-foreground">Grade C</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-500">
                      {timeRangeSQLs.filter(s => s.grade === 'D').length}
                    </div>
                    <div className="text-xs text-muted-foreground">Grade D</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {timeRangeSQLs.filter(s => s.grade === 'F').length}
                    </div>
                    <div className="text-xs text-muted-foreground">Grade F</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 필터 설정 다이얼로그 */}
      <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              필터 설정
            </DialogTitle>
            <DialogDescription>
              모니터링 데이터 필터링 옵션을 설정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">문제 SQL만 표시</p>
                <p className="text-xs text-muted-foreground">심각한 성능 문제가 있는 SQL만 표시</p>
              </div>
              <input
                type="checkbox"
                checked={filterOptions.showOnlyCritical}
                onChange={(e) => setFilterOptions({ ...filterOptions, showOnlyCritical: e.target.checked })}
                className="h-4 w-4"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">최소 응답시간 (ms)</label>
              <input
                type="number"
                value={filterOptions.minElapsedTime}
                onChange={(e) => setFilterOptions({ ...filterOptions, minElapsedTime: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border rounded-md text-sm"
                placeholder="0"
                min="0"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">최소 Buffer Gets</label>
              <input
                type="number"
                value={filterOptions.minBufferGets}
                onChange={(e) => setFilterOptions({ ...filterOptions, minBufferGets: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border rounded-md text-sm"
                placeholder="0"
                min="0"
              />
            </div>
          </div>
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => setFilterOptions({ showOnlyCritical: false, minElapsedTime: 0, minBufferGets: 0 })}
            >
              초기화
            </Button>
            <Button onClick={() => setIsFilterDialogOpen(false)}>
              적용
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 모니터링 설정 다이얼로그 */}
      <Dialog open={isSettingsDialogOpen} onOpenChange={setIsSettingsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              모니터링 설정
            </DialogTitle>
            <DialogDescription>
              모니터링 동작 방식을 설정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">데이터 조회 시간 범위</label>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1m">최근 1분</SelectItem>
                  <SelectItem value="5m">최근 5분</SelectItem>
                  <SelectItem value="10m">최근 10분</SelectItem>
                  <SelectItem value="15m">최근 15분</SelectItem>
                  <SelectItem value="30m">최근 30분</SelectItem>
                  <SelectItem value="1h">최근 1시간</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">자동 새로고침 간격</label>
              <Select value={refreshInterval.toString()} onValueChange={(value) => setRefreshInterval(parseInt(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5초</SelectItem>
                  <SelectItem value="10">10초</SelectItem>
                  <SelectItem value="30">30초</SelectItem>
                  <SelectItem value="60">1분</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">자동 새로고침</p>
                <p className="text-xs text-muted-foreground">설정된 간격으로 자동 갱신</p>
              </div>
              <input
                type="checkbox"
                checked={isAutoRefresh}
                onChange={(e) => setIsAutoRefresh(e.target.checked)}
                className="h-4 w-4"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setIsSettingsDialogOpen(false)}>
              확인
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
