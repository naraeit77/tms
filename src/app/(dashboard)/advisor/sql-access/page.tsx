'use client';

/**
 * SQL Access Advisor Page (Oracle Enterprise Edition Only)
 * SQL 액세스 어드바이저 - 워크로드 기반 인덱스, MV, 파티셔닝 권장
 * DBMS_ADVISOR 패키지 기반 (Tuning Pack 라이센스 필요)
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Database,
  RefreshCw,
  AlertCircle,
  Info,
  Loader2,
  Crown,
  Play,
  FileText,
  Layers,
  Table,
  Eye,
  Trash2,
} from 'lucide-react';
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
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface AccessTask {
  task_id: number;
  task_name: string;
  description?: string;
  owner: string;
  created: string;
  status: string;
  workload_type: string;
  recommendation_count?: number;
}

export default function SQLAccessAdvisorPage() {
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
  const [taskName, setTaskName] = useState('');
  const [workloadType, setWorkloadType] = useState('CURRENT');
  const { toast } = useToast();

  // 작업 목록 조회
  const {
    data: tasksData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['sql-access-tasks', selectedConnectionId],
    queryFn: async () => {
      if (!selectedConnectionId || selectedConnectionId === 'all') {
        throw new Error('특정 데이터베이스를 선택해주세요');
      }

      const res = await fetch(`/api/advisor/sql-access/tasks?connection_id=${selectedConnectionId}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch access advisor tasks');
      }
      return res.json();
    },
    enabled: !!selectedConnectionId && selectedConnectionId !== 'all',
    retry: false,
  });

  const tasks: AccessTask[] = tasksData?.data || [];

  // 작업 생성 및 실행
  const createTaskMutation = useMutation({
    mutationFn: async () => {
      if (!taskName.trim()) {
        throw new Error('작업 이름을 입력해주세요');
      }

      const res = await fetch('/api/advisor/sql-access/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: selectedConnectionId,
          task_name: taskName.trim(),
          workload_type: workloadType,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create access advisor task');
      }

      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: '작업 생성 완료',
        description: data.message || 'SQL Access Advisor 작업이 생성되고 실행되었습니다.',
      });
      setTaskName(''); // 입력 필드 초기화
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: '작업 생성 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // 작업 목록 정리
  const clearTasksMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/advisor/sql-access/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: selectedConnectionId,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to clear access advisor tasks');
      }

      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: '작업 목록 정리 완료',
        description: data.message || 'SQL Access Advisor 작업 목록이 정리되었습니다.',
      });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: '작업 목록 정리 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">SQL Access Advisor</h1>
            <Badge variant="secondary" className="gap-1">
              <Crown className="h-3 w-3" />
              Enterprise Only
            </Badge>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            워크로드 기반 인덱스, 머티리얼라이즈드 뷰, 파티셔닝 권장 (DBMS_ADVISOR)
          </p>
          {selectedConnection && (
            <p className="text-sm text-muted-foreground mt-1">
              연결: <span className="font-medium">{selectedConnection.name}</span>
            </p>
          )}
        </div>
      </div>

      {/* 기능 설명 */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>SQL Access Advisor 소개</AlertTitle>
        <AlertDescription className="space-y-1">
          <p>전체 워크로드를 분석하여 성능 향상을 위한 스키마 객체 생성을 권장합니다:</p>
          <ul className="text-sm list-disc list-inside ml-2 mt-2 space-y-1">
            <li><strong>인덱스</strong>: B-tree, 비트맵 인덱스 생성 권장</li>
            <li><strong>머티리얼라이즈드 뷰</strong>: 복잡한 조인/집계 결과 사전 계산</li>
            <li><strong>파티셔닝</strong>: 테이블 파티셔닝으로 I/O 성능 개선</li>
          </ul>
        </AlertDescription>
      </Alert>

      {!selectedConnectionId || selectedConnectionId === 'all' ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>데이터베이스 선택 필요</AlertTitle>
          <AlertDescription>
            SQL Access Advisor를 사용하려면 특정 Oracle 데이터베이스를 선택해주세요.
          </AlertDescription>
        </Alert>
      ) : error ? (
        <Alert variant="destructive">
          <Crown className="h-4 w-4" />
          <AlertTitle>SQL Access Advisor 사용 불가</AlertTitle>
          <AlertDescription>
            <p>SQL Access Advisor는 Oracle Enterprise Edition의 Tuning Pack이 필요합니다.</p>
            {error.message && <p className="text-sm mt-2">{error.message}</p>}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {/* 새 분석 작업 생성 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                새 분석 작업 생성
              </CardTitle>
              <CardDescription>워크로드를 분석하여 액세스 구조 개선안 도출</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">작업 이름</label>
                  <Input
                    placeholder="예: ACCESS_ANALYSIS_001"
                    value={taskName}
                    onChange={(e) => setTaskName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">워크로드 유형</label>
                  <Select value={workloadType} onValueChange={setWorkloadType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CURRENT">현재 커서 캐시</SelectItem>
                      <SelectItem value="AWR">AWR 스냅샷</SelectItem>
                      <SelectItem value="STS">SQL Tuning Set</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className="w-full"
                  onClick={() => createTaskMutation.mutate()}
                  disabled={createTaskMutation.isPending || !selectedConnectionId || !taskName.trim()}
                >
                  {createTaskMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      작업 생성 중...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      분석 작업 생성 및 실행
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 작업 목록 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>분석 작업 목록</CardTitle>
                  <CardDescription>SQL Access Advisor 작업 및 권장사항</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => refetch()}>
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
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : tasks.length > 0 ? (
                <div className="space-y-3">
                  {tasks.map((task) => (
                    <div key={task.task_id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold">{task.task_name}</h3>
                          <p className="text-sm text-muted-foreground">{task.description}</p>
                        </div>
                        <Badge>{task.status}</Badge>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground">워크로드</div>
                          <div className="font-medium">{task.workload_type}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">생성일</div>
                          <div className="text-xs">
                            {format(new Date(task.created), 'yyyy-MM-dd', { locale: ko })}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground">권장사항</div>
                          <div className="font-medium">{task.recommendation_count || 0}개</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-lg font-medium">생성된 분석 작업이 없습니다.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
