'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Database,
  Info,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ArrowRight,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type {
  IndexCreationDiagram as IDiagram,
  DiagramNode,
  DiagramColumn,
} from '@/domain/query-artifacts'

interface IndexCreationDiagramProps {
  diagram: IDiagram
  width?: number
  height?: number
  onNodeClick?: (node: DiagramNode) => void
  onColumnClick?: (node: DiagramNode, column: DiagramColumn) => void
  className?: string
}

// 인덱스 포인트 필터링
function filterIndexableColumns(columns: DiagramColumn[]): DiagramColumn[] {
  return columns.filter(col =>
    col.conditionType === 'WHERE' ||
    col.conditionType === 'JOIN' ||
    col.conditionType === 'ORDER_BY' ||
    col.conditionType === 'GROUP_BY'
  )
}

// 노드 위치 계산 (수평 배치)
function calculateNodePositions(nodes: DiagramNode[], width: number, height: number) {
  const nodeRadius = 65
  const nodeCount = nodes.length
  const padding = nodeRadius + 80 // 좌우 여백 (원 반지름 + 추가 여백)

  const availableWidth = width - padding * 2 // 양쪽 패딩 제외
  const minSpacing = 150
  const maxSpacing = 300

  // 실제 간격 계산 (최소/최대 간격 제한)
  let spacing = nodeCount > 1
    ? availableWidth / (nodeCount - 1)
    : 0

  // 간격 제한 적용
  spacing = Math.max(minSpacing, Math.min(maxSpacing, spacing))

  const totalWidth = (nodeCount - 1) * spacing
  const startX = padding + Math.max(0, (availableWidth - totalWidth) / 2)
  const centerY = height / 2 + 20 // 상단에 여유 공간 확보

  return nodes.map((node, index) => ({
    ...node,
    x: startX + index * spacing,
    y: centerY,
    radius: nodeRadius,
    indexableColumns: filterIndexableColumns(node.columns || []),
  }))
}

/**
 * 단순화된 인덱스 생성도 - 원형 다이어그램 스타일
 */
