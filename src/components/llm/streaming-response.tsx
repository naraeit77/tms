'use client'

import React, { useState, useEffect, useRef, useCallback, ReactElement } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Copy,
  Check,
  Download,
  RefreshCw,
  AlertTriangle,
  Bot,
  Sparkles,
} from 'lucide-react'

interface StreamingResponseProps {
  /** API endpoint URL */
  endpoint?: string
  /** Request body to send */
  requestBody?: object
  /** Whether to start streaming immediately */
  autoStart?: boolean
  /** Callback when streaming starts */
  onStart?: () => void
  /** Callback when streaming completes */
  onComplete?: (content: string) => void
  /** Callback when an error occurs */
  onError?: (error: string) => void
  /** Custom class name */
  className?: string
  /** Show copy button */
  showCopy?: boolean
  /** Show export button */
  showExport?: boolean
  /** Export filename prefix */
  exportFilename?: string
  /** Show prompt preview while connecting */
  showPromptPreview?: boolean
}

interface StreamState {
  status: 'idle' | 'connecting' | 'streaming' | 'complete' | 'error'
  content: string
  error: string | null
  startTime: number | null
  endTime: number | null
}

/**
 * Simple markdown-like formatting for code blocks and headers
 */
function formatContent(content: string): React.JSX.Element[] {
  const lines = content.split('\n')
  const elements: React.JSX.Element[] = []
  let inCodeBlock = false
  let codeBlockContent: string[] = []
  let codeBlockLang = ''

  lines.forEach((line, index) => {
    // Code block start
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true
        codeBlockLang = line.slice(3).trim()
        codeBlockContent = []
      } else {
        // Code block end
        inCodeBlock = false
        elements.push(
          <div key={`code-${index}`} className="my-3">
            {codeBlockLang && (
              <div className="bg-gray-700 text-gray-300 text-xs px-3 py-1 rounded-t font-mono">
                {codeBlockLang}
              </div>
            )}
            <pre className={`bg-gray-900 text-gray-100 p-3 overflow-x-auto text-sm font-mono ${codeBlockLang ? 'rounded-b' : 'rounded'}`}>
              <code>{codeBlockContent.join('\n')}</code>
            </pre>
          </div>
        )
        codeBlockContent = []
        codeBlockLang = ''
      }
      return
    }

    if (inCodeBlock) {
      codeBlockContent.push(line)
      return
    }

    // Headers
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={`h3-${index}`} className="text-lg font-semibold mt-4 mb-2 text-gray-800 dark:text-gray-200">
          {line.slice(4)}
        </h3>
      )
      return
    }

    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={`h2-${index}`} className="text-xl font-bold mt-5 mb-3 text-gray-900 dark:text-gray-100">
          {line.slice(3)}
        </h2>
      )
      return
    }

    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={`h1-${index}`} className="text-2xl font-bold mt-6 mb-4 text-gray-900 dark:text-gray-100">
          {line.slice(2)}
        </h1>
      )
      return
    }

    // Bullet points
    if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <li key={`li-${index}`} className="ml-4 mb-1 text-gray-700 dark:text-gray-300">
          {formatInlineContent(line.slice(2))}
        </li>
      )
      return
    }

    // Numbered lists
    const numberedMatch = line.match(/^(\d+)\.\s+(.*)/)
    if (numberedMatch) {
      elements.push(
        <li key={`oli-${index}`} className="ml-4 mb-1 text-gray-700 dark:text-gray-300 list-decimal">
          {formatInlineContent(numberedMatch[2])}
        </li>
      )
      return
    }

    // Empty lines
    if (line.trim() === '') {
      elements.push(<div key={`br-${index}`} className="h-2" />)
      return
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${index}`} className="mb-2 text-gray-700 dark:text-gray-300 leading-relaxed">
        {formatInlineContent(line)}
      </p>
    )
  })

  // Handle unclosed code block
  if (inCodeBlock && codeBlockContent.length > 0) {
    elements.push(
      <pre key="code-unclosed" className="bg-gray-900 text-gray-100 p-3 rounded overflow-x-auto text-sm font-mono my-3">
        <code>{codeBlockContent.join('\n')}</code>
      </pre>
    )
  }

  return elements
}

/**
 * Format inline content (bold, code, etc.)
 */
function formatInlineContent(text: string): React.JSX.Element {
  // Simple inline code
  const parts = text.split(/(`[^`]+`)/)

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code
              key={i}
              className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono text-purple-600 dark:text-purple-400"
            >
              {part.slice(1, -1)}
            </code>
          )
        }

        // Bold text
        const boldParts = part.split(/(\*\*[^*]+\*\*)/)
        return boldParts.map((bp, j) => {
          if (bp.startsWith('**') && bp.endsWith('**')) {
            return (
              <strong key={`${i}-${j}`} className="font-semibold text-gray-900 dark:text-gray-100">
                {bp.slice(2, -2)}
              </strong>
            )
          }
          return <span key={`${i}-${j}`}>{bp}</span>
        })
      })}
    </>
  )
}

