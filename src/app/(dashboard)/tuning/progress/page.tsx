'use client';

/**
 * Tuning Progress Page
 * 튜닝 진행 현황 페이지
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { TrendingUp, Clock, CheckCircle2, AlertCircle, User } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

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
  tuning_method?: string;
}

export default function TuningProgressPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>('IN_PROGRESS');

  // 진행 중인 튜닝 태스크 조회
  const { data: tasks, isLoading } = useQuery<TuningTask[]>({
    queryKey: ['tuning-progress', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      const res = await fetch(`/api/tuning/tasks?${params}`);
      if (!res.ok) throw new Error('Failed to fetch tuning tasks');
      const data = await res.json();
      return data.data || [];
    },
    refetchInterval: 30000,
  });

  // 진행률 계산
  const calculateProgress = (task: TuningTask) => {
    const statusProgress = {
      IDENTIFIED: 10,
      ASSIGNED: 25,
      IN_PROGRESS: 50,
      REVIEW: 75,
      COMPLETED: 100,
      CANCELLED: 0,
    };
    return statusProgress[task.status];
  };

  // 상태별 통계
  const stats = {
    total: tasks?.length || 0,
    inProgress: tasks?.filter(t => t.status === 'IN_PROGRESS').length || 0,
    review: tasks?.filter(t => t.status === 'REVIEW').length || 0,
    completed: tasks?.filter(t => t.status === 'COMPLETED').length || 0,
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">튜닝 진행 현황</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          현재 진행 중인 SQL 튜닝 작업 현황 및 진행률
        </p>
      </div>

      {/* 통계 카드 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              전체 진행 중
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              작업 중
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{stats.inProgress}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              검토 중
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">{stats.review}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              완료
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.completed}</div>
          </CardContent>
        </Card>
      </div>

      {/* 필터 */}
      <Card>
        <CardHeader>
          <CardTitle>필터</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="상태 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="ASSIGNED">할당됨</SelectItem>
              <SelectItem value="IN_PROGRESS">진행 중</SelectItem>
              <SelectItem value="REVIEW">검토 중</SelectItem>
              <SelectItem value="COMPLETED">완료</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* 진행 현황 목록 */}
      <div className="grid gap-4">
        {isLoading ? (
          [...Array(5)].map((_, i) => <Skeleton key={i} className="h-64" />)
        ) : tasks && tasks.length > 0 ? (
          tasks.map((task) => (
            <ProgressCard
              key={task.id}
              task={task}
              progress={calculateProgress(task)}
              onClick={() => router.push(`/tuning/tasks/${task.id}`)}
            />
          ))
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">조회된 튜닝 작업이 없습니다.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// 진행 현황 카드 컴포넌트
interface ProgressCardProps {
  task: TuningTask;
  progress: number;
  onClick: () => void;
}

function ProgressCard({ task, progress, onClick }: ProgressCardProps) {
  const priorityColors = {
    CRITICAL: 'destructive',
    HIGH: 'outline',
    MEDIUM: 'default',
    LOW: 'secondary',
  } as const;

  const statusConfig = {
    IDENTIFIED: { label: '식별됨', color: 'text-blue-600' },
    ASSIGNED: { label: '할당됨', color: 'text-yellow-600' },
    IN_PROGRESS: { label: '진행 중', color: 'text-orange-600' },
    REVIEW: { label: '검토 중', color: 'text-purple-600' },
    COMPLETED: { label: '완료', color: 'text-green-600' },
    CANCELLED: { label: '취소', color: 'text-gray-600' },
  };

  const status = statusConfig[task.status];

  // 소요 시간 계산
  const getDuration = () => {
    if (task.started_at && task.completed_at) {
      const start = new Date(task.started_at);
      const end = new Date(task.completed_at);
      const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      return `${days}일`;
    }
    if (task.started_at) {
      const start = new Date(task.started_at);
      const now = new Date();
      const days = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      return `${days}일 경과`;
    }
    return '-';
  };

  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={onClick}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <CardTitle className="text-lg">{task.title}</CardTitle>
              <Badge variant={priorityColors[task.priority]}>{task.priority}</Badge>
            </div>
            <CardDescription>
              SQL ID: <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{task.sql_id}</code>
            </CardDescription>
          </div>
          <div className={`text-sm font-medium ${status.color}`}>
            {status.label}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* SQL Text */}
        <p className="text-sm text-muted-foreground line-clamp-2">
          {task.sql_text}
        </p>

        {/* 진행률 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">진행률</span>
            <span className={status.color}>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* 상세 정보 */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">담당자:</span>
            <span>{task.assigned_to ? '할당됨' : '미할당'}</span>
          </div>

          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">소요 시간:</span>
            <span>{getDuration()}</span>
          </div>

          {task.tuning_method && (
            <div className="flex items-center gap-2 col-span-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">튜닝 방법:</span>
              <span>{task.tuning_method}</span>
            </div>
          )}

          {task.improvement_rate !== undefined && task.improvement_rate > 0 && (
            <div className="flex items-center gap-2 col-span-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-muted-foreground">성능 개선:</span>
              <span className="text-green-600 font-medium">
                {task.improvement_rate.toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        {/* Before/After 성능 비교 */}
        {task.before_elapsed_time_ms && task.after_elapsed_time_ms && (
          <div className="border-t pt-4 mt-4">
            <h4 className="text-sm font-medium mb-3">성능 비교</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">튜닝 전</p>
                <p className="font-mono">
                  {task.before_elapsed_time_ms.toLocaleString()}ms
                </p>
                <p className="text-xs text-muted-foreground">
                  Buffer: {task.before_buffer_gets?.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">튜닝 후</p>
                <p className="font-mono text-green-600">
                  {task.after_elapsed_time_ms.toLocaleString()}ms
                </p>
                <p className="text-xs text-muted-foreground">
                  Buffer: {task.after_buffer_gets?.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 예상 완료일 */}
        {task.estimated_completion_date && task.status !== 'COMPLETED' && (
          <div className="text-xs text-muted-foreground">
            예상 완료일: {new Date(task.estimated_completion_date).toLocaleDateString('ko-KR')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
