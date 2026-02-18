'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Lightbulb,
  ChevronDown,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Info,
  Zap,
} from 'lucide-react'
import type { TuningRecommendation, IndexPriority } from '@/domain/query-artifacts'

interface RecommendationsListProps {
  recommendations: TuningRecommendation[]
  className?: string
  onApply?: (recommendation: TuningRecommendation) => void
}

/**
 * Recommendations List Component
 * Displays tuning recommendations with DDL and explanations
 */
export function RecommendationsList({
  recommendations,
  className = '',
  onApply,
}: RecommendationsListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const copyDDL = async (ddl: string, id: string) => {
    try {
      await navigator.clipboard.writeText(ddl)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const getPriorityConfig = (priority: IndexPriority) => {
    switch (priority) {
      case 'CRITICAL':
        return {
          icon: AlertTriangle,
          color: 'text-red-500',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/20',
          label: '필수',
        }
      case 'HIGH':
        return {
          icon: Zap,
          color: 'text-orange-500',
          bgColor: 'bg-orange-500/10',
          borderColor: 'border-orange-500/20',
          label: '높음',
        }
      case 'MEDIUM':
        return {
          icon: Info,
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-500/10',
          borderColor: 'border-yellow-500/20',
          label: '중간',
        }
      default:
        return {
          icon: Info,
          color: 'text-blue-500',
          bgColor: 'bg-blue-500/10',
          borderColor: 'border-blue-500/20',
          label: '낮음',
        }
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'CREATE_INDEX':
        return '인덱스 생성'
      case 'DROP_INDEX':
        return '인덱스 삭제'
      case 'MODIFY_INDEX':
        return '인덱스 수정'
      case 'ADD_HINT':
        return '힌트 추가'
      case 'REWRITE_SQL':
        return 'SQL 재작성'
      case 'GATHER_STATS':
        return '통계 수집'
      default:
        return type
    }
  }

  // Sort by priority
  const sortedRecommendations = [...recommendations].sort((a, b) => {
    const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
    return priorityOrder[a.priority] - priorityOrder[b.priority]
  })

  if (recommendations.length === 0) {
    return (
      <Card className={`${className} h-full`}>
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-center text-muted-foreground">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-green-500" />
            <p className="font-medium">최적화 완료</p>
            <p className="text-sm">추가 튜닝 권장사항이 없습니다</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-yellow-500" />
            튜닝 권장사항
          </div>
          <Badge variant="secondary">{recommendations.length}개</Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0">
        <ScrollArea className="h-[400px]">
          <div className="space-y-3">
            {sortedRecommendations.map((rec) => {
              const config = getPriorityConfig(rec.priority)
              const PriorityIcon = config.icon
              const isExpanded = expandedIds.has(rec.id)

              return (
                <Collapsible
                  key={rec.id}
                  open={isExpanded}
                  onOpenChange={() => toggleExpanded(rec.id)}
                >
                  <div
                    className={`rounded-lg border ${config.borderColor} ${config.bgColor} overflow-hidden`}
                  >
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors">
                        <PriorityIcon className={`w-5 h-5 mt-0.5 ${config.color}`} />
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{rec.title}</span>
                            <Badge variant="outline" className="text-xs">
                              {getTypeLabel(rec.type)}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {rec.description}
                          </p>
                        </div>
                        <ChevronDown
                          className={`w-4 h-4 text-muted-foreground transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="px-3 pb-3 pt-1 space-y-3">
                        {/* Rationale */}
                        <div>
                          <h5 className="text-xs font-medium text-muted-foreground mb-1">
                            근거
                          </h5>
                          <p className="text-sm">{rec.rationale}</p>
                        </div>

                        {/* DDL */}
                        {rec.ddl && (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <h5 className="text-xs font-medium text-muted-foreground">
                                DDL/SQL
                              </h5>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2"
                                onClick={() => copyDDL(rec.ddl!, rec.id)}
                              >
                                {copiedId === rec.id ? (
                                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </Button>
                            </div>
                            <pre className="text-xs bg-slate-900 text-slate-100 p-2 rounded overflow-x-auto">
                              <code>{rec.ddl}</code>
                            </pre>
                          </div>
                        )}

                        {/* Expected Improvement */}
                        {rec.expectedImprovement && (
                          <div>
                            <h5 className="text-xs font-medium text-muted-foreground mb-1">
                              예상 효과
                            </h5>
                            <p className="text-sm text-green-600">{rec.expectedImprovement}</p>
                          </div>
                        )}

                        {/* Risk */}
                        {rec.risk && (
                          <div>
                            <h5 className="text-xs font-medium text-muted-foreground mb-1">
                              주의사항
                            </h5>
                            <p className="text-sm text-yellow-600">{rec.risk}</p>
                          </div>
                        )}

                        {/* Apply Button */}
                        {onApply && (
                          <div className="pt-2 border-t">
                            <Button
                              size="sm"
                              className="w-full"
                              onClick={() => onApply(rec)}
                            >
                              권장사항 적용
                            </Button>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              )
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