export function IndexCreationDiagram({
  diagram,
  width = 800,
  height = 400,
  onNodeClick,
  onColumnClick,
  className = '',
}: IndexCreationDiagramProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(width)
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // 고정 높이 사용 (무한 루프 방지)
  const fixedHeight = Math.max(height, 350)

  // 노드 위치 계산
  const layoutData = useMemo(() => {
    if (!diagram.nodes.length) return { nodes: [], edges: [] }

    const nodes = calculateNodePositions(diagram.nodes, containerWidth, fixedHeight - 50)

    // 엣지에 소스/타겟 노드 정보 추가
    let edges = diagram.edges.map(edge => {
      const sourceNode = nodes.find(n => n.id === edge.sourceNodeId)
      const targetNode = nodes.find(n => n.id === edge.targetNodeId)

      // 조인 컬럼 찾기
      const sourceJoinCol = sourceNode?.indexableColumns.find(c => c.conditionType === 'JOIN')
      const targetJoinCol = targetNode?.indexableColumns.find(c => c.conditionType === 'JOIN')

      return {
        ...edge,
        sourceNode,
        targetNode,
        sourceJoinColumn: sourceJoinCol,
        targetJoinColumn: targetJoinCol,
      }
    })

    // 엣지가 없거나 부족한 경우: 노드 순서대로 자동 연결 (서브쿼리/인라인뷰 지원)
    if (nodes.length > 1 && edges.length < nodes.length - 1) {
      const autoEdges = []
      for (let i = 0; i < nodes.length - 1; i++) {
        const sourceNode = nodes[i]
        const targetNode = nodes[i + 1]

        // 이미 해당 연결이 있는지 확인
        const existingEdge = edges.find(
          e => (e.sourceNode?.id === sourceNode.id && e.targetNode?.id === targetNode.id) ||
               (e.sourceNode?.id === targetNode.id && e.targetNode?.id === sourceNode.id)
        )

        if (!existingEdge) {
          // 조인 컬럼 찾기 (JOIN 타입 우선, 없으면 WHERE 또는 다른 조건 컬럼)
          const sourceJoinCol = sourceNode.indexableColumns.find(c => c.conditionType === 'JOIN')
            || sourceNode.indexableColumns[0]
          const targetJoinCol = targetNode.indexableColumns.find(c => c.conditionType === 'JOIN')
            || targetNode.indexableColumns[0]

          // 공통 컬럼명 찾기 (양쪽에 같은 이름의 컬럼이 있으면 연결 컬럼으로 간주)
          const commonColumn = sourceNode.indexableColumns.find(sc =>
            targetNode.indexableColumns.some(tc =>
              tc.name.toUpperCase() === sc.name.toUpperCase()
            )
          )

          // 연결 컬럼 결정: 공통 컬럼 > JOIN 컬럼 > 첫번째 조건 컬럼 > 테이블명 기반
          let finalSourceCol = commonColumn || sourceJoinCol
          let finalTargetCol = commonColumn
            ? targetNode.indexableColumns.find(tc => tc.name.toUpperCase() === commonColumn.name.toUpperCase())
            : targetJoinCol

          // 컬럼이 없는 경우: 타겟 테이블명이 소스의 컬럼명과 일치하는지 확인 (서브쿼리 패턴)
          if (!finalSourceCol && !finalTargetCol) {
            // 타겟 테이블명이 소스 노드의 컬럼 중 하나와 일치하는지 확인
            const matchingSourceCol = sourceNode.indexableColumns.find(c =>
              c.name.toUpperCase() === targetNode.tableName.toUpperCase()
            )
            if (matchingSourceCol) {
              finalSourceCol = matchingSourceCol
              finalTargetCol = { name: targetNode.tableName, conditionType: 'JOIN' } as DiagramColumn
            }

            // 소스 테이블명이 타겟 노드의 컬럼 중 하나와 일치하는지 확인
            const matchingTargetCol = targetNode.indexableColumns.find(c =>
              c.name.toUpperCase() === sourceNode.tableName.toUpperCase()
            )
            if (!finalSourceCol && matchingTargetCol) {
              finalSourceCol = { name: sourceNode.tableName, conditionType: 'JOIN' } as DiagramColumn
              finalTargetCol = matchingTargetCol
            }
          }

          // 여전히 컬럼이 없으면: 이전/다음 노드의 indexableColumns에서 현재 연결 관계 찾기
          if (!finalSourceCol && !finalTargetCol) {
            // 소스 노드에서 타겟과 관련된 컬럼명 찾기
            const sourceColMatchingTarget = sourceNode.indexableColumns.find(c =>
              c.name.toUpperCase().includes(targetNode.tableName.toUpperCase().replace(/S$/, '')) ||
              targetNode.tableName.toUpperCase().includes(c.name.toUpperCase().replace(/_ID$/i, ''))
            )
            if (sourceColMatchingTarget) {
              finalSourceCol = sourceColMatchingTarget
              finalTargetCol = { name: sourceColMatchingTarget.name, conditionType: 'JOIN' } as DiagramColumn
            }
          }

          // 최종 폴백: 전체 노드에서 타겟 테이블명과 일치하는 컬럼 찾기
          if (!finalSourceCol && !finalTargetCol) {
            // 모든 이전 노드들에서 타겟과 관련된 컬럼 찾기
            for (let j = 0; j < i; j++) {
              const prevNode = nodes[j]
              const matchingCol = prevNode.indexableColumns.find(c =>
                c.name.toUpperCase() === targetNode.tableName.toUpperCase() ||
                c.name.toUpperCase().replace(/_ID$/i, '') === targetNode.tableName.toUpperCase().replace(/_ID$/i, '')
              )
              if (matchingCol) {
                finalSourceCol = { name: matchingCol.name, conditionType: 'JOIN' } as DiagramColumn
                finalTargetCol = { name: matchingCol.name, conditionType: 'JOIN' } as DiagramColumn
                break
              }
            }
          }

          // 마지막 폴백: 소스 또는 타겟 테이블명 자체를 연결 레이블로 사용 (서브쿼리 출력 컬럼)
          if (!finalSourceCol && !finalTargetCol) {
            // 소스 테이블명이 컬럼처럼 보이면 (예: SALES_REP_ID, ORDER_DATE 등)
            // 서브쿼리에서 SELECT된 컬럼들이 노드로 표시된 경우
            if (sourceNode.tableName && sourceNode.indexableColumns.length === 0) {
              finalSourceCol = { name: sourceNode.tableName, conditionType: 'JOIN' } as DiagramColumn
            }
            // 타겟 테이블명도 마찬가지
            if (targetNode.tableName && targetNode.indexableColumns.length === 0) {
              finalTargetCol = { name: targetNode.tableName, conditionType: 'JOIN' } as DiagramColumn
            }
          }

          autoEdges.push({
            id: `auto-edge-${i}`,
            sourceNodeId: sourceNode.id,
            targetNodeId: targetNode.id,
            joinType: targetNode.type === 'OUTER' ? 'LEFT_OUTER' : 'INNER',
            lineStyle: targetNode.type === 'OUTER' ? 'DASHED' : 'SOLID',
            sourceNode,
            targetNode,
            sourceJoinColumn: finalSourceCol,
            targetJoinColumn: finalTargetCol,
          })
        }
      }
      edges = [...edges, ...autoEdges]
    }

    return { nodes, edges }
  }, [diagram, containerWidth, fixedHeight])

  // 전체 인덱스 포인트 번호 매기기
  const indexPointsMap = useMemo(() => {
    const map = new Map<string, number>()
    let pointNumber = 1

    layoutData.nodes.forEach(node => {
      node.indexableColumns.forEach(col => {
        const key = `${node.id}-${col.id || col.name}`
        map.set(key, pointNumber++)
      })
    })

    return map
  }, [layoutData.nodes])

  // 인덱스 포인트가 없는 경우 체크
  const hasNoIndexPoints = useMemo(() => {
    return layoutData.nodes.reduce((sum, n) => sum + n.indexableColumns.length, 0) === 0
  }, [layoutData.nodes])

  // Resize observer - 너비만 추적 (무한 루프 방지)
  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      const { width: w } = entries[0].contentRect
      if (w > 0) {
        setContainerWidth(w)
      }
    })

    resizeObserver.observe(containerRef.current)
    return () => resizeObserver.disconnect()
  }, [])

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setTransform(prev => ({ ...prev, scale: Math.min(prev.scale * 1.2, 3) }))
  }, [])

  const handleZoomOut = useCallback(() => {
    setTransform(prev => ({ ...prev, scale: Math.max(prev.scale / 1.2, 0.5) }))
  }, [])

  const handleReset = useCallback(() => {
    setTransform({ x: 0, y: 0, scale: 1 })
  }, [])

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    setIsDragging(true)
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y })
  }, [transform])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    setTransform(prev => ({
      ...prev,
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    }))
  }, [isDragging, dragStart])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // 한계 안내 렌더링
  if (hasNoIndexPoints) {
    return (
      <Card className={`${className} overflow-hidden`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Database className="h-5 w-5 text-indigo-500" />
            인덱스 생성도
            <Badge variant="outline" className="text-xs">
              {diagram.nodes.length} 테이블
            </Badge>
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {diagram.nodes.length > 0 && (
            <div className="flex items-center gap-3 p-4 bg-slate-500/10 rounded-lg border border-slate-500/20">
              <div className="w-16 h-16 rounded-full bg-slate-500 flex items-center justify-center">
                <span className="text-white font-bold text-sm text-center px-1">
                  {diagram.nodes[0].tableName}
                </span>
              </div>
              <div>
                <h3 className="font-semibold text-lg">{diagram.nodes[0].tableName}</h3>
                <p className="text-sm text-muted-foreground">조건 컬럼 없음</p>
              </div>
            </div>
          )}

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>인덱스 분석 대상 없음</AlertTitle>
            <AlertDescription>
              <p className="text-sm text-muted-foreground">
                인덱스 생성도는 <strong>WHERE, JOIN, ORDER BY, GROUP BY</strong> 조건을 기반으로 분석합니다.
              </p>
            </AlertDescription>
          </Alert>

          <div className="p-4 bg-muted/50 rounded-lg border">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              분석에 적합한 SQL 예시
            </h4>
            <pre className="text-xs text-muted-foreground bg-slate-900 p-3 rounded overflow-x-auto">
{`SELECT e.*, d.department_name
FROM employees e
JOIN departments d ON e.department_id = d.department_id
WHERE d.location_id = 1700`}
            </pre>
          </div>
        </CardContent>
      </Card>
    )
  }

  // 전체 카드 높이 = 헤더(약 60px) + 컨텐츠(fixedHeight) + 패딩
  const totalHeight = fixedHeight + 70

  return (
    <Card className={`${className} overflow-hidden`} style={{ height: `${totalHeight}px` }}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Database className="h-5 w-5 text-indigo-500" />
            인덱스 생성도
            <Badge variant="outline" className="text-xs">
              {layoutData.nodes.length} 테이블
            </Badge>
          </CardTitle>

          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomIn}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>확대</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomOut}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>축소</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleReset}>
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>초기화</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 overflow-hidden">
        <div
          ref={containerRef}
          className="relative w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900/50 dark:to-slate-800/50"
          style={{ height: `${fixedHeight}px`, cursor: isDragging ? 'grabbing' : 'grab' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* 테이블 접근 방향 안내 - 좌측 상단 고정 */}
          {layoutData.nodes.length > 1 && (
            <div className="absolute top-3 left-3 flex items-center gap-2 text-sm text-slate-500 bg-white/90 dark:bg-slate-800/90 px-3 py-1.5 rounded-md border shadow-sm z-10">
              <span className="font-medium">테이블 접근 방향</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          )}

          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            viewBox={`0 0 ${containerWidth} ${fixedHeight}`}
            className="select-none"
          >
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
              </marker>
              <marker
                id="arrow-outer"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#a78bfa" />
              </marker>
            </defs>

            {/* Transform group */}
            <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
              {/* 연결선 (조인) */}
              {layoutData.edges.map((edge, idx) => {
                if (!edge.sourceNode || !edge.targetNode) return null

                const source = edge.sourceNode
                const target = edge.targetNode
                const isOuter = edge.lineStyle === 'DASHED' || edge.joinType?.includes('OUTER')

                // 연결선 좌표
                const x1 = source.x + source.radius
                const y1 = source.y
                const x2 = target.x - target.radius
                const y2 = target.y
                const midX = (x1 + x2) / 2
                const midY = (y1 + y2) / 2

                // 조인 컬럼명 찾기
                const sourceCol = edge.sourceJoinColumn
                const targetCol = edge.targetJoinColumn

                // 연결 컬럼 표시 텍스트 생성
                let connectionLabel = ''
                if (sourceCol?.name && targetCol?.name) {
                  if (sourceCol.name.toUpperCase() === targetCol.name.toUpperCase()) {
                    // 같은 컬럼명이면 하나만 표시
                    connectionLabel = sourceCol.name
                  } else {
                    // 다른 컬럼명이면 타겟 컬럼만 표시 (연결되는 대상 표시)
                    connectionLabel = targetCol.name
                  }
                } else if (targetCol?.name) {
                  // 타겟 컬럼만 있으면 그것을 표시
                  connectionLabel = targetCol.name
                } else if (sourceCol?.name) {
                  // 소스 컬럼만 있으면 그것을 표시
                  connectionLabel = sourceCol.name
                }

                const labelWidth = Math.max(connectionLabel.length * 7 + 16, 60)

                return (
                  <g key={`edge-${idx}`}>
                    {/* 연결선 */}
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={isOuter ? '#a78bfa' : '#64748b'}
                      strokeWidth="2.5"
                      strokeDasharray={isOuter ? '8,4' : 'none'}
                      markerEnd={isOuter ? 'url(#arrow-outer)' : 'url(#arrow)'}
                    />

                    {/* 조인 컬럼 표시 (연결선 위) */}
                    {connectionLabel && (
                      <g transform={`translate(${midX}, ${midY - 20})`}>
                        <rect
                          x={-labelWidth / 2}
                          y="-12"
                          width={labelWidth}
                          height="24"
                          rx="4"
                          fill="white"
                          stroke="#e2e8f0"
                          className="dark:fill-slate-700 dark:stroke-slate-600"
                        />
                        <text
                          textAnchor="middle"
                          dy="4"
                          fill="#334155"
                          fontSize="10"
                          fontWeight="500"
                          className="dark:fill-slate-300"
                        >
                          {connectionLabel}
                        </text>
                      </g>
                    )}
                  </g>
                )
              })}

              {/* 테이블 노드 */}
              {layoutData.nodes.map((node) => {
                const isOuter = node.type === 'OUTER'
                const allColumns = node.indexableColumns

                // 노드 타입 결정: indexableColumns가 있으면 실제 테이블, 없으면 서브쿼리/인라인뷰 컬럼
                const hasConditionColumns = allColumns.length > 0
                // 테이블명이 컬럼 패턴(대문자_대문자)이면 서브쿼리, 아니면 인라인뷰로 추정
                const looksLikeColumn = /^[A-Z]+(_[A-Z]+)*$/i.test(node.tableName)
                const nodeTypeLabel = hasConditionColumns
                  ? 'Table'
                  : looksLikeColumn
                    ? 'SubQuery'
                    : 'View'

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    className="cursor-pointer"
                    onClick={() => onNodeClick?.(node)}
                  >
                    {/* 테이블 원 */}
                    <circle
                      r={node.radius}
                      fill="white"
                      stroke={isOuter ? '#a78bfa' : '#64748b'}
                      strokeWidth="2.5"
                      strokeDasharray={isOuter ? '8,4' : 'none'}
                      className="dark:fill-slate-800 hover:fill-slate-50 dark:hover:fill-slate-700 transition-colors"
                    />

                    {/* 테이블명 */}
                    <text
                      textAnchor="middle"
                      dy="-2"
                      fill="#1e293b"
                      fontSize="14"
                      fontWeight="600"
                      className="dark:fill-white pointer-events-none"
                    >
                      {node.tableName}
                    </text>

                    {/* 노드 타입 라벨 (Table, SubQuery, View) */}
                    <text
                      textAnchor="middle"
                      dy="16"
                      fill="#3b82f6"
                      fontSize="10"
                      fontWeight="500"
                      className="pointer-events-none"
                    >
                      {nodeTypeLabel}
                    </text>

                    {/* 조건 컬럼명 (상단에 표시) */}
                    {allColumns.length > 0 && (
                      <text
                        textAnchor="middle"
                        y={-node.radius - 25}
                        fill="#475569"
                        fontSize="11"
                        fontWeight="500"
                        className="dark:fill-slate-400 pointer-events-none"
                      >
                        {allColumns.map(c => c.name).join(' + ')}
                      </text>
                    )}

                    {/* 인덱스 포인트들 (상단에 표시) */}
                    {allColumns.length > 0 && (
                      <g transform={`translate(0, ${-node.radius - 8})`}>
                        {allColumns.map((col, colIdx) => {
                          const totalPoints = allColumns.length
                          const spacing = 28
                          const startX = -((totalPoints - 1) * spacing) / 2
                          const x = startX + colIdx * spacing
                          const pointKey = `${node.id}-${col.id || col.name}`
                          const pointNumber = indexPointsMap.get(pointKey) || colIdx + 1

                          return (
                            <g
                              key={col.id || col.name}
                              transform={`translate(${x}, 0)`}
                              className="cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation()
                                onColumnClick?.(node, col)
                              }}
                            >
                              <circle
                                r="12"
                                fill={col.hasIndex === true ? '#3b82f6' : 'white'}
                                stroke={col.hasIndex === true ? '#3b82f6' : '#ef4444'}
                                strokeWidth="2.5"
                                className="hover:opacity-80 transition-opacity"
                              />
                              <text
                                textAnchor="middle"
                                dy="4"
                                fill={col.hasIndex === true ? 'white' : '#ef4444'}
                                fontSize="11"
                                fontWeight="bold"
                                className="pointer-events-none"
                              >
                                {pointNumber}
                              </text>
                            </g>
                          )
                        })}
                      </g>
                    )}
                  </g>
                )
              })}
            </g>
          </svg>

          {/* 범례 */}
          <div className="absolute bottom-3 left-3 flex items-center gap-4 text-xs text-slate-600 dark:text-slate-400 bg-white/90 dark:bg-slate-900/90 px-3 py-2 rounded-lg border shadow-sm">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                <span className="text-white text-[10px] font-bold">n</span>
              </div>
              <span>인덱스 있음</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center"
                style={{ border: '2.5px solid #ef4444', backgroundColor: 'white' }}
              >
                <span style={{ color: '#ef4444', fontSize: '10px', fontWeight: 'bold' }}>n</span>
              </div>
              <span>인덱스 없음</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg width="24" height="12">
                <line x1="0" y1="6" x2="24" y2="6" stroke="#64748b" strokeWidth="2" />
              </svg>
              <span>INNER JOIN</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg width="24" height="12">
                <line x1="0" y1="6" x2="24" y2="6" stroke="#a78bfa" strokeWidth="2" strokeDasharray="4,2" />
              </svg>
              <span>OUTER JOIN</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
