'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSelectedDatabase } from '@/hooks/use-selected-database'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Search,
  AlertTriangle,
  Database,
  BarChart3,
  Activity,
  Settings,
  ArrowRight,
  Brain,
  GitCompare,
  Code,
  Layers,
  RefreshCw,
  Sparkles
} from 'lucide-react'

// Clean Architecture Presentation Layer imports
import { LLMStatusBadge, SmartSearchInput } from '@/presentation/analysis'
import type { SearchFilters } from '@/domain/llm-analysis'

// Quick action items - 고급 분석 도구로 업데이트
const quickActions = [
  {
    title: 'SQL 통합 검색',
    description: 'AI 기반 스마트 검색 및 패턴 매칭',
    href: '/analysis/search',
    icon: Search,
    color: 'bg-blue-500',
    textColor: 'text-blue-600',
    features: ['자연어 검색', '정규식 지원', '실시간 필터링']
  },
  {
    title: '실행 계획 분석',
    description: '실행 계획 시각화 및 최적화 제안',
    href: '/analysis/execution-plan',
    icon: GitCompare,
    color: 'bg-green-500',
    textColor: 'text-green-600',
    features: ['트리 시각화', '비용 분석', '인덱스 추천']
  },
  {
    title: 'AI 성능 진단',
    description: '머신러닝 기반 성능 이슈 자동 진단',
    href: '/analysis/ai-diagnosis',
    icon: Brain,
    color: 'bg-purple-500',
    textColor: 'text-purple-600',
    features: ['자동 분석', '개선 제안', '예상 개선율']
  },
  {
    title: '성능 비교 분석',
    description: '여러 SQL의 성능 메트릭 비교',
    href: '/analysis/compare',
    icon: BarChart3,
    color: 'bg-orange-500',
    textColor: 'text-orange-600',
    features: ['다중 비교', '트렌드 분석', '벤치마킹']
  }
]

// Advanced analysis tools
const advancedToolsDefault = [
  {
    id: 'pattern-detection',
    title: '패턴 기반 이슈 탐지',
    description: '반복되는 성능 패턴을 자동으로 식별하고 분류',
    features: ['패턴 인식', '이상 탐지', '자동 분류', '트렌드 예측'],
    icon: Layers,
    status: 'active'
  },
  {
    id: 'sql-refactoring',
    title: 'SQL 리팩토링 어시스턴트',
    description: 'AI가 제안하는 SQL 재작성 및 최적화',
    features: ['구문 분석', '재작성 제안', '성능 예측', '버전 비교'],
    icon: Code,
    status: 'active'
  },
  {
    id: 'realtime-monitoring',
    title: '실시간 성능 모니터링',
    description: '실시간 SQL 실행 추적 및 알림',
    features: ['실시간 추적', '임계값 알림', '자동 캡처', '성능 기록'],
    icon: Activity,
    status: 'active'
  }
]

