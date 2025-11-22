import { NextRequest, NextResponse } from 'next/server';
import { createClient, createPureClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const params = await context.params;
    const reportId = params.id;

    // Check authentication
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Use pure client to bypass RLS
    const pureSupabase = await createPureClient();

    // Get report details
    const { data: report, error } = await pureSupabase
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
      `)
      .eq('id', reportId)
      .eq('user_id', userId)
      .single();

    if (error || !report) {
      return NextResponse.json(
        { success: false, error: 'Report not found' },
        { status: 404 }
      );
    }

    // Log view activity
    await pureSupabase.from('report_activities').insert({
      report_id: reportId,
      user_id: userId,
      action: 'viewed'
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

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const params = await context.params;
    const reportId = params.id;

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

    // Use pure client to bypass RLS
    const pureSupabase = await createPureClient();

    // Verify report ownership
    const { data: existingReport, error: fetchError } = await pureSupabase
      .from('reports')
      .select('id, user_id')
      .eq('id', reportId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existingReport) {
      return NextResponse.json(
        { success: false, error: 'Report not found' },
        { status: 404 }
      );
    }

    // Update report
    const { data: updatedReport, error: updateError } = await pureSupabase
      .from('reports')
      .update({
        name: body.name,
        description: body.description,
        config: body.config,
        tags: body.tags,
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId)
      .eq('user_id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update report:', updateError);
      return NextResponse.json(
        { success: false, error: 'Failed to update report' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: updatedReport
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const params = await context.params;
    const reportId = params.id;

    // Check authentication
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // Use pure client to bypass RLS
    const pureSupabase = await createPureClient();

    // Verify report ownership
    const { data: existingReport, error: fetchError } = await pureSupabase
      .from('reports')
      .select('id, user_id, file_path')
      .eq('id', reportId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !existingReport) {
      return NextResponse.json(
        { success: false, error: 'Report not found' },
        { status: 404 }
      );
    }

    // Delete related activities first
    await pureSupabase
      .from('report_activities')
      .delete()
      .eq('report_id', reportId);

    // Delete report schedules if any
    await pureSupabase
      .from('report_schedules')
      .delete()
      .eq('report_id', reportId);

    // Delete the report
    const { error: deleteError } = await pureSupabase
      .from('reports')
      .delete()
      .eq('id', reportId)
      .eq('user_id', userId);

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
      details: { report_name: existingReport.file_path }
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
