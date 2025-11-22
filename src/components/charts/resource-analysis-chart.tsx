'use client'

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

export interface ResourceData {
  category: string
  cpuUsage: number
  memoryUsage: number
  diskIO: number
  networkIO: number
  timestamp: Date
}

interface ResourceAnalysisChartProps {
  data: ResourceData[]
  width?: number
  height?: number
}

export function ResourceAnalysisChart({
  data,
  width = 600,
  height = 400,
}: ResourceAnalysisChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || !data.length) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 20, right: 100, bottom: 60, left: 60 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    const container = svg
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const categories = Array.from(new Set(data.map(d => d.category)))
    const metrics = ['cpuUsage', 'memoryUsage', 'diskIO', 'networkIO']
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444']

    const aggregatedData = categories.map(category => {
      const categoryData = data.filter(d => d.category === category)
      return {
        category,
        cpuUsage: d3.mean(categoryData, d => d.cpuUsage) || 0,
        memoryUsage: d3.mean(categoryData, d => d.memoryUsage) || 0,
        diskIO: d3.mean(categoryData, d => d.diskIO) || 0,
        networkIO: d3.mean(categoryData, d => d.networkIO) || 0
      }
    })

    const x0Scale = d3.scaleBand()
      .domain(categories)
      .range([0, innerWidth])
      .paddingInner(0.1)

    const x1Scale = d3.scaleBand()
      .domain(metrics)
      .range([0, x0Scale.bandwidth()])
      .padding(0.05)

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(aggregatedData, d => Math.max(d.cpuUsage, d.memoryUsage, d.diskIO, d.networkIO)) || 100])
      .nice()
      .range([innerHeight, 0])

    const categoryGroups = container.selectAll('.category-group')
      .data(aggregatedData)
      .enter().append('g')
      .attr('class', 'category-group')
      .attr('transform', d => `translate(${x0Scale(d.category)},0)`)

    metrics.forEach((metric, i) => {
      categoryGroups.append('rect')
        .attr('x', x1Scale(metric)!)
        .attr('y', d => yScale((d as any)[metric]))
        .attr('width', x1Scale.bandwidth())
        .attr('height', d => innerHeight - yScale((d as any)[metric]))
        .attr('fill', colors[i])
        .attr('opacity', 0.8)
        .on('mouseover', function(event, d) {
          d3.select(this).attr('opacity', 1)

          const tooltip = d3.select('body').append('div')
            .attr('class', 'tooltip')
            .style('position', 'absolute')
            .style('padding', '10px')
            .style('background', 'rgba(0, 0, 0, 0.8)')
            .style('color', 'white')
            .style('border-radius', '4px')
            .style('pointer-events', 'none')
            .style('font-size', '12px')
            .style('z-index', '1000')

          const getMetricLabel = (metric: string) => {
            switch (metric) {
              case 'cpuUsage': return 'CPU Usage'
              case 'memoryUsage': return 'Memory Usage'
              case 'diskIO': return 'Disk I/O'
              case 'networkIO': return 'Network I/O'
              default: return metric
            }
          }

          const getMetricUnit = (metric: string) => {
            switch (metric) {
              case 'cpuUsage':
              case 'memoryUsage': return '%'
              case 'diskIO':
              case 'networkIO': return 'MB/s'
              default: return ''
            }
          }

          tooltip.html(`
            <div>
              <strong>${d.category}</strong><br/>
              ${getMetricLabel(metric)}: ${(d as any)[metric].toFixed(1)}${getMetricUnit(metric)}
            </div>
          `)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px')
            .transition()
            .duration(200)
            .style('opacity', 0.9)

          setTimeout(() => {
            tooltip.transition()
              .duration(500)
              .style('opacity', 0)
              .remove()
          }, 3000)
        })
        .on('mouseout', function() {
          d3.select(this).attr('opacity', 0.8)
        })
    })

    container.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x0Scale))
      .selectAll('text')
      .style('font-size', '12px')
      .style('fill', '#6B7280')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end')

    container.append('g')
      .call(d3.axisLeft(yScale))
      .selectAll('text')
      .style('font-size', '12px')
      .style('fill', '#6B7280')

    const legend = container.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${innerWidth + 20}, 20)`)

    const legendItems = legend.selectAll('.legend-item')
      .data(metrics)
      .enter().append('g')
      .attr('class', 'legend-item')
      .attr('transform', (d, i) => `translate(0, ${i * 20})`)

    legendItems.append('rect')
      .attr('width', 12)
      .attr('height', 12)
      .attr('fill', (d, i) => colors[i])

    legendItems.append('text')
      .attr('x', 18)
      .attr('y', 9)
      .style('font-size', '12px')
      .style('fill', '#6B7280')
      .text(d => {
        switch (d) {
          case 'cpuUsage': return 'CPU'
          case 'memoryUsage': return 'Memory'
          case 'diskIO': return 'Disk I/O'
          case 'networkIO': return 'Network I/O'
          default: return d
        }
      })
  }, [data, width, height])

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <svg ref={svgRef}></svg>
      </div>

      {data.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {[
            { label: 'CPU Average', value: `${(d3.mean(data, d => d.cpuUsage) || 0).toFixed(1)}%`, color: '#3B82F6' },
            { label: 'Memory Average', value: `${(d3.mean(data, d => d.memoryUsage) || 0).toFixed(1)}%`, color: '#10B981' },
            { label: 'Disk I/O Average', value: `${(d3.mean(data, d => d.diskIO) || 0).toFixed(1)} MB/s`, color: '#F59E0B' },
            { label: 'Network I/O Average', value: `${(d3.mean(data, d => d.networkIO) || 0).toFixed(1)} MB/s`, color: '#EF4444' }
          ].map((stat, index) => (
            <div key={index} className="flex items-center space-x-2 p-2 bg-gray-50 dark:bg-gray-800 rounded">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: stat.color }}
              />
              <div>
                <div className="font-medium text-gray-900 dark:text-gray-100">{stat.label}</div>
                <div className="text-gray-600 dark:text-gray-400">{stat.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
