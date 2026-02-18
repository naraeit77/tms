'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSelectedDatabase } from '@/hooks/use-selected-database'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  AlertTriangle,
  Bot,
  Sparkles,
  Send,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Database,
  FileText,
  Lightbulb,
  Zap,
  BookOpen,
  Wrench,
  History,
  Trash2,
  Copy,
  Check,
  Settings,
  WifiOff,
  Search,
  MessageSquare,
  User,
  Loader2,
} from 'lucide-react'
import { StreamingResponse } from '@/components/llm'

type AnalysisContext = 'tuning' | 'explain' | 'index' | 'rewrite'
type SupportedLanguage = 'ko' | 'en'
type InputMode = 'sql' | 'sql_id'

interface SQLMetrics {
  elapsed_time_ms: number
  cpu_time_ms: number
  buffer_gets: number
  disk_reads: number
  executions: number
  rows_processed?: number
}

interface HistoryItem {
  id: string
  timestamp: string
  sql_text: string
  context: AnalysisContext
  response: string
}

interface LLMHealthStatus {
  healthy: boolean
  model: string
  latency: number
  error?: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

const CONTEXT_INFO: Record<AnalysisContext, { label: string; icon: typeof Zap; description: string }> = {
  tuning: {
    label: '성능 튜닝',
    icon: Zap,
    description: 'SQL 성능 분석 및 최적화 권장사항',
  },
  explain: {
    label: '실행계획 설명',
    icon: BookOpen,
    description: 'SQL과 실행계획을 이해하기 쉽게 설명',
  },
  index: {
    label: '인덱스 권장',
    icon: Database,
    description: '인덱스 설계 및 DDL 생성',
  },
  rewrite: {
    label: 'SQL 재작성',
    icon: Wrench,
    description: '더 효율적인 SQL로 재작성',
  },
}

export default function AITuningGuidePage() {
  const { selectedConnectionId } = useSelectedDatabase()

  // Input mode state
  const [inputMode, setInputMode] = useState<InputMode>('sql_id')
  const [sqlId, setSqlId] = useState('')
  const [isLoadingSqlId, setIsLoadingSqlId] = useState(false)
  const [sqlIdError, setSqlIdError] = useState<string | null>(null)

  // Form state
  const [sqlText, setSqlText] = useState('')
  const [executionPlan, setExecutionPlan] = useState('')
  const [context, setContext] = useState<AnalysisContext>('tuning')
  const [language, setLanguage] = useState<SupportedLanguage>('ko')
  const [useMetrics, setUseMetrics] = useState(false)
  const [metrics, setMetrics] = useState<SQLMetrics>({
    elapsed_time_ms: 0,
    cpu_time_ms: 0,
    buffer_gets: 0,
    disk_reads: 0,
    executions: 0,
  })

  // UI state
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [requestBody, setRequestBody] = useState<object | null>(null)
  const [llmHealth, setLLMHealth] = useState<LLMHealthStatus | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [executionPlanOpen, setExecutionPlanOpen] = useState(false)

  // Chat state for follow-up questions
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [followUpQuestion, setFollowUpQuestion] = useState('')
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false)
  const [analysisComplete, setAnalysisComplete] = useState(false)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  const currentResponseRef = useRef<string>('')

  // Check LLM health on mount
  useEffect(() => {
    checkLLMHealth()
  }, [])

