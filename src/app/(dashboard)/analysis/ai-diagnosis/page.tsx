'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSelectedDatabase } from '@/hooks/use-selected-database'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { 
  Search,
  Brain,
  Zap,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  BarChart3,
  Activity,
  Target,
  ArrowRight,
  ArrowDown,
  Eye,
  RefreshCw,
  Download,
  Settings,
  Lightbulb,
  Shield,
  Gauge,
  Bot,
  Sparkles,
  FileText,
  Award
} from 'lucide-react'
import { debounce } from 'es-toolkit'

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

interface AIAnalysisResult {
  sql_id: string
  analysis_timestamp: string
  overall_score: number
  performance_grade: 'A' | 'B' | 'C' | 'D' | 'F'
  categories: {
    performance: {
      score: number
      issues: string[]
      recommendations: string[]
    }
    scalability: {
      score: number
      issues: string[]
      recommendations: string[]
    }
    maintainability: {
      score: number
      issues: string[]
      recommendations: string[]
    }
    security: {
      score: number
      issues: string[]
      recommendations: string[]
    }
  }
  key_insights: string[]
  optimization_opportunities: {
    impact: 'high' | 'medium' | 'low'
    effort: 'low' | 'medium' | 'high'
    description: string
    expected_improvement: string
  }[]
  suggested_rewrites: {
    original_snippet: string
    optimized_snippet: string
    explanation: string
    performance_gain: string
  }[]
  index_recommendations: {
    table: string
    columns: string[]
    type: 'btree' | 'bitmap' | 'function'
    reason: string
    estimated_improvement: string
  }[]
  risk_assessment: {
    level: 'low' | 'medium' | 'high' | 'critical'
    factors: string[]
    mitigation: string[]
  }
}

// Mock AI analysis generator
const generateMockAIAnalysis = (sqlData: SqlData): AIAnalysisResult => {
  const avgTime = sqlData.elapsed_time_ms / sqlData.executions
  const cpuRatio = sqlData.cpu_time_ms / sqlData.elapsed_time_ms
  const bufferRatio = sqlData.buffer_gets / sqlData.executions
  
  // Calculate performance score based on metrics
  const performanceScore = Math.max(0, Math.min(100, 100 - (avgTime / 10) * 20))
  const scalabilityScore = Math.max(0, Math.min(100, 100 - (bufferRatio / 1000) * 30))
  const maintainabilityScore = Math.floor(Math.random() * 30) + 60
  const securityScore = Math.floor(Math.random() * 20) + 70
  
  const overallScore = Math.floor((performanceScore + scalabilityScore + maintainabilityScore + securityScore) / 4)
  
  const getGrade = (score: number): 'A' | 'B' | 'C' | 'D' | 'F' => {
    if (score >= 90) return 'A'
    if (score >= 80) return 'B'
    if (score >= 70) return 'C'
    if (score >= 60) return 'D'
    return 'F'
  }

  const performanceIssues = []
  const performanceRecs = []
  
  if (avgTime > 100) {
    performanceIssues.push('높은 평균 실행 시간이 감지됨')
    performanceRecs.push('인덱스 추가 또는 쿼리 재작성을 고려하세요')
  }
  
  if (bufferRatio > 1000) {
    performanceIssues.push('과도한 논리적 읽기가 발생')
    performanceRecs.push('조인 조건을 최적화하세요')
  }

  return {
    sql_id: sqlData.sql_id,
    analysis_timestamp: new Date().toISOString(),
    overall_score: overallScore,
    performance_grade: getGrade(overallScore),
    categories: {
      performance: {
        score: Math.floor(performanceScore),
        issues: performanceIssues,
        recommendations: performanceRecs
      },
      scalability: {
        score: Math.floor(scalabilityScore),
        issues: scalabilityScore < 70 ? ['높은 리소스 사용량'] : [],
        recommendations: scalabilityScore < 70 ? ['파티셔닝 고려', '인덱스 최적화'] : ['현재 확장성 양호']
      },
      maintainability: {
        score: maintainabilityScore,
        issues: maintainabilityScore < 70 ? ['복잡한 쿼리 구조'] : [],
        recommendations: ['주석 추가', '가독성 개선']
      },
      security: {
        score: securityScore,
        issues: securityScore < 80 ? ['SQL 인젝션 위험 가능성'] : [],
        recommendations: ['바인드 변수 사용', '입력 검증 강화']
      }
    },
    key_insights: [
      `평균 실행 시간: ${avgTime.toFixed(2)}ms`,
      `실행당 논리적 읽기: ${bufferRatio.toFixed(0)}개`,
      `CPU 집약도: ${(cpuRatio * 100).toFixed(1)}%`,
      `전체 실행 횟수: ${sqlData.executions.toLocaleString()}회`
    ],
    optimization_opportunities: [
      {
        impact: avgTime > 100 ? 'high' : 'medium',
        effort: 'medium',
        description: '복합 인덱스 추가로 테이블 스캔 제거',
        expected_improvement: '40-60% 성능 향상'
      },
      {
        impact: 'medium',
        effort: 'low',
        description: '불필요한 컬럼 제거로 네트워크 부하 감소',
        expected_improvement: '15-25% 성능 향상'
      }
    ],
    suggested_rewrites: [
      {
        original_snippet: 'SELECT * FROM table WHERE func(column) = value',
        optimized_snippet: 'SELECT col1, col2 FROM table WHERE column = value',
        explanation: '함수 사용을 피하고 필요한 컬럼만 선택',
        performance_gain: '30-50% 개선'
      }
    ],
    index_recommendations: [
      {
        table: sqlData.schema_name || 'TABLE_NAME',
        columns: ['column1', 'column2'],
        type: 'btree',
        reason: '자주 사용되는 WHERE 조건',
        estimated_improvement: '50-70% 성능 향상'
      }
    ],
    risk_assessment: {
      level: overallScore < 60 ? 'high' : overallScore < 80 ? 'medium' : 'low',
      factors: overallScore < 70 ? ['높은 리소스 사용량', '느린 응답 시간'] : ['일반적인 성능 수준'],
      mitigation: ['정기적인 성능 모니터링', '인덱스 최적화', '쿼리 튜닝']
    }
  }
}

