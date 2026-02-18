'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Database, Key, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react'
import type { DiagramNode, DiagramColumn, ExistingIndex } from '@/domain/query-artifacts'

interface TableDetailPanelProps {
  node: DiagramNode | null
  existingIndexes?: ExistingIndex[]
  className?: string
}

/**
 * Table Detail Panel Component
 * Displays detailed information about a selected table node
 */
export function TableDetailPanel({
  node,
  existingIndexes = [],
  className = '',
}: TableDetailPanelProps) {
  if (!node) {
    return (
      <Card className={`${className} h-full`}>
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-center text-muted-foreground">
            <Database className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>테이블을 선택하면 상세 정보가 표시됩니다</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const tableIndexes = existingIndexes.filter(idx => idx.tableName === node.tableName)

  const getColumnStatusIcon = (column: DiagramColumn) => {
    if (column.hasIndex) {
      return <CheckCircle2 className="w-4 h-4 text-green-500" />
    }
    if (column.isIndexCandidate) {
      return <AlertCircle className="w-4 h-4 text-yellow-500" />
    }
    return <AlertCircle className="w-4 h-4 text-red-500" />
  }

  const getConditionBadgeVariant = (type: string): 'default' | 'secondary' | 'outline' => {
    switch (type) {
      case 'JOIN':
        return 'default'
      case 'WHERE':
        return 'secondary'
      default:
        return 'outline'
    }
  }

  const getSelectivityBadgeClass = (grade: string) => {
    switch (grade) {
      case 'EXCELLENT':
      case 'GOOD':
        return 'text-green-600 border-green-600'
      case 'FAIR':
        return 'text-yellow-600 border-yellow-600'
      default:
        return 'text-red-600 border-red-600'
    }
  }

  return (
    <Card className={`${className} h-full`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="w-5 h-5 text-indigo-500" />
          {node.tableName}
          {node.alias !== node.tableName && (
            <span className="text-muted-foreground text-sm">({node.alias})</span>
          )}
        </CardTitle>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant={node.type === 'INNER' ? 'default' : 'secondary'}>
            {node.type === 'INNER' ? 'INNER' : 'OUTER'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <ScrollArea className="h-[calc(100%-4rem)]">
          {/* Columns Section */}
          <div className="mb-4">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              컬럼 분석 ({node.columns.length}개)
            </h4>
            <div className="space-y-2">
              {node.columns.map((column) => (
                <div
                  key={column.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {getColumnStatusIcon(column)}
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-sm">{column.name}</span>
                        <Badge variant="outline" className="text-xs">
                          #{column.position}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Badge
                          variant={getConditionBadgeVariant(column.conditionType)}
                          className="text-xs"
                        >
                          {column.conditionType}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  {column.selectivityGrade && (
                    <Badge
                      variant="outline"
                      className={getSelectivityBadgeClass(column.selectivityGrade)}
                    >
                      {column.selectivityGrade}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Existing Indexes Section */}
          {tableIndexes.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                <Key className="w-4 h-4" />
                기존 인덱스 ({tableIndexes.length}개)
              </h4>
              <div className="space-y-2">
                {tableIndexes.map((index) => (
                  <div
                    key={index.indexName}
                    className="p-2 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{index.indexName}</span>
                      <div className="flex items-center gap-1">
                        {index.isUnique && (
                          <Badge variant="default" className="text-xs">UNIQUE</Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {index.indexType}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {index.columns
                        .sort((a, b) => a.position - b.position)
                        .map(c => c.columnName)
                        .join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missing Index Suggestions */}
          {node.columns.filter(c => c.isIndexCandidate && !c.hasIndex).length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-2 flex items-center gap-1 text-yellow-600">
                <AlertCircle className="w-4 h-4" />
                인덱스 추천
              </h4>
              <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <p className="text-xs text-muted-foreground mb-2">
                  다음 컬럼에 인덱스를 생성하면 성능이 향상될 수 있습니다:
                </p>
                <div className="flex flex-wrap gap-1">
                  {node.columns
                    .filter(c => c.isIndexCandidate && !c.hasIndex)
                    .map(c => (
                      <Badge key={c.id} variant="secondary" className="text-xs">
                        {c.name}
                      </Badge>
                    ))}
                </div>
              </div>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
