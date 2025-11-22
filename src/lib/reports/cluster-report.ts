/**
 * Cluster Analysis Report Generator
 * SQL 클러스터 분석 데이터를 다양한 형식으로 내보내기
 */

import { ClusterData, PerformancePoint } from '@/types/performance';

export interface ClusterReportData {
  metadata: {
    generatedAt: string;
    totalClusters: number;
    totalSqlStatements: number;
    connectionName?: string;
  };
  clusters: ClusterData[];
}

/**
 * CSV 형식으로 클러스터 데이터 변환
 */
export function generateClusterCSV(data: ClusterReportData): string {
  const lines: string[] = [];

  // 헤더
  lines.push('# SQL 클러스터 분석 리포트');
  lines.push(`# 생성일시: ${data.metadata.generatedAt}`);
  lines.push(`# 총 클러스터 수: ${data.metadata.totalClusters}`);
  lines.push(`# 총 SQL 문 수: ${data.metadata.totalSqlStatements}`);
  if (data.metadata.connectionName) {
    lines.push(`# 연결: ${data.metadata.connectionName}`);
  }
  lines.push('');

  // 클러스터 요약
  lines.push('## 클러스터 요약');
  lines.push('Cluster ID,Cluster Name,SQL Count,Avg Performance Score,Avg CPU Time (ms),Avg Elapsed Time (ms),Avg Buffer Gets,Total Executions');

  data.clusters.forEach(cluster => {
    lines.push([
      cluster.id,
      cluster.name,
      cluster.points.length,
      cluster.avgPerformanceScore.toFixed(2),
      cluster.characteristics.avgCpuTime.toFixed(2),
      cluster.characteristics.avgElapsedTime.toFixed(2),
      cluster.characteristics.avgBufferGets.toFixed(0),
      cluster.characteristics.totalExecutions
    ].join(','));
  });

  lines.push('');

  // 상세 SQL 데이터
  lines.push('## SQL 상세 정보');
  lines.push('SQL ID,Cluster,Performance Grade,CPU Time (ms),Elapsed Time (ms),Buffer Gets,Disk Reads,Executions,Rows Processed');

  data.clusters.forEach(cluster => {
    cluster.points.forEach(point => {
      lines.push([
        point.sql_id,
        cluster.name,
        point.grade,
        point.metrics.cpu_time.toFixed(2),
        point.metrics.elapsed_time.toFixed(2),
        point.metrics.buffer_gets,
        point.metrics.disk_reads,
        point.metrics.executions,
        point.metrics.rows_processed
      ].join(','));
    });
  });

  return lines.join('\n');
}

/**
 * JSON 형식으로 클러스터 데이터 변환
 */
export function generateClusterJSON(data: ClusterReportData): string {
  const report = {
    metadata: data.metadata,
    summary: {
      totalClusters: data.metadata.totalClusters,
      totalSqlStatements: data.metadata.totalSqlStatements,
      clustersSummary: data.clusters.map(cluster => ({
        id: cluster.id,
        name: cluster.name,
        sqlCount: cluster.points.length,
        avgPerformanceScore: cluster.avgPerformanceScore,
        characteristics: cluster.characteristics,
        centroid: cluster.centroid
      }))
    },
    clusters: data.clusters.map(cluster => ({
      id: cluster.id,
      name: cluster.name,
      avgPerformanceScore: cluster.avgPerformanceScore,
      characteristics: cluster.characteristics,
      centroid: cluster.centroid,
      sqlStatements: cluster.points.map(point => ({
        sql_id: point.sql_id,
        grade: point.grade,
        metrics: point.metrics,
        coordinates: {
          x: point.x,
          y: point.y
        },
        size: point.size
      }))
    }))
  };

  return JSON.stringify(report, null, 2);
}

/**
 * HTML 형식으로 클러스터 데이터 변환
 */
