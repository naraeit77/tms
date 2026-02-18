import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { oracleConnections, sqlStatistics } from '@/db/schema';
import { eq, and, gte, asc } from 'drizzle-orm';

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

    const baseResponseTime = 0.25;
    const variation = (Math.random() - 0.5) * 0.1;
    const trend = -i * 0.001;

    data.push({
      timestamp: timestamp.toISOString(),
      avgResponseTime: Math.max(0.05, baseResponseTime + variation + trend),
      executions: Math.floor(50000 + Math.random() * 20000),
      sqlCount: Math.floor(150 + Math.random() * 50)
    });
  }

  return data;
}

// Get trend data from local PostgreSQL
async function getTrendDataFromDB(databaseId: string, period: string) {
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

  // Query sql_statistics
  const data = await db
    .select({
      createdAt: sqlStatistics.createdAt,
      elapsedTimeMs: sqlStatistics.elapsedTimeMs,
      executions: sqlStatistics.executions,
    })
    .from(sqlStatistics)
    .where(and(
      eq(sqlStatistics.oracleConnectionId, databaseId),
      gte(sqlStatistics.createdAt, startDate)
    ))
    .orderBy(asc(sqlStatistics.createdAt));

  if (!data || data.length === 0) {
    return null;
  }

  // Group data by time intervals
  const intervals = period === '24h' ? 24 : period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const intervalMs = period === '24h'
    ? 60 * 60 * 1000
    : 24 * 60 * 60 * 1000;

  const now = Date.now();
  const trendData = [];

  for (let i = intervals - 1; i >= 0; i--) {
    const intervalStart = now - (i + 1) * intervalMs;
    const intervalEnd = now - i * intervalMs;

    const intervalData = data.filter((row) => {
      const rowTime = new Date(row.createdAt!).getTime();
      return rowTime >= intervalStart && rowTime < intervalEnd;
    });

    if (intervalData.length > 0) {
      const avgResponseTime = intervalData.reduce((sum, row) =>
        sum + (row.elapsedTimeMs || 0), 0) / intervalData.length;

      const totalExecutions = intervalData.reduce((sum, row) =>
        sum + (row.executions || 0), 0);

      trendData.push({
        timestamp: new Date(intervalEnd).toISOString(),
        avgResponseTime: avgResponseTime,
        executions: totalExecutions,
        sqlCount: intervalData.length
      });
    } else {
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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '7d';
    const databaseId = searchParams.get('databaseId');

    if (!databaseId) {
      return NextResponse.json({
        success: true,
        data: generateDemoTrendData(period),
        metadata: { source: 'demo', period }
      });
    }

    // Get database connection to verify ownership
    const [dbConnection] = await db
      .select()
      .from(oracleConnections)
      .where(and(
        eq(oracleConnections.id, databaseId),
        eq(oracleConnections.createdBy, userId),
        eq(oracleConnections.isActive, true)
      ))
      .limit(1);

    if (!dbConnection) {
      return NextResponse.json({
        success: true,
        data: generateDemoTrendData(period),
        metadata: { source: 'demo-fallback', period, error: 'Database not found' }
      });
    }

    try {
      const trendData = await getTrendDataFromDB(databaseId, period);

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
        metadata: { source: 'database', period, databaseId }
      });

    } catch (error) {
      console.error('Trend query error:', error);
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
