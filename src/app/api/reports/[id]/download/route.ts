import { NextRequest, NextResponse } from 'next/server';
import { createClient, createPureClient } from '@/lib/supabase/server';
import ExcelJS from 'exceljs';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const params = await context.params;
    const reportId = params.id;

    // Get format from query params
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'pdf';

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
        { success: false, error: 'Report is not ready for download' },
        { status: 400 }
      );
    }

    // Fetch related data based on report config
    const databaseIds = report.config?.databases || [];
    let sqlStats: any[] = [];
    let topQueries: any[] = [];
    let performanceSummary: any = null;

    if (databaseIds.length > 0) {
      // Get SQL statistics for the report period
      const { data: stats } = await pureSupabase
        .from('sql_statistics')
        .select('*')
        .in('oracle_connection_id', databaseIds)
        .order('elapsed_time_ms', { ascending: false })
        .limit(100);

      sqlStats = stats || [];

      // Get top slow queries
      const { data: slowQueries } = await pureSupabase
        .from('sql_statistics')
        .select('sql_id, sql_text, avg_elapsed_time_ms, executions, buffer_gets, cpu_time_ms')
        .in('oracle_connection_id', databaseIds)
        .order('avg_elapsed_time_ms', { ascending: false })
        .limit(10);

      topQueries = slowQueries || [];

      // Calculate performance summary
      if (sqlStats.length > 0) {
        const totalExecutions = sqlStats.reduce((sum, s) => sum + (s.executions || 0), 0);
        const avgResponseTime = sqlStats.reduce((sum, s) => sum + (s.avg_elapsed_time_ms || 0), 0) / sqlStats.length;
        const totalCpuTime = sqlStats.reduce((sum, s) => sum + (s.cpu_time_ms || 0), 0);
        const totalBufferGets = sqlStats.reduce((sum, s) => sum + (s.buffer_gets || 0), 0);

        performanceSummary = {
          totalQueries: sqlStats.length,
          totalExecutions,
          avgResponseTime: Math.round(avgResponseTime * 100) / 100,
          totalCpuTime,
          totalBufferGets,
          slowQueriesCount: topQueries.length
        };
      }
    }

    // Log download activity
    await pureSupabase.from('report_activities').insert({
      report_id: reportId,
      user_id: userId,
      action: 'downloaded',
      details: {
        format: format,
        timestamp: new Date().toISOString()
      }
    });

    // Prepare report data for generation
    const reportData = {
      report,
      sqlStats,
      topQueries,
      performanceSummary
    };

    // Generate file based on format
    let fileBuffer: Buffer;
    let contentType: string;
    let filename: string;

    switch (format) {
      case 'pdf':
        fileBuffer = generateSimplePDF(reportData);
        contentType = 'application/pdf';
        filename = `report-${report.id}.pdf`;
        break;
      case 'excel':
        fileBuffer = await generateExcelFile(reportData);
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        filename = `report-${report.id}.xlsx`;
        break;
      case 'csv':
        fileBuffer = generateCSVFile(reportData);
        contentType = 'text/csv';
        filename = `report-${report.id}.csv`;
        break;
      case 'json':
        fileBuffer = generateJSONFile(reportData);
        contentType = 'application/json';
        filename = `report-${report.id}.json`;
        break;
      case 'html':
        fileBuffer = generateHTMLFile(reportData);
        contentType = 'text/html';
        filename = `report-${report.id}.html`;
        break;
      default:
        fileBuffer = generateSimplePDF(reportData);
        contentType = 'application/pdf';
        filename = `report-${report.id}.pdf`;
    }

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('Download API error:', error);
    return NextResponse.json(
      { success: false, error: 'Download failed' },
      { status: 500 }
    );
  }
}

