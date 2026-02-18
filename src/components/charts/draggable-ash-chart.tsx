'use client';

/**
 * Draggable ASH Chart Component
 * TMS 2.0 구현 가이드 기반 - 드래그로 시간 범위 선택 가능한 ASH 차트
 * Recharts 기반 Stacked Area Chart with Mouse Drag Selection
 */

import { useRef, useState, useCallback, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WAIT_CLASS_COLORS } from '@/lib/sql-grading';

export interface ASHDataPoint {
  time: string;
  timestamp: number;
  index: number;
  CPU: number;
  'User I/O': number;
  'System I/O': number;
  Concurrency: number;
  Application: number;
  Commit: number;
  Configuration: number;
  Administrative: number;
  Network: number;
  Other: number;
  Idle?: number;
}

interface DraggableASHChartProps {
  data: ASHDataPoint[];
  onRangeSelect?: (startTime: number, endTime: number) => void;
  height?: number;
  title?: string;
  subtitle?: string;
  showLegend?: boolean;
  cpuCoreCount?: number;
}

// Wait classes to display (in stack order, bottom to top)
const WAIT_CLASSES = [
  'CPU',
  'User I/O',
  'System I/O',
  'Concurrency',
  'Application',
  'Commit',
  'Configuration',
  'Administrative',
  'Network',
  'Other',
] as const;

// Chart padding for drag calculation
const CHART_PADDING = { left: 60, right: 20, top: 20, bottom: 30 };

