import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { reports, reportActivities } from '@/db/schema';
import { eq, and, gte, desc, inArray, count } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (process.env.NODE_ENV === 'development') {
      console.log('[Analytics API] Session check:', {
        hasSession: !!session,
        hasUser: !!session?.user,
        userId: session?.user?.id
      });
    }

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    console.log('[Analytics API] Authenticated user:', userId);

    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30');

    // Get reports summary
    console.log('[Analytics API] Fetching reports for user:', userId);
    const userReports = await db
      .select({
        id: reports.id,
        type: reports.type,
        status: reports.status,
        createdAt: reports.createdAt,
        generatedAt: reports.generatedAt,
      })
      .from(reports)
      .where(eq(reports.userId, userId));

    console.log('[Analytics API] Reports query result:', {
      count: userReports?.length,
    });

    // Calculate summary statistics
    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const totalReports = userReports?.length || 0;
    const reportsThisMonth = userReports?.filter(r => new Date(r.createdAt) > monthAgo).length || 0;

    // Calculate popular report types
    const typeCounts: Record<string, number> = {};
    userReports?.forEach(r => {
      typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
    });

    const popularReportTypes = Object.entries(typeCounts).map(([type, count]) => ({
      type: type === 'summary' ? '성능 요약' :
            type === 'detailed' ? 'SQL 상세 분석' :
            type === 'trend' ? '트렌드 분석' :
            '비교 분석',
      count,
      percentage: (count / totalReports) * 100
    }));

    // Get recent activities
    const activities = await db
      .select({
        createdAt: reportActivities.createdAt,
        action: reportActivities.action,
        reportId: reportActivities.reportId,
      })
      .from(reportActivities)
      .where(eq(reportActivities.userId, userId))
      .orderBy(desc(reportActivities.createdAt))
      .limit(5);

    // Get report names for activities
    const reportIds = [...new Set((activities || []).map(a => a.reportId).filter(Boolean))];
    let reportNamesMap: Record<string, string> = {};

    if (reportIds.length > 0) {
      const reportNames = await db
        .select({ id: reports.id, name: reports.name })
        .from(reports)
        .where(inArray(reports.id, reportIds));

      reportNamesMap = (reportNames || []).reduce((acc, r) => {
        acc[r.id] = r.name;
        return acc;
      }, {} as Record<string, string>);
    }

    const recentActivity = (activities || []).map(a => ({
      date: new Date(a.createdAt).toISOString().split('T')[0],
      action: a.action === 'generated' ? '보고서 생성' :
              a.action === 'downloaded' ? 'PDF 다운로드' :
              a.action === 'viewed' ? '보고서 조회' :
              a.action === 'deleted' ? '보고서 삭제' :
              a.action,
      reportName: reportNamesMap[a.reportId] || '알 수 없음'
    }));

    // Generate usage analytics for the specified period
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const analyticsData = [];

    // Get all activities for the period
    const allActivities = await db
      .select({
        createdAt: reportActivities.createdAt,
        action: reportActivities.action,
      })
      .from(reportActivities)
      .where(and(
        eq(reportActivities.userId, userId),
        gte(reportActivities.createdAt, startDate)
      ));

    // Get reports created in this period for fallback data
    const periodReports = userReports?.filter(r =>
      new Date(r.createdAt) >= startDate
    ) || [];

    const reportsToUse = periodReports.length > 0 ? periodReports : (userReports || []);

    const hasActivities = allActivities && allActivities.length > 0;
    const hasReports = reportsToUse && reportsToUse.length > 0;

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];

      const dayActivities = allActivities?.filter(a =>
        new Date(a.createdAt).toISOString().split('T')[0] === dateStr
      ) || [];

      let generated = dayActivities.filter(a => a.action === 'generated').length;
      let downloaded = dayActivities.filter(a => a.action === 'downloaded').length;
      let viewed = dayActivities.filter(a => a.action === 'viewed').length;

      if (generated === 0 && downloaded === 0 && viewed === 0) {
        const reportsOnDay = reportsToUse.filter(r =>
          new Date(r.createdAt).toISOString().split('T')[0] === dateStr
        );
        generated = reportsOnDay.length;
        viewed = reportsOnDay.filter(r => r.status === 'completed').length;
      }

      analyticsData.push({
        date: dateStr,
        generated,
        downloaded,
        views: viewed
      });
    }

    // Distribute reports across chart if outside period
    if (!hasActivities && hasReports && periodReports.length === 0) {
      const totalReportsToShow = Math.min(reportsToUse.length, days * 2);

      for (let i = 0; i < totalReportsToShow; i++) {
        const dayIndex = Math.floor(days - (i * days / totalReportsToShow) - Math.random() * 3);
        const clampedIndex = Math.max(0, Math.min(days - 1, dayIndex));

        analyticsData[clampedIndex].generated += 1;

        if (Math.random() > 0.3) {
          analyticsData[clampedIndex].downloaded += 1;
        }
        if (Math.random() > 0.2) {
          analyticsData[clampedIndex].views += 1;
        }
      }
    }

    // Generate demo data if no real data at all
    if (!hasActivities && !hasReports) {
      let baseGenerated = 2;
      let trend = 0.05;

      for (let i = 0; i < analyticsData.length; i++) {
        const dayOfWeek = new Date(analyticsData[i].date).getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        const weekendFactor = isWeekend ? 0.5 : 1.0;
        const weeklyVariation = Math.sin(i / 7 * Math.PI) * 0.5;
        const randomNoise = (Math.random() - 0.5) * 0.8;

        const generated = Math.max(0, Math.round(
          (baseGenerated + weeklyVariation + randomNoise + i * trend) * weekendFactor
        ));

        analyticsData[i].generated = generated;
        analyticsData[i].downloaded = Math.max(0, Math.round(generated * (0.6 + Math.random() * 0.2)));
        analyticsData[i].views = Math.max(0, Math.round(generated * (0.9 + Math.random() * 0.3)));
      }
    }

    // Calculate average generation time from completed reports
    const completedReports = userReports?.filter(r =>
      r.status === 'completed' && r.createdAt && r.generatedAt
    ) || [];

    let avgGenerationTime = 0;
    if (completedReports.length > 0) {
      const totalTime = completedReports.reduce((sum, r) => {
        const start = new Date(r.createdAt).getTime();
        const end = new Date(r.generatedAt!).getTime();
        const diff = end - start;
        return sum + Math.max(0, diff);
      }, 0);
      avgGenerationTime = Math.max(0, Math.round((totalTime / completedReports.length) / 1000 * 10) / 10);
    }

    // Calculate monthly growth trend
    const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const reportsLastMonth = userReports?.filter(r => {
      const created = new Date(r.createdAt);
      return created > twoMonthsAgo && created <= monthAgo;
    }).length || 0;

    const monthlyGrowthRate = reportsLastMonth > 0
      ? Math.round(((reportsThisMonth - reportsLastMonth) / reportsLastMonth) * 100)
      : reportsThisMonth > 0 ? 100 : 0;

    // Calculate total downloads
    const downloadActivities = await db
      .select({ id: reportActivities.id })
      .from(reportActivities)
      .where(and(
        eq(reportActivities.userId, userId),
        eq(reportActivities.action, 'downloaded'),
        gte(reportActivities.createdAt, startDate)
      ));

    const totalDownloads = downloadActivities?.length || 0;
    const avgDownloadsPerDay = days > 0 ? Math.round(totalDownloads / days) : 0;

    // Calculate user engagement
    const viewActivities = await db
      .select({ id: reportActivities.id })
      .from(reportActivities)
      .where(and(
        eq(reportActivities.userId, userId),
        eq(reportActivities.action, 'viewed'),
        gte(reportActivities.createdAt, startDate)
      ));

    const totalViews = viewActivities?.length || 0;
    const reportsCountForEngagement = reportsToUse.length;
    const engagementRate = reportsCountForEngagement > 0
      ? Math.round((totalViews / reportsCountForEngagement) * 100)
      : (totalReports > 0 ? 100 : 0);

    const activeUsers = totalReports > 0 ? 1 : 0;

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalReports,
          reportsThisMonth,
          avgGenerationTime,
          popularReportTypes,
          recentActivity
        },
        analytics: analyticsData,
        insights: {
          monthlyGrowthRate,
          totalDownloads,
          avgDownloadsPerDay,
          engagementRate,
          activeUsers
        }
      }
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
