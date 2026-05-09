'use client';

/**
 * SQL Cluster Distribution Scatter Plot
 * 참조 디자인 기반 로그 스케일 산점도 차트
 * X: Elapsed Time/Exec (ms, log scale)
 * Y: Buffer Gets/Exec (log scale)
 * Size: Executions
 * 드래그 범위 선택 기능 포함
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { PerformancePoint, PerformanceGrade } from '@/types/performance';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, MousePointer2 } from 'lucide-react';

// SQL 등급 정의 (A, B, C, D, F 5등급 - sql-grading.ts 기준)
const SQL_GRADES: Record<PerformanceGrade, {
  color: string;
  bgColor: string;
  label: string;
  description: string;
}> = {
  A: { color: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.1)', label: 'Excellent', description: '최적화된 SQL' },
  B: { color: '#84cc16', bgColor: 'rgba(132, 204, 22, 0.1)', label: 'Good', description: '양호한 SQL' },
  C: { color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.1)', label: 'Average', description: '보통 수준' },
  D: { color: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.1)', label: 'Warning', description: '주의 필요' },
  F: { color: '#dc2626', bgColor: 'rgba(220, 38, 38, 0.2)', label: 'Critical', description: '즉시 튜닝 필요' },
};

interface ScatterPlotProps {
  data: PerformancePoint[];
  width?: number;
  height?: number;
  onPointClick?: (point: PerformancePoint) => void;
  onSelectionChange?: (points: PerformancePoint[]) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  xLabel?: string;
  yLabel?: string;
  showSelectionList?: boolean;
}

// Grade Badge 컴포넌트
const GradeBadge = ({ grade, size = 'normal' }: { grade: PerformanceGrade; size?: 'small' | 'normal' | 'large' }) => {
  const gradeInfo = SQL_GRADES[grade];
  const sizeClasses = size === 'large' ? 'w-8 h-8 text-sm' : size === 'small' ? 'w-5 h-5 text-[10px]' : 'w-6 h-6 text-xs';

  return (
    <div
      className={`${sizeClasses} rounded flex items-center justify-center font-bold flex-shrink-0`}
      style={{ backgroundColor: gradeInfo.bgColor, color: gradeInfo.color, border: `1.5px solid ${gradeInfo.color}` }}
    >
      {grade}
    </div>
  );
};

// 선택된 SQL 리스트 컴포넌트
const SelectedSQLList = ({
  points,
  onClear,
  onPointClick
}: {
  points: PerformancePoint[];
  onClear: () => void;
  onPointClick?: (point: PerformancePoint) => void;
}) => {
  if (points.length === 0) return null;

  return (
    <div className="border-t border-gray-200 bg-gray-50">
      <div className="px-4 py-2 flex items-center justify-between border-b border-gray-200">
        <div className="flex items-center gap-2">
          <MousePointer2 className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-medium text-gray-700">
            선택된 SQL ({points.length}개)
          </span>
        </div>
        <button
          onClick={onClear}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-200 transition-colors"
        >
          <X className="w-3 h-3" />
          선택 해제
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600">등급</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">SQL ID</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">실행 횟수</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Elapsed/Exec</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Buffer/Exec</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {points.map((point) => {
              const executions = Math.max(point.metrics.executions, 1);
              const elapsedPerExec = point.metrics.elapsed_time / executions;
              const bufferPerExec = point.metrics.buffer_gets / executions;

              return (
                <tr
                  key={point.sql_id}
                  className="hover:bg-blue-50 cursor-pointer transition-colors"
                  onClick={() => onPointClick?.(point)}
                >
                  <td className="px-3 py-2">
                    <GradeBadge grade={point.grade} size="small" />
                  </td>
                  <td className="px-3 py-2 font-mono text-blue-600">{point.sql_id}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{executions.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-amber-600 font-medium">{elapsedPerExec.toFixed(2)}ms</td>
                  <td className="px-3 py-2 text-right text-purple-600 font-medium">{Math.round(bufferPerExec).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export function ScatterPlot({
  data,
  width = 800,
  height = 450,
  onPointClick,
  onSelectionChange,
  showSelectionList = true,
}: ScatterPlotProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedGradeFilter, setSelectedGradeFilter] = useState<string>('ALL');
  const [hoveredPoint, setHoveredPoint] = useState<PerformancePoint | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [selectedPoints, setSelectedPoints] = useState<PerformancePoint[]>([]);
  const [dragInfo, setDragInfo] = useState<{ count: number; x: number; y: number } | null>(null);

  // 콜백을 ref에 보관하여 effect 재실행 방지
  const onPointClickRef = useRef(onPointClick);
  const onSelectionChangeRef = useRef(onSelectionChange);
  useEffect(() => { onPointClickRef.current = onPointClick; }, [onPointClick]);
  useEffect(() => { onSelectionChangeRef.current = onSelectionChange; }, [onSelectionChange]);

  // 선택 상태를 ref로도 보관 (리렌더 없이 D3에서 참조)
  const selectedIdsRef = useRef<Set<string>>(new Set());

  // 스케일 참조 저장
  const scalesRef = useRef<{
    xScale: d3.ScaleLogarithmic<number, number>;
    yScale: d3.ScaleLogarithmic<number, number>;
    margin: { top: number; right: number; bottom: number; left: number };
    processedData: Array<PerformancePoint & { elapsedPerExec: number; bufferPerExec: number; executions: number }>;
  } | null>(null);

  // 필터링된 데이터
  const filteredData = useMemo(() => {
    if (selectedGradeFilter === 'ALL') return data;
    return data.filter(d => d.grade === selectedGradeFilter);
  }, [data, selectedGradeFilter]);

  // 등급별 통계
  const gradeStats = useMemo(() => {
    return data.reduce((acc, point) => {
      acc[point.grade] = (acc[point.grade] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [data]);

  // 선택 해제
  const clearSelection = useCallback(() => {
    selectedIdsRef.current = new Set();
    setSelectedPoints([]);
    onSelectionChangeRef.current?.([]);
  }, []);

  useEffect(() => {
    if (!svgRef.current || !filteredData.length) return;

    // Clear previous chart
    d3.select(svgRef.current).selectAll('*').remove();

    const margin = { top: 40, right: 30, bottom: 50, left: 80 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // 데이터 변환 - Elapsed Time/Exec (ms) 와 Buffer Gets/Exec
    const processedData = filteredData.map(d => {
      const executions = Math.max(d.metrics.executions, 1);
      const elapsedPerExec = d.metrics.elapsed_time / executions; // ms
      const bufferPerExec = d.metrics.buffer_gets / executions;

      return {
        ...d,
        elapsedPerExec: Math.max(elapsedPerExec, 0.001), // 최소값 설정
        bufferPerExec: Math.max(bufferPerExec, 1),
        executions,
      };
    });

    // 로그 스케일 설정
    const xExtent = d3.extent(processedData, d => d.elapsedPerExec) as [number, number];
    const yExtent = d3.extent(processedData, d => d.bufferPerExec) as [number, number];

    const xScale = d3.scaleLog()
      .domain([Math.max(0.1, xExtent[0] * 0.5), xExtent[1] * 2])
      .range([0, innerWidth])
      .clamp(true);

    const yScale = d3.scaleLog()
      .domain([Math.max(1, yExtent[0] * 0.5), yExtent[1] * 2])
      .range([innerHeight, 0])
      .clamp(true);

    // 스케일 참조 저장
    scalesRef.current = { xScale, yScale, margin, processedData };

    // 버블 크기 스케일 (실행 횟수 기반)
    const sizeExtent = d3.extent(processedData, d => d.executions) as [number, number];
    const sizeScale = d3.scaleSqrt()
      .domain([sizeExtent[0], sizeExtent[1]])
      .range([6, 25]);

    // 그리드 라인 - 로그 스케일에 맞는 tick 값 생성
    const xTicks = xScale.ticks(5);
    const yTickValues = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000].filter(v => {
      const domain = yScale.domain();
      return v >= domain[0] && v <= domain[1];
    });
    const yTicks = yTickValues;

    // X 그리드
    g.append('g')
      .attr('class', 'grid-x')
      .selectAll('line')
      .data(xTicks)
      .join('line')
      .attr('x1', d => xScale(d))
      .attr('x2', d => xScale(d))
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', '#e5e7eb')
      .attr('stroke-dasharray', '3,3')
      .attr('stroke-opacity', 0.7);

    // Y 그리드
    g.append('g')
      .attr('class', 'grid-y')
      .selectAll('line')
      .data(yTicks)
      .join('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', d => yScale(d))
      .attr('y2', d => yScale(d))
      .attr('stroke', '#e5e7eb')
      .attr('stroke-dasharray', '3,3')
      .attr('stroke-opacity', 0.7);

    // X축
    const xAxis = d3.axisBottom(xScale)
      .ticks(5)
      .tickFormat(d => {
        const val = d as number;
        if (val >= 1000000) return `${(val / 1000000).toFixed(0)}M`;
        if (val >= 1000) return `${(val / 1000).toFixed(0)}K`;
        if (val >= 1) return val.toFixed(0);
        return val.toFixed(1);
      });

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .attr('color', '#6b7280')
      .selectAll('text')
      .attr('fill', '#4b5563')
      .style('font-size', '11px');

    // X축 라벨
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 40)
      .attr('fill', '#4b5563')
      .style('text-anchor', 'middle')
      .style('font-size', '11px')
      .text('Elapsed Time/Exec (ms, log scale)');

    // Y축 - 로그 스케일에 맞는 tick 값 생성
    const yAxis = d3.axisLeft(yScale)
      .tickValues([1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000].filter(v => {
        const domain = yScale.domain();
        return v >= domain[0] && v <= domain[1];
      }))
      .tickFormat(d => {
        const val = d as number;
        if (val >= 1000000000) return `${(val / 1000000000).toFixed(0)}B`;
        if (val >= 1000000) return `${(val / 1000000).toFixed(0)}M`;
        if (val >= 1000) return `${(val / 1000).toFixed(0)}K`;
        return val.toFixed(0);
      });

    g.append('g')
      .call(yAxis)
      .attr('color', '#6b7280')
      .selectAll('text')
      .attr('fill', '#374151')
      .style('font-size', '12px')
      .style('font-weight', '500');

    // Y축 라벨
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -60)
      .attr('fill', '#4b5563')
      .style('text-anchor', 'middle')
      .style('font-size', '11px')
      .text('Buffer Gets/Exec (log scale)');

    // 범례 (상단)
    const legend = svg.append('g')
      .attr('transform', `translate(${margin.left + innerWidth / 2 - 150}, 15)`);

    const grades: PerformanceGrade[] = ['A', 'B', 'C', 'D', 'F'];
    const legendSpacing = 75;

    grades.forEach((grade, i) => {
      const gradeInfo = SQL_GRADES[grade];
      const xPos = i * legendSpacing;

      legend.append('circle')
        .attr('cx', xPos)
        .attr('cy', 0)
        .attr('r', 6)
        .attr('fill', gradeInfo.color);

      legend.append('text')
        .attr('x', xPos + 12)
        .attr('y', 4)
        .attr('fill', '#4b5563')
        .style('font-size', '11px')
        .text(`Grade ${grade}`);
    });

    // 드래그 선택 기능을 위한 변수
    let startX = 0;
    let startY = 0;
    let isDragging = false;
    let hasDragged = false; // 실제로 드래그가 발생했는지 추적
    const DRAG_THRESHOLD = 4; // 드래그 인식 최소 이동 거리(px)

    // 데이터 포인트 그룹 (먼저 추가)
    const pointsGroup = g.append('g').attr('class', 'points-group');

    // 드래그 선택 영역 rect (포인트 위에 배치되지만 이벤트 무시)
    const selectionRect = g.append('rect')
      .attr('class', 'selection-rect')
      .attr('fill', 'rgba(59, 130, 246, 0.15)')
      .attr('stroke', '#3b82f6')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4,2')
      .attr('rx', 2)
      .style('display', 'none')
      .style('pointer-events', 'none'); // 이벤트 무시

    // 데이터 포인트 - 등급별로 그룹화하여 렌더링
    grades.forEach(grade => {
      const gradeData = processedData.filter(d => d.grade === grade);
      const gradeInfo = SQL_GRADES[grade];

      pointsGroup.selectAll(`.point-${grade}`)
        .data(gradeData)
        .join('circle')
        .attr('class', `point point-${grade}`)
        .attr('cx', d => xScale(d.elapsedPerExec))
        .attr('cy', d => yScale(d.bufferPerExec))
        .attr('r', d => sizeScale(d.executions))
        .attr('fill', gradeInfo.color)
        .attr('fill-opacity', 0.7)
        .attr('stroke', gradeInfo.color)
        .attr('stroke-width', 1.5)
        .attr('stroke-opacity', 1)
        .style('pointer-events', 'none'); // 이벤트는 dragArea에서 처리
    });

    // 클릭 위치에서 포인트 찾기 헬퍼 함수
    const findPointAtPosition = (x: number, y: number) => {
      for (const point of processedData) {
        const cx = xScale(point.elapsedPerExec);
        const cy = yScale(point.bufferPerExec);
        const r = sizeScale(point.executions);
        const distance = Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - cy, 2));
        if (distance <= r) {
          return point;
        }
      }
      return null;
    };

    // 드래그 영역을 위한 투명 rect (최상단에 배치하여 모든 이벤트 캡처)
    const dragArea = g.append('rect')
      .attr('class', 'drag-area')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair');

    // 화면좌표(clientX/Y)를 차트 내부좌표로 변환
    const clientToChart = (clientX: number, clientY: number): [number, number] => {
      const svgRect = svgRef.current!.getBoundingClientRect();
      return [
        clientX - svgRect.left - margin.left,
        clientY - svgRect.top - margin.top,
      ];
    };

    // 드래그 중 선택 박스 내 포인트 수 계산 (실시간 표시용)
    const countInRect = (rx: number, ry: number, rw: number, rh: number) => {
      let count = 0;
      for (const d of processedData) {
        const cx = xScale(d.elapsedPerExec);
        const cy = yScale(d.bufferPerExec);
        if (cx >= rx && cx <= rx + rw && cy >= ry && cy <= ry + rh) count++;
      }
      return count;
    };

    // window-level 핸들러: 차트 밖에서 마우스업해도 선택 완료되도록
    const handleWindowMove = (event: MouseEvent) => {
      if (!isDragging) return;
      event.preventDefault();
      const [rawX, rawY] = clientToChart(event.clientX, event.clientY);

      const dx = rawX - startX;
      const dy = rawY - startY;
      if (!hasDragged && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        hasDragged = true;
        // 드래그 시작 확정 → 이전 선택 하이라이트 해제
        pointsGroup.selectAll('.point')
          .attr('fill-opacity', 0.7)
          .attr('stroke-width', 1.5);
      }

      // 차트 영역 밖으로 나가도 차트 경계로 클램프
      const endX = Math.max(0, Math.min(rawX, innerWidth));
      const endY = Math.max(0, Math.min(rawY, innerHeight));

      const rectX = Math.min(startX, endX);
      const rectY = Math.min(startY, endY);
      const rectWidth = Math.abs(endX - startX);
      const rectHeight = Math.abs(endY - startY);

      selectionRect
        .attr('x', rectX)
        .attr('y', rectY)
        .attr('width', rectWidth)
        .attr('height', rectHeight);

      if (hasDragged) {
        const count = countInRect(rectX, rectY, rectWidth, rectHeight);
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (containerRect) {
          setDragInfo({
            count,
            x: event.clientX - containerRect.left + 12,
            y: event.clientY - containerRect.top + 12,
          });
        }
      }
    };

    const handleWindowUp = (event: MouseEvent) => {
      if (!isDragging) return;
      isDragging = false;
      setDragInfo(null);

      window.removeEventListener('mousemove', handleWindowMove);
      window.removeEventListener('mouseup', handleWindowUp);

      const [rawX, rawY] = clientToChart(event.clientX, event.clientY);
      const endX = Math.max(0, Math.min(rawX, innerWidth));
      const endY = Math.max(0, Math.min(rawY, innerHeight));
      const rectX = Math.min(startX, endX);
      const rectY = Math.min(startY, endY);
      const rectWidth = Math.abs(endX - startX);
      const rectHeight = Math.abs(endY - startY);

      // 드래그가 아니면 클릭 처리
      if (!hasDragged) {
        selectionRect.style('display', 'none');
        // SVG 내부에서 mouseup 했을 때만 클릭으로 인식
        const svgRect = svgRef.current!.getBoundingClientRect();
        const insideSvg =
          event.clientX >= svgRect.left && event.clientX <= svgRect.right &&
          event.clientY >= svgRect.top && event.clientY <= svgRect.bottom;

        if (insideSvg) {
          const clickedPoint = findPointAtPosition(endX, endY);
          if (clickedPoint) {
            onPointClickRef.current?.(clickedPoint);
          } else {
            // 빈 영역 클릭 → 선택 해제
            selectedIdsRef.current = new Set();
            setSelectedPoints([]);
            onSelectionChangeRef.current?.([]);
          }
        }
        return;
      }

      // 선택 영역 내의 포인트 찾기 (면적 0이어도 통과 — 선/점도 허용)
      const selected = processedData.filter(d => {
        const cx = xScale(d.elapsedPerExec);
        const cy = yScale(d.bufferPerExec);
        return cx >= rectX && cx <= rectX + rectWidth &&
               cy >= rectY && cy <= rectY + rectHeight;
      });

      // 선택 박스는 계속 표시해서 사용자가 선택 범위를 시각적으로 확인
      selectedIdsRef.current = new Set(selected.map(s => s.sql_id));
      setSelectedPoints(selected);
      onSelectionChangeRef.current?.(selected);
    };

    // 드래그 영역 mousedown — window에 move/up을 붙여 차트 밖에서도 처리
    dragArea.on('mousedown', function (event: MouseEvent) {
      if (event.button !== 0) return; // 좌클릭만
      event.preventDefault();
      isDragging = true;
      hasDragged = false;

      const [x, y] = d3.pointer(event, svgRef.current);
      startX = x - margin.left;
      startY = y - margin.top;

      // 호버 툴팁은 드래그 중 숨김
      setHoveredPoint(null);

      // 기존 선택 박스 초기화
      selectionRect
        .attr('x', startX)
        .attr('y', startY)
        .attr('width', 0)
        .attr('height', 0)
        .style('display', 'block');

      window.addEventListener('mousemove', handleWindowMove);
      window.addEventListener('mouseup', handleWindowUp);
    });

    // 호버 처리 (드래그 중에는 비활성)
    dragArea.on('mousemove', function (event) {
      if (isDragging) return;
      const [x, y] = d3.pointer(event);
      const hoveredPt = findPointAtPosition(x, y);

      if (hoveredPt) {
        pointsGroup.selectAll('.point')
          .attr('stroke-width', (d: any) => d.sql_id === hoveredPt.sql_id ? 3 : 1.5);

        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          setHoveredPoint(hoveredPt);
          setTooltipPos({
            x: event.clientX - rect.left + 15,
            y: event.clientY - rect.top - 10,
          });
        }
        dragArea.style('cursor', 'pointer');
      } else {
        pointsGroup.selectAll('.point').attr('stroke-width', 1.5);
        setHoveredPoint(null);
        dragArea.style('cursor', 'crosshair');
      }
    });

    dragArea.on('mouseleave', function () {
      if (isDragging) return;
      pointsGroup.selectAll('.point').attr('stroke-width', 1.5);
      setHoveredPoint(null);
    });

    // 초기 선택 상태 반영 (effect 재실행 시 하이라이트 복원)
    if (selectedIdsRef.current.size > 0) {
      const ids = selectedIdsRef.current;
      pointsGroup.selectAll('.point')
        .attr('fill-opacity', (d: any) => (ids.has(d.sql_id) ? 0.9 : 0.15))
        .attr('stroke-opacity', (d: any) => (ids.has(d.sql_id) ? 1 : 0.3));
    }

    return () => {
      window.removeEventListener('mousemove', handleWindowMove);
      window.removeEventListener('mouseup', handleWindowUp);
    };
  }, [filteredData, width, height]);

  // 선택 상태 변경 시 포인트 하이라이트 업데이트 (차트 재생성 없이)
  useEffect(() => {
    if (!svgRef.current) return;
    const ids = new Set(selectedPoints.map(p => p.sql_id));
    selectedIdsRef.current = ids;

    const points = d3.select(svgRef.current).selectAll<SVGCircleElement, any>('.point');
    if (ids.size === 0) {
      points.attr('fill-opacity', 0.7).attr('stroke-opacity', 1);
      // 선택이 없으면 선택 박스도 숨김
      d3.select(svgRef.current).select('.selection-rect').style('display', 'none');
    } else {
      points
        .attr('fill-opacity', (d: any) => (ids.has(d.sql_id) ? 0.9 : 0.15))
        .attr('stroke-opacity', (d: any) => (ids.has(d.sql_id) ? 1 : 0.3));
    }
  }, [selectedPoints]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
        <div>
          <h3 className="text-sm font-medium text-gray-900">SQL Cluster Distribution</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            X: Elapsed Time/Exec (log), Y: Buffer Gets/Exec (log), Size: Executions
            <span className="ml-2 text-blue-500">• 드래그하여 범위 선택 (빈 영역 클릭 시 해제)</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">Filter:</span>
          <Select value={selectedGradeFilter} onValueChange={setSelectedGradeFilter}>
            <SelectTrigger className="w-28 h-7 text-xs bg-white border-gray-300">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Grades</SelectItem>
              {(['A', 'B', 'C', 'D', 'F'] as PerformanceGrade[]).map(g => (
                <SelectItem key={g} value={g}>Grade {g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-gray-500">{filteredData.length} SQLs</span>
        </div>
      </div>

      {/* 차트 영역 */}
      <div ref={containerRef} className="p-4 relative bg-white select-none">
        <svg ref={svgRef}></svg>

        {/* 드래그 중 선택 개수 표시 */}
        {dragInfo && (
          <div
            className="absolute pointer-events-none z-40 bg-blue-600 text-white text-xs font-medium px-2 py-1 rounded shadow"
            style={{ left: dragInfo.x, top: dragInfo.y }}
          >
            {dragInfo.count}개 선택 중
          </div>
        )}

        {/* 툴팁 */}
        {hoveredPoint && !dragInfo && (
          <div
            className="absolute bg-white border border-gray-200 rounded-lg p-3 shadow-lg pointer-events-none z-50 max-w-xs"
            style={{ left: tooltipPos.x, top: tooltipPos.y }}
          >
            <div className="flex items-center gap-2 mb-2">
              <GradeBadge grade={hoveredPoint.grade} size="small" />
              <span className="text-blue-600 font-mono text-xs">{hoveredPoint.sql_id}</span>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Executions:</span>
                <span className="text-gray-900 font-medium">{hoveredPoint.metrics.executions.toLocaleString()}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Elapsed/Exec:</span>
                <span className="text-amber-600 font-medium">{(hoveredPoint.metrics.elapsed_time / Math.max(hoveredPoint.metrics.executions, 1)).toFixed(2)}ms</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-gray-500">Buffer/Exec:</span>
                <span className="text-purple-600 font-medium">{Math.round(hoveredPoint.metrics.buffer_gets / Math.max(hoveredPoint.metrics.executions, 1)).toLocaleString()}</span>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400">
              Click for details
            </div>
          </div>
        )}
      </div>

      {/* 선택된 SQL 리스트 */}
      {showSelectionList && (
        <SelectedSQLList
          points={selectedPoints}
          onClear={clearSelection}
          onPointClick={onPointClick}
        />
      )}

      {/* 등급 범례 (하단) */}
      <div className="px-4 py-3 border-t border-gray-200 flex flex-wrap gap-4 justify-center bg-gray-50">
        {(['A', 'B', 'C', 'D', 'F'] as PerformanceGrade[]).map(grade => {
          const gradeInfo = SQL_GRADES[grade];
          const count = gradeStats[grade] || 0;
          return (
            <div key={grade} className="flex items-center gap-2">
              <GradeBadge grade={grade} size="small" />
              <span className="text-xs text-gray-600">{gradeInfo.description}</span>
              {count > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">
                  {count}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
