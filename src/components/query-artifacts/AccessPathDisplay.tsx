'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, Database, Hash, Play } from 'lucide-react'
import type { AccessPath } from '@/domain/query-artifacts'

interface AccessPathDisplayProps {
  paths: AccessPath[]
  title?: string
  className?: string
}

/**
 * Access Path Display Component
 * Shows the recommended table access order for query optimization
 */
export function AccessPathDisplay({
  paths,
  title = '권장 테이블 접근 순서',
  className = '',
}: AccessPathDisplayProps) {
  if (paths.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center text-muted-foreground">
            <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">접근 경로 정보가 없습니다</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Play className="w-5 h-5 text-green-500" />
          {title}
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {paths.map((path, index) => (
            <div key={path.nodeId} className="flex items-center gap-2 shrink-0">
              {/* Table Card */}
              <div className="relative">
                {/* Order Number */}
                <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-yellow-500 text-yellow-950 flex items-center justify-center text-xs font-bold shadow-sm">
                  {path.order}
                </div>

                {/* Table Info */}
                <div className="p-3 rounded-lg bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 min-w-[120px]">
                  <div className="flex items-center gap-2 mb-1">
                    <Database className="w-4 h-4 text-indigo-500" />
                    <span className="font-medium text-sm">{path.tableName}</span>
                  </div>

                  {/* Entry Column */}
                  {path.entryColumnName && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Badge variant="outline" className="text-xs py-0">
                        <Hash className="w-3 h-3 mr-0.5" />
                        진입점
                      </Badge>
                      <code className="bg-muted px-1 rounded">{path.entryColumnName}</code>
                    </div>
                  )}

                  {/* Join Column */}
                  {path.joinColumnName && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                      <Badge variant="secondary" className="text-xs py-0">
                        조인
                      </Badge>
                      <code className="bg-muted px-1 rounded">{path.joinColumnName}</code>
                    </div>
                  )}
                </div>
              </div>

              {/* Arrow (except last) */}
              {index < paths.length - 1 && (
                <ArrowRight className="w-5 h-5 text-muted-foreground shrink-0" />
              )}
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="mt-4 pt-3 border-t">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>총 {paths.length}개 테이블</span>
            <span>
              드라이빙 테이블:{' '}
              <Badge variant="default" className="text-xs ml-1">
                {paths[0]?.tableName}
              </Badge>
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
