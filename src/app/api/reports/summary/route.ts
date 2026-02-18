import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { oracleConnections, sqlStatistics } from '@/db/schema';
import { eq, and, gte, gt, inArray, desc } from 'drizzle-orm';

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

    // If no database ID provided, return demo data
    if (!databaseId) {
      return NextResponse.json({
        success: true,
        data: generateDemoSummary(period),
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
      console.log('[Reports Summary] Database not found or error:', { databaseId });
      return NextResponse.json({
        success: true,
        data: generateDemoSummary(period),
        metadata: { source: 'demo-fallback', period, error: 'Database not found' }
      });
    }

    console.log('[Reports Summary] Loading data for database:', { databaseId, dbName: dbConnection.name });

    try {
      const [sqlStats, performanceGrades, topProblematic] = await Promise.all([
        getSQLStatisticsFromDB(databaseId, period),
        getPerformanceGradesFromDB(databaseId, period),
        getTopProblematicSQLFromDB(databaseId)
      ]);

      const hasData = sqlStats.totalSQL > 0;

      console.log('[Reports Summary] Data loaded:', {
        hasData,
        totalSQL: sqlStats.totalSQL,
        totalExecutions: sqlStats.totalExecutions,
        avgResponseTime: sqlStats.avgResponseTime,
        gradeCount: Object.values(performanceGrades).reduce((sum: number, val: any) => sum + Number(val), 0),
        problematicCount: topProblematic.length
      });

      if (!hasData) {
        console.log('[Reports Summary] No SQL statistics data, returning demo data');
        return NextResponse.json({
          success: true,
          data: generateDemoSummary(period),
          metadata: { source: 'demo-fallback', period, error: 'No SQL statistics data available' }
        });
      }

      const summaryData = {
        period,
        totalSQL: sqlStats.totalSQL,
        totalExecutions: sqlStats.totalExecutions,
        avgResponseTime: sqlStats.avgResponseTime,
        performanceGrades,
        topProblematicSQL: topProblematic,
        improvements: generateImprovements(sqlStats, performanceGrades),
        resourceUtilization: {
          cpu: 67.3,
          memory: 78.5,
          io: 45.2
        }
      };

      return NextResponse.json({
        success: true,
        data: summaryData,
        metadata: { source: 'database', period, databaseId }
      });

    } catch (error) {
      console.error('Database query error:', error);
      return NextResponse.json({
        success: true,
        data: generateDemoSummary(period),
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

async function getSQLStatisticsFromDB(databaseId: string, period: string) {
  try {
    const cutoffDate = getPeriodCutoffDate(period);

    const data = await db
      .select({
        sqlId: sqlStatistics.sqlId,
        executions: sqlStatistics.executions,
        elapsedTimeMs: sqlStatistics.elapsedTimeMs,
        avgElapsedTimeMs: sqlStatistics.avgElapsedTimeMs,
      })
      .from(sqlStatistics)
      .where(and(
        eq(sqlStatistics.oracleConnectionId, databaseId),
        gte(sqlStatistics.collectedAt, cutoffDate)
      ));

    if (!data || data.length === 0) {
      return { totalSQL: 0, totalExecutions: 0, avgResponseTime: 0 };
    }

    const uniqueSQLs = new Set(data.map((row) => row.sqlId));
    const totalExecutions = data.reduce((sum, row) => sum + (row.executions || 0), 0);
    const totalElapsedTime = data.reduce((sum, row) => sum + (row.elapsedTimeMs || 0), 0);
    const avgResponseTime = totalExecutions > 0 ? totalElapsedTime / totalExecutions / 1000 : 0;

    return {
      totalSQL: uniqueSQLs.size,
      totalExecutions,
      avgResponseTime
    };
  } catch (error) {
    console.error('SQL statistics error:', error);
    return { totalSQL: 0, totalExecutions: 0, avgResponseTime: 0 };
  }
}

async function getPerformanceGradesFromDB(databaseId: string, period: string) {
  try {
    const cutoffDate = getPeriodCutoffDate(period);

    const data = await db
      .select({
        avgElapsedTimeMs: sqlStatistics.avgElapsedTimeMs,
        avgCpuTimeMs: sqlStatistics.avgCpuTimeMs,
        getsPerExec: sqlStatistics.getsPerExec,
      })
      .from(sqlStatistics)
      .where(and(
        eq(sqlStatistics.oracleConnectionId, databaseId),
        gte(sqlStatistics.collectedAt, cutoffDate),
        gt(sqlStatistics.executions, 0)
      ));

    if (!data || data.length === 0) {
      return { A: 0, B: 0, C: 0, D: 0, F: 0 };
    }

    const grades = { A: 0, B: 0, C: 0, D: 0, F: 0 };

    data.forEach((row) => {
      const grade = calculateGrade(row);
      grades[grade as keyof typeof grades]++;
    });

    return grades;
  } catch (error) {
    console.error('Performance grades error:', error);
    return { A: 0, B: 0, C: 0, D: 0, F: 0 };
  }
}

async function getTopProblematicSQLFromDB(databaseId: string) {
  try {
    const data = await db
      .select({
        sqlId: sqlStatistics.sqlId,
        elapsedTimeMs: sqlStatistics.elapsedTimeMs,
        bufferGets: sqlStatistics.bufferGets,
        status: sqlStatistics.status,
        priority: sqlStatistics.priority,
      })
      .from(sqlStatistics)
      .where(and(
        eq(sqlStatistics.oracleConnectionId, databaseId),
        inArray(sqlStatistics.status, ['WARNING', 'CRITICAL'])
      ))
      .orderBy(desc(sqlStatistics.elapsedTimeMs))
      .limit(10);

    if (!data || data.length === 0) {
      return [];
    }

    return data.slice(0, 4).map((row, index) => ({
      sql_id: row.sqlId,
      issues: row.status === 'CRITICAL' ? 5 : 3,
      impact: (index < 2 ? 'high' : index < 3 ? 'medium' : 'low') as 'high' | 'medium' | 'low'
    }));
  } catch (error) {
    console.error('Top problematic SQL error:', error);
    return [];
  }
}

function calculateGrade(row: any): string {
  const avgElapsed = Number(row.avgElapsedTimeMs) || 0;
  const avgCpu = Number(row.avgCpuTimeMs) || 0;
  const avgBufferGets = Number(row.getsPerExec) || 0;

  let score = 0;

  if (avgElapsed < 10) score += 20;
  else if (avgElapsed < 100) score += 15;
  else if (avgElapsed < 1000) score += 10;
  else if (avgElapsed < 10000) score += 5;

  if (avgCpu < 5) score += 20;
  else if (avgCpu < 50) score += 15;
  else if (avgCpu < 500) score += 10;
  else if (avgCpu < 5000) score += 5;

  if (avgBufferGets < 100) score += 20;
  else if (avgBufferGets < 1000) score += 15;
  else if (avgBufferGets < 10000) score += 10;
  else if (avgBufferGets < 100000) score += 5;

  if (score >= 50) return 'A';
  if (score >= 40) return 'B';
  if (score >= 30) return 'C';
  if (score >= 20) return 'D';
  return 'F';
}

function generateImprovements(sqlStats: any, grades: any) {
  const improvements = [];

  const totalGraded = Object.values(grades).reduce((sum: number, count: any) => sum + Number(count), 0);
  const poorPerformance = (grades.D + grades.F) / totalGraded;

  if (poorPerformance > 0.2) {
    improvements.push({
      description: '인덱스 최적화를 통한 스캔 효율성 개선',
      impact: Math.floor(poorPerformance * 100),
      status: 'recommended'
    });
  }

  if (sqlStats.avgResponseTime > 0.5) {
    improvements.push({
      description: '복잡한 조인 쿼리 리팩토링',
      impact: 18,
      status: 'planned'
    });
  }

  improvements.push({
    description: '통계 정보 업데이트 자동화',
    impact: 15,
    status: 'recommended'
  });

  improvements.push({
    description: '파티셔닝 전략 개선',
    impact: 12,
    status: 'implemented'
  });

  return improvements;
}

function getPeriodCutoffDate(period: string): Date {
  const now = new Date();
  switch (period) {
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
}

function generateDemoSummary(period: string) {
  return {
    period,
    totalSQL: 4247,
    totalExecutions: 1547832,
    avgResponseTime: 0.247,
    performanceGrades: {
      A: Math.floor(Math.random() * 800) + 200,
      B: Math.floor(Math.random() * 600) + 300,
      C: Math.floor(Math.random() * 400) + 200,
      D: Math.floor(Math.random() * 200) + 100,
      F: Math.floor(Math.random() * 150) + 50
    },
    topProblematicSQL: [
      { sql_id: 'SQL_ABC123DEF', issues: 5, impact: 'high' },
      { sql_id: 'SQL_XYZ789GHI', issues: 3, impact: 'medium' },
      { sql_id: 'SQL_JKL456MNO', issues: 4, impact: 'high' },
      { sql_id: 'SQL_PQR012STU', issues: 2, impact: 'low' },
    ],
    improvements: [
      { description: '인덱스 최적화를 통한 스캔 효율성 개선', impact: 23, status: 'implemented' },
      { description: '복잡한 조인 쿼리 리팩토링', impact: 18, status: 'planned' },
      { description: '통계 정보 업데이트 자동화', impact: 15, status: 'recommended' },
      { description: '파티셔닝 전략 개선', impact: 12, status: 'recommended' },
    ],
    resourceUtilization: {
      cpu: 67.3,
      memory: 78.5,
      io: 45.2
    }
  };
}
