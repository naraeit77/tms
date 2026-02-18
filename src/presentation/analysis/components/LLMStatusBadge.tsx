/**
 * Presentation Layer - LLM Status Badge Component
 * Shows the current status of the LLM service
 */

'use client'

import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Loader2 } from 'lucide-react'
import { useLLMHealth } from '../hooks'

interface LLMStatusBadgeProps {
  showModel?: boolean
  showLatency?: boolean
}

export function LLMStatusBadge({ showModel = false, showLatency = false }: LLMStatusBadgeProps) {
  const { data: health, isLoading, isError } = useLLMHealth()

  if (isLoading) {
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        AI 확인 중
      </Badge>
    )
  }

  if (isError || !health?.healthy) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="destructive" className="gap-1">
              <span className="h-2 w-2 rounded-full bg-red-200" />
              AI 오프라인
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{health?.error || 'LLM 서비스에 연결할 수 없습니다'}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="gap-1 border-green-500 text-green-600">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            AI 활성
            {showModel && <span className="text-xs opacity-70">({health.model})</span>}
            {showLatency && <span className="text-xs opacity-70">{health.latencyMs}ms</span>}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1 text-sm">
            <p>모델: {health.model}</p>
            <p>응답 시간: {health.latencyMs}ms</p>
            <p className="text-xs opacity-70">{new Date(health.timestamp).toLocaleString()}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