/**
 * Generate prompt preview text from request body
 */
function generatePromptPreview(body: object): string {
  const data = body as Record<string, unknown>
  const parts: string[] = []

  // Analysis context
  const contextLabels: Record<string, string> = {
    tuning: '🎯 분석 유형: SQL 성능 튜닝',
    explain: '📖 분석 유형: 실행계획 설명',
    index: '📊 분석 유형: 인덱스 권장',
    rewrite: '✏️ 분석 유형: SQL 재작성',
  }
  if (data.context && typeof data.context === 'string') {
    parts.push(contextLabels[data.context] || `분석 유형: ${data.context}`)
  }

  // SQL text
  if (data.sql_text && typeof data.sql_text === 'string') {
    const sqlPreview = data.sql_text.length > 300
      ? data.sql_text.substring(0, 300) + '...'
      : data.sql_text
    parts.push(`\n📝 **분석 대상 SQL:**\n\`\`\`sql\n${sqlPreview}\n\`\`\``)
  }

  // Execution plan
  if (data.execution_plan && typeof data.execution_plan === 'string') {
    const planPreview = data.execution_plan.length > 200
      ? data.execution_plan.substring(0, 200) + '...'
      : data.execution_plan
    parts.push(`\n📋 **실행계획:**\n\`\`\`\n${planPreview}\n\`\`\``)
  }

  // Metrics
  if (data.metrics && typeof data.metrics === 'object') {
    const m = data.metrics as Record<string, number>
    if (m.executions > 0) {
      parts.push(`\n⚡ **성능 메트릭:**`)
      parts.push(`- 실행 횟수: ${m.executions?.toLocaleString() || 0}`)
      parts.push(`- 경과 시간: ${m.elapsed_time_ms?.toLocaleString() || 0}ms`)
      parts.push(`- Buffer Gets: ${m.buffer_gets?.toLocaleString() || 0}`)
      parts.push(`- Disk Reads: ${m.disk_reads?.toLocaleString() || 0}`)
    }
  }

  return parts.join('\n')
}

