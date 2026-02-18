'use client'

import { useState, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useSelectedDatabase } from '@/hooks/use-selected-database'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Play,
  Sparkles,
  FileCode2,
  Database,
  Lightbulb,
  Route,
  Loader2,
  AlertCircle,
  Info,
  Search,
  Copy,
  Check,
  Zap,
} from 'lucide-react'
import {
  IndexCreationDiagram,
  TableDetailPanel,
  RecommendationsList,
  AccessPathDisplay,
} from '@/components/query-artifacts'
import type { DiagramNode } from '@/domain/query-artifacts'
import type { AnalyzeQueryRequest, AnalyzeQueryResponse } from '@/application/query-artifacts'

type InputMode = 'sql_id' | 'sql'

/**
 * Query Artifacts Page
 * Interactive SQL analysis and Index Creation Diagram generator
 */
export default function QueryArtifactsPage() {
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase()

  // Input mode state
  const [inputMode, setInputMode] = useState<InputMode>('sql_id')
  const [sqlId, setSqlId] = useState('')
  const [isLoadingSqlId, setIsLoadingSqlId] = useState(false)
  const [sqlIdError, setSqlIdError] = useState<string | null>(null)

  // Form state
  const [sql, setSql] = useState('')
  const [selectedNode, setSelectedNode] = useState<DiagramNode | null>(null)
  const [options, setOptions] = useState({
    includeStatistics: true,
    includeRecommendations: true,
    includeHints: false,
  })

  /**
   * Lookup SQL by SQL_ID from V$SQL
   */
  const lookupSqlId = async () => {
    if (!sqlId.trim() || !selectedConnectionId) {
      setSqlIdError('SQL_ID와 데이터베이스 연결이 필요합니다')
      return
    }

    setIsLoadingSqlId(true)
    setSqlIdError(null)

    try {
      // Fetch SQL text
      const sqlResponse = await fetch(
        `/api/monitoring/sql-text?connection_id=${selectedConnectionId}&sql_id=${sqlId}`
      )
      const sqlData = await sqlResponse.json()

      if (!sqlResponse.ok || !sqlData.success || !sqlData.data?.sql_text) {
        throw new Error(sqlData.error || 'SQL을 찾을 수 없습니다')
      }

      setSql(sqlData.data.sql_text)

      // Switch to SQL tab to show loaded data
      setInputMode('sql')
    } catch (error) {
      setSqlIdError(error instanceof Error ? error.message : 'SQL 조회에 실패했습니다')
    } finally {
      setIsLoadingSqlId(false)
    }
  }

  // Analyze SQL mutation
  const analyzeMutation = useMutation({
    mutationFn: async (request: AnalyzeQueryRequest): Promise<AnalyzeQueryResponse> => {
      const res = await fetch('/api/query-artifacts/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || errorData.message || 'Analysis failed')
      }
      return res.json()
    },
  })

  const handleAnalyze = useCallback(() => {
    if (!sql.trim()) return

    analyzeMutation.mutate({
      sql: sql.trim(),
      connectionId: selectedConnectionId || '',
      options,
    })
  }, [sql, selectedConnectionId, options, analyzeMutation])

  const handleNodeClick = useCallback((node: DiagramNode) => {
    setSelectedNode(node)
  }, [])

  const data = analyzeMutation.data?.data

  // 힌트 복사 상태
  const [hintsCopied, setHintsCopied] = useState(false)

  const copyHints = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setHintsCopied(true)
      setTimeout(() => setHintsCopied(false), 2000)
    } catch {
      // fallback
    }
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-7 h-7 text-indigo-500" />
              Query Artifacts
            </h1>
            <p className="text-muted-foreground mt-1">
              SQL 쿼리를 분석하여 인덱스 생성도를 시각화하고 최적화 방안을 제안합니다
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedConnection && (
              <Badge variant="outline" className="text-xs">
                <Database className="w-3 h-3 mr-1" />
                {selectedConnection.name}
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              인덱스 생성도 기반 분석
            </Badge>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 pt-4 overflow-hidden">
        <div className="grid grid-cols-12 gap-4 h-full">
          {/* Left Panel - SQL Input */}
          <div className="col-span-4 flex flex-col gap-4">
            {/* SQL Input Card */}
            <Card className="flex-1 flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileCode2 className="w-5 h-5 text-blue-500" />
                  SQL 입력
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col gap-4">
                {/* Input Mode Tabs */}
                <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as InputMode)}>
                  <TabsList className="w-full">
                    <TabsTrigger value="sql_id" className="flex-1">
                      <Search className="w-4 h-4 mr-2" />
                      SQL_ID로 조회
                    </TabsTrigger>
                    <TabsTrigger value="sql" className="flex-1">
                      <FileCode2 className="w-4 h-4 mr-2" />
                      직접 입력
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="sql_id" className="mt-3 space-y-3">
                    <div>
                      <Label className="text-sm">SQL_ID</Label>
                      <div className="flex gap-2 mt-1">
                        <Input
                          placeholder="예: 0w2qpuc6u2zsp"
                          value={sqlId}
                          onChange={(e) => setSqlId(e.target.value)}
                          className="font-mono"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              lookupSqlId()
                            }
                          }}
                        />
                        <Button
                          onClick={lookupSqlId}
                          disabled={isLoadingSqlId || !selectedConnectionId}
                          size="sm"
                        >
                          {isLoadingSqlId ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Search className="w-4 h-4 mr-1" />
                              조회
                            </>
                          )}
                        </Button>
                      </div>
                      {!selectedConnectionId && (
                        <p className="text-xs text-amber-600 mt-1">
                          상단 네비게이션에서 데이터베이스 연결을 먼저 선택하세요
                        </p>
                      )}
                      {sqlIdError && (
                        <p className="text-xs text-red-600 mt-1">{sqlIdError}</p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      V$SQL에서 SQL_ID로 SQL 텍스트를 자동으로 조회합니다.
                    </p>
                  </TabsContent>

                  <TabsContent value="sql" className="mt-3">
                    <p className="text-xs text-muted-foreground mb-2">
                      분석할 SQL을 직접 입력하세요.
                    </p>
                  </TabsContent>
                </Tabs>

                {/* SQL Textarea - Always visible */}
                <Textarea
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                  placeholder="SELECT ... FROM ... WHERE ..."
                  className="flex-1 font-mono text-sm resize-none min-h-[180px]"
                />

                {/* Options */}
                <div className="space-y-3">
                  <Separator />

                  <div className="flex items-center justify-between">
                    <Label className="text-sm">통계 정보 조회</Label>
                    <Switch
                      checked={options.includeStatistics}
                      onCheckedChange={(checked) =>
                        setOptions((prev) => ({ ...prev, includeStatistics: checked }))
                      }
                      disabled={!selectedConnectionId}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-sm">권장사항 생성</Label>
                    <Switch
                      checked={options.includeRecommendations}
                      onCheckedChange={(checked) =>
                        setOptions((prev) => ({ ...prev, includeRecommendations: checked }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Label className="text-sm">힌트 제안</Label>
                    <Switch
                      checked={options.includeHints}
                      onCheckedChange={(checked) =>
                        setOptions((prev) => ({ ...prev, includeHints: checked }))
                      }
                    />
                  </div>
                </div>

                <Button
                  onClick={handleAnalyze}
                  disabled={!sql.trim() || analyzeMutation.isPending}
                  className="w-full"
                >
                  {analyzeMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      분석 중...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      분석 시작
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Table Detail Panel */}
            <TableDetailPanel
              node={selectedNode}
              existingIndexes={data?.analysis?.indexPoints
                ?.filter((p) => p.existingIndex)
                .map((p) => p.existingIndex!)}
              className="h-[300px]"
            />
          </div>

          {/* Right Panel - Results */}
          <div className="col-span-8 flex flex-col gap-4 overflow-hidden">
            {/* Error State */}
            {analyzeMutation.isError && (
              <Card className="border-red-500/20 bg-red-500/5">
                <CardContent className="flex items-start gap-3 py-4">
                  <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-red-500 mb-2">분석 실패</p>
                    <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">
                      {analyzeMutation.error?.message}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Empty State */}
            {!data && !analyzeMutation.isPending && !analyzeMutation.isError && (
              <Card className="flex-1">
                <CardContent className="flex items-center justify-center h-full">
                  <div className="text-center text-muted-foreground">
                    <Sparkles className="w-16 h-16 mx-auto mb-4 opacity-20" />
                    <h3 className="text-lg font-medium mb-2">SQL을 분석해 보세요</h3>
                    <p className="text-sm max-w-md">
                      SQL 쿼리를 입력하고 분석 버튼을 클릭하면
                      인덱스 생성도와 최적화 권장사항이 표시됩니다.
                    </p>
                    <div className="flex items-center justify-center gap-4 mt-6 text-xs">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                        <span>인덱스 있음</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-yellow-500" />
                        <span>인덱스 권장</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                        <span>인덱스 필요</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Loading State */}
            {analyzeMutation.isPending && (
              <Card className="flex-1">
                <CardContent className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-indigo-500" />
                    <h3 className="text-lg font-medium mb-2">SQL 분석 중...</h3>
                    <p className="text-sm text-muted-foreground">
                      쿼리를 파싱하고 인덱스 생성도를 생성하고 있습니다
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Results */}
            {data && !analyzeMutation.isPending && (
              <>
                {/* Summary Bar */}
                <Card>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                          <Database className="w-4 h-4 text-indigo-500" />
                          <span className="text-sm">
                            <strong>{data.summary.tableCount}</strong> 테이블
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Route className="w-4 h-4 text-purple-500" />
                          <span className="text-sm">
                            <strong>{data.summary.joinCount}</strong> 조인
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Info className="w-4 h-4 text-green-500" />
                          <span className="text-sm">
                            <strong>{data.summary.existingIndexCount}</strong> 기존 인덱스
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Lightbulb className="w-4 h-4 text-yellow-500" />
                          <span className="text-sm">
                            <strong>{data.summary.missingIndexCount}</strong> 누락 인덱스
                          </span>
                        </div>
                      </div>
                      <Badge
                        variant={
                          data.summary.overallHealthScore >= 80
                            ? 'default'
                            : data.summary.overallHealthScore >= 50
                            ? 'secondary'
                            : 'destructive'
                        }
                      >
                        Health Score: {data.summary.overallHealthScore}%
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                {/* Tabs */}
                <Tabs defaultValue="diagram" className="flex-1 flex flex-col overflow-hidden">
                  <TabsList className="w-fit">
                    <TabsTrigger value="diagram" className="flex items-center gap-1">
                      <Sparkles className="w-4 h-4" />
                      인덱스 생성도
                    </TabsTrigger>
                    <TabsTrigger value="recommendations" className="flex items-center gap-1">
                      <Lightbulb className="w-4 h-4" />
                      권장사항
                      {data.recommendations.length > 0 && (
                        <Badge variant="secondary" className="ml-1 h-5">
                          {data.recommendations.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="access-path" className="flex items-center gap-1">
                      <Route className="w-4 h-4" />
                      접근 경로
                    </TabsTrigger>
                    {data.hints && (
                      <TabsTrigger value="hints" className="flex items-center gap-1">
                        <Zap className="w-4 h-4" />
                        힌트 제안
                      </TabsTrigger>
                    )}
                  </TabsList>

                  <TabsContent value="diagram" className="flex-1 mt-4 overflow-hidden flex flex-col gap-4">
                    <IndexCreationDiagram
                      diagram={data.diagram}
                      onNodeClick={handleNodeClick}
                      className="flex-1"
                    />

                    {/* 운영자 가이드 */}
                    <Card className="bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
                      <CardContent className="py-4">
                        <div className="flex items-start gap-3">
                          <Info className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                          <div className="space-y-3 text-sm">
                            <div>
                              <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                                📊 인덱스 생성도 읽는 법
                              </h4>
                              <ul className="text-slate-600 dark:text-slate-400 space-y-1 ml-4 list-disc">
                                <li><strong>원(테이블)</strong>: SQL에서 사용된 테이블을 나타냅니다. 왼쪽에서 오른쪽으로 접근 순서를 보여줍니다.</li>
                                <li><strong>실선</strong>: INNER JOIN 관계를 나타냅니다.</li>
                                <li><strong>점선</strong>: OUTER JOIN 관계를 나타냅니다.</li>
                                <li><strong>연결선 위 텍스트</strong>: 조인에 사용된 컬럼명입니다.</li>
                              </ul>
                            </div>
                            <div>
                              <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                                🔢 번호의 의미 (인덱스 포인트)
                              </h4>
                              <ul className="text-slate-600 dark:text-slate-400 space-y-1 ml-4 list-disc">
                                <li>테이블 위의 번호는 WHERE, JOIN, ORDER BY, GROUP BY 조건에 사용된 <strong>컬럼의 순번</strong>입니다.</li>
                                <li>
                                  <span className="inline-flex items-center gap-1">
                                    <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-[9px] font-bold inline-flex items-center justify-center">n</span>
                                    <span>파란색 원</span>
                                  </span>: 해당 컬럼에 <strong>인덱스가 이미 존재</strong>합니다.
                                </li>
                                <li>
                                  <span className="inline-flex items-center gap-1">
                                    <span
                                      className="w-4 h-4 rounded-full text-[9px] font-bold inline-flex items-center justify-center"
                                      style={{ border: '2px solid #ef4444', color: '#ef4444', backgroundColor: 'white' }}
                                    >n</span>
                                    <span>빨간색 테두리</span>
                                  </span>: 인덱스가 <strong>없어서 생성을 권장</strong>합니다.
                                </li>
                              </ul>
                            </div>
                            <div>
                              <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                                💡 최적화 팁
                              </h4>
                              <ul className="text-slate-600 dark:text-slate-400 space-y-1 ml-4 list-disc">
                                <li>빨간색 테두리 번호가 있는 컬럼에 인덱스 생성을 검토하세요.</li>
                                <li>조인 컬럼(연결선 위 텍스트)은 양쪽 테이블 모두에 인덱스가 있어야 성능이 좋습니다.</li>
                                <li>테이블 원을 클릭하면 왼쪽 패널에서 상세 정보를 확인할 수 있습니다.</li>
                              </ul>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="recommendations" className="flex-1 mt-4 overflow-auto">
                    <RecommendationsList recommendations={data.recommendations} />
                  </TabsContent>

                  <TabsContent value="access-path" className="flex-1 mt-4 overflow-auto">
                    <AccessPathDisplay paths={data.diagram.recommendedAccessPath} />
                  </TabsContent>

                  {data.hints && (
                    <TabsContent value="hints" className="flex-1 mt-4 overflow-auto">
                      <div className="space-y-4">
                        {/* 힌트 코드 블록 */}
                        <Card>
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base flex items-center gap-2">
                                <Zap className="w-5 h-5 text-amber-500" />
                                Oracle Optimizer Hints
                              </CardTitle>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => copyHints(data.hints!)}
                                className="h-8"
                              >
                                {hintsCopied ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 mr-1.5 text-green-500" />
                                    복사됨
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                                    복사
                                  </>
                                )}
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg overflow-x-auto text-sm font-mono leading-relaxed">
                              <code>{data.hints}</code>
                            </pre>

                            {/* 적용 예시 */}
                            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900">
                              <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">
                                적용 방법
                              </h4>
                              <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
                                SELECT 키워드 바로 뒤에 힌트를 삽입합니다:
                              </p>
                              <pre className="mt-2 text-xs bg-white dark:bg-slate-900 p-2 rounded border text-slate-700 dark:text-slate-300 overflow-x-auto">
                                {`SELECT ${data.hints.split('\n')[0]} ...\nFROM ...`}
                              </pre>
                            </div>
                          </CardContent>
                        </Card>

                        {/* 힌트 설명 */}
                        <Card className="bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800">
                          <CardContent className="py-4">
                            <div className="flex items-start gap-3">
                              <Info className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                              <div className="space-y-3 text-sm">
                                {data.hints.includes('LEADING') && (
                                  <div>
                                    <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                                      LEADING 힌트
                                    </h4>
                                    <p className="text-slate-600 dark:text-slate-400">
                                      테이블 접근 순서를 지정합니다. 인덱스 생성도의 분석 결과에 따라 최적의 접근 순서를 제안합니다.
                                      선행 테이블(드라이빙 테이블)은 조건에 의해 가장 많이 필터링되는 테이블이 유리합니다.
                                    </p>
                                  </div>
                                )}
                                {data.hints.includes('USE_NL') && (
                                  <div>
                                    <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                                      USE_NL 힌트 (Nested Loops Join)
                                    </h4>
                                    <p className="text-slate-600 dark:text-slate-400">
                                      후행 테이블에 대해 Nested Loops Join을 사용하도록 지정합니다.
                                      인덱스가 있는 경우 적은 행을 처리할 때 효과적이며, OLTP 환경에서 주로 사용됩니다.
                                    </p>
                                  </div>
                                )}
                                <div>
                                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                                    주의사항
                                  </h4>
                                  <ul className="text-slate-600 dark:text-slate-400 space-y-1 ml-4 list-disc">
                                    <li>힌트는 옵티마이저에게 실행 계획을 제안하는 것이며, 반드시 적용되는 것은 아닙니다.</li>
                                    <li>실행 계획(EXPLAIN PLAN)으로 힌트 적용 여부를 반드시 확인하세요.</li>
                                    <li>데이터 양이나 분포가 변하면 최적의 힌트도 달라질 수 있습니다.</li>
                                  </ul>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>
                  )}
                </Tabs>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
