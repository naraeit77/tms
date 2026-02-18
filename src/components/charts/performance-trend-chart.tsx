'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { WAIT_CLASS_COLORS } from '@/lib/sql-grading';

export interface PerformanceTrendData {
  timestamp: Date;
  oracleTimestamp?: string; // Oracle 서버 시간 문자열 (YYYY-MM-DD HH24:MI:SS 형식)
  avgCpuTime: number;
  avgElapsedTime: number;
  avgBufferGets: number;
  totalExecutions: number;
  avgDiskReads: number;
  activeQueries: number;
  problemQueries: number;
  source?: string;
  sqls?: any[];
}

interface PerformanceTrendChartProps {
  data: PerformanceTrendData[];
  width?: number;
  height?: number;
  onTimeRangeSelect?: (startTime: Date, endTime: Date) => void;
}

type AshStackKey =
  | 'cpu'
  | 'userIO'
  | 'systemIO'
  | 'concurrency'
  | 'application'
  | 'commit'
  | 'other';

const ASH_STACK: Array<{
  key: AshStackKey;
  label: string;
  color: string;
}> = [
  { key: 'cpu', label: 'CPU', color: WAIT_CLASS_COLORS['CPU'] },
  { key: 'userIO', label: 'User I/O', color: WAIT_CLASS_COLORS['User I/O'] },
  { key: 'systemIO', label: 'System I/O', color: WAIT_CLASS_COLORS['System I/O'] },
  { key: 'concurrency', label: 'Concurrency', color: WAIT_CLASS_COLORS['Concurrency'] },
  { key: 'application', label: 'Application', color: WAIT_CLASS_COLORS['Application'] },
  { key: 'commit', label: 'Commit', color: WAIT_CLASS_COLORS['Commit'] },
  { key: 'other', label: 'Other', color: WAIT_CLASS_COLORS['Other'] },
];