export default function SQLAnalysisPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFilter, setSelectedFilter] = useState('all')
  const [advancedTools, setAdvancedTools] = useState(advancedToolsDefault)

  // SQL 통계 조회 - React Query 사용
  const { data: sqlStatsData, isLoading: sqlStatsLoading } = useQuery({
    queryKey: ['analysis-sql-stats', selectedConnectionId, selectedFilter],
    queryFn: async () => {
      if (!selectedConnectionId || selectedConnectionId === 'all') {
        return { data: [], total: 0 }
      }
      const res = await fetch(`/api/monitoring/sql-statistics?${new URLSearchParams({
        connection_id: selectedConnectionId,
        limit: '5',
        order_by: selectedFilter === 'critical' ? 'cpu_time_ms' :
                  selectedFilter === 'slow' ? 'elapsed_time_ms' :
                  selectedFilter === 'frequent' ? 'executions' : 'buffer_gets'
      })}`)
      if (!res.ok) throw new Error('Failed to fetch SQL statistics')
      return res.json()
    },
    enabled: !!selectedConnectionId && selectedConnectionId !== 'all',
    staleTime: 30 * 1000, // 30초간 캐시 유지
    gcTime: 5 * 60 * 1000, // 5분간 가비지 컬렉션 방지
  })

  // 패턴 탐지 조회 - React Query 사용
  const { data: patternData } = useQuery({
    queryKey: ['analysis-pattern', selectedConnectionId],
    queryFn: async () => {
      if (!selectedConnectionId || selectedConnectionId === 'all') {
        return { success: false, data: [] }
      }
      const res = await fetch(`/api/analysis/pattern-detection?${new URLSearchParams({
        connection_id: selectedConnectionId
      })}`)
      if (!res.ok) return { success: false, data: [] }
      return res.json()
    },
    enabled: !!selectedConnectionId && selectedConnectionId !== 'all',
    staleTime: 60 * 1000, // 1분간 캐시 유지
    retry: false, // 실패 시 재시도 안 함
  })

  // 실시간 모니터링 조회 - React Query 사용
  const { data: realtimeData } = useQuery({
    queryKey: ['analysis-realtime', selectedConnectionId],
    queryFn: async () => {
      if (!selectedConnectionId || selectedConnectionId === 'all') {
        return { success: false, data: [] }
      }
      const res = await fetch(`/api/analysis/realtime-monitoring?${new URLSearchParams({
        connection_id: selectedConnectionId
      })}`)
      if (!res.ok) return { success: false, data: [] }
      return res.json()
    },
    enabled: !!selectedConnectionId && selectedConnectionId !== 'all',
    staleTime: 30 * 1000, // 30초간 캐시 유지
    refetchInterval: 60 * 1000, // 60초마다 자동 갱신
    refetchOnWindowFocus: false,
    retry: false,
  })

  // 리팩토링 제안 조회 - React Query 사용
  const { data: refactoringData } = useQuery({
    queryKey: ['analysis-refactoring', selectedConnectionId],
    queryFn: async () => {
      if (!selectedConnectionId || selectedConnectionId === 'all') {
        return { success: false, data: [] }
      }
      const res = await fetch(`/api/analysis/refactoring-suggestions?${new URLSearchParams({
        connection_id: selectedConnectionId
      })}`)
      if (!res.ok) return { success: false, data: [] }
      return res.json()
    },
    enabled: !!selectedConnectionId && selectedConnectionId !== 'all',
    staleTime: 60 * 1000, // 1분간 캐시 유지
    retry: false,
  })

  // 데이터 처리 및 통계 계산 - useMemo로 최적화
  const { recentSQLs, stats, toolStats } = useMemo(() => {
    const sqls = sqlStatsData?.data || []
    const totalAnalyzed = sqlStatsData?.total || sqls.length || 0
    const issuesFound = sqls.filter((sql: any) =>
      (sql.cpu_time_ms || 0) > 1000 ||
      (sql.buffer_gets || 0) > 100000 ||
      sql.status === 'CRITICAL' ||
      sql.status === 'WARNING'
    ).length

    const patternCount = patternData?.success && patternData?.data ? patternData.data.length : 0
    const activeMonitoring = realtimeData?.success && realtimeData?.data ? realtimeData.data.length : 0
    
    let avgImprovement = 0
    let refactoringCount = 0
    if (refactoringData?.success && refactoringData?.data && refactoringData.data.length > 0) {
      refactoringCount = refactoringData.data.length
      const improvements = refactoringData.data.map((s: any) => s.performance_gain || 0)
      avgImprovement = Math.round(
        improvements.reduce((sum: number, val: number) => sum + val, 0) / improvements.length
      )
    }

    return {
      recentSQLs: sqls,
      stats: {
        totalAnalyzed,
        issuesFound: Math.max(issuesFound, patternCount),
        avgImprovement,
        activeMonitoring
      },
      toolStats: {
        'pattern-detection': {
          count: patternCount,
          status: selectedConnectionId && selectedConnectionId !== 'all' ? 'active' : 'inactive' as 'active' | 'inactive'
        },
        'sql-refactoring': {
          count: refactoringCount,
          status: selectedConnectionId && selectedConnectionId !== 'all' ? 'active' : 'inactive' as 'active' | 'inactive'
        },
        'realtime-monitoring': {
          count: activeMonitoring,
          status: selectedConnectionId && selectedConnectionId !== 'all' && realtimeData?.success ? 'active' : 'inactive' as 'active' | 'inactive'
        }
      }
    }
  }, [sqlStatsData, patternData, realtimeData, refactoringData, selectedConnectionId])

  const loading = sqlStatsLoading

  // 수동 새로고침 핸들러
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['analysis-sql-stats'] })
    queryClient.invalidateQueries({ queryKey: ['analysis-pattern'] })
    queryClient.invalidateQueries({ queryKey: ['analysis-realtime'] })
    queryClient.invalidateQueries({ queryKey: ['analysis-refactoring'] })
  }

  const handleQuickSearch = () => {
    if (searchQuery) {
      router.push(`/analysis/search?q=${encodeURIComponent(searchQuery)}`)
    }
  }

  // AI Smart Search handlers - Clean Architecture integration
  const handleSmartSearch = useCallback((filters: SearchFilters) => {
    // Build query params from AI-interpreted filters
    const params = new URLSearchParams()

    if (filters.sqlPattern) params.set('pattern', filters.sqlPattern)
    if (filters.schema) params.set('schema', filters.schema)
    if (filters.minElapsedTime) params.set('min_elapsed', filters.minElapsedTime.toString())
    if (filters.maxElapsedTime) params.set('max_elapsed', filters.maxElapsedTime.toString())
    if (filters.minBufferGets) params.set('min_buffer', filters.minBufferGets.toString())
    if (filters.maxBufferGets) params.set('max_buffer', filters.maxBufferGets.toString())
    if (filters.timeRange) params.set('time_range', filters.timeRange)
    if (filters.sortBy) params.set('order_by', filters.sortBy)
    if (filters.sortOrder) params.set('order', filters.sortOrder)
    if (filters.limit) params.set('limit', filters.limit.toString())
    params.set('ai_search', 'true')

    router.push(`/analysis/search?${params.toString()}`)
  }, [router])

  const handleTextSearch = useCallback((text: string) => {
    if (text) {
      router.push(`/analysis/search?q=${encodeURIComponent(text)}`)
    }
  }, [router])

  const toggleAdvancedTool = (toolId: string) => {
    setAdvancedTools(prevTools =>
      prevTools.map(tool =>
        tool.id === toolId
          ? { ...tool, status: tool.status === 'active' ? 'inactive' : 'active' }
          : tool
      )
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Database Selection Warning */}
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
                  SQL 분석을 시작하려면 상단의 데이터베이스 선택 메뉴에서 분석할 데이터베이스를 선택해주세요.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              고급 SQL 분석 도구
            </h1>
            <LLMStatusBadge showModel />
          </div>
          <p className="text-gray-500 dark:text-gray-400">
            AI 기반 성능 분석과 최적화 제안으로 SQL 성능을 극대화하세요
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          variant="outline"
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">연결된 DB</p>
                {loading ? (
                  <div className="h-8 w-32 bg-gray-200 animate-pulse rounded" />
                ) : selectedConnection ? (
                  <div>
                    <p className="text-xl font-bold">{selectedConnection.name}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {selectedConnection.host}:{selectedConnection.port}
                    </p>
                  </div>
                ) : (
                  <p className="text-lg font-medium text-gray-400">미선택</p>
                )}
              </div>
              <Database className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">분석된 SQL</p>
                {loading ? (
                  <div className="h-8 w-16 bg-gray-200 animate-pulse rounded" />
                ) : (
                  <p className="text-2xl font-bold">{stats.totalAnalyzed.toLocaleString()}</p>
                )}
              </div>
              <BarChart3 className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">발견된 이슈</p>
                {loading ? (
                  <div className="h-8 w-16 bg-gray-200 animate-pulse rounded" />
                ) : (
                  <p className="text-2xl font-bold text-orange-600">{stats.issuesFound}</p>
                )}
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">평균 개선율</p>
                {loading ? (
                  <div className="h-8 w-16 bg-gray-200 animate-pulse rounded" />
                ) : (
                  <p className="text-2xl font-bold text-blue-600">{stats.avgImprovement}%</p>
                )}
              </div>
              <GitCompare className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">실시간 모니터링</p>
                {loading ? (
                  <div className="h-8 w-16 bg-gray-200 animate-pulse rounded" />
                ) : (
                  <p className="text-2xl font-bold text-purple-600">{stats.activeMonitoring}</p>
                )}
              </div>
              <Activity className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Search Bar with AI Smart Search */}
      <Card>
        <CardContent className="p-6">
          <Tabs defaultValue="smart" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="smart" className="gap-2">
                <Sparkles className="h-4 w-4" />
                AI 스마트 검색
              </TabsTrigger>
              <TabsTrigger value="basic" className="gap-2">
                <Search className="h-4 w-4" />
                기본 검색
              </TabsTrigger>
            </TabsList>

            <TabsContent value="smart" className="space-y-4">
              <SmartSearchInput
                onSearch={handleSmartSearch}
                onTextSearch={handleTextSearch}
                placeholder="자연어로 검색 (예: '지난 주 느린 쿼리', 'CPU 사용량 높은 SELECT문')"
                language="ko"
              />
            </TabsContent>

            <TabsContent value="basic">
              <div className="flex space-x-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <Input
                      placeholder="SQL ID, 텍스트, 스키마로 검색... (예: SELECT * FROM users)"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleQuickSearch()}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select value={selectedFilter} onValueChange={setSelectedFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="필터 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">모든 SQL</SelectItem>
                    <SelectItem value="critical">심각한 이슈</SelectItem>
                    <SelectItem value="slow">느린 쿼리</SelectItem>
                    <SelectItem value="frequent">자주 실행</SelectItem>
                    <SelectItem value="recent">최근 실행</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleQuickSearch}>
                  <Search className="h-4 w-4 mr-2" />
                  검색
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Advanced Analysis Tools */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {quickActions.map((action) => (
          <Card
            key={action.href}
            className={`hover:shadow-lg transition-all cursor-pointer border-2 hover:border-blue-500 ${
              'isNew' in action && action.isNew ? 'ring-2 ring-purple-400 ring-offset-2' : ''
            }`}
            onClick={() => router.push(action.href)}
          >
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className={`inline-flex p-3 rounded-lg ${action.color} text-white`}>
                  <action.icon className="h-6 w-6" />
                </div>
                {'isNew' in action && action.isNew && (
                  <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs">
                    NEW
                  </Badge>
                )}
              </div>
              <h3 className="font-semibold text-lg mb-2">{action.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {action.description}
              </p>
              <div className="space-y-1">
                {action.features.map((feature, idx) => (
                  <div key={`action-feature-${action.title || ''}-${feature.substring(0, 20)}-${idx}`} className="flex items-center text-xs text-gray-500">
                    <div className="w-1 h-1 bg-gray-400 rounded-full mr-2" />
                    {feature}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center text-sm font-medium text-blue-600">
                시작하기 <ArrowRight className="h-4 w-4 ml-1" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Analysis Results Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>최근 분석 결과</span>
            <Button variant="outline" size="sm" onClick={() => router.push('/analysis/search')}>
              전체 보기
            </Button>
          </CardTitle>
          <CardDescription>
            최근 분석된 SQL 쿼리와 발견된 이슈들
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentSQLs.length > 0 ? (
              recentSQLs.map((sql: any, index: number) => (
                <div
                  key={`${sql.sql_id || sql.id || ''}_${index}`}
                  className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                  onClick={() => router.push(`/analysis/sql/${sql.sql_id}`)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <code className="text-sm font-mono text-blue-600">
                          {sql.sql_id}
                        </code>
                        <Badge variant="outline" className="text-xs">
                          {sql.schema_name || sql.parsing_schema_name || 'UNKNOWN'}
                        </Badge>
                        <Badge
                          className={`text-xs ${
                            (sql.cpu_time_ms || sql.cpu_time || 0) > 1000 ? 'bg-red-100 text-red-700' :
                            (sql.cpu_time_ms || sql.cpu_time || 0) > 500 ? 'bg-orange-100 text-orange-700' :
                            'bg-green-100 text-green-700'
                          }`}
                        >
                          CPU: {((sql.cpu_time_ms || sql.cpu_time || 0) / (sql.cpu_time_ms ? 1 : 1000)).toFixed(0)}ms
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                        {sql.sql_text || 'SQL text not available'}
                      </p>
                      <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                        <span>실행: {(sql.executions || 0).toLocaleString()}회</span>
                        <span>Buffer Gets: {(sql.buffer_gets || 0).toLocaleString()}</span>
                        <span>Disk Reads: {(sql.disk_reads || 0).toLocaleString()}</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                분석 결과가 없습니다. 새로운 분석을 시작해보세요.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Advanced Tools Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Settings className="h-5 w-5 mr-2" />
            고급 분석 기능
          </CardTitle>
          <CardDescription>
            전문가 수준의 SQL 성능 분석 도구
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {advancedTools.map((tool) => {
              const toolStat = toolStats[tool.id as keyof typeof toolStats]
              const isActive = toolStat?.status === 'active' && selectedConnectionId && selectedConnectionId !== 'all'
              const count = toolStat?.count || 0

              return (
                <Card
                  key={tool.id}
                  className={`border-2 cursor-pointer transition-all duration-200 hover:shadow-lg ${
                    isActive
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20'
                      : 'border-gray-300 bg-gray-50/50 dark:bg-gray-800/50 opacity-75'
                  }`}
                  onClick={() => {
                    if (tool.id === 'pattern-detection') {
                      router.push('/analysis/pattern-detection')
                    } else if (tool.id === 'sql-refactoring') {
                      router.push('/analysis/sql-refactoring')
                    } else if (tool.id === 'realtime-monitoring') {
                      router.push('/analysis/realtime-monitoring')
                    } else {
                      toggleAdvancedTool(tool.id)
                    }
                  }}
                >
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <tool.icon
                        className={`h-8 w-8 transition-colors ${
                          isActive
                            ? 'text-blue-600'
                            : 'text-gray-400'
                        }`}
                      />
                      <div className="flex items-center space-x-2">
                        {isActive && count > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {count}건
                          </Badge>
                        )}
                        <Badge
                          variant={isActive ? 'default' : 'secondary'}
                          className={`text-xs cursor-pointer hover:scale-105 transition-transform ${
                            isActive
                              ? 'bg-green-600 hover:bg-green-700'
                              : 'bg-gray-400 hover:bg-gray-500'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation()
                            // 활성 버튼 클릭 시 해당 기능 페이지로 이동
                            if (tool.id === 'pattern-detection') {
                              router.push('/analysis/pattern-detection')
                            } else if (tool.id === 'sql-refactoring') {
                              router.push('/analysis/sql-refactoring')
                            } else if (tool.id === 'realtime-monitoring') {
                              router.push('/analysis/realtime-monitoring')
                            }
                          }}
                        >
                          {isActive ? '활성' : '비활성'}
                        </Badge>
                      </div>
                    </div>
                    <h3 className={`font-semibold mb-2 transition-colors ${
                      isActive
                        ? 'text-gray-900 dark:text-white'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {tool.title}
                    </h3>
                    <p className={`text-sm mb-4 transition-colors ${
                      isActive
                        ? 'text-gray-600 dark:text-gray-300'
                        : 'text-gray-400 dark:text-gray-500'
                    }`}>
                      {tool.description}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {tool.features.map((feature, idx) => (
                        <div key={`tool-feature-${tool.id || ''}-${feature.substring(0, 20)}-${idx}`} className={`flex items-center text-xs transition-colors ${
                          isActive
                            ? 'text-gray-600 dark:text-gray-300'
                            : 'text-gray-400 dark:text-gray-500'
                        }`}>
                          <div className={`w-1 h-1 rounded-full mr-1 transition-colors ${
                            isActive
                              ? 'bg-blue-500'
                              : 'bg-gray-400'
                          }`} />
                          {feature}
                        </div>
                      ))}
                    </div>
                    {isActive && (
                      <div className="mt-4 flex items-center justify-between">
                        <div className="text-xs text-blue-600 dark:text-blue-400 font-medium animate-pulse">
                          ● 실행 중
                        </div>
                        {selectedConnection && (
                          <div className="text-xs text-gray-500">
                            {selectedConnection.name}
                          </div>
                        )}
                      </div>
                    )}
                    {!isActive && (
                      <div className="mt-4 text-xs text-gray-400 font-medium">
                        {selectedConnectionId && selectedConnectionId !== 'all' 
                          ? '데이터 로딩 중...' 
                          : '데이터베이스를 선택해주세요'}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}