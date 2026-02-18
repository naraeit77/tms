'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import * as d3 from 'd3'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ZoomIn, ZoomOut, Maximize2, X } from 'lucide-react'

interface ExecutionPlanStep {
  id: number
  operation: string
  options?: string
  object_name?: string
  object_type?: string
  cost: number
  cardinality: number
  bytes: number
  cpu_cost: number
  io_cost: number
  depth: number
  position: number
  parent_id?: number
  access_predicates?: string
  filter_predicates?: string
  time: number
  partition_start?: string
  partition_stop?: string
}

interface ExecutionPlanTreeProps {
  steps: ExecutionPlanStep[]
  width?: number
  height?: number
  onNodeClick?: (step: ExecutionPlanStep) => void
}

interface TreeNode {
  id: number
  name: string
  operation: string
  object_name?: string
  cost: number
  cardinality: number
  bytes: number
  cpu_cost: number
  io_cost: number
  time: number
  access_predicates?: string
  filter_predicates?: string
  children?: TreeNode[]
  data: ExecutionPlanStep
}

// 실행 계획 단계를 트리 구조로 변환
function buildTree(steps: ExecutionPlanStep[]): TreeNode | null {
  if (steps.length === 0) return null

  const sortedSteps = [...steps].sort((a, b) => a.id - b.id)
  const nodeMap = new Map<number, TreeNode>()

  // 모든 노드 생성
  sortedSteps.forEach(step => {
    nodeMap.set(step.id, {
      id: step.id,
      name: step.operation + (step.options ? ` ${step.options}` : ''),
      operation: step.operation,
      object_name: step.object_name,
      cost: step.cost,
      cardinality: step.cardinality,
      bytes: step.bytes,
      cpu_cost: step.cpu_cost,
      io_cost: step.io_cost,
      time: step.time,
      access_predicates: step.access_predicates,
      filter_predicates: step.filter_predicates,
      children: [],
      data: step
    })
  })

  // 부모-자식 관계 설정
  let root: TreeNode | null = null
  sortedSteps.forEach(step => {
    const node = nodeMap.get(step.id)!
    if (step.parent_id !== undefined && step.parent_id !== null) {
      const parent = nodeMap.get(step.parent_id)
      if (parent) {
        parent.children = parent.children || []
        parent.children.push(node)
      }
    } else if (step.id === 0 || !root) {
      root = node
    }
  })

  // 루트가 없으면 첫 번째 노드를 루트로
  if (!root && sortedSteps.length > 0) {
    root = nodeMap.get(sortedSteps[0].id)!
  }

  return root
}

// 비용에 따른 색상 반환
function getCostColor(cost: number, maxCost: number): string {
  const percentage = maxCost > 0 ? (cost / maxCost) * 100 : 0
  if (percentage > 70) return '#ef4444' // red
  if (percentage > 40) return '#f97316' // orange
  if (percentage > 20) return '#eab308' // yellow
  return '#22c55e' // green
}

// 연산 유형에 따른 아이콘 색상
function getOperationColor(operation: string): string {
  if (operation.includes('TABLE ACCESS FULL')) return '#ef4444'
  if (operation.includes('TABLE ACCESS')) return '#3b82f6'
  if (operation.includes('INDEX')) return '#22c55e'
  if (operation.includes('HASH JOIN')) return '#a855f7'
  if (operation.includes('NESTED LOOPS')) return '#ec4899'
  if (operation.includes('MERGE JOIN')) return '#8b5cf6'
  if (operation.includes('SORT')) return '#f59e0b'
  if (operation.includes('FILTER')) return '#6366f1'
  return '#6b7280'
}

