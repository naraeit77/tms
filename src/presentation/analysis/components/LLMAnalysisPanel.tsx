/**
 * Presentation Layer - LLM Analysis Panel Component
 * Main panel for triggering and displaying LLM analysis
 */

'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BrainCircuit, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LLMStatusBadge } from './LLMStatusBadge'
import { AIInsightCard } from './AIInsightCard'
import { useSQLAnalysis } from '../hooks'
import { useLLMHealth } from '../hooks'
import type { SQLMetrics } from '@/domain/llm-analysis'

export interface LLMAnalysisPanelProps {
  sqlId?: string
  sqlText: string
  executionPlan?: string
  metrics?: SQLMetrics
  language?: 'ko' | 'en'
}

export function LLMAnalysisPanel({
  sqlId,
  sqlText,
  executionPlan,
  metrics,
  language = 'ko',
}: LLMAnalysisPanelProps) {
  const [activeTab, setActiveTab] = useState<'tuning' | 'explain' | 'index' | 'rewrite'>('tuning')

  const { data: health, isLoading: isHealthLoading } = useLLMHealth()
  const { mutate: analyze, data: analysisResult, isPending, error, reset } = useSQLAnalysis()

  const isLLMAvailable = health?.healthy === true

  const handleAnalyze = () => {
    analyze({
      sqlId,
      sqlText,
      executionPlan,
      metrics,
      context: activeTab,
      language,
      saveHistory: true,
    })
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-purple-500" />
            <CardTitle>AI SQL 분석</CardTitle>
          </div>
          <LLMStatusBadge showModel />
        </div>
        <CardDescription>
          Local LLM을 활용한 SQL 성능 분석 및 최적화 제안
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Analysis Type Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="tuning">종합 튜닝</TabsTrigger>
            <TabsTrigger value="explain">실행계획 해석</TabsTrigger>
            <TabsTrigger value="index">인덱스 제안</TabsTrigger>
            <TabsTrigger value="rewrite">SQL 리라이트</TabsTrigger>
          </TabsList>

          <TabsContent value="tuning" className="mt-4">
            <p className="text-sm text-muted-foreground">
              SQL의 전반적인 성능을 분석하고 종합적인 튜닝 권장사항을 제공합니다.
            </p>
          </TabsContent>
          <TabsContent value="explain" className="mt-4">
            <p className="text-sm text-muted-foreground">
              실행 계획을 분석하여 병목 지점을 식별하고 해석합니다.
            </p>
          </TabsContent>
          <TabsContent value="index" className="mt-4">
            <p className="text-sm text-muted-foreground">
              SQL 성능 개선을 위한 인덱스 생성/변경 제안을 제공합니다.
            </p>
          </TabsContent>
          <TabsContent value="rewrite" className="mt-4">
            <p className="text-sm text-muted-foreground">
              더 효율적인 SQL로 재작성하는 방안을 제안합니다.
            </p>
          </TabsContent>
        </Tabs>

        {/* SQL Preview */}
        <div className="rounded-lg border bg-muted p-3">
          <pre className="max-h-32 overflow-auto text-xs">
            {sqlText.substring(0, 500)}
            {sqlText.length > 500 && '...'}
          </pre>
        </div>

        {/* Metrics Info */}
        {metrics && (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>Elapsed: {metrics.elapsedTimeMs}ms</span>
            <span>|</span>
            <span>Buffer Gets: {metrics.bufferGets.toLocaleString()}</span>
            <span>|</span>
            <span>Executions: {metrics.executions.toLocaleString()}</span>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error.message}
            </AlertDescription>
          </Alert>
        )}

        {/* Action Button */}
        <div className="flex gap-2">
          <Button
            onClick={handleAnalyze}
            disabled={isPending || isHealthLoading || !isLLMAvailable}
            className="flex-1"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                분석 중...
              </>
            ) : (
              <>
                <BrainCircuit className="mr-2 h-4 w-4" />
                AI 분석 시작
              </>
            )}
          </Button>
          {analysisResult && (
            <Button variant="outline" onClick={() => reset()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Not Available Message */}
        {!isHealthLoading && !isLLMAvailable && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              LLM 서비스에 연결할 수 없습니다. 서비스 상태를 확인해주세요.
            </AlertDescription>
          </Alert>
        )}

        {/* Analysis Results */}
        {analysisResult && (
          <AIInsightCard
            title={`AI ${activeTab === 'tuning' ? '종합 분석' : activeTab === 'explain' ? '실행계획 분석' : activeTab === 'index' ? '인덱스 분석' : 'SQL 리라이트'} 결과`}
            summary={analysisResult.summary}
            performanceScore={analysisResult.performanceScore}
            performanceGrade={analysisResult.performanceGrade}
            issues={analysisResult.issues}
            recommendations={analysisResult.recommendations}
            indexSuggestions={analysisResult.indexSuggestions}
            processingTimeMs={analysisResult.processingTimeMs}
            modelUsed={analysisResult.modelUsed}
          />
        )}
      </CardContent>
    </Card>
  )
}
