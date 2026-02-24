/**
 * Cluster Analysis API
 * K-means 클러스터링을 사용한 SQL 성능 분석
 */

import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';
import { getConnectionEdition } from '@/lib/oracle/edition-guard-server';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { connection_id, algorithm = 'kmeans', k = 5, minutes = 60 } = await request.json();

    if (!connection_id) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    // Oracle에서 실제 SQL 성능 데이터 가져오기
    const config = await getOracleConfig(connection_id);

    // Enterprise Edition 감지
    const edition = await getConnectionEdition(connection_id);
    const isEnterprise = edition === 'Enterprise';

    const safeMinutes = minutes || 60;
    let query: string;

    if (isEnterprise) {
      // Enterprise Edition: ASH 기반 조회 (v$sql full scan 회피)
      // ASH에서 활성 SQL ID를 찾고, v$sql 개별 point lookup으로 상세 정보 획득
      query = `
        SELECT * FROM (
          SELECT * FROM (
            SELECT
              a.sql_id,
              NVL((SELECT s.elapsed_time FROM v$sql s WHERE s.sql_id = a.sql_id AND ROWNUM = 1), 0) as elapsed_time,
              NVL((SELECT s.cpu_time FROM v$sql s WHERE s.sql_id = a.sql_id AND ROWNUM = 1), 0) as cpu_time,
              NVL((SELECT s.buffer_gets FROM v$sql s WHERE s.sql_id = a.sql_id AND ROWNUM = 1), 0) as buffer_gets,
              NVL((SELECT s.disk_reads FROM v$sql s WHERE s.sql_id = a.sql_id AND ROWNUM = 1), 0) as disk_reads,
              NVL((SELECT s.executions FROM v$sql s WHERE s.sql_id = a.sql_id AND ROWNUM = 1), 0) as executions,
              NVL((SELECT s.rows_processed FROM v$sql s WHERE s.sql_id = a.sql_id AND ROWNUM = 1), 0) as rows_processed,
              (SELECT s.last_active_time FROM v$sql s WHERE s.sql_id = a.sql_id AND ROWNUM = 1) as last_active_time
            FROM (
              SELECT sql_id FROM (
                SELECT sql_id, COUNT(*) as samples
                FROM v$active_session_history
                WHERE sql_id IS NOT NULL
                  AND sample_time >= SYSDATE - ${safeMinutes}/1440
                GROUP BY sql_id
                ORDER BY COUNT(*) DESC
              ) WHERE ROWNUM <= 250
            ) a
          ) WHERE elapsed_time > 0 AND executions > 0
          ORDER BY elapsed_time DESC
        ) WHERE ROWNUM <= 200
      `;
    } else {
      // Standard Edition: v$sql full scan (SE는 shared pool이 작아 빠름)
      const timeFilter = minutes ? `AND last_active_time >= SYSDATE - ${minutes}/1440` : '';
      query = `
        SELECT * FROM (
          SELECT
            sql_id,
            elapsed_time,
            cpu_time,
            buffer_gets,
            disk_reads,
            executions,
            rows_processed,
            last_active_time
          FROM
            v$sql
          WHERE
            parsing_schema_name NOT IN ('SYS', 'SYSTEM')
            AND sql_text NOT LIKE '%v$%'
            AND sql_text NOT LIKE '%V$%'
            AND executions > 0
            AND elapsed_time > 0
            ${timeFilter}
          ORDER BY
            elapsed_time DESC
        ) WHERE ROWNUM <= 200
      `;
    }

    console.log(`[clusters/analyze] Edition: ${edition}, isEnterprise: ${isEnterprise}, minutes: ${safeMinutes}`);

    const result = await executeQuery(config, query, [], { timeout: 15000 });

    // 데이터 변환
    const sqlData = result.rows.map((row: any) => ({
      sql_id: row.SQL_ID,
      elapsed_time: Number(row.ELAPSED_TIME) / 1000, // microseconds to milliseconds
      cpu_time: Number(row.CPU_TIME) / 1000,
      buffer_gets: Number(row.BUFFER_GETS),
      disk_reads: Number(row.DISK_READS),
      executions: Number(row.EXECUTIONS),
      rows_processed: Number(row.ROWS_PROCESSED)
    }));

    if (sqlData.length < 10) {
      return NextResponse.json({
        error: 'Insufficient data for clustering',
        message: 'At least 10 SQL statements are required. Please run more SQL queries on the connected database.'
      }, { status: 400 });
    }

    // K-means 클러스터링 수행
    const clusters = performKMeansClustering(sqlData, k);

    return NextResponse.json({
      success: true,
      data: {
        clusters: clusters.map((cluster, index) => ({
          ...cluster,
          id: `cluster-${index}`,
        })),
        metadata: {
          algorithm,
          k,
          total_sql_count: sqlData.length,
          analysis_timestamp: new Date().toISOString()
        }
      },
      message: 'Clustering analysis completed'
    });

  } catch (error) {
    console.error('Clustering analysis error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * K-means 클러스터링 구현
 */
function performKMeansClustering(sqlData: any[], k: number) {
  // 특징 추출 및 정규화
  const features = sqlData.map(sql => ({
    sql_id: sql.sql_id,
    elapsed_time_per_exec: sql.elapsed_time / sql.executions,
    cpu_time_per_exec: sql.cpu_time / sql.executions,
    buffer_gets_per_exec: sql.buffer_gets / sql.executions,
    executions: sql.executions,
    raw_data: sql
  }));

  // Min-Max 정규화
  const mins = {
    elapsed_time_per_exec: Math.min(...features.map(f => f.elapsed_time_per_exec)),
    cpu_time_per_exec: Math.min(...features.map(f => f.cpu_time_per_exec)),
    buffer_gets_per_exec: Math.min(...features.map(f => f.buffer_gets_per_exec)),
    executions: Math.min(...features.map(f => f.executions))
  };

  const maxs = {
    elapsed_time_per_exec: Math.max(...features.map(f => f.elapsed_time_per_exec)),
    cpu_time_per_exec: Math.max(...features.map(f => f.cpu_time_per_exec)),
    buffer_gets_per_exec: Math.max(...features.map(f => f.buffer_gets_per_exec)),
    executions: Math.max(...features.map(f => f.executions))
  };

  const normalizedFeatures = features.map(f => ({
    ...f,
    norm_elapsed: normalize(f.elapsed_time_per_exec, mins.elapsed_time_per_exec, maxs.elapsed_time_per_exec),
    norm_cpu: normalize(f.cpu_time_per_exec, mins.cpu_time_per_exec, maxs.cpu_time_per_exec),
    norm_buffer: normalize(f.buffer_gets_per_exec, mins.buffer_gets_per_exec, maxs.buffer_gets_per_exec),
    norm_executions: normalize(f.executions, mins.executions, maxs.executions)
  }));

  // 중심점 초기화
  const centroids = [];
  for (let i = 0; i < k; i++) {
    centroids.push({
      elapsed: Math.random(),
      cpu: Math.random(),
      buffer: Math.random(),
      executions: Math.random()
    });
  }

  const assignments = new Array(features.length);
  let hasChanged = true;
  let iterations = 0;
  const maxIterations = 100;

  // K-means 반복
  while (hasChanged && iterations < maxIterations) {
    hasChanged = false;

    // 각 점을 가장 가까운 중심점에 할당
    for (let i = 0; i < normalizedFeatures.length; i++) {
      const point = normalizedFeatures[i];
      let minDistance = Infinity;
      let nearestCluster = 0;

      for (let j = 0; j < centroids.length; j++) {
        const distance = euclideanDistance(
          [point.norm_elapsed, point.norm_cpu, point.norm_buffer, point.norm_executions],
          [centroids[j].elapsed, centroids[j].cpu, centroids[j].buffer, centroids[j].executions]
        );

        if (distance < minDistance) {
          minDistance = distance;
          nearestCluster = j;
        }
      }

      if (assignments[i] !== nearestCluster) {
        assignments[i] = nearestCluster;
        hasChanged = true;
      }
    }

    // 중심점 업데이트
    for (let j = 0; j < centroids.length; j++) {
      const clusterPoints = normalizedFeatures.filter((_, i) => assignments[i] === j);
      if (clusterPoints.length > 0) {
        centroids[j] = {
          elapsed: clusterPoints.reduce((sum, p) => sum + p.norm_elapsed, 0) / clusterPoints.length,
          cpu: clusterPoints.reduce((sum, p) => sum + p.norm_cpu, 0) / clusterPoints.length,
          buffer: clusterPoints.reduce((sum, p) => sum + p.norm_buffer, 0) / clusterPoints.length,
          executions: clusterPoints.reduce((sum, p) => sum + p.norm_executions, 0) / clusterPoints.length
        };
      }
    }

    iterations++;
  }

  // 클러스터 결과 구축
  const clusters = [];
  for (let i = 0; i < k; i++) {
    const members = normalizedFeatures.filter((_, j) => assignments[j] === i);
    if (members.length === 0) continue;

    const avgElapsedTime = members.reduce((sum, m) => sum + m.elapsed_time_per_exec, 0) / members.length;
    const avgCpuTime = members.reduce((sum, m) => sum + m.cpu_time_per_exec, 0) / members.length;
    const avgBufferGets = members.reduce((sum, m) => sum + m.buffer_gets_per_exec, 0) / members.length;
    const totalExecutions = members.reduce((sum, m) => sum + m.executions, 0);

    // 성능 점수 계산
    let clusterScore = 100;
    if (avgElapsedTime > 1000) clusterScore -= 20;
    if (avgCpuTime > 500) clusterScore -= 15;
    if (avgBufferGets > 10000) clusterScore -= 15;
    clusterScore = Math.max(0, clusterScore);

    // 클러스터 특성 결정
    let clusterType = 'Balanced';
    if (avgElapsedTime > 2000) clusterType = 'Slow Queries';
    else if (avgCpuTime > 1000) clusterType = 'CPU Intensive';
    else if (avgBufferGets > 50000) clusterType = 'I/O Heavy';
    else if (totalExecutions > 10000) clusterType = 'High Frequency';

    clusters.push({
      name: clusterType,
      centroid: {
        cpu_time: avgCpuTime,
        buffer_gets: avgBufferGets
      },
      members: members.map(m => ({
        sql_id: m.sql_id,
        elapsed_time_per_exec: m.elapsed_time_per_exec,
        cpu_time_per_exec: m.cpu_time_per_exec,
        buffer_gets_per_exec: m.buffer_gets_per_exec
      })),
      avgScore: Math.round(clusterScore),
      characteristics: {
        avgElapsedTime: Math.round(avgElapsedTime),
        avgCpuTime: Math.round(avgCpuTime),
        avgBufferGets: Math.round(avgBufferGets),
        totalExecutions: totalExecutions
      }
    });
  }

  return clusters.sort((a, b) => b.members.length - a.members.length);
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return (value - min) / (max - min);
}

function euclideanDistance(point1: number[], point2: number[]): number {
  let sum = 0;
  for (let i = 0; i < point1.length; i++) {
    sum += Math.pow(point1[i] - point2[i], 2);
  }
  return Math.sqrt(sum);
}
