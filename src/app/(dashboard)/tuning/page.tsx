'use client';

/**
 * Tuning Management Dashboard
 * 튜닝 관리 메인 대시보드 - 칸반 보드 스타일
 * 초보 DBA도 쉽게 사용할 수 있는 직관적인 워크플로우
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  Filter,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  PlayCircle,
  Eye,
  Zap,
  TrendingUp,
  Target,
  Users,
  ChevronRight,
  Lightbulb,
  History,
  LayoutGrid,
  List,
  UserPlus,
  Edit,
  BarChart3,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { PageHeader } from '@/components/ui/page-header';
import { DataCard, DataCardGrid } from '@/components/ui/data-card';
import { ConnectionRequired } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';

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
  before_elapsed_time_ms?: number;
  before_buffer_gets?: number;
  after_elapsed_time_ms?: number;
  after_buffer_gets?: number;
  improvement_rate?: number;
  identified_at: string;
  started_at?: string;
  completed_at?: string;
  estimated_completion_date?: string;
  created_at: string;
  updated_at: string;
}

// 워크플로우 단계 정의 (4단계로 단순화)
const WORKFLOW_STAGES = [
  {
    id: 'IDENTIFIED',
    label: '발견됨',
    description: '성능 문제가 발견된 SQL',
    icon: AlertCircle,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    nextAction: '튜닝 시작',
    nextStatus: 'IN_PROGRESS',
  },
  {
    id: 'IN_PROGRESS',
    label: '튜닝 중',
    description: '튜닝 작업 진행 중',
    icon: PlayCircle,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    nextAction: '검토 요청',
    nextStatus: 'REVIEW',
  },
  {
    id: 'REVIEW',
    label: '검토 중',
    description: '튜닝 결과 검토 대기',
    icon: Eye,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
    borderColor: 'border-cyan-200',
    nextAction: '완료 처리',
    nextStatus: 'COMPLETED',
  },
  {
    id: 'COMPLETED',
    label: '완료',
    description: '튜닝 완료된 SQL',
    icon: CheckCircle2,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    nextAction: null,
    nextStatus: null,
  },
];

const PRIORITY_CONFIG = {
  CRITICAL: { label: '긴급', color: 'bg-red-100 text-red-800 border-red-200' },
  HIGH: { label: '높음', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  MEDIUM: { label: '보통', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  LOW: { label: '낮음', color: 'bg-gray-100 text-gray-800 border-gray-200' },
};

// 간단한 카드 컴포넌트
function TaskCard({
  task,
  assigneeName,
  onMoveNext,
  onViewDetail,
  onAssign,
  isMoving
}: {
  task: TuningTask;
  assigneeName?: string | null;
  onMoveNext?: () => void;
  onViewDetail: () => void;
  onAssign: () => void;
  isMoving?: boolean;
}) {
  const currentStage = WORKFLOW_STAGES.find(s => s.id === task.status);
  const improvement = task.improvement_rate;

  return (
    <Card
      className={cn(
        "cursor-pointer hover:shadow-md transition-all group",
        isMoving && "opacity-50 scale-95"
      )}
      onClick={onViewDetail}
    >
      <CardContent className="p-4">
        {/* 헤더: SQL ID & 우선순위 */}
        <div className="flex items-center justify-between mb-2">
          <code className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded">
            {task.sql_id}
          </code>
          <Badge
            variant="outline"
            className={cn("text-xs", PRIORITY_CONFIG[task.priority].color)}
          >
            {PRIORITY_CONFIG[task.priority].label}
          </Badge>
        </div>

        {/* 제목 */}
        <h4 className="font-medium text-sm line-clamp-2 mb-2 group-hover:text-blue-600">
          {task.title}
        </h4>

        {/* SQL 미리보기 */}
        <p className="text-xs text-muted-foreground line-clamp-1 font-mono mb-3">
          {task.sql_text.substring(0, 50)}...
        </p>

        {/* 메트릭 또는 진행 상태 */}
        {task.status === 'COMPLETED' && improvement != null ? (
          <div className="flex items-center gap-2 text-green-600 mb-3">
            <TrendingUp className="h-4 w-4" />
            <span className="text-sm font-medium">
              {improvement > 0 ? '+' : ''}{improvement.toFixed(1)}% 개선
            </span>
          </div>
        ) : task.before_elapsed_time_ms ? (
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-3">
            <Clock className="h-3 w-3" />
            <span>{(task.before_elapsed_time_ms / 1000).toFixed(2)}s</span>
            {task.before_buffer_gets && (
              <>
                <span>•</span>
                <span>{(task.before_buffer_gets / 1000).toFixed(0)}K reads</span>
              </>
            )}
          </div>
        ) : null}

        {/* 하단: 담당자 & 액션 */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-1 text-xs text-muted-foreground group/assign hover:text-foreground transition-colors cursor-pointer" onClick={(e) => { e.stopPropagation(); onAssign(); }}>
            {task.assigned_to ? (
              <>
                <Users className="h-3 w-3" />
                <span>{assigneeName || task.assigned_to}</span>
              </>
            ) : (
              <>
                <UserPlus className="h-3 w-3 text-slate-400 group-hover/assign:text-blue-500" />
                <span className="text-orange-500 group-hover/assign:underline">할당 필요</span>
              </>
            )}
          </div>

          {onMoveNext && currentStage?.nextAction && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onMoveNext();
              }}
            >
              {currentStage.nextAction}
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// 워크플로우 컬럼
function WorkflowColumn({
  stage,
  tasks,
  users,
  onMoveTask,
  onViewTask,
  onAssignTask,
  movingTaskId
}: {
  stage: typeof WORKFLOW_STAGES[0];
  tasks: TuningTask[];
  users: { id: string; full_name: string }[];
  onMoveTask: (taskId: string, nextStatus: string) => void;
  onViewTask: (task: TuningTask) => void;
  onAssignTask: (task: TuningTask) => void;
  movingTaskId: string | null;
}) {
  const Icon = stage.icon;

  return (
    <div className={cn("flex-1 min-w-[280px] max-w-[320px]")}>
      {/* 컬럼 헤더 */}
      <div className={cn("rounded-t-lg p-3 border-b-2", stage.bgColor, stage.borderColor)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={cn("h-5 w-5", stage.color)} />
            <span className="font-semibold">{stage.label}</span>
            <Badge variant="secondary" className="text-xs">
              {tasks.length}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{stage.description}</p>
      </div>

      {/* 태스크 목록 */}
      <div className="bg-slate-50 rounded-b-lg p-2 min-h-[400px] space-y-2">
        {tasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <div className="text-sm">태스크 없음</div>
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              assigneeName={users.find(u => u.id === task.assigned_to)?.full_name}
              onViewDetail={() => onViewTask(task)}
              onAssign={() => onAssignTask(task)}
              onMoveNext={
                stage.nextStatus
                  ? () => onMoveTask(task.id, stage.nextStatus!)
                  : undefined
              }
              isMoving={movingTaskId === task.id}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default function TuningDashboardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [assigningTask, setAssigningTask] = useState<TuningTask | null>(null);
  const [assigneeId, setAssigneeId] = useState('');

  // 선택된 DB 연결 ID 가져오기
  const { selectedConnectionId } = useSelectedDatabase();
  const effectiveConnectionId = selectedConnectionId || 'all';

  // 사용자 목록 조회
  const { data: usersData } = useQuery<{ data: { id: string; full_name: string }[] }>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const users = usersData?.data || [];

  const getAssigneeName = (id?: string) => {
    if (!id) return null;
    return users.find(u => u.id === id)?.full_name || id;
  };

  // 튜닝 태스크 목록 조회
  const { data: tasksData, isLoading } = useQuery<{ data: TuningTask[] }>({
    queryKey: ['tuning-tasks-kanban', effectiveConnectionId],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' });
      if (effectiveConnectionId !== 'all') {
        params.append('connection_id', effectiveConnectionId);
      }
      const res = await fetch(`/api/tuning/tasks?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch tuning tasks');
      return res.json();
    },
    refetchInterval: 60000, // 60초로 증가
    staleTime: 30 * 1000, // 30초간 캐시 유지
    refetchOnWindowFocus: false,
  });

  const tasks = tasksData?.data || [];

  // 상태 변경 Mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/tuning/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to update task');
      return res.json();
    },
    onMutate: ({ id }) => {
      setMovingTaskId(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tuning-tasks-kanban'] });
      toast({
        title: '상태 변경 완료',
        description: '태스크 상태가 업데이트되었습니다.',
      });
    },
    onError: () => {
      toast({
        title: '상태 변경 실패',
        description: '잠시 후 다시 시도해주세요.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setMovingTaskId(null);
    },
  });

  // 담당자 할당 Mutation
  const assignMutation = useMutation({
    mutationFn: async ({ id, assigned_to }: { id: string; assigned_to: string }) => {
      // 1. 담당자 업데이트 (상태도 ASSIGNED로 변경, 단 이미 진행중이면 유지)
      // 상태 결정 로직: 현재 IDENTIFIED이면 ASSIGNED로 변경, 그 외에는 기존 상태 유지
      const currentTask = tasks.find(t => t.id === id);
      const nextStatus = currentTask?.status === 'IDENTIFIED' ? 'ASSIGNED' : undefined;

      const payload: any = {
        assigned_to,
        assigned_at: new Date().toISOString()
      };
      if (nextStatus) payload.status = nextStatus;

      const res = await fetch(`/api/tuning/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.details || errorData.error || 'Failed to assign task');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tuning-tasks-kanban'] });
      setIsAssignDialogOpen(false);
      setAssigneeId('');
      setAssigningTask(null);
      toast({
        title: '담당자 할당 완료',
        description: '담당자가 지정되었습니다.',
      });
    },
    onError: (error) => {
      toast({
        title: '담당자 할당 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // 필터링된 태스크
  const filteredTasks = tasks.filter((task) => {
    const matchesSearch =
      task.sql_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPriority = priorityFilter === 'all' || task.priority === priorityFilter;
    return matchesSearch && matchesPriority;
  });

  // 상태별 그룹핑 (ASSIGNED는 IN_PROGRESS에 포함, CANCELLED는 제외)
  const groupedTasks = {
    IDENTIFIED: filteredTasks.filter(t => t.status === 'IDENTIFIED'),
    IN_PROGRESS: filteredTasks.filter(t => t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED'),
    REVIEW: filteredTasks.filter(t => t.status === 'REVIEW'),
    COMPLETED: filteredTasks.filter(t => t.status === 'COMPLETED'),
  };

  // 통계 계산
  const stats = {
    total: tasks.length,
    inProgress: groupedTasks.IDENTIFIED.length + groupedTasks.IN_PROGRESS.length + groupedTasks.REVIEW.length,
    completed: groupedTasks.COMPLETED.length,
    avgImprovement: groupedTasks.COMPLETED.length > 0
      ? groupedTasks.COMPLETED
        .filter(t => t.improvement_rate != null)
        .reduce((sum, t) => sum + (t.improvement_rate || 0), 0) /
      Math.max(1, groupedTasks.COMPLETED.filter(t => t.improvement_rate != null).length)
      : 0,
    critical: tasks.filter(t => t.priority === 'CRITICAL' && t.status !== 'COMPLETED').length,
  };

  const handleMoveTask = useCallback((taskId: string, nextStatus: string) => {
    updateStatusMutation.mutate({ id: taskId, status: nextStatus });
  }, [updateStatusMutation]);

  const handleViewTask = useCallback((task: TuningTask) => {
    router.push(`/tuning/${task.id}`);
  }, [router]);

  const handleAssignTask = useCallback((task: TuningTask) => {
    setAssigningTask(task);
    setAssigneeId(task.assigned_to || '');
    setIsAssignDialogOpen(true);
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={`skeleton-tuning-stats-${i}`} className="h-32" />
          ))}
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={`skeleton-tuning-charts-${i}`} className="h-96" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">SQL 튜닝 관리</h1>
          <p className="text-muted-foreground mt-1">
            성능 문제 SQL을 발견하고, 튜닝하고, 개선 결과를 추적하세요
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push('/tuning/history')}>
            <History className="h-4 w-4 mr-2" />
            이력 조회
          </Button>
          <Button onClick={() => router.push('/tuning/register')}>
            <Plus className="h-4 w-4 mr-2" />
            SQL 등록
          </Button>
        </div>
      </div>

      {/* 요약 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">전체 작업</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Target className="h-8 w-8 text-slate-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">진행 중</p>
                <p className="text-2xl font-bold text-orange-600">{stats.inProgress}</p>
              </div>
              <PlayCircle className="h-8 w-8 text-orange-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">완료</p>
                <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">평균 개선율</p>
                <p className="text-2xl font-bold text-blue-600">
                  {stats.avgImprovement > 0 ? '+' : ''}{stats.avgImprovement.toFixed(1)}%
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 긴급 알림 */}
      {stats.critical > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-3">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <span className="text-sm text-red-800">
                <strong>{stats.critical}개</strong>의 긴급 튜닝 대상 SQL이 있습니다. 우선 처리가 필요합니다.
              </span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto border-red-300 text-red-700 hover:bg-red-100"
                onClick={() => setPriorityFilter('CRITICAL')}
              >
                긴급 보기
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 검색 및 필터 */}

      {/* 뷰 모드 및 필터 */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
          <Button
            variant={viewMode === 'board' ? 'secondary' : 'ghost'}
            size="sm"
            className={cn("h-8 px-3", viewMode === 'board' && "shadow-sm")}
            onClick={() => setViewMode('board')}
          >
            <LayoutGrid className="h-4 w-4 mr-2" />
            보드
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            className={cn("h-8 px-3", viewMode === 'list' && "shadow-sm")}
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4 mr-2" />
            리스트
          </Button>
        </div>

        <div className="flex flex-1 sm:flex-none gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="SQL ID 또는 제목으로 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[120px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="우선순위" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="CRITICAL">긴급</SelectItem>
              <SelectItem value="HIGH">높음</SelectItem>
              <SelectItem value="MEDIUM">보통</SelectItem>
              <SelectItem value="LOW">낮음</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 메인 뷰 (보드 vs 리스트) */}
      {
        viewMode === 'board' ? (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {WORKFLOW_STAGES.map((stage) => (
              <WorkflowColumn
                key={stage.id}
                stage={stage}
                tasks={groupedTasks[stage.id as keyof typeof groupedTasks] || []}
                users={users}
                onMoveTask={handleMoveTask}
                onViewTask={handleViewTask}
                onAssignTask={handleAssignTask}
                movingTaskId={movingTaskId}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">SQL ID</TableHead>
                    <TableHead>제목</TableHead>
                    <TableHead className="w-[100px]">상태</TableHead>
                    <TableHead className="w-[100px]">우선순위</TableHead>
                    <TableHead className="w-[100px]">담당자</TableHead>
                    <TableHead className="w-[150px] text-right">개선율</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTasks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        태스크가 없습니다
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTasks.map((task) => {
                      const statusConfig = WORKFLOW_STAGES.find(s => s.id === task.status);
                      const StatusIcon = statusConfig?.icon || AlertCircle;

                      return (
                        <TableRow
                          key={task.id}
                          className="cursor-pointer hover:bg-slate-50"
                          onClick={() => handleViewTask(task)}
                        >
                          <TableCell className="font-mono text-xs">{task.sql_id}</TableCell>
                          <TableCell>
                            <div className="font-medium text-sm">{task.title}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[300px]">
                              {task.sql_text}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={cn("gap-1", statusConfig?.bgColor, statusConfig?.color)}
                            >
                              <StatusIcon className="h-3 w-3" />
                              {statusConfig?.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={PRIORITY_CONFIG[task.priority].color}>
                              {PRIORITY_CONFIG[task.priority].label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground group/cell relative">
                            {task.assigned_to ? (
                              <div className="flex items-center gap-1 cursor-pointer hover:text-foreground" onClick={(e) => { e.stopPropagation(); handleAssignTask(task); }}>
                                {getAssigneeName(task.assigned_to)}
                                <Edit className="h-3 w-3 opacity-0 group-hover/cell:opacity-100" />
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs text-orange-500 hover:text-orange-600 hover:bg-orange-50 -ml-2"
                                onClick={(e) => { e.stopPropagation(); handleAssignTask(task); }}
                              >
                                <UserPlus className="h-3 w-3 mr-1" />
                                할당
                              </Button>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {task.improvement_rate != null ? (
                              <span className={cn("font-medium", task.improvement_rate > 0 ? "text-green-600" : "text-red-600")}>
                                {task.improvement_rate > 0 ? '+' : ''}{task.improvement_rate.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleViewTask(task); }}>
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      }

      {/* 빠른 시작 가이드 (태스크가 없을 때) */}
      {
        tasks.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-12">
              <div className="text-center space-y-4">
                <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                  <Lightbulb className="h-8 w-8 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">튜닝 작업을 시작하세요!</h3>
                  <p className="text-muted-foreground mt-1 max-w-md mx-auto">
                    성능 문제가 있는 SQL을 등록하고 체계적으로 튜닝을 진행해보세요.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Button onClick={() => router.push('/tuning/register')}>
                    <Plus className="h-4 w-4 mr-2" />
                    직접 SQL 등록
                  </Button>
                  <Button variant="outline" onClick={() => router.push('/monitoring/top-sql')}>
                    <Zap className="h-4 w-4 mr-2" />
                    Top SQL에서 선택
                  </Button>
                </div>

                {/* 워크플로우 안내 */}
                <div className="pt-8 border-t mt-8">
                  <h4 className="text-sm font-medium mb-4">SQL 튜닝 워크플로우</h4>
                  <div className="flex items-center justify-center gap-2 text-sm flex-wrap">
                    {WORKFLOW_STAGES.map((stage, index) => (
                      <div key={stage.id} className="flex items-center gap-2">
                        <div className={cn(
                          "px-3 py-1.5 rounded-full flex items-center gap-1.5",
                          stage.bgColor, stage.color
                        )}>
                          <stage.icon className="h-4 w-4" />
                          <span>{stage.label}</span>
                        </div>
                        {index < WORKFLOW_STAGES.length - 1 && (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      }
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>담당자 할당</DialogTitle>
            <DialogDescription>
              {assigningTask?.sql_id} ({assigningTask?.title}) 작업을 수행할 담당자를 지정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="assignee" className="mb-2 block">담당자 선택</Label>
            <Select value={assigneeId} onValueChange={setAssigneeId}>
              <SelectTrigger>
                <SelectValue placeholder="담당자를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)}>취소</Button>
            <Button
              onClick={() => {
                if (assigningTask && assigneeId) {
                  assignMutation.mutate({ id: assigningTask.id, assigned_to: assigneeId });
                }
              }}
              disabled={!assigneeId || assignMutation.isPending}
            >
              {assignMutation.isPending ? '저장 중...' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div >
  );
}
