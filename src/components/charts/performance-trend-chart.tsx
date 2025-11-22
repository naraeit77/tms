'use client';

/**
 * Performance Trend Chart Component
 * D3.js 기반 시계열 성능 트렌드 차트
 */

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

export interface PerformanceTrendData {
  timestamp: Date;
  avgCpuTime: number;
  avgElapsedTime: number;
  avgBufferGets: number;
  totalExecutions: number;
  avgDiskReads: number;
  activeQueries: number;
  problemQueries: number;
}

interface PerformanceTrendChartProps {
  data: PerformanceTrendData[];
  width?: number;
  height?: number;
}

type MetricKey = 'avgCpuTime' | 'avgElapsedTime' | 'avgBufferGets' | 'totalExecutions' | 'avgDiskReads' | 'problemQueries';

const metricOptions: Array<{
  key: MetricKey;
  label: string;
  color: string;
  unit: string;
  format: (value: number | null | undefined) => string;
  yAxisFormat: (value: number | null | undefined) => string;
}> = [
  {
    key: 'avgCpuTime',
    label: 'CPU시간',
    color: '#3B82F6',
    unit: 'ms',
    format: (v) => v != null ? `${v.toFixed(1)}ms` : '0ms',
    yAxisFormat: (v) => {
      if (v == null) return '0ms';
      return v >= 1000 ? `${(v/1000).toFixed(1)}s` : `${v.toFixed(0)}ms`;
    }
  },
  {
    key: 'avgElapsedTime',
    label: '경과시간',
    color: '#10B981',
    unit: 'ms',
    format: (v) => v != null ? `${v.toFixed(1)}ms` : '0ms',
    yAxisFormat: (v) => {
      if (v == null) return '0ms';
      return v >= 1000 ? `${(v/1000).toFixed(1)}s` : `${v.toFixed(0)}ms`;
    }
  },
  {
    key: 'avgBufferGets',
    label: '버퍼읽기',
    color: '#F59E0B',
    unit: '블록',
    format: (v) => v != null ? `${v.toLocaleString('ko-KR', {maximumFractionDigits: 0})} 블록` : '0 블록',
    yAxisFormat: (v) => {
      if (v == null) return '0';
      return v >= 1000 ? `${(v/1000).toFixed(1)}K` : `${v.toFixed(0)}`;
    }
  },
  {
    key: 'totalExecutions',
    label: '실행횟수',
    color: '#8B5CF6',
    unit: '회',
    format: (v) => v != null ? `${v.toLocaleString('ko-KR', {maximumFractionDigits: 0})}회` : '0회',
    yAxisFormat: (v) => {
      if (v == null) return '0';
      return v >= 1000 ? `${(v/1000).toFixed(1)}K` : `${v.toFixed(0)}`;
    }
  },
  {
    key: 'avgDiskReads',
    label: '디스크읽기',
    color: '#EC4899',
    unit: '블록',
    format: (v) => v != null ? `${v.toLocaleString('ko-KR', {maximumFractionDigits: 0})} 블록` : '0 블록',
    yAxisFormat: (v) => {
      if (v == null) return '0';
      return v >= 1000 ? `${(v/1000).toFixed(1)}K` : `${v.toFixed(0)}`;
    }
  },
  {
    key: 'problemQueries',
    label: '문제SQL',
    color: '#EF4444',
    unit: '개',
    format: (v) => v != null ? `${v.toFixed(0)}개` : '0개',
    yAxisFormat: (v) => v != null ? `${v.toFixed(0)}` : '0'
  }
];

