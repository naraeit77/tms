/**
 * Presentation Layer - Enhanced Smart Search Input Component
 * Natural language search with rule-based interpretation, history, presets, and autocomplete
 *
 * UPDATED: Now uses rule-based parsing instead of LLM
 */

'use client'

import { useState, useCallback, KeyboardEvent, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Search,
  Sparkles,
  X,
  Info,
  History,
  Zap,
  Clock,
  Database,
  TrendingUp,
  AlertTriangle,
  Filter,
  Mic,
  MicOff,
  CheckCircle,
} from 'lucide-react'
import { useRuleBasedSearch } from '../hooks/useRuleBasedSearch'
import type { SearchFilters } from '@/domain/llm-analysis'
import { cn } from '@/lib/utils'

interface SmartSearchInputProps {
  onSearch: (filters: SearchFilters) => void
  onTextSearch?: (text: string) => void
  placeholder?: string
  language?: 'ko' | 'en'
  connectionId?: string
}

// Quick filter presets
const QUICK_PRESETS = [
  {
    id: 'slow-queries',
    label: '느린 쿼리',
    icon: Clock,
    query: '실행 시간 1초 이상인 쿼리',
    filters: { minElapsedTime: 1000, sortBy: 'elapsed_time', sortOrder: 'desc' as const },
  },
  {
    id: 'high-buffer',
    label: '대용량 조회',
    icon: Database,
    query: 'Buffer Gets가 10000 이상인 쿼리',
    filters: { minBufferGets: 10000, sortBy: 'buffer_gets', sortOrder: 'desc' as const },
  },
  {
    id: 'frequent',
    label: '자주 실행',
    icon: TrendingUp,
    query: '실행 횟수가 많은 쿼리',
    filters: { sortBy: 'executions', sortOrder: 'desc' as const, limit: 20 },
  },
  {
    id: 'recent-errors',
    label: '최근 이슈',
    icon: AlertTriangle,
    query: '최근 1시간 내 문제 쿼리',
    filters: { timeRange: '1h', minElapsedTime: 500, sortBy: 'elapsed_time', sortOrder: 'desc' as const },
  },
]

// Search history storage key
const SEARCH_HISTORY_KEY = 'tms_smart_search_history'
const MAX_HISTORY_ITEMS = 10

