'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  FileText,
  Download,
  Calendar,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  PieChart,
  Activity,
  Clock,
  Database,
  Cpu,
  HardDrive,
  Zap,
  Target,
  Users,
  RefreshCw
} from 'lucide-react'
import { generatePerformanceSummaryPDF, downloadPDF, generateReportFilename } from '@/lib/reports/pdf-generator'
import { PerformanceTrendChart } from '@/components/charts/performance-trend-chart'

// Breadcrumb component
function Breadcrumb() {
  return (
    <nav className="text-sm breadcrumb mb-6">
      <ol className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
        <li><a href="/dashboard" className="hover:text-blue-600">홈</a></li>
        <li className="text-gray-300">/</li>
        <li><a href="/reports" className="hover:text-blue-600">보고서</a></li>
        <li className="text-gray-300">/</li>
        <li className="text-gray-900 dark:text-white font-medium">성능 요약 보고서</li>
      </ol>
    </nav>
  )
}

// Report data interface
interface ReportSummary {
  period: string
  totalSQL: number
  totalExecutions: number
  avgResponseTime: number
  performanceGrades: {
    A: number
    B: number
    C: number
    D: number
    F: number
  }
  topProblematicSQL: {
    sql_id: string
    issues: number
    impact: 'high' | 'medium' | 'low'
  }[]
  improvements: {
    description: string
    impact: number
    status: 'implemented' | 'planned' | 'recommended'
  }[]
  resourceUtilization: {
    cpu: number
    memory: number
    io: number
  }
}

// Empty report data when no data available
const getEmptyReportSummary = (period: string): ReportSummary => {
  return {
    period,
    totalSQL: 0,
    totalExecutions: 0,
    avgResponseTime: 0,
    performanceGrades: {
      A: 0,
      B: 0,
      C: 0,
      D: 0,
      F: 0
    },
    topProblematicSQL: [],
    improvements: [],
    resourceUtilization: {
      cpu: 0,
      memory: 0,
      io: 0
    }
  }
}

