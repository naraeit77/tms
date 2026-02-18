'use client';

/**
 * Tuning Task Detail Page
 * 튜닝 작업 상세 페이지 - 타임라인 형식의 이력 관리
 */

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  PlayCircle,
  Eye,
  TrendingUp,
  TrendingDown,
  Edit,
  Trash2,
  MessageSquare,
  Users,
  Calendar,
  Database,
  Code,
  BarChart3,
  Send,
  ChevronRight,
  ExternalLink,
  Loader2,
  Minus,
  Sparkles,
  RefreshCw,
  FileText,
  Lightbulb,
  Zap,
  Brain,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription, // Importing description
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface TuningTask {
  id: string;
  oracle_connection_id: string;
  sql_id: string;
  sql_text: string;
  title: string;
  description?: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'IDENTIFIED' | 'ASSIGNED' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED' | 'CANCELLED';
  assigned_to?: string;
  assignee_name?: string;
  before_elapsed_time_ms?: number;
  before_buffer_gets?: number;
  before_cpu_time_ms?: number;
  before_disk_reads?: number;
  after_elapsed_time_ms?: number;
  after_buffer_gets?: number;
  after_cpu_time_ms?: number;
  after_disk_reads?: number;
  improvement_rate?: number;
  tuning_method?: string;
  tuning_details?: string;
  implemented_changes?: string;
  identified_at: string;
  started_at?: string;
  completed_at?: string;
  estimated_completion_date?: string;
  created_at: string;
  updated_at: string;
}

interface TuningHistory {
  id: string;
  activity_type: string;
  description: string;
  old_value?: any;
  new_value?: any;
  performed_by?: string;
  performed_at: string;
}

interface TuningComment {
  id: string;
  comment: string;
  comment_type: 'COMMENT' | 'QUESTION' | 'SOLUTION' | 'ISSUE';
  author_name?: string;
  created_at: string;
}

interface ExecutionPlan {
  id: string;
  sql_id: string;
  plan_hash_value: string;
  plan_text: string;
  cost: number;
  cardinality: number;
  bytes: number;
  cpu_cost?: number;
  io_cost?: number;
  temp_space?: number;
  access_predicates?: string;
  filter_predicates?: string;
  collected_at: string;
}

const STATUS_CONFIG = {
  IDENTIFIED: { label: '발견됨', icon: AlertCircle, color: 'text-purple-600', bgColor: 'bg-purple-100' },
  ASSIGNED: { label: '할당됨', icon: Users, color: 'text-blue-600', bgColor: 'bg-blue-100' },
  IN_PROGRESS: { label: '튜닝 중', icon: PlayCircle, color: 'text-orange-600', bgColor: 'bg-orange-100' },
  REVIEW: { label: '검토 중', icon: Eye, color: 'text-cyan-600', bgColor: 'bg-cyan-100' },
  COMPLETED: { label: '완료', icon: CheckCircle2, color: 'text-green-600', bgColor: 'bg-green-100' },
  CANCELLED: { label: '취소됨', icon: Minus, color: 'text-gray-600', bgColor: 'bg-gray-100' },
};

const PRIORITY_CONFIG = {
  CRITICAL: { label: '긴급', color: 'bg-red-100 text-red-800' },
  HIGH: { label: '높음', color: 'bg-orange-100 text-orange-800' },
  MEDIUM: { label: '보통', color: 'bg-blue-100 text-blue-800' },
  LOW: { label: '낮음', color: 'bg-gray-100 text-gray-800' },
};

const COMMENT_TYPE_CONFIG = {
  COMMENT: { label: '코멘트', color: 'bg-slate-100' },
  QUESTION: { label: '질문', color: 'bg-yellow-100' },
  SOLUTION: { label: '해결책', color: 'bg-green-100' },
  ISSUE: { label: '이슈', color: 'bg-red-100' },
};