export default function AIDiagnosisPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { selectedConnectionId } = useSelectedDatabase()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSQL, setSelectedSQL] = useState<SqlData | null>(null)
  const [availableSQLs, setAvailableSQLs] = useState<SqlData[]>([])
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)

  useEffect(() => {
    loadInitialData()
    
    // Load specific SQL if provided in URL
    const sqlId = searchParams.get('sql_id')
    if (sqlId) {
      loadSQLById(sqlId)
    }
  }, [searchParams])

  const loadInitialData = async () => {
    if (!selectedConnectionId || selectedConnectionId === 'all') {
      setAvailableSQLs([])
      return
    }

    setLoading(true)
    try {
      const params = new URLSearchParams({
        connection_id: selectedConnectionId,
        limit: '20',
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

  const loadSQLById = async (sqlId: string) => {
    if (!selectedConnectionId || selectedConnectionId === 'all') return

    try {
      const params = new URLSearchParams({
        connection_id: selectedConnectionId,
        limit: '100'
      })

      const response = await fetch(`/api/monitoring/sql-statistics?${params}`)
      const data = await response.json()

      if (data.data) {
        const sql = data.data.find((s: SqlData) => s.sql_id === sqlId)
        if (sql) {
          setSelectedSQL(sql)
          runAIAnalysis(sql)
        }
      }
    } catch (error) {
      console.error('Failed to load SQL by ID:', error)
    }
  }

  const runAIAnalysis = async (sqlData: SqlData) => {
    setAnalyzing(true)
    try {
      // Simulate AI analysis with realistic delay
      await new Promise(resolve => setTimeout(resolve, 3000))
      const analysis = generateMockAIAnalysis(sqlData)
      setAiAnalysis(analysis)
    } catch (error) {
      console.error('Failed to run AI analysis:', error)
    } finally {
      setAnalyzing(false)
    }
  }

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      loadInitialData()
      return
    }

    if (!selectedConnectionId || selectedConnectionId === 'all') return

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
    setAiAnalysis(null)
    runAIAnalysis(sql)
    
    // Update URL with selected SQL ID
    const newUrl = new URL(window.location.href)
    newUrl.searchParams.set('sql_id', sql.sql_id)
    window.history.pushState({}, '', newUrl.toString())
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600 bg-green-50'
    if (score >= 80) return 'text-blue-600 bg-blue-50'
    if (score >= 70) return 'text-yellow-600 bg-yellow-50'
    if (score >= 60) return 'text-orange-600 bg-orange-50'
    return 'text-red-600 bg-red-50'
  }

  const getGradeColor = (grade: string) => {
    switch (grade) {
      case 'A': return 'bg-green-100 text-green-800'
      case 'B': return 'bg-blue-100 text-blue-800'
      case 'C': return 'bg-yellow-100 text-yellow-800'
      case 'D': return 'bg-orange-100 text-orange-800'
      case 'F': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'low': return 'text-green-600 bg-green-50'
      case 'medium': return 'text-yellow-600 bg-yellow-50'
      case 'high': return 'text-orange-600 bg-orange-50'
      case 'critical': return 'text-red-600 bg-red-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const getImpactIcon = (impact: string) => {
    switch (impact) {
      case 'high': return <TrendingUp className="h-4 w-4 text-red-500" />
      case 'medium': return <ArrowRight className="h-4 w-4 text-orange-500" />
      case 'low': return <TrendingDown className="h-4 w-4 text-green-500" />
      default: return <ArrowRight className="h-4 w-4" />
    }
  }

  const exportAnalysis = () => {
    if (!aiAnalysis || !selectedSQL) return
    
    const exportData = {
      export_date: new Date().toISOString(),
      sql_id: selectedSQL.sql_id,
      ai_analysis: aiAnalysis,
      sql_details: selectedSQL
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ai-analysis-${selectedSQL.sql_id}-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
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
                  AI 성능 진단을 시작하려면 상단의 데이터베이스 선택 메뉴에서 데이터베이스를 선택해주세요.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 flex items-center">
            <Brain className="h-8 w-8 mr-3 text-purple-600" />
            AI 성능 진단
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            머신러닝 기반 성능 분석으로 SQL 최적화 기회를 자동으로 발견하세요
          </p>
        </div>
        <div className="flex space-x-2">
          {aiAnalysis && (
            <Button onClick={exportAnalysis} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              분석 결과 내보내기
            </Button>
          )}
          <Button onClick={loadInitialData} variant="outline" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        </div>
      </div>

      {/* SQL Search and Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Search className="h-5 w-5 mr-2" />
            SQL 검색 및 선택
          </CardTitle>
          <CardDescription>
            AI 성능 진단을 받을 SQL을 검색하고 선택하세요
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
                    selectedSQL?.sql_id === sql.sql_id ? 'bg-purple-50 border-purple-200' : ''
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
                        <span>평균: {(sql.elapsed_time_ms / sql.executions).toFixed(2)}ms</span>
                      </div>
                    </div>
                    
                    <div className="ml-4">
                      {selectedSQL?.sql_id === sql.sql_id ? (
                        <Badge variant="default" className="bg-purple-600">
                          선택됨
                        </Badge>
                      ) : (
                        <Button size="sm" variant="outline">
                          <Bot className="h-4 w-4 mr-1" />
                          AI 분석
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                검색 결과가 없습니다.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Analysis Progress */}
      {analyzing && selectedSQL && (
        <Card>
          <CardContent className="py-8">
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center">
                <Brain className="h-8 w-8 text-purple-600 animate-pulse" />
              </div>
              <h3 className="text-lg font-medium">AI 분석 중...</h3>
              <p className="text-gray-500">
                {selectedSQL.sql_id}에 대한 종합적인 성능 분석을 수행하고 있습니다
              </p>
              <div className="max-w-md mx-auto">
                <Progress value={33} className="mb-2" />
                <p className="text-sm text-gray-500">성능 패턴 분석 중</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Analysis Results */}
      {aiAnalysis && selectedSQL && !analyzing && (
        <>
          {/* Overall Score Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center">
                  <Sparkles className="h-5 w-5 mr-2 text-purple-600" />
                  AI 종합 분석 결과
                </div>
                <Badge className={getGradeColor(aiAnalysis.performance_grade)}>
                  Grade {aiAnalysis.performance_grade}
                </Badge>
              </CardTitle>
              <CardDescription>
                SQL ID: {aiAnalysis.sql_id} | 분석 시간: {new Date(aiAnalysis.analysis_timestamp).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-6 mb-6">
                <div className="text-center">
                  <div className="text-4xl font-bold text-purple-600 mb-2">
                    {aiAnalysis.overall_score}
                  </div>
                  <div className="text-sm text-gray-500">종합 점수</div>
                </div>
                <div className="flex-1">
                  <Progress value={aiAnalysis.overall_score} className="mb-2" />
                  <div className="text-sm text-gray-500">
                    {aiAnalysis.overall_score >= 80 ? '우수한 성능' : 
                     aiAnalysis.overall_score >= 60 ? '개선 권장' : '즉시 최적화 필요'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <Gauge className="h-6 w-6 mx-auto mb-2 text-blue-600" />
                  <div className="font-semibold">{aiAnalysis.categories.performance.score}</div>
                  <div className="text-xs text-gray-500">성능</div>
                </div>
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <TrendingUp className="h-6 w-6 mx-auto mb-2 text-green-600" />
                  <div className="font-semibold">{aiAnalysis.categories.scalability.score}</div>
                  <div className="text-xs text-gray-500">확장성</div>
                </div>
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <Settings className="h-6 w-6 mx-auto mb-2 text-purple-600" />
                  <div className="font-semibold">{aiAnalysis.categories.maintainability.score}</div>
                  <div className="text-xs text-gray-500">유지보수</div>
                </div>
                <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <Shield className="h-6 w-6 mx-auto mb-2 text-red-600" />
                  <div className="font-semibold">{aiAnalysis.categories.security.score}</div>
                  <div className="text-xs text-gray-500">보안</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Analysis */}
          <Card>
            <CardHeader>
              <CardTitle>상세 분석 결과</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="insights">
                <TabsList>
                  <TabsTrigger value="insights">핵심 인사이트</TabsTrigger>
                  <TabsTrigger value="opportunities">최적화 기회</TabsTrigger>
                  <TabsTrigger value="rewrites">코드 개선</TabsTrigger>
                  <TabsTrigger value="indexes">인덱스 권장</TabsTrigger>
                  <TabsTrigger value="risk">위험 평가</TabsTrigger>
                </TabsList>

                <TabsContent value="insights" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center text-blue-600">
                          <Lightbulb className="h-5 w-5 mr-2" />
                          주요 발견사항
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {aiAnalysis.key_insights.map((insight, index) => (
                            <div key={index} className="flex items-center space-x-2 text-sm">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              <span>{insight}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center text-orange-600">
                          <AlertTriangle className="h-5 w-5 mr-2" />
                          주요 이슈
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {Object.entries(aiAnalysis.categories).map(([category, data]) => (
                            data.issues.length > 0 && (
                              <div key={category}>
                                <div className="font-medium text-sm capitalize mb-1">{category}</div>
                                {data.issues.map((issue, index) => (
                                  <div key={index} className="flex items-center space-x-2 text-sm text-gray-600">
                                    <ArrowRight className="h-3 w-3" />
                                    <span>{issue}</span>
                                  </div>
                                ))}
                              </div>
                            )
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="opportunities" className="space-y-4">
                  <div className="space-y-4">
                    {aiAnalysis.optimization_opportunities.map((opportunity, index) => (
                      <Card key={index}>
                        <CardContent className="pt-6">
                          <div className="flex items-start space-x-4">
                            <div className="flex-shrink-0">
                              {getImpactIcon(opportunity.impact)}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                <Badge variant="outline" className={
                                  opportunity.impact === 'high' ? 'border-red-200 text-red-700' :
                                  opportunity.impact === 'medium' ? 'border-orange-200 text-orange-700' :
                                  'border-green-200 text-green-700'
                                }>
                                  {opportunity.impact} impact
                                </Badge>
                                <Badge variant="outline">
                                  {opportunity.effort} effort
                                </Badge>
                              </div>
                              <h4 className="font-medium mb-2">{opportunity.description}</h4>
                              <p className="text-sm text-gray-600 mb-2">
                                예상 개선 효과: <span className="font-medium text-green-600">{opportunity.expected_improvement}</span>
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="rewrites" className="space-y-4">
                  <div className="space-y-4">
                    {aiAnalysis.suggested_rewrites.map((rewrite, index) => (
                      <Card key={index}>
                        <CardHeader>
                          <CardTitle className="flex items-center">
                            <FileText className="h-5 w-5 mr-2" />
                            SQL 개선 제안 #{index + 1}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            <div>
                              <div className="text-sm font-medium text-gray-500 mb-2">기존 코드</div>
                              <div className="bg-red-50 p-3 rounded font-mono text-sm">
                                {rewrite.original_snippet}
                              </div>
                            </div>
                            <ArrowDown className="h-5 w-5 text-gray-400 mx-auto" />
                            <div>
                              <div className="text-sm font-medium text-gray-500 mb-2">개선된 코드</div>
                              <div className="bg-green-50 p-3 rounded font-mono text-sm">
                                {rewrite.optimized_snippet}
                              </div>
                            </div>
                            <div className="bg-blue-50 p-3 rounded">
                              <div className="text-sm font-medium text-blue-800 mb-1">설명</div>
                              <div className="text-sm text-blue-700">{rewrite.explanation}</div>
                              <div className="text-sm font-medium text-green-700 mt-2">
                                성능 개선: {rewrite.performance_gain}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="indexes" className="space-y-4">
                  <div className="space-y-4">
                    {aiAnalysis.index_recommendations.map((index, idx) => (
                      <Card key={idx}>
                        <CardContent className="pt-6">
                          <div className="flex items-start space-x-4">
                            <Database className="h-6 w-6 text-blue-600 flex-shrink-0 mt-1" />
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                <h4 className="font-medium">{index.table}</h4>
                                <Badge variant="outline">{index.type}</Badge>
                              </div>
                              <div className="text-sm text-gray-600 mb-2">
                                컬럼: <code className="bg-gray-100 px-2 py-1 rounded">{index.columns.join(', ')}</code>
                              </div>
                              <div className="text-sm text-gray-600 mb-2">
                                이유: {index.reason}
                              </div>
                              <div className="text-sm font-medium text-green-600">
                                예상 개선 효과: {index.estimated_improvement}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="risk" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <Shield className="h-5 w-5 mr-2" />
                        위험 평가
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center space-x-4">
                          <div className="text-lg font-medium">위험 수준:</div>
                          <Badge className={getRiskColor(aiAnalysis.risk_assessment.level)}>
                            {aiAnalysis.risk_assessment.level.toUpperCase()}
                          </Badge>
                        </div>

                        <div>
                          <div className="text-sm font-medium text-gray-500 mb-2">위험 요소</div>
                          <div className="space-y-1">
                            {aiAnalysis.risk_assessment.factors.map((factor, index) => (
                              <div key={index} className="flex items-center space-x-2 text-sm">
                                <AlertTriangle className="h-4 w-4 text-orange-500" />
                                <span>{factor}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="text-sm font-medium text-gray-500 mb-2">완화 방안</div>
                          <div className="space-y-1">
                            {aiAnalysis.risk_assessment.mitigation.map((action, index) => (
                              <div key={index} className="flex items-center space-x-2 text-sm">
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                <span>{action}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}

      {/* No Selection State */}
      {!selectedSQL && !analyzing && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Brain className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                SQL을 선택하여 AI 성능 진단을 시작하세요
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                머신러닝 기반 분석으로 성능 이슈를 자동으로 발견하고 최적화 방안을 제안받으세요.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}