export default function ReportsSummaryPage() {
  const { status } = useSession()
  const queryClient = useQueryClient()
  const [period, setPeriod] = useState('7d')
  const [generatingReport, setGeneratingReport] = useState(false)
  const [selectedDatabase, setSelectedDatabase] = useState<string>('')

  // 데이터베이스 목록 조회 - React Query 사용 (전역 캐시 공유)
  // 모든 훅은 조건문 전에 호출되어야 함
  const { data: databasesData } = useQuery({
    queryKey: ['oracle-connections'], // 전역 쿼리 키로 통일
    queryFn: async () => {
      const response = await fetch('/api/oracle/connections')
      if (response.status === 401) {
        return []
      }
      if (!response.ok) {
        throw new Error('Failed to fetch databases')
      }
      const data = await response.json()
      return data.map((conn: any) => ({
        id: conn.id,
        name: conn.name,
        host: conn.host,
        port: conn.port,
      })) || []
    },
    enabled: status === 'authenticated',
    staleTime: 5 * 60 * 1000, // 5분간 캐시 유지
    gcTime: 10 * 60 * 1000, // 10분간 가비지 컬렉션 방지
    retry: false,
    refetchOnWindowFocus: false, // 포커스 시 재요청 비활성화
  })

  // 첫 번째 데이터베이스 자동 선택
  useEffect(() => {
    if (databasesData && databasesData.length > 0 && !selectedDatabase) {
      setSelectedDatabase(databasesData[0].id)
    }
  }, [databasesData, selectedDatabase])

  // 보고서 데이터 조회 - React Query 사용
  const { data: reportResponse, isLoading: reportLoading } = useQuery({
    queryKey: ['reports-summary', period, selectedDatabase],
    queryFn: async () => {
      if (status !== 'authenticated') {
        return {
          success: true,
          data: getEmptyReportSummary(period),
          metadata: { source: 'demo' }
        }
      }

      const url = selectedDatabase
        ? `/api/reports/summary?period=${period}&databaseId=${selectedDatabase}`
        : `/api/reports/summary?period=${period}`

      const response = await fetch(url)
      
      if (response.status === 401) {
        window.location.href = '/auth/signin'
        throw new Error('Unauthorized')
      }

      if (!response.ok) {
        throw new Error('Failed to fetch report')
      }

      const result = await response.json()
      
      if (result.success && result.data) {
        return result
      } else {
        // Fallback to demo data
        return {
          success: true,
          data: getEmptyReportSummary(period),
          metadata: { source: 'demo' }
        }
      }
    },
    enabled: status !== 'loading',
    staleTime: 60 * 1000, // 1분간 캐시 유지
    retry: false,
  })

  // 트렌드 데이터 조회 - React Query 사용
  const { data: trendResponse, isLoading: trendLoading } = useQuery({
    queryKey: ['reports-trend', period, selectedDatabase],
    queryFn: async () => {
      if (status !== 'authenticated') {
        return { success: true, data: [] }
      }

      const url = selectedDatabase
        ? `/api/reports/summary/trend?period=${period}&databaseId=${selectedDatabase}`
        : `/api/reports/summary/trend?period=${period}`

      const response = await fetch(url)
      
      if (response.status === 401) {
        window.location.href = '/auth/signin'
        throw new Error('Unauthorized')
      }

      if (!response.ok) {
        return { success: false, data: [] }
      }

      return response.json()
    },
    enabled: status === 'authenticated',
    staleTime: 60 * 1000, // 1분간 캐시 유지
    retry: false,
  })

  // 데이터 변환 및 처리 - useMemo로 최적화
  const { reportData, isDemo, trendData } = useMemo((): { reportData: ReportSummary; isDemo: boolean; trendData: any[] } => {
    const report: ReportSummary = reportResponse?.data || getEmptyReportSummary(period)
    const isDemoData = reportResponse?.metadata?.source !== 'database' || status !== 'authenticated'

    const transformedTrendData = trendResponse?.success && trendResponse?.data
      ? trendResponse.data.map((item: any) => ({
          timestamp: new Date(item.timestamp),
          avgCpuTime: Number.isFinite(item.avgCpuTime) ? item.avgCpuTime :
                     (Number.isFinite(item.avgResponseTime) ? item.avgResponseTime * 1000 : 0),
          avgElapsedTime: Number.isFinite(item.avgElapsedTime) ? item.avgElapsedTime :
                         (Number.isFinite(item.avgResponseTime) ? item.avgResponseTime * 1000 : 0),
          avgBufferGets: Number.isFinite(item.avgBufferGets) ? item.avgBufferGets : 0,
          totalExecutions: Number.isFinite(item.totalExecutions) ? item.totalExecutions :
                          (Number.isFinite(item.executions) ? item.executions : 0),
          avgDiskReads: Number.isFinite(item.avgDiskReads) ? item.avgDiskReads : 0,
          activeQueries: Number.isFinite(item.activeQueries) ? item.activeQueries : 0,
          problemQueries: Number.isFinite(item.problemQueries) ? item.problemQueries : 0,
        })).filter((item: any) => !isNaN(item.timestamp.getTime()))
      : []

    return {
      reportData: report,
      isDemo: isDemoData,
      trendData: transformedTrendData
    }
  }, [reportResponse, trendResponse, period, status])

  const loading = reportLoading
  const databases = databasesData || []

  const generatePDFReport = async () => {
    if (!reportData) return

    setGeneratingReport(true)

    try {
      // Get database name for the filename
      const selectedDb = databases.find(db => db.id === selectedDatabase)
      const databaseName = selectedDb?.name

      // Generate PDF document
      const doc = generatePerformanceSummaryPDF(reportData, databaseName)

      // Generate filename
      const filename = generateReportFilename(period, databaseName)

      // Download the PDF
      downloadPDF(doc, filename)

      setGeneratingReport(false)
    } catch (error) {
      console.error('Failed to generate PDF:', error)
      alert('PDF 생성 중 오류가 발생했습니다.')
      setGeneratingReport(false)
    }
  }

  // 수동 새로고침 핸들러
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['reports-summary'] })
    queryClient.invalidateQueries({ queryKey: ['reports-trend'] })
  }

  // 인증 로딩 중이거나 데이터 로딩 중인 경우
  if (status === 'loading' || loading || !reportData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const totalGraded = (Object.values(reportData.performanceGrades) as number[]).reduce((sum, count) => sum + count, 0)
  const goodPerformance = reportData.performanceGrades.A + reportData.performanceGrades.B
  const poorPerformance = reportData.performanceGrades.D + reportData.performanceGrades.F

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <Breadcrumb />
          <div className="flex items-center space-x-3">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">성능 요약 보고서</h1>
            {isDemo && (
              <span className="px-3 py-1 bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 text-sm font-medium rounded-full">
                데모 데이터
              </span>
            )}
          </div>
          <p className="text-gray-500 dark:text-gray-400">
            {period === '7d' ? '최근 7일' :
             period === '30d' ? '최근 30일' :
             period === '90d' ? '최근 90일' : '최근 24시간'} 간의 SQL 성능 종합 분석
          </p>
          <div className="flex items-center space-x-2 mt-2 text-sm text-gray-600 dark:text-gray-400">
            <Calendar className="h-4 w-4" />
            <span>보고서 생성일: {new Date().toLocaleString()}</span>
            {isDemo && (
              <span className="text-orange-600 dark:text-orange-400">
                • Oracle 데이터베이스를 연결하면 실제 데이터를 볼 수 있습니다
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          {databases.length > 0 && (
            <Select value={selectedDatabase} onValueChange={setSelectedDatabase}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="데이터베이스 선택" />
              </SelectTrigger>
              <SelectContent>
                {databases.map((db) => (
                  <SelectItem key={db.id} value={db.id}>
                    {db.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">최근 24시간</SelectItem>
              <SelectItem value="7d">최근 7일</SelectItem>
              <SelectItem value="30d">최근 30일</SelectItem>
              <SelectItem value="90d">최근 90일</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
          <Button onClick={generatePDFReport} disabled={generatingReport}>
            {generatingReport ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                생성 중...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                PDF 다운로드
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Executive Summary */}
      <Card className="border-l-4 border-l-blue-500">
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileText className="h-5 w-5 mr-2 text-blue-600" />
            주요 요약
          </CardTitle>
          <CardDescription>핵심 성과 지표 및 주요 발견사항</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600 mb-2">
                {reportData.totalSQL.toLocaleString()}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">분석된 SQL 수</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600 mb-2">
                {reportData.totalExecutions.toLocaleString()}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">총 실행 횟수</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600 mb-2">
                {reportData.avgResponseTime.toFixed(3)}s
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">평균 응답시간</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-600 mb-2">
                {((goodPerformance / totalGraded) * 100).toFixed(1)}%
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">우수 성능 비율</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="performance" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="performance">성능 분석</TabsTrigger>
          <TabsTrigger value="problems">문제점 분석</TabsTrigger>
          <TabsTrigger value="resources">리소스 현황</TabsTrigger>
          <TabsTrigger value="recommendations">권장사항</TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-6">
          {/* Performance Grade Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2" />
                  성능 등급 분포
                </CardTitle>
                <CardDescription>SQL 성능 등급별 분류 현황</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(Object.entries(reportData.performanceGrades) as [string, number][]).map(([grade, count]) => (
                    <div key={grade} className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <Badge
                          className={
                            grade === 'A' ? 'bg-green-100 text-green-800' :
                            grade === 'B' ? 'bg-blue-100 text-blue-800' :
                            grade === 'C' ? 'bg-yellow-100 text-yellow-800' :
                            grade === 'D' ? 'bg-orange-100 text-orange-800' :
                            'bg-red-100 text-red-800'
                          }
                        >
                          Grade {grade}
                        </Badge>
                        <span className="text-sm">{count.toLocaleString()}개</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${
                              grade === 'A' ? 'bg-green-600' :
                              grade === 'B' ? 'bg-blue-600' :
                              grade === 'C' ? 'bg-yellow-600' :
                              grade === 'D' ? 'bg-orange-600' :
                              'bg-red-600'
                            }`}
                            style={{ width: `${(count / totalGraded) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-gray-500 w-8">
                          {((count / totalGraded) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Performance Trends */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2" />
                  성능 트렌드
                </CardTitle>
                <CardDescription>시간별 성능 변화 추이</CardDescription>
              </CardHeader>
              <CardContent>
                {trendLoading ? (
                  <div className="h-64 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : trendData.length > 0 ? (
                  <div className="h-64">
                    <PerformanceTrendChart data={trendData} height={260} />
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                    <div className="text-center space-y-2">
                      <BarChart3 className="h-8 w-8 text-gray-400 mx-auto" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">데이터가 없습니다</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-green-800 dark:text-green-200 flex items-center">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  우수한 성능
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-900 dark:text-green-100">
                  {goodPerformance.toLocaleString()}
                </div>
                <p className="text-xs text-green-700 dark:text-green-300">
                  Grade A/B SQL ({((goodPerformance / totalGraded) * 100).toFixed(1)}%)
                </p>
              </CardContent>
            </Card>

            <Card className="bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-yellow-800 dark:text-yellow-200 flex items-center">
                  <Clock className="h-4 w-4 mr-2" />
                  보통 성능
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">
                  {reportData.performanceGrades.C.toLocaleString()}
                </div>
                <p className="text-xs text-yellow-700 dark:text-yellow-300">
                  Grade C SQL ({((reportData.performanceGrades.C / totalGraded) * 100).toFixed(1)}%)
                </p>
              </CardContent>
            </Card>

            <Card className="bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-red-800 dark:text-red-200 flex items-center">
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  문제 성능
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-900 dark:text-red-100">
                  {poorPerformance.toLocaleString()}
                </div>
                <p className="text-xs text-red-700 dark:text-red-300">
                  Grade D/F SQL ({((poorPerformance / totalGraded) * 100).toFixed(1)}%)
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="problems" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2 text-red-600" />
                주요 문제점 분석
              </CardTitle>
              <CardDescription>성능에 가장 큰 영향을 미치는 SQL들</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {reportData.topProblematicSQL.map((sql, index) => (
                  <Card key={`${sql.sql_id}-${index}`} className="border-l-4 border-l-red-500">
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <span className="text-lg font-semibold text-red-600">#{index + 1}</span>
                          <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-sm font-mono">
                            {sql.sql_id}
                          </code>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge 
                            variant={sql.impact === 'high' ? 'destructive' : 
                                   sql.impact === 'medium' ? 'secondary' : 'outline'}
                          >
                            {sql.impact === 'high' ? '높은 영향' : 
                             sql.impact === 'medium' ? '중간 영향' : '낮은 영향'}
                          </Badge>
                          <Badge variant="outline">
                            {sql.issues}개 문제
                          </Badge>
                        </div>
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        주요 문제: Full Table Scan, 비효율적 조인, 인덱스 미사용
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resources" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center">
                  <Cpu className="h-4 w-4 mr-2" />
                  CPU 사용률
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold mb-2">{reportData.resourceUtilization.cpu}%</div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full" 
                    style={{ width: `${reportData.resourceUtilization.cpu}%` }}
                  ></div>
                </div>
                <p className="text-xs text-gray-500 mt-2">평균 CPU 활용도</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center">
                  <Database className="h-4 w-4 mr-2" />
                  메모리 사용률
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold mb-2">{reportData.resourceUtilization.memory}%</div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-600 h-2 rounded-full" 
                    style={{ width: `${reportData.resourceUtilization.memory}%` }}
                  ></div>
                </div>
                <p className="text-xs text-gray-500 mt-2">Buffer Pool 사용률</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center">
                  <HardDrive className="h-4 w-4 mr-2" />
                  I/O 사용률
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold mb-2">{reportData.resourceUtilization.io}%</div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-purple-600 h-2 rounded-full" 
                    style={{ width: `${reportData.resourceUtilization.io}%` }}
                  ></div>
                </div>
                <p className="text-xs text-gray-500 mt-2">디스크 I/O 활용도</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Zap className="h-5 w-5 mr-2 text-yellow-600" />
                최적화 권장사항
              </CardTitle>
              <CardDescription>성능 개선을 위한 구체적인 제안 및 실행 계획</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {reportData.improvements.map((improvement, index) => (
                  <div 
                    key={`improvement-${improvement.status || ''}-${improvement.title || ''}-${index}`}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-start space-x-3 flex-1">
                      <div className="flex-shrink-0">
                        {improvement.status === 'implemented' && (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        )}
                        {improvement.status === 'planned' && (
                          <Clock className="h-5 w-5 text-blue-600" />
                        )}
                        {improvement.status === 'recommended' && (
                          <Target className="h-5 w-5 text-orange-600" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                          {improvement.description}
                        </p>
                        <p className="text-xs text-gray-500">
                          예상 성능 개선: {improvement.impact}%
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge 
                        variant={
                          improvement.status === 'implemented' ? 'default' :
                          improvement.status === 'planned' ? 'secondary' : 'outline'
                        }
                      >
                        {improvement.status === 'implemented' ? '완료' :
                         improvement.status === 'planned' ? '계획됨' : '권장'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Action Plan */}
          <Card className="bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
            <CardHeader>
              <CardTitle className="text-blue-900 dark:text-blue-100">💡 다음 단계</CardTitle>
              <CardDescription className="text-blue-700 dark:text-blue-300">
                우선순위에 따른 실행 계획
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center space-x-3">
                  <div className="w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold">1</div>
                  <span className="text-sm">가장 영향도 높은 SQL들의 인덱스 최적화 (예상 개선: 25%)</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-6 h-6 bg-orange-500 text-white rounded-full flex items-center justify-center text-xs font-bold">2</div>
                  <span className="text-sm">통계 정보 자동 업데이트 설정 (예상 개선: 15%)</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-6 h-6 bg-yellow-500 text-white rounded-full flex items-center justify-center text-xs font-bold">3</div>
                  <span className="text-sm">파티셔닝 전략 재검토 및 적용 (예상 개선: 12%)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}