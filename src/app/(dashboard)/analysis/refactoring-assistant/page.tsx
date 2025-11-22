'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSelectedDatabase } from '@/hooks/use-selected-database'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowLeft,
  AlertTriangle,
  Code,
  Sparkles,
  RefreshCw,
  Copy,
  CheckCircle2,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

interface RefactoringSuggestion {
  sql_id: string
  original_sql: string
  refactored_sql: string
  improvements: {
    type: string
    description: string
    impact: 'high' | 'medium' | 'low'
  }[]
  performance_gain: number
  complexity_reduction: number
  reasoning: string
}

export default function RefactoringAssistantPage() {
  const router = useRouter()
  const { selectedConnectionId } = useSelectedDatabase()
  const [selectedSqlId, setSelectedSqlId] = useState<string>('')
  const [copiedSql, setCopiedSql] = useState<string>('')

  // 리팩토링 제안 목록 조회
  const { data: suggestions, isLoading, refetch } = useQuery({
    queryKey: ['refactoring-suggestions', selectedConnectionId],
    queryFn: async () => {
      if (!selectedConnectionId || selectedConnectionId === 'all') {
        return []
      }

      const res = await fetch(`/api/analysis/refactoring-suggestions?connection_id=${selectedConnectionId}`)
      if (!res.ok) throw new Error('Failed to fetch suggestions')

      const data = await res.json()
      return data.data || []
    },
    enabled: !!selectedConnectionId && selectedConnectionId !== 'all',
  })

  const handleCopy = async (sql: string, id: string) => {
    await navigator.clipboard.writeText(sql)
    setCopiedSql(id)
    setTimeout(() => setCopiedSql(''), 2000)
  }

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'bg-green-100 text-green-800 border-green-200'
      case 'medium': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'low': return 'bg-gray-100 text-gray-800 border-gray-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
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
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">SQL 리팩토링 어시스턴트</h1>
              <p className="text-gray-500 dark:text-gray-400">AI가 제안하는 SQL 재작성 및 최적화</p>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
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
                  리팩토링 제안을 받으려면 상단의 데이터베이스 선택 메뉴에서 분석할 데이터베이스를 선택해주세요.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">제안 가능한 SQL</p>
                <p className="text-2xl font-bold">{suggestions?.length || 0}</p>
              </div>
              <Code className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">평균 성능 향상</p>
                <p className="text-2xl font-bold text-green-600">
                  {suggestions && suggestions.length > 0
                    ? Math.round(
                        suggestions.reduce((acc: number, s: RefactoringSuggestion) => acc + s.performance_gain, 0) /
                          suggestions.length
                      )
                    : 0}
                  %
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">복잡도 감소</p>
                <p className="text-2xl font-bold text-purple-600">
                  {suggestions && suggestions.length > 0
                    ? Math.round(
                        suggestions.reduce((acc: number, s: RefactoringSuggestion) => acc + s.complexity_reduction, 0) /
                          suggestions.length
                      )
                    : 0}
                  %
                </p>
              </div>
              <Zap className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Refactoring Suggestions */}
      <div className="space-y-6">
        {isLoading ? (
          <Card>
            <CardContent className="p-12 text-center">
              <RefreshCw className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">리팩토링 제안 분석 중...</p>
            </CardContent>
          </Card>
        ) : suggestions && suggestions.length > 0 ? (
          suggestions.map((suggestion: RefactoringSuggestion) => (
            <Card key={suggestion.sql_id} className="overflow-hidden">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center text-lg">
                      <Sparkles className="h-5 w-5 mr-2 text-purple-500" />
                      SQL ID: {suggestion.sql_id}
                    </CardTitle>
                    <CardDescription className="mt-2">
                      성능 향상: <span className="font-bold text-green-600">{suggestion.performance_gain}%</span> |
                      복잡도 감소: <span className="font-bold text-purple-600">{suggestion.complexity_reduction}%</span>
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {/* Improvements */}
                <div>
                  <h4 className="text-sm font-semibold mb-3">🎯 개선 사항</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {suggestion.improvements.map((improvement, idx) => (
                      <div key={idx} className={`p-3 rounded border ${getImpactColor(improvement.impact)}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold">{improvement.type}</span>
                          <Badge variant="outline" className="text-xs">
                            {improvement.impact}
                          </Badge>
                        </div>
                        <p className="text-xs">{improvement.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* SQL Comparison */}
                <Tabs defaultValue="original" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="original">원본 SQL</TabsTrigger>
                    <TabsTrigger value="refactored">리팩토링된 SQL</TabsTrigger>
                  </TabsList>
                  <TabsContent value="original" className="space-y-2">
                    <div className="relative">
                      <pre className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg overflow-x-auto text-xs">
                        <code className="text-gray-800 dark:text-gray-200">
                          {suggestion.original_sql}
                        </code>
                      </pre>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => handleCopy(suggestion.original_sql, `orig-${suggestion.sql_id}`)}
                      >
                        {copiedSql === `orig-${suggestion.sql_id}` ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </TabsContent>
                  <TabsContent value="refactored" className="space-y-2">
                    <div className="relative">
                      <pre className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg overflow-x-auto text-xs border-2 border-green-200">
                        <code className="text-gray-800 dark:text-gray-200">
                          {suggestion.refactored_sql}
                        </code>
                      </pre>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={() => handleCopy(suggestion.refactored_sql, `ref-${suggestion.sql_id}`)}
                      >
                        {copiedSql === `ref-${suggestion.sql_id}` ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>

                {/* Reasoning */}
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <h4 className="text-sm font-semibold mb-2 text-blue-900 dark:text-blue-300">
                    💡 AI 분석 근거
                  </h4>
                  <p className="text-sm text-blue-800 dark:text-blue-200">{suggestion.reasoning}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end space-x-2 pt-4 border-t">
                  <Button variant="outline" size="sm">
                    테스트 실행
                  </Button>
                  <Button variant="default" size="sm">
                    적용하기
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="p-12 text-center">
              <Code className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">리팩토링 제안이 없습니다.</p>
              <p className="text-sm text-gray-400 mt-2">모든 SQL이 최적화되어 있습니다.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
