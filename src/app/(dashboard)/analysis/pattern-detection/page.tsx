'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSelectedDatabase } from '@/hooks/use-selected-database'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Layers,
  RefreshCw,
  Download,
  Filter,
  Calendar,
  Database,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

interface PatternIssue {
  id: string
  pattern_type: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  sql_count: number
  description: string
  recommendation: string
  affected_sqls: string[]
  first_detected: string
  last_detected: string
}

interface PatternSQL {
  sql_id: string
  sql_text: string
  module?: string
  schema_name?: string
  executions: number
  elapsed_time_ms: number
  cpu_time_ms: number
  buffer_gets: number
  disk_reads: number
  rows_processed: number
  avg_elapsed_time_ms: number
  gets_per_exec: number
  last_active_time: string
  plan_hash_value?: number
}

export default function PatternDetectionPage() {
  const router = useRouter()
  const { selectedConnectionId } = useSelectedDatabase()
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all')
  const [selectedPattern, setSelectedPattern] = useState<string>('all')
  const filterRef = useRef<HTMLDivElement>(null)
  const [selectedIssue, setSelectedIssue] = useState<PatternIssue | null>(null)
  const [isSqlDialogOpen, setIsSqlDialogOpen] = useState(false)

  // 패턴 이슈 목록 조회
  const { data: issues, isLoading, refetch } = useQuery({
    queryKey: ['pattern-issues', selectedConnectionId, selectedSeverity, selectedPattern],
    queryFn: async () => {
      if (!selectedConnectionId || selectedConnectionId === 'all') {
        return []
      }

      const params = new URLSearchParams({
        connection_id: selectedConnectionId,
      })

      if (selectedSeverity !== 'all') {
        params.append('severity', selectedSeverity)
      }
      if (selectedPattern !== 'all') {
        params.append('pattern_type', selectedPattern)
      }

      const res = await fetch(`/api/analysis/pattern-detection?${params}`)
      if (!res.ok) throw new Error('Failed to fetch pattern issues')

      const data = await res.json()
      return data.data || []
    },
    enabled: !!selectedConnectionId && selectedConnectionId !== 'all',
  })

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200'
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getSeverityIcon = (severity: string) => {
    if (severity === 'critical' || severity === 'high') {
      return <AlertTriangle className="h-5 w-5" />
    }
    return <CheckCircle2 className="h-5 w-5" />
  }

  // 선택된 이슈의 SQL 목록 조회
  const { data: patternSQLs, isLoading: isLoadingSQLs } = useQuery({
    queryKey: ['pattern-sqls', selectedConnectionId, selectedIssue?.pattern_type],
    queryFn: async () => {
      if (!selectedConnectionId || selectedConnectionId === 'all' || !selectedIssue) {
        return []
      }

      const params = new URLSearchParams({
        connection_id: selectedConnectionId,
        pattern_type: selectedIssue.pattern_type,
        limit: '50',
      })

      const res = await fetch(`/api/analysis/pattern-detection/sqls?${params}`)
      if (!res.ok) throw new Error('Failed to fetch pattern SQLs')

      const data = await res.json()
      return data.data || []
    },
    enabled: !!selectedConnectionId && selectedConnectionId !== 'all' && !!selectedIssue && isSqlDialogOpen,
  })

  const patternTypes = [
    { value: 'all', label: '모든 패턴' },
    { value: 'full_table_scan', label: '전체 테이블 스캔' },
    { value: 'missing_index', label: '인덱스 누락' },
    { value: 'cartesian_join', label: '카티전 조인' },
    { value: 'inefficient_sort', label: '비효율적 정렬' },
    { value: 'redundant_execution', label: '중복 실행' },
  ]

  const handleViewRelatedSQL = (issue: PatternIssue) => {
    setSelectedIssue(issue)
    setIsSqlDialogOpen(true)
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
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">패턴 기반 이슈 탐지</h1>
              <p className="text-gray-500 dark:text-gray-400">반복되는 성능 패턴을 자동으로 식별하고 분류</p>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            내보내기
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
                  패턴 분석을 시작하려면 상단의 데이터베이스 선택 메뉴에서 분석할 데이터베이스를 선택해주세요.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card ref={filterRef} className="transition-all duration-300">
        <CardContent className="p-6">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium">필터:</span>
            </div>
            <Tabs value={selectedSeverity} onValueChange={setSelectedSeverity}>
              <TabsList>
                <TabsTrigger value="all">전체</TabsTrigger>
                <TabsTrigger value="critical">심각</TabsTrigger>
                <TabsTrigger value="high">높음</TabsTrigger>
                <TabsTrigger value="medium">중간</TabsTrigger>
                <TabsTrigger value="low">낮음</TabsTrigger>
              </TabsList>
            </Tabs>
            <select
              value={selectedPattern}
              onChange={(e) => setSelectedPattern(e.target.value)}
              className={`px-3 py-2 border rounded-md text-sm transition-all ${
                selectedPattern !== 'all' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''
              }`}
            >
              {patternTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            {selectedPattern !== 'all' && (
              <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300">
                필터 적용됨
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <p className="text-sm text-gray-500">전체 패턴</p>
              <p className="text-2xl font-bold">{issues?.length || 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <p className="text-sm text-red-500">심각</p>
              <p className="text-2xl font-bold text-red-600">
                {issues?.filter((i: PatternIssue) => i.severity === 'critical').length || 0}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <p className="text-sm text-orange-500">높음</p>
              <p className="text-2xl font-bold text-orange-600">
                {issues?.filter((i: PatternIssue) => i.severity === 'high').length || 0}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-center">
              <p className="text-sm text-gray-500">영향받은 SQL</p>
              <p className="text-2xl font-bold">
                {issues?.reduce((acc: number, i: PatternIssue) => acc + i.sql_count, 0) || 0}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pattern Issues List */}
      <div className="space-y-4">
        {isLoading ? (
          <Card>
            <CardContent className="p-12 text-center">
              <RefreshCw className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">패턴 분석 중...</p>
            </CardContent>
          </Card>
        ) : issues && issues.length > 0 ? (
          issues.map((issue: PatternIssue) => (
            <Card key={issue.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <div className={`p-2 rounded ${getSeverityColor(issue.severity)}`}>
                      {getSeverityIcon(issue.severity)}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{issue.description}</CardTitle>
                      <CardDescription className="mt-1">
                        {issue.pattern_type} · {issue.sql_count}개의 SQL 영향
                      </CardDescription>
                    </div>
                  </div>
                  <Badge className={getSeverityColor(issue.severity)}>
                    {issue.severity.toUpperCase()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-2">
                    💡 권장 사항
                  </p>
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    {issue.recommendation}
                  </p>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500">
                  <div className="flex items-center space-x-4">
                    <span className="flex items-center">
                      <Calendar className="h-3 w-3 mr-1" />
                      첫 발견: {new Date(issue.first_detected).toLocaleDateString('ko-KR')}
                    </span>
                    <span className="flex items-center">
                      <Calendar className="h-3 w-3 mr-1" />
                      최근 발견: {new Date(issue.last_detected).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewRelatedSQL(issue)}
                  >
                    관련 SQL 보기
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <p className="text-gray-500">패턴 이슈가 발견되지 않았습니다.</p>
              <p className="text-sm text-gray-400 mt-2">데이터베이스가 정상적으로 최적화되어 있습니다.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 관련 SQL 목록 Dialog */}
      <Dialog open={isSqlDialogOpen} onOpenChange={setIsSqlDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              관련 SQL 목록
            </DialogTitle>
            {selectedIssue && (
              <>
                <DialogDescription>
                  패턴: {selectedIssue.pattern_type} · 총 {selectedIssue.sql_count}개의 SQL
                </DialogDescription>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline">{selectedIssue.pattern_type}</Badge>
                </div>
              </>
            )}
          </DialogHeader>

          {isLoadingSQLs ? (
            <div className="py-8 text-center">
              <RefreshCw className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">SQL 목록을 불러오는 중...</p>
            </div>
          ) : patternSQLs && patternSQLs.length > 0 ? (
            <div className="space-y-4">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">SQL ID</TableHead>
                      <TableHead className="w-[100px]">Schema</TableHead>
                      <TableHead className="w-[100px]">Module</TableHead>
                      <TableHead className="text-right w-[100px]">Executions</TableHead>
                      <TableHead className="text-right w-[120px]">Elapsed (ms)</TableHead>
                      <TableHead className="text-right w-[120px]">CPU (ms)</TableHead>
                      <TableHead className="text-right w-[120px]">Buffer Gets</TableHead>
                      <TableHead className="text-right w-[120px]">Disk Reads</TableHead>
                      <TableHead className="min-w-[300px]">SQL Text</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {patternSQLs.map((sql: PatternSQL, index: number) => (
                      <TableRow key={`pattern-${sql.sql_id}-${sql.schema_name || ''}-${sql.module || ''}-${index}`}>
                        <TableCell>
                          <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                            {sql.sql_id}
                          </code>
                        </TableCell>
                        <TableCell className="text-sm">{sql.schema_name || '-'}</TableCell>
                        <TableCell className="text-sm">{sql.module || '-'}</TableCell>
                        <TableCell className="text-right font-mono">
                          {(sql.executions ?? 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {(sql.elapsed_time_ms ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {(sql.cpu_time_ms ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {(sql.buffer_gets ?? 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {(sql.disk_reads ?? 0).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded block overflow-hidden text-ellipsis">
                            {sql.sql_text || '-'}
                          </code>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="text-sm text-gray-500 text-center">
                총 {patternSQLs.length}개의 SQL이 표시됩니다. (최대 50개)
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <p className="text-gray-500">관련 SQL이 없습니다.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