export function PerformanceTrendChart({
  data,
  width = 800,
  height = 400,
}: PerformanceTrendChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('avgCpuTime');
  const [currentValue, setCurrentValue] = useState<number | null>(null);

  useEffect(() => {
    if (!svgRef.current || !data.length) return;

    // Clear previous chart
    d3.select(svgRef.current).selectAll('*').remove();

    const margin = { top: 20, right: 30, bottom: 60, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Get selected metric info
    const metricInfo = metricOptions.find(m => m.key === selectedMetric)!;

    // Scales
    const xScale = d3.scaleTime()
      .domain(d3.extent(data, d => d.timestamp) as [Date, Date])
      .range([0, innerWidth]);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(data, d => d[selectedMetric] ?? 0) || 1])
      .nice()
      .range([innerHeight, 0]);

    // Grid lines
    const xGrid = d3.axisBottom(xScale)
      .tickSize(-innerHeight)
      .tickFormat(() => '');

    const yGrid = d3.axisLeft(yScale)
      .tickSize(-innerWidth)
      .tickFormat(() => '');

    g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xGrid)
      .style('stroke-dasharray', '3,3')
      .style('opacity', 0.3);

    g.append('g')
      .attr('class', 'grid')
      .call(yGrid)
      .style('stroke-dasharray', '3,3')
      .style('opacity', 0.3);

    // Area gradient
    const gradient = svg.append('defs')
      .append('linearGradient')
      .attr('id', 'area-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', metricInfo.color)
      .attr('stop-opacity', 0.5);

    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', metricInfo.color)
      .attr('stop-opacity', 0.1);

    // Line generator
    const line = d3.line<PerformanceTrendData>()
      .x(d => xScale(d.timestamp))
      .y(d => yScale(d[selectedMetric] ?? 0))
      .curve(d3.curveMonotoneX);

    // Area generator
    const area = d3.area<PerformanceTrendData>()
      .x(d => xScale(d.timestamp))
      .y0(innerHeight)
      .y1(d => yScale(d[selectedMetric] ?? 0))
      .curve(d3.curveMonotoneX);

    // Draw area
    g.append('path')
      .datum(data)
      .attr('fill', 'url(#area-gradient)')
      .attr('d', area);

    // Draw line
    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', metricInfo.color)
      .attr('stroke-width', 2)
      .attr('d', line);

    // Data points
    g.selectAll('.point')
      .data(data)
      .enter().append('circle')
      .attr('class', 'point')
      .attr('cx', d => xScale(d.timestamp))
      .attr('cy', d => yScale(d[selectedMetric] ?? 0))
      .attr('r', 4)
      .attr('fill', metricInfo.color)
      .attr('stroke', 'white')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseover', function(event, d) {
        d3.select(this)
          .attr('r', 6)
          .attr('fill', d3.color(metricInfo.color)!.darker(0.5).toString());

        setCurrentValue(d[selectedMetric] ?? 0);

        // Tooltip
        const tooltip = d3.select('body').append('div')
          .attr('class', 'tooltip')
          .style('position', 'absolute')
          .style('visibility', 'visible')
          .style('background-color', 'rgba(0, 0, 0, 0.9)')
          .style('color', 'white')
          .style('padding', '8px 12px')
          .style('border-radius', '6px')
          .style('font-size', '12px')
          .style('pointer-events', 'none')
          .style('z-index', '1000');

        tooltip.html(`
          <div>
            <strong>${d3.timeFormat('%Y-%m-%d %H:%M:%S')(d.timestamp)}</strong><br/>
            ${metricInfo.label}: ${metricInfo.format(d[selectedMetric])}
          </div>
        `)
          .style('top', (event.pageY - 10) + 'px')
          .style('left', (event.pageX + 10) + 'px');
      })
      .on('mouseout', function() {
        d3.select(this)
          .attr('r', 4)
          .attr('fill', metricInfo.color);

        d3.select('body').selectAll('.tooltip').remove();
        setCurrentValue(null);
      });

    // Axes
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d => d3.timeFormat('%H:%M')(d as Date));

    const yAxis = d3.axisLeft(yScale)
      .tickFormat(d => metricInfo.yAxisFormat(d as number));

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .selectAll('text')
      .style('font-size', '12px')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end');

    g.append('g')
      .call(yAxis)
      .selectAll('text')
      .style('font-size', '12px');

    // Y axis label with unit
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -50)
      .attr('x', -innerHeight / 2)
      .attr('fill', 'currentColor')
      .style('text-anchor', 'middle')
      .style('font-size', '14px')
      .style('font-weight', '600')
      .text(`${metricInfo.label} (${metricInfo.unit})`);

    // Cleanup
    return () => {
      d3.select('body').selectAll('.tooltip').remove();
    };
  }, [data, selectedMetric, width, height]);

  const metricInfo = metricOptions.find(m => m.key === selectedMetric)!;
  const latestValue = data.length > 0 ? (data[data.length - 1][selectedMetric] ?? 0) : null;

  return (
    <div className="space-y-4">
      {/* Metric Selection */}
      <div className="flex flex-wrap gap-2">
        {metricOptions.map(metric => (
          <button
            key={metric.key}
            onClick={() => setSelectedMetric(metric.key)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              selectedMetric === metric.key
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
            style={{
              ...(selectedMetric === metric.key && {
                borderColor: metric.color,
                backgroundColor: `${metric.color}10`
              })
            }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: metric.color }}
              />
              {metric.label}
            </div>
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <svg ref={svgRef}></svg>
      </div>

      {/* Current Value Display */}
      {latestValue !== null && (
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            현재 {metricInfo.label}
          </span>
          <span className="text-2xl font-bold" style={{ color: metricInfo.color }}>
            {metricInfo.format(currentValue ?? latestValue ?? 0)}
          </span>
        </div>
      )}
    </div>
  );
}
