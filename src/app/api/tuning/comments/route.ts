import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createPureClient } from '@/lib/supabase/server';

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

    const supabase = await createPureClient();

    const { data, error } = await supabase
      .from('tuning_comments')
      .select('*')
      .eq('tuning_task_id', tuningTaskId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ data });
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

    const supabase = await createPureClient();

    // 코멘트 추가
    const { data: newComment, error } = await supabase
      .from('tuning_comments')
      .insert({
        tuning_task_id,
        parent_comment_id,
        comment,
        comment_type,
        author_id: session.user.id,
        author_name: session.user.name || session.user.email,
        attachments: [],
        mentions: [],
        is_resolved: false,
      })
      .select()
      .single();

    if (error) throw error;

    // 튜닝 이력에 기록
    await supabase
      .from('tuning_history')
      .insert({
        tuning_task_id,
        oracle_connection_id: '', // task에서 가져와야 함
        sql_id: '', // task에서 가져와야 함
        activity_type: 'COMMENT',
        description: `${session.user.name || session.user.email}님이 ${comment_type === 'COMMENT' ? '코멘트' : comment_type === 'QUESTION' ? '질문' : comment_type === 'SOLUTION' ? '해결방법' : '이슈'}를 추가했습니다`,
        performed_by: session.user.id,
        metadata: { comment_id: newComment.id },
      });

    return NextResponse.json(newComment, { status: 201 });
  } catch (error) {
    console.error('Create tuning comment error:', error);
    return NextResponse.json(
      { error: 'Failed to create comment' },
      { status: 500 }
    );
  }
}