function generateSimplePDF(data: any): Buffer {
  // This creates a minimal valid PDF document
  // In production, use pdfkit, puppeteer, or jsPDF for proper PDF generation with Korean support

  const { report, performanceSummary, topQueries } = data;
  const date = new Date(report.generated_at || report.created_at).toISOString();

  // Create PDF content lines
  const lines: string[] = [];
  let yPos = 750;
  const lineHeight = 20;

  // Add header
  lines.push(`BT`);
  lines.push(`/F1 16 Tf`);
  lines.push(`50 ${yPos} Td`);
  lines.push(`(SQL Performance Analysis Report) Tj`);
  yPos -= 30;

  // Add report info
  lines.push(`0 -30 Td`);
  lines.push(`/F1 12 Tf`);
  lines.push(`(Report ID: ${report.id}) Tj`);
  lines.push(`0 -${lineHeight} Td`);
  lines.push(`(Report Type: ${report.type}) Tj`);
  lines.push(`0 -${lineHeight} Td`);
  lines.push(`(Status: ${report.status}) Tj`);
  lines.push(`0 -${lineHeight} Td`);
  lines.push(`(Generated: ${date}) Tj`);
  lines.push(`0 -40 Td`);

  // Add configuration
  lines.push(`(Configuration:) Tj`);
  lines.push(`0 -${lineHeight} Td`);
  lines.push(`(  Period: ${report.config?.period || '24h'}) Tj`);
  lines.push(`0 -${lineHeight} Td`);
  lines.push(`(  Databases: ${report.config?.databases?.length || 0}) Tj`);
  lines.push(`0 -${lineHeight} Td`);
  lines.push(`(  Include Charts: ${report.config?.include_charts ? 'Yes' : 'No'}) Tj`);
  lines.push(`0 -${lineHeight} Td`);
  lines.push(`(  Include Recommendations: ${report.config?.include_recommendations ? 'Yes' : 'No'}) Tj`);
  lines.push(`0 -40 Td`);

  // Add performance summary if available
  if (performanceSummary) {
    lines.push(`(Performance Summary:) Tj`);
    lines.push(`0 -${lineHeight} Td`);
    lines.push(`(  Total Queries: ${performanceSummary.totalQueries}) Tj`);
    lines.push(`0 -${lineHeight} Td`);
    lines.push(`(  Total Executions: ${performanceSummary.totalExecutions}) Tj`);
    lines.push(`0 -${lineHeight} Td`);
    lines.push(`(  Avg Response Time: ${performanceSummary.avgResponseTime}ms) Tj`);
    lines.push(`0 -${lineHeight} Td`);
    lines.push(`(  Total CPU Time: ${performanceSummary.totalCpuTime}ms) Tj`);
    lines.push(`0 -${lineHeight} Td`);
    lines.push(`(  Total Buffer Gets: ${performanceSummary.totalBufferGets}) Tj`);
    lines.push(`0 -40 Td`);
  }

  // Add top slow queries
  if (topQueries && topQueries.length > 0) {
    lines.push(`(Top Slow Queries:) Tj`);
    topQueries.slice(0, 5).forEach((query: any, index: number) => {
      lines.push(`0 -${lineHeight} Td`);
      lines.push(`(  ${index + 1}. SQL_ID: ${query.sql_id || 'N/A'}) Tj`);
      lines.push(`0 -${lineHeight} Td`);
      lines.push(`(     Avg Time: ${query.avg_elapsed_time_ms || 0}ms, Executions: ${query.executions || 0}) Tj`);
    });
    lines.push(`0 -40 Td`);
  }

  // Add note about data source
  if (performanceSummary) {
    lines.push(`(Data Source: Real database statistics) Tj`);
  } else {
    lines.push(`(Note: No performance data available for this report period.) Tj`);
  }

  lines.push(`ET`);

  const content = lines.join('\n');

  const contentLength = content.length;

  // Minimal valid PDF structure
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>
endobj
4 0 obj
<< /Length ${contentLength} >>
stream
${content}
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000317 00000 n
trailer
<< /Size 5 /Root 1 0 R >>
startxref
${400 + contentLength}
%%EOF`;

  return Buffer.from(pdf, 'binary');
}

async function generateExcelFile(data: any): Promise<Buffer> {
  const { report, performanceSummary, topQueries } = data;
  const date = new Date(report.generated_at || report.created_at).toISOString();

  // Create a new workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Narae TMS';
  workbook.created = new Date();

  // Add Report Information worksheet
  const infoSheet = workbook.addWorksheet('보고서 정보', {
    properties: { tabColor: { argb: '2563EB' } }
  });

  // Header styling
  const headerStyle = {
    font: { bold: true, size: 14, color: { argb: 'FFFFFF' } },
    fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: '2563EB' } },
    alignment: { vertical: 'middle' as const, horizontal: 'left' as const }
  };

  const labelStyle = {
    font: { bold: true },
    fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'F3F4F6' } }
  };

  // Report Information
  infoSheet.columns = [
    { key: 'label', width: 25 },
    { key: 'value', width: 50 }
  ];

  infoSheet.addRow({ label: '보고서 정보', value: '' });
  infoSheet.getRow(1).font = headerStyle.font;
  infoSheet.getRow(1).fill = headerStyle.fill;
  infoSheet.getRow(1).alignment = headerStyle.alignment;

  infoSheet.addRow({ label: '보고서 ID', value: report.id });
  infoSheet.addRow({ label: '보고서 유형', value: report.type });
  infoSheet.addRow({ label: '상태', value: report.status });
  infoSheet.addRow({ label: '생성 일시', value: date });
  infoSheet.addRow({ label: '분석 기간', value: report.config?.period || '24h' });
  infoSheet.addRow({ label: '데이터베이스 수', value: report.config?.databases?.length || 0 });
  infoSheet.addRow({ label: '차트 포함', value: report.config?.include_charts ? '예' : '아니오' });
  infoSheet.addRow({ label: '권장사항 포함', value: report.config?.include_recommendations ? '예' : '아니오' });

  // Style the labels
  for (let i = 2; i <= 9; i++) {
    infoSheet.getRow(i).getCell(1).fill = labelStyle.fill;
    infoSheet.getRow(i).getCell(1).font = labelStyle.font;
  }

  // Add Performance Summary if available
  if (performanceSummary) {
    infoSheet.addRow({});
    infoSheet.addRow({ label: '성능 요약', value: '' });
    infoSheet.getRow(11).font = headerStyle.font;
    infoSheet.getRow(11).fill = headerStyle.fill;
    infoSheet.getRow(11).alignment = headerStyle.alignment;

    infoSheet.addRow({ label: '전체 쿼리 수', value: performanceSummary.totalQueries });
    infoSheet.addRow({ label: '총 실행 횟수', value: performanceSummary.totalExecutions });
    infoSheet.addRow({ label: '평균 응답 시간 (ms)', value: performanceSummary.avgResponseTime });
    infoSheet.addRow({ label: '총 CPU 시간 (ms)', value: performanceSummary.totalCpuTime });
    infoSheet.addRow({ label: '총 버퍼 읽기', value: performanceSummary.totalBufferGets });

    for (let i = 12; i <= 16; i++) {
      infoSheet.getRow(i).getCell(1).fill = labelStyle.fill;
      infoSheet.getRow(i).getCell(1).font = labelStyle.font;
    }
  }

  // Add Top Slow Queries worksheet if available
  if (topQueries && topQueries.length > 0) {
    const queriesSheet = workbook.addWorksheet('느린 쿼리', {
      properties: { tabColor: { argb: 'F59E0B' } }
    });

    queriesSheet.columns = [
      { key: 'rank', header: '순위', width: 8 },
      { key: 'sql_id', header: 'SQL ID', width: 20 },
      { key: 'avg_time', header: '평균 시간 (ms)', width: 18 },
      { key: 'executions', header: '실행 횟수', width: 15 },
      { key: 'buffer_gets', header: '버퍼 읽기', width: 15 },
      { key: 'cpu_time', header: 'CPU 시간 (ms)', width: 18 },
      { key: 'sql_text', header: 'SQL 미리보기', width: 60 }
    ];

    // Style header row
    const headerRow = queriesSheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F59E0B' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 25;

    // Add data rows
    topQueries.forEach((query: any, index: number) => {
      const sqlTextPreview = (query.sql_text || '').substring(0, 200);
      const row = queriesSheet.addRow({
        rank: index + 1,
        sql_id: query.sql_id || 'N/A',
        avg_time: query.avg_elapsed_time_ms || 0,
        executions: query.executions || 0,
        buffer_gets: query.buffer_gets || 0,
        cpu_time: query.cpu_time_ms || 0,
        sql_text: sqlTextPreview
      });

      // Color code based on response time
      const avgTime = query.avg_elapsed_time_ms || 0;
      if (avgTime > 1000) {
        row.getCell('avg_time').font = { color: { argb: 'EF4444' }, bold: true };
      } else if (avgTime > 500) {
        row.getCell('avg_time').font = { color: { argb: 'F59E0B' }, bold: true };
      } else {
        row.getCell('avg_time').font = { color: { argb: '10B981' } };
      }

      // Format numbers with thousand separators
      row.getCell('executions').numFmt = '#,##0';
      row.getCell('buffer_gets').numFmt = '#,##0';
      row.getCell('avg_time').numFmt = '#,##0.00';
      row.getCell('cpu_time').numFmt = '#,##0.00';

      // Align numbers to right
      row.getCell('avg_time').alignment = { horizontal: 'right' };
      row.getCell('executions').alignment = { horizontal: 'right' };
      row.getCell('buffer_gets').alignment = { horizontal: 'right' };
      row.getCell('cpu_time').alignment = { horizontal: 'right' };
    });

    // Add borders to all cells
    queriesSheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'E5E7EB' } },
          left: { style: 'thin', color: { argb: 'E5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'E5E7EB' } },
          right: { style: 'thin', color: { argb: 'E5E7EB' } }
        };
      });
    });
  }

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function generateCSVFile(data: any): Buffer {
  const csvContent = generateCSVContent(data);
  return Buffer.from(csvContent, 'utf-8');
}

function generateCSVContent(data: any): string {
  const { report, performanceSummary, topQueries } = data;
  const date = new Date(report.generated_at || report.created_at).toISOString();

  // Create CSV with report summary
  const lines = [
    'Report Information',
    '',
    'Field,Value',
    `Report ID,${report.id}`,
    `Report Type,${report.type}`,
    `Status,${report.status}`,
    `Generated Date,${date}`,
    `Period,${report.config?.period || '24h'}`,
    `Databases,${report.config?.databases?.length || 0}`,
    `Include Charts,${report.config?.include_charts ? 'Yes' : 'No'}`,
    `Include Recommendations,${report.config?.include_recommendations ? 'Yes' : 'No'}`,
    ''
  ];

  // Add performance summary if available
  if (performanceSummary) {
    lines.push('Performance Summary');
    lines.push('Metric,Value');
    lines.push(`Total Queries,${performanceSummary.totalQueries}`);
    lines.push(`Total Executions,${performanceSummary.totalExecutions}`);
    lines.push(`Avg Response Time (ms),${performanceSummary.avgResponseTime}`);
    lines.push(`Total CPU Time (ms),${performanceSummary.totalCpuTime}`);
    lines.push(`Total Buffer Gets,${performanceSummary.totalBufferGets}`);
    lines.push('');
  }

  // Add top slow queries if available
  if (topQueries && topQueries.length > 0) {
    lines.push('Top Slow Queries');
    lines.push('Rank,SQL ID,Avg Time (ms),Executions,Buffer Gets,SQL Text Preview');
    topQueries.slice(0, 10).forEach((query: any, index: number) => {
      const sqlText = (query.sql_text || '').replace(/,/g, ';').replace(/\n/g, ' ').substring(0, 100);
      lines.push(`${index + 1},${query.sql_id || 'N/A'},${query.avg_elapsed_time_ms || 0},${query.executions || 0},${query.buffer_gets || 0},"${sqlText}"`);
    });
    lines.push('');
  }

  // Add data source note
  if (performanceSummary) {
    lines.push('Data Source: Real database statistics');
  } else {
    lines.push('Note: No performance data available for this report period');
  }

  return lines.join('\n');
}

function generateJSONFile(data: any): Buffer {
  // Create structured JSON with report data
  const { report, performanceSummary, topQueries, sqlStats } = data;

  const reportData = {
    id: report.id,
    type: report.type,
    status: report.status,
    generatedAt: new Date(report.generated_at || report.created_at).toISOString(),
    configuration: {
      period: report.config?.period || '24h',
      databases: report.config?.databases || [],
      includeCharts: report.config?.include_charts || false,
      includeRecommendations: report.config?.include_recommendations || false
    },
    performanceSummary: performanceSummary || {
      note: 'No performance data available for this report period'
    },
    topSlowQueries: (topQueries || []).slice(0, 10).map((query: any) => ({
      sqlId: query.sql_id,
      avgElapsedTimeMs: query.avg_elapsed_time_ms,
      executions: query.executions,
      bufferGets: query.buffer_gets,
      cpuTimeMs: query.cpu_time_ms,
      sqlTextPreview: (query.sql_text || '').substring(0, 200)
    })),
    statistics: {
      totalQueriesAnalyzed: sqlStats?.length || 0,
      dataSource: performanceSummary ? 'Real database statistics' : 'No data'
    },
    metadata: {
      exportedAt: new Date().toISOString(),
      format: 'JSON'
    }
  };

  return Buffer.from(JSON.stringify(reportData, null, 2), 'utf-8');
}

function generateHTMLFile(data: any): Buffer {
  const { report, performanceSummary, topQueries } = data;
  const date = new Date(report.generated_at || report.created_at).toISOString();

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>성능 분석 보고서 - ${report.id}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 {
      color: #2563eb;
      border-bottom: 3px solid #2563eb;
      padding-bottom: 10px;
    }
    h2 {
      color: #1e40af;
      margin-top: 30px;
      border-left: 4px solid #2563eb;
      padding-left: 15px;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 200px 1fr;
      gap: 15px;
      margin: 20px 0;
    }
    .info-label {
      font-weight: bold;
      color: #4b5563;
    }
    .info-value {
      color: #111827;
    }
    .finding {
      background: #f3f4f6;
      padding: 15px;
      margin: 10px 0;
      border-left: 4px solid #10b981;
      border-radius: 4px;
    }
    .finding.high {
      border-left-color: #ef4444;
    }
    .finding.medium {
      border-left-color: #f59e0b;
    }
    .note {
      background: #dbeafe;
      border: 1px solid #3b82f6;
      padding: 15px;
      border-radius: 4px;
      margin-top: 30px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>SQL 성능 분석 보고서</h1>

    <h2>보고서 정보</h2>
    <div class="info-grid">
      <div class="info-label">보고서 ID:</div>
      <div class="info-value">${report.id}</div>

      <div class="info-label">보고서 유형:</div>
      <div class="info-value">${report.type}</div>

      <div class="info-label">상태:</div>
      <div class="info-value">${report.status}</div>

      <div class="info-label">생성 일시:</div>
      <div class="info-value">${date}</div>

      <div class="info-label">분석 기간:</div>
      <div class="info-value">${report.config?.period || '24h'}</div>

      <div class="info-label">데이터베이스 수:</div>
      <div class="info-value">${report.config?.databases?.length || 0}</div>

      <div class="info-label">차트 포함:</div>
      <div class="info-value">${report.config?.include_charts ? '예' : '아니오'}</div>

      <div class="info-label">권장사항 포함:</div>
      <div class="info-value">${report.config?.include_recommendations ? '예' : '아니오'}</div>
    </div>

    ${performanceSummary ? `
    <h2>성능 요약</h2>
    <div class="info-grid">
      <div class="info-label">전체 쿼리 수:</div>
      <div class="info-value">${performanceSummary.totalQueries}</div>

      <div class="info-label">총 실행 횟수:</div>
      <div class="info-value">${performanceSummary.totalExecutions.toLocaleString()}</div>

      <div class="info-label">평균 응답 시간:</div>
      <div class="info-value">${performanceSummary.avgResponseTime}ms</div>

      <div class="info-label">총 CPU 시간:</div>
      <div class="info-value">${performanceSummary.totalCpuTime.toLocaleString()}ms</div>

      <div class="info-label">총 버퍼 읽기:</div>
      <div class="info-value">${performanceSummary.totalBufferGets.toLocaleString()}</div>
    </div>` : ''}

    ${topQueries && topQueries.length > 0 ? `
    <h2>느린 쿼리 TOP ${Math.min(topQueries.length, 10)}</h2>
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <thead>
        <tr style="background: #f3f4f6; border-bottom: 2px solid #e5e7eb;">
          <th style="padding: 12px; text-align: left;">순위</th>
          <th style="padding: 12px; text-align: left;">SQL ID</th>
          <th style="padding: 12px; text-align: right;">평균 시간</th>
          <th style="padding: 12px; text-align: right;">실행 횟수</th>
          <th style="padding: 12px; text-align: right;">버퍼 읽기</th>
        </tr>
      </thead>
      <tbody>
        ${topQueries.slice(0, 10).map((query: any, index: number) => `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 12px;">${index + 1}</td>
          <td style="padding: 12px; font-family: monospace; font-size: 12px;">${query.sql_id || 'N/A'}</td>
          <td style="padding: 12px; text-align: right; color: ${query.avg_elapsed_time_ms > 1000 ? '#ef4444' : query.avg_elapsed_time_ms > 500 ? '#f59e0b' : '#10b981'};">
            ${query.avg_elapsed_time_ms || 0}ms
          </td>
          <td style="padding: 12px; text-align: right;">${(query.executions || 0).toLocaleString()}</td>
          <td style="padding: 12px; text-align: right;">${(query.buffer_gets || 0).toLocaleString()}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>

    <h2>쿼리 상세 정보</h2>
    ${topQueries.slice(0, 5).map((query: any, index: number) => `
    <div class="finding ${query.avg_elapsed_time_ms > 1000 ? 'high' : query.avg_elapsed_time_ms > 500 ? 'medium' : ''}">
      <h3>${index + 1}. SQL ID: ${query.sql_id || 'N/A'}</h3>
      <p><strong>평균 실행 시간:</strong> ${query.avg_elapsed_time_ms || 0}ms</p>
      <p><strong>실행 횟수:</strong> ${(query.executions || 0).toLocaleString()}</p>
      <p><strong>CPU 시간:</strong> ${query.cpu_time_ms || 0}ms</p>
      <p><strong>버퍼 읽기:</strong> ${(query.buffer_gets || 0).toLocaleString()}</p>
      ${query.sql_text ? `<p><strong>SQL 미리보기:</strong></p>
      <pre style="background: #f9fafb; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 11px;">${query.sql_text.substring(0, 300)}${query.sql_text.length > 300 ? '...' : ''}</pre>` : ''}
    </div>
    `).join('')}
    ` : ''}

    <div class="note">
      <strong>데이터 출처:</strong> ${performanceSummary ? '실제 데이터베이스 통계' : '이 보고서 기간에 사용 가능한 성능 데이터가 없습니다'}<br>
      <strong>내보낸 시각:</strong> ${new Date().toISOString()}
    </div>
  </div>
</body>
</html>`;

  return Buffer.from(html, 'utf-8');
}
