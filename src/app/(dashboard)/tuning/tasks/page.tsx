'use client';

/**
 * Tuning Task Management Page
 * 튜닝 대상 관리 화면
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit, CheckCircle2, Clock, AlertCircle, X, TrendingUp, Calendar } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import ConnectionInfo from '@/components/dashboard/ConnectionInfo';

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
  target_date?: string;
  before_elapsed_time_ms?: number;
  before_buffer_gets?: number;
  after_elapsed_time_ms?: number;
  after_buffer_gets?: number;
  improvement_percent?: number;
  identified_at: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

interface TaskHistory {
  id: string;
  task_id: string;
  action: string;
  changed_by: string;
  changed_at: string;
  comment?: string;
}

interface TaskComment {
  id: string;
  task_id: string;
  comment: string;
  created_by: string;
  created_at: string;
}

interface NewTaskForm {
  oracle_connection_id: string;
  sql_id: string;
  sql_text: string;
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  assigned_to?: string;
  target_date?: string;
}

const STATUS_LABELS = {
  IDENTIFIED: '식별됨',
  ASSIGNED: '할당됨',
  IN_PROGRESS: '진행 중',
  REVIEW: '검토 중',
  COMPLETED: '완료',
  CANCELLED: '취소',
};

const STATUS_COLORS = {
  IDENTIFIED: 'bg-purple-100 text-purple-800',
  ASSIGNED: 'bg-blue-100 text-blue-800',
  IN_PROGRESS: 'bg-orange-100 text-orange-800',
  REVIEW: 'bg-cyan-100 text-cyan-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-800',
};

const PRIORITY_COLORS = {
  CRITICAL: 'destructive',
  HIGH: 'outline',
  MEDIUM: 'default',
  LOW: 'secondary',
} as const;

export default function TuningTasksPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TuningTask | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [newComment, setNewComment] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const initialFormState: NewTaskForm = {
    oracle_connection_id: '',
    sql_id: '',
    sql_text: '',
    title: '',
    description: '',
    priority: 'MEDIUM',
  };

  const [formData, setFormData] = useState<NewTaskForm>(initialFormState);

  // 튜닝 태스크 목록 조회
  const { data: tasks, isLoading } = useQuery<TuningTask[]>({
    queryKey: ['tuning-tasks', statusFilter, priorityFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (priorityFilter !== 'all') params.append('priority', priorityFilter);

      const res = await fetch(`/api/tuning/tasks?${params}`);
      if (!res.ok) throw new Error('Failed to fetch tuning tasks');
      const data = await res.json();
      return data.data || [];
    },
    refetchInterval: 60000, // 60초로 증가
    staleTime: 30 * 1000, // 30초간 캐시 유지
    refetchOnWindowFocus: false,
  });

  // Oracle 연결 목록
  const { data: connections } = useQuery({
    queryKey: ['oracle-connections'],
    queryFn: async () => {
      const res = await fetch('/api/oracle/connections');
      if (!res.ok) throw new Error('Failed to fetch connections');
      return res.json();
    },
  });

  // 태스크 히스토리 조회
  const { data: history } = useQuery<TaskHistory[]>({
    queryKey: ['tuning-history', selectedTask?.id],
    queryFn: async () => {
      if (!selectedTask) return [];
      const res = await fetch(`/api/tuning/tasks/${selectedTask.id}/history`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.data || [];
    },
    enabled: !!selectedTask && isDetailDialogOpen,
  });

  // 태스크 코멘트 조회
  const { data: comments } = useQuery<TaskComment[]>({
    queryKey: ['tuning-comments', selectedTask?.id],
    queryFn: async () => {
      if (!selectedTask) return [];
      const res = await fetch(`/api/tuning/tasks/${selectedTask.id}/comments`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.data || [];
    },
    enabled: !!selectedTask && isDetailDialogOpen,
  });

  // 태스크 추가 Mutation
  const addTaskMutation = useMutation({
    mutationFn: async (data: NewTaskForm) => {
      const res = await fetch('/api/tuning/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create task');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tuning-tasks'] });
      setIsAddDialogOpen(false);
      setFormData(initialFormState);
      toast({
        title: '튜닝 태스크 추가 완료',
        description: '새 튜닝 태스크가 성공적으로 추가되었습니다.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: '태스크 추가 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // 태스크 수정 Mutation
  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TuningTask> }) => {
      const res = await fetch(`/api/tuning/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update task');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tuning-tasks'] });
      setIsEditDialogOpen(false);
      setSelectedTask(null);
      toast({
        title: '태스크 수정 완료',
        description: '튜닝 태스크가 성공적으로 수정되었습니다.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: '태스크 수정 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // 코멘트 추가 Mutation
  const addCommentMutation = useMutation({
    mutationFn: async ({ task_id, comment }: { task_id: string; comment: string }) => {
      const res = await fetch(`/api/tuning/tasks/${task_id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment }),
      });

      if (!res.ok) throw new Error('Failed to add comment');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tuning-comments', selectedTask?.id] });
      setNewComment('');
      toast({
        title: '코멘트 추가',
        description: '코멘트가 추가되었습니다.',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addTaskMutation.mutate(formData);
  };

  const handleEdit = (task: TuningTask) => {
    setSelectedTask(task);
    setFormData({
      oracle_connection_id: task.oracle_connection_id,
      sql_id: task.sql_id,
      sql_text: task.sql_text,
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      assigned_to: task.assigned_to,
      target_date: task.target_date,
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;

    updateTaskMutation.mutate({
      id: selectedTask.id,
      data: {
        ...formData,
        status: (document.getElementById('status') as HTMLSelectElement)?.value as any,
      },
    });
  };

  const handleViewDetail = (task: TuningTask) => {
    setSelectedTask(task);
    setIsDetailDialogOpen(true);
  };

  const handleStatusChange = (task: TuningTask, newStatus: TuningTask['status']) => {
    updateTaskMutation.mutate({
      id: task.id,
      data: { status: newStatus },
    });
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !newComment.trim()) return;

    addCommentMutation.mutate({
      task_id: selectedTask.id,
      comment: newComment,
    });
  };

  // 검색 필터링
  const filteredTasks = tasks?.filter(
    (task) =>
      task.sql_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      task.sql_text.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 상태별 집계
  const statusCounts = tasks?.reduce(
    (acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">튜닝 작업 목록</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            SQL 튜닝 작업 등록 및 진행 상황 관리
          </p>
        </div>

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              새 작업 생성
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>새 튜닝 작업 생성</DialogTitle>
              <DialogDescription>
                튜닝이 필요한 SQL을 등록해주세요.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="oracle_connection_id">DB 연결 *</Label>
                  <Select
                    value={formData.oracle_connection_id}
                    onValueChange={(value) =>
                      setFormData({ ...formData, oracle_connection_id: value })
                    }
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="DB 연결 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {connections?.map((conn: any) => (
                        <SelectItem key={conn.id} value={conn.id}>
                          {conn.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="sql_id">SQL ID *</Label>
                  <Input
                    id="sql_id"
                    value={formData.sql_id}
                    onChange={(e) => setFormData({ ...formData, sql_id: e.target.value })}
                    placeholder="예: 7p5mw8x2n4j9k"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="title">제목 *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="예: HR 시스템 급여 조회 SQL 튜닝"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="sql_text">SQL Text *</Label>
                  <Textarea
                    id="sql_text"
                    value={formData.sql_text}
                    onChange={(e) => setFormData({ ...formData, sql_text: e.target.value })}
                    placeholder="SELECT * FROM ..."
                    rows={4}
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="description">설명</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="튜닝이 필요한 이유 및 상세 내용"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="priority">우선순위 *</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={(value: any) => setFormData({ ...formData, priority: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LOW">Low</SelectItem>
                        <SelectItem value="MEDIUM">Medium</SelectItem>
                        <SelectItem value="HIGH">High</SelectItem>
                        <SelectItem value="CRITICAL">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="target_date">목표일</Label>
                    <Input
                      id="target_date"
                      type="date"
                      value={formData.target_date || ''}
                      onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="assigned_to">담당자</Label>
                  <Input
                    id="assigned_to"
                    value={formData.assigned_to || ''}
                    onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                    placeholder="예: DBA팀"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddDialogOpen(false)}
                >
                  취소
                </Button>
                <Button type="submit" disabled={addTaskMutation.isPending}>
                  {addTaskMutation.isPending ? '생성 중...' : '생성'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* 상태 요약 카드 */}
      <div className="grid gap-4 md:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">전체</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tasks?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-purple-600">식별됨</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{statusCounts?.IDENTIFIED || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-600">할당됨</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{statusCounts?.ASSIGNED || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-600">진행 중</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{statusCounts?.IN_PROGRESS || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-cyan-600">검토 중</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-600">{statusCounts?.REVIEW || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">완료</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{statusCounts?.COMPLETED || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* 필터 */}
      <Card>
        <CardHeader>
          <CardTitle>검색 조건</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="SQL ID, 제목 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                <SelectItem value="IDENTIFIED">식별됨</SelectItem>
                <SelectItem value="ASSIGNED">할당됨</SelectItem>
                <SelectItem value="IN_PROGRESS">진행 중</SelectItem>
                <SelectItem value="REVIEW">검토 중</SelectItem>
                <SelectItem value="COMPLETED">완료</SelectItem>
                <SelectItem value="CANCELLED">취소</SelectItem>
              </SelectContent>
            </Select>

            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="우선순위" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 우선순위</SelectItem>
                <SelectItem value="CRITICAL">Critical</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 태스크 목록 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>튜닝 작업 목록 ({filteredTasks?.length || 0}건)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={`skeleton-tuning-tasks-${i}`} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredTasks && filteredTasks.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">번호</TableHead>
                    <TableHead>SQL ID</TableHead>
                    <TableHead>제목</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>우선순위</TableHead>
                    <TableHead>담당자</TableHead>
                    <TableHead className="text-right">개선율</TableHead>
                    <TableHead>목표일</TableHead>
                    <TableHead>생성일</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTasks.map((task, index) => (
                    <TableRow key={task.id} className="cursor-pointer hover:bg-accent">
                      <TableCell className="text-center font-medium">{index + 1}</TableCell>
                      <TableCell className="font-mono text-sm">
                        <a className="text-blue-600 hover:underline" onClick={() => handleViewDetail(task)}>
                          {task.sql_id}
                        </a>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate">
                        <a className="hover:underline" onClick={() => handleViewDetail(task)}>
                          {task.title || '제목 없음'}
                        </a>
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[task.status]}>
                          {STATUS_LABELS[task.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={PRIORITY_COLORS[task.priority]}>
                          {task.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>{task.assigned_to || '-'}</TableCell>
                      <TableCell className="text-right">
                        {task.improvement_percent != null ? (
                          <span className={task.improvement_percent > 0 ? 'text-green-600 font-medium' : ''}>
                            {task.improvement_percent > 0 ? '+' : ''}
                            {task.improvement_percent.toFixed(1)}%
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {task.target_date ? new Date(task.target_date).toLocaleDateString('ko-KR') : '-'}
                      </TableCell>
                      <TableCell>
                        {new Date(task.created_at).toLocaleDateString('ko-KR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleEdit(task)}>
                            <Edit className="h-4 w-4 mr-1" />
                            수정
                          </Button>
                          {task.status === 'IN_PROGRESS' && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleStatusChange(task, 'COMPLETED')}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              완료
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">조회된 튜닝 작업이 없습니다</p>
              <p className="text-sm mt-2">새 작업을 생성하거나 필터 조건을 변경해보세요</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 상세 보기 다이얼로그 */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>튜닝 작업 상세</DialogTitle>
            <DialogDescription>
              작업 상세 정보, 이력, 코멘트를 확인할 수 있습니다
            </DialogDescription>
          </DialogHeader>

          {selectedTask && (
            <Tabs defaultValue="info" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="info">기본 정보</TabsTrigger>
                <TabsTrigger value="history">이력</TabsTrigger>
                <TabsTrigger value="comments">코멘트</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">SQL ID</Label>
                    <p className="font-mono mt-1">{selectedTask.sql_id}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">제목</Label>
                    <p className="mt-1">{selectedTask.title}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">상태</Label>
                    <div className="mt-1">
                      <Badge className={STATUS_COLORS[selectedTask.status]}>
                        {STATUS_LABELS[selectedTask.status]}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">우선순위</Label>
                    <div className="mt-1">
                      <Badge variant={PRIORITY_COLORS[selectedTask.priority]}>
                        {selectedTask.priority}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">담당자</Label>
                    <p className="mt-1">{selectedTask.assigned_to || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">목표일</Label>
                    <p className="mt-1">
                      {selectedTask.target_date
                        ? new Date(selectedTask.target_date).toLocaleDateString('ko-KR')
                        : '-'}
                    </p>
                  </div>
                  {selectedTask.improvement_percent != null && (
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">개선율</Label>
                      <p className="mt-1 text-green-600 font-semibold flex items-center gap-1">
                        <TrendingUp className="h-4 w-4" />
                        {selectedTask.improvement_percent.toFixed(1)}%
                      </p>
                    </div>
                  )}
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">생성일</Label>
                    <p className="mt-1">
                      {new Date(selectedTask.created_at).toLocaleString('ko-KR')}
                    </p>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium text-muted-foreground">설명</Label>
                  <p className="mt-1">{selectedTask.description || '-'}</p>
                </div>

                {(selectedTask.before_elapsed_time_ms != null || selectedTask.before_buffer_gets != null) && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">Before 메트릭</Label>
                    <p className="mt-1">
                      Elapsed: {selectedTask.before_elapsed_time_ms}ms, Buffer Gets:{' '}
                      {selectedTask.before_buffer_gets}
                    </p>
                  </div>
                )}

                {(selectedTask.after_elapsed_time_ms != null || selectedTask.after_buffer_gets != null) && (
                  <div>
                    <Label className="text-sm font-medium text-muted-foreground">After 메트릭</Label>
                    <p className="mt-1 text-green-600">
                      Elapsed: {selectedTask.after_elapsed_time_ms}ms, Buffer Gets:{' '}
                      {selectedTask.after_buffer_gets}
                    </p>
                  </div>
                )}

                <div>
                  <Label className="text-sm font-medium text-muted-foreground">SQL Text</Label>
                  <pre className="mt-1 p-3 bg-muted rounded-md text-xs overflow-x-auto">
                    {selectedTask.sql_text}
                  </pre>
                </div>
              </TabsContent>

              <TabsContent value="history" className="space-y-3">
                {history && history.length > 0 ? (
                  history.map((h) => (
                    <Card key={h.id}>
                      <CardContent className="pt-4">
                        <div className="flex items-start gap-3">
                          <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{h.action}</span>
                              <span className="text-sm text-muted-foreground">- {h.changed_by}</span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {new Date(h.changed_at).toLocaleString('ko-KR')}
                            </div>
                            {h.comment && (
                              <p className="mt-2 text-sm">{h.comment}</p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    이력이 없습니다
                  </div>
                )}
              </TabsContent>

              <TabsContent value="comments" className="space-y-3">
                {comments && comments.length > 0 && (
                  <div className="space-y-3 mb-4">
                    {comments.map((comment) => (
                      <Card key={comment.id}>
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between mb-2">
                            <span className="font-medium">{comment.created_by}</span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(comment.created_at).toLocaleString('ko-KR')}
                            </span>
                          </div>
                          <p className="text-sm">{comment.comment}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                <form onSubmit={handleAddComment} className="space-y-2">
                  <Textarea
                    placeholder="코멘트를 입력하세요"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    rows={3}
                  />
                  <div className="flex justify-end">
                    <Button type="submit" size="sm" disabled={!newComment.trim() || addCommentMutation.isPending}>
                      {addCommentMutation.isPending ? '추가 중...' : '코멘트 추가'}
                    </Button>
                  </div>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* 수정 다이얼로그 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>튜닝 작업 수정</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleUpdate}>
            <div className="space-y-4 py-4">
              <div className="grid gap-2">
                <Label>SQL ID</Label>
                <Input value={formData.sql_id} disabled />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit_title">제목</Label>
                <Input
                  id="edit_title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="edit_description">설명</Label>
                <Textarea
                  id="edit_description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="priority_edit">우선순위</Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value: any) => setFormData({ ...formData, priority: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="CRITICAL">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="status">상태</Label>
                  <Select defaultValue={selectedTask?.status}>
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IDENTIFIED">식별됨</SelectItem>
                      <SelectItem value="ASSIGNED">할당됨</SelectItem>
                      <SelectItem value="IN_PROGRESS">진행 중</SelectItem>
                      <SelectItem value="REVIEW">검토 중</SelectItem>
                      <SelectItem value="COMPLETED">완료</SelectItem>
                      <SelectItem value="CANCELLED">취소</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="assigned_to_edit">담당자</Label>
                  <Input
                    id="assigned_to_edit"
                    value={formData.assigned_to || ''}
                    onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="target_date_edit">목표일</Label>
                  <Input
                    id="target_date_edit"
                    type="date"
                    value={formData.target_date || ''}
                    onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
              >
                취소
              </Button>
              <Button type="submit" disabled={updateTaskMutation.isPending}>
                {updateTaskMutation.isPending ? '수정 중...' : '수정'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
