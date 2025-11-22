'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

interface ReportUsageData {
  date: string;
  generated: number;
  downloaded: number;
  views: number;
}

interface ReportsAnalyticsChartProps {
  data: ReportUsageData[];
  width?: number;
  height?: number;
}

export function ReportsAnalyticsChart({
  data,
  width = 800,
  height = 320
}: ReportsAnalyticsChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 320 });
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['generated', 'downloaded', 'views']);

  // Responsive sizing
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        setDimensions({
          width: containerWidth,
          height: 320
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    if (!svgRef.current || !data.length || selectedMetrics.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 20, right: 100, bottom: 40, left: 60 };
    const innerWidth = dimensions.width - margin.left - margin.right;
    const innerHeight = dimensions.height - margin.top - margin.bottom;

    const container = svg
      .attr('width', dimensions.width)
      .attr('height', dimensions.height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Parse dates
    const parsedData = data.map(d => ({
      ...d,
      date: new Date(d.date)
    }));

    // Scales
    const xScale = d3.scaleTime()
      .domain(d3.extent(parsedData, d => d.date) as [Date, Date])
      .range([0, innerWidth]);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(parsedData, d => Math.max(d.generated, d.downloaded, d.views)) || 70])
      .nice()
      .range([innerHeight, 0]);

    // Color scheme
    const colors = {
      generated: '#3B82F6',
      downloaded: '#10B981',
      views: '#F59E0B'
    };

    // Create lines for selected metrics
    selectedMetrics.forEach(metric => {
      const line = d3.line<typeof parsedData[0]>()
        .x(d => xScale(d.date))
        .y(d => yScale(d[metric as keyof typeof d] as number))
        .curve(d3.curveMonotoneX);

      // Add line
      container.append('path')
        .datum(parsedData)
        .attr('fill', 'none')
        .attr('stroke', colors[metric as keyof typeof colors])
        .attr('stroke-width', 2)
        .attr('d', line);

      // Add dots
      container.selectAll(`.dot-${metric}`)
        .data(parsedData)
        .enter().append('circle')
        .attr('class', `dot-${metric}`)
        .attr('cx', d => xScale(d.date))
        .attr('cy', d => yScale(d[metric as keyof typeof d] as number))
        .attr('r', 4)
        .attr('fill', colors[metric as keyof typeof colors])
        .attr('stroke', 'white')
        .attr('stroke-width', 2);
    });

    // Add X axis
    container.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).tickFormat((domainValue: any) => {
        const date = domainValue as Date;
        return d3.timeFormat('%m/%d')(date);
      }))
      .selectAll('text')
      .style('font-size', '12px')
      .style('fill', '#6B7280');

    // Add Y axis
    container.append('g')
      .call(d3.axisLeft(yScale))
      .selectAll('text')
      .style('font-size', '12px')
      .style('fill', '#6B7280');

    // Add grid lines
    container.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale)
        .tickSize(-innerHeight)
        .tickFormat(() => '')
      )
      .style('stroke', '#E5E7EB')
      .style('stroke-dasharray', '3,3')
      .style('opacity', 0.5);

    container.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(yScale)
        .tickSize(-innerWidth)
        .tickFormat(() => '')
      )
      .style('stroke', '#E5E7EB')
      .style('stroke-dasharray', '3,3')
      .style('opacity', 0.5);

    // Legend
    const legend = container.append('g')
      .attr('transform', `translate(${innerWidth + 20}, 20)`);

    const metrics = [
      { key: 'generated', label: '생성', color: colors.generated },
      { key: 'downloaded', label: '다운로드', color: colors.downloaded },
      { key: 'views', label: '조회', color: colors.views }
    ];

    metrics.forEach((metric, index) => {
      const legendItem = legend.append('g')
        .attr('transform', `translate(0, ${index * 24})`);

      legendItem.append('circle')
        .attr('cx', 0)
        .attr('cy', 0)
        .attr('r', 5)
        .attr('fill', metric.color)
        .attr('opacity', selectedMetrics.includes(metric.key) ? 1 : 0.3);

      legendItem.append('text')
        .attr('x', 12)
        .attr('y', 0)
        .attr('dy', '0.35em')
        .style('font-size', '13px')
        .style('font-weight', selectedMetrics.includes(metric.key) ? '600' : '400')
        .style('fill', selectedMetrics.includes(metric.key) ? '#374151' : '#9CA3AF')
        .text(metric.label);
    });

  }, [data, selectedMetrics, dimensions]);

  const metrics = [
    { key: 'generated', label: '생성', color: '#3B82F6' },
    { key: 'downloaded', label: '다운로드', color: '#10B981' },
    { key: 'views', label: '조회', color: '#F59E0B' }
  ];

  const toggleMetric = (metric: string) => {
    setSelectedMetrics(prev =>
      prev.includes(metric)
        ? prev.filter(m => m !== metric)
        : [...prev, metric]
    );
  };

  return (
    <div className="space-y-4" ref={containerRef}>
      {/* Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <svg ref={svgRef}></svg>
      </div>
    </div>
  );
}