export function SmartSearchInput({
  onSearch,
  onTextSearch,
  placeholder = '자연어로 검색 (예: "최근 1시간 느린 쿼리 하나")',
  language = 'ko',
}: SmartSearchInputProps) {
  const [query, setQuery] = useState('')
  const [showInterpretation, setShowInterpretation] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searchHistory, setSearchHistory] = useState<string[]>([])
  const [isListening, setIsListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  // Use rule-based search (no LLM)
  const { search, result: searchResult, error, reset } = useRuleBasedSearch()

  // Load search history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(SEARCH_HISTORY_KEY)
    if (saved) {
      try {
        setSearchHistory(JSON.parse(saved))
      } catch {
        // Ignore parse errors
      }
    }

    // Check voice input support
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      setVoiceSupported(true)
    }
  }, [])

  // Save search to history
  const saveToHistory = useCallback((searchQuery: string) => {
    setSearchHistory(prev => {
      const filtered = prev.filter(q => q !== searchQuery)
      const newHistory = [searchQuery, ...filtered].slice(0, MAX_HISTORY_ITEMS)
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory))
      return newHistory
    })
  }, [])

  const handleSmartSearch = useCallback(() => {
    if (!query.trim()) return

    saveToHistory(query.trim())
    setShowSuggestions(false)

    // Synchronous rule-based search - instant results!
    const result = search(query.trim())
    setShowInterpretation(true)
    onSearch(result.filters)
  }, [query, search, onSearch, saveToHistory])

  const handlePresetClick = useCallback((preset: typeof QUICK_PRESETS[0]) => {
    setQuery(preset.query)
    setShowInterpretation(true)
    onSearch(preset.filters)
    setShowSuggestions(false)
  }, [onSearch])

  const handleHistoryClick = useCallback((historyQuery: string) => {
    setQuery(historyQuery)
    setShowSuggestions(false)
    // Auto-execute search when selecting from history
    const result = search(historyQuery)
    setShowInterpretation(true)
    onSearch(result.filters)
  }, [search, onSearch])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        onTextSearch?.(query)
      } else {
        handleSmartSearch()
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  const handleClear = () => {
    setQuery('')
    setShowInterpretation(false)
    setShowSuggestions(false)
    reset()
    inputRef.current?.focus()
  }

  const clearHistory = () => {
    setSearchHistory([])
    localStorage.removeItem(SEARCH_HISTORY_KEY)
  }

  // Voice input handling
  const toggleVoiceInput = useCallback(() => {
    if (!voiceSupported) return

    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.lang = language === 'ko' ? 'ko-KR' : 'en-US'
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onresult = (event: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => {
      const transcript = event.results[0][0].transcript
      setQuery(prev => prev + ' ' + transcript)
      setIsListening(false)
    }

    recognition.onerror = () => {
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [voiceSupported, isListening, language])

  const activeFilters = searchResult?.filters
    ? Object.entries(searchResult.filters).filter(([_, v]) => v !== null && v !== undefined)
    : []

  // Filter suggestions based on query
  const filteredHistory = searchHistory.filter(h =>
    h.toLowerCase().includes(query.toLowerCase())
  )

  // Confidence badge color
  const getConfidenceBadge = () => {
    if (!searchResult) return null
    const { confidence } = searchResult
    const colors = {
      high: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
      medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
      low: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    }
    const labels = { high: '높음', medium: '보통', low: '낮음' }
    return (
      <Badge variant="secondary" className={cn('text-xs', colors[confidence])}>
        신뢰도: {labels[confidence]}
      </Badge>
    )
  }

  return (
    <div className="space-y-3">
      {/* Quick Preset Buttons */}
      <div className="flex flex-wrap gap-2">
        <span className="text-sm text-muted-foreground flex items-center gap-1">
          <Zap className="h-3 w-3" />
          빠른 검색:
        </span>
        {QUICK_PRESETS.map(preset => (
          <Button
            key={preset.id}
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => handlePresetClick(preset)}
          >
            <preset.icon className="h-3 w-3" />
            {preset.label}
          </Button>
        ))}
      </div>

      {/* Search Input */}
      <div className="flex gap-2">
        <Popover open={showSuggestions && (filteredHistory.length > 0 || query.length > 0)}>
          <PopoverTrigger asChild>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setShowSuggestions(e.target.value.length > 0 || searchHistory.length > 0)
                }}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className="pl-10 pr-20"
              />
              <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {voiceSupported && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn("h-7 w-7 p-0", isListening && "text-red-500")}
                    onClick={toggleVoiceInput}
                    title={isListening ? "음성 입력 중지" : "음성으로 검색"}
                  >
                    {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </Button>
                )}
                {query && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={handleClear}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
            <Command>
              <CommandList>
                {filteredHistory.length > 0 && (
                  <CommandGroup heading="최근 검색">
                    {filteredHistory.slice(0, 5).map((historyItem, i) => (
                      <CommandItem
                        key={i}
                        onSelect={() => handleHistoryClick(historyItem)}
                        className="cursor-pointer"
                      >
                        <History className="mr-2 h-4 w-4 text-muted-foreground" />
                        <span className="truncate">{historyItem}</span>
                      </CommandItem>
                    ))}
                    <CommandItem
                      onSelect={clearHistory}
                      className="cursor-pointer text-muted-foreground text-xs"
                    >
                      <X className="mr-2 h-3 w-3" />
                      검색 기록 삭제
                    </CommandItem>
                  </CommandGroup>
                )}
                {query.length === 0 && filteredHistory.length === 0 && (
                  <CommandEmpty>검색어를 입력하세요</CommandEmpty>
                )}
                <CommandSeparator />
                <CommandGroup heading="검색 팁">
                  <div className="p-2 text-xs text-muted-foreground space-y-1">
                    <p>• &quot;느린 쿼리 하나만&quot; → 가장 느린 쿼리 1개</p>
                    <p>• &quot;최근 1시간&quot; → 시간 범위 필터</p>
                    <p>• &quot;SELECT 쿼리&quot; → SQL 유형 필터</p>
                    <p>• Shift+Enter → 일반 텍스트 검색</p>
                  </div>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Button
          onClick={handleSmartSearch}
          disabled={!query.trim()}
          className="gap-2 min-w-[100px]"
        >
          <Sparkles className="h-4 w-4" />
          스마트 검색
        </Button>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" title="사용 안내">
              <Info className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-96">
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                스마트 검색 사용법
              </h4>
              <p className="text-sm text-muted-foreground">
                자연어로 검색하면 규칙 기반으로 즉시 필터를 생성합니다.
              </p>

              <div className="space-y-2">
                <p className="text-sm font-medium">검색 예시:</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 bg-muted rounded">
                    <p className="font-medium">&quot;최근 1시간 느린 쿼리 하나&quot;</p>
                    <p className="text-muted-foreground">→ 1시간, 느린순, 1개</p>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <p className="font-medium">&quot;버퍼 많이 쓰는 상위 10개&quot;</p>
                    <p className="text-muted-foreground">→ buffer_gets순, 10개</p>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <p className="font-medium">&quot;SELECT 쿼리&quot;</p>
                    <p className="text-muted-foreground">→ SQL 패턴 검색</p>
                  </div>
                  <div className="p-2 bg-muted rounded">
                    <p className="font-medium">&quot;자주 실행되는 쿼리&quot;</p>
                    <p className="text-muted-foreground">→ 실행횟수순 정렬</p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-2 space-y-1 text-xs text-muted-foreground">
                <p><strong>단축키:</strong></p>
                <p>• Enter: 스마트 검색</p>
                <p>• Shift+Enter: 일반 텍스트 검색</p>
                <p>• Esc: 제안 닫기</p>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Voice Input Indicator */}
      {isListening && (
        <div className="flex items-center gap-2 text-sm text-red-500 animate-pulse">
          <Mic className="h-4 w-4" />
          음성 입력 중... 말씀하세요
        </div>
      )}

      {/* Rule-Based Interpretation Display */}
      {showInterpretation && searchResult && (
        <div className="rounded-lg border bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-purple-100 dark:bg-purple-900">
              <CheckCircle className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-medium text-sm">검색 해석 결과</span>
                <div className="flex items-center gap-2">
                  {getConfidenceBadge()}
                  <span className="text-xs text-muted-foreground">
                    {searchResult.processingTimeMs}ms · 규칙 기반
                  </span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{searchResult.interpretation}</p>
            </div>
          </div>

          {/* Matched Rules */}
          {searchResult.matchedRules.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="text-muted-foreground">적용된 규칙:</span>
              {searchResult.matchedRules.map((rule, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {formatRuleName(rule.ruleName)}
                </Badge>
              ))}
            </div>
          )}

          {/* Active Filters */}
          {activeFilters.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground" />
              {activeFilters.map(([key, value]) => (
                <Badge key={key} variant="secondary" className="text-xs">
                  {formatFilterLabel(key)}: {formatFilterValue(key, value)}
                </Badge>
              ))}
            </div>
          )}

          {/* Related Suggestions */}
          {searchResult.suggestions && searchResult.suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
              <span className="text-xs text-muted-foreground">추천 검색:</span>
              {searchResult.suggestions.map((suggestion, i) => (
                <Button
                  key={i}
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-blue-600 hover:text-blue-700"
                  onClick={() => {
                    setQuery(suggestion)
                  }}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4" />
          <span>검색 처리 중 오류: {error.message}</span>
          <Button variant="ghost" size="sm" onClick={() => reset()} className="ml-auto h-6">
            다시 시도
          </Button>
        </div>
      )}
    </div>
  )
}

// Helper functions
function formatRuleName(ruleName: string): string {
  const names: Record<string, string> = {
    time_range: '시간 범위',
    performance_metric: '성능 지표',
    sql_type: 'SQL 유형',
    limit: '결과 제한',
    schema: '스키마',
    threshold: '임계값',
  }
  return names[ruleName] || ruleName
}

function formatFilterLabel(key: string): string {
  const labels: Record<string, string> = {
    timeRange: '기간',
    minElapsedTime: '최소 실행시간',
    maxElapsedTime: '최대 실행시간',
    minBufferGets: '최소 Buffer Gets',
    maxBufferGets: '최대 Buffer Gets',
    sqlPattern: 'SQL 패턴',
    schema: '스키마',
    sortBy: '정렬 기준',
    sortOrder: '정렬 순서',
    limit: '결과 수',
  }
  return labels[key] || key
}

function formatFilterValue(key: string, value: unknown): string {
  if (key === 'minElapsedTime' || key === 'maxElapsedTime') {
    return `${value}ms`
  }
  if (key === 'sortOrder') {
    return value === 'desc' ? '내림차순' : '오름차순'
  }
  if (key === 'sortBy') {
    const sortLabels: Record<string, string> = {
      elapsed_time: '실행시간',
      cpu_time: 'CPU 시간',
      buffer_gets: 'Buffer Gets',
      disk_reads: 'Disk Reads',
      executions: '실행횟수',
    }
    return sortLabels[String(value)] || String(value)
  }
  return String(value)
}

// Type declarations for Web Speech API
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition: any
  }
}
