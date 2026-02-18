/**
 * Presentation Layer - AI Insight Card Component
 * Displays AI analysis results in a card format
 */

'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  BrainCircuit,
  AlertTriangle,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from 'lucide-react'
import { useState } from 'react'
import type { Issue, Recommendation, IndexSuggestion, PerformanceGrade } from '@/domain/llm-analysis'

export interface AIInsightCardProps {
  title?: string
  summary: string
  performanceScore?: number
  performanceGrade?: PerformanceGrade
  issues?: Issue[]
  recommendations?: Recommendation[]
  indexSuggestions?: IndexSuggestion[]
  processingTimeMs?: number
  modelUsed?: string
  onCopyAction?: () => void
}

export function AIInsightCard({
  title = 'AI 분석 결과',
  summary,
  performanceScore,
  performanceGrade,
  issues = [],
  recommendations = [],
  indexSuggestions = [],
  processingTimeMs,
  modelUsed,
  onCopyAction,
}: AIInsightCardProps) {
  const [isIssuesOpen, setIsIssuesOpen] = useState(true)
  const [isRecsOpen, setIsRecsOpen] = useState(true)
  const [isIndexOpen, setIsIndexOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    const text = `${summary}\n\nIssues:\n${issues.map(i => `- ${i.title}: ${i.description}`).join('\n')}\n\nRecommendations:\n${recommendations.map(r => `- ${r.title}: ${r.description}`).join('\n')}`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    onCopyAction?.()
  }

  const getGradeColor = (grade: PerformanceGrade) => {
    switch (grade) {
      case 'A': return 'bg-green-500'
      case 'B': return 'bg-blue-500'
      case 'C': return 'bg-yellow-500'
      case 'D': return 'bg-orange-500'
      case 'F': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive'
      case 'high': return 'destructive'
      case 'medium': return 'default'
      case 'low': return 'secondary'
      default: return 'outline'
    }
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-purple-500" />
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {performanceGrade && (
              <Badge className={`${getGradeColor(performanceGrade)} text-white`}>
                {performanceGrade} ({performanceScore})
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        {(processingTimeMs || modelUsed) && (
          <CardDescription className="text-xs">
            {modelUsed && <span className="mr-2">모델: {modelUsed}</span>}
            {processingTimeMs && <span>처리 시간: {processingTimeMs}ms</span>}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="rounded-lg bg-muted p-3">
          <p className="text-sm leading-relaxed">{summary}</p>
        </div>

        {/* Issues */}
        {issues.length > 0 && (
          <Collapsible open={isIssuesOpen} onOpenChange={setIsIssuesOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <span className="font-medium">이슈 ({issues.length})</span>
                </div>
                {isIssuesOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScrollArea className="max-h-48">
                <div className="space-y-2 p-2">
                  {issues.map((issue, index) => (
                    <div key={issue.id || index} className="rounded border p-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={getSeverityColor(issue.severity) as any} className="text-xs">
                          {issue.severity}
                        </Badge>
                        <span className="font-medium text-sm">{issue.title}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{issue.description}</p>
                      {issue.suggestion && (
                        <p className="mt-1 text-xs text-green-600">💡 {issue.suggestion}</p>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <Collapsible open={isRecsOpen} onOpenChange={setIsRecsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-2">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-blue-500" />
                  <span className="font-medium">권장사항 ({recommendations.length})</span>
                </div>
                {isRecsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScrollArea className="max-h-48">
                <div className="space-y-2 p-2">
                  {recommendations.map((rec, index) => (
                    <div key={rec.id || index} className="rounded border p-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          P{rec.priority}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {rec.type}
                        </Badge>
                        <span className="font-medium text-sm">{rec.title}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{rec.description}</p>
                      {rec.expectedImprovement && (
                        <p className="mt-1 text-xs text-green-600">📈 예상 개선: {rec.expectedImprovement}</p>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Index Suggestions */}
        {indexSuggestions.length > 0 && (
          <Collapsible open={isIndexOpen} onOpenChange={setIsIndexOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🗂️</span>
                  <span className="font-medium">인덱스 제안 ({indexSuggestions.length})</span>
                </div>
                {isIndexOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScrollArea className="max-h-48">
                <div className="space-y-2 p-2">
                  {indexSuggestions.map((idx, index) => (
                    <div key={index} className="rounded border p-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {idx.type}
                        </Badge>
                        <span className="font-medium text-sm">{idx.table}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{idx.reason}</p>
                      {idx.ddl && (
                        <pre className="mt-2 rounded bg-muted p-2 text-xs overflow-x-auto">
                          {idx.ddl}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  )
}
