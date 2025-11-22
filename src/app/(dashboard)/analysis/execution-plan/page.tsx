'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Search,
  GitCompare,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  Database,
  BarChart3,
  Activity,
  Zap,
  Target,
  ArrowRight,
  ArrowDown,
  Eye,
  RefreshCw,
  Download,
  Settings,
  Layers,
  Filter,
  TreePine
} from 'lucide-react'
import { debounce } from 'es-toolkit'
import { useSelectedDatabase } from '@/hooks/use-selected-database'
import { ArrowLeft } from 'lucide-react'

interface SqlData {
  id: string
  sql_id: string
  sql_text: string
  schema_name?: string
  executions: number
  elapsed_time_ms: number
  cpu_time_ms: number
  buffer_gets: number
  disk_reads: number
  rows_processed: number
  avg_elapsed_time_ms: number
}

interface ExecutionPlanStep {
  id: number
  operation: string
  options?: string
  object_name?: string
  object_type?: string
  cost: number
  cardinality: number
  bytes: number
  cpu_cost: number
  io_cost: number
  depth: number
  position: number
  parent_id?: number
  access_predicates?: string
  filter_predicates?: string
  time: number
  partition_start?: string
  partition_stop?: string
}

interface ExecutionPlan {
  sql_id: string
  plan_hash_value: number
  child_number: number
  cost: number
  cardinality: number
  bytes: number
  optimizer: string
  cpu_cost: number
  io_cost: number
  steps: ExecutionPlanStep[]
  analysis: {
    total_cost: number
    estimated_rows: number
    expensive_operations: string[]
    recommendations: string[]
    performance_issues: string[]
  }
}

// Mock execution plan data
const generateMockExecutionPlan = (sqlId: string): ExecutionPlan => {
  const operations = [
    'SELECT STATEMENT',
    'NESTED LOOPS',
    'TABLE ACCESS FULL',
    'TABLE ACCESS BY INDEX ROWID',
    'INDEX RANGE SCAN',
    'INDEX UNIQUE SCAN',
    'HASH JOIN',
    'SORT ORDER BY',
    'FILTER',
    'MERGE JOIN'
  ]

  const objects = ['SALES_ORDER', 'CUSTOMER', 'PRODUCT', 'ORDER_ITEM', 'EMPLOYEE']
  
  const steps: ExecutionPlanStep[] = []
  const totalSteps = Math.floor(Math.random() * 8) + 3

  for (let i = 0; i < totalSteps; i++) {
    const operation = operations[Math.floor(Math.random() * operations.length)]
    const cost = Math.floor(Math.random() * 1000) + 10
    
    steps.push({
      id: i,
      operation,
      object_name: Math.random() > 0.3 ? objects[Math.floor(Math.random() * objects.length)] : undefined,
      object_type: Math.random() > 0.5 ? 'TABLE' : 'INDEX',
      cost,
      cardinality: Math.floor(Math.random() * 10000) + 1,
      bytes: Math.floor(Math.random() * 50000) + 100,
      cpu_cost: Math.floor(cost * 0.6),
      io_cost: Math.floor(cost * 0.4),
      depth: Math.floor(i / 2),
      position: i + 1,
      parent_id: i > 0 ? Math.floor(Math.random() * i) : undefined,
      time: Math.floor(Math.random() * 100) + 1
    })
  }

  const totalCost = steps.reduce((sum, step) => sum + step.cost, 0)
  const expensiveOps = steps
    .filter(step => step.cost > totalCost * 0.3)
    .map(step => step.operation)

  return {
    sql_id: sqlId,
    plan_hash_value: Math.floor(Math.random() * 1000000000),
    child_number: 0,
    cost: totalCost,
    cardinality: Math.floor(Math.random() * 100000) + 1000,
    bytes: Math.floor(Math.random() * 1000000) + 10000,
    optimizer: 'ALL_ROWS',
    cpu_cost: Math.floor(totalCost * 0.6),
    io_cost: Math.floor(totalCost * 0.4),
    steps,
    analysis: {
      total_cost: totalCost,
      estimated_rows: Math.floor(Math.random() * 100000) + 1000,
      expensive_operations: expensiveOps,
      recommendations: [
        '인덱스 추가를 고려하세요',
        'JOIN 순서를 최적화하세요',
        '조건절에 함수 사용을 피하세요',
        '통계 정보를 업데이트하세요'
      ].slice(0, Math.floor(Math.random() * 3) + 1),
      performance_issues: expensiveOps.length > 0 ? [
        '비용이 높은 연산이 감지됨',
        'Full Table Scan 최적화 필요'
      ] : []
    }
  }
}