export function generateClusterHTML(data: ClusterReportData): string {
  const html = `
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SQL 클러스터 분석 리포트</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .header {
      background: white;
      padding: 30px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 {
      color: #1e293b;
      margin: 0 0 20px 0;
    }
    .metadata {
      color: #64748b;
      font-size: 14px;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
      margin-bottom: 20px;
    }
    .card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .card h3 {
      margin: 0 0 10px 0;
      color: #1e293b;
      font-size: 14px;
      font-weight: 600;
    }
    .card .value {
      font-size: 32px;
      font-weight: bold;
      color: #3b82f6;
    }
    .cluster {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .cluster h2 {
      color: #1e293b;
      margin: 0 0 15px 0;
      font-size: 18px;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 15px;
    }
    .stat {
      padding: 10px;
      background: #f8fafc;
      border-radius: 4px;
    }
    .stat-label {
      font-size: 12px;
      color: #64748b;
      margin-bottom: 5px;
    }
    .stat-value {
      font-size: 18px;
      font-weight: 600;
      color: #1e293b;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }
    th, td {
      text-align: left;
      padding: 12px;
      border-bottom: 1px solid #e2e8f0;
    }
    th {
      background: #f8fafc;
      font-weight: 600;
      color: #475569;
      font-size: 12px;
      text-transform: uppercase;
    }
    .grade {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 12px;
    }
    .grade-A { background: #dcfce7; color: #166534; }
    .grade-B { background: #d9f99d; color: #365314; }
    .grade-C { background: #fef3c7; color: #92400e; }
    .grade-D { background: #fee2e2; color: #991b1b; }
    .grade-F { background: #fecaca; color: #7f1d1d; }
  </style>
</head>
<body>
  <div class="header">
    <h1>SQL 클러스터 분석 리포트</h1>
    <div class="metadata">
      <div>생성일시: ${data.metadata.generatedAt}</div>
      ${data.metadata.connectionName ? `<div>연결: ${data.metadata.connectionName}</div>` : ''}
    </div>
  </div>

  <div class="summary">
    <div class="card">
      <h3>총 클러스터 수</h3>
      <div class="value">${data.metadata.totalClusters}</div>
    </div>
    <div class="card">
      <h3>총 SQL 문 수</h3>
      <div class="value">${data.metadata.totalSqlStatements}</div>
    </div>
    <div class="card">
      <h3>평균 성능 점수</h3>
      <div class="value">${(data.clusters.reduce((sum, c) => sum + c.avgPerformanceScore, 0) / data.clusters.length).toFixed(1)}</div>
    </div>
  </div>

  ${data.clusters.map(cluster => `
    <div class="cluster">
      <h2>${cluster.name}</h2>

      <div class="stats">
        <div class="stat">
          <div class="stat-label">SQL 문 수</div>
          <div class="stat-value">${cluster.points.length}</div>
        </div>
        <div class="stat">
          <div class="stat-label">평균 성능 점수</div>
          <div class="stat-value">${cluster.avgPerformanceScore.toFixed(1)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">평균 CPU Time</div>
          <div class="stat-value">${cluster.characteristics.avgCpuTime.toFixed(2)}ms</div>
        </div>
        <div class="stat">
          <div class="stat-label">평균 Buffer Gets</div>
          <div class="stat-value">${cluster.characteristics.avgBufferGets.toFixed(0)}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>SQL ID</th>
            <th>등급</th>
            <th>CPU Time (ms)</th>
            <th>Elapsed Time (ms)</th>
            <th>Buffer Gets</th>
            <th>Disk Reads</th>
            <th>Executions</th>
          </tr>
        </thead>
        <tbody>
          ${cluster.points.map(point => `
            <tr>
              <td><code>${point.sql_id}</code></td>
              <td><span class="grade grade-${point.grade}">${point.grade}</span></td>
              <td>${point.metrics.cpu_time.toFixed(2)}</td>
              <td>${point.metrics.elapsed_time.toFixed(2)}</td>
              <td>${point.metrics.buffer_gets.toLocaleString()}</td>
              <td>${point.metrics.disk_reads.toLocaleString()}</td>
              <td>${point.metrics.executions.toLocaleString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `).join('')}

  <div class="metadata" style="text-align: center; margin-top: 40px; padding: 20px;">
    <p>Narae TMS v2.0 - SQL Tuning Management System</p>
    <p>© 주식회사 나래정보기술</p>
  </div>
</body>
</html>
  `.trim();

  return html;
}

/**
 * 파일 다운로드 트리거
 */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 클러스터 리포트 다운로드
 */
export function downloadClusterReport(
  clusters: ClusterData[],
  format: 'csv' | 'json' | 'html',
  connectionName?: string
) {
  const reportData: ClusterReportData = {
    metadata: {
      generatedAt: new Date().toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      totalClusters: clusters.length,
      totalSqlStatements: clusters.reduce((sum, c) => sum + c.points.length, 0),
      connectionName
    },
    clusters
  };

  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

  switch (format) {
    case 'csv': {
      const content = generateClusterCSV(reportData);
      downloadFile(content, `sql-cluster-report-${timestamp}.csv`, 'text/csv;charset=utf-8;');
      break;
    }
    case 'json': {
      const content = generateClusterJSON(reportData);
      downloadFile(content, `sql-cluster-report-${timestamp}.json`, 'application/json');
      break;
    }
    case 'html': {
      const content = generateClusterHTML(reportData);
      downloadFile(content, `sql-cluster-report-${timestamp}.html`, 'text/html;charset=utf-8;');
      break;
    }
  }
}