export function ExecutionPlanTree({
  steps,
  width = 900,
  height = 600,
  onNodeClick
}: ExecutionPlanTreeProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null)
  const [transform, setTransform] = useState({ k: 1, x: 0, y: 0 })

  const treeData = useMemo(() => buildTree(steps), [steps])
  const maxCost = useMemo(() => Math.max(...steps.map(s => s.cost), 1), [steps])

  useEffect(() => {
    if (!svgRef.current || !treeData) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 40, right: 120, bottom: 40, left: 80 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    // 줌 기능 설정
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
        setTransform(event.transform)
      })

    svg.call(zoom)

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    // 트리 레이아웃 생성
    const treeLayout = d3.tree<TreeNode>()
      .size([innerHeight, innerWidth])
      .separation((a, b) => (a.parent === b.parent ? 1.5 : 2))

    const root = d3.hierarchy(treeData)
    const treeNodes = treeLayout(root)

    // 링크 (연결선) 그리기
    const linkGenerator = d3.linkHorizontal<d3.HierarchyPointLink<TreeNode>, d3.HierarchyPointNode<TreeNode>>()
      .x(d => d.y)
      .y(d => d.x)

    g.selectAll('.link')
      .data(treeNodes.links())
      .join('path')
      .attr('class', 'link')
      .attr('d', linkGenerator as any)
      .attr('fill', 'none')
      .attr('stroke', '#94a3b8')
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.6)

    // 노드 그룹 생성
    const nodeGroups = g.selectAll('.node')
      .data(treeNodes.descendants())
      .join('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${d.y},${d.x})`)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation()
        setSelectedNode(d.data)
        if (onNodeClick) {
          onNodeClick(d.data.data)
        }
      })
      .on('mouseenter', function(event, d) {
        d3.select(this).select('rect')
          .transition()
          .duration(200)
          .attr('stroke-width', 3)
          .attr('filter', 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))')
      })
      .on('mouseleave', function(event, d) {
        d3.select(this).select('rect')
          .transition()
          .duration(200)
          .attr('stroke-width', 2)
          .attr('filter', 'none')
      })

    // 노드 배경 (라운드 사각형)
    nodeGroups.append('rect')
      .attr('x', -70)
      .attr('y', -25)
      .attr('width', 140)
      .attr('height', 50)
      .attr('rx', 8)
      .attr('ry', 8)
      .attr('fill', 'white')
      .attr('stroke', d => getOperationColor(d.data.operation))
      .attr('stroke-width', 2)

    // 비용 표시 바
    nodeGroups.append('rect')
      .attr('x', -70)
      .attr('y', 20)
      .attr('width', d => {
        const percentage = maxCost > 0 ? (d.data.cost / maxCost) : 0
        return Math.max(140 * percentage, 5)
      })
      .attr('height', 5)
      .attr('rx', 2)
      .attr('ry', 2)
      .attr('fill', d => getCostColor(d.data.cost, maxCost))

    // 연산 이름
    nodeGroups.append('text')
      .attr('dy', -5)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('fill', '#1f2937')
      .text(d => {
        const op = d.data.operation
        return op.length > 18 ? op.substring(0, 16) + '...' : op
      })

    // 객체 이름
    nodeGroups.append('text')
      .attr('dy', 10)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .attr('fill', '#6b7280')
      .text(d => {
        const obj = d.data.object_name || ''
        return obj.length > 16 ? obj.substring(0, 14) + '...' : obj
      })

    // 초기 줌 위치 조정
    const initialTransform = d3.zoomIdentity
      .translate(margin.left, margin.top)
      .scale(0.9)
    svg.call(zoom.transform, initialTransform)

  }, [treeData, width, height, maxCost, onNodeClick])

  const handleZoomIn = () => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.transition().duration(300).call(
      d3.zoom<SVGSVGElement, unknown>().scaleBy as any,
      1.3
    )
  }

  const handleZoomOut = () => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.transition().duration(300).call(
      d3.zoom<SVGSVGElement, unknown>().scaleBy as any,
      0.7
    )
  }

  const handleResetZoom = () => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.transition().duration(500).call(
      d3.zoom<SVGSVGElement, unknown>().transform as any,
      d3.zoomIdentity.translate(80, 40).scale(0.9)
    )
  }

  if (!treeData) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        실행 계획 데이터가 없습니다.
      </div>
    )
  }

  return (
    <div className="relative" ref={containerRef}>
      {/* 줌 컨트롤 */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-1">
        <Button variant="outline" size="icon" onClick={handleZoomIn} title="확대">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={handleZoomOut} title="축소">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={handleResetZoom} title="초기화">
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* 범례 */}
      <div className="absolute top-4 left-4 z-10 bg-background/95 backdrop-blur border rounded-lg p-3 shadow-lg">
        <div className="text-xs font-semibold mb-2">연산 유형</div>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#ef4444' }} />
            <span>Full Table Scan</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#22c55e' }} />
            <span>Index Scan</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#a855f7' }} />
            <span>Hash Join</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#ec4899' }} />
            <span>Nested Loops</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: '#f59e0b' }} />
            <span>Sort</span>
          </div>
        </div>
        <div className="text-xs font-semibold mt-3 mb-2">비용 레벨</div>
        <div className="flex items-center gap-1 text-xs">
          <div className="w-6 h-2 rounded" style={{ backgroundColor: '#22c55e' }} />
          <div className="w-6 h-2 rounded" style={{ backgroundColor: '#eab308' }} />
          <div className="w-6 h-2 rounded" style={{ backgroundColor: '#f97316' }} />
          <div className="w-6 h-2 rounded" style={{ backgroundColor: '#ef4444' }} />
          <span className="ml-1">낮음 → 높음</span>
        </div>
      </div>

      {/* SVG 차트 */}
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="bg-gray-50 dark:bg-gray-900 rounded-lg border"
        style={{ cursor: 'grab' }}
      />

      {/* 선택된 노드 상세 정보 */}
      {selectedNode && (
        <Card className="absolute bottom-4 left-4 right-4 z-10 shadow-xl max-w-xl">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="font-semibold text-lg">{selectedNode.operation}</h4>
                {selectedNode.object_name && (
                  <p className="text-sm text-muted-foreground">{selectedNode.object_name}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedNode(null)}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Cost</div>
                <div className="font-mono font-semibold">{selectedNode.cost.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Cardinality</div>
                <div className="font-mono font-semibold">{selectedNode.cardinality.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Bytes</div>
                <div className="font-mono font-semibold">{(selectedNode.bytes / 1024).toFixed(1)}KB</div>
              </div>
              <div>
                <div className="text-muted-foreground">Time</div>
                <div className="font-mono font-semibold">{(selectedNode.time / 1000).toFixed(2)}s</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
              <div>
                <div className="text-muted-foreground">CPU Cost</div>
                <div className="font-mono">{selectedNode.cpu_cost.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-muted-foreground">I/O Cost</div>
                <div className="font-mono">{selectedNode.io_cost.toLocaleString()}</div>
              </div>
            </div>

            {(selectedNode.access_predicates || selectedNode.filter_predicates) && (
              <div className="mt-3 pt-3 border-t space-y-2">
                {selectedNode.access_predicates && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Access Predicates</div>
                    <code className="text-xs bg-muted p-1.5 rounded block overflow-x-auto">
                      {selectedNode.access_predicates}
                    </code>
                  </div>
                )}
                {selectedNode.filter_predicates && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Filter Predicates</div>
                    <code className="text-xs bg-muted p-1.5 rounded block overflow-x-auto">
                      {selectedNode.filter_predicates}
                    </code>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