export default function ExecutionPlanPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { selectedConnectionId } = useSelectedDatabase()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSQL, setSelectedSQL] = useState<SqlData | null>(null)
  const [availableSQLs, setAvailableSQLs] = useState<SqlData[]>([])
  const [executionPlan, setExecutionPlan] = useState<ExecutionPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [planView, setPlanView] = useState<'tree' | 'table' | 'visual'>('tree')

  useEffect(() => {
    if (selectedConnectionId && selectedConnectionId !== 'all') {
      loadInitialData()
    }

    // Load specific SQL if provided in URL
    const sqlId = searchParams.get('sql_id')
    if (sqlId && selectedConnectionId && selectedConnectionId !== 'all') {
      loadSQLById(sqlId)
    }
  }, [searchParams, selectedConnectionId])

  const loadInitialData = async () => {
    if (!selectedConnectionId || selectedConnectionId === 'all') {
      setAvailableSQLs([])
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/monitoring/sql-statistics?connection_id=${selectedConnectionId}&limit=20&order_by=elapsed_time_ms`)
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

  const loadSQLById = async (sqlId: string) => {
    if (!selectedConnectionId || selectedConnectionId === 'all') return

    try {
      const response = await fetch(`/api/monitoring/sql-statistics?connection_id=${selectedConnectionId}&limit=100`)
      const data = await response.json()

      if (data.data) {
        const sql = data.data.find((s: SqlData) => s.sql_id === sqlId)
        if (sql) {
          setSelectedSQL(sql)
          loadExecutionPlan(sql.sql_id)
        }
      }
    } catch (error) {
      console.error('Failed to load SQL by ID:', error)
    }
  }

  const loadExecutionPlan = async (sqlId: string) => {
    setLoading(true)
    try {
      // In a real application, this would call an API endpoint
      // For demo purposes, we'll generate mock data
      await new Promise(resolve => setTimeout(resolve, 1000)) // Simulate API call
      const plan = generateMockExecutionPlan(sqlId)
      setExecutionPlan(plan)
    } catch (error) {
      console.error('Failed to load execution plan:', error)
    } finally {
      setLoading(false)
    }
  }

  const performSearch = useCallback(async (query: string) => {
    if (!selectedConnectionId || selectedConnectionId === 'all') {
      setAvailableSQLs([])
      return
    }

    if (!query.trim()) {
      loadInitialData()
      return
    }

    setSearchLoading(true)
    try {
      const response = await fetch(`/api/monitoring/sql-statistics?connection_id=${selectedConnectionId}&limit=50&order_by=elapsed_time_ms`)
      const data = await response.json()

      if (data.data) {
        const filtered = data.data.filter((sql: SqlData) =>
          sql.sql_id.toLowerCase().includes(query.toLowerCase()) ||
          (sql.sql_text && sql.sql_text.toLowerCase().includes(query.toLowerCase())) ||
          (sql.schema_name && sql.schema_name.toLowerCase().includes(query.toLowerCase()))
        )
        setAvailableSQLs(filtered)
      }
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setSearchLoading(false)
    }
  }, [selectedConnectionId])

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

  const selectSQL = (sql: SqlData) => {
    setSelectedSQL(sql)
    loadExecutionPlan(sql.sql_id)
    
    // Update URL with selected SQL ID
    const newUrl = new URL(window.location.href)
    newUrl.searchParams.set('sql_id', sql.sql_id)
    window.history.pushState({}, '', newUrl.toString())
  }

  const getStepIcon = (operation: string) => {
    if (operation.includes('TABLE ACCESS')) return <Database className="h-4 w-4" />
    if (operation.includes('INDEX')) return <Target className="h-4 w-4" />
    if (operation.includes('JOIN')) return <GitCompare className="h-4 w-4" />
    if (operation.includes('SORT')) return <BarChart3 className="h-4 w-4" />
    return <Activity className="h-4 w-4" />
  }

  const getCostColor = (cost: number, maxCost: number) => {
    const percentage = (cost / maxCost) * 100
    if (percentage > 70) return 'text-red-600 bg-red-50'
    if (percentage > 40) return 'text-orange-600 bg-orange-50'
    if (percentage > 20) return 'text-yellow-600 bg-yellow-50'
    return 'text-green-600 bg-green-50'
  }

  const exportPlan = () => {
    if (!executionPlan || !selectedSQL) return
    
    const exportData = {
      export_date: new Date().toISOString(),
      sql_id: selectedSQL.sql_id,
      execution_plan: executionPlan,
      sql_details: selectedSQL
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `execution-plan-${selectedSQL.sql_id}-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const renderTreeView = () => {
    if (!executionPlan) return null

    const maxCost = Math.max(...executionPlan.steps.map(step => step.cost))

    return (
      <div className="space-y-2">
        {executionPlan.steps.map((step, index) => (
          <div 
            key={step.id} 
            className="flex items-center space-x-4 p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
            style={{ marginLeft: `${step.depth * 20}px` }}
          >
            <div className="flex items-center space-x-2 min-w-0 flex-1">
              {step.depth > 0 && (
                <div className="flex items-center">
                  <ArrowRight className="h-4 w-4 text-gray-400" />
                </div>
              )}
              {getStepIcon(step.operation)}
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm">{step.operation}</div>
                {step.object_name && (
                  <div className="text-xs text-gray-500">{step.object_name}</div>
                )}
              </div>
            </div>
            
            <div className="flex items-center space-x-3 text-xs">
              <Badge className={getCostColor(step.cost, maxCost)}>
                Cost: {step.cost.toLocaleString()}
              </Badge>
              <Badge variant="outline">
                Rows: {step.cardinality.toLocaleString()}
              </Badge>
              <Badge variant="outline">
                {(step.bytes / 1024).toFixed(1)}KB
              </Badge>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const renderTableView = () => {
    if (!executionPlan) return null

    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3 font-medium">Step</th>
              <th className="text-left p-3 font-medium">Operation</th>
              <th className="text-left p-3 font-medium">Object</th>
              <th className="text-right p-3 font-medium">Cost</th>
              <th className="text-right p-3 font-medium">Cardinality</th>
              <th className="text-right p-3 font-medium">Bytes</th>
              <th className="text-right p-3 font-medium">Time (s)</th>
            </tr>
          </thead>
          <tbody>
            {executionPlan.steps.map((step) => (
              <tr key={step.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="p-3 text-center">{step.position}</td>
                <td className="p-3">
                  <div className="flex items-center space-x-2">
                    {getStepIcon(step.operation)}
                    <span className="font-medium">{step.operation}</span>
                  </div>
                </td>
                <td className="p-3">{step.object_name || '-'}</td>
                <td className="p-3 text-right font-mono">{step.cost.toLocaleString()}</td>
                <td className="p-3 text-right font-mono">{step.cardinality.toLocaleString()}</td>
                <td className="p-3 text-right font-mono">{(step.bytes / 1024).toFixed(1)}KB</td>
                <td className="p-3 text-right font-mono">{(step.time / 1000).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                실행 계획 분석
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                SQL 실행 계획을 시각화하고 성능 최적화 기회를 식별하세요
              </p>
            </div>
          </div>
        </div>
        <div className="flex space-x-2">
          {executionPlan && (
            <Button onClick={exportPlan} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              내보내기
            </Button>
          )}
          <Button onClick={loadInitialData} variant="outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            새로고침
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
                  실행 계획 분석을 시작하려면 상단의 데이터베이스 선택 메뉴에서 데이터베이스를 선택해주세요.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SQL Search and Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Search className="h-5 w-5 mr-2" />
            SQL 검색 및 선택
          </CardTitle>
          <CardDescription>
            실행 계획을 분석할 SQL을 검색하고 선택하세요
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-4 mb-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  placeholder="SQL ID, 텍스트, 스키마로 검색..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-10"
                  disabled={!selectedConnectionId || selectedConnectionId === 'all'}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {searchLoading ? (
              <div className="text-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                <p className="text-gray-500">검색 중...</p>
              </div>
            ) : availableSQLs.length > 0 ? (
              availableSQLs.map((sql) => (
                <div
                  key={sql.id}
                  className={`p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors ${
                    selectedSQL?.sql_id === sql.sql_id ? 'bg-blue-50 border-blue-200' : ''
                  }`}
                  onClick={() => selectSQL(sql)}
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
                        <span>평균: {sql.avg_elapsed_time_ms.toFixed(2)}ms</span>
                      </div>
                    </div>
                    
                    <div className="ml-4">
                      {selectedSQL?.sql_id === sql.sql_id ? (
                        <Badge variant="default" className="bg-blue-600">
                          선택됨
                        </Badge>
                      ) : (
                        <Button size="sm" variant="outline">
                          <Eye className="h-4 w-4 mr-1" />
                          분석
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                {(!selectedConnectionId || selectedConnectionId === 'all')
                  ? '데이터베이스를 선택해주세요'
                  : '검색 결과가 없습니다.'}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Selected SQL Info */}
      {selectedSQL && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TreePine className="h-5 w-5 mr-2" />
              선택된 SQL: {selectedSQL.sql_id}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-500">스키마</div>
                <div className="font-mono">{selectedSQL.schema_name || 'UNKNOWN'}</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-500">실행 횟수</div>
                <div className="font-mono">{selectedSQL.executions.toLocaleString()}회</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-500">평균 실행 시간</div>
                <div className="font-mono">{selectedSQL.avg_elapsed_time_ms.toFixed(2)}ms</div>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-500">SQL 텍스트</div>
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded font-mono text-sm">
                {selectedSQL.sql_text || 'SQL text not available'}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Execution Plan Visualization */}
      {executionPlan && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="flex items-center">
                  <Layers className="h-5 w-5 mr-2" />
                  실행 계획 ({executionPlan.plan_hash_value})
                </CardTitle>
                <CardDescription>
                  전체 비용: {executionPlan.cost.toLocaleString()} | 예상 행 수: {executionPlan.cardinality.toLocaleString()}
                </CardDescription>
              </div>
              
              <div className="flex items-center space-x-2">
                <Select value={planView} onValueChange={(value: 'tree' | 'table' | 'visual') => setPlanView(value)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tree">트리 뷰</SelectItem>
                    <SelectItem value="table">테이블 뷰</SelectItem>
                    <SelectItem value="visual">시각화</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={planView} onValueChange={(value) => setPlanView(value as 'tree' | 'table' | 'visual')}>
              <TabsList>
                <TabsTrigger value="tree">트리 뷰</TabsTrigger>
                <TabsTrigger value="table">테이블 뷰</TabsTrigger>
                <TabsTrigger value="visual">시각화</TabsTrigger>
                <TabsTrigger value="analysis">분석</TabsTrigger>
              </TabsList>

              <TabsContent value="tree" className="space-y-4">
                {renderTreeView()}
              </TabsContent>

              <TabsContent value="table" className="space-y-4">
                {renderTableView()}
              </TabsContent>

              <TabsContent value="visual" className="space-y-4">
                <div className="text-center py-12 text-gray-500">
                  <Layers className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-lg font-medium mb-2">시각화 뷰</h3>
                  <p>고급 실행 계획 시각화가 곧 제공될 예정입니다.</p>
                </div>
              </TabsContent>

              <TabsContent value="analysis" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Performance Issues */}
                  {executionPlan.analysis.performance_issues.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center text-orange-600">
                          <AlertTriangle className="h-5 w-5 mr-2" />
                          성능 이슈
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {executionPlan.analysis.performance_issues.map((issue, index) => (
                            <div key={index} className="flex items-center space-x-2 text-sm">
                              <ArrowRight className="h-4 w-4 text-orange-500" />
                              <span>{issue}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Recommendations */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center text-blue-600">
                        <Target className="h-5 w-5 mr-2" />
                        최적화 권장사항
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {executionPlan.analysis.recommendations.map((rec, index) => (
                          <div key={index} className="flex items-center space-x-2 text-sm">
                            <ArrowRight className="h-4 w-4 text-blue-500" />
                            <span>{rec}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Expensive Operations */}
                  {executionPlan.analysis.expensive_operations.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center text-red-600">
                          <TrendingUp className="h-5 w-5 mr-2" />
                          비용이 높은 연산
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {executionPlan.analysis.expensive_operations.map((op, index) => (
                            <Badge key={index} variant="outline" className="mr-2 mb-2">
                              {op}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Summary Stats */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <BarChart3 className="h-5 w-5 mr-2" />
                        실행 계획 요약
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-sm font-medium">총 단계 수:</span>
                          <span className="font-mono">{executionPlan.steps.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm font-medium">CPU 비용:</span>
                          <span className="font-mono">{executionPlan.cpu_cost.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm font-medium">I/O 비용:</span>
                          <span className="font-mono">{executionPlan.io_cost.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm font-medium">예상 데이터 크기:</span>
                          <span className="font-mono">{(executionPlan.bytes / 1024 / 1024).toFixed(2)}MB</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* No Selection State */}
      {!selectedSQL && selectedConnectionId && selectedConnectionId !== 'all' && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <TreePine className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                SQL을 선택하여 실행 계획 분석을 시작하세요
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                위의 검색 도구를 사용하여 분석하고 싶은 SQL을 찾아보세요.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}