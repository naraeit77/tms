'use client';

/**
 * Scatter Plot Component for SQL Cluster Visualization
 * D3.js 기반 인터랙티브 산점도 차트
 */

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { PerformancePoint, PerformanceGrade } from '@/types/performance';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RefreshCw } from 'lucide-react';

interface ScatterPlotProps {
  data: PerformancePoint[];
  width?: number;
  height?: number;
  onPointClick?: (point: PerformancePoint) => void;
  xLabel?: string;
  yLabel?: string;
}

const gradeColors: Record<PerformanceGrade, string> = {
  'A': '#10b981', // green
  'B': '#84cc16', // lime
  'C': '#f59e0b', // amber
  'D': '#ef4444', // red
  'F': '#b91c1c', // dark red
};

export function ScatterPlot({
  data,
  width = 800,
  height = 600,
  onPointClick,
  xLabel = 'CPU Time (ms)',
  yLabel = 'Buffer Gets',
}: ScatterPlotProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedPoint, setSelectedPoint] = useState<PerformancePoint | null>(null);

  useEffect(() => {
    if (!svgRef.current || !data.length) return;

    // Clear previous chart
    d3.select(svgRef.current).selectAll('*').remove();

    const margin = { top: 40, right: 120, bottom: 60, left: 80 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Scales
    const xScale = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.x) || 1])
      .range([0, innerWidth])
      .nice();

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.y) || 1])
      .range([innerHeight, 0])
      .nice();

    const sizeScale = d3.scaleSqrt()
      .domain([0, d3.max(data, d => d.size) || 1])
      .range([4, 20]);

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

    // Axes
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d => d3.format('.0f')(d as number));

    const yAxis = d3.axisLeft(yScale)
      .tickFormat(d => d3.format('.0f')(d as number));

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .append('text')
      .attr('x', innerWidth / 2)
      .attr('y', 40)
      .attr('fill', 'currentColor')
      .style('text-anchor', 'middle')
      .text(xLabel);

    g.append('g')
      .call(yAxis)
      .append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -60)
      .attr('x', -innerHeight / 2)
      .attr('fill', 'currentColor')
      .style('text-anchor', 'middle')
      .text(yLabel);

    // Tooltip
    const tooltip = d3.select('body').append('div')
      .attr('class', 'tooltip')
      .style('position', 'absolute')
      .style('visibility', 'hidden')
      .style('background-color', 'rgba(0, 0, 0, 0.9)')
      .style('color', 'white')
      .style('padding', '8px 12px')
      .style('border-radius', '6px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('z-index', '1000');

    // Data points
    g.selectAll('.point')
      .data(data)
      .enter().append('circle')
      .attr('class', 'point')
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.y))
      .attr('r', d => sizeScale(d.size))
      .attr('fill', d => gradeColors[d.grade])
      .attr('stroke', 'white')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .style('opacity', 0.8)
      .on('mouseover', function(event, d: PerformancePoint) {
        d3.select(this)
          .style('opacity', 1)
          .attr('r', sizeScale(d.size) * 1.2);

        tooltip.style('visibility', 'visible')
          .html(`
            <div><strong>SQL ID:</strong> ${d.sql_id.replace(/^SQL_/, '')}</div>
            <div><strong>Grade:</strong> ${d.grade}</div>
            <div><strong>CPU Time:</strong> ${d.x.toFixed(2)}ms</div>
            <div><strong>Buffer Gets:</strong> ${d.y.toFixed(0)}</div>
            <div><strong>Executions:</strong> ${d.metrics.executions}</div>
          `);
      })
      .on('mousemove', function(event) {
        tooltip
          .style('top', (event.pageY - 10) + 'px')
          .style('left', (event.pageX + 10) + 'px');
      })
      .on('mouseout', function(event, d: PerformancePoint) {
        d3.select(this)
          .style('opacity', 0.8)
          .attr('r', sizeScale(d.size));

        tooltip.style('visibility', 'hidden');
      })
      .on('click', function(event, d: PerformancePoint) {
        setSelectedPoint(d);
        if (onPointClick) {
          onPointClick(d);
        }
      });

    // Legend
    const legend = svg.append('g')
      .attr('transform', `translate(${width - margin.right + 20}, ${margin.top})`);

    const grades = Object.keys(gradeColors) as PerformanceGrade[];

    legend.selectAll('.legend-item')
      .data(grades)
      .enter().append('g')
      .attr('class', 'legend-item')
      .attr('transform', (d, i) => `translate(0, ${i * 25})`)
      .each(function(d) {
        const item = d3.select(this);

        item.append('circle')
          .attr('r', 8)
          .attr('fill', gradeColors[d])
          .style('opacity', 0.8);

        item.append('text')
          .attr('x', 20)
          .attr('y', 5)
          .text(`Grade ${d}`)
          .style('font-size', '12px')
          .attr('fill', 'currentColor');
      });

    // Zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.5, 5])
      .on('zoom', function(event) {
        g.attr('transform', `translate(${margin.left},${margin.top}) ${event.transform}`);
        setZoomLevel(event.transform.k);
      });

    svg.call(zoom as any);

    // Cleanup
    return () => {
      d3.select('body').selectAll('.tooltip').remove();
    };
  }, [data, width, height, xLabel, yLabel, onPointClick]);

  const handleZoomIn = () => {
    const svg = d3.select(svgRef.current);
    svg.transition().call(
      d3.zoom().scaleBy as any,
      1.2
    );
  };

  const handleZoomOut = () => {
    const svg = d3.select(svgRef.current);
    svg.transition().call(
      d3.zoom().scaleBy as any,
      0.8
    );
  };

  const handleReset = () => {
    const svg = d3.select(svgRef.current);
    svg.transition().call(
      d3.zoom().transform as any,
      d3.zoomIdentity
    );
    setZoomLevel(1);
  };

  return (
    <Card className="relative p-4">
      <div className="absolute top-4 right-4 flex space-x-2 z-10">
        <Button
          variant="outline"
          size="icon"
          onClick={handleZoomIn}
          title="Zoom In"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleZoomOut}
          title="Zoom Out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleReset}
          title="Reset View"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <svg ref={svgRef}></svg>

      {selectedPoint && (
        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h4 className="font-semibold mb-2">Selected SQL</h4>
          <div className="text-sm space-y-1">
            <div><strong>SQL ID:</strong> {selectedPoint.sql_id.replace(/^SQL_/, '')}</div>
            <div><strong>Performance Grade:</strong> {selectedPoint.grade}</div>
            <div><strong>CPU Time:</strong> {selectedPoint.x.toFixed(2)}ms</div>
            <div><strong>Buffer Gets:</strong> {selectedPoint.y}</div>
          </div>
        </div>
      )}
    </Card>
  );
}
