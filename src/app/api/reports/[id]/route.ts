import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { reports, reportActivities, reportSchedules } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(
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

    // Get report details
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

    // Log view activity
    await db.insert(reportActivities).values({
      reportId,
      userId,
      action: 'viewed',
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
    const body = await request.json();

    // Verify report ownership
    const [existingReport] = await db
      .select({ id: reports.id, userId: reports.userId })
      .from(reports)
      .where(and(eq(reports.id, reportId), eq(reports.userId, userId)))
      .limit(1);

    if (!existingReport) {
      return NextResponse.json(
        { success: false, error: 'Report not found' },
        { status: 404 }
      );
    }

    // Update report
    const [updatedReport] = await db
      .update(reports)
      .set({
        name: body.name,
        description: body.description,
        config: body.config,
        tags: body.tags,
        updatedAt: new Date(),
      })
      .where(and(eq(reports.id, reportId), eq(reports.userId, userId)))
      .returning();

    if (!updatedReport) {
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

    // Verify report ownership
    const [existingReport] = await db
      .select({ id: reports.id, userId: reports.userId, filePath: reports.filePath })
      .from(reports)
      .where(and(eq(reports.id, reportId), eq(reports.userId, userId)))
      .limit(1);

    if (!existingReport) {
      return NextResponse.json(
        { success: false, error: 'Report not found' },
        { status: 404 }
      );
    }

    // Delete related activities first
    await db
      .delete(reportActivities)
      .where(eq(reportActivities.reportId, reportId));

    // Delete report schedules if any
    await db
      .delete(reportSchedules)
      .where(eq(reportSchedules.reportId, reportId));

    // Delete the report
    await db
      .delete(reports)
      .where(and(eq(reports.id, reportId), eq(reports.userId, userId)));

    // Log deletion activity
    try {
      await db.insert(reportActivities).values({
        reportId,
        userId,
        action: 'deleted',
        details: { report_name: existingReport.filePath },
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
