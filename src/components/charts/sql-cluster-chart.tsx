'use client';

/**
 * SQL Cluster Chart Component - TMS 2.0 Style
 * 다크 테마 기반 SQL 등급별 클러스터 분포 산점도 차트
 * Recharts ScatterChart 기반 + TMS 2.0 디자인 시스템
 * 드래그 범위 선택 기능 포함 (Native DOM 이벤트 + 좌표 계산 방식)
 */

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { X, MousePointer2 } from 'lucide-react';
import {
  SQLGrade,
  SQL_GRADES,
  SQLClusterPoint,
  getGradeInfo,
  WAIT_CLASS_COLORS,
} from '@/lib/sql-grading';

// TMS 2.0 Color palette
const COLORS = {
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  orange: '#f97316',
  pink: '#ec4899',
  gray: '#6b7280',
};

interface SQLClusterChartProps {
  data: SQLClusterPoint[];
  height?: number;
  onSQLClick?: (sql: SQLClusterPoint) => void;
  onSelectionChange?: (sqls: SQLClusterPoint[]) => void;
  selectedGrade?: SQLGrade | 'ALL';
  onGradeFilterChange?: (grade: SQLGrade | 'ALL') => void;
  showLegend?: boolean;
  showGradeStats?: boolean;
  showSelectionList?: boolean;
}

// Grade badge component - TMS 2.0 Style
function GradeBadge({
  grade,
  size = 'normal',
}: {
  grade: SQLGrade;
  size?: 'small' | 'normal' | 'large';
}) {
  const gradeInfo = SQL_GRADES[grade];
  const sizeClasses =
    size === 'large'
      ? 'w-10 h-10 text-lg'
      : size === 'small'
        ? 'w-6 h-6 text-xs'
        : 'w-8 h-8 text-sm';

  return (
    <div
      className={`${sizeClasses} rounded-lg flex items-center justify-center font-bold`}
      style={{
        backgroundColor: `${gradeInfo.color}20`,
        color: gradeInfo.color,
        border: `2px solid ${gradeInfo.color}`,
      }}
    >
      {grade}
    </div>
  );
}

