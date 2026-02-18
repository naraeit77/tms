'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSelectedDatabase } from '@/hooks/use-selected-database'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Search,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ArrowUpDown,
  GitCompare,
  Sparkles,
  X
} from 'lucide-react'
import { debounce } from 'es-toolkit'

interface SQLResult {
  id: string
  sql_id: string
  sql_text: string
  schema_name: string
  executions: number
  elapsed_time_ms: number
  cpu_time_ms: number
  buffer_gets: number
  disk_reads: number
  rows_processed: number
  collected_at?: string
  oracle_connection_id: string
}

// AI 검색 필터 파라미터 파싱
interface AISearchFilters {
  pattern?: string
  schema?: string
  minElapsed?: number
  maxElapsed?: number
  minBuffer?: number
  maxBuffer?: number
  timeRange?: string
  orderBy?: string
  order?: 'asc' | 'desc'
  limit?: number
  isAISearch: boolean
}

function parseAISearchParams(searchParams: URLSearchParams): AISearchFilters {
  return {
    pattern: searchParams.get('pattern') || undefined,
    schema: searchParams.get('schema') || undefined,
    minElapsed: searchParams.get('min_elapsed') ? parseInt(searchParams.get('min_elapsed')!) : undefined,
    maxElapsed: searchParams.get('max_elapsed') ? parseInt(searchParams.get('max_elapsed')!) : undefined,
    minBuffer: searchParams.get('min_buffer') ? parseInt(searchParams.get('min_buffer')!) : undefined,
    maxBuffer: searchParams.get('max_buffer') ? parseInt(searchParams.get('max_buffer')!) : undefined,
    timeRange: searchParams.get('time_range') || undefined,
    orderBy: searchParams.get('order_by') || undefined,
    order: (searchParams.get('order') as 'asc' | 'desc') || undefined,
    limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
    isAISearch: searchParams.get('ai_search') === 'true'
  }
}

// 시간 범위를 시간 단위로 변환
function getTimeRangeHours(timeRange: string): number {
  switch (timeRange) {
    case '1h': return 1
    case '6h': return 6
    case '12h': return 12
    case '24h': return 24
    case '7d': return 24 * 7
    case '30d': return 24 * 30
    case '90d': return 24 * 90
    default: return 24 * 365 // 'all' or unknown
  }
}

// 시간 범위 레이블
function getTimeRangeLabel(timeRange: string): string {
  switch (timeRange) {
    case '1h': return '최근 1시간'
    case '6h': return '최근 6시간'
    case '12h': return '최근 12시간'
    case '24h': return '최근 24시간'
    case '7d': return '최근 7일'
    case '30d': return '최근 30일'
    case '90d': return '최근 90일'
    default: return '전체'
  }
}