function MetricComparison({
  label,
  before,
  after,
  unit = '',
  lowerIsBetter = true,
}: {
  label: string;
  before?: number;
  after?: number;
  unit?: string;
  lowerIsBetter?: boolean;
}) {
  if (before == null) return null;

  const improvement =
    before > 0 && after != null ? ((before - after) / before) * 100 : null;
  const isImproved = improvement != null && (lowerIsBetter ? improvement > 0 : improvement < 0);

  const formatValue = (val: number) => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toLocaleString();
  };

  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm">{formatValue(before)}{unit}</span>
        {after != null && (
          <>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <span className={cn('font-mono text-sm', isImproved ? 'text-green-600 font-medium' : 'text-red-600')}>
              {formatValue(after)}{unit}
            </span>
            {improvement != null && (
              <Badge className={cn('text-xs', isImproved ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')}>
                {isImproved ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                {Math.abs(improvement).toFixed(1)}%
              </Badge>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function TuningDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 사용자 목록 조회 (담당자 변경용)
  const { data: users } = useQuery({
    queryKey: ['users-list-for-edit'],
    queryFn: async () => {
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      const json = await res.json();
      return json.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [commentType, setCommentType] = useState<'COMMENT' | 'QUESTION' | 'SOLUTION' | 'ISSUE'>('COMMENT');
  const [editForm, setEditForm] = useState<Partial<TuningTask>>({});

  // 태스크 상세 조회
  const { data: task, isLoading } = useQuery<TuningTask | null>({
    queryKey: ['tuning-task', id],
    queryFn: async () => {
      const res = await fetch(`/api/tuning/tasks/${id}`);
      if (!res.ok) throw new Error('Failed to fetch task');
      const data = await res.json();
      return data.data ?? null;
    },
  });

  // 이력 조회
  const { data: history } = useQuery<TuningHistory[]>({
    queryKey: ['tuning-history', id],
    queryFn: async () => {
      const res = await fetch(`/api/tuning/history?tuning_task_id=${id}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.data || [];
    },
    enabled: !!id,
  });

  // 코멘트 조회
  const { data: comments } = useQuery<TuningComment[]>({
    queryKey: ['tuning-comments', id],
    queryFn: async () => {
      const res = await fetch(`/api/tuning/comments?tuning_task_id=${id}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.data || [];
    },
    enabled: !!id,
  });

  // 상태 변경 Mutation
  const updateMutation = useMutation({
    mutationFn: async (data: Partial<TuningTask>) => {
      const res = await fetch(`/api/tuning/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update task');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tuning-task', id] });
      queryClient.invalidateQueries({ queryKey: ['tuning-history', id] });
      queryClient.invalidateQueries({ queryKey: ['tuning-tasks-kanban'] });
      setIsEditDialogOpen(false);
      toast({ title: '업데이트 완료', description: '태스크가 수정되었습니다.' });
    },
    onError: () => {
      toast({ title: '업데이트 실패', variant: 'destructive' });
    },
  });

  // --------------------------------------------------------------------------
  // SQL Tuning Advisor Logic
  // --------------------------------------------------------------------------

  // --------------------------------------------------------------------------
  // AI SQL Analysis Logic
  // --------------------------------------------------------------------------

  const [analysisResult, setAnalysisResult] = useState<any>(null);

  // AI 분석 실행 Mutation
  const analyzeSqlMutation = useMutation({
    mutationFn: async () => {
      if (!task) throw new Error('Task not loaded');

      const res = await fetch('/api/analysis/refactoring-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: task.oracle_connection_id,
          sql_text: task.sql_text,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to analyze SQL');
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.data && data.data.length > 0) {
        setAnalysisResult(data.data[0]);
        toast({ title: '분석 완료', description: 'AI 분석 결과가 도착했습니다.' });
      } else {
        toast({ title: '분석 완료', description: '특별한 개선 사항을 찾지 못했습니다.' });
      }
    },
    onError: (err) => {
      toast({ title: '분석 실패', description: err.message, variant: 'destructive' });
    }
  });

  // 실행계획 조회
  const { data: plans, isLoading: isLoadingPlans } = useQuery<ExecutionPlan[]>({
    queryKey: ['execution-plans', task?.oracle_connection_id, task?.sql_id],
    queryFn: async () => {
      if (!task?.oracle_connection_id || !task?.sql_id) return [];
      const res = await fetch(
        `/api/monitoring/execution-plans?connection_id=${task.oracle_connection_id}&sql_id=${task.sql_id}`
      );
      if (!res.ok) return [];
      const data = await res.json();
      return data.data || [];
    },
    enabled: !!task?.oracle_connection_id && !!task?.sql_id,
  });

  // 코멘트 추가 Mutation
  const addCommentMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/tuning/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tuning_task_id: id,
          comment: newComment,
          comment_type: commentType,
        }),
      });
      if (!res.ok) throw new Error('Failed to add comment');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tuning-comments', id] });
      queryClient.invalidateQueries({ queryKey: ['tuning-history', id] });
      setNewComment('');
      toast({ title: '코멘트 추가됨' });
    },
  });

  // 삭제 Mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tuning/tasks/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete task');
    },
    onSuccess: () => {
      toast({ title: '삭제 완료' });
      router.push('/tuning');
    },
  });

  const handleStatusChange = (newStatus: string) => {
    updateMutation.mutate({ status: newStatus as TuningTask['status'] });
  };

  const openEditDialog = () => {
    if (task) {
      setEditForm({
        title: task.title,
        description: task.description,
        priority: task.priority,
        assigned_to: task.assigned_to,
        tuning_method: task.tuning_method,
        tuning_details: task.tuning_details,
        after_elapsed_time_ms: task.after_elapsed_time_ms,
        after_buffer_gets: task.after_buffer_gets,
      });
      setIsEditDialogOpen(true);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2">
            <Skeleton className="h-64" />
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-lg font-medium">태스크를 찾을 수 없습니다</h2>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/tuning')}>
          목록으로 돌아가기
        </Button>
      </div>
    );
  }

  const StatusIcon = STATUS_CONFIG[task.status]?.icon || AlertCircle;
  const statusConfig = STATUS_CONFIG[task.status];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/tuning')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <code className="text-sm font-mono bg-slate-100 px-2 py-0.5 rounded">
                {task.sql_id}
              </code>
              <Badge className={PRIORITY_CONFIG[task.priority].color}>
                {PRIORITY_CONFIG[task.priority].label}
              </Badge>
              <Badge className={cn(statusConfig.bgColor, statusConfig.color)}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {statusConfig.label}
              </Badge>
            </div>
            <h1 className="text-xl font-bold">{task.title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={openEditDialog}>
            <Edit className="h-4 w-4 mr-2" />
            수정
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-red-600">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>정말 삭제하시겠습니까?</AlertDialogTitle>
                <AlertDialogDescription>
                  이 작업은 되돌릴 수 없습니다. 모든 이력과 코멘트도 함께 삭제됩니다.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate()}
                  className="bg-red-600"
                >
                  삭제
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 메인 콘텐츠 (탭으로 구분) */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="overview">개요 및 이력</TabsTrigger>
              <TabsTrigger value="advisor">
                <Sparkles className="h-4 w-4 mr-2 text-purple-500" />
                AI 튜닝 어드바이저
              </TabsTrigger>
              <TabsTrigger value="plan">실행계획</TabsTrigger>
            </TabsList>

            {/* 1. 개요 탭 */}
            <TabsContent value="overview" className="space-y-6">
              {/* SQL 정보 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Code className="h-4 w-4" />
                    SQL 정보
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="bg-slate-50 p-4 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                    {task.sql_text}
                  </pre>
                  {task.description && (
                    <div className="mt-4 pt-4 border-t">
                      <p className="text-sm text-muted-foreground">{task.description}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 성능 비교 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <BarChart3 className="h-4 w-4" />
                    성능 비교
                  </CardTitle>
                  {task.improvement_rate != null && (
                    <Badge className={cn('ml-auto', task.improvement_rate > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')}>
                      {task.improvement_rate > 0 ? '+' : ''}{task.improvement_rate.toFixed(1)}% 개선
                    </Badge>
                  )}
                </CardHeader>
                <CardContent className="space-y-1 divide-y">
                  <MetricComparison
                    label="실행 시간"
                    before={task.before_elapsed_time_ms}
                    after={task.after_elapsed_time_ms}
                    unit="ms"
                  />
                  <MetricComparison
                    label="Buffer Gets"
                    before={task.before_buffer_gets}
                    after={task.after_buffer_gets}
                  />
                  <MetricComparison
                    label="CPU Time"
                    before={task.before_cpu_time_ms}
                    after={task.after_cpu_time_ms}
                    unit="ms"
                  />
                  <MetricComparison
                    label="Disk Reads"
                    before={task.before_disk_reads}
                    after={task.after_disk_reads}
                  />
                  {!task.before_elapsed_time_ms && !task.before_buffer_gets && (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      성능 메트릭이 기록되지 않았습니다
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* 튜닝 내용 (있는 경우) */}
              {(task.tuning_method || task.tuning_details || task.implemented_changes) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">튜닝 내용</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {task.tuning_method && (
                      <div>
                        <Label className="text-xs text-muted-foreground">튜닝 방법</Label>
                        <p className="font-medium">{task.tuning_method}</p>
                      </div>
                    )}
                    {task.tuning_details && (
                      <div>
                        <Label className="text-xs text-muted-foreground">상세 내용</Label>
                        <p className="text-sm">{task.tuning_details}</p>
                      </div>
                    )}
                    {task.implemented_changes && (
                      <div>
                        <Label className="text-xs text-muted-foreground">적용된 변경사항</Label>
                        <pre className="bg-slate-50 p-3 rounded text-sm font-mono">
                          {task.implemented_changes}
                        </pre>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* 코멘트 섹션 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MessageSquare className="h-4 w-4" />
                    토론 ({comments?.length || 0})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 코멘트 목록 */}
                  {comments && comments.length > 0 && (
                    <div className="space-y-3 mb-4">
                      {comments.map((comment) => (
                        <div
                          key={comment.id}
                          className={cn('p-3 rounded-lg', COMMENT_TYPE_CONFIG[comment.comment_type]?.color || 'bg-slate-50')}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">
                                {comment.author_name || '익명'}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {COMMENT_TYPE_CONFIG[comment.comment_type]?.label}
                              </Badge>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {new Date(comment.created_at).toLocaleString('ko-KR')}
                            </span>
                          </div>
                          <p className="text-sm">{comment.comment}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 새 코멘트 입력 */}
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      {(['COMMENT', 'QUESTION', 'SOLUTION', 'ISSUE'] as const).map((type) => (
                        <Button
                          key={type}
                          size="sm"
                          variant={commentType === type ? 'default' : 'outline'}
                          onClick={() => setCommentType(type)}
                          className="text-xs"
                        >
                          {COMMENT_TYPE_CONFIG[type].label}
                        </Button>
                      ))}
                    </div>
                    <Textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="의견, 질문, 해결책 등을 공유해주세요..."
                      rows={3}
                    />
                    <div className="flex justify-end">
                      <Button
                        onClick={() => addCommentMutation.mutate()}
                        disabled={!newComment.trim() || addCommentMutation.isPending}
                      >
                        <Send className="h-4 w-4 mr-2" />
                        등록
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 2. AI SQL 고급 분석 탭 */}
            <TabsContent value="advisor" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-purple-600" />
                    AI SQL 고급 분석
                  </CardTitle>
                  <CardDescription>
                    자체 AI 엔진을 통해 SQL 패턴을 분석하고 최적화 방안을 제안합니다. (Standard Edition 지원)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!analysisResult ? (
                    <div className="text-center py-12 bg-slate-50 rounded-lg border border-dashed">
                      <Sparkles className="h-12 w-12 mx-auto text-purple-300 mb-4" />
                      <h3 className="text-lg font-medium mb-2">AI 정밀 분석 실행</h3>
                      <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
                        SQL 실행 패턴, 안티 패턴, 인덱스 효율성 등을 종합적으로 분석하여 최적화 및 리팩토링 제안을 받아보세요.
                      </p>
                      <Button
                        onClick={() => analyzeSqlMutation.mutate()}
                        disabled={analyzeSqlMutation.isPending}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        {analyzeSqlMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            분석 중...
                          </>
                        ) : (
                          <>
                            <PlayCircle className="h-4 w-4 mr-2" />
                            AI 분석 시작
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700">
                            예상 성능 향상: {analysisResult.performance_gain}%
                          </Badge>
                          <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                            복잡도 감소: {analysisResult.complexity_reduction}%
                          </Badge>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => analyzeSqlMutation.mutate()}>
                          <RefreshCw className="h-3 w-3 mr-1" />
                          재분석
                        </Button>
                      </div>

                      {/* 분석 리포트 */}
                      <div className="p-4 bg-slate-50 rounded-lg border">
                        <h4 className="font-medium mb-2 flex items-center gap-2">
                          <Lightbulb className="h-4 w-4 text-amber-500" />
                          분석 리포트
                        </h4>
                        <p className="text-sm text-slate-700 leading-relaxed">
                          {analysisResult.reasoning}
                        </p>
                      </div>

                      {/* 개선 사항 목록 */}
                      <div className="space-y-3">
                        <h4 className="font-medium text-sm">개선 제안 사항</h4>
                        {analysisResult.improvements.map((imp: any, idx: number) => (
                          <div key={idx} className="flex items-start gap-3 p-3 bg-white border rounded-lg">
                            <div className={cn(
                              "mt-1 p-1.5 rounded-full",
                              imp.impact === 'high' ? "bg-red-100 text-red-600" :
                                imp.impact === 'medium' ? "bg-orange-100 text-orange-600" :
                                  "bg-blue-100 text-blue-600"
                            )}>
                              <Zap className="h-3 w-3" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-sm">{imp.type}</span>
                                <Badge variant="secondary" className="text-[10px] h-5">
                                  {imp.impact.toUpperCase()}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">{imp.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* SQL 비교 */}
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm">Refactored SQL</h4>
                        <div className="relative">
                          <pre className="bg-slate-900 text-slate-50 p-4 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                            {analysisResult.refactored_sql}
                          </pre>
                          <Button
                            className="absolute top-2 right-2 h-7 text-xs"
                            variant="secondary"
                            onClick={() => {
                              setEditForm({
                                ...editForm,
                                tuning_method: 'SQL Rewrite',
                                tuning_details: analysisResult.reasoning,
                                implemented_changes: analysisResult.refactored_sql
                              });
                              setIsEditDialogOpen(true);
                            }}
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            이 제안 적용하기
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* 3. 실행계획 탭 (Placeholders) */}
            <TabsContent value="plan" className="space-y-6">
              {isLoadingPlans ? (
                <div className="space-y-4">
                  {[...Array(2)].map((_, i) => (
                    <Card key={i}>
                      <CardHeader>
                        <Skeleton className="h-6 w-1/3 mb-2" />
                        <Skeleton className="h-4 w-1/4" />
                      </CardHeader>
                      <CardContent>
                        <Skeleton className="h-64 w-full" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : !plans || plans.length === 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Execution Plan</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-12 text-muted-foreground">
                      <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <h3 className="text-lg font-medium mb-2">실행계획을 찾을 수 없습니다</h3>
                      <p className="mb-6">해당 SQL ID에 대한 실행계획 정보가 수집되지 않았습니다.</p>
                      <Button variant="outline" onClick={() => window.open(`/execution-plans?connection_id=${task?.oracle_connection_id}&sql_id=${task?.sql_id}`, '_blank')}>
                        실행계획 조회 페이지로 이동 <ExternalLink className="h-3 w-3 ml-2" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-6">
                  {plans.map((plan) => (
                    <Card key={plan.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="font-mono text-base flex items-center gap-2">
                              <Zap className="h-4 w-4 text-amber-500" />
                              Plan Hash Value: {plan.plan_hash_value}
                            </CardTitle>
                            <CardDescription className="mt-1">
                              수집 시간: {new Date(plan.collected_at).toLocaleString('ko-KR')}
                            </CardDescription>
                          </div>
                          {plans.length > 1 && (
                            <Badge variant="outline">
                              Plan ID: {String(plan.id).slice(-6)}
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {/* 메트릭 요약 */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-lg">
                          <div className="space-y-1">
                            <span className="text-xs text-muted-foreground font-medium uppercase">Cost</span>
                            <div className="text-xl font-bold font-mono">{(plan.cost || 0).toLocaleString()}</div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-xs text-muted-foreground font-medium uppercase">Cardinality</span>
                            <div className="text-xl font-bold font-mono">{(plan.cardinality || 0).toLocaleString()}</div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-xs text-muted-foreground font-medium uppercase">Bytes</span>
                            <div className="text-xl font-bold font-mono">{(plan.bytes || 0).toLocaleString()}</div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-xs text-muted-foreground font-medium uppercase">IO Cost</span>
                            <div className="text-xl font-bold font-mono">{(plan.io_cost || 0).toLocaleString()}</div>
                          </div>
                        </div>

                        {/* 실행계획 텍스트 */}
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">실행계획 트리</Label>
                          <div className="relative">
                            <Textarea
                              value={plan.plan_text}
                              readOnly
                              className="min-h-[300px] font-mono text-xs leading-relaxed bg-white border-slate-200 resize-none"
                              style={{ whiteSpace: 'pre' }}
                            />
                          </div>
                        </div>

                        {/* Predicates 정보 */}
                        {(plan.access_predicates || plan.filter_predicates) && (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4 border-t">
                            {plan.access_predicates && (
                              <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground font-medium uppercase flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-green-500" />
                                  Access Predicates
                                </Label>
                                <div className="bg-slate-50 p-3 rounded-md border text-xs font-mono break-all">
                                  {plan.access_predicates}
                                </div>
                              </div>
                            )}
                            {plan.filter_predicates && (
                              <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground font-medium uppercase flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                                  Filter Predicates
                                </Label>
                                <div className="bg-slate-50 p-3 rounded-md border text-xs font-mono break-all">
                                  {plan.filter_predicates}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* 우측 사이드바 (기존 유지) */}
        <div className="space-y-6">
          {/* 상태 변경 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">상태 변경</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(STATUS_CONFIG).map(([status, config]) => {
                const Icon = config.icon;
                const isCurrent = task.status === status;
                const isDisabled = status === 'CANCELLED' && task.status === 'COMPLETED';

                return (
                  <Button
                    key={status}
                    variant={isCurrent ? 'default' : 'outline'}
                    className={cn('w-full justify-start', isCurrent && config.bgColor)}
                    onClick={() => handleStatusChange(status)}
                    disabled={isDisabled || updateMutation.isPending}
                  >
                    <Icon className={cn('h-4 w-4 mr-2', !isCurrent && config.color)} />
                    {config.label}
                  </Button>
                );
              })}
            </CardContent>
          </Card>

          {/* 정보 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">상세 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">담당자</span>
                <span className="font-medium">{task.assignee_name || task.assigned_to || '-'}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">발견일</span>
                <span>{new Date(task.identified_at).toLocaleDateString('ko-KR')}</span>
              </div>
              {task.started_at && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">시작일</span>
                    <span>{new Date(task.started_at).toLocaleDateString('ko-KR')}</span>
                  </div>
                </>
              )}
              {task.completed_at && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">완료일</span>
                    <span>{new Date(task.completed_at).toLocaleDateString('ko-KR')}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* 활동 이력 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">활동 이력</CardTitle>
            </CardHeader>
            <CardContent>
              {history && history.length > 0 ? (
                <div className="space-y-4">
                  {history.slice(0, 10).map((item, index) => (
                    <div key={item.id} className="flex gap-3">
                      <div className="relative">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2" />
                        {index < Math.min(history.length, 10) - 1 && (
                          <div className="absolute top-4 left-0.5 w-0.5 h-full bg-slate-200" />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <p className="text-sm">{item.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(item.performed_at).toLocaleString('ko-KR')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  아직 활동 이력이 없습니다
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 수정 다이얼로그 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>튜닝 작업 수정</DialogTitle>
            <DialogDescription>
              튜닝 작업의 상세 정보를 수정합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>제목</Label>
              <Input
                value={editForm.title || ''}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label>설명</Label>
              <Textarea
                value={editForm.description || ''}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>우선순위</Label>
                <Select
                  value={editForm.priority}
                  onValueChange={(value: any) => setEditForm({ ...editForm, priority: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CRITICAL">긴급</SelectItem>
                    <SelectItem value="HIGH">높음</SelectItem>
                    <SelectItem value="MEDIUM">보통</SelectItem>
                    <SelectItem value="LOW">낮음</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>담당자</Label>
                <Select
                  value={editForm.assigned_to || "unassigned"}
                  onValueChange={(value) => setEditForm({ ...editForm, assigned_to: value === "unassigned" ? null : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="담당자 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">미지정</SelectItem>
                    {users?.map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="grid gap-2">
              <Label>튜닝 방법</Label>
              <Select
                value={editForm.tuning_method || ''}
                onValueChange={(value) => setEditForm({ ...editForm, tuning_method: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="선택..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Index">인덱스 생성/수정</SelectItem>
                  <SelectItem value="SQL Rewrite">SQL 재작성</SelectItem>
                  <SelectItem value="Statistics">통계정보 갱신</SelectItem>
                  <SelectItem value="Hint">힌트 추가</SelectItem>
                  <SelectItem value="Partitioning">파티셔닝</SelectItem>
                  <SelectItem value="Other">기타</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>튜닝 상세 내용</Label>
              <Textarea
                value={editForm.tuning_details || ''}
                onChange={(e) => setEditForm({ ...editForm, tuning_details: e.target.value })}
                placeholder="튜닝에 대한 상세 설명..."
                rows={3}
              />
            </div>

            <Separator />
            <p className="text-sm font-medium">튜닝 후 성능</p>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>실행 시간 (ms)</Label>
                <Input
                  type="number"
                  value={editForm.after_elapsed_time_ms || ''}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      after_elapsed_time_ms: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Buffer Gets</Label>
                <Input
                  type="number"
                  value={editForm.after_buffer_gets || ''}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      after_buffer_gets: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={() => updateMutation.mutate(editForm)} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div >
  );
}
