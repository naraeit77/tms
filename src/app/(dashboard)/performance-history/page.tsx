'use client'

/**
 * 성능 히스토리 페이지
 * 과거 SQL 성능 데이터를 날짜별/시간별로 조회하고 분석하는 페이지
 */

import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSelectedDatabase } from '@/hooks/use-selected-database'
import { useToast } from '@/hooks/use-toast'
import {
  History,
  Calendar,
  Search,
  TrendingUp,
  TrendingDown,
  Clock,
  Database,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Activity,
  Zap,
  HardDrive,
  AlertTriangle,
  CheckCircle2,
  Timer,
  FileText,
  Code,
  Loader2,
  Copy,
  ExternalLink,
  X,
  Table,
  ListTree,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

// 성능 등급 계산 함수
function calculateGrade(elapsedTime: number, bufferGets: number): string {
  if (elapsedTime < 100 && bufferGets < 1000) return 'A'
  if (elapsedTime < 500 && bufferGets < 5000) return 'B'
  if (elapsedTime < 1000 && bufferGets < 10000) return 'C'
  if (elapsedTime < 3000 && bufferGets < 50000) return 'D'
  return 'F'
}

function getGradeColor(grade: string): string {
  switch (grade) {
    case 'A': return 'bg-green-500'
    case 'B': return 'bg-blue-500'
    case 'C': return 'bg-yellow-500'
    case 'D': return 'bg-orange-500'
    case 'F': return 'bg-red-500'
    default: return 'bg-gray-500'
  }
}

function getGradeBadgeVariant(grade: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (grade) {
    case 'A':
    case 'B':
      return 'default'
    case 'C':
      return 'secondary'
    case 'D':
    case 'F':
      return 'destructive'
    default:
      return 'outline'
  }
}

// 시간 옵션 생성 헬퍼
function generateTimeOptions() {
  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'))
  const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'))
  return { hours, minutes }
}

const { hours: HOURS, minutes: MINUTES } = generateTimeOptions()

export default function PerformanceHistoryPage() {
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase()
  const { toast } = useToast()
  // 기본값을 오늘로 변경 - V$SQL은 현재 캐시된 데이터만 있으므로 오늘 데이터가 가장 정확
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'elapsed_time' | 'executions' | 'buffer_gets'>('elapsed_time')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [gradeFilter, setGradeFilter] = useState<string>('all')

  // 시간 범위 필터 상태
  const [useTimeFilter, setUseTimeFilter] = useState(false)
  const [startHour, setStartHour] = useState('00')
  const [startMinute, setStartMinute] = useState('00')
  const [endHour, setEndHour] = useState('23')
  const [endMinute, setEndMinute] = useState('59')

  // SQL 상세정보 Sheet 상태
  const [selectedSqlId, setSelectedSqlId] = useState<string | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [detailTab, setDetailTab] = useState<'info' | 'plan' | 'history'>('info')

  // 날짜 변경 핸들러
  const handlePrevDay = () => setSelectedDate(prev => subDays(prev, 1))
  const handleNextDay = () => {
    const nextDay = new Date(selectedDate)
    nextDay.setDate(nextDay.getDate() + 1)
    if (nextDay <= new Date()) {
      setSelectedDate(nextDay)
    }
  }
  const handleToday = () => setSelectedDate(new Date())
  const handleYesterday = () => setSelectedDate(subDays(new Date(), 1))

  // 빠른 시간 범위 설정
  const handleQuickTimeRange = (range: string) => {
    setUseTimeFilter(true)
    switch (range) {
      case 'morning':
        setStartHour('06')
        setStartMinute('00')
        setEndHour('12')
        setEndMinute('00')
        break
      case 'afternoon':
        setStartHour('12')
        setStartMinute('00')
        setEndHour('18')
        setEndMinute('00')
        break
      case 'evening':
        setStartHour('18')
        setStartMinute('00')
        setEndHour('23')
        setEndMinute('59')
        break
      case 'night':
        setStartHour('00')
        setStartMinute('00')
        setEndHour('06')
        setEndMinute('00')
        break
      case 'business':
        setStartHour('09')
        setStartMinute('00')
        setEndHour('18')
        setEndMinute('00')
        break
      case '1hour':
        // 현재 시간 기준 1시간 전~현재
        const now = new Date()
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
        setStartHour(oneHourAgo.getHours().toString().padStart(2, '0'))
        setStartMinute(oneHourAgo.getMinutes().toString().padStart(2, '0'))
        setEndHour(now.getHours().toString().padStart(2, '0'))
        setEndMinute(now.getMinutes().toString().padStart(2, '0'))
        break
      case 'all':
        setUseTimeFilter(false)
        setStartHour('00')
        setStartMinute('00')
        setEndHour('23')
        setEndMinute('59')
        break
    }
  }

  // 시간 범위 문자열 생성
  const timeRangeParams = useMemo(() => {
    if (!useTimeFilter) return ''
    return `&start_time=${startHour}:${startMinute}:00&end_time=${endHour}:${endMinute}:59`
  }, [useTimeFilter, startHour, startMinute, endHour, endMinute])

  // 히스토리 데이터 조회
  const { data: historyData, isLoading, refetch } = useQuery({
    queryKey: ['performance-history', selectedConnectionId, format(selectedDate, 'yyyy-MM-dd'), timeRangeParams],
    queryFn: async () => {
      if (!selectedConnectionId) return null
      const dateStr = format(selectedDate, 'yyyy-MM-dd')
      const res = await fetch(`/api/monitoring/performance-history?connection_id=${selectedConnectionId}&date=${dateStr}${timeRangeParams}`)
      if (!res.ok) throw new Error('Failed to fetch history')
      return res.json()
    },
    enabled: !!selectedConnectionId,
    staleTime: 5 * 60 * 1000, // 5분
  })

  // 일별 요약 통계 조회
  const { data: summaryData } = useQuery({
    queryKey: ['performance-summary', selectedConnectionId, format(selectedDate, 'yyyy-MM-dd'), timeRangeParams],
    queryFn: async () => {
      if (!selectedConnectionId) return null
      const dateStr = format(selectedDate, 'yyyy-MM-dd')
      const res = await fetch(`/api/monitoring/performance-summary?connection_id=${selectedConnectionId}&date=${dateStr}${timeRangeParams}`)
      if (!res.ok) throw new Error('Failed to fetch summary')
      return res.json()
    },
    enabled: !!selectedConnectionId,
    staleTime: 5 * 60 * 1000,
  })

  // SQL 상세정보 조회
  const { data: sqlDetailData, isLoading: isLoadingDetail } = useQuery({
    queryKey: ['sql-detail', selectedConnectionId, selectedSqlId],
    queryFn: async () => {
      if (!selectedConnectionId || !selectedSqlId) return null
      const res = await fetch(`/api/monitoring/sql-detail?connection_id=${selectedConnectionId}&sql_id=${selectedSqlId}`)
      if (!res.ok) throw new Error('Failed to fetch SQL detail')
      return res.json()
    },
    enabled: !!selectedConnectionId && !!selectedSqlId && isSheetOpen,
    staleTime: 60 * 1000,
  })

  // SQL ID 클릭 핸들러
  const handleSqlClick = useCallback((sqlId: string) => {
    setSelectedSqlId(sqlId)
    setDetailTab('info')
    setIsSheetOpen(true)
  }, [])

  // SQL 텍스트 복사 핸들러
  const handleCopySql = useCallback(() => {
    const sqlText = sqlDetailData?.data?.sql_info?.sql_text
    if (sqlText) {
      navigator.clipboard.writeText(sqlText)
      toast({
        title: 'SQL 복사 완료',
        description: 'SQL 텍스트가 클립보드에 복사되었습니다.',
      })
    }
  }, [sqlDetailData, toast])

  // 필터링 및 정렬된 SQL 목록
  const filteredSQLs = useMemo(() => {
    if (!historyData?.data) return []

    let filtered = historyData.data.filter((sql: any) => {
      // 검색어 필터
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        if (!sql.sql_id?.toLowerCase().includes(term) &&
            !sql.sql_text?.toLowerCase().includes(term)) {
          return false
        }
      }
      // 등급 필터
      if (gradeFilter !== 'all') {
        const grade = calculateGrade(sql.avg_elapsed_time || 0, sql.avg_buffer_gets || 0)
        if (grade !== gradeFilter) return false
      }
      return true
    })

    // 정렬
    filtered.sort((a: any, b: any) => {
      let aVal = a[sortBy === 'elapsed_time' ? 'avg_elapsed_time' : sortBy === 'buffer_gets' ? 'avg_buffer_gets' : 'executions'] || 0
      let bVal = b[sortBy === 'elapsed_time' ? 'avg_elapsed_time' : sortBy === 'buffer_gets' ? 'avg_buffer_gets' : 'executions'] || 0
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal
    })

    return filtered
  }, [historyData, searchTerm, gradeFilter, sortBy, sortOrder])

  // 등급별 통계
  const gradeStats = useMemo(() => {
    if (!historyData?.data) return { A: 0, B: 0, C: 0, D: 0, F: 0 }

    const stats = { A: 0, B: 0, C: 0, D: 0, F: 0 }
    historyData.data.forEach((sql: any) => {
      const grade = calculateGrade(sql.avg_elapsed_time || 0, sql.avg_buffer_gets || 0)
      stats[grade as keyof typeof stats]++
    })
    return stats
  }, [historyData])

  const isNextDisabled = selectedDate >= subDays(new Date(), 1)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-3">
            <History className="h-8 w-8 text-purple-600" />
            성능 히스토리
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            과거 날짜별 SQL 성능 데이터를 조회하고 분석합니다
          </p>
        </div>

        {/* 날짜 선택기 */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevDay}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">
              {format(selectedDate, 'yyyy년 M월 d일 (EEEE)', { locale: ko })}
            </span>
          </div>
          <Button variant="outline" size="icon" onClick={handleNextDay} disabled={isNextDisabled}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={handleYesterday}>
            어제
          </Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 연결된 DB 정보 */}
      {selectedConnection && (
        <Card className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950 dark:to-indigo-950 border-purple-200 dark:border-purple-800">
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <Database className="h-6 w-6 text-purple-600" />
              <div>
                <p className="font-semibold text-purple-900 dark:text-purple-100">{selectedConnection.name}</p>
                <p className="text-sm text-purple-600 dark:text-purple-400">
                  {selectedConnection.host}:{selectedConnection.port} / {selectedConnection.serviceName || selectedConnection.sid}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 시간 범위 필터 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Timer className="h-5 w-5 text-blue-600" />
              시간 범위 필터
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant={useTimeFilter ? "default" : "outline"}
                size="sm"
                onClick={() => setUseTimeFilter(!useTimeFilter)}
              >
                {useTimeFilter ? '시간 필터 활성화됨' : '시간 필터 사용'}
              </Button>
              {useTimeFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleQuickTimeRange('all')}
                >
                  필터 해제
                </Button>
              )}
            </div>
          </div>
          <CardDescription>
            특정 시간대의 SQL 성능만 조회하려면 시간 범위를 설정하세요
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* 빠른 시간 범위 버튼 */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickTimeRange('business')}
                className={useTimeFilter && startHour === '09' && endHour === '18' ? 'border-primary bg-primary/10' : ''}
              >
                업무시간 (09:00-18:00)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickTimeRange('morning')}
                className={useTimeFilter && startHour === '06' && endHour === '12' ? 'border-primary bg-primary/10' : ''}
              >
                오전 (06:00-12:00)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickTimeRange('afternoon')}
                className={useTimeFilter && startHour === '12' && endHour === '18' ? 'border-primary bg-primary/10' : ''}
              >
                오후 (12:00-18:00)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickTimeRange('evening')}
                className={useTimeFilter && startHour === '18' && endHour === '23' ? 'border-primary bg-primary/10' : ''}
              >
                저녁 (18:00-24:00)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleQuickTimeRange('night')}
                className={useTimeFilter && startHour === '00' && endHour === '06' ? 'border-primary bg-primary/10' : ''}
              >
                야간 (00:00-06:00)
              </Button>
            </div>

            {/* 상세 시간 선택 */}
            {useTimeFilter && (
              <div className="flex flex-wrap items-end gap-4 p-4 bg-muted/50 rounded-lg border">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium whitespace-nowrap">시작 시간</Label>
                  <div className="flex items-center gap-1">
                    <Select value={startHour} onValueChange={setStartHour}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {HOURS.map(h => (
                          <SelectItem key={h} value={h}>{h}시</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground">:</span>
                    <Select value={startMinute} onValueChange={setStartMinute}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {MINUTES.map(m => (
                          <SelectItem key={m} value={m}>{m}분</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <span className="text-muted-foreground font-medium px-2">~</span>

                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium whitespace-nowrap">종료 시간</Label>
                  <div className="flex items-center gap-1">
                    <Select value={endHour} onValueChange={setEndHour}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {HOURS.map(h => (
                          <SelectItem key={h} value={h}>{h}시</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-muted-foreground">:</span>
                    <Select value={endMinute} onValueChange={setEndMinute}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {MINUTES.map(m => (
                          <SelectItem key={m} value={m}>{m}분</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Badge variant="secondary" className="ml-auto">
                  조회 범위: {startHour}:{startMinute} ~ {endHour}:{endMinute}
                </Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 일일 요약 통계 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">총 SQL 수</p>
                <p className="text-2xl font-bold">{summaryData?.data?.total_sqls || historyData?.data?.length || 0}</p>
              </div>
              <Database className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">총 실행 횟수</p>
                <p className="text-2xl font-bold">
                  {(summaryData?.data?.total_executions || 0).toLocaleString()}
                </p>
              </div>
              <Activity className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">평균 응답시간</p>
                <p className="text-2xl font-bold">
                  {(summaryData?.data?.avg_elapsed_time || 0).toFixed(1)}ms
                </p>
              </div>
              <Clock className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">평균 버퍼 읽기</p>
                <p className="text-2xl font-bold">
                  {(summaryData?.data?.avg_buffer_gets || 0).toLocaleString()}
                </p>
              </div>
              <HardDrive className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">문제 SQL (D+F)</p>
                <p className="text-2xl font-bold text-red-600">
                  {gradeStats.D + gradeStats.F}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">우수 SQL (A+B)</p>
                <p className="text-2xl font-bold text-green-600">
                  {gradeStats.A + gradeStats.B}
                </p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 등급별 분포 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            등급별 SQL 분포
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {(['A', 'B', 'C', 'D', 'F'] as const).map((grade) => (
              <button
                key={grade}
                onClick={() => setGradeFilter(gradeFilter === grade ? 'all' : grade)}
                className={`flex-1 p-4 rounded-lg border-2 transition-all ${
                  gradeFilter === grade
                    ? 'border-primary bg-primary/10'
                    : 'border-transparent bg-muted hover:bg-muted/80'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Badge className={getGradeColor(grade)}>{grade}</Badge>
                  <span className="text-2xl font-bold">{gradeStats[grade]}</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${getGradeColor(grade)}`}
                    style={{
                      width: `${historyData?.data?.length ? (gradeStats[grade] / historyData.data.length * 100) : 0}%`
                    }}
                  />
                </div>
              </button>
            ))}
          </div>
          {gradeFilter !== 'all' && (
            <div className="mt-4 flex items-center gap-2">
              <Badge variant="outline">필터 적용됨: {gradeFilter} 등급</Badge>
              <Button variant="ghost" size="sm" onClick={() => setGradeFilter('all')}>
                필터 해제
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SQL 목록 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              SQL 목록 ({filteredSQLs.length}개)
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* 검색 */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="SQL ID 또는 텍스트 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>

              {/* 정렬 */}
              <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="elapsed_time">응답시간</SelectItem>
                  <SelectItem value="executions">실행횟수</SelectItem>
                  <SelectItem value="buffer_gets">버퍼읽기</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
              >
                {sortOrder === 'desc' ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={`skeleton-perf-history-${i}`} className="h-24 w-full" />
              ))}
            </div>
          ) : filteredSQLs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>해당 날짜의 성능 데이터가 없습니다.</p>
              <p className="text-sm mt-2">다른 날짜를 선택하거나 필터를 변경해보세요.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSQLs.slice(0, 50).map((sql: any, idx: number) => {
                const grade = calculateGrade(sql.avg_elapsed_time || 0, sql.avg_buffer_gets || 0)
                return (
                  <div
                    key={`${sql.sql_id}-${idx}`}
                    className="p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => handleSqlClick(sql.sql_id)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge className={getGradeColor(grade)}>{grade}</Badge>
                        <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded hover:bg-primary/20 transition-colors">
                          {sql.sql_id}
                        </code>
                        <ExternalLink className="h-3 w-3 text-muted-foreground" />
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {(sql.avg_elapsed_time || 0).toFixed(2)}ms
                        </span>
                        <span className="flex items-center gap-1">
                          <HardDrive className="h-3 w-3" />
                          {(sql.avg_buffer_gets || 0).toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Zap className="h-3 w-3" />
                          {(sql.executions || 0).toLocaleString()}회
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground font-mono line-clamp-2">
                      {sql.sql_text?.substring(0, 200) || 'SQL 텍스트 없음'}
                      {sql.sql_text?.length > 200 && '...'}
                    </p>
                  </div>
                )
              })}
              {filteredSQLs.length > 50 && (
                <p className="text-center text-sm text-muted-foreground py-4">
                  상위 50개만 표시됩니다. 검색 또는 필터를 사용하여 범위를 좁혀주세요.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SQL 상세정보 Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-[600px] sm:w-[800px] sm:max-w-[800px] overflow-hidden">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Code className="h-5 w-5 text-purple-600" />
              SQL 상세정보
            </SheetTitle>
            <SheetDescription className="flex items-center gap-2">
              <code className="font-mono bg-muted px-2 py-1 rounded text-sm">
                {selectedSqlId}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleCopySql}
                title="SQL 복사"
              >
                <Copy className="h-3 w-3" />
              </Button>
            </SheetDescription>
          </SheetHeader>

          {isLoadingDetail ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sqlDetailData?.success && sqlDetailData.data ? (
            <div className="mt-4">
              {/* 탭 네비게이션 */}
              <Tabs value={detailTab} onValueChange={(v) => setDetailTab(v as any)} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="info" className="flex items-center gap-1">
                    <FileText className="h-4 w-4" />
                    기본 정보
                  </TabsTrigger>
                  <TabsTrigger value="plan" className="flex items-center gap-1">
                    <ListTree className="h-4 w-4" />
                    실행 계획
                  </TabsTrigger>
                  <TabsTrigger value="history" className="flex items-center gap-1">
                    <History className="h-4 w-4" />
                    히스토리
                  </TabsTrigger>
                </TabsList>

                {/* 기본 정보 탭 */}
                <TabsContent value="info" className="mt-4">
                  <ScrollArea className="h-[calc(100vh-280px)]">
                    <div className="space-y-4 pr-4">
                      {/* SQL 텍스트 */}
                      <div>
                        <h4 className="font-medium mb-2 flex items-center gap-2">
                          <Code className="h-4 w-4" />
                          SQL 텍스트
                        </h4>
                        <pre className="bg-muted p-4 rounded-lg text-sm font-mono whitespace-pre-wrap break-all max-h-48 overflow-auto">
                          {sqlDetailData.data.sql_info?.sql_text || 'SQL 텍스트 없음'}
                        </pre>
                      </div>

                      {/* 성능 통계 */}
                      <div>
                        <h4 className="font-medium mb-2 flex items-center gap-2">
                          <BarChart3 className="h-4 w-4" />
                          성능 통계
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-muted/50 p-3 rounded-lg">
                            <p className="text-xs text-muted-foreground">실행 횟수</p>
                            <p className="text-lg font-bold">{(sqlDetailData.data.sql_info?.executions || 0).toLocaleString()}</p>
                          </div>
                          <div className="bg-muted/50 p-3 rounded-lg">
                            <p className="text-xs text-muted-foreground">평균 응답시간</p>
                            <p className="text-lg font-bold">{(sqlDetailData.data.sql_info?.avg_elapsed_ms || 0).toFixed(2)}ms</p>
                          </div>
                          <div className="bg-muted/50 p-3 rounded-lg">
                            <p className="text-xs text-muted-foreground">평균 CPU 시간</p>
                            <p className="text-lg font-bold">{(sqlDetailData.data.sql_info?.avg_cpu_ms || 0).toFixed(2)}ms</p>
                          </div>
                          <div className="bg-muted/50 p-3 rounded-lg">
                            <p className="text-xs text-muted-foreground">평균 버퍼 읽기</p>
                            <p className="text-lg font-bold">{(sqlDetailData.data.sql_info?.avg_buffer_gets || 0).toLocaleString()}</p>
                          </div>
                          <div className="bg-muted/50 p-3 rounded-lg">
                            <p className="text-xs text-muted-foreground">평균 디스크 읽기</p>
                            <p className="text-lg font-bold">{(sqlDetailData.data.sql_info?.avg_disk_reads || 0).toLocaleString()}</p>
                          </div>
                          <div className="bg-muted/50 p-3 rounded-lg">
                            <p className="text-xs text-muted-foreground">평균 처리 행수</p>
                            <p className="text-lg font-bold">{(sqlDetailData.data.sql_info?.avg_rows_processed || 0).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>

                      {/* 메타 정보 */}
                      <div>
                        <h4 className="font-medium mb-2 flex items-center gap-2">
                          <Database className="h-4 w-4" />
                          메타 정보
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between py-1 border-b">
                            <span className="text-muted-foreground">스키마</span>
                            <span className="font-medium">{sqlDetailData.data.sql_info?.schema_name || '-'}</span>
                          </div>
                          <div className="flex justify-between py-1 border-b">
                            <span className="text-muted-foreground">모듈</span>
                            <span className="font-medium">{sqlDetailData.data.sql_info?.module || '-'}</span>
                          </div>
                          <div className="flex justify-between py-1 border-b">
                            <span className="text-muted-foreground">옵티마이저 모드</span>
                            <span className="font-medium">{sqlDetailData.data.sql_info?.optimizer_mode || '-'}</span>
                          </div>
                          <div className="flex justify-between py-1 border-b">
                            <span className="text-muted-foreground">옵티마이저 비용</span>
                            <span className="font-medium">{(sqlDetailData.data.sql_info?.optimizer_cost || 0).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between py-1 border-b">
                            <span className="text-muted-foreground">최초 로드</span>
                            <span className="font-medium">{sqlDetailData.data.sql_info?.first_load_time || '-'}</span>
                          </div>
                          <div className="flex justify-between py-1">
                            <span className="text-muted-foreground">마지막 실행</span>
                            <span className="font-medium">
                              {sqlDetailData.data.sql_info?.last_active_time
                                ? new Date(sqlDetailData.data.sql_info.last_active_time).toLocaleString('ko-KR')
                                : '-'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* 바인드 변수 */}
                      {sqlDetailData.data.bind_variables && sqlDetailData.data.bind_variables.length > 0 && (
                        <div>
                          <h4 className="font-medium mb-2 flex items-center gap-2">
                            <Table className="h-4 w-4" />
                            바인드 변수
                          </h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-muted">
                                <tr>
                                  <th className="p-2 text-left">이름</th>
                                  <th className="p-2 text-left">타입</th>
                                  <th className="p-2 text-left">값</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sqlDetailData.data.bind_variables.map((bind: any, idx: number) => (
                                  <tr key={`bind-${bind.name}-${bind.datatype}-${idx}`} className="border-b">
                                    <td className="p-2 font-mono">{bind.name}</td>
                                    <td className="p-2">{bind.datatype}</td>
                                    <td className="p-2 font-mono">{bind.value || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* 실행 계획 탭 */}
                <TabsContent value="plan" className="mt-4">
                  <ScrollArea className="h-[calc(100vh-280px)]">
                    <div className="pr-4">
                      {sqlDetailData.data.execution_plan && sqlDetailData.data.execution_plan.length > 0 ? (
                        <div className="space-y-2">
                          {sqlDetailData.data.execution_plan.map((step: any, idx: number) => (
                            <div
                              key={`plan-step-${step.id}-${step.operation}-${idx}`}
                              className="p-3 bg-muted/50 rounded-lg border text-sm"
                              style={{ marginLeft: `${(step.id || 0) * 16}px` }}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="text-xs">
                                  {step.id}
                                </Badge>
                                <span className="font-medium">
                                  {step.operation}
                                  {step.options && ` (${step.options})`}
                                </span>
                              </div>
                              {step.object_name && (
                                <p className="text-muted-foreground text-xs mb-1">
                                  객체: {step.object_name}
                                </p>
                              )}
                              <div className="flex gap-4 text-xs text-muted-foreground">
                                {step.cost > 0 && <span>Cost: {step.cost.toLocaleString()}</span>}
                                {step.cardinality > 0 && <span>Rows: {step.cardinality.toLocaleString()}</span>}
                                {step.bytes > 0 && <span>Bytes: {step.bytes.toLocaleString()}</span>}
                              </div>
                              {(step.access_predicates || step.filter_predicates) && (
                                <div className="mt-2 text-xs">
                                  {step.access_predicates && (
                                    <p className="text-green-600 dark:text-green-400">
                                      <span className="font-medium">Access:</span> {step.access_predicates}
                                    </p>
                                  )}
                                  {step.filter_predicates && (
                                    <p className="text-orange-600 dark:text-orange-400">
                                      <span className="font-medium">Filter:</span> {step.filter_predicates}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12 text-muted-foreground">
                          <ListTree className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>실행 계획 정보가 없습니다.</p>
                          <p className="text-sm mt-2">SQL이 캐시에서 aged out되었거나 접근 권한이 없을 수 있습니다.</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* 히스토리 탭 */}
                <TabsContent value="history" className="mt-4">
                  <ScrollArea className="h-[calc(100vh-280px)]">
                    <div className="pr-4">
                      {sqlDetailData.data.performance_history && sqlDetailData.data.performance_history.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-sm text-muted-foreground mb-4">
                            최근 7일간 수집된 성능 데이터 ({sqlDetailData.data.performance_history.length}건)
                          </p>
                          {sqlDetailData.data.performance_history.map((record: any, idx: number) => (
                            <div key={`history-${record.collection_date}-${record.collection_hour}-${idx}`} className="p-3 bg-muted/50 rounded-lg border text-sm">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-medium">
                                  {record.collection_date} {record.collection_hour}시
                                </span>
                                <Badge className={getGradeColor(record.performance_grade || 'C')}>
                                  {record.performance_grade || '-'}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                                <span>실행: {record.executions?.toLocaleString() || 0}회</span>
                                <span>응답: {record.elapsed_time_ms?.toFixed(2) || 0}ms</span>
                                <span>버퍼: {record.buffer_gets?.toLocaleString() || 0}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12 text-muted-foreground">
                          <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>수집된 성능 히스토리가 없습니다.</p>
                          <p className="text-sm mt-2">환경설정에서 데이터 수집을 활성화하세요.</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mb-4 opacity-50" />
              <p>SQL 정보를 불러오지 못했습니다.</p>
              <p className="text-sm mt-2">SQL이 캐시에서 제거되었을 수 있습니다.</p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
