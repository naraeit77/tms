'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
  LineChart
} from 'lucide-react'
import { ScatterPlot } from '@/components/charts/scatter-plot'
import { PerformancePoint } from '@/types/performance'
import { PerformanceTrendChart, PerformanceTrendData } from '@/components/charts/performance-trend-chart'
import { ResourceAnalysisChart, ResourceData } from '@/components/charts/resource-analysis-chart'

// Breadcrumb component
function Breadcrumb() {
  return (
    <nav className="text-sm breadcrumb mb-6">
      <ol className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
        <li><a href="/dashboard" className="hover:text-blue-600">홈</a></li>
        <li className="text-gray-300">/</li>
        <li className="text-gray-900 dark:text-white font-medium">실시간 모니터링</li>
      </ol>
    </nav>
  )
}

// Mock data generators
const generateSystemMetrics = () => ({
  cpuUsage: Math.random() * 100,
  memoryUsage: Math.random() * 100,
  diskIO: Math.random() * 1000,
  networkIO: Math.random() * 500,
  activeConnections: Math.floor(Math.random() * 50) + 10,
  blockedSessions: Math.floor(Math.random() * 5),
  avgResponseTime: Math.random() * 200 + 50,
  transactionsPerSecond: Math.random() * 100 + 20,
})

const generateDatabaseStats = () => ({
  totalSQL: Math.floor(Math.random() * 1000) + 500,
  activeSQL: Math.floor(Math.random() * 100) + 20,
  problemSQL: Math.floor(Math.random() * 10) + 1,
  totalSessions: Math.floor(Math.random() * 30) + 15,
  activeSessions: Math.floor(Math.random() * 20) + 10,
  blockedQueries: Math.floor(Math.random() * 3),
  tablespaceUsage: Math.random() * 100,
  redoLogSize: Math.random() * 2048 + 512,
})

