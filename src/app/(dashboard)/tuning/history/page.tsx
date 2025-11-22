'use client';

/**
 * Tuning History Page
 * 튜닝 이력 페이지
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Filter, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

interface TuningHistory {
  id: string;
  tuning_task_id: string;
  oracle_connection_id: string;
  sql_id: string;
  activity_type: string;
  description: string;
  old_value?: any;
  new_value?: any;
  elapsed_time_ms?: number;
  buffer_gets?: number;
  cpu_time_ms?: number;
  performed_by?: string;
  performed_at: string;
}

interface TuningTask {
  id: string;
  title: string;
  sql_id: string;
  status: string;
  priority: string;
  improvement_rate?: number;
  completed_at?: string;
}

export default function TuningHistoryPage() {
  const [activityTypeFilter, setActivityTypeFilter] = useState<string>('all');
  const [limit, setLimit] = useState<number>(50);

  // 튜닝 이력 조회
  const { data: historyData, isLoading } = useQuery({
    queryKey: ['tuning-history', activityTypeFilter, limit],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: limit.toString(),
      });

      if (activityTypeFilter !== 'all') {
        params.append('activity_type', activityTypeFilter);
      }

      const res = await fetch(`/api/tuning/history?${params}`);
      if (!res.ok) throw new Error('Failed to fetch tuning history');
      return res.json();
    },
    refetchInterval: 60000,
  });

  const history: TuningHistory[] = historyData?.data || [];

  // 완료된 튜닝 작업 조회
  const { data: completedTasks } = useQuery<TuningTask[]>({
    queryKey: ['completed-tuning-tasks'],
    queryFn: async () => {
      const res = await fetch('/api/tuning/tasks?status=COMPLETED&limit=20');
      if (!res.ok) throw new Error('Failed to fetch completed tasks');
      const data = await res.json();
      return data.data || [];
    },
  });

  // 통계 계산
  const avgImprovement = completedTasks
    ? (completedTasks.reduce((sum, task) => sum + (task.improvement_rate || 0), 0) / completedTasks.length).toFixed(2)
    : '0.00';

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">튜닝 이력</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          완료된 SQL 튜닝 작업 이력 및 활동 로그
        </p>
      </div>

      {/* 통계 카드 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              완료된 튜닝 작업
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{completedTasks?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              평균 성능 개선율
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{avgImprovement}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              총 활동 로그
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{history.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* 완료된 튜닝 작업 목록 */}
      <Card>
        <CardHeader>
          <CardTitle>완료된 튜닝 작업</CardTitle>
          <CardDescription>성능 개선이 완료된 SQL 목록</CardDescription>
        </CardHeader>
        <CardContent>
          {completedTasks && completedTasks.length > 0 ? (
            <div className="space-y-3">
              {completedTasks.map((task) => (
                <CompletedTaskItem key={task.id} task={task} />
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              완료된 튜닝 작업이 없습니다.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 활동 이력 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>활동 이력</CardTitle>
              <CardDescription>튜닝 작업 관련 모든 활동 로그</CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Select value={activityTypeFilter} onValueChange={setActivityTypeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="활동 유형" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 활동</SelectItem>
                  <SelectItem value="STATUS_CHANGE">상태 변경</SelectItem>
                  <SelectItem value="ASSIGNMENT">할당</SelectItem>
                  <SelectItem value="COMMENT">코멘트</SelectItem>
                  <SelectItem value="TUNING_ACTION">튜닝 작업</SelectItem>
                </SelectContent>
              </Select>

              <Select value={limit.toString()} onValueChange={(v) => setLimit(parseInt(v))}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25개</SelectItem>
                  <SelectItem value="50">50개</SelectItem>
                  <SelectItem value="100">100개</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : history.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>시간</TableHead>
                    <TableHead>활동 유형</TableHead>
                    <TableHead>SQL ID</TableHead>
                    <TableHead>설명</TableHead>
                    <TableHead>수행자</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-sm">
                        {new Date(item.performed_at).toLocaleString('ko-KR')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.activity_type}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.sql_id}</TableCell>
                      <TableCell className="max-w-md truncate">{item.description}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.performed_by || 'System'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              활동 이력이 없습니다.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// 완료된 작업 아이템 컴포넌트
interface CompletedTaskItemProps {
  task: TuningTask;
}

function CompletedTaskItem({ task }: CompletedTaskItemProps) {
  const getImprovementIcon = (rate?: number) => {
    if (!rate) return <Minus className="h-4 w-4 text-gray-500" />;
    if (rate > 50) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (rate > 20) return <TrendingUp className="h-4 w-4 text-yellow-600" />;
    return <TrendingDown className="h-4 w-4 text-red-600" />;
  };

  const getImprovementColor = (rate?: number) => {
    if (!rate) return 'text-gray-500';
    if (rate > 50) return 'text-green-600';
    if (rate > 20) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-medium">{task.title}</h4>
          <Badge variant="outline" className="text-xs">
            {task.priority}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          SQL ID: <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{task.sql_id}</code>
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <div className="flex items-center gap-1">
            {getImprovementIcon(task.improvement_rate)}
            <span className={`text-sm font-medium ${getImprovementColor(task.improvement_rate)}`}>
              {task.improvement_rate?.toFixed(2) || '0.00'}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground">성능 개선</p>
        </div>

        {task.completed_at && (
          <div className="text-right">
            <div className="flex items-center gap-1 text-sm">
              <Calendar className="h-3 w-3" />
              <span>{new Date(task.completed_at).toLocaleDateString('ko-KR')}</span>
            </div>
            <p className="text-xs text-muted-foreground">완료일</p>
          </div>
        )}
      </div>
    </div>
  );
}
