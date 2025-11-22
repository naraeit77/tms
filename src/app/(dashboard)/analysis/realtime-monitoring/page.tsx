'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSelectedDatabase } from '@/hooks/use-selected-database'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import {
  ArrowLeft,
  AlertTriangle,
  Activity,
  Play,
  Pause,
  Settings,
  Bell,
  TrendingUp,
  Clock,
  Zap,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

interface RealtimeSQL {
  sql_id: string
  sql_text: string
  status: 'EXECUTING' | 'WAITING' | 'COMPLETED'
  elapsed_time_ms: number
  cpu_time_ms: number
  wait_event: string
  session_id: number
  username: string
  start_time: string
}

export default function RealtimeMonitoringPage() {
  const router = useRouter()
  const { selectedConnectionId } = useSelectedDatabase()
  const [isMonitoring, setIsMonitoring] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refreshInterval, setRefreshInterval] = useState(2000) // 2초
  const [cpuThreshold, setCpuThreshold] = useState(1000) // 1초
  const [alertsEnabled, setAlertsEnabled] = useState(true)

  // 실시간 SQL 조회
  const { data: realtimeSQLs, isLoading, refetch } = useQuery({
    queryKey: ['realtime-monitoring', selectedConnectionId],
    queryFn: async () => {
      if (!selectedConnectionId || selectedConnectionId === 'all') {
        return []
      }

      const res = await fetch(`/api/analysis/realtime-monitoring?connection_id=${selectedConnectionId}`)
      if (!res.ok) throw new Error('Failed to fetch realtime data')

      const data = await res.json()
      return data.data || []
    },
    enabled: !!selectedConnectionId && selectedConnectionId !== 'all' && isMonitoring,
    refetchInterval: autoRefresh ? refreshInterval : false,
  })

  // 임계값 초과 알림
  useEffect(() => {
    if (!alertsEnabled || !realtimeSQLs) return

    const criticalSQLs = realtimeSQLs.filter(
      (sql: RealtimeSQL) => sql.cpu_time_ms > cpuThreshold && sql.status === 'EXECUTING'
    )

    if (criticalSQLs.length > 0) {
      // 브라우저 알림 (권한 필요)
      if (Notification.permission === 'granted') {
        new Notification('성능 임계값 초과', {
          body: `${criticalSQLs.length}개의 SQL이 CPU 시간 임계값을 초과했습니다.`,
          icon: '/icon.png',
        })
      }
    }
  }, [realtimeSQLs, cpuThreshold, alertsEnabled])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'EXECUTING': return 'bg-green-100 text-green-800 border-green-200'
      case 'WAITING': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'COMPLETED': return 'bg-gray-100 text-gray-800 border-gray-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    if (status === 'EXECUTING') return <Activity className="h-4 w-4 animate-pulse" />
    if (status === 'WAITING') return <Clock className="h-4 w-4" />
    return <Zap className="h-4 w-4" />
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-3">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">실시간 성능 모니터링</h1>
              <p className="text-gray-500 dark:text-gray-400">실시간 SQL 실행 추적 및 알람</p>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant={isMonitoring ? 'destructive' : 'default'}
            size="sm"
            onClick={() => setIsMonitoring(!isMonitoring)}
          >
            {isMonitoring ? (
              <>
                <Pause className="h-4 w-4 mr-2" />
                일시정지
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                모니터링 시작
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Database Warning */}
      {(!selectedConnectionId || selectedConnectionId === 'all') && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/20">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium text-amber-900 dark:text-amber-300">
                  데이터베이스를 선택해주세요
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                  실시간 모니터링을 시작하려면 상단의 데이터베이스 선택 메뉴에서 모니터링할 데이터베이스를 선택해주세요.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monitoring Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-lg">
            <Settings className="h-5 w-5 mr-2" />
            모니터링 설정
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center justify-between space-x-2">
              <label className="text-sm font-medium">자동 새로고침</label>
              <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            </div>
            <div className="flex items-center justify-between space-x-2">
              <label className="text-sm font-medium">알림 활성화</label>
              <Switch checked={alertsEnabled} onCheckedChange={setAlertsEnabled} />
            </div>
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium whitespace-nowrap">갱신 주기:</label>
              <Input
                type="number"
                value={refreshInterval / 1000}
                onChange={(e) => setRefreshInterval(Number(e.target.value) * 1000)}
                min={1}
                max={60}
                className="w-20"
              />
              <span className="text-sm">초</span>
            </div>
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium whitespace-nowrap">CPU 임계값:</label>
              <Input
                type="number"
                value={cpuThreshold}
                onChange={(e) => setCpuThreshold(Number(e.target.value))}
                min={100}
                max={10000}
                step={100}
                className="w-24"
              />
              <span className="text-sm">ms</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">실행 중인 SQL</p>
                <p className="text-2xl font-bold text-green-600">
                  {realtimeSQLs?.filter((s: RealtimeSQL) => s.status === 'EXECUTING').length || 0}
                </p>
              </div>
              <Activity className="h-8 w-8 text-green-500 animate-pulse" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">대기 중인 SQL</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {realtimeSQLs?.filter((s: RealtimeSQL) => s.status === 'WAITING').length || 0}
                </p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">임계값 초과</p>
                <p className="text-2xl font-bold text-red-600">
                  {realtimeSQLs?.filter((s: RealtimeSQL) => s.cpu_time_ms > cpuThreshold).length || 0}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">활성 세션</p>
                <p className="text-2xl font-bold">
                  {new Set(realtimeSQLs?.map((s: RealtimeSQL) => s.session_id)).size || 0}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Realtime SQL List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center">
              <Activity className="h-5 w-5 mr-2" />
              실시간 SQL 목록
            </span>
            {isMonitoring && (
              <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 animate-pulse">
                LIVE
              </Badge>
            )}
          </CardTitle>
          <CardDescription>현재 실행 중이거나 대기 중인 SQL 쿼리</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && isMonitoring ? (
            <div className="text-center py-8">
              <Activity className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">모니터링 중...</p>
            </div>
          ) : realtimeSQLs && realtimeSQLs.length > 0 ? (
            <div className="space-y-3">
              {realtimeSQLs.map((sql: RealtimeSQL, index: number) => (
                <div
                  key={`${sql.sql_id}-${sql.session_id}-${index}`}
                  className={`p-4 border rounded-lg ${
                    sql.cpu_time_ms > cpuThreshold ? 'border-red-300 bg-red-50 dark:bg-red-900/10' : ''
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <Badge className={getStatusColor(sql.status)}>
                        {getStatusIcon(sql.status)}
                        <span className="ml-1">{sql.status}</span>
                      </Badge>
                      <code className="text-sm font-mono text-blue-600">{sql.sql_id}</code>
                      <span className="text-xs text-gray-500">
                        Session: {sql.session_id} | User: {sql.username}
                      </span>
                    </div>
                    {sql.cpu_time_ms > cpuThreshold && (
                      <Badge variant="destructive" className="animate-pulse">
                        <Bell className="h-3 w-3 mr-1" />
                        임계값 초과
                      </Badge>
                    )}
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-900 rounded p-3 mb-3">
                    <code className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2">
                      {sql.sql_text}
                    </code>
                  </div>

                  <div className="grid grid-cols-4 gap-4 text-xs">
                    <div>
                      <p className="text-gray-500">경과 시간</p>
                      <p className="font-semibold">{sql.elapsed_time_ms.toFixed(0)}ms</p>
                    </div>
                    <div>
                      <p className="text-gray-500">CPU 시간</p>
                      <p className={`font-semibold ${sql.cpu_time_ms > cpuThreshold ? 'text-red-600' : ''}`}>
                        {sql.cpu_time_ms.toFixed(0)}ms
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">대기 이벤트</p>
                      <p className="font-semibold">{sql.wait_event || '-'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">시작 시간</p>
                      <p className="font-semibold">{new Date(sql.start_time).toLocaleTimeString('ko-KR')}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">실행 중인 SQL이 없습니다</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