// Custom tooltip for scatter chart - TMS 2.0 Dark Style
function ScatterTooltip({ active, payload }: any) {
  if (!active || !payload || !payload[0]) return null;
  const sql: SQLClusterPoint = payload[0].payload;
  const gradeInfo = getGradeInfo(sql.grade);

  return (
    <div className="bg-gray-900/95 border border-gray-700 rounded-lg p-4 shadow-2xl max-w-sm backdrop-blur-sm">
      <div className="flex items-center gap-3 mb-3 pb-3 border-b border-gray-700">
        <GradeBadge grade={sql.grade} size="normal" />
        <div>
          <span className="text-cyan-400 font-mono text-sm block">{sql.sqlId}</span>
          <span className="text-xs" style={{ color: gradeInfo.color }}>{gradeInfo.label}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-500">Executions:</span>
          <span className="text-white font-medium">{sql.executions.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Elapsed/Exec:</span>
          <span className="text-yellow-400 font-medium">{(sql.elapsedPerExec * 1000).toFixed(1)}ms</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Buffer/Exec:</span>
          <span className="text-purple-400 font-medium">{Math.round(sql.bufferPerExec).toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">CPU Time:</span>
          <span className="text-green-400 font-medium">{sql.cpuSec.toFixed(2)}s</span>
        </div>
        {sql.module && (
          <div className="col-span-2 flex justify-between">
            <span className="text-gray-500">Module:</span>
            <span className="text-green-400">{sql.module}</span>
          </div>
        )}
        {sql.waitClass && (
          <div className="col-span-2 flex justify-between">
            <span className="text-gray-500">Wait Class:</span>
            <span
              className="px-1.5 py-0.5 rounded text-xs"
              style={{
                backgroundColor: `${WAIT_CLASS_COLORS[sql.waitClass] || WAIT_CLASS_COLORS['Other']}20`,
                color: WAIT_CLASS_COLORS[sql.waitClass] || WAIT_CLASS_COLORS['Other'],
              }}
            >
              {sql.waitClass}
            </span>
          </div>
        )}
      </div>
      <div className="mt-3 pt-2 border-t border-gray-700 text-xs text-gray-500 flex items-center gap-1">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
        </svg>
        Click for details
      </div>
    </div>
  );
}

// StatCard component matching TMS 2.0 dashboard
function GradeStatCard({
  grade,
  count,
  isSelected,
  onClick,
}: {
  grade: SQLGrade;
  count: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const info = SQL_GRADES[grade];

  return (
    <button
      onClick={onClick}
      className={`p-3 rounded-lg border transition-all hover:scale-105 ${
        isSelected ? 'ring-2 ring-offset-2 ring-offset-white' : ''
      }`}
      style={{
        backgroundColor: isSelected ? `${info.color}15` : '#f9fafb',
        borderColor: isSelected ? info.color : '#e5e7eb',
        ...(isSelected && { boxShadow: `0 0 20px ${info.color}30` }),
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm"
          style={{
            backgroundColor: `${info.color}20`,
            color: info.color,
            border: `2px solid ${info.color}`,
          }}
        >
          {grade}
        </div>
        <span className="text-2xl font-bold" style={{ color: info.color }}>
          {count}
        </span>
      </div>
      <div className="text-xs text-left" style={{ color: isSelected ? info.color : '#4b5563' }}>
        {info.label}
      </div>
      <div className="text-[10px] text-left text-gray-600 mt-0.5 truncate">
        {info.criteria}
      </div>
    </button>
  );
}

// 선택된 SQL 리스트 컴포넌트
const SelectedSQLList = ({
  points,
  onClear,
  onPointClick
}: {
  points: SQLClusterPoint[];
  onClear: () => void;
  onPointClick?: (point: SQLClusterPoint) => void;
}) => {
  if (points.length === 0) return null;

  return (
    <div className="border-t border-gray-200 bg-gray-50 mt-4 rounded-b-lg">
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
              <th className="px-3 py-2 text-left font-medium text-gray-600">Module</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {points.map((point, idx) => {
              const gradeInfo = getGradeInfo(point.grade);
              return (
                <tr
                  key={`${point.sqlId}-${idx}`}
                  className="hover:bg-blue-50 cursor-pointer transition-colors"
                  onClick={() => onPointClick?.(point)}
                >
                  <td className="px-3 py-2">
                    <div
                      className="w-6 h-6 rounded flex items-center justify-center font-bold text-xs"
                      style={{
                        backgroundColor: `${gradeInfo.color}20`,
                        color: gradeInfo.color,
                        border: `1.5px solid ${gradeInfo.color}`,
                      }}
                    >
                      {point.grade}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-blue-600">{point.sqlId}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{point.executions.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-amber-600 font-medium">{(point.elapsedPerExec * 1000).toFixed(2)}ms</td>
                  <td className="px-3 py-2 text-right text-purple-600 font-medium">{Math.round(point.bufferPerExec).toLocaleString()}</td>
                  <td className="px-3 py-2 text-green-600">{point.module || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Chart margins - must match the ScatterChart margin prop
const CHART_MARGIN = { top: 20, right: 30, bottom: 50, left: 70 };

export function SQLClusterChart({
  data,
  height = 400,
  onSQLClick,
  onSelectionChange,
  selectedGrade = 'ALL',
  onGradeFilterChange,
  showLegend = true,
  showGradeStats = true,
  showSelectionList = true,
}: SQLClusterChartProps) {
  const [internalFilter, setInternalFilter] = useState<SQLGrade | 'ALL'>(selectedGrade);
  const [hoveredGrade, setHoveredGrade] = useState<SQLGrade | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // 드래그 선택 상태 (픽셀 좌표로 관리)
  const [isDragging, setIsDragging] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null);
  const [selectedPoints, setSelectedPoints] = useState<SQLClusterPoint[]>([]);
  const [chartDimensions, setChartDimensions] = useState<{ width: number; height: number } | null>(null);
  const [mouseDownPos, setMouseDownPos] = useState<{ x: number; y: number } | null>(null);

  const activeFilter = onGradeFilterChange ? selectedGrade : internalFilter;

  const handleFilterChange = useCallback((grade: SQLGrade | 'ALL') => {
    if (onGradeFilterChange) {
      onGradeFilterChange(grade);
    } else {
      setInternalFilter(grade);
    }
  }, [onGradeFilterChange]);

  // Filter data by grade
  const filteredData = useMemo(() => {
    if (activeFilter === 'ALL') return data;
    return data.filter((sql) => sql.grade === activeFilter);
  }, [data, activeFilter]);

  // Calculate grade statistics
  const gradeStats = useMemo(() => {
    return data.reduce(
      (acc, sql) => {
        acc[sql.grade] = (acc[sql.grade] || 0) + 1;
        return acc;
      },
      {} as Record<SQLGrade, number>
    );
  }, [data]);

  // Total counts for summary
  const totalStats = useMemo(() => {
    const total = data.length;
    const critical = (gradeStats['D'] || 0) + (gradeStats['F'] || 0);
    const good = (gradeStats['A'] || 0) + (gradeStats['B'] || 0);
    return { total, critical, good };
  }, [data, gradeStats]);

  // Handle scatter click
  const handleScatterClick = useCallback((data: any) => {
    if (data && data.payload && onSQLClick && !isDragging) {
      onSQLClick(data.payload);
    }
  }, [onSQLClick, isDragging]);

  // Format axis tick
  const formatLogTick = useCallback((value: number) => {
    const actual = Math.pow(10, value);
    if (actual >= 1000000) return `${(actual / 1000000).toFixed(0)}M`;
    if (actual >= 1000) return `${(actual / 1000).toFixed(0)}K`;
    if (actual < 1) return actual.toFixed(2);
    return actual.toFixed(0);
  }, []);

  // Calculate domain for axes based on data
  const axisDomain = useMemo(() => {
    if (data.length === 0) return { x: [-2, 4], y: [0, 6] };

    const xValues = data.map(d => d.x);
    const yValues = data.map(d => d.y);

    return {
      x: [Math.floor(Math.min(...xValues) - 0.5), Math.ceil(Math.max(...xValues) + 0.5)],
      y: [Math.floor(Math.min(...yValues) - 0.5), Math.ceil(Math.max(...yValues) + 0.5)],
    };
  }, [data]);

  // 선택 해제
  const clearSelection = useCallback(() => {
    setSelectedPoints([]);
    setSelectionStart(null);
    setSelectionEnd(null);
    onSelectionChange?.([]);
  }, [onSelectionChange]);

  // 차트 크기 측정
  useEffect(() => {
    const updateDimensions = () => {
      if (chartContainerRef.current) {
        const rect = chartContainerRef.current.getBoundingClientRect();
        // 유효한 크기만 설정
        if (rect.width > 0 && rect.height > 0) {
          setChartDimensions({ width: rect.width, height: rect.height });
        }
      }
    };

    // 초기 측정을 약간 지연시켜 레이아웃이 완료된 후 측정
    const timeoutId = setTimeout(updateDimensions, 0);

    window.addEventListener('resize', updateDimensions);

    // ResizeObserver를 사용하여 컨테이너 크기 변경 감지
    let resizeObserver: ResizeObserver | null = null;
    if (chartContainerRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateDimensions);
      resizeObserver.observe(chartContainerRef.current);
    }

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateDimensions);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [height]);

  // 픽셀 좌표를 차트 데이터 좌표로 변환
  const pixelToChartCoords = useCallback((px: { x: number; y: number }) => {
    if (!chartDimensions) return null;

    const chartWidth = chartDimensions.width - CHART_MARGIN.left - CHART_MARGIN.right;
    const chartHeight = chartDimensions.height - CHART_MARGIN.top - CHART_MARGIN.bottom;

    // 픽셀 위치를 차트 영역 내 비율로 변환
    const xRatio = (px.x - CHART_MARGIN.left) / chartWidth;
    const yRatio = (px.y - CHART_MARGIN.top) / chartHeight;

    // 비율을 데이터 좌표로 변환 (Y축은 반전)
    const xValue = axisDomain.x[0] + xRatio * (axisDomain.x[1] - axisDomain.x[0]);
    const yValue = axisDomain.y[1] - yRatio * (axisDomain.y[1] - axisDomain.y[0]);

    return { x: xValue, y: yValue };
  }, [chartDimensions, axisDomain]);

  // 드래그 시작
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!chartContainerRef.current) return;

    const rect = chartContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // 마우스 시작 위치 저장 (클릭 vs 드래그 구분용)
    setMouseDownPos({ x: e.clientX, y: e.clientY });

    // 차트 영역 내인지 확인
    if (x >= CHART_MARGIN.left && x <= rect.width - CHART_MARGIN.right &&
        y >= CHART_MARGIN.top && y <= rect.height - CHART_MARGIN.bottom) {
      setIsDragging(true);

      const coords = pixelToChartCoords({ x, y });
      if (coords) {
        setSelectionStart(coords);
        setSelectionEnd(coords);
      }
    }
  }, [pixelToChartCoords]);

  // 드래그 중
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !chartContainerRef.current) return;

    const rect = chartContainerRef.current.getBoundingClientRect();
    const x = Math.max(CHART_MARGIN.left, Math.min(e.clientX - rect.left, rect.width - CHART_MARGIN.right));
    const y = Math.max(CHART_MARGIN.top, Math.min(e.clientY - rect.top, rect.height - CHART_MARGIN.bottom));

    const coords = pixelToChartCoords({ x, y });
    if (coords) {
      setSelectionEnd(coords);
    }
  }, [isDragging, pixelToChartCoords]);

  // 드래그 종료
  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // 클릭 vs 드래그 구분 (5px 이내 이동은 클릭으로 처리)
    const isClick = mouseDownPos &&
      Math.abs(e.clientX - mouseDownPos.x) < 5 &&
      Math.abs(e.clientY - mouseDownPos.y) < 5;

    if (isClick) {
      // 클릭인 경우 - 드래그 상태 초기화만 하고 Recharts 클릭 이벤트에 위임
      setIsDragging(false);
      setSelectionStart(null);
      setSelectionEnd(null);
      setMouseDownPos(null);
      return;
    }

    if (isDragging && selectionStart && selectionEnd) {
      const minX = Math.min(selectionStart.x, selectionEnd.x);
      const maxX = Math.max(selectionStart.x, selectionEnd.x);
      const minY = Math.min(selectionStart.y, selectionEnd.y);
      const maxY = Math.max(selectionStart.y, selectionEnd.y);

      // 최소 드래그 크기 체크
      if (Math.abs(maxX - minX) < 0.1 && Math.abs(maxY - minY) < 0.1) {
        setIsDragging(false);
        setSelectionStart(null);
        setSelectionEnd(null);
        setMouseDownPos(null);
        return;
      }

      // 선택 영역 내의 포인트 찾기
      const selected = filteredData.filter(point => {
        return point.x >= minX && point.x <= maxX &&
               point.y >= minY && point.y <= maxY;
      });

      setSelectedPoints(selected);
      onSelectionChange?.(selected);
    }
    setIsDragging(false);
    setMouseDownPos(null);
  }, [isDragging, selectionStart, selectionEnd, filteredData, onSelectionChange, mouseDownPos]);

  // 마우스가 차트 영역을 벗어났을 때 드래그 취소
  const handleMouseLeave = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      setSelectionStart(null);
      setSelectionEnd(null);
    }
    setMouseDownPos(null);
  }, [isDragging]);


  return (
    <div className="space-y-4">
      {/* Summary Bar - Light Mode Style */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-cyan-600">{totalStats.total}</div>
            <div className="text-xs text-gray-600">Total SQLs</div>
          </div>
          <div className="h-8 w-px bg-gray-300" />
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{totalStats.good}</div>
            <div className="text-xs text-gray-600">Good (A+B)</div>
          </div>
          <div className="h-8 w-px bg-gray-300" />
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{totalStats.critical}</div>
            <div className="text-xs text-gray-600">Critical (D+F)</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeFilter !== 'ALL' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleFilterChange('ALL')}
              className="text-xs h-7 px-3 bg-gray-200 hover:bg-gray-300 text-gray-700"
            >
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear Filter
            </Button>
          )}
          <div className="text-xs text-gray-600 bg-gray-100 px-3 py-1 rounded-full border border-gray-200">
            {filteredData.length} displayed
          </div>
        </div>
      </div>

      {/* Grade Statistics Cards - TMS 2.0 Style */}
      {showGradeStats && (
        <div className="grid grid-cols-5 gap-3">
          {(Object.keys(SQL_GRADES) as SQLGrade[]).map((grade) => (
            <GradeStatCard
              key={grade}
              grade={grade}
              count={gradeStats[grade] || 0}
              isSelected={activeFilter === grade}
              onClick={() => handleFilterChange(activeFilter === grade ? 'ALL' : grade)}
            />
          ))}
        </div>
      )}

      {/* Chart Instructions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-gray-600 bg-gray-100 px-3 py-1.5 rounded border border-gray-200">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
          </svg>
          Click on any point to view SQL details
          <span className="ml-2 text-blue-500">• 드래그하여 범위 선택</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-600">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-gray-500" />
            <span>Bubble size = Execution count</span>
          </div>
        </div>
      </div>

      {/* Scatter Chart - Light Mode */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
        <div
          style={{ height, width: '100%', minHeight: height }}
          className="relative"
          ref={chartContainerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        >
          {/* 드래그 선택 영역 시각화 (SVG 오버레이) - 드래그 중일 때만 표시 */}
          {isDragging && selectionStart && selectionEnd && chartDimensions && (
            <svg
              className="absolute pointer-events-none"
              style={{
                zIndex: 20,
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
                width: '100%',
                height: '100%',
              }}
            >
              {(() => {
                const chartWidth = chartDimensions.width - CHART_MARGIN.left - CHART_MARGIN.right;
                const chartHeight = chartDimensions.height - CHART_MARGIN.top - CHART_MARGIN.bottom;

                // 데이터 좌표를 픽셀로 변환
                const x1Ratio = (selectionStart.x - axisDomain.x[0]) / (axisDomain.x[1] - axisDomain.x[0]);
                const y1Ratio = (axisDomain.y[1] - selectionStart.y) / (axisDomain.y[1] - axisDomain.y[0]);
                const x2Ratio = (selectionEnd.x - axisDomain.x[0]) / (axisDomain.x[1] - axisDomain.x[0]);
                const y2Ratio = (axisDomain.y[1] - selectionEnd.y) / (axisDomain.y[1] - axisDomain.y[0]);

                const px1 = CHART_MARGIN.left + x1Ratio * chartWidth;
                const py1 = CHART_MARGIN.top + y1Ratio * chartHeight;
                const px2 = CHART_MARGIN.left + x2Ratio * chartWidth;
                const py2 = CHART_MARGIN.top + y2Ratio * chartHeight;

                const rectX = Math.min(px1, px2);
                const rectY = Math.min(py1, py2);
                const rectWidth = Math.abs(px2 - px1);
                const rectHeight = Math.abs(py2 - py1);

                return (
                  <rect
                    x={rectX}
                    y={rectY}
                    width={rectWidth}
                    height={rectHeight}
                    fill="rgba(59, 130, 246, 0.2)"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    strokeDasharray="5,3"
                  />
                );
              })()}
            </svg>
          )}
          {chartDimensions && chartDimensions.width > 0 && chartDimensions.height > 0 ? (
            <ScatterChart
              width={chartDimensions.width}
              height={chartDimensions.height}
              margin={CHART_MARGIN}
            >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />

            {/* Grade Zone Background Areas */}
            <ReferenceArea
              x1={axisDomain.x[0]}
              x2={Math.log10(200)}
              y1={axisDomain.y[0]}
              y2={axisDomain.y[1]}
              fill="#10b981"
              fillOpacity={0.05}
            />
            <ReferenceArea
              x1={Math.log10(200)}
              x2={Math.log10(500)}
              y1={axisDomain.y[0]}
              y2={axisDomain.y[1]}
              fill="#84cc16"
              fillOpacity={0.05}
            />
            <ReferenceArea
              x1={Math.log10(500)}
              x2={Math.log10(1000)}
              y1={axisDomain.y[0]}
              y2={axisDomain.y[1]}
              fill="#f59e0b"
              fillOpacity={0.05}
            />
            <ReferenceArea
              x1={Math.log10(1000)}
              x2={Math.log10(2000)}
              y1={axisDomain.y[0]}
              y2={axisDomain.y[1]}
              fill="#ef4444"
              fillOpacity={0.05}
            />
            <ReferenceArea
              x1={Math.log10(2000)}
              x2={axisDomain.x[1]}
              y1={axisDomain.y[0]}
              y2={axisDomain.y[1]}
              fill="#dc2626"
              fillOpacity={0.08}
            />

            {/* 드래그 선택 영역은 SVG 오버레이에서 렌더링됨 */}

            <XAxis
              type="number"
              dataKey="x"
              name="Elapsed/Exec"
              stroke="#6b7280"
              fontSize={10}
              domain={axisDomain.x}
              label={{
                value: 'Elapsed Time / Execution (ms, log scale)',
                position: 'bottom',
                fill: '#374151',
                fontSize: 11,
                offset: 35,
              }}
              tickFormatter={formatLogTick}
              tickLine={{ stroke: '#9ca3af' }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Buffer/Exec"
              stroke="#6b7280"
              fontSize={10}
              domain={axisDomain.y}
              label={{
                value: 'Buffer Gets / Execution (log scale)',
                angle: -90,
                position: 'insideLeft',
                fill: '#374151',
                fontSize: 11,
                offset: -10,
              }}
              tickFormatter={formatLogTick}
              tickLine={{ stroke: '#9ca3af' }}
            />
            <ZAxis type="number" dataKey="z" range={[30, 500]} />
            <Tooltip content={<ScatterTooltip />} />

            {/* Reference lines for grade boundaries */}
            <ReferenceLine
              x={Math.log10(200)}
              stroke={SQL_GRADES.A.color}
              strokeDasharray="5 5"
              strokeOpacity={0.6}
              label={{ value: '200ms (A)', fill: SQL_GRADES.A.color, fontSize: 9, position: 'top' }}
            />
            <ReferenceLine
              x={Math.log10(500)}
              stroke={SQL_GRADES.B.color}
              strokeDasharray="5 5"
              strokeOpacity={0.6}
              label={{ value: '500ms (B)', fill: SQL_GRADES.B.color, fontSize: 9, position: 'top' }}
            />
            <ReferenceLine
              x={Math.log10(1000)}
              stroke={SQL_GRADES.C.color}
              strokeDasharray="5 5"
              strokeOpacity={0.6}
              label={{ value: '1s (C)', fill: SQL_GRADES.C.color, fontSize: 9, position: 'top' }}
            />
            <ReferenceLine
              x={Math.log10(2000)}
              stroke={SQL_GRADES.D.color}
              strokeDasharray="5 5"
              strokeOpacity={0.6}
              label={{ value: '2s (D)', fill: SQL_GRADES.D.color, fontSize: 9, position: 'top' }}
            />

            {/* Render data points with custom shape */}
            <Scatter
              name="SQL Performance"
              data={filteredData}
              onClick={handleScatterClick}
              cursor="pointer"
              shape={(props: any) => {
                const { cx, cy, payload } = props;
                const gradeColor = SQL_GRADES[payload.grade as SQLGrade]?.color || '#6b7280';
                const baseSize = Math.max(5, Math.min(25, payload.z / 8));
                const isHighlighted = hoveredGrade === null || hoveredGrade === payload.grade;
                const isSelected = selectedPoints.some(p => p.sqlId === payload.sqlId);

                return (
                  <g>
                    {/* Glow effect for critical grades */}
                    {(payload.grade === 'D' || payload.grade === 'F') && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={baseSize + 4}
                        fill={gradeColor}
                        fillOpacity={0.2}
                        className="animate-pulse"
                      />
                    )}
                    {/* Selection highlight */}
                    {isSelected && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={baseSize + 5}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth={3}
                      />
                    )}
                    {/* Main circle */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={baseSize}
                      fill={gradeColor}
                      fillOpacity={isHighlighted ? (selectedPoints.length > 0 && !isSelected ? 0.3 : 0.85) : 0.3}
                      stroke={gradeColor}
                      strokeWidth={isHighlighted ? 2 : 1}
                      className="transition-all duration-200 hover:scale-110"
                      style={{ transformOrigin: `${cx}px ${cy}px` }}
                    />
                    {/* Grade label for large bubbles */}
                    {baseSize > 15 && (
                      <text
                        x={cx}
                        y={cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="white"
                        fontSize={10}
                        fontWeight="bold"
                      >
                        {payload.grade}
                      </text>
                    )}
                  </g>
                );
              }}
            />
          </ScatterChart>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-sm text-muted-foreground">차트 로딩 중...</div>
            </div>
          )}
        </div>
      </div>

      {/* 선택된 SQL 리스트 */}
      {showSelectionList && (
        <SelectedSQLList
          points={selectedPoints}
          onClear={clearSelection}
          onPointClick={onSQLClick}
        />
      )}

      {/* Grade Legend - Light Mode Style */}
      {showLegend && (
        <div className="flex flex-wrap gap-4 pt-3 border-t border-gray-200 justify-center">
          {(Object.keys(SQL_GRADES) as SQLGrade[]).map((grade) => {
            const info = SQL_GRADES[grade];
            return (
              <button
                key={grade}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors hover:bg-gray-100"
                onMouseEnter={() => setHoveredGrade(grade)}
                onMouseLeave={() => setHoveredGrade(null)}
                onClick={() => handleFilterChange(activeFilter === grade ? 'ALL' : grade)}
              >
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: info.color }}
                />
                <span className="text-xs font-medium" style={{ color: info.color }}>
                  {grade}
                </span>
                <span className="text-xs text-gray-600">{info.description}</span>
                <span className="text-xs text-gray-500">({gradeStats[grade] || 0})</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// SQL Cluster Detail Modal Component - TMS 2.0 Style
interface SQLClusterDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  sql: SQLClusterPoint | null;
  onViewExecutionPlan?: (sqlId: string) => void;
}

export function SQLClusterDetailModal({
  isOpen,
  onClose,
  sql,
  onViewExecutionPlan,
}: SQLClusterDetailModalProps) {
  // 드래그 상태
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // 리사이즈 상태 - 초기 높이는 화면의 70%
  const [size, setSize] = useState({ width: 560, height: Math.min(600, window.innerHeight * 0.7) });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const modalRef = useRef<HTMLDivElement>(null);

  // 모달이 열릴 때 중앙에 위치시키기 + 화면에 맞는 크기 설정
  useEffect(() => {
    if (isOpen) {
      const modalWidth = 560;
      const modalHeight = Math.min(600, window.innerHeight * 0.7);
      const centerX = (window.innerWidth - modalWidth) / 2;
      const centerY = (window.innerHeight - modalHeight) / 2;
      setSize({ width: modalWidth, height: modalHeight });
      setPosition({ x: centerX, y: Math.max(60, centerY) });
    }
  }, [isOpen]);

  // 드래그 핸들러
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  }, [position]);

  const handleDrag = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const newX = Math.max(0, Math.min(window.innerWidth - size.width, e.clientX - dragOffset.x));
    const newY = Math.max(0, Math.min(window.innerHeight - size.height, e.clientY - dragOffset.y));
    setPosition({ x: newX, y: newY });
  }, [isDragging, dragOffset, size]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 리사이즈 핸들러
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
    });
  }, [size]);

  const handleResize = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const newWidth = Math.max(400, Math.min(window.innerWidth - position.x - 20, resizeStart.width + (e.clientX - resizeStart.x)));
    const newHeight = Math.max(300, Math.min(window.innerHeight - position.y - 20, resizeStart.height + (e.clientY - resizeStart.y)));
    setSize({ width: newWidth, height: newHeight });
  }, [isResizing, resizeStart, position]);

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  // 전역 마우스 이벤트 리스너
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDrag);
      window.addEventListener('mouseup', handleDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleDrag);
        window.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isDragging, handleDrag, handleDragEnd]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleResize);
      window.addEventListener('mouseup', handleResizeEnd);
      return () => {
        window.removeEventListener('mousemove', handleResize);
        window.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, handleResize, handleResizeEnd]);

  if (!isOpen || !sql) return null;

  const gradeInfo = getGradeInfo(sql.grade);

  return (
    <div className="fixed inset-0 bg-black/50 z-50">
      <div
        ref={modalRef}
        className="absolute bg-gray-900 rounded-xl border border-gray-700 flex flex-col overflow-hidden shadow-2xl"
        style={{
          left: position.x,
          top: position.y,
          width: size.width,
          height: size.height,
          cursor: isDragging ? 'grabbing' : 'default',
        }}
      >
        {/* Header - 드래그 가능 영역 */}
        <div
          className="px-4 py-3 border-b border-gray-700 bg-gray-800/50 flex justify-between items-center flex-shrink-0 cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleDragStart}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg"
              style={{
                backgroundColor: `${gradeInfo.color}20`,
                color: gradeInfo.color,
                border: `2px solid ${gradeInfo.color}`,
              }}
            >
              {sql.grade}
            </div>
            <div>
              <h2 className="text-base font-bold text-white">SQL Detail</h2>
              <code className="text-xs text-cyan-400 font-mono">{sql.sqlId}</code>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {/* Grade Info Banner */}
          <div
            className="p-3 rounded-lg"
            style={{
              backgroundColor: `${gradeInfo.color}10`,
              border: `1px solid ${gradeInfo.color}40`,
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-base font-bold" style={{ color: gradeInfo.color }}>
                  Grade {sql.grade}: {gradeInfo.label}
                </span>
                <p className="text-xs text-gray-400 mt-0.5">{gradeInfo.description}</p>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-gray-500">기준</div>
                <div className="text-xs" style={{ color: gradeInfo.color }}>{gradeInfo.criteria}</div>
              </div>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gray-800 rounded-lg p-2 border border-gray-700">
              <div className="text-[10px] text-gray-500">Executions</div>
              <div className="text-lg font-bold text-cyan-400">{sql.executions.toLocaleString()}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2 border border-gray-700">
              <div className="text-[10px] text-gray-500">Total Elapsed</div>
              <div className="text-lg font-bold text-yellow-400">{sql.elapsedSec.toFixed(2)}s</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2 border border-gray-700">
              <div className="text-[10px] text-gray-500">Elapsed/Exec</div>
              <div className="text-lg font-bold text-orange-400">
                {(sql.elapsedPerExec * 1000).toFixed(1)}ms
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2 border border-gray-700">
              <div className="text-[10px] text-gray-500">CPU Time</div>
              <div className="text-lg font-bold text-green-400">{sql.cpuSec.toFixed(2)}s</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2 border border-gray-700">
              <div className="text-[10px] text-gray-500">Buffer Gets</div>
              <div className="text-lg font-bold text-purple-400">
                {sql.bufferGets.toLocaleString()}
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2 border border-gray-700">
              <div className="text-[10px] text-gray-500">Buffer/Exec</div>
              <div className="text-lg font-bold text-blue-400">
                {Math.round(sql.bufferPerExec).toLocaleString()}
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2 border border-gray-700">
              <div className="text-[10px] text-gray-500">Disk Reads</div>
              <div className="text-lg font-bold text-red-400">{sql.diskReads.toLocaleString()}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-2 border border-gray-700">
              <div className="text-[10px] text-gray-500">Rows Processed</div>
              <div className="text-lg font-bold text-cyan-400">
                {sql.rowsProcessed.toLocaleString()}
              </div>
            </div>
            {sql.module && (
              <div className="bg-gray-800 rounded-lg p-2 border border-gray-700">
                <div className="text-[10px] text-gray-500">Module</div>
                <div className="text-sm font-bold text-green-400 truncate">{sql.module}</div>
              </div>
            )}
          </div>

          {/* I/O Efficiency */}
          <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-gray-400">Physical I/O Ratio</span>
              <span className={sql.bufferGets > 0 && sql.diskReads / sql.bufferGets > 0.1 ? 'text-red-400' : 'text-green-400'}>
                {sql.bufferGets > 0 ? ((sql.diskReads / sql.bufferGets) * 100).toFixed(1) : 0}%
              </span>
            </div>
            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(sql.bufferGets > 0 ? (sql.diskReads / sql.bufferGets) * 100 : 0, 100)}%`,
                  backgroundColor: sql.bufferGets > 0 && sql.diskReads / sql.bufferGets > 0.1 ? COLORS.red : COLORS.green,
                }}
              />
            </div>
          </div>

          {/* SQL Text Section */}
          {sql.sqlText && (
            <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
              <div className="flex items-center justify-between mb-1.5">
                <h4 className="text-xs font-medium text-white">SQL Text</h4>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(sql.sqlText || '');
                  }}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  복사
                </button>
              </div>
              <div className="max-h-24 overflow-y-auto">
                <pre className="text-[11px] font-mono text-gray-300 whitespace-pre-wrap break-all">
                  {sql.sqlText}
                </pre>
              </div>
            </div>
          )}

          {/* Bind Variables Section */}
          {sql.bindVariables && (
            <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
              <h4 className="text-xs font-medium text-white mb-1.5">Bind Variables</h4>
              <pre className="text-[11px] font-mono text-gray-300 whitespace-pre-wrap break-all">
                {sql.bindVariables}
              </pre>
            </div>
          )}

          {/* Recommendations for Poor/Critical grades (D or F) */}
          {(sql.grade === 'D' || sql.grade === 'F') && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
              <h4 className="text-red-400 font-semibold text-xs mb-2 flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                튜닝 권장사항
              </h4>
              <ul className="text-xs text-gray-300 space-y-1">
                {sql.bufferPerExec > 10000 && (
                  <li className="flex items-start gap-1.5">
                    <span className="text-yellow-400">•</span>
                    <span>Buffer Gets/Exec가 높음 - 인덱스 검토 필요</span>
                  </li>
                )}
                {sql.elapsedPerExec > 1 && (
                  <li className="flex items-start gap-1.5">
                    <span className="text-orange-400">•</span>
                    <span>실행당 경과시간이 김 - 실행계획 분석 필요</span>
                  </li>
                )}
                {sql.bufferGets > 0 && sql.diskReads / sql.bufferGets > 0.1 && (
                  <li className="flex items-start gap-1.5">
                    <span className="text-red-400">•</span>
                    <span>물리적 I/O 비율이 높음 - 메모리 캐싱 검토</span>
                  </li>
                )}
                <li className="flex items-start gap-1.5">
                  <span className="text-purple-400">•</span>
                  <span>SQL Advisor 실행 권장</span>
                </li>
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-700 flex justify-between bg-gray-800/50 flex-shrink-0">
          <Button
            onClick={() => onViewExecutionPlan?.(sql.sqlId)}
            size="sm"
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            View Execution Plan
          </Button>
          <Button variant="outline" size="sm" onClick={onClose} className="bg-gray-700 hover:bg-gray-600 border-gray-600">
            Close
          </Button>
        </div>

        {/* 리사이즈 핸들 (우측 하단) */}
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize group"
          onMouseDown={handleResizeStart}
        >
          <svg
            className="w-4 h-4 text-gray-500 group-hover:text-gray-300 transition-colors"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22ZM22 14H20V12H22V14ZM18 18H16V16H18V18ZM14 22H12V20H14V22Z" />
          </svg>
        </div>
      </div>
    </div>
  );
}

/**
 * Generate mock SQL cluster data for testing
 * Uses A,B,C,D,F 5-grade system matching dashboard criteria:
 * A: ≤200ms, B: ≤500ms, C: ≤1000ms, D: ≤2000ms, F: >2000ms
 */
export function generateMockSQLClusterData(count: number = 50): SQLClusterPoint[] {
  const modules = [
    'TMS_ANALYZER',
    'TMS_COLLECTOR',
    'TMS_REPORT',
    'TMS_BATCH',
    'TMS_API',
    'JDBC Thin',
    'SQL*Plus',
    'PL/SQL Dev',
  ];
  const waitClasses = ['CPU', 'User I/O', 'System I/O', 'Concurrency', 'Application'];

  const sqlData: SQLClusterPoint[] = [];

  // Grade configs based on elapsed_time/exec (ms) thresholds: A≤200, B≤500, C≤1000, D≤2000, F>2000
  const gradeConfigs: Array<{
    grade: SQLGrade;
    count: number;
    execRange: [number, number];
    elapsedPerExecMsRange: [number, number];
    bufferPerExecRange: [number, number];
  }> = [
    { grade: 'A', count: Math.floor(count * 0.3), execRange: [10000, 60000], elapsedPerExecMsRange: [1, 200], bufferPerExecRange: [10, 500] },
    { grade: 'B', count: Math.floor(count * 0.25), execRange: [5000, 25000], elapsedPerExecMsRange: [201, 500], bufferPerExecRange: [100, 2000] },
    { grade: 'C', count: Math.floor(count * 0.2), execRange: [1000, 6000], elapsedPerExecMsRange: [501, 1000], bufferPerExecRange: [500, 5000] },
    { grade: 'D', count: Math.floor(count * 0.15), execRange: [100, 1100], elapsedPerExecMsRange: [1001, 2000], bufferPerExecRange: [1000, 10000] },
    { grade: 'F', count: Math.floor(count * 0.1), execRange: [5, 100], elapsedPerExecMsRange: [2001, 10000], bufferPerExecRange: [5000, 100000] },
  ];

  gradeConfigs.forEach((config) => {
    for (let i = 0; i < config.count; i++) {
      const executions =
        Math.floor(Math.random() * (config.execRange[1] - config.execRange[0])) + config.execRange[0];

      const elapsedPerExecMs =
        Math.random() * (config.elapsedPerExecMsRange[1] - config.elapsedPerExecMsRange[0]) +
        config.elapsedPerExecMsRange[0];

      const elapsedPerExec = elapsedPerExecMs / 1000;
      const elapsedSec = elapsedPerExec * executions;

      const bufferPerExec =
        Math.random() * (config.bufferPerExecRange[1] - config.bufferPerExecRange[0]) +
        config.bufferPerExecRange[0];
      const bufferGets = Math.floor(bufferPerExec * executions);

      sqlData.push({
        sqlId: `${config.grade.toLowerCase()}${String(i).padStart(3, '0')}${Math.random().toString(36).substring(2, 8)}`,
        grade: config.grade,
        gradeColor: SQL_GRADES[config.grade].color,
        executions,
        elapsedSec,
        cpuSec: elapsedSec * (0.6 + Math.random() * 0.3),
        bufferGets,
        diskReads: Math.floor(bufferGets * (Math.random() * 0.1)),
        rowsProcessed: Math.floor(Math.random() * 100000) + 1000,
        module: modules[Math.floor(Math.random() * modules.length)],
        waitClass: waitClasses[Math.floor(Math.random() * waitClasses.length)],
        elapsedPerExec,
        bufferPerExec,
        x: Math.log10(Math.max(elapsedPerExec, 0.0001) * 1000),
        y: Math.log10(Math.max(bufferPerExec, 1)),
        z: Math.log10(Math.max(executions, 1)) * 100,
      });
    }
  });

  return sqlData;
}
