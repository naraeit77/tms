import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { reports, reportActivities } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

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
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const params = await context.params;
    const reportId = params.id;
    const exportOptions: ExportOptions = await request.json();

    // Verify user has access to the report
    const [report] = await db
      .select()
      .from(reports)
      .where(and(eq(reports.id, reportId), eq(reports.userId, userId)))
      .limit(1);

    if (!report) {
      return NextResponse.json(
        { success: false, error: 'Report not found' },
        { status: 404 }
      );
    }

    if (report.status !== 'completed') {
      return NextResponse.json(
        { success: false, error: 'Report is not ready for export' },
        { status: 400 }
      );
    }

    // Generate export based on options
    const exportData = await generateExport(report, exportOptions);

    // Log export activity
    await db.insert(reportActivities).values({
      reportId,
      userId,
      action: 'downloaded',
      details: {
        format: exportOptions.format,
        filename: exportOptions.customFilename,
        includeCharts: exportOptions.includeCharts,
        includeRawData: exportOptions.includeRawData
      },
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
  const filename = options.customFilename || `${report.name}_${new Date().toISOString().split('T')[0]}.${options.format}`;

  await new Promise(resolve => setTimeout(resolve, 1000));

  let baseSize = 2 * 1024 * 1024;
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
