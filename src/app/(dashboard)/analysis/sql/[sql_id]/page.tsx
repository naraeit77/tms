'use client'

import { use, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useSelectedDatabase } from '@/hooks/use-selected-database'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowLeft,
  Activity,
  Cpu,
  Database as DatabaseIcon,
  HardDrive,
  Copy,
  FileDown,
  Sparkles,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface SQLDetailPageProps {
  params: Promise<{ sql_id: string }>
}

export default function SQLDetailPage({ params }: SQLDetailPageProps) {
  const { sql_id } = use(params)
  return <SQLDetailContent sqlId={sql_id} />
}

function SQLDetailContent({ sqlId }: { sqlId: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { selectedConnectionId } = useSelectedDatabase()
  const defaultTab = searchParams.get('tab') || 'overview'

  // SQL 상세 정보 조회
  const {
    data: sqlDetail,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['sql-detail', selectedConnectionId, sqlId],
    queryFn: async () => {
      if (!selectedConnectionId || !sqlId) {
        throw new Error('데이터베이스 또는 SQL ID가 선택되지 않았습니다')
      }

      const params = new URLSearchParams({
        connection_id: selectedConnectionId,
        sql_id: sqlId
      })

      const res = await fetch(`/api/monitoring/sql-detail?${params}`)

      if (!res.ok) {
        const errorText = await res.text()
        try {
          const errorData = JSON.parse(errorText)
          throw new Error(errorData.error || 'Failed to fetch SQL detail')
        } catch {
          throw new Error(`Failed to fetch SQL detail: ${res.status} ${res.statusText}`)
        }
      }

      const data = await res.json()
      return data.data
    },
    enabled: !!selectedConnectionId && !!sqlId,
  })

  const sql = sqlDetail?.sql_info
  const executionPlan = sqlDetail?.execution_plan
  // const bindVariables = sqlDetail?.bind_variables // 향후 사용 예정

  // 성능 히스토리 데이터 조회 - sql-history API 사용
  const { data: historyData, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['sql-history', selectedConnectionId, sqlId],
    queryFn: async () => {
      if (!selectedConnectionId || !sqlId) {
        return []
      }

      const params = new URLSearchParams({
        connection_id: selectedConnectionId,
        sql_id: sqlId
      })

      const res = await fetch(`/api/monitoring/sql-history?${params}`)
      if (!res.ok) {
        console.error('Failed to fetch SQL history')
        // 폴백: sql-detail API에서 performance_history 가져오기
        const detailRes = await fetch(`/api/monitoring/sql-detail?${params}`)
        if (detailRes.ok) {
          const detailData = await detailRes.json()
          const history = detailData.data?.performance_history || []
          return history.map((item: any) => ({
            timestamp: item.collected_at ? new Date(item.collected_at).toLocaleString('ko-KR', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false
            }).replace(/,/g, '') : item.collection_date + ' ' + (item.collection_hour || '00:00:00'),
            executions: item.executions || 0,
            avg_elapsed_ms: item.elapsed_time_ms || 0,
            avg_cpu_ms: item.cpu_time_ms || 0,
            buffer_gets: item.buffer_gets || 0,
            disk_reads: item.disk_reads || 0,
            rows_processed: item.rows_processed || 0,
          }))
        }
        return []
      }

      const data = await res.json()
      return data.data || []
    },
    enabled: !!selectedConnectionId && !!sqlId,
  })

  const handleCopy = async () => {
    if (sql?.sql_text) {
      await navigator.clipboard.writeText(sql.sql_text)
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50 dark:bg-red-900/20">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div>
                <p className="font-medium text-red-900 dark:text-red-300">오류 발생</p>
                <p className="text-sm text-red-700 dark:text-red-400 mt-1">{String(error)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!sql) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-12 text-center">
            <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">SQL 정보를 찾을 수 없습니다.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-3">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
              뒤로
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">SQL 상세 분석</h1>
              <p className="text-gray-500 dark:text-gray-400">{sqlId}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            <Copy className="h-4 w-4 mr-2" />
            SQL 복사
          </Button>
          <Button variant="outline" size="sm">
            <FileDown className="h-4 w-4 mr-2" />
            보고서 다운로드
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">실행 횟수</p>
                <p className="text-2xl font-bold">{sql.executions?.toLocaleString()}</p>
              </div>
              <Activity className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">CPU 시간</p>
                <p className="text-2xl font-bold">{sql.avg_cpu_ms?.toFixed(0)}ms</p>
              </div>
              <Cpu className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Buffer Gets</p>
                <p className="text-2xl font-bold">{sql.buffer_gets?.toLocaleString()}</p>
              </div>
              <DatabaseIcon className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Disk Reads</p>
                <p className="text-2xl font-bold">{sql.disk_reads?.toLocaleString()}</p>
              </div>
              <HardDrive className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">개요</TabsTrigger>
          <TabsTrigger value="sql-text">SQL 텍스트</TabsTrigger>
          <TabsTrigger value="execution-plan">실행 계획</TabsTrigger>
          <TabsTrigger value="ai-analysis">AI 분석</TabsTrigger>
          <TabsTrigger value="history">성능 히스토리</TabsTrigger>
        </TabsList>

        {/* 개요 탭 */}
        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>성능 개요</CardTitle>
              <CardDescription>SQL 실행 성능 및 메트릭 요약</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">스키마</p>
                    <p className="font-mono font-semibold">{sql.schema_name || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">평균 실행 시간</p>
                    <p className="font-semibold">{sql.avg_elapsed_ms?.toFixed(2)}ms</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">처리된 행</p>
                    <p className="font-semibold">{sql.rows_processed?.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">파싱 호출</p>
                    <p className="font-semibold">{sql.parse_calls?.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>성능 지표</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium">실행당 평균 CPU 시간</p>
                    <p className="text-sm font-semibold">{sql.avg_cpu_ms?.toFixed(2)}ms</p>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium">실행당 평균 Buffer Gets</p>
                    <p className="text-sm font-semibold">{sql.avg_buffer_gets?.toFixed(0)}</p>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium">Buffer Gets 대비 Disk Reads 비율</p>
                    <p className="text-sm font-semibold">
                      {sql.buffer_gets && sql.disk_reads
                        ? ((sql.disk_reads / sql.buffer_gets) * 100).toFixed(1)
                        : '0'}%
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SQL 텍스트 탭 */}
        <TabsContent value="sql-text">
          <Card>
            <CardHeader>
              <CardTitle>SQL 텍스트</CardTitle>
              <CardDescription>실행된 SQL 문의 전체 텍스트</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <pre className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg overflow-x-auto text-sm border">
                  <code className="text-gray-800 dark:text-gray-200 font-mono">
                    {sql.sql_text}
                  </code>
                </pre>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={handleCopy}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 실행 계획 탭 */}
        <TabsContent value="execution-plan">
          <Card>
            <CardHeader>
              <CardTitle>실행 계획</CardTitle>
              <CardDescription>Oracle 옵티마이저가 생성한 실행 계획</CardDescription>
            </CardHeader>
            <CardContent>
              {executionPlan && executionPlan.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b bg-gray-50 dark:bg-gray-800">
                        <th className="text-left p-3 font-semibold">Operation</th>
                        <th className="text-left p-3 font-semibold">Object Name</th>
                        <th className="text-right p-3 font-semibold">Cost</th>
                        <th className="text-right p-3 font-semibold">Cardinality</th>
                        <th className="text-right p-3 font-semibold">Bytes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {executionPlan.map((step: any) => (
                        <tr key={step.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="p-3 font-mono text-xs">
                            {step.operation} {step.options}
                          </td>
                          <td className="p-3 font-mono text-xs">{step.object_name || '-'}</td>
                          <td className="text-right p-3">{step.cost?.toLocaleString() || '-'}</td>
                          <td className="text-right p-3">{step.cardinality?.toLocaleString() || '-'}</td>
                          <td className="text-right p-3">{step.bytes?.toLocaleString() || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>실행 계획 정보가 없습니다.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI 분석 탭 */}
        <TabsContent value="ai-analysis">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center">
                    AI 성능 분석
                    <Badge className="ml-3 bg-yellow-100 text-yellow-800 border-yellow-200">
                      Grade C
                    </Badge>
                  </CardTitle>
                  <CardDescription className="mt-2">
                    AI가 분석한 성능 점수: 64/100 (신뢰도: 87%)
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm">
                  <Sparkles className="h-4 w-4 mr-2" />
                  AI 재분석
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 발견된 이슈 */}
              <div>
                <h3 className="text-sm font-semibold mb-3">발견된 이슈</h3>
                <div className="space-y-2">
                  <div className="flex items-start space-x-3 p-3 border rounded-lg bg-amber-50 dark:bg-amber-900/10 border-amber-200">
                    <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
                          medium
                        </Badge>
                        <span className="text-sm font-semibold">resource</span>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        Full table scan detected on large table
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 최적화 제안 */}
              <div>
                <h3 className="text-sm font-semibold mb-3">최적화 제안</h3>
                <div className="space-y-3">
                  <div className="p-4 border-l-4 border-green-500 bg-green-50 dark:bg-green-900/10 rounded">
                    <div className="flex items-center space-x-2 mb-2">
                      <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 text-xs">
                        query_rewrite
                      </Badge>
                      <span className="text-sm font-semibold text-green-800 dark:text-green-300">
                        +24% 예상 개선
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Create index on column to improve performance
                    </p>
                  </div>

                  <div className="p-4 border-l-4 border-green-500 bg-green-50 dark:bg-green-900/10 rounded">
                    <div className="flex items-center space-x-2 mb-2">
                      <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 text-xs">
                        query_rewrite
                      </Badge>
                      <span className="text-sm font-semibold text-green-800 dark:text-green-300">
                        +37% 예상 개선
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Rewrite query to use more efficient join method
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 성능 히스토리 탭 */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>성능 히스토리</CardTitle>
              <CardDescription>
                최근 7일간의 성능 변화 추이 ({historyData?.length || 0}개 스냅샷) (Performance trend over the last 7 days ({historyData?.length || 0} snapshots))
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingHistory ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <Activity className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-4" />
                    <p className="text-sm text-gray-500">성능 히스토리 로딩 중...</p>
                  </div>
                </div>
              ) : historyData && historyData.length > 0 ? (
                <div className="space-y-6">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs text-gray-500 mb-1">평균 실행 시간 (Average Elapsed Time)</p>
                        <p className="text-lg font-bold">
                          {historyData.length > 0 
                            ? (historyData.reduce((acc: number, item: any) => acc + (item.avg_elapsed_ms || 0), 0) / historyData.length).toFixed(2)
                            : '0.00'}ms
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs text-gray-500 mb-1">평균 CPU 시간 (Average CPU Time)</p>
                        <p className="text-lg font-bold">
                          {historyData.length > 0
                            ? (historyData.reduce((acc: number, item: any) => acc + (item.avg_cpu_ms || 0), 0) / historyData.length).toFixed(2)
                            : '0.00'}ms
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs text-gray-500 mb-1">총 실행 횟수 (Total Executions)</p>
                        <p className="text-lg font-bold">
                          {historyData.reduce((acc: number, item: any) => acc + (item.executions || 0), 0).toLocaleString()}
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <p className="text-xs text-gray-500 mb-1">총 처리 행 (Total Rows Processed)</p>
                        <p className="text-lg font-bold">
                          {historyData.reduce((acc: number, item: any) => acc + (item.rows_processed || 0), 0).toLocaleString()}
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* History Table */}
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50 dark:bg-gray-800">
                          <th className="text-left p-3 font-semibold">스냅샷 시간 (Snapshot Time)</th>
                          <th className="text-right p-3 font-semibold">실행 횟수 (Execution Count)</th>
                          <th className="text-right p-3 font-semibold">평균 실행 시간 (Average Elapsed Time)</th>
                          <th className="text-right p-3 font-semibold">평균 CPU 시간 (Average CPU Time)</th>
                          <th className="text-right p-3 font-semibold">Buffer Gets</th>
                          <th className="text-right p-3 font-semibold">Disk Reads</th>
                          <th className="text-right p-3 font-semibold">처리 행 (Rows Processed)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyData.map((item: any, index: number) => (
                          <tr key={`history-${item.timestamp || index}-${item.executions || 0}-${item.avg_elapsed_ms || 0}`} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="p-3 font-mono text-xs">{item.timestamp || '-'}</td>
                            <td className="text-right p-3">{item.executions?.toLocaleString() || '0'}</td>
                            <td className="text-right p-3">
                              <span className={`font-semibold ${
                                (item.avg_elapsed_ms || 0) > 1000 ? 'text-orange-600' : 'text-gray-900 dark:text-gray-100'
                              }`}>
                                {(item.avg_elapsed_ms || 0).toFixed(2)}ms
                              </span>
                            </td>
                            <td className="text-right p-3">
                              <span className={`font-semibold ${
                                (item.avg_cpu_ms || 0) > 1000 ? 'text-orange-600' : 'text-gray-900 dark:text-gray-100'
                              }`}>
                                {(item.avg_cpu_ms || 0).toFixed(2)}ms
                              </span>
                            </td>
                            <td className="text-right p-3">{(item.buffer_gets || 0).toLocaleString()}</td>
                            <td className="text-right p-3">{(item.disk_reads || 0).toLocaleString()}</td>
                            <td className="text-right p-3">{(item.rows_processed || 0).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-sm text-gray-500">성능 히스토리 데이터가 없습니다</p>
                  <p className="text-xs text-gray-400 mt-2">
                    AWR 스냅샷이 비활성화되었거나 데이터가 아직 수집되지 않았습니다
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
