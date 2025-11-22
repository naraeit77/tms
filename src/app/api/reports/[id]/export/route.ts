import { NextRequest, NextResponse } from 'next/server';
import { createClient, createPureClient } from '@/lib/supabase/server';

interface ExportOptions {
  format: 'pdf' | 'excel' | 'csv' | 'json' | 'html';
  includeCharts: boolean;
  includeRawData: boolean;
  includeMetadata: boolean;
  dateRange?: string;
  customFilename?: string;
}

export async function POST(
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
    const exportOptions: ExportOptions = await request.json();

    // Use pure client to bypass RLS
    const pureSupabase = await createPureClient();

    // Verify user has access to the report
    const { data: report, error: reportError } = await pureSupabase
      .from('reports')
      .select('*')
      .eq('id', reportId)
      .eq('user_id', userId)
      .single();

    if (reportError || !report) {
      return NextResponse.json(
        { success: false, error: 'Report not found' },
        { status: 404 }
      );
    }

    // Check if report is completed
    if (report.status !== 'completed') {
      return NextResponse.json(
        { success: false, error: 'Report is not ready for export' },
        { status: 400 }
      );
    }

    // Generate export based on options
    const exportData = await generateExport(report, exportOptions);

    // Log export activity
    await pureSupabase.from('report_activities').insert({
      report_id: reportId,
      user_id: userId,
      action: 'downloaded',
      details: {
        format: exportOptions.format,
        filename: exportOptions.customFilename,
        includeCharts: exportOptions.includeCharts,
        includeRawData: exportOptions.includeRawData
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        downloadUrl: exportData.downloadUrl,
        filename: exportData.filename,
        size: exportData.size,
        format: exportOptions.format
      }
    });

  } catch (error) {
    console.error('Export API error:', error);
    return NextResponse.json(
      { success: false, error: 'Export failed' },
      { status: 500 }
    );
  }
}

async function generateExport(report: any, options: ExportOptions) {
  // In a real implementation, this would generate the actual file
  // For now, we'll simulate the export process

  const filename = options.customFilename || `${report.name}_${new Date().toISOString().split('T')[0]}.${options.format}`;

  // Simulate export processing time
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Calculate mock file size based on options
  let baseSize = 2 * 1024 * 1024; // 2MB base
  if (options.includeCharts) baseSize += 1.5 * 1024 * 1024;
  if (options.includeRawData) baseSize += 3 * 1024 * 1024;
  if (options.format === 'excel') baseSize *= 1.2;
  if (options.format === 'pdf') baseSize *= 0.8;

  const mockDownloadUrl = `/api/reports/${report.id}/download?format=${options.format}&token=${generateDownloadToken()}`;

  return {
    downloadUrl: mockDownloadUrl,
    filename,
    size: Math.floor(baseSize),
    format: options.format
  };
}

function generateDownloadToken(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
