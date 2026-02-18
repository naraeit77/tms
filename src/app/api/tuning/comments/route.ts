import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { tuningComments, tuningHistory } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';

/**
 * GET /api/tuning/comments
 * 튜닝 코멘트 조회
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tuningTaskId = searchParams.get('tuning_task_id');

    if (!tuningTaskId) {
      return NextResponse.json(
        { error: 'tuning_task_id is required' },
        { status: 400 }
      );
    }

    const data = await db
      .select()
      .from(tuningComments)
      .where(eq(tuningComments.tuningTaskId, tuningTaskId))
      .orderBy(asc(tuningComments.createdAt));

    // snake_case 변환 (프론트엔드 호환)
    const formatted = data.map((row) => ({
      id: row.id,
      tuning_task_id: row.tuningTaskId,
      parent_comment_id: row.parentCommentId,
      comment: row.comment,
      comment_type: row.commentType,
      attachments: row.attachments,
      author_id: row.authorId,
      author_name: row.authorName,
      mentions: row.mentions,
      is_resolved: row.isResolved,
      resolved_by: row.resolvedBy,
      resolved_at: row.resolvedAt,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    }));

    return NextResponse.json({ data: formatted });
  } catch (error) {
    console.error('Get tuning comments error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tuning/comments
 * 튜닝 코멘트 추가
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      tuning_task_id,
      comment,
      comment_type = 'COMMENT',
      parent_comment_id,
    } = body;

    // 필수 필드 검증
    if (!tuning_task_id || !comment) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 코멘트 추가
    const [newComment] = await db
      .insert(tuningComments)
      .values({
        tuningTaskId: tuning_task_id,
        parentCommentId: parent_comment_id,
        comment,
        commentType: comment_type,
        authorId: session.user.id,
        authorName: session.user.name || session.user.email,
        attachments: [],
        mentions: [],
        isResolved: false,
      })
      .returning();

    // 튜닝 이력에 기록
    await db
      .insert(tuningHistory)
      .values({
        tuningTaskId: tuning_task_id,
        oracleConnectionId: '', // task에서 가져와야 함
        sqlId: '', // task에서 가져와야 함
        activityType: 'COMMENT',
        description: `${session.user.name || session.user.email}님이 ${comment_type === 'COMMENT' ? '코멘트' : comment_type === 'QUESTION' ? '질문' : comment_type === 'SOLUTION' ? '해결방법' : '이슈'}를 추가했습니다`,
        performedBy: session.user.id,
        metadata: { comment_id: newComment.id },
      });

    // snake_case 변환 (프론트엔드 호환)
    const formatted = {
      id: newComment.id,
      tuning_task_id: newComment.tuningTaskId,
      parent_comment_id: newComment.parentCommentId,
      comment: newComment.comment,
      comment_type: newComment.commentType,
      attachments: newComment.attachments,
      author_id: newComment.authorId,
      author_name: newComment.authorName,
      mentions: newComment.mentions,
      is_resolved: newComment.isResolved,
      resolved_by: newComment.resolvedBy,
      resolved_at: newComment.resolvedAt,
      created_at: newComment.createdAt,
      updated_at: newComment.updatedAt,
    };

    return NextResponse.json(formatted, { status: 201 });
  } catch (error) {
    console.error('Create tuning comment error:', error);
    return NextResponse.json(
      { error: 'Failed to create comment' },
      { status: 500 }
    );
  }
}