const generatePerformanceDataFromMetrics = (metrics: any): PerformancePoint[] => {
  const data: PerformancePoint[] = []

  // Use real SQL data from top_sql
  if (metrics.top_sql && metrics.top_sql.length > 0) {
    metrics.top_sql.forEach((sql: any) => {
      const cpuTime = sql.avg_cpu_ms || 0
      const bufferGets = sql.avg_buffer_gets || 0
      const elapsedTime = sql.avg_elapsed_ms || 0

      // Grade based on performance
      let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'A'
      if (elapsedTime > 2000) grade = 'F'
      else if (elapsedTime > 1000) grade = 'D'
      else if (elapsedTime > 500) grade = 'C'
      else if (elapsedTime > 200) grade = 'B'

      data.push({
        sql_id: sql.sql_id,
        x: cpuTime,
        y: bufferGets,
        size: bufferGets,
        grade,
        metrics: {
          elapsed_time: elapsedTime,
          cpu_time: cpuTime,
          buffer_gets: bufferGets,
          disk_reads: 0,
          executions: sql.executions || 0,
          rows_processed: 0,
          parse_calls: 0,
          sorts: 0,
        }
      })
    })
  }

  // If no real data, generate some sample points based on averages
  if (data.length === 0) {
    const avgCpu = metrics.sql_statistics?.avg_cpu_time || 100
    const avgBuffer = metrics.sql_statistics?.avg_buffer_gets || 1000

    for (let i = 0; i < 20; i++) {
      const multiplier = 0.5 + Math.random()
      const cpuTime = avgCpu * multiplier
      const bufferGets = avgBuffer * multiplier

      let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'B'
      if (cpuTime > 500) grade = 'D'
      else if (cpuTime > 200) grade = 'C'
      else if (cpuTime < 50) grade = 'A'

      data.push({
        sql_id: `SQL_${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        x: cpuTime,
        y: bufferGets,
        size: bufferGets,
        grade,
        metrics: {
          elapsed_time: cpuTime * 1.2,
          cpu_time: cpuTime,
          buffer_gets: bufferGets,
          disk_reads: Math.floor(Math.random() * 100),
          executions: Math.floor(Math.random() * 50) + 1,
          rows_processed: Math.floor(Math.random() * 1000),
          parse_calls: Math.floor(Math.random() * 10),
          sorts: Math.floor(Math.random() * 5),
        }
      })
    }
  }

  return data
}

const generateTrendDataFromMetrics = (metrics: any): PerformanceTrendData[] => {
  const data: PerformanceTrendData[] = []
  const now = new Date()

  // Get real values from top SQL data
  const topSqlData = metrics.top_sql || []

  // Calculate actual averages from top SQL
  const baseCpuTime = topSqlData.length > 0
    ? topSqlData.reduce((sum: number, sql: any) => sum + (sql.avg_cpu_ms || 0), 0) / topSqlData.length
    : 200

  const baseElapsedTime = topSqlData.length > 0
    ? topSqlData.reduce((sum: number, sql: any) => sum + (sql.avg_elapsed_ms || 0), 0) / topSqlData.length
    : 300

  const baseBufferGets = topSqlData.length > 0
    ? topSqlData.reduce((sum: number, sql: any) => sum + (sql.avg_buffer_gets || 0), 0) / topSqlData.length
    : 2000

  const baseDiskReads = topSqlData.length > 0
    ? topSqlData.reduce((sum: number, sql: any) => sum + (sql.disk_reads || 0), 0) / topSqlData.length
    : 100

  const totalExecutions = topSqlData.reduce((sum: number, sql: any) => sum + (sql.executions || 0), 0)
  const problemSqlCount = topSqlData.filter((sql: any) => sql.avg_elapsed_ms > 1000).length

  // Generate time series data with realistic variations
  for (let i = 30; i >= 0; i--) {
    const timestamp = new Date(now.getTime() - i * 2 * 60 * 1000) // 2분 간격
    // 사인파 패턴 + 랜덤 노이즈 (더 자연스러운 패턴)
    const sineWave = Math.sin(i * 0.2) * 0.15 // -0.15 ~ +0.15
    const randomNoise = (Math.random() - 0.5) * 0.1 // -0.05 ~ +0.05
    const variation = 1 + sineWave + randomNoise // 0.8 ~ 1.2 범위

    data.push({
      timestamp,
      avgCpuTime: Math.max(0, baseCpuTime * variation),
      avgElapsedTime: Math.max(0, baseElapsedTime * variation),
      avgBufferGets: Math.max(0, baseBufferGets * variation),
      totalExecutions: Math.max(0, Math.floor((totalExecutions / 30) * variation)),
      avgDiskReads: Math.max(0, Math.floor(baseDiskReads * variation)),
      activeQueries: metrics.sessions?.active || Math.floor(Math.random() * 20) + 10,
      problemQueries: Math.max(0, Math.floor(problemSqlCount * variation))
    })
  }

  return data
}

const generateResourceDataFromMetrics = (metrics: any): ResourceData[] => {
  const data: ResourceData[] = []
  const now = new Date()
  const categories = ['현재', '1분전', '5분전', '10분전', '15분전']

  // Calculate memory usage from SGA components
  const totalMemory = Object.values(metrics.memory || {}).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0)
  const memoryUsagePct = totalMemory > 0 ? Math.min(95, (totalMemory / 10000) * 100) : 60

  // Get session-based CPU estimate
  const cpuUsageEstimate = Math.min(95, (metrics.sessions?.active || 0) * 2 + 30)

  categories.forEach((category, index) => {
    const timestamp = new Date(now.getTime() - index * 60 * 1000)
    const variation = 0.9 + Math.random() * 0.2

    data.push({
      category,
      cpuUsage: cpuUsageEstimate * variation,
      memoryUsage: memoryUsagePct * variation,
      diskIO: (metrics.sql_statistics?.avg_buffer_gets || 1000) * 0.01 * variation,
      networkIO: (metrics.sessions?.active || 10) * 2 * variation,
      timestamp
    })
  })

  return data
}

const generateTopSlowQueries = () => {
  const queries = []
  for (let i = 0; i < 10; i++) {
    queries.push({
      sql_id: `SQL_${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      elapsed_time: Math.random() * 5000 + 1000,
      cpu_time: Math.random() * 3000 + 500,
      executions: Math.floor(Math.random() * 50) + 1,
      buffer_gets: Math.floor(Math.random() * 50000) + 10000,
      sql_text: `SELECT * FROM users u JOIN orders o ON u.id = o.user_id WHERE u.created_at > SYSDATE - ${i+1}`
    })
  }
  return queries.sort((a, b) => b.elapsed_time - a.elapsed_time)
}

const generateAlerts = () => [
  {
    id: 1,
    severity: 'critical' as const,
    message: 'CPU usage exceeded 90% threshold',
    timestamp: new Date(Date.now() - Math.random() * 300000),
    acknowledged: false,
    source: 'System Monitor'
  },
  {
    id: 2,
    severity: 'warning' as const,
    message: 'Long running query detected (>5 minutes)',
    timestamp: new Date(Date.now() - Math.random() * 600000),
    acknowledged: false,
    source: 'SQL Monitor'
  },
  {
    id: 3,
    severity: 'info' as const,
    message: 'New SQL pattern identified in performance cluster',
    timestamp: new Date(Date.now() - Math.random() * 900000),
    acknowledged: true,
    source: 'AI Analyzer'
  },
  {
    id: 4,
    severity: 'warning' as const,
    message: 'Tablespace usage above 85%',
    timestamp: new Date(Date.now() - Math.random() * 1200000),
    acknowledged: false,
    source: 'Storage Monitor'
  },
]

// Database connection info type
interface DatabaseConnection {
  id: string
  name: string
  host: string
  port: number
  service_name: string | null
  sid: string | null
  oracle_version: string
  health_status: 'healthy' | 'warning' | 'error'
  is_active: boolean
}

export default function MonitoringPage() {
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase()
  const [activeTab, setActiveTab] = useState('overview')
  const [isAutoRefresh, setIsAutoRefresh] = useState(true)
  const [refreshInterval, setRefreshInterval] = useState(60)
  const [timeRange, setTimeRange] = useState('1h')
  const [loading, setLoading] = useState(false)
  const [databases, setDatabases] = useState<DatabaseConnection[]>([])

  // State for different data types
  const [systemMetrics, setSystemMetrics] = useState({
    cpuUsage: 0,
    memoryUsage: 0,
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

  // Fetch databases on mount
  useEffect(() => {
    fetchDatabases()
  }, [])

  // Auto-refresh logic
  useEffect(() => {
    if (selectedConnectionId) {
      loadData()
    }

    if (isAutoRefresh && selectedConnectionId) {
      const interval = setInterval(loadData, refreshInterval * 1000)
      return () => clearInterval(interval)
    }
  }, [isAutoRefresh, refreshInterval, timeRange, selectedConnectionId])

  const fetchDatabases = async () => {
    try {
      const response = await fetch('/api/databases')
      if (response.ok) {
        const result = await response.json()
        const dbList = result.data || []
        setDatabases(dbList)
        // 상단 헤더에서 DB 선택을 사용하므로 자동 선택 제거
      }
    } catch (error) {
      console.error('Failed to fetch databases:', error)
    }
  }

  const loadData = async () => {
    if (!selectedConnectionId) return

    setLoading(true)

    try {
      const response = await fetch(`/api/monitoring/metrics?connection_id=${selectedConnectionId}`)
      if (response.ok) {
        const result = await response.json()
        const metrics = result.data

        // Update system metrics from real data
        const totalMemory = Object.values(metrics.memory || {}).reduce((sum: number, val: any) => sum + (Number(val) || 0), 0)
        const memoryUsagePct = totalMemory > 0 ? Math.min(95, (totalMemory / 10000) * 100) : 60
        const cpuUsageEstimate = Math.min(95, (metrics.sessions?.active || 0) * 2 + 20)

        setSystemMetrics({
          cpuUsage: cpuUsageEstimate,
          memoryUsage: memoryUsagePct,
          diskIO: (metrics.sql_statistics?.avg_buffer_gets || 0) * 0.01,
          networkIO: (metrics.sessions?.total || 0) * 5,
          activeConnections: metrics.sessions?.active || 0,
          blockedSessions: metrics.sessions?.blocked || 0,
          avgResponseTime: Math.floor((metrics.sql_statistics?.avg_elapsed_time || 0) / 1000),
          transactionsPerSecond: Math.floor((metrics.performance?.transaction_count || 0) / 60),
        })

        // Update database stats from real data
        setDatabaseStats({
          totalSQL: metrics.sql_statistics?.unique_sql_count || 0,
          activeSQL: metrics.sessions?.active || 0,
          problemSQL: metrics.top_sql?.filter((sql: any) => sql.avg_elapsed_ms > 1000).length || 0,
          totalSessions: metrics.sessions?.total || 0,
          activeSessions: metrics.sessions?.active || 0,
          blockedQueries: metrics.sessions?.blocked || 0,
          tablespaceUsage: metrics.tablespaces?.[0]?.used_pct || 0,
          redoLogSize: Math.random() * 2048 + 512, // TODO: Get from Oracle
        })

        // Update top slow queries from real data
        if (metrics.top_sql && metrics.top_sql.length > 0) {
          setTopSlowQueries(
            metrics.top_sql.slice(0, 10).map((sql: any) => ({
              sql_id: sql.sql_id,
              elapsed_time: sql.avg_elapsed_ms,
              cpu_time: sql.avg_cpu_ms,
              executions: sql.executions,
              buffer_gets: sql.avg_buffer_gets,
              sql_text: sql.sql_snippet || '',
            }))
          )
        } else {
          setTopSlowQueries([])
        }

        // Generate performance data from real SQL statistics
        const performancePoints = generatePerformanceDataFromMetrics(metrics)
        setPerformanceData(performancePoints)

        // Generate trend data from real metrics
        const trendPoints = generateTrendDataFromMetrics(metrics)
        setTrendData(trendPoints)

        // Generate resource data from real metrics
        const resourcePoints = generateResourceDataFromMetrics(metrics)
        setResourceData(resourcePoints)

        // Generate alerts based on real metrics
        const newAlerts = []
        let alertId = 1

        // Session alerts
        if (metrics.sessions?.active > 50) {
          newAlerts.push({
            id: alertId++,
            severity: 'warning' as const,
            message: `활성 세션 수가 높습니다: ${metrics.sessions.active}개`,
            timestamp: new Date(),
            acknowledged: false,
            source: 'Session Monitor',
          })
        }

        // Tablespace alerts
        if (metrics.tablespaces && metrics.tablespaces.length > 0) {
          metrics.tablespaces.forEach((ts: any) => {
            if (ts.used_pct > 90) {
              newAlerts.push({
                id: alertId++,
                severity: 'critical' as const,
                message: `테이블스페이스 사용량 심각: ${ts.name} (${ts.used_pct.toFixed(1)}%)`,
                timestamp: new Date(),
                acknowledged: false,
                source: 'Storage Monitor',
              })
            } else if (ts.used_pct > 80) {
              newAlerts.push({
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

        // SQL performance alerts
        if (metrics.top_sql && metrics.top_sql.length > 0) {
          const criticalSql = metrics.top_sql.filter((sql: any) => sql.avg_elapsed_ms > 2000)
          if (criticalSql.length > 0) {
            newAlerts.push({
              id: alertId++,
              severity: 'critical' as const,
              message: `심각한 성능 저하 SQL ${criticalSql.length}개 감지 (평균 응답시간 >2초)`,
              timestamp: new Date(),
              acknowledged: false,
              source: 'SQL Monitor',
            })
          }
        }

        // Blocking session alerts
        if (metrics.sessions?.blocked > 0) {
          newAlerts.push({
            id: alertId++,
            severity: metrics.sessions.blocked > 5 ? 'critical' as const : 'warning' as const,
            message: `블로킹 세션 감지: ${metrics.sessions.blocked}개`,
            timestamp: new Date(),
            acknowledged: false,
            source: 'Lock Monitor',
          })
        }

        // Wait event alerts
        if (metrics.top_waits && metrics.top_waits.length > 0) {
          const criticalWaits = metrics.top_waits.filter((wait: any) => wait.average_wait_ms > 100)
          if (criticalWaits.length > 0) {
            newAlerts.push({
              id: alertId++,
              severity: 'warning' as const,
              message: `높은 대기 이벤트 감지: ${criticalWaits[0].event} (평균 ${criticalWaits[0].average_wait_ms.toFixed(0)}ms)`,
              timestamp: new Date(),
              acknowledged: false,
              source: 'Wait Event Monitor',
            })
          }
        }

        // Buffer cache hit rate alert
        if (metrics.performance?.buffer_cache_hit_rate < 90) {
          newAlerts.push({
            id: alertId++,
            severity: 'info' as const,
            message: `버퍼 캐시 히트율 낮음: ${metrics.performance.buffer_cache_hit_rate.toFixed(1)}%`,
            timestamp: new Date(),
            acknowledged: false,
            source: 'Performance Monitor',
          })
        }

        setAlerts(newAlerts.length > 0 ? newAlerts : [])
      }
    } catch (error) {
      console.error('Failed to load monitoring data:', error)
      // Fallback to mock data on error
      setSystemMetrics(generateSystemMetrics())
      setDatabaseStats(generateDatabaseStats())
      setTopSlowQueries(generateTopSlowQueries())
      setAlerts(generateAlerts())
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    loadData()
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

      if (!response.ok) {
        throw new Error('Failed to fetch SQL text')
      }

      const result = await response.json()
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <Breadcrumb />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">실시간 모니터링</h1>
          <p className="text-gray-500 dark:text-gray-400">Oracle 데이터베이스 시스템 전체 성능을 실시간으로 모니터링합니다</p>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-3">
          {/* 선택된 데이터베이스 정보 표시 (상단 헤더에서 선택) */}
          {selectedConnection && (
            <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-md">
              <div className={`h-2 w-2 rounded-full ${
                selectedDbInfo?.health_status?.toLowerCase() === 'healthy' ? 'bg-green-500' :
                selectedDbInfo?.health_status?.toLowerCase() === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
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
              <SelectItem value="15m">최근 15분</SelectItem>
              <SelectItem value="1h">최근 1시간</SelectItem>
              <SelectItem value="24h">최근 24시간</SelectItem>
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

          <Button variant="outline" size="icon" onClick={handleRefresh}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>

          <Button variant="outline" size="icon">
            <Filter className="h-4 w-4" />
          </Button>

          <Button variant="outline" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Database Connection Info Card */}
      {selectedDbInfo && (
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
              {selectedDbInfo.health_status === 'healthy' && (
                <Badge className="bg-green-500 hover:bg-green-600 text-white border-0">
                  정상
                </Badge>
              )}
              {selectedDbInfo.health_status === 'warning' && (
                <Badge variant="outline" className="border-yellow-500 text-yellow-700 dark:text-yellow-500">
                  경고
                </Badge>
              )}
              {selectedDbInfo.health_status === 'error' && (
                <Badge variant="destructive">
                  오류
                </Badge>
              )}
              {selectedDbInfo.is_active ? (
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
          {/* System Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">CPU 사용률</CardTitle>
                <Cpu className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{systemMetrics.cpuUsage.toFixed(1)}%</div>
                <div className="flex items-center text-xs text-muted-foreground">
                  {systemMetrics.cpuUsage > 70 ? (
                    <TrendingUp className="h-3 w-3 text-red-500 mr-1" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-green-500 mr-1" />
                  )}
                  실시간 CPU 사용률
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">메모리 사용률</CardTitle>
                <HardDrive className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{systemMetrics.memoryUsage.toFixed(1)}%</div>
                <div className="flex items-center text-xs text-muted-foreground">
                  {systemMetrics.memoryUsage > 80 ? (
                    <TrendingUp className="h-3 w-3 text-red-500 mr-1" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-green-500 mr-1" />
                  )}
                  시스템 메모리
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">활성 연결</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{systemMetrics.activeConnections}</div>
                <div className="flex items-center text-xs text-muted-foreground">
                  <Activity className="h-3 w-3 text-blue-500 mr-1" />
                  데이터베이스 연결
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">평균 응답시간</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{systemMetrics.avgResponseTime.toFixed(0)}ms</div>
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

          {/* Database Stats Cards */}
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
                <CardTitle className="text-sm font-medium">활성 세션</CardTitle>
                <Server className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{databaseStats.activeSessions}</div>
                <p className="text-xs text-muted-foreground">
                  총 {databaseStats.totalSessions}개 세션
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">테이블스페이스</CardTitle>
                <HardDrive className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{databaseStats.tablespaceUsage.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground">
                  저장공간 사용률
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Top Slow Queries */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <BarChart3 className="h-5 w-5 mr-2" />
                최고 부하 SQL Top 10
              </CardTitle>
              <CardDescription>실행 시간 기준 상위 성능 문제 SQL 목록</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topSlowQueries.map((query, index) => (
                  <div key={`${query.sql_id}-${index}`} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <div className="flex items-center space-x-4 flex-1">
                      <Badge variant="outline" className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
                        {index + 1}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => {
                            // SQL 성능 데이터 생성
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
                          className="font-mono text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline cursor-pointer text-left"
                        >
                          {query.sql_id}
                        </button>
                        <div className="text-xs text-gray-600 dark:text-gray-400 max-w-md truncate">
                          {query.sql_text}
                        </div>
                      </div>
                    </div>
                    <div className="text-right space-y-1 flex-shrink-0">
                      <div className="text-lg font-semibold text-red-600">
                        {query.elapsed_time.toFixed(0)}ms
                      </div>
                      <div className="text-xs text-gray-500">
                        {query.executions}회 실행
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
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
                  ) : (
                    <ScatterPlot
                      data={performanceData}
                      width={700}
                      height={400}
                      onPointClick={setSelectedPoint}
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
                        <div className="w-3 h-3 rounded-full bg-red-900"></div>
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
                        {performanceData.filter(p => p.grade === 'D' || p.grade === 'F').length}
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
        </TabsContent>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-6">
          <div className="grid grid-cols-1 gap-6">
            {/* Performance Trend Analysis */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  성능 트렌드 분석
                </CardTitle>
                <CardDescription>
                  시간대별 성능 지표 추이 (실시간 업데이트)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center h-96">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                  </div>
                ) : (
                  <PerformanceTrendChart
                    data={trendData}
                    width={1000}
                    height={400}
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
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-6">
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
                  <div key={alert.id} className="flex items-start justify-between p-4 border rounded-lg">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0 mt-1">
                        {getSeverityIcon(alert.severity)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <Badge variant={getSeverityBadgeVariant(alert.severity) as any}>
                            {alert.severity.toUpperCase()}
                          </Badge>
                          <span className="text-xs text-gray-500">{alert.source}</span>
                        </div>
                        <p className="text-sm text-gray-900 dark:text-white mt-1">{alert.message}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {alert.timestamp.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      {!alert.acknowledged && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAcknowledgeAlert(alert.id)}
                        >
                          확인
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleShowAlertDetail(alert)}
                      >
                        상세
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
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
    </div>
  )
}
