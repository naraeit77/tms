import { NextRequest, NextResponse } from 'next/server';
import { createClient, createPureClient } from '@/lib/supabase/server';
import { ReportConfiguration } from '@/types/reports';

export async function GET(request: NextRequest) {
  try {
    // Check authentication first
    const supabase = await createClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Use pure client to bypass RLS for server-side operations
    const pureSupabase = await createPureClient();
    const { searchParams } = new URL(request.url);

    // Get query parameters
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

    // Build query with enhanced filtering using pure client
    let query = pureSupabase
      .from('reports')
      .select(`
        id,
        user_id,
        template_id,
        name,
        description,
        type,
        config,
        status,
        file_path,
        file_size,
        generated_at,
        error_message,
        tags,
        created_at,
        updated_at
      `, { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (type && type !== 'all') {
      query = query.eq('type', type);
    }
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }
    if (tags.length > 0) {
      query = query.overlaps('tags', tags);
    }
    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }
    if (sizeMin) {
      query = query.gte('file_size', parseInt(sizeMin));
    }
    if (sizeMax) {
      query = query.lte('file_size', parseInt(sizeMax));
    }

    const { data, error, count } = await query;

    console.log('[Reports API] Query result:', {
      dataCount: data?.length,
      totalCount: count,
      userId,
      error: error?.message
    });

    if (error) {
      console.error('Database query error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch reports' },
        { status: 500 }
      );
    }

    // Transform data for frontend
    const transformedData = (data || []).map(report => ({
      id: report.id,
      title: report.name,
      description: report.description || '',
      type: report.type,
      period: report.config?.period || '7d',
      generatedAt: report.generated_at ? new Date(report.generated_at) : new Date(report.created_at),
      size: formatFileSize(report.file_size || 0),
      status: report.status,
      tags: report.tags || [],
      author: 'System',
      config: report.config,
      filePath: report.file_path,
      errorMessage: report.error_message
    }));

    return NextResponse.json({
      success: true,
      data: transformedData,
      pagination: {
        limit,
        offset,
        total: count || 0,
        hasMore: (offset + limit) < (count || 0)
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

export async function POST(request: NextRequest) {
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

    // Validate required fields
    if (!name || !type || !config) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate Oracle connections exist and user has access (if databases specified)
    if (config.databases && config.databases.length > 0) {
      const { data: connections, error: connectionError } = await supabase
        .from('oracle_connections')
        .select('id')
        .in('id', config.databases);

      if (connectionError || !connections || connections.length !== config.databases.length) {
        return NextResponse.json(
          { success: false, error: 'Invalid database connections' },
          { status: 400 }
        );
      }
    }

    // Create report metadata
    const reportData = {
      user_id: userId,
      template_id: type,
      name,
      description,
      type,
      config,
      status: 'draft' as const,
      tags: extractTagsFromConfig(config)
    };

    const { data: report, error: insertError } = await supabase
      .from('reports')
      .insert([reportData])
      .select()
      .single();

    if (insertError) {
      console.error('Failed to create report:', insertError);
      return NextResponse.json(
        { success: false, error: 'Failed to create report' },
        { status: 500 }
      );
    }

    // Complete report generation immediately (simulated)
    const mockFileSize = Math.floor(Math.random() * 50000000) + 1000000;

    const { error: updateError } = await supabase
      .from('reports')
      .update({
        status: 'completed',
        generated_at: new Date().toISOString(),
        file_path: `/reports/${report.id}.${config.format || 'pdf'}`,
        file_size: mockFileSize
      })
      .eq('id', report.id);

    if (updateError) {
      console.error('Failed to update report status:', updateError);
    }

    // Log generation activity
    await supabase.from('report_activities').insert({
      report_id: report.id,
      user_id: userId,
      action: 'generated',
      details: {
        type,
        config: { period: config.period, databases: config.databases?.length || 0 },
        file_size: mockFileSize,
        format: config.format || 'pdf'
      }
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
    const reportId = searchParams.get('id');

    if (!reportId) {
      return NextResponse.json(
        { success: false, error: 'Report ID is required' },
        { status: 400 }
      );
    }

    // Use pure client to bypass RLS
    const pureSupabase = await createPureClient();

    // Verify report belongs to user
    const { data: report, error: fetchError } = await pureSupabase
      .from('reports')
      .select('id, user_id')
      .eq('id', reportId)
      .single();

    if (fetchError || !report) {
      return NextResponse.json(
        { success: false, error: 'Report not found' },
        { status: 404 }
      );
    }

    if (report.user_id !== userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized to delete this report' },
        { status: 403 }
      );
    }

    // Delete report activities first (foreign key constraint)
    await pureSupabase
      .from('report_activities')
      .delete()
      .eq('report_id', reportId);

    // Delete report
    const { error: deleteError } = await pureSupabase
      .from('reports')
      .delete()
      .eq('id', reportId);

    if (deleteError) {
      console.error('Failed to delete report:', deleteError);
      return NextResponse.json(
        { success: false, error: 'Failed to delete report' },
        { status: 500 }
      );
    }

    // Log deletion activity
    await pureSupabase.from('report_activities').insert({
      report_id: reportId,
      user_id: userId,
      action: 'deleted',
      details: { deleted_at: new Date().toISOString() }
    });

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

  // Add period-based tags
  if (config.period === '24h') tags.push('실시간');
  if (config.period === '7d') tags.push('주간');
  if (config.period === '30d') tags.push('월간');
  if (config.period === '90d') tags.push('분기');

  // Add content-based tags
  if (config.include_charts) tags.push('차트');
  if (config.include_recommendations) tags.push('권장사항');
  if (config.include_raw_data) tags.push('원시데이터');

  // Add filter-based tags
  if (config.filters?.performance_grade && config.filters.performance_grade.length > 0) {
    tags.push('성능필터');
  }
  if (config.filters?.min_executions) {
    tags.push('실행횟수필터');
  }

  // Add database count tag
  if (config.databases && config.databases.length > 1) {
    tags.push('다중DB');
  }

  return tags.slice(0, 5); // Limit to 5 tags
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