export default function StreamingResponse({
  endpoint = '/api/llm/stream', // Use App Router API
  requestBody,
  autoStart = false,
  onStart,
  onComplete,
  onError,
  className = '',
  showCopy = true,
  showExport = true,
  exportFilename = 'ai-analysis',
  showPromptPreview = true,
}: StreamingResponseProps) {
  const [state, setState] = useState<StreamState>({
    status: 'idle',
    content: '',
    error: null,
    startTime: null,
    endTime: null,
  })
  const [copied, setCopied] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Auto-scroll to bottom during streaming
  useEffect(() => {
    if (state.status === 'streaming' && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [state.content, state.status])

  /**
   * Start streaming
   */
  const startStreaming = useCallback(async () => {
    console.log('[StreamingResponse] startStreaming called, requestBody:', !!requestBody)
    if (!requestBody) return

    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    abortControllerRef.current = new AbortController()

    setState({
      status: 'connecting',
      content: '',
      error: null,
      startTime: Date.now(),
      endTime: null,
    })

    onStart?.()
    const bodyString = JSON.stringify(requestBody)
    console.log('[StreamingResponse] Fetching:', endpoint, 'body length:', bodyString.length, 'body preview:', bodyString.slice(0, 200))

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: bodyString,
        signal: abortControllerRef.current.signal,
        cache: 'no-store',
        credentials: 'same-origin',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || `Request failed: ${response.status}`)
      }

      if (!response.body) {
        throw new Error('No response body')
      }

      setState(prev => ({ ...prev, status: 'streaming' }))

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process SSE messages
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue

          try {
            const data = JSON.parse(line.slice(6))

            switch (data.type) {
              case 'content':
                fullContent += data.content
                setState(prev => ({
                  ...prev,
                  content: fullContent,
                }))
                break

              case 'done':
                setState(prev => ({
                  ...prev,
                  status: 'complete',
                  endTime: Date.now(),
                }))
                onComplete?.(fullContent)
                return

              case 'error':
                throw new Error(data.error)

              case 'connected':
                // Connection established
                break
            }
          } catch (parseError) {
            // Skip unparseable messages
            continue
          }
        }
      }

      // Stream ended without explicit done
      setState(prev => ({
        ...prev,
        status: 'complete',
        endTime: Date.now(),
      }))
      onComplete?.(fullContent)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Request was aborted, don't update state
        return
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setState(prev => ({
        ...prev,
        status: 'error',
        error: errorMessage,
        endTime: Date.now(),
      }))
      onError?.(errorMessage)
    }
  }, [endpoint, requestBody, onStart, onComplete, onError])

  /**
   * Stop streaming
   */
  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setState(prev => ({
      ...prev,
      status: prev.content ? 'complete' : 'idle',
      endTime: Date.now(),
    }))
  }, [])

  /**
   * Copy content to clipboard
   */
  const copyContent = useCallback(async () => {
    if (!state.content) return

    try {
      await navigator.clipboard.writeText(state.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }, [state.content])

  /**
   * Export content as markdown file
   */
  const exportContent = useCallback(() => {
    if (!state.content) return

    const blob = new Blob([state.content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${exportFilename}-${new Date().toISOString().split('T')[0]}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [state.content, exportFilename])

  // Auto-start if enabled - use ref to avoid triggering on callback changes
  const startStreamingRef = useRef(startStreaming)
  startStreamingRef.current = startStreaming

  // Track requestBody changes using JSON string comparison
  const requestBodyString = requestBody ? JSON.stringify(requestBody) : null
  const prevRequestBodyRef = useRef<string | null>(null)
  const hasStartedRef = useRef(false)

  // Single effect to handle autoStart logic properly
  useEffect(() => {
    // Check if requestBody changed
    const bodyChanged = requestBodyString && requestBodyString !== prevRequestBodyRef.current

    console.log('[StreamingResponse] useEffect - autoStart:', autoStart, 'bodyChanged:', bodyChanged, 'hasStarted:', hasStartedRef.current)

    if (bodyChanged) {
      console.log('[StreamingResponse] requestBody changed, resetting hasStarted')
      prevRequestBodyRef.current = requestBodyString
      hasStartedRef.current = false
    }

    // Start streaming if autoStart is true and we have a body and haven't started
    if (autoStart && requestBodyString && !hasStartedRef.current) {
      console.log('[StreamingResponse] Starting stream...')
      hasStartedRef.current = true
      // Use setTimeout to ensure state updates are flushed
      setTimeout(() => {
        startStreamingRef.current()
      }, 0)
    }
  }, [autoStart, requestBodyString])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // Calculate duration
  const duration = state.startTime && state.endTime
    ? ((state.endTime - state.startTime) / 1000).toFixed(1)
    : null

  return (
    <Card className={className}>
      <CardContent className="pt-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            {state.status === 'streaming' ? (
              <Sparkles className="h-5 w-5 text-purple-500 animate-pulse" />
            ) : state.status === 'complete' ? (
              <Bot className="h-5 w-5 text-green-500" />
            ) : state.status === 'error' ? (
              <AlertTriangle className="h-5 w-5 text-red-500" />
            ) : (
              <Bot className="h-5 w-5 text-gray-400" />
            )}
            <span className="font-medium text-gray-900 dark:text-gray-100">
              AI 분석 결과
            </span>
            {state.status === 'streaming' && (
              <Badge variant="outline" className="animate-pulse">
                분석 중...
              </Badge>
            )}
            {state.status === 'complete' && duration && (
              <Badge variant="outline" className="text-green-600">
                {duration}초
              </Badge>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {showCopy && state.content && (
              <Button
                variant="ghost"
                size="sm"
                onClick={copyContent}
                className="h-8"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            )}
            {showExport && state.content && (
              <Button
                variant="ghost"
                size="sm"
                onClick={exportContent}
                className="h-8"
              >
                <Download className="h-4 w-4" />
              </Button>
            )}
            {(state.status === 'complete' || state.status === 'error') && requestBody && (
              <Button
                variant="ghost"
                size="sm"
                onClick={startStreaming}
                className="h-8"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div
          ref={contentRef}
          className="min-h-[200px] max-h-[600px] overflow-y-auto bg-gray-50 dark:bg-gray-900 rounded-lg p-4"
        >
          {state.status === 'idle' && (
            <div className="flex items-center justify-center h-[200px] text-gray-500">
              <p>분석 요청을 제출하면 AI 응답이 여기에 표시됩니다.</p>
            </div>
          )}

          {state.status === 'connecting' && (
            <div className="space-y-4">
              {/* Loading indicator */}
              <div className="flex items-center space-x-3 p-3 bg-purple-50 dark:bg-purple-900/30 rounded-lg">
                <RefreshCw className="h-5 w-5 text-purple-500 animate-spin flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
                    LLM 서버에 연결 중...
                  </p>
                  <p className="text-xs text-purple-600 dark:text-purple-400">
                    AI 모델이 분석을 준비하고 있습니다
                  </p>
                </div>
              </div>

              {/* Prompt preview */}
              {showPromptPreview && requestBody && (
                <div className="border-l-4 border-purple-300 pl-4">
                  <p className="text-xs font-medium text-gray-500 mb-2">📤 전송 중인 프롬프트:</p>
                  <div className="prose prose-sm dark:prose-invert max-w-none opacity-80">
                    {formatContent(generatePromptPreview(requestBody))}
                  </div>
                </div>
              )}
            </div>
          )}

          {state.status === 'error' && (
            <div className="flex items-center justify-center h-[200px]">
              <div className="text-center">
                <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                <p className="text-red-600 font-medium mb-1">오류가 발생했습니다</p>
                <p className="text-gray-500 text-sm">{state.error}</p>
              </div>
            </div>
          )}

          {(state.status === 'streaming' || state.status === 'complete') && state.content && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {formatContent(state.content)}
              {state.status === 'streaming' && (
                <span className="inline-block w-2 h-5 bg-purple-500 animate-pulse ml-1" />
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export { StreamingResponse }
