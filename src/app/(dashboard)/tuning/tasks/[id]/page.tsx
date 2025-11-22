'use client';

/**
 * Tuning Task Detail Page
 * 튜닝 작업 상세 페이지
 */

import { use, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MessageSquare, Send, Clock, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TuningTask {
  id: string;
  oracle_connection_id: string;
  sql_id: string;
  sql_text: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  before_elapsed_time_ms?: number;
  before_buffer_gets?: number;
  after_elapsed_time_ms?: number;
  after_buffer_gets?: number;
  improvement_rate?: number;
  tuning_method?: string;
  tuning_details?: string;
  implemented_changes?: string;
  identified_at: string;
  started_at?: string;
  completed_at?: string;
}

interface TuningComment {
  id: string;
  tuning_task_id: string;
  comment: string;
  comment_type: string;
  author_id: string;
  author_name?: string;
  is_resolved: boolean;
  created_at: string;
}

export default function TuningTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [newComment, setNewComment] = useState('');
  const [commentType, setCommentType] = useState<'COMMENT' | 'QUESTION' | 'SOLUTION' | 'ISSUE'>('COMMENT');

  // 튜닝 작업 상세 조회
  const { data: task, isLoading } = useQuery<TuningTask>({
    queryKey: ['tuning-task', resolvedParams.id],
    queryFn: async () => {
      const res = await fetch(`/api/tuning/tasks/${resolvedParams.id}`);
      if (!res.ok) throw new Error('Failed to fetch task');
      return res.json();
    },
  });

  // 코멘트 조회
  const { data: comments } = useQuery<TuningComment[]>({
    queryKey: ['tuning-comments', resolvedParams.id],
    queryFn: async () => {
      const res = await fetch(`/api/tuning/comments?tuning_task_id=${resolvedParams.id}`);
      if (!res.ok) throw new Error('Failed to fetch comments');
      const data = await res.json();
      return data.data || [];
    },
    refetchInterval: 30000,
  });

  // 코멘트 추가 Mutation
  const addCommentMutation = useMutation({
    mutationFn: async (comment: string) => {
      const res = await fetch('/api/tuning/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tuning_task_id: resolvedParams.id,
          comment,
          comment_type: commentType,
        }),
      });

      if (!res.ok) throw new Error('Failed to add comment');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tuning-comments', resolvedParams.id] });
      setNewComment('');
      toast({
        title: '코멘트 추가 완료',
        description: '코멘트가 성공적으로 추가되었습니다.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: '코멘트 추가 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleAddComment = () => {
    if (newComment.trim()) {
      addCommentMutation.mutate(newComment);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">튜닝 작업을 찾을 수 없습니다.</p>
            <Button onClick={() => router.back()} className="mt-4">
              돌아가기
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{task.title}</h1>
          <p className="text-muted-foreground mt-1">
            SQL ID: <code className="font-mono text-sm bg-muted px-2 py-0.5 rounded">{task.sql_id}</code>
          </p>
        </div>
        <Badge variant={task.status === 'COMPLETED' ? 'default' : 'secondary'}>
          {task.status}
        </Badge>
        <Badge>{task.priority}</Badge>
      </div>

      {/* 기본 정보 */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>SQL 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="text-sm font-medium mb-2">SQL Text</h4>
              <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
                {task.sql_text}
              </pre>
            </div>

            {task.description && (
              <div>
                <h4 className="text-sm font-medium mb-2">설명</h4>
                <p className="text-sm text-muted-foreground">{task.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>튜닝 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {task.tuning_method && (
              <div>
                <h4 className="text-sm font-medium mb-1">튜닝 방법</h4>
                <p className="text-sm">{task.tuning_method}</p>
              </div>
            )}

            {task.tuning_details && (
              <div>
                <h4 className="text-sm font-medium mb-1">튜닝 상세</h4>
                <p className="text-sm text-muted-foreground">{task.tuning_details}</p>
              </div>
            )}

            {task.implemented_changes && (
              <div>
                <h4 className="text-sm font-medium mb-1">구현된 변경사항</h4>
                <p className="text-sm text-muted-foreground">{task.implemented_changes}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">등록일:</span>
                <p>{new Date(task.identified_at).toLocaleString('ko-KR')}</p>
              </div>
              {task.started_at && (
                <div>
                  <span className="text-muted-foreground">시작일:</span>
                  <p>{new Date(task.started_at).toLocaleString('ko-KR')}</p>
                </div>
              )}
              {task.completed_at && (
                <div>
                  <span className="text-muted-foreground">완료일:</span>
                  <p>{new Date(task.completed_at).toLocaleString('ko-KR')}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 성능 비교 */}
      {task.before_elapsed_time_ms && task.after_elapsed_time_ms && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              성능 개선 결과
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h4 className="text-sm font-medium mb-3">튜닝 전</h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Elapsed Time:</span>
                    <p className="font-mono">{task.before_elapsed_time_ms.toLocaleString()}ms</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Buffer Gets:</span>
                    <p className="font-mono">{task.before_buffer_gets?.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-3">튜닝 후</h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Elapsed Time:</span>
                    <p className="font-mono text-green-600">{task.after_elapsed_time_ms.toLocaleString()}ms</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Buffer Gets:</span>
                    <p className="font-mono text-green-600">{task.after_buffer_gets?.toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-3">개선율</h4>
                <div className="text-4xl font-bold text-green-600">
                  {task.improvement_rate?.toFixed(2) || '0.00'}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">전체 성능 향상</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 코멘트 섹션 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            코멘트 ({comments?.length || 0})
          </CardTitle>
          <CardDescription>
            튜닝 작업 관련 의견, 질문, 해결 방법을 공유하세요
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 코멘트 목록 */}
          <div className="space-y-3">
            {comments && comments.length > 0 ? (
              comments.map((comment) => (
                <CommentItem key={comment.id} comment={comment} />
              ))
            ) : (
              <p className="text-center text-muted-foreground py-8">
                아직 코멘트가 없습니다. 첫 코멘트를 작성해보세요!
              </p>
            )}
          </div>

          {/* 코멘트 작성 */}
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <Select
                value={commentType}
                onValueChange={(value: any) => setCommentType(value)}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMMENT">코멘트</SelectItem>
                  <SelectItem value="QUESTION">질문</SelectItem>
                  <SelectItem value="SOLUTION">해결방법</SelectItem>
                  <SelectItem value="ISSUE">이슈</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Textarea
              placeholder="코멘트를 입력하세요..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              rows={3}
            />

            <div className="flex justify-end">
              <Button
                onClick={handleAddComment}
                disabled={!newComment.trim() || addCommentMutation.isPending}
              >
                <Send className="h-4 w-4 mr-2" />
                {addCommentMutation.isPending ? '추가 중...' : '코멘트 추가'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// 코멘트 아이템 컴포넌트
interface CommentItemProps {
  comment: TuningComment;
}

function CommentItem({ comment }: CommentItemProps) {
  const typeColors = {
    COMMENT: 'default',
    QUESTION: 'secondary',
    SOLUTION: 'default',
    ISSUE: 'destructive',
  } as const;

  const typeLabels = {
    COMMENT: '코멘트',
    QUESTION: '질문',
    SOLUTION: '해결방법',
    ISSUE: '이슈',
  };

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{comment.author_name || 'Unknown'}</span>
          <Badge variant={typeColors[comment.comment_type as keyof typeof typeColors]}>
            {typeLabels[comment.comment_type as keyof typeof typeLabels]}
          </Badge>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {new Date(comment.created_at).toLocaleString('ko-KR')}
        </div>
      </div>

      <p className="text-sm whitespace-pre-wrap">{comment.comment}</p>

      {comment.is_resolved && (
        <Badge variant="outline" className="mt-2">
          해결됨
        </Badge>
      )}
    </div>
  );
}