  // Load history from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('ai-tuning-history')
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory))
      } catch (e) {
        console.error('Failed to load history:', e)
      }
    }
  }, [])

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem('ai-tuning-history', JSON.stringify(history.slice(0, 20)))
  }, [history])

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [chatMessages])

  /**
   * Check LLM server health
   */
  const checkLLMHealth = async () => {
    setHealthLoading(true)
    try {
      const response = await fetch('/api/llm/health')
      const data = await response.json()

      if (data.success) {
        setLLMHealth({
          healthy: true,
          model: data.data.model,
          latency: data.data.latency,
        })
      } else {
        setLLMHealth({
          healthy: false,
          model: data.config?.modelName || 'unknown',
          latency: 0,
          error: data.error?.message || 'LLM unavailable',
        })
      }
    } catch (error) {
      setLLMHealth({
        healthy: false,
        model: 'unknown',
        latency: 0,
        error: 'Failed to connect to health endpoint',
      })
    } finally {
      setHealthLoading(false)
    }
  }

  /**
   * Lookup SQL by SQL_ID
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
      const sqlResponse = await fetch(`/api/monitoring/sql-text?connection_id=${selectedConnectionId}&sql_id=${sqlId}`)
      const sqlData = await sqlResponse.json()

      if (!sqlResponse.ok || !sqlData.success || !sqlData.data?.sql_text) {
        throw new Error(sqlData.error || 'SQL을 찾을 수 없습니다')
      }

      setSqlText(sqlData.data.sql_text)

      // Also set metrics from the SQL text response if available
      if (sqlData.data.executions) {
        setMetrics({
          elapsed_time_ms: sqlData.data.avg_elapsed_ms || 0,
          cpu_time_ms: sqlData.data.avg_cpu_ms || 0,
          buffer_gets: sqlData.data.avg_buffer_gets || 0,
          disk_reads: sqlData.data.avg_disk_reads || 0,
          executions: sqlData.data.executions || 0,
          rows_processed: sqlData.data.avg_rows_processed || 0,
        })
        setUseMetrics(true)
      }

      // Fetch execution plan if available
      try {
        const planResponse = await fetch(`/api/monitoring/execution-plans?connection_id=${selectedConnectionId}&sql_id=${sqlId}`)
        const planData = await planResponse.json()

        if (planResponse.ok && planData.success && planData.data && planData.data.length > 0) {
          // Format plan as text
          const plan = planData.data[0]
          if (plan.plan_text) {
            setExecutionPlan(plan.plan_text)
            setExecutionPlanOpen(true) // 실행계획이 있으면 섹션 펼치기
          }
        }
      } catch (e) {
        // Plan is optional, don't fail
        console.log('Execution plan not available:', e)
      }

      // Switch to SQL tab to show loaded data
      setInputMode('sql')

    } catch (error) {
      setSqlIdError(error instanceof Error ? error.message : 'SQL 조회에 실패했습니다')
    } finally {
      setIsLoadingSqlId(false)
    }
  }

  /**
   * Submit analysis request
   */
  const handleSubmit = useCallback(() => {
    console.log('[AITuningGuide] handleSubmit called, sqlText:', sqlText.slice(0, 50))
    if (!sqlText.trim()) return

    const body: Record<string, unknown> = {
      sql_text: sqlText,
      context,
      language,
      _timestamp: Date.now(), // Force unique request to trigger streaming
    }

    if (executionPlan.trim()) {
      body.execution_plan = executionPlan
    }

    if (useMetrics && metrics.executions > 0) {
      body.metrics = metrics
    }

    console.log('[AITuningGuide] Setting requestBody and isAnalyzing=true')

    // Reset states first
    setAnalysisComplete(false)
    setChatMessages([])
    currentResponseRef.current = ''

    // Reset isAnalyzing first, then set new body and start
    setIsAnalyzing(false)

    // Use requestAnimationFrame to ensure state is flushed before setting new values
    requestAnimationFrame(() => {
      setRequestBody(body)
      setIsAnalyzing(true)
    })
  }, [sqlText, executionPlan, context, language, useMetrics, metrics])

  /**
   * Handle streaming start
   */
  const handleStreamStart = useCallback(() => {
    setIsAnalyzing(true)
  }, [])

  /**
   * Stop/unload LLM model to free resources
   */
  const stopLLMModel = useCallback(async () => {
    try {
      console.log('[AITuningGuide] Stopping LLM model...')
      const response = await fetch('/api/llm/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await response.json()
      if (data.success) {
        console.log('[AITuningGuide] LLM model stopped successfully:', data.message)
      } else {
        console.warn('[AITuningGuide] Failed to stop LLM model:', data.error)
      }
    } catch (error) {
      console.warn('[AITuningGuide] Error stopping LLM model:', error)
    }
  }, [])

  /**
   * Handle streaming complete
   */
  const handleStreamComplete = useCallback((content: string) => {
    setIsAnalyzing(false)
    setAnalysisComplete(true)
    currentResponseRef.current = content

    // Add initial analysis as first assistant message
    setChatMessages([{
      role: 'assistant',
      content: content,
      timestamp: new Date().toISOString(),
    }])

    // Add to history
    if (sqlText && content) {
      const newItem: HistoryItem = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        sql_text: sqlText.substring(0, 200),
        context,
        response: content.substring(0, 500),
      }
      setHistory(prev => [newItem, ...prev.slice(0, 19)])
    }

    // Stop LLM model after analysis complete to free resources
    stopLLMModel()
  }, [sqlText, context, stopLLMModel])

  /**
   * Handle streaming error
   */
  const handleStreamError = useCallback((error: string) => {
    setIsAnalyzing(false)
    console.error('Stream error:', error)
  }, [])

  /**
   * Send follow-up question
   */
  const sendFollowUpQuestion = async () => {
    if (!followUpQuestion.trim() || isSendingFollowUp) return

    const question = followUpQuestion.trim()
    setFollowUpQuestion('')
    setIsSendingFollowUp(true)

    // Add user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: question,
      timestamp: new Date().toISOString(),
    }
    setChatMessages(prev => [...prev, userMessage])

    try {
      // Build conversation history for context
      const conversationHistory = chatMessages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }))

      // Add context about the SQL being analyzed
      const contextPrompt = `이전 분석 대상 SQL:
\`\`\`sql
${sqlText}
\`\`\`

${executionPlan ? `실행계획:\n${executionPlan}\n\n` : ''}사용자의 추가 질문: ${question}`

      const response = await fetch('/api/llm/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sql_text: sqlText,
          context,
          language,
          follow_up: true,
          conversation_history: conversationHistory,
          user_question: question,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to send follow-up question')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''

      // Add placeholder for assistant response
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
      }
      setChatMessages(prev => [...prev, assistantMessage])

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'content' && data.content) {
              assistantContent += data.content
              // Update the last assistant message
              setChatMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: assistantContent,
                }
                return updated
              })
            }
          } catch (e) {
            // Skip parse errors
          }
        }
      }
    } catch (error) {
      console.error('Follow-up error:', error)
      // Add error message
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: '죄송합니다. 질문 처리 중 오류가 발생했습니다. 다시 시도해주세요.',
        timestamp: new Date().toISOString(),
      }])
    } finally {
      setIsSendingFollowUp(false)
    }
  }

  /**
   * Load from history
   */
  const loadFromHistory = (item: HistoryItem) => {
    setSqlText(item.sql_text)
    setContext(item.context)
    setHistoryOpen(false)
  }

  /**
   * Clear history
   */
  const clearHistory = () => {
    setHistory([])
    localStorage.removeItem('ai-tuning-history')
  }

  /**
   * Copy SQL to clipboard
   */
  const copySQL = async () => {
    await navigator.clipboard.writeText(sqlText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  /**
   * Clear form
   */
  const clearForm = () => {
    setSqlText('')
    setExecutionPlan('')
    setSqlId('')
    setSqlIdError(null)
    setMetrics({
      elapsed_time_ms: 0,
      cpu_time_ms: 0,
      buffer_gets: 0,
      disk_reads: 0,
      executions: 0,
    })
    setRequestBody(null)
    setChatMessages([])
    setAnalysisComplete(false)
  }

  const ContextIcon = CONTEXT_INFO[context].icon

  return (
    <div className="p-6 space-y-6">
      {/* LLM Status Banner */}
      {llmHealth && !llmHealth.healthy && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <WifiOff className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-900 dark:text-amber-300">
                    LLM 서버 연결 불가
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    {llmHealth.error || 'AI 분석 기능을 사용할 수 없습니다.'}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={checkLLMHealth}
                disabled={healthLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${healthLoading ? 'animate-spin' : ''}`} />
                재연결
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 flex items-center">
            <Bot className="h-8 w-8 mr-3 text-purple-600" />
            AI 튜닝 가이드
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            AI 기반 지능형 SQL 튜닝 분석
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {llmHealth?.healthy && (
            <Badge variant="outline" className="text-green-600 border-green-200" title={llmHealth.model}>
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2" />
              <span className="truncate max-w-[200px]">{llmHealth.model}</span>
              <span className="ml-1">({llmHealth.latency}ms)</span>
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={checkLLMHealth}
            disabled={healthLoading}
          >
            <RefreshCw className={`h-4 w-4 ${healthLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Input */}
        <div className="lg:col-span-2 space-y-4">
          {/* Input Mode Selector */}
          <Card>
            <CardContent className="pt-4">
              <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as InputMode)}>
                <TabsList className="w-full mb-4">
                  <TabsTrigger value="sql_id" className="flex-1">
                    <Search className="h-4 w-4 mr-2" />
                    SQL_ID로 조회
                  </TabsTrigger>
                  <TabsTrigger value="sql" className="flex-1">
                    <FileText className="h-4 w-4 mr-2" />
                    SQL 직접 입력
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="sql_id" className="mt-0">
                  <div className="space-y-3">
                    <div>
                      <Label>SQL_ID</Label>
                      <div className="flex space-x-2 mt-1">
                        <Input
                          placeholder="예: 0w2qpuc6u2zsp"
                          value={sqlId}
                          onChange={(e) => setSqlId(e.target.value)}
                          className="font-mono"
                        />
                        <Button
                          onClick={lookupSqlId}
                          disabled={isLoadingSqlId || !selectedConnectionId}
                        >
                          {isLoadingSqlId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Search className="h-4 w-4 mr-2" />
                              조회
                            </>
                          )}
                        </Button>
                      </div>
                      {!selectedConnectionId && (
                        <p className="text-xs text-amber-600 mt-1">
                          데이터베이스 연결을 먼저 선택하세요
                        </p>
                      )}
                      {sqlIdError && (
                        <p className="text-xs text-red-600 mt-1">{sqlIdError}</p>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      V$SQL에서 SQL_ID로 SQL 텍스트, 실행계획, 성능 메트릭을 자동으로 조회합니다.
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="sql" className="mt-0">
                  <p className="text-sm text-gray-500">
                    아래 입력란에 분석할 SQL을 직접 입력하세요.
                  </p>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* SQL Input */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center">
                    <FileText className="h-5 w-5 mr-2" />
                    SQL 입력
                  </CardTitle>
                  <CardDescription>
                    분석할 SQL 문을 입력하세요
                  </CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                  {sqlText && (
                    <Button variant="ghost" size="sm" onClick={copySQL}>
                      {copied ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={clearForm}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="SELECT * FROM employees WHERE department_id = :dept_id..."
                value={sqlText}
                onChange={(e) => setSqlText(e.target.value)}
                className="min-h-[200px] font-mono text-sm"
              />
            </CardContent>
          </Card>

          {/* Execution Plan (Optional) */}
          <Collapsible open={executionPlanOpen} onOpenChange={setExecutionPlanOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center text-base">
                        <Database className="h-5 w-5 mr-2" />
                        실행계획 (선택사항)
                        {executionPlan && (
                          <Badge variant="secondary" className="ml-2 text-xs">입력됨</Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        DBMS_XPLAN 출력이나 실행계획을 붙여넣으세요
                      </CardDescription>
                    </div>
                    {executionPlanOpen ? (
                      <ChevronUp className="h-5 w-5 text-gray-500" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-gray-500" />
                    )}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent>
                  <Textarea
                    placeholder="Plan hash value: 123456789&#10;-----------------------------------&#10;| Id | Operation          | Name |&#10;-----------------------------------&#10;|  0 | SELECT STATEMENT   |      |&#10;|  1 |  TABLE ACCESS FULL | EMP  |&#10;-----------------------------------"
                    value={executionPlan}
                    onChange={(e) => setExecutionPlan(e.target.value)}
                    className="min-h-[150px] font-mono text-sm"
                  />
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Metrics (Optional) */}
          <Collapsible open={useMetrics} onOpenChange={setUseMetrics}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center text-base">
                        <Zap className="h-5 w-5 mr-2" />
                        성능 메트릭 (선택사항)
                        {useMetrics && metrics.executions > 0 && (
                          <Badge variant="secondary" className="ml-2 text-xs">입력됨</Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        V$SQL 통계를 입력하면 더 정확한 분석이 가능합니다
                      </CardDescription>
                    </div>
                    {useMetrics ? (
                      <ChevronUp className="h-5 w-5 text-gray-500" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-gray-500" />
                    )}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <Label>실행 횟수</Label>
                      <input
                        type="number"
                        value={metrics.executions}
                        onChange={(e) => setMetrics(prev => ({ ...prev, executions: parseInt(e.target.value) || 0 }))}
                        className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <Label>총 경과시간 (ms)</Label>
                      <input
                        type="number"
                        value={metrics.elapsed_time_ms}
                        onChange={(e) => setMetrics(prev => ({ ...prev, elapsed_time_ms: parseInt(e.target.value) || 0 }))}
                        className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <Label>CPU 시간 (ms)</Label>
                      <input
                        type="number"
                        value={metrics.cpu_time_ms}
                        onChange={(e) => setMetrics(prev => ({ ...prev, cpu_time_ms: parseInt(e.target.value) || 0 }))}
                        className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <Label>Buffer Gets</Label>
                      <input
                        type="number"
                        value={metrics.buffer_gets}
                        onChange={(e) => setMetrics(prev => ({ ...prev, buffer_gets: parseInt(e.target.value) || 0 }))}
                        className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <Label>Disk Reads</Label>
                      <input
                        type="number"
                        value={metrics.disk_reads}
                        onChange={(e) => setMetrics(prev => ({ ...prev, disk_reads: parseInt(e.target.value) || 0 }))}
                        className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                      />
                    </div>
                    <div>
                      <Label>처리 행수</Label>
                      <input
                        type="number"
                        value={metrics.rows_processed || 0}
                        onChange={(e) => setMetrics(prev => ({ ...prev, rows_processed: parseInt(e.target.value) || 0 }))}
                        className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                      />
                    </div>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* AI Analysis Results - Always visible */}
          {requestBody ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Sparkles className="h-5 w-5 mr-2 text-purple-600" />
                  AI 분석 결과
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Always show StreamingResponse for initial analysis */}
                <StreamingResponse
                  endpoint="/api/llm/stream"
                  requestBody={requestBody}
                  autoStart={isAnalyzing}
                  onStart={handleStreamStart}
                  onComplete={handleStreamComplete}
                  onError={handleStreamError}
                  showCopy={true}
                  showExport={true}
                  exportFilename={`sql-analysis-${context}`}
                />

                {/* Follow-up Chat Messages */}
                {chatMessages.length > 1 && (
                  <div className="border-t pt-4 space-y-3">
                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <MessageSquare className="h-4 w-4" />
                      <span>추가 질문 대화</span>
                    </div>
                    <div
                      ref={chatContainerRef}
                      className="space-y-3 max-h-[300px] overflow-y-auto pr-2"
                    >
                      {chatMessages.slice(1).map((msg, idx) => (
                        <div
                          key={idx}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-lg p-3 ${msg.role === 'user'
                              ? 'bg-purple-600 text-white'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                              }`}
                          >
                            <div className="flex items-center space-x-2 mb-1">
                              {msg.role === 'user' ? (
                                <User className="h-4 w-4" />
                              ) : (
                                <Bot className="h-4 w-4" />
                              )}
                              <span className="text-xs opacity-70">
                                {msg.role === 'user' ? '사용자' : 'AI'}
                              </span>
                            </div>
                            <div className={`text-sm whitespace-pre-wrap ${msg.role === 'assistant' ? 'prose prose-sm dark:prose-invert max-w-none' : ''}`}>
                              {msg.content || (
                                <span className="flex items-center">
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  응답 생성 중...
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Follow-up Question Input - only show after analysis complete */}
                {analysisComplete && (
                  <div className="pt-4 border-t">
                    <div className="flex space-x-2">
                      <Input
                        placeholder="추가 질문을 입력하세요... (예: 인덱스를 추가하면 어떻게 될까요?)"
                        value={followUpQuestion}
                        onChange={(e) => setFollowUpQuestion(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            sendFollowUpQuestion()
                          }
                        }}
                        disabled={isSendingFollowUp}
                      />
                      <Button
                        onClick={sendFollowUpQuestion}
                        disabled={!followUpQuestion.trim() || isSendingFollowUp}
                      >
                        {isSendingFollowUp ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      분석 결과에 대해 추가 질문을 할 수 있습니다. AI가 이전 대화 맥락을 기억합니다.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Right Panel - Controls */}
        <div className="space-y-4">
          {/* Analysis Context */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Lightbulb className="h-5 w-5 mr-2" />
                분석 유형
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(CONTEXT_INFO) as AnalysisContext[]).map((ctx) => {
                  const info = CONTEXT_INFO[ctx]
                  const Icon = info.icon
                  return (
                    <Button
                      key={ctx}
                      variant={context === ctx ? 'default' : 'outline'}
                      className="flex flex-col items-center h-auto py-3"
                      onClick={() => setContext(ctx)}
                    >
                      <Icon className="h-5 w-5 mb-1" />
                      <span className="text-xs">{info.label}</span>
                    </Button>
                  )
                })}
              </div>
              <p className="text-sm text-gray-500">
                {CONTEXT_INFO[context].description}
              </p>
            </CardContent>
          </Card>

          {/* Language Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">응답 언어</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={language} onValueChange={(v) => setLanguage(v as SupportedLanguage)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ko">한국어</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Submit Button */}
          <Button
            className="w-full"
            size="lg"
            onClick={handleSubmit}
            disabled={!sqlText.trim() || isAnalyzing}
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                분석 중...
              </>
            ) : (
              <>
                <Send className="h-5 w-5 mr-2" />
                AI 분석 시작
              </>
            )}
          </Button>

          {/* History */}
          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center text-base">
                      <History className="h-5 w-5 mr-2" />
                      최근 분석 기록
                    </CardTitle>
                    <div className="flex items-center space-x-2">
                      <Badge variant="secondary">{history.length}</Badge>
                      {historyOpen ? (
                        <ChevronUp className="h-4 w-4 text-gray-500" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-500" />
                      )}
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  {history.length > 0 ? (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {history.map((item) => (
                        <div
                          key={item.id}
                          className="p-2 border rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                          onClick={() => loadFromHistory(item)}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <Badge variant="outline" className="text-xs">
                              {CONTEXT_INFO[item.context].label}
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {new Date(item.timestamp).toLocaleString('ko-KR')}
                            </span>
                          </div>
                          <p className="text-sm font-mono text-gray-700 dark:text-gray-300 line-clamp-2">
                            {item.sql_text}
                          </p>
                        </div>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-red-600"
                        onClick={(e) => {
                          e.stopPropagation()
                          clearHistory()
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        기록 삭제
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-4">
                      분석 기록이 없습니다
                    </p>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Tips */}
          <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200">
            <CardContent className="pt-4">
              <div className="flex items-start space-x-3">
                <Lightbulb className="h-5 w-5 text-purple-600 mt-0.5" />
                <div>
                  <p className="font-medium text-purple-900 dark:text-purple-300 text-sm">
                    분석 팁
                  </p>
                  <ul className="text-xs text-purple-700 dark:text-purple-400 mt-1 space-y-1">
                    <li>• SQL_ID로 조회하면 실행계획과 메트릭이 자동으로 입력됩니다</li>
                    <li>• 분석 완료 후 추가 질문으로 상세한 내용을 확인하세요</li>
                    <li>• 분석 유형에 따라 응답 형식이 달라집니다</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
