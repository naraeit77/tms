import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { reports, reportActivities } from '@/db/schema';
import { eq, and, desc, ilike, or, gte, lte, arrayOverlaps, sql, count } from 'drizzle-orm';
import { oracleConnections } from '@/db/schema';
import { ReportConfiguration } from '@/types/reports';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (process.env.NODE_ENV === 'development') {
      console.log('[Reports API] Session check:', {
        hasSession: !!session,
        hasUser: !!session?.user,
        userId: session?.user?.id,
        userEmail: session?.user?.email
      });
    }

    if (!session?.user?.id) {
      console.log('[Reports API] Unauthorized - no session or user id');
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    console.log('[Reports API] Authenticated user:', userId);

    const { searchParams } = new URL(request.url);

    const type = searchParams.get('type');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const tags = searchParams.get('tags')?.split(',').filter(Boolean) || [];
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const sizeMin = searchParams.get('sizeMin');
    const sizeMax = searchParams.get('sizeMax');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build conditions
    const conditions = [eq(reports.userId, userId)];

    if (type && type !== 'all') {
      conditions.push(eq(reports.type, type));
    }
    if (status && status !== 'all') {
      conditions.push(eq(reports.status, status));
    }
    if (search) {
      conditions.push(
        or(
          ilike(reports.name, `%${search}%`),
          ilike(reports.description, `%${search}%`)
        )!
      );
    }
    if (tags.length > 0) {
      conditions.push(arrayOverlaps(reports.tags, tags));
    }
    if (dateFrom) {
      conditions.push(gte(reports.createdAt, new Date(dateFrom)));
    }
    if (dateTo) {
      conditions.push(lte(reports.createdAt, new Date(dateTo)));
    }
    if (sizeMin) {
      conditions.push(gte(reports.fileSize, parseInt(sizeMin)));
    }
    if (sizeMax) {
      conditions.push(lte(reports.fileSize, parseInt(sizeMax)));
    }

    const whereClause = and(...conditions);

    // Get total count
    const [countResult] = await db
      .select({ total: count() })
      .from(reports)
      .where(whereClause);

    const total = countResult?.total || 0;

    // Get paginated data
    const data = await db
      .select()
      .from(reports)
      .where(whereClause)
      .orderBy(desc(reports.createdAt))
      .limit(limit)
      .offset(offset);

    if (process.env.NODE_ENV === 'development') {
      console.log('[Reports API] Query result:', {
        dataCount: data?.length,
        totalCount: total,
        userId,
      });
    }

    // Transform data for frontend
    const transformedData = (data || []).map(report => ({
      id: report.id,
      title: report.name,
      description: report.description || '',
      type: report.type,
      period: (report.config as any)?.period || '7d',
      generatedAt: report.generatedAt ? new Date(report.generatedAt) : new Date(report.createdAt),
      size: formatFileSize(report.fileSize || 0),
      status: report.status,
      tags: report.tags || [],
      author: 'System',
      config: report.config,
      filePath: report.filePath,
      errorMessage: report.errorMessage
    }));

    return NextResponse.json({
      success: true,
      data: transformedData,
      pagination: {
        limit,
        offset,
        total,
        hasMore: (offset + limit) < total
      }
    });

  } catch (error) {
    console.error('[Reports API] Error:', error);
    if (error instanceof Error) {
      console.error('[Reports API] Error stack:', error.stack);
    }
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const body = await request.json();

    const {
      name,
      description,
      type,
      config
    }: {
      name: string;
      description?: string;
      type: 'summary' | 'detailed' | 'trend' | 'comparison';
      config: ReportConfiguration;
    } = body;

    if (!name || !type || !config) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate Oracle connections exist (if databases specified)
    if (config.databases && config.databases.length > 0) {
      const connections = await db
        .select({ id: oracleConnections.id })
        .from(oracleConnections)
        .where(
          sql`${oracleConnections.id} IN ${config.databases}`
        );

      if (!connections || connections.length !== config.databases.length) {
        return NextResponse.json(
          { success: false, error: 'Invalid database connections' },
          { status: 400 }
        );
      }
    }

    // Create report metadata
    let report;
    try {
      const [inserted] = await db
        .insert(reports)
        .values({
          userId,
          templateId: type,
          name,
          description: description || null,
          type,
          config: config as any,
          status: 'draft',
          tags: extractTagsFromConfig(config),
        })
        .returning();
      report = inserted;
    } catch (insertError: any) {
      console.error('Failed to create report:', insertError);

      // Handle foreign key constraint violation
      if (insertError.code === '23503' && insertError.message?.includes('user_id')) {
        return NextResponse.json(
          {
            success: false,
            error: '사용자 인증 정보를 찾을 수 없습니다. 다시 로그인해주세요.',
            code: 'USER_NOT_FOUND'
          },
          { status: 401 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: insertError.code === '23503'
            ? '데이터베이스 제약 조건 오류가 발생했습니다. 관리자에게 문의해주세요.'
            : '보고서 생성에 실패했습니다.',
          code: insertError.code,
          details: insertError.message
        },
        { status: 500 }
      );
    }

    // Calculate estimated file size
    const baseSize = 50000;
    const perDatabaseSize = 20000;
    const chartOverhead = config.include_charts ? 100000 : 0;
    const recommendationsOverhead = config.include_recommendations ? 30000 : 0;
    const rawDataOverhead = config.include_raw_data ? 200000 : 0;
    const periodMultiplier = config.period === '90d' ? 3 : config.period === '30d' ? 2 : 1;

    const estimatedFileSize = Math.round(
      (baseSize +
       (config.databases?.length || 1) * perDatabaseSize +
       chartOverhead +
       recommendationsOverhead +
       rawDataOverhead) * periodMultiplier
    );

    await db
      .update(reports)
      .set({
        status: 'completed',
        generatedAt: new Date(),
        filePath: `/reports/${report.id}.${config.format || 'pdf'}`,
        fileSize: estimatedFileSize,
      })
      .where(eq(reports.id, report.id));

    // Log generation activity
    await db.insert(reportActivities).values({
      reportId: report.id,
      userId,
      action: 'generated',
      details: {
        type,
        config: { period: config.period, databases: config.databases?.length || 0 },
        file_size: estimatedFileSize,
        format: config.format || 'pdf'
      },
    });

    return NextResponse.json({
      success: true,
      data: report
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
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
    const reportId = searchParams.get('id');

    if (!reportId) {
      return NextResponse.json(
        { success: false, error: 'Report ID is required' },
        { status: 400 }
      );
    }

    // Verify report belongs to user
    const [report] = await db
      .select({ id: reports.id, userId: reports.userId })
      .from(reports)
      .where(eq(reports.id, reportId))
      .limit(1);

    if (!report) {
      return NextResponse.json(
        { success: false, error: 'Report not found' },
        { status: 404 }
      );
    }

    if (report.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized to delete this report' },
        { status: 403 }
      );
    }

    // Delete report activities first (foreign key constraint)
    await db
      .delete(reportActivities)
      .where(eq(reportActivities.reportId, reportId));

    // Delete report
    await db
      .delete(reports)
      .where(eq(reports.id, reportId));

    // Log deletion activity (after delete, so FK won't block)
    try {
      await db.insert(reportActivities).values({
        reportId,
        userId,
        action: 'deleted',
        details: { deleted_at: new Date().toISOString() },
      });
    } catch {
      // Ignore if FK constraint prevents logging after deletion
    }

    return NextResponse.json({
      success: true,
      message: 'Report deleted successfully'
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function extractTagsFromConfig(config: ReportConfiguration): string[] {
  const tags: string[] = [];

  if (config.period === '24h') tags.push('실시간');
  if (config.period === '7d') tags.push('주간');
  if (config.period === '30d') tags.push('월간');
  if (config.period === '90d') tags.push('분기');

  if (config.include_charts) tags.push('차트');
  if (config.include_recommendations) tags.push('권장사항');
  if (config.include_raw_data) tags.push('원시데이터');

  if (config.filters?.performance_grade && config.filters.performance_grade.length > 0) {
    tags.push('성능필터');
  }
  if (config.filters?.min_executions) {
    tags.push('실행횟수필터');
  }

  if (config.databases && config.databases.length > 1) {
    tags.push('다중DB');
  }

  return tags.slice(0, 5);
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