export function PerformanceTrendChart({
  data,
  width = 800,
  height = 400,
  onTimeRangeSelect,
}: PerformanceTrendChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [brushRange, setBrushRange] = useState<[Date, Date] | null>(null);

  useEffect(() => {
    if (!svgRef.current || !data.length) return;

    const normalizedData = data
      .map((d) => {
        const timestamp = d.timestamp instanceof Date ? d.timestamp : new Date(d.timestamp);

        const cpu = Math.max(0, Number.isFinite(d.avgCpuTime) ? d.avgCpuTime : 0);
        const userIO = Math.max(0, Number.isFinite(d.avgBufferGets) ? d.avgBufferGets : 0);
        const systemIO = Math.max(0, Number.isFinite(d.avgDiskReads) ? d.avgDiskReads : 0);
        const concurrency = Math.max(0, Number.isFinite(d.totalExecutions) ? d.totalExecutions : 0);
        const application = Math.max(0, Number.isFinite(d.activeQueries) ? d.activeQueries : 0);
        const commit = Math.max(0, Number.isFinite(d.avgElapsedTime) ? d.avgElapsedTime : 0);
        const other = Math.max(0, Number.isFinite(d.problemQueries) ? d.problemQueries : 0);

        return {
          timestamp,
          cpu,
          userIO,
          systemIO,
          concurrency,
          application,
          commit,
          other,
        };
      })
      .filter((d) => !Number.isNaN(d.timestamp.getTime()))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (normalizedData.length === 0) return;

    const stackKeys = ASH_STACK.map((series) => series.key);
    const stack = d3
      .stack<typeof normalizedData[0]>()
      .keys(stackKeys)
      .order(d3.stackOrderNone)
      .offset(d3.stackOffsetNone);

    const stackedData = stack(normalizedData as any);

    d3.select(svgRef.current).selectAll('*').remove();

    const margin = { top: 24, right: 28, bottom: 56, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3
      .select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3
      .scaleTime()
      .domain(d3.extent(normalizedData, (d) => d.timestamp) as [Date, Date])
      .range([0, innerWidth]);

    const yMax =
      d3.max(stackedData, (layer) => d3.max(layer, (d) => d[1])) ||
      d3.max(normalizedData, (d) => d.cpu) ||
      1;

    const yScale = d3.scaleLinear().domain([0, yMax]).nice().range([innerHeight, 0]);

    const xGrid = d3.axisBottom(xScale).tickSize(-innerHeight).tickFormat(() => '');
    const yGrid = d3.axisLeft(yScale).tickSize(-innerWidth).tickFormat(() => '');

    g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xGrid)
      .selectAll('line')
      .style('stroke', '#e5e7eb');

    g.append('g')
      .attr('class', 'grid')
      .call(yGrid)
      .selectAll('line')
      .style('stroke', '#e5e7eb');

    const defs = svg.append('defs');
    ASH_STACK.forEach((series) => {
      const gradient = defs
        .append('linearGradient')
        .attr('id', `gradient-${series.key}`)
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%');

      gradient.append('stop').attr('offset', '0%').attr('stop-color', series.color).attr('stop-opacity', 0.9);
      gradient.append('stop').attr('offset', '100%').attr('stop-color', series.color).attr('stop-opacity', 0.25);
    });

    const area = d3
      .area<d3.SeriesPoint<typeof normalizedData[0]>>()
      .x((d) => xScale(d.data.timestamp))
      .y0((d) => yScale(d[0]))
      .y1((d) => yScale(d[1]))
      .curve(d3.curveMonotoneX);

    g.selectAll('.layer')
      .data(stackedData)
      .enter()
      .append('path')
      .attr('class', 'layer')
      .attr('d', area)
      .attr('fill', (_, idx) => `url(#gradient-${ASH_STACK[idx]?.key})`)
      .attr('stroke', (_, idx) => ASH_STACK[idx]?.color || '#000')
      .attr('stroke-width', 1)
      .attr('opacity', 0.95);

    const xAxis = d3
      .axisBottom(xScale)
      .ticks(Math.min(10, normalizedData.length))
      .tickFormat((value) => d3.timeFormat('%H:%M')(value as Date));

    const yAxis = d3.axisLeft(yScale).ticks(6).tickFormat((value) => d3.format('.2s')(value as number));

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .selectAll('text')
      .style('font-size', '11px')
      .attr('transform', 'rotate(-30)')
      .style('text-anchor', 'end');

    g.append('g')
      .call(yAxis)
      .selectAll('text')
      .style('font-size', '11px');

    const brush = d3
      .brushX()
      .extent([
        [0, 0],
        [innerWidth, innerHeight],
      ])
      .on('end', (event) => {
        if (!event.selection) {
          setBrushRange(null);
          return;
        }

        const [x0, x1] = event.selection as [number, number];
        const startTime = xScale.invert(x0);
        const endTime = xScale.invert(x1);

        setBrushRange([startTime, endTime]);
        onTimeRangeSelect?.(startTime, endTime);

        setTimeout(() => {
          d3.select(svgRef.current).select('.brush').call(brush.move as any, null);
        }, 600);
      });

    const brushGroup = g.append('g').attr('class', 'brush').call(brush);

    brushGroup.selectAll('.overlay').style('cursor', 'crosshair');

    brushGroup
      .selectAll('.selection')
      .style('fill', '#f97316')
      .style('fill-opacity', 0.18)
      .style('stroke', '#c2410c')
      .style('stroke-width', 1.5);

    return () => {
      d3.select('body').selectAll('.tooltip').remove();
    };
  }, [data, height, onTimeRangeSelect, width]);

  const formatTime = (value: Date) =>
    new Intl.DateTimeFormat('ko-KR', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(value);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>그래프를 드래그하여 기간을 지정하면 SQL 상세 분석으로 전달됩니다.</span>
          </div>
          {brushRange && (
            <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
              <span className="font-medium text-foreground">선택 구간</span>
              <span>
                {formatTime(brushRange[0])} ~ {formatTime(brushRange[1])}
              </span>
            </div>
          )}
        </div>
        <svg ref={svgRef}></svg>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {ASH_STACK.map((series) => (
          <div key={series.key} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: series.color }} />
            <span className="font-medium text-foreground">{series.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
