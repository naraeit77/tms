import 'server-only';

/**
 * Monitoring Stats API
 * GET: 전체 SQL 통계 및 분석 데이터 요약
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // 현재 사용자 확인
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Oracle 연결 정보 조회
    const { data: connections } = await supabase
      .from('oracle_connections')
      .select('id, is_active, health_status')
      .eq('is_active', true);

    const activeConnections = connections || [];
    const healthyConnections = activeConnections.filter((c) => c.health_status === 'HEALTHY');

    // SQL 분석 통계 (Mock data - 실제로는 여러 소스에서 집계)
    // 추후 v$sql 뷰에서 직접 쿼리하거나 Supabase에 저장된 데이터 활용
    const stats = {
      totalQueries: 0,
      slowQueries: 0,
      criticalIssues: 0,
      avgResponseTime: 0,
      totalConnections: activeConnections.length,
      healthyConnections: healthyConnections.length,
    };

    // 각 활성 연결에서 데이터 수집 시도 (간단한 집계)
    for (const conn of healthyConnections) {
      try {
        // 실제 환경에서는 Oracle에서 직접 쿼리
        // 여기서는 간단하게 Mock 데이터 사용
        stats.totalQueries += 150; // Mock
        stats.slowQueries += 45; // Mock
        stats.criticalIssues += 12; // Mock
        stats.avgResponseTime += 250; // Mock
      } catch (error) {
        console.error(`Failed to collect stats from connection ${conn.id}:`, error);
      }
    }

    // 평균 계산
    if (healthyConnections.length > 0) {
      stats.avgResponseTime = Math.floor(stats.avgResponseTime / healthyConnections.length);
    }

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Stats API Error:', error);
    return NextResponse.json({ error: 'Failed to fetch monitoring stats' }, { status: 500 });
  }
}
