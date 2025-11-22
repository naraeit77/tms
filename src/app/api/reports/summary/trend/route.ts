import { NextRequest, NextResponse } from 'next/server';
import { createClient, createPureClient } from '@/lib/supabase/server';

// Generate demo trend data
function generateDemoTrendData(period: string) {
  const dataPoints = period === '24h' ? 24 : period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const now = new Date();
  const data = [];

  for (let i = dataPoints - 1; i >= 0; i--) {
    const timestamp = new Date(now);
    if (period === '24h') {
      timestamp.setHours(timestamp.getHours() - i);
    } else {
      timestamp.setDate(timestamp.getDate() - i);
    }

    // Generate realistic-looking data with some variation
    const baseResponseTime = 0.25;
    const variation = (Math.random() - 0.5) * 0.1;
    const trend = -i * 0.001; // Slight improvement over time

    data.push({
      timestamp: timestamp.toISOString(),
      avgResponseTime: Math.max(0.05, baseResponseTime + variation + trend),
      executions: Math.floor(50000 + Math.random() * 20000),
      sqlCount: Math.floor(150 + Math.random() * 50)
    });
  }

  return data;
}

// Get trend data from Supabase
async function getTrendDataFromSupabase(supabase: any, databaseId: string, period: string) {
  let startDate = new Date();

  switch (period) {
    case '24h':
      startDate.setHours(startDate.getHours() - 24);
      break;
    case '7d':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(startDate.getDate() - 30);
      break;
    case '90d':
      startDate.setDate(startDate.getDate() - 90);
      break;
  }

  // Query sql_statistics grouped by time intervals
  const { data, error } = await supabase
    .from('sql_statistics')
    .select('created_at, elapsed_time_seconds, executions')
    .eq('database_id', databaseId)
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true });

  if (error || !data || data.length === 0) {
    return null;
  }

  // Group data by time intervals
  const intervals = period === '24h' ? 24 : period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const intervalMs = period === '24h'
    ? 60 * 60 * 1000 // 1 hour
    : 24 * 60 * 60 * 1000; // 1 day

  const now = Date.now();
  const trendData = [];

  for (let i = intervals - 1; i >= 0; i--) {
    const intervalStart = now - (i + 1) * intervalMs;
    const intervalEnd = now - i * intervalMs;

    const intervalData = data.filter((row: any) => {
      const rowTime = new Date(row.created_at).getTime();
      return rowTime >= intervalStart && rowTime < intervalEnd;
    });

    if (intervalData.length > 0) {
      const avgResponseTime = intervalData.reduce((sum: number, row: any) =>
        sum + (row.elapsed_time_seconds || 0), 0) / intervalData.length;

      const totalExecutions = intervalData.reduce((sum: number, row: any) =>
        sum + (row.executions || 0), 0);

      trendData.push({
        timestamp: new Date(intervalEnd).toISOString(),
        avgResponseTime: avgResponseTime,
        executions: totalExecutions,
        sqlCount: intervalData.length
      });
    } else {
      // No data for this interval
      trendData.push({
        timestamp: new Date(intervalEnd).toISOString(),
        avgResponseTime: 0,
        executions: 0,
        sqlCount: 0
      });
    }
  }

  return trendData;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '7d';
    const databaseId = searchParams.get('databaseId');

    // If no database ID provided, return demo data
    if (!databaseId) {
      return NextResponse.json({
        success: true,
        data: generateDemoTrendData(period),
        metadata: { source: 'demo', period }
      });
    }

    // Get database connection to verify ownership
    const pureSupabase = await createPureClient();
    const { data: dbConnection, error: dbError } = await pureSupabase
      .from('oracle_connections')
      .select('*')
      .eq('id', databaseId)
      .eq('created_by', userId)
      .eq('is_active', true)
      .single();

    if (dbError || !dbConnection) {
      return NextResponse.json({
        success: true,
        data: generateDemoTrendData(period),
        metadata: { source: 'demo-fallback', period, error: 'Database not found' }
      });
    }

    try {
      const trendData = await getTrendDataFromSupabase(pureSupabase, databaseId, period);

      if (!trendData || trendData.length === 0) {
        return NextResponse.json({
          success: true,
          data: generateDemoTrendData(period),
          metadata: { source: 'demo-fallback', period, error: 'No trend data available' }
        });
      }

      return NextResponse.json({
        success: true,
        data: trendData,
        metadata: { source: 'supabase', period, databaseId }
      });

    } catch (error) {
      console.error('Supabase trend query error:', error);
      return NextResponse.json({
        success: true,
        data: generateDemoTrendData(period),
        metadata: { source: 'demo-fallback', period, error: 'Data query failed' }
      });
    }

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