export function DraggableASHChart({
  data,
  onRangeSelect,
  height = 280,
  title,
  subtitle,
  showLegend = true,
  cpuCoreCount,
}: DraggableASHChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [selection, setSelection] = useState<{
    startX: number;
    endX: number;
    startIndex: number;
    endIndex: number;
  } | null>(null);

  // Get position from mouse event
  const getPositionFromEvent = useCallback((e: React.MouseEvent): { x: number; width: number } | null => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      width: rect.width,
    };
  }, []);

  // Convert X position to data index
  const getDataIndexFromX = useCallback((x: number, width: number): number => {
    const chartWidth = width - CHART_PADDING.left - CHART_PADDING.right;
    const relativeX = x - CHART_PADDING.left;
    const index = Math.round((relativeX / chartWidth) * (data.length - 1));
    return Math.max(0, Math.min(data.length - 1, index));
  }, [data.length]);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const pos = getPositionFromEvent(e);
    if (!pos) return;

    // Check if within chart area
    if (pos.x >= CHART_PADDING.left && pos.x <= pos.width - CHART_PADDING.right) {
      setIsDragging(true);
      setDragStart(pos.x);
      setDragEnd(pos.x);
      setSelection(null);
    }
  }, [getPositionFromEvent]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const pos = getPositionFromEvent(e);
    if (!pos) return;

    const clampedX = Math.max(CHART_PADDING.left, Math.min(pos.width - CHART_PADDING.right, pos.x));
    setDragEnd(clampedX);
  }, [isDragging, getPositionFromEvent]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging || !containerRef.current) {
      setIsDragging(false);
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const width = rect.width;

    if (dragStart !== null && dragEnd !== null && Math.abs(dragEnd - dragStart) > 10) {
      const startX = Math.min(dragStart, dragEnd);
      const endX = Math.max(dragStart, dragEnd);

      const startIndex = getDataIndexFromX(startX, width);
      const endIndex = getDataIndexFromX(endX, width);

      if (startIndex !== endIndex && data[startIndex] && data[endIndex]) {
        setSelection({ startX, endX, startIndex, endIndex });
        if (onRangeSelect) {
          onRangeSelect(data[startIndex].timestamp, data[endIndex].timestamp);
        }
      }
    }

    setIsDragging(false);
  }, [isDragging, dragStart, dragEnd, getDataIndexFromX, data, onRangeSelect]);

  const handleMouseLeave = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
    }
  }, [isDragging]);

  const clearSelection = useCallback(() => {
    setSelection(null);
    setDragStart(null);
    setDragEnd(null);
  }, []);

  // Calculate overlay style for visual feedback
  const overlayStyle = useMemo(() => {
    if (isDragging && dragStart !== null && dragEnd !== null) {
      const left = Math.min(dragStart, dragEnd);
      const width = Math.abs(dragEnd - dragStart);
      return { left, width, opacity: 1 };
    }
    if (selection) {
      return { left: selection.startX, width: selection.endX - selection.startX, opacity: 1 };
    }
    return { left: 0, width: 0, opacity: 0 };
  }, [isDragging, dragStart, dragEnd, selection]);

  // Get selected time range text
  const selectedRangeText = useMemo(() => {
    if (selection && data[selection.startIndex] && data[selection.endIndex]) {
      return `${data[selection.startIndex].time} → ${data[selection.endIndex].time}`;
    }
    if (isDragging && dragStart !== null && dragEnd !== null && containerRef.current) {
      const width = containerRef.current.getBoundingClientRect().width;
      const startIdx = getDataIndexFromX(Math.min(dragStart, dragEnd), width);
      const endIdx = getDataIndexFromX(Math.max(dragStart, dragEnd), width);
      if (data[startIdx] && data[endIdx]) {
        return `${data[startIdx].time} → ${data[endIdx].time}`;
      }
    }
    return null;
  }, [selection, isDragging, dragStart, dragEnd, data, getDataIndexFromX]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    const total = payload.reduce((sum: number, entry: any) => sum + (entry.value || 0), 0);

    return (
      <div className="bg-gray-900/95 border border-gray-700 rounded-lg p-3 shadow-xl">
        <div className="text-xs text-gray-400 mb-2">{label}</div>
        <div className="text-sm font-bold text-white mb-2">
          AAS: {total.toFixed(2)}
        </div>
        <div className="space-y-1">
          {payload.filter((entry: any) => entry.value > 0).map((entry: any) => (
            <div key={entry.name} className="flex items-center gap-2 text-xs">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-gray-300">{entry.name}:</span>
              <span className="text-white font-medium">{entry.value.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="relative">
      {/* Header */}
      {(title || subtitle) && (
        <div className="mb-3">
          {title && <h3 className="text-sm font-medium text-white">{title}</h3>}
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      )}

      {/* Instructions & Selection Info */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 bg-gray-700/50 px-2 py-1 rounded flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
              />
            </svg>
            드래그하여 시간 범위 선택
          </span>
          {selection && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              className="h-6 text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10 px-2"
            >
              <X className="w-3 h-3 mr-1" />
              선택 해제
            </Button>
          )}
        </div>
        {selectedRangeText && (
          <div className="text-xs text-orange-400 bg-orange-400/10 border border-orange-400/30 px-3 py-1 rounded-full">
            📊 {selectedRangeText}
          </div>
        )}
      </div>

      {/* Chart Container with Overlay */}
      <div
        ref={containerRef}
        className="relative select-none bg-gray-800/30 rounded-lg"
        style={{ height, cursor: 'crosshair' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {/* Selection Overlay */}
        <div
          className="absolute pointer-events-none z-10 transition-opacity duration-150"
          style={{
            left: overlayStyle.left,
            width: overlayStyle.width,
            top: CHART_PADDING.top,
            bottom: CHART_PADDING.bottom,
            backgroundColor: 'rgba(249, 115, 22, 0.3)',
            borderLeft: overlayStyle.width > 0 ? '2px solid #f97316' : 'none',
            borderRight: overlayStyle.width > 0 ? '2px solid #f97316' : 'none',
            opacity: overlayStyle.opacity,
          }}
        />

        {/* Recharts */}
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <AreaChart
            data={data}
            margin={{ top: 20, right: 20, left: 40, bottom: 30 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="time"
              stroke="#6b7280"
              fontSize={10}
              tickLine={false}
            />
            <YAxis
              stroke="#6b7280"
              fontSize={10}
              tickLine={false}
              label={{
                value: 'AAS',
                angle: -90,
                position: 'insideLeft',
                fill: '#6b7280',
                fontSize: 10,
              }}
            />
            {/* CPU core count reference line */}
            {cpuCoreCount && (
              <ReferenceLine
                y={cpuCoreCount}
                stroke="#ef4444"
                strokeDasharray="5 5"
                label={{
                  value: `CPU Cores: ${cpuCoreCount}`,
                  fill: '#ef4444',
                  fontSize: 10,
                  position: 'right',
                }}
              />
            )}
            <Tooltip content={<CustomTooltip />} />
            {WAIT_CLASSES.map((waitClass) => (
              <Area
                key={waitClass}
                type="monotone"
                dataKey={waitClass}
                stackId="1"
                stroke={WAIT_CLASS_COLORS[waitClass] || WAIT_CLASS_COLORS['Other']}
                fill={WAIT_CLASS_COLORS[waitClass] || WAIT_CLASS_COLORS['Other']}
                fillOpacity={0.8}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="flex flex-wrap gap-3 mt-3 justify-center">
          {WAIT_CLASSES.map((waitClass) => (
            <div key={waitClass} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: WAIT_CLASS_COLORS[waitClass] || WAIT_CLASS_COLORS['Other'] }}
              />
              <span className="text-xs text-gray-400">{waitClass}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Generate mock ASH data for testing/demo purposes
 */
export function generateMockASHData(pointCount: number = 60): ASHDataPoint[] {
  const now = Date.now();
  return Array.from({ length: pointCount }, (_, i) => {
    const timestamp = now - (pointCount - 1 - i) * 60000;
    const date = new Date(timestamp);
    return {
      time: date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      timestamp,
      index: i,
      CPU: Math.random() * 3 + 1.5,
      'User I/O': Math.random() * 2.5 + 1,
      'System I/O': Math.random() * 1.5 + 0.5,
      Concurrency: Math.random() * 1 + 0.2,
      Application: Math.random() * 0.8 + 0.1,
      Commit: Math.random() * 0.5 + 0.1,
      Configuration: Math.random() * 0.2,
      Administrative: Math.random() * 0.1,
      Network: Math.random() * 0.3,
      Other: Math.random() * 0.5 + 0.1,
    };
  });
}