export default function SQLSearchPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { selectedConnectionId } = useSelectedDatabase()
  const initialQuery = searchParams.get('q') || ''

  // AI 검색 필터 파싱
  const aiFilters = useMemo(() => parseAISearchParams(searchParams), [searchParams])

  // AI 검색 필터에서 정렬 기준 변환
  const mapOrderByToSortBy = (orderBy?: string): string => {
    if (!orderBy) return 'cpu_time_ms'
    switch (orderBy) {
      case 'elapsed_time': return 'elapsed_time_ms'
      case 'cpu_time': return 'cpu_time_ms'
      case 'executions': return 'executions'
      case 'buffer_gets': return 'buffer_gets'
      case 'disk_reads': return 'disk_reads'
      default: return 'cpu_time_ms'
    }
  }

  const [searchQuery, setSearchQuery] = useState(initialQuery)
  const [results, setResults] = useState<SQLResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedSQLs, setSelectedSQLs] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const [totalResults, setTotalResults] = useState(0)
  // AI 필터에서 정렬 기준 초기화
  const [sortBy, setSortBy] = useState(mapOrderByToSortBy(aiFilters.orderBy))
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(aiFilters.order || 'desc')
  const [filters, setFilters] = useState({
    schema: aiFilters.schema || 'all',
    minExecutions: 0,
    maxCpuTime: Infinity,
    performanceGrade: 'all',
    // AI 검색 필터 추가
    minElapsedTime: aiFilters.minElapsed || 0,
    maxElapsedTime: aiFilters.maxElapsed || Infinity,
    minBufferGets: aiFilters.minBuffer || 0,
    maxBufferGets: aiFilters.maxBuffer || Infinity,
    sqlPattern: aiFilters.pattern || '',
    timeRange: aiFilters.timeRange || 'all'
  })
  const [availableSchemas, setAvailableSchemas] = useState<string[]>([])

  const resultsPerPage = aiFilters.limit || 20

  // SQL_ID 형식 감지 (13자리 영숫자)
  const isSQLIdFormat = (query: string): boolean => {
    const trimmed = query.trim()
    // SQL_ID는 보통 13자리 영숫자 문자열
    return /^[a-zA-Z0-9]{13}$/.test(trimmed)
  }

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce((query: string) => {
      performSearch(query)
    }, 500),
    []
  )

  // AI 검색 필터 초기화
  const clearAIFilters = useCallback(() => {
    router.push('/analysis/search')
  }, [router])

  // 활성 AI 필터 배지 생성
  const activeAIFilterBadges = useMemo(() => {
    const badges: { label: string; value: string }[] = []

    if (aiFilters.minElapsed) {
      badges.push({ label: '최소 실행시간', value: `${aiFilters.minElapsed}ms` })
    }
    if (aiFilters.maxElapsed) {
      badges.push({ label: '최대 실행시간', value: `${aiFilters.maxElapsed}ms` })
    }
    if (aiFilters.minBuffer) {
      badges.push({ label: '최소 Buffer Gets', value: aiFilters.minBuffer.toLocaleString() })
    }
    if (aiFilters.maxBuffer) {
      badges.push({ label: '최대 Buffer Gets', value: aiFilters.maxBuffer.toLocaleString() })
    }
    if (aiFilters.timeRange) {
      badges.push({ label: '기간', value: getTimeRangeLabel(aiFilters.timeRange) })
    }
    if (aiFilters.schema) {
      badges.push({ label: '스키마', value: aiFilters.schema })
    }
    if (aiFilters.pattern) {
      badges.push({ label: 'SQL 패턴', value: aiFilters.pattern })
    }
    if (aiFilters.orderBy) {
      const orderLabel = aiFilters.orderBy === 'elapsed_time' ? '실행시간' :
                         aiFilters.orderBy === 'cpu_time' ? 'CPU 시간' :
                         aiFilters.orderBy === 'buffer_gets' ? 'Buffer Gets' :
                         aiFilters.orderBy === 'disk_reads' ? 'Disk Reads' :
                         aiFilters.orderBy === 'executions' ? '실행횟수' : aiFilters.orderBy
      badges.push({ label: '정렬', value: `${orderLabel} ${aiFilters.order === 'asc' ? '↑' : '↓'}` })
    }

    return badges
  }, [aiFilters])

  useEffect(() => {
    if (selectedConnectionId && selectedConnectionId !== 'all') {
      // Load schemas when connection changes
      loadSchemas()

      // AI 검색이면 필터 기반 검색 실행
      if (aiFilters.isAISearch) {
        loadAllSQLs()
      } else if (searchQuery) {
        debouncedSearch(searchQuery)
      } else {
        loadAllSQLs()
      }
    } else {
      setResults([])
      setTotalResults(0)
      setAvailableSchemas([])
    }
  }, [searchQuery, filters, sortBy, sortOrder, currentPage, selectedConnectionId, aiFilters.isAISearch])

  const loadSchemas = async () => {
    if (!selectedConnectionId || selectedConnectionId === 'all') {
      return
    }

    try {
      const response = await fetch(`/api/monitoring/schemas?connection_id=${selectedConnectionId}`)
      const data = await response.json()

      if (Array.isArray(data.data)) {
        setAvailableSchemas(data.data)
      }
    } catch (error) {
      console.error('Failed to load schemas:', error)
    }
  }

  const performSearch = async (query: string) => {
    if (!selectedConnectionId || selectedConnectionId === 'all') {
      setResults([])
      return
    }

    setLoading(true)
    try {
      const params = new URLSearchParams({
        connection_id: selectedConnectionId,
        limit: '10000',
        order_by: sortBy
      })

      // SQL_ID 형식이면 API에 sql_id 파라미터 전달
      if (isSQLIdFormat(query)) {
        params.append('sql_id', query.trim())
      }

      const response = await fetch(`/api/monitoring/sql-statistics?${params}`)
      const data = await response.json()

      if (Array.isArray(data.data)) {
        // SQL_ID로 직접 조회한 경우 필터링 불필요
        let filtered = data.data

        // SQL_ID 형식이 아니거나 API에서 필터링되지 않은 경우 클라이언트 사이드 필터링
        if (!isSQLIdFormat(query)) {
          filtered = data.data.filter((sql: SQLResult) => {
            const searchLower = query.toLowerCase().trim()
            return (
              sql.sql_id.toLowerCase().includes(searchLower) ||
              (sql.sql_text && sql.sql_text.toLowerCase().includes(searchLower)) ||
              (sql.schema_name && sql.schema_name.toLowerCase().includes(searchLower))
            )
          })
        }

        // Apply all filters
        filtered = applyFilters(filtered)

        // Sort
        filtered.sort((a: SQLResult, b: SQLResult) => {
          const aVal = (a[sortBy as keyof SQLResult] as number) || 0
          const bVal = (b[sortBy as keyof SQLResult] as number) || 0
          return sortOrder === 'desc' ? bVal - aVal : aVal - bVal
        })

        setTotalResults(filtered.length)

        // Paginate
        const start = (currentPage - 1) * resultsPerPage
        const paginated = filtered.slice(start, start + resultsPerPage)

        setResults(paginated)
      } else {
        setResults([])
        setTotalResults(0)
      }
    } catch (error) {
      console.error('Search failed:', error)
      setResults([])
      setTotalResults(0)
    } finally {
      setLoading(false)
    }
  }

  // 모든 필터 적용 함수
  const applyFilters = (data: SQLResult[]): SQLResult[] => {
    let filtered = data

    // 스키마 필터
    if (filters.schema !== 'all') {
      filtered = filtered.filter((sql: SQLResult) => sql.schema_name === filters.schema)
    }

    // 최소 실행 횟수
    if (filters.minExecutions > 0) {
      filtered = filtered.filter((sql: SQLResult) => (sql.executions || 0) >= filters.minExecutions)
    }

    // 최대 CPU 시간
    if (filters.maxCpuTime < Infinity) {
      filtered = filtered.filter((sql: SQLResult) => (sql.cpu_time_ms || 0) <= filters.maxCpuTime)
    }

    // AI 검색 필터 적용
    // 최소 실행 시간 (elapsed_time)
    if (filters.minElapsedTime > 0) {
      filtered = filtered.filter((sql: SQLResult) => (sql.elapsed_time_ms || 0) >= filters.minElapsedTime)
    }

    // 최대 실행 시간
    if (filters.maxElapsedTime < Infinity) {
      filtered = filtered.filter((sql: SQLResult) => (sql.elapsed_time_ms || 0) <= filters.maxElapsedTime)
    }

    // 최소 Buffer Gets
    if (filters.minBufferGets > 0) {
      filtered = filtered.filter((sql: SQLResult) => (sql.buffer_gets || 0) >= filters.minBufferGets)
    }

    // 최대 Buffer Gets
    if (filters.maxBufferGets < Infinity) {
      filtered = filtered.filter((sql: SQLResult) => (sql.buffer_gets || 0) <= filters.maxBufferGets)
    }

    // SQL 패턴 필터 (LIKE 검색)
    if (filters.sqlPattern) {
      const pattern = filters.sqlPattern.replace(/%/g, '.*').toLowerCase()
      const regex = new RegExp(pattern, 'i')
      filtered = filtered.filter((sql: SQLResult) =>
        sql.sql_text && regex.test(sql.sql_text)
      )
    }

    // 시간 범위 필터
    if (filters.timeRange && filters.timeRange !== 'all') {
      const hoursAgo = getTimeRangeHours(filters.timeRange)
      const cutoffTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000)
      filtered = filtered.filter((sql: SQLResult) => {
        if (!sql.collected_at) return true
        const collectedAt = new Date(sql.collected_at)
        return collectedAt >= cutoffTime
      })
    }

    return filtered
  }

  const loadAllSQLs = async () => {
    if (!selectedConnectionId || selectedConnectionId === 'all') {
      setResults([])
      setTotalResults(0)
      return
    }

    setLoading(true)
    try {
      const params = new URLSearchParams({
        connection_id: selectedConnectionId,
        limit: '10000',
        order_by: sortBy
      })

      const response = await fetch(`/api/monitoring/sql-statistics?${params}`)
      const data = await response.json()

      if (Array.isArray(data.data)) {
        let filtered = applyFilters(data.data)

        // Sort
        filtered.sort((a: SQLResult, b: SQLResult) => {
          const aVal = (a[sortBy as keyof SQLResult] as number) || 0
          const bVal = (b[sortBy as keyof SQLResult] as number) || 0
          return sortOrder === 'desc' ? bVal - aVal : aVal - bVal
        })

        setTotalResults(filtered.length)

        // Paginate
        const start = (currentPage - 1) * resultsPerPage
        const paginated = filtered.slice(start, start + resultsPerPage)

        setResults(paginated)
      } else {
        setResults([])
        setTotalResults(0)
      }
    } catch (error) {
      console.error('Failed to load SQLs:', error)
      setResults([])
      setTotalResults(0)
    } finally {
      setLoading(false)
    }
  }

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  const handleSelectSQL = (sqlId: string) => {
    const newSelected = new Set(selectedSQLs)
    if (newSelected.has(sqlId)) {
      newSelected.delete(sqlId)
    } else {
      newSelected.add(sqlId)
    }
    setSelectedSQLs(newSelected)
  }

  const handleCompare = () => {
    if (selectedSQLs.size > 1) {
      const sqlIds = Array.from(selectedSQLs).join(',')
      router.push(`/analysis/compare?sql_ids=${sqlIds}`)
    }
  }

  const handleExport = () => {
    // Export selected or all results
    const dataToExport = selectedSQLs.size > 0
      ? results.filter(r => selectedSQLs.has(r.sql_id))
      : results

    const csv = [
      ['SQL ID', 'Schema', 'Executions', 'Elapsed Time', 'CPU Time', 'Buffer Gets', 'Disk Reads'].join(','),
      ...dataToExport.map(r => [
        r.sql_id,
        r.schema_name,
        r.executions,
        r.elapsed_time_ms,
        r.cpu_time_ms,
        r.buffer_gets,
        r.disk_reads
      ].join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sql_search_results.csv'
    a.click()
  }

  const getPerformanceColor = (cpuTime: number) => {
    if (cpuTime < 100) return 'bg-green-100 text-green-700'
    if (cpuTime < 500) return 'bg-yellow-100 text-yellow-700'
    if (cpuTime < 1000) return 'bg-orange-100 text-orange-700'
    return 'bg-red-100 text-red-700'
  }

  const totalPages = Math.ceil(totalResults / resultsPerPage)

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
                  SQL 검색을 시작하려면 상단의 데이터베이스 선택 메뉴에서 데이터베이스를 선택해주세요.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            SQL 검색 및 분석
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            SQL 쿼리를 검색하고 성능 메트릭을 분석합니다
          </p>
        </div>
        <div className="flex space-x-2">
          {selectedSQLs.size > 1 && (
            <Button onClick={handleCompare}>
              <GitCompare className="h-4 w-4 mr-2" />
              {selectedSQLs.size}개 비교
            </Button>
          )}
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            내보내기
          </Button>
        </div>
      </div>

      {/* AI Search Active Filters Banner */}
      {aiFilters.isAISearch && activeAIFilterBadges.length > 0 && (
        <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-600" />
                  <span className="font-medium text-purple-900 dark:text-purple-300">
                    AI 검색 필터 적용됨
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeAIFilterBadges.map((badge, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs bg-white/80 dark:bg-gray-800/80">
                      {badge.label}: {badge.value}
                    </Badge>
                  ))}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAIFilters}
                className="text-purple-600 hover:text-purple-700 hover:bg-purple-100"
              >
                <X className="h-4 w-4 mr-1" />
                필터 초기화
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="flex space-x-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  placeholder="SQL ID (13자리), SQL 텍스트, 테이블명으로 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (searchQuery.trim()) {
                        performSearch(searchQuery)
                      } else {
                        loadAllSQLs()
                      }
                    }
                  }}
                />
              </div>
              <Button
                variant="outline"
                onClick={() => loadAllSQLs()}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                새로고침
              </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1">
                <label className="text-xs text-gray-500">스키마</label>
                <Select
                  value={filters.schema}
                  onValueChange={(value) => setFilters({ ...filters, schema: value })}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">모든 스키마</SelectItem>
                    {availableSchemas.map((schema) => (
                      <SelectItem key={schema} value={schema}>
                        {schema}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-500">최소 실행 횟수</label>
                <Select
                  value={filters.minExecutions.toString()}
                  onValueChange={(value) => setFilters({ ...filters, minExecutions: parseInt(value) })}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">모든 실행</SelectItem>
                    <SelectItem value="100">100회 이상</SelectItem>
                    <SelectItem value="1000">1,000회 이상</SelectItem>
                    <SelectItem value="10000">10,000회 이상</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-500">최대 CPU 시간</label>
                <Select
                  value={filters.maxCpuTime === Infinity ? 'all' : filters.maxCpuTime.toString()}
                  onValueChange={(value) => setFilters({ ...filters, maxCpuTime: value === 'all' ? Infinity : parseInt(value) })}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">제한 없음</SelectItem>
                    <SelectItem value="1000">1초 이하</SelectItem>
                    <SelectItem value="5000">5초 이하</SelectItem>
                    <SelectItem value="10000">10초 이하</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 시간 범위 필터 추가 */}
              <div className="space-y-1">
                <label className="text-xs text-gray-500">기간</label>
                <Select
                  value={filters.timeRange}
                  onValueChange={(value) => setFilters({ ...filters, timeRange: value })}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="1h">최근 1시간</SelectItem>
                    <SelectItem value="6h">최근 6시간</SelectItem>
                    <SelectItem value="24h">최근 24시간</SelectItem>
                    <SelectItem value="7d">최근 7일</SelectItem>
                    <SelectItem value="30d">최근 30일</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            검색 결과 ({totalResults.toLocaleString()}개)
            {aiFilters.isAISearch && (
              <Badge variant="outline" className="text-purple-600 border-purple-300">
                <Sparkles className="h-3 w-3 mr-1" />
                AI 검색
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            클릭하여 상세 분석을 보거나 여러 개를 선택하여 비교할 수 있습니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-left">
                    <Checkbox
                      checked={selectedSQLs.size === results.length && results.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedSQLs(new Set(results.map(r => r.sql_id)))
                        } else {
                          setSelectedSQLs(new Set())
                        }
                      }}
                    />
                  </th>
                  <th className="p-2 text-left">SQL ID</th>
                  <th className="p-2 text-left">스키마</th>
                  <th
                    className="p-2 text-left cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                    onClick={() => handleSort('executions')}
                  >
                    <div className="flex items-center">
                      실행 횟수
                      <ArrowUpDown className={`h-4 w-4 ml-1 ${sortBy === 'executions' ? 'text-blue-600' : ''}`} />
                    </div>
                  </th>
                  <th
                    className="p-2 text-left cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                    onClick={() => handleSort('elapsed_time_ms')}
                  >
                    <div className="flex items-center">
                      실행시간
                      <ArrowUpDown className={`h-4 w-4 ml-1 ${sortBy === 'elapsed_time_ms' ? 'text-blue-600' : ''}`} />
                    </div>
                  </th>
                  <th
                    className="p-2 text-left cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                    onClick={() => handleSort('cpu_time_ms')}
                  >
                    <div className="flex items-center">
                      CPU Time
                      <ArrowUpDown className={`h-4 w-4 ml-1 ${sortBy === 'cpu_time_ms' ? 'text-blue-600' : ''}`} />
                    </div>
                  </th>
                  <th
                    className="p-2 text-left cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                    onClick={() => handleSort('buffer_gets')}
                  >
                    <div className="flex items-center">
                      Buffer Gets
                      <ArrowUpDown className={`h-4 w-4 ml-1 ${sortBy === 'buffer_gets' ? 'text-blue-600' : ''}`} />
                    </div>
                  </th>
                  <th className="p-2 text-left">상태</th>
                  <th className="p-2 text-left">작업</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-gray-500">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                      검색 중...
                    </td>
                  </tr>
                ) : results.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-gray-500">
                      {aiFilters.isAISearch
                        ? 'AI 검색 조건에 맞는 결과가 없습니다. 필터를 초기화하거나 조건을 변경해보세요.'
                        : '검색 결과가 없습니다'}
                    </td>
                  </tr>
                ) : (
                  results.map((sql) => (
                    <tr
                      key={sql.id}
                      className="border-b hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <td className="p-2">
                        <Checkbox
                          checked={selectedSQLs.has(sql.sql_id)}
                          onCheckedChange={() => handleSelectSQL(sql.sql_id)}
                        />
                      </td>
                      <td className="p-2">
                        <code className="text-sm font-mono text-blue-600 cursor-pointer hover:underline"
                          onClick={() => router.push(`/analysis/sql/${sql.sql_id}`)}
                        >
                          {sql.sql_id}
                        </code>
                      </td>
                      <td className="p-2">
                        <Badge variant="outline" className="text-xs">
                          {sql.schema_name || 'N/A'}
                        </Badge>
                      </td>
                      <td className="p-2 text-sm">
                        {(sql.executions || 0).toLocaleString()}
                      </td>
                      <td className="p-2">
                        <Badge className={getPerformanceColor(sql.elapsed_time_ms || 0)}>
                          {(sql.elapsed_time_ms || 0).toFixed(0)}ms
                        </Badge>
                      </td>
                      <td className="p-2">
                        <Badge className={getPerformanceColor(sql.cpu_time_ms || 0)}>
                          {(sql.cpu_time_ms || 0).toFixed(0)}ms
                        </Badge>
                      </td>
                      <td className="p-2 text-sm">
                        {(sql.buffer_gets || 0).toLocaleString()}
                      </td>
                      <td className="p-2">
                        {(sql.elapsed_time_ms || 0) > 1000 ? (
                          <XCircle className="h-5 w-5 text-red-500" />
                        ) : (sql.elapsed_time_ms || 0) > 500 ? (
                          <AlertTriangle className="h-5 w-5 text-orange-500" />
                        ) : (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        )}
                      </td>
                      <td className="p-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push(`/analysis/sql/${sql.sql_id}`)}
                        >
                          분석
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-gray-500">
                총 {totalResults}개 중 {((currentPage - 1) * resultsPerPage) + 1}-
                {Math.min(currentPage * resultsPerPage, totalResults)}개 표시
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  이전
                </Button>
                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const page = currentPage - 2 + i
                    if (page < 1 || page > totalPages) return null
                    return (
                      <Button
                        key={page}
                        variant={page === currentPage ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </Button>
                    )
                  }).filter(Boolean)}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  다음
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
