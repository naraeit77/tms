'use client';

/**
 * SQL Tuning Advisor Page (Oracle Enterprise Edition Only)
 * SQL 튜닝 어드바이저 - 특정 SQL 성능 분석 및 튜닝 권장사항 제공
 * DBMS_SQLTUNE 패키지 기반 (Tuning Pack 라이센스 필요)
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  RefreshCw,
  AlertCircle,
  Info,
  Loader2,
  Crown,
  Play,
  CheckCircle,
  XCircle,
  FileText,
  TrendingUp,
  Database,
  Zap,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface TuningTask {
  task_id: number;
  task_name: string;
  description?: string;
  owner: string;
  created: string;
  status: string;
  execution_count: number;
  recommendation_count?: number;
  sql_id?: string;
  sql_text?: string;
}

interface TuningRecommendation {
  finding: string;
  benefit_type: string;
  benefit_value?: number;
  message: string;
  actions?: string[];
  rationale?: string;
  sql_profile_name?: string;
}

export default function SQLTuningAdvisorPage() {
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
  const [sqlText, setSqlText] = useState('');
  const [sqlId, setSqlId] = useState('');
  const [taskName, setTaskName] = useState('');
  const [selectedTask, setSelectedTask] = useState<TuningTask | null>(null);
  const [recommendationsDialogOpen, setRecommendationsDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 튜닝 작업 목록 조회
  const {
    data: tasksData,
    isLoading: isLoadingTasks,
    error: tasksError,
    refetch: refetchTasks,
  } = useQuery({
    queryKey: ['sql-tuning-tasks', selectedConnectionId],
    queryFn: async () => {
      if (!selectedConnectionId || selectedConnectionId === 'all') {
        throw new Error('특정 데이터베이스를 선택해주세요');
      }

      const res = await fetch(`/api/advisor/sql-tuning/tasks?connection_id=${selectedConnectionId}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch tuning tasks');
      }
      return res.json();
    },
    enabled: !!selectedConnectionId && selectedConnectionId !== 'all',
    retry: false,
  });

  const tasks: TuningTask[] = tasksData?.data || [];
  const isEnterpriseEdition = tasksData?.isEnterprise !== false;

  // 튜닝 작업 생성
  const createTaskMutation = useMutation({
    mutationFn: async ({ sqlText, sqlId, taskName }: { sqlText?: string; sqlId?: string; taskName: string }) => {
      const res = await fetch('/api/advisor/sql-tuning/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: selectedConnectionId,
          sql_text: sqlText,
          sql_id: sqlId,
          task_name: taskName,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create tuning task');
      }

      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: '튜닝 작업 생성 완료',
        description: `작업 "${data.data.task_name}"이(가) 생성되었습니다.`,
      });
      refetchTasks();
      setSqlText('');
      setSqlId('');
      setTaskName('');
    },
    onError: (error: Error) => {
      toast({
        title: '튜닝 작업 생성 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // 튜닝 작업 실행
  const executeTaskMutation = useMutation({
    mutationFn: async (taskName: string) => {
      const res = await fetch('/api/advisor/sql-tuning/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: selectedConnectionId,
          task_name: taskName,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to execute tuning task');
      }

      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: '튜닝 작업 실행 완료',
        description: '권장사항 분석이 완료되었습니다.',
      });
      refetchTasks();
    },
    onError: (error: Error) => {
      toast({
        title: '튜닝 작업 실행 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // 튜닝 작업 목록 정리
  const clearTasksMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/advisor/sql-tuning/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: selectedConnectionId,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to clear tuning tasks');
      }

      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: '작업 목록 정리 완료',
        description: data.message || '튜닝 작업 목록이 정리되었습니다.',
      });
      refetchTasks();
    },
    onError: (error: Error) => {
      toast({
        title: '작업 목록 정리 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // 튜닝 권장사항 조회
  const {
    data: recommendationsData,
    isLoading: isLoadingRecommendations,
    error: recommendationsError,
  } = useQuery({
    queryKey: ['sql-tuning-recommendations', selectedTask?.task_name, selectedConnectionId],
    queryFn: async () => {
      if (!selectedTask) return null;

      console.log('[Recommendations] Fetching for task:', selectedTask.task_name);
      const res = await fetch(
        `/api/advisor/sql-tuning/recommendations?connection_id=${selectedConnectionId}&task_name=${encodeURIComponent(selectedTask.task_name)}`
      );

      console.log('[Recommendations] Response status:', res.status);

      if (!res.ok) {
        const error = await res.json();
        console.error('[Recommendations] Error:', error);
        throw new Error(error.error || 'Failed to fetch recommendations');
      }

      const data = await res.json();
      console.log('[Recommendations] Data received:', data);
      return data;
    },
    enabled: !!selectedTask && recommendationsDialogOpen,
    retry: false,
  });

  const recommendations: TuningRecommendation[] = recommendationsData?.data || [];

  // Debug logging when state changes
  useEffect(() => {
    console.log('[Recommendations] Current state:', {
      selectedTask: selectedTask?.task_name,
      dialogOpen: recommendationsDialogOpen,
      isLoading: isLoadingRecommendations,
      error: recommendationsError,
      dataCount: recommendations.length,
      rawData: recommendationsData,
    });
  }, [selectedTask, recommendationsDialogOpen, isLoadingRecommendations, recommendationsError, recommendations.length, recommendationsData]);

  const handleCreateTask = () => {
    if (!taskName.trim()) {
      toast({
        title: '입력 오류',
        description: '작업 이름을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    if (!sqlText.trim() && !sqlId.trim()) {
      toast({
        title: '입력 오류',
        description: 'SQL 텍스트 또는 SQL ID를 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    createTaskMutation.mutate({
      sqlText: sqlText.trim() || undefined,
      sqlId: sqlId.trim() || undefined,
      taskName: taskName.trim(),
    });
  };

  const handleViewRecommendations = (task: TuningTask) => {
    setSelectedTask(task);
    setRecommendationsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">SQL Tuning Advisor</h1>
            <Badge variant="secondary" className="gap-1">
              <Crown className="h-3 w-3" />
              Enterprise Only
            </Badge>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            특정 SQL 성능 분석 및 자동 튜닝 권장사항 제공 (DBMS_SQLTUNE)
          </p>
          {selectedConnection && (
            <p className="text-sm text-muted-foreground mt-1">
              연결: <span className="font-medium">{selectedConnection.name}</span> ({selectedConnection.host}:{selectedConnection.port})
            </p>
          )}
        </div>
      </div>

      {/* 기능 설명 */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>SQL Tuning Advisor 소개</AlertTitle>
        <AlertDescription className="space-y-1">
          <p>
            SQL Tuning Advisor(STA)는 Oracle Enterprise Edition의 Tuning Pack 기능으로, DBMS_SQLTUNE 패키지를 통해 제공됩니다.
          </p>
          <p>
            특정 SQL 문장의 실행 계획, 통계 정보, 객체 속성을 분석하여 성능 개선안을 제안합니다:
          </p>
          <ul className="text-sm list-disc list-inside ml-2 mt-2 space-y-1">
            <li><strong>통계 최적화</strong>: 누락되거나 오래된 통계 수집 권장</li>
            <li><strong>SQL 프로파일</strong>: 더 나은 실행 계획을 위한 추가 정보 생성</li>
            <li><strong>인덱스 제안</strong>: 성능 향상을 위한 새로운 인덱스 생성 권장</li>
            <li><strong>SQL 구조 변경</strong>: 더 효율적인 형태로 SQL 재작성 제안</li>
          </ul>
        </AlertDescription>
      </Alert>

      {/* Enterprise Edition 체크 */}
      {!selectedConnectionId || selectedConnectionId === 'all' ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>데이터베이스 선택 필요</AlertTitle>
          <AlertDescription>
            SQL Tuning Advisor를 사용하려면 특정 Oracle 데이터베이스를 선택해주세요.
          </AlertDescription>
        </Alert>
      ) : tasksError ? (
        <Alert variant="destructive">
          <Crown className="h-4 w-4" />
          <AlertTitle>SQL Tuning Advisor 사용 불가</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>SQL Tuning Advisor는 Oracle Enterprise Edition의 Tuning Pack이 필요합니다.</p>
            {tasksError.message && (
              <p className="text-sm font-medium">{tasksError.message}</p>
            )}
            <p className="text-sm">
              Enterprise Edition이 아니거나 CONTROL_MANAGEMENT_PACK_ACCESS 파라미터가 올바르게 설정되지 않았을 수 있습니다.
            </p>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {/* 새 튜닝 작업 생성 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                새 튜닝 작업 생성
              </CardTitle>
              <CardDescription>
                분석할 SQL을 입력하고 튜닝 작업을 생성하세요
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">작업 이름</label>
                  <Input
                    placeholder="예: TUNE_SLOW_QUERY_001"
                    value={taskName}
                    onChange={(e) => setTaskName(e.target.value)}
                  />
                </div>

                <Tabs defaultValue="sql-text" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="sql-text">SQL 텍스트</TabsTrigger>
                    <TabsTrigger value="sql-id">SQL ID</TabsTrigger>
                  </TabsList>

                  <TabsContent value="sql-text" className="space-y-2">
                    <label className="text-sm font-medium">SQL 문장</label>
                    <Textarea
                      placeholder="튜닝할 SQL 문장을 입력하세요..."
                      value={sqlText}
                      onChange={(e) => setSqlText(e.target.value)}
                      rows={8}
                      className="font-mono text-sm"
                    />
                  </TabsContent>

                  <TabsContent value="sql-id" className="space-y-2">
                    <label className="text-sm font-medium">SQL ID</label>
                    <Input
                      placeholder="예: 5z9yn8pqm7xk2"
                      value={sqlId}
                      onChange={(e) => setSqlId(e.target.value)}
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">
                      Shared Pool에서 SQL ID로 SQL을 찾아 튜닝 작업을 생성합니다
                    </p>
                  </TabsContent>
                </Tabs>

                <Button
                  onClick={handleCreateTask}
                  disabled={createTaskMutation.isPending}
                  className="w-full"
                >
                  {createTaskMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      작업 생성 중...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      튜닝 작업 생성 및 실행
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 튜닝 작업 목록 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>튜닝 작업 목록</CardTitle>
                  <CardDescription>
                    생성된 SQL Tuning Advisor 작업 및 분석 결과
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchTasks()}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    새로고침
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => clearTasksMutation.mutate()}
                    disabled={clearTasksMutation.isPending || !selectedConnectionId || tasks.length === 0}
                  >
                    {clearTasksMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        정리 중...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        데이터 정리
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingTasks ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : tasks.length > 0 ? (
                <div className="space-y-3">
                  {tasks.map((task) => (
                    <div
                      key={task.task_id}
                      className="border rounded-lg p-4 hover:shadow-md transition-all"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{task.task_name}</h3>
                            <Badge variant={task.status === 'COMPLETED' ? 'default' : 'secondary'}>
                              {task.status}
                            </Badge>
                          </div>
                          {task.description && (
                            <p className="text-sm text-muted-foreground">{task.description}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => executeTaskMutation.mutate(task.task_name)}
                            disabled={executeTaskMutation.isPending}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            실행
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleViewRecommendations(task)}
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            권장사항
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">소유자</div>
                          <div className="font-medium">{task.owner}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">생성일시</div>
                          <div className="text-xs">
                            {format(new Date(task.created), 'yyyy-MM-dd HH:mm', { locale: ko })}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">실행 횟수</div>
                          <div className="font-medium">{task.execution_count}</div>
                        </div>
                        {task.recommendation_count !== undefined && (
                          <div>
                            <div className="text-xs text-muted-foreground">권장사항</div>
                            <div className="font-medium">{task.recommendation_count}개</div>
                          </div>
                        )}
                      </div>

                      {task.sql_text && (
                        <div className="mt-3 p-2 bg-muted rounded text-xs font-mono truncate">
                          {task.sql_text}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-lg font-medium">생성된 튜닝 작업이 없습니다.</p>
                  <p className="text-sm mt-2">위에서 새 튜닝 작업을 생성해보세요.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* 권장사항 다이얼로그 */}
      <Dialog open={recommendationsDialogOpen} onOpenChange={setRecommendationsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              튜닝 권장사항
            </DialogTitle>
            <DialogDescription>
              {selectedTask?.task_name}
            </DialogDescription>
          </DialogHeader>

          {isLoadingRecommendations ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : recommendationsError ? (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 mx-auto mb-3 text-destructive opacity-50" />
              <p className="font-medium text-destructive">권장사항을 불러오는 중 오류가 발생했습니다.</p>
              <p className="text-sm text-muted-foreground mt-2">{recommendationsError.message}</p>
            </div>
          ) : recommendations.length > 0 ? (
            <div className="space-y-4">
              {recommendations.map((rec, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-500" />
                      {rec.finding}
                    </h3>
                    <Badge variant="outline">{rec.benefit_type}</Badge>
                  </div>

                  <p className="text-sm">{rec.message}</p>

                  {rec.benefit_value !== undefined && (
                    <div className="flex items-center gap-2 text-sm">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      <span className="font-medium">예상 개선율: {rec.benefit_value.toFixed(1)}%</span>
                    </div>
                  )}

                  {rec.rationale && (
                    <div className="bg-muted p-3 rounded text-sm">
                      <div className="font-medium mb-1">근거:</div>
                      <p>{rec.rationale}</p>
                    </div>
                  )}

                  {rec.actions && rec.actions.length > 0 && (
                    <div>
                      <div className="font-medium text-sm mb-2">권장 조치:</div>
                      <div className="space-y-1">
                        {rec.actions.map((action, idx) => (
                          <div key={idx} className="bg-muted p-2 rounded text-xs font-mono">
                            {action}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {rec.sql_profile_name && (
                    <div className="flex items-center gap-2 text-sm text-blue-600">
                      <Database className="h-4 w-4" />
                      <span>SQL 프로파일: {rec.sql_profile_name}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>권장사항이 없거나 아직 분석이 완료되지 않았습니다.</p>
              <p className="text-sm mt-2">작업을 먼저 실행해주세요.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
