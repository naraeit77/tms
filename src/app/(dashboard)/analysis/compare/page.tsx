'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSelectedDatabase } from '@/hooks/use-selected-database'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  BarChart3,
  Plus,
  X,
  Search,
  Clock,
  Cpu,
  HardDrive,
  TrendingUp,
  TrendingDown,
  Equal,
  ArrowRight,
  Database,
  Activity,
  RefreshCw,
  Download,
  GitCompare
} from 'lucide-react'
import { debounce } from 'es-toolkit'
import { AlertTriangle } from 'lucide-react'

interface SqlData {
  id: string
  sql_id: string
  sql_text?: string
  schema_name?: string
  executions: number
  elapsed_time_ms: number
  cpu_time_ms: number
  buffer_gets: number
  disk_reads: number
  rows_processed: number
  collected_at?: string
  oracle_connection_id: string
}

interface ComparisonResult {
  metric: string
  label: string
  values: (number | string)[]
  unit: string
  type: 'number' | 'time' | 'bytes'
  higher_is_better?: boolean
}

export default function SQLComparisonPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { selectedConnectionId } = useSelectedDatabase()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSQLs, setSelectedSQLs] = useState<SqlData[]>([])
  const [availableSQLs, setAvailableSQLs] = useState<SqlData[]>([])
  const [comparisonResults, setComparisonResults] = useState<ComparisonResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [filters, setFilters] = useState({
    schema: '',
    minExecutions: '',
    maxCpuTime: ''
  })

  useEffect(() => {
    loadInitialData()
    
    // Load from URL params if any
    const sqlIds = searchParams.get('sqlIds')?.split(',') || []
    if (sqlIds.length > 0) {
      loadSQLsByIds(sqlIds)
    }
  }, [searchParams])

  useEffect(() => {
    if (selectedSQLs.length >= 2) {
      generateComparison()
    }
  }, [selectedSQLs])

  const loadInitialData = async () => {
    if (!selectedConnectionId || selectedConnectionId === 'all') {
      setAvailableSQLs([])
      return
    }

    setLoading(true)
    try {
      const params = new URLSearchParams({
        connection_id: selectedConnectionId,
        limit: '50',
        order_by: 'elapsed_time_ms'
      })

      const response = await fetch(`/api/monitoring/sql-statistics?${params}`)
      const data = await response.json()

      if (data.data) {
        setAvailableSQLs(data.data)
      }
    } catch (error) {
      console.error('Failed to load SQL data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadSQLsByIds = async (sqlIds: string[]) => {
    if (!selectedConnectionId || selectedConnectionId === 'all') return

    try {
      const params = new URLSearchParams({
        connection_id: selectedConnectionId,
        limit: '100'
      })

      const response = await fetch(`/api/monitoring/sql-statistics?${params}`)
      const data = await response.json()

      if (data.data) {
        const matchedSQLs = data.data.filter((sql: SqlData) =>
          sqlIds.includes(sql.sql_id)
        )
        setSelectedSQLs(matchedSQLs)
      }
    } catch (error) {
      console.error('Failed to load SQLs by IDs:', error)
    }
  }

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      loadInitialData()
      return
    }

    if (!selectedConnectionId || selectedConnectionId === 'all') {
      setAvailableSQLs([])
      return
    }

    setSearchLoading(true)
    try {
      const params = new URLSearchParams({
        connection_id: selectedConnectionId,
        limit: '50',
        order_by: 'elapsed_time_ms'
      })

      const response = await fetch(`/api/monitoring/sql-statistics?${params}`)
      const data = await response.json()

      if (data.data) {
        const filtered = data.data.filter((sql: SqlData) => {
          const matchesQuery =
            sql.sql_id.toLowerCase().includes(query.toLowerCase()) ||
            (sql.sql_text && sql.sql_text.toLowerCase().includes(query.toLowerCase())) ||
            (sql.schema_name && sql.schema_name.toLowerCase().includes(query.toLowerCase()))

          const matchesSchema = !filters.schema || sql.schema_name === filters.schema
          const matchesExecutions = !filters.minExecutions || sql.executions >= parseInt(filters.minExecutions)
          const matchesCpuTime = !filters.maxCpuTime || sql.cpu_time_ms <= parseInt(filters.maxCpuTime)

          return matchesQuery && matchesSchema && matchesExecutions && matchesCpuTime
        })

        setAvailableSQLs(filtered)
      }
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setSearchLoading(false)
    }
  }, [filters, selectedConnectionId])

  const debouncedSearch = useCallback(
    debounce((query: string) => {
      performSearch(query)
    }, 500),
    [performSearch]
  )

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    debouncedSearch(value)
  }

  const addToComparison = (sql: SqlData) => {
    if (selectedSQLs.length >= 4) {
      alert('최대 4개의 SQL까지 비교할 수 있습니다.')
      return
    }
    
    if (!selectedSQLs.find(s => s.sql_id === sql.sql_id)) {
      setSelectedSQLs([...selectedSQLs, sql])
    }
  }

  const removeFromComparison = (sqlId: string) => {
    setSelectedSQLs(selectedSQLs.filter(sql => sql.sql_id !== sqlId))
  }

  const generateComparison = () => {
    if (selectedSQLs.length < 2) return

    const results: ComparisonResult[] = [
      {
        metric: 'executions',
        label: '실행 횟수',
        values: selectedSQLs.map(sql => sql.executions.toLocaleString()),
        unit: '회',
        type: 'number',
        higher_is_better: false
      },
      {
        metric: 'elapsed_time',
        label: '총 경과 시간',
        values: selectedSQLs.map(sql => (sql.elapsed_time_ms / 1000).toFixed(2)),
        unit: 's',
        type: 'time',
        higher_is_better: false
      },
      {
        metric: 'avg_elapsed_time',
        label: '평균 경과 시간',
        values: selectedSQLs.map(sql => (sql.elapsed_time_ms / sql.executions).toFixed(2)),
        unit: 'ms',
        type: 'time',
        higher_is_better: false
      },
      {
        metric: 'cpu_time',
        label: 'CPU 시간',
        values: selectedSQLs.map(sql => sql.cpu_time_ms.toFixed(0)),
        unit: 'ms',
        type: 'time',
        higher_is_better: false
      },
      {
        metric: 'buffer_gets',
        label: 'Buffer Gets',
        values: selectedSQLs.map(sql => sql.buffer_gets.toLocaleString()),
        unit: '',
        type: 'number',
        higher_is_better: false
      },
      {
        metric: 'disk_reads',
        label: 'Disk Reads',
        values: selectedSQLs.map(sql => sql.disk_reads.toLocaleString()),
        unit: '',
        type: 'number',
        higher_is_better: false
      },
      {
        metric: 'rows_processed',
        label: '처리된 행 수',
        values: selectedSQLs.map(sql => sql.rows_processed.toLocaleString()),
        unit: '행',
        type: 'number',
        higher_is_better: true
      },
      {
        metric: 'efficiency',
        label: '효율성 점수',
        values: selectedSQLs.map(sql => {
          const avgTime = sql.elapsed_time_ms / sql.executions
          const efficiency = Math.max(0, 100 - (avgTime / 10))
          return efficiency.toFixed(1)
        }),
        unit: '/100',
        type: 'number',
        higher_is_better: true
      }
    ]

    setComparisonResults(results)
  }

  const getBestPerformer = (result: ComparisonResult, index: number) => {
    const values = result.values.map(v => parseFloat(v.toString().replace(/,/g, '')))
    const currentValue = values[index]
    
    if (result.higher_is_better) {
      return currentValue === Math.max(...values)
    } else {
      return currentValue === Math.min(...values)
    }
  }

  const getWorstPerformer = (result: ComparisonResult, index: number) => {
    const values = result.values.map(v => parseFloat(v.toString().replace(/,/g, '')))
    const currentValue = values[index]
    
    if (result.higher_is_better) {
      return currentValue === Math.min(...values)
    } else {
      return currentValue === Math.max(...values)
    }
  }

  const exportComparison = () => {
    const exportData = {
      comparison_date: new Date().toISOString(),
      sqlQueries: selectedSQLs.map(sql => ({
        sql_id: sql.sql_id,
        schema: sql.schema_name,
        executions: sql.executions,
        elapsed_time_ms: sql.elapsed_time_ms,
        cpu_time_ms: sql.cpu_time_ms
      })),
      results: comparisonResults
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sql-comparison-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const clearComparison = () => {
    setSelectedSQLs([])
    setComparisonResults([])
  }

  return (
    <div className="p-6 space-y-6">
      {/* Database Selection Warning */}
      {(!selectedConnectionId || selectedConnectionId === 'all') && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              데이터베이스를 선택해주세요. 상단의 데이터베이스 선택 드롭다운에서 분석할 데이터베이스를 선택하세요.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            SQL 성능 비교 분석
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            여러 SQL 쿼리의 성능 메트릭을 비교하고 최적화 기회를 식별하세요
          </p>
        </div>
        <div className="flex space-x-2">
          {selectedSQLs.length >= 2 && (
            <>
              <Button onClick={exportComparison} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                내보내기
              </Button>
              <Button onClick={clearComparison} variant="outline">
                <X className="h-4 w-4 mr-2" />
                초기화
              </Button>
            </>
          )}
          <Button onClick={loadInitialData} variant="outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        </div>
      </div>

      {/* Selected SQLs for Comparison */}
      {selectedSQLs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <GitCompare className="h-5 w-5 mr-2" />
              비교 대상 SQL ({selectedSQLs.length}/4)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {selectedSQLs.map((sql) => (
                <div key={sql.sql_id} className="border rounded-lg p-4 relative">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute top-2 right-2 h-6 w-6 p-0"
                    onClick={() => removeFromComparison(sql.sql_id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                  
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <code className="text-sm font-mono text-blue-600">
                        {sql.sql_id}
                      </code>
                      <Badge variant="outline" className="text-xs">
                        {sql.schema_name || 'UNKNOWN'}
                      </Badge>
                    </div>

                    <div className="text-xs text-gray-500 space-y-1">
                      <div>실행: {sql.executions.toLocaleString()}회</div>
                      <div>CPU: {sql.cpu_time_ms.toFixed(0)}ms</div>
                      <div>평균: {(sql.elapsed_time_ms / sql.executions).toFixed(2)}ms</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comparison Results */}
      {comparisonResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>비교 결과</CardTitle>
            <CardDescription>
              각 메트릭별 성능 비교 결과입니다. 최고 성능은 초록색, 최악 성능은 빨간색으로 표시됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium">메트릭</th>
                    {selectedSQLs.map((sql, index) => (
                      <th key={sql.sql_id} className="text-center p-3 font-medium">
                        <div className="space-y-1">
                          <div className="font-mono text-sm">{sql.sql_id}</div>
                          <div className="text-xs text-gray-500">{sql.schema_name}</div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparisonResults.map((result) => (
                    <tr key={result.metric} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="p-3 font-medium">{result.label}</td>
                      {result.values.map((value, index) => {
                        const isBest = getBestPerformer(result, index)
                        const isWorst = getWorstPerformer(result, index)
                        
                        return (
                          <td key={index} className="p-3 text-center">
                            <div className={`inline-flex items-center space-x-1 px-2 py-1 rounded ${
                              isBest ? 'bg-green-100 text-green-700' : 
                              isWorst ? 'bg-red-100 text-red-700' : 
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {isBest && <TrendingUp className="h-4 w-4" />}
                              {isWorst && <TrendingDown className="h-4 w-4" />}
                              <span>{value}{result.unit}</span>
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SQL Search and Selection */}
      <Card>
        <CardHeader>
          <CardTitle>SQL 검색 및 선택</CardTitle>
          <CardDescription>
            비교할 SQL을 검색하고 선택하세요. 최대 4개까지 선택 가능합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search and Filters */}
          <div className="flex flex-col lg:flex-row space-y-4 lg:space-y-0 lg:space-x-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  placeholder="SQL ID, 텍스트, 스키마로 검색..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="flex space-x-2">
              <Input
                placeholder="스키마"
                value={filters.schema}
                onChange={(e) => setFilters({...filters, schema: e.target.value})}
                className="w-32"
              />
              <Input
                placeholder="최소 실행 횟수"
                type="number"
                value={filters.minExecutions}
                onChange={(e) => setFilters({...filters, minExecutions: e.target.value})}
                className="w-32"
              />
              <Input
                placeholder="최대 CPU(ms)"
                type="number"
                value={filters.maxCpuTime}
                onChange={(e) => setFilters({...filters, maxCpuTime: e.target.value})}
                className="w-32"
              />
            </div>
          </div>

          {/* SQL List */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {searchLoading ? (
              <div className="text-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                <p className="text-gray-500">검색 중...</p>
              </div>
            ) : availableSQLs.length > 0 ? (
              availableSQLs.map((sql) => {
                const isSelected = selectedSQLs.find(s => s.sql_id === sql.sql_id)
                
                return (
                  <div
                    key={sql.id}
                    className={`p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-50 border-blue-200' : ''
                    }`}
                    onClick={() => !isSelected && addToComparison(sql)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <code className="text-sm font-mono text-blue-600">
                            {sql.sql_id}
                          </code>
                          <Badge variant="outline" className="text-xs">
                            {sql.schema_name || 'UNKNOWN'}
                          </Badge>
                          <Badge
                            className={`text-xs ${
                              sql.cpu_time_ms > 1000 ? 'bg-red-100 text-red-700' :
                              sql.cpu_time_ms > 500 ? 'bg-orange-100 text-orange-700' :
                              'bg-green-100 text-green-700'
                            }`}
                          >
                            CPU: {sql.cpu_time_ms.toFixed(0)}ms
                          </Badge>
                        </div>

                        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">
                          {sql.sql_text || 'SQL text not available'}
                        </p>

                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                          <span>실행: {sql.executions.toLocaleString()}회</span>
                          <span>평균: {(sql.elapsed_time_ms / sql.executions).toFixed(2)}ms</span>
                          <span>Buffer Gets: {sql.buffer_gets.toLocaleString()}</span>
                        </div>
                      </div>
                      
                      <div className="ml-4">
                        {isSelected ? (
                          <Badge variant="default" className="bg-blue-600">
                            선택됨
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={selectedSQLs.length >= 4}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            추가
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="text-center py-8 text-gray-500">
                검색 결과가 없습니다.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}