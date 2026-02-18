'use client';

/**
 * SQL Tuning Advisor Page (Oracle Enterprise Edition Only)
 * SQL 튜닝 어드바이저 - 특정 SQL 성능 분석 및 튜닝 권장사항 제공
 * DBMS_SQLTUNE 패키지 기반 (Tuning Pack 라이센스 필요)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  RefreshCw,
  AlertCircle,
  Info,
  Loader2,
  Crown,
  Play,
  FileText,
  TrendingUp,
  Database,
  Zap,
  Trash2,
  Copy,
  CheckCircle2,
  BarChart3,
  GitCompare,
  TableProperties,
  Download,
  ExternalLink,
  Search,
  ArrowRight,
  Clock,
  Activity,
  Target,
  Settings,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

interface IndexRecommendation {
  INDEX_NAME: string;
  TABLE_OWNER: string;
  TABLE_NAME: string;
  COLUMN_LIST: string;
  INDEX_TYPE: string;
  CREATE_STATEMENT: string;
}

interface StatisticsAnalysis {
  findings: Array<{
    FINDING_TYPE: string;
    FINDING_MESSAGE: string;
    ADDITIONAL_INFO: string;
  }>;
  hasStaleStats: boolean;
  hasMissingStats: boolean;
}

interface TuningGuide {
  title: string;
  summary: string;
  categories: {
    sql_profile: {
      name: string;
      description: string;
      when_to_use: string;
      impact: string;
      available: boolean;
    };
    index: {
      name: string;
      description: string;
      when_to_use: string;
      impact: string;
      count: number;
    };
    statistics: {
      name: string;
      description: string;
      when_to_use: string;
      impact: string;
      hasIssues: boolean;
    };
  };
  next_steps: string[];
  tips: string[];
}

interface RecommendationsResponse {
  success: boolean;
  data: TuningRecommendation[];
  count: number;
  task_name: string;
  task_owner: string;
  task_status?: string;
  execution_start?: string;
  execution_end?: string;
  view_type: string;
  response_time_ms?: number;
  script: string;
  report: string;
  html_report: string;
  plan_comparison: {
    objects: Array<{
      PLAN_HASH_VALUE: string;
      PLAN_ID: string;
      TIMESTAMP_INFO: string;
      PARSING_SCHEMA: string;
      OTHER_INFO: string;
    }>;
    count: number;
  } | null;
  can_apply_profile: boolean;
  existing_profile: {
    NAME: string;
    STATUS: string;
    CREATED: string;
  } | null;
  statistics_analysis: StatisticsAnalysis | null;
  index_recommendations: IndexRecommendation[] | null;
  tuning_guide?: TuningGuide;
  // 에러 응답 시
  error?: string;
  guide?: string;
}

export default function SQLTuningAdvisorPage() {
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
  const queryClient = useQueryClient();
  const [sqlText, setSqlText] = useState('');
  const [sqlId, setSqlId] = useState('');
  const [taskName, setTaskName] = useState('');
  const [selectedTask, setSelectedTask] = useState<TuningTask | null>(null);
  const [recommendationsDialogOpen, setRecommendationsDialogOpen] = useState(false);
  const [deleteScriptDialogOpen, setDeleteScriptDialogOpen] = useState(false);
  const [deleteScript, setDeleteScript] = useState('');
  const [inputMode, setInputMode] = useState<'sql-id' | 'sql-text' | 'discover'>('sql-id');
  const [isLoadingSqlId, setIsLoadingSqlId] = useState(false);
  const [currentResultTask, setCurrentResultTask] = useState<TuningTask | null>(null);
  const [discoveredSqls, setDiscoveredSqls] = useState<any[]>([]);
  const [isLoadingDiscovery, setIsLoadingDiscovery] = useState(false);
  const [showProfiles, setShowProfiles] = useState(false);
  const [showPlanComparison, setShowPlanComparison] = useState(false);
  const [comparisonSqlId, setComparisonSqlId] = useState<string | null>(null);
  const { toast } = useToast();

  // Memoized query enabled state
  const isQueryEnabled = useMemo(
    () => !!selectedConnectionId && selectedConnectionId !== 'all',
    [selectedConnectionId]
  );

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
    enabled: isQueryEnabled,
    retry: false,
    staleTime: 30000, // 30초 동안 캐시 유지
  });

  const tasks: TuningTask[] = useMemo(() => tasksData?.data || [], [tasksData?.data]);

  // EXECUTING 상태인 작업이 있으면 자동 새로고침 (30초마다)
  const hasExecutingTasks = useMemo(
    () => tasks.some((task) => task.status === 'EXECUTING' || task.status === 'INITIAL'),
    [tasks]
  );

  // 현재 결과 작업이 실행 중이면 자동 새로고침
  const isCurrentTaskExecuting = useMemo(
    () => currentResultTask && (currentResultTask.status === 'EXECUTING' || currentResultTask.status === 'INITIAL'),
    [currentResultTask]
  );

  useEffect(() => {
    if (!hasExecutingTasks || !isQueryEnabled) {
      return;
    }

    const interval = setInterval(() => {
      refetchTasks().then(() => {
        // 현재 결과 작업이 완료되었는지 확인
        if (currentResultTask) {
          const updatedTask = tasks.find(t => t.task_name === currentResultTask.task_name);
          if (updatedTask && updatedTask.status === 'COMPLETED' && currentResultTask.status !== 'COMPLETED') {
            setCurrentResultTask(updatedTask);
            setSelectedTask(updatedTask);
            // 완료되면 권장사항 다이얼로그 자동 열기
            if ((updatedTask.recommendation_count || 0) > 0) {
              setRecommendationsDialogOpen(true);
            }
          }
        }
      });
    }, 30000); // 30초마다 새로고침

    return () => clearInterval(interval);
  }, [hasExecutingTasks, isQueryEnabled, refetchTasks, currentResultTask, tasks]);

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
      const recCount = data.data?.recommendation_count;
      const taskName = data.data?.task_name;
      
      toast({
        title: '튜닝 작업 생성 완료',
        description: data.message || (recCount > 0
          ? `작업 "${taskName}"이(가) 완료되었습니다. ${recCount}개의 권장사항이 발견되었습니다.`
          : `작업 "${taskName}"이(가) 완료되었습니다.`),
      });
      
      // 캐시 무효화로 즉시 새로고침
      queryClient.invalidateQueries({ queryKey: ['sql-tuning-tasks', selectedConnectionId] });
      
      // 완료된 작업이면 결과를 바로 표시
      if (data.data?.status === 'COMPLETED' && taskName) {
        // 작업 목록에서 해당 작업 찾기
        setTimeout(() => {
          refetchTasks().then(() => {
            const task = tasks.find(t => t.task_name === taskName);
            if (task) {
              setCurrentResultTask(task);
              setSelectedTask(task);
              setRecommendationsDialogOpen(true);
            }
          });
        }, 1000);
      }
      
      // 입력 필드 초기화하지 않음 (사용자가 다시 실행할 수 있도록)
    },
    onError: (error: Error) => {
      const errorMessage = error.message || '작업 생성 중 오류가 발생했습니다.';

      // ORA-13607: 이미 같은 이름의 작업이 존재함
      if (errorMessage.includes('ORA-13607') || errorMessage.includes('already exists')) {
        toast({
          title: '동일한 이름의 작업이 존재합니다',
          description: '같은 이름의 튜닝 작업이 이미 실행 중이거나 존재합니다. 다른 작업 이름을 사용하거나, 아래 "데이터 정리" 버튼으로 기존 작업을 삭제해주세요.',
          variant: 'destructive',
        });
        // 작업 목록 새로고침하여 현재 상태 표시
        setTimeout(() => refetchTasks(), 500);
      } else {
        toast({
          title: '튜닝 작업 생성 실패',
          description: errorMessage,
          variant: 'destructive',
        });
        // 타임아웃 에러인 경우 캐시 무효화하여 작업이 생성되었는지 확인
        if (errorMessage.includes('타임아웃') || errorMessage.includes('timeout')) {
          queryClient.invalidateQueries({ queryKey: ['sql-tuning-tasks', selectedConnectionId] });
        }
      }
    },
  });

  // 튜닝 작업 실행
  const executeTaskMutation = useMutation({
    mutationFn: async ({ taskName, taskOwner }: { taskName: string; taskOwner?: string }) => {
      const res = await fetch('/api/advisor/sql-tuning/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: selectedConnectionId,
          task_name: taskName,
          task_owner: taskOwner,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to execute tuning task');
      }

      return res.json();
    },
    onSuccess: (data) => {
      const recCount = data.data?.recommendation_count;
      toast({
        title: '튜닝 작업 실행 완료',
        description: data.message || (recCount > 0
          ? `권장사항 분석이 완료되었습니다. ${recCount}개의 권장사항이 발견되었습니다.`
          : '권장사항 분석이 완료되었습니다.'),
      });
      // 캐시 무효화로 즉시 새로고침
      queryClient.invalidateQueries({ queryKey: ['sql-tuning-tasks', selectedConnectionId] });
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
      // 실패한 작업이 있는 경우 경고 표시
      if (data.failedTasks && data.failedTasks.length > 0) {
        // SYS 소유 작업만 실패한 경우 SQL 스크립트 다이얼로그 표시
        const sysFailedTasks = data.failedTasks.filter((t: any) => t.owner === 'SYS');
        if (sysFailedTasks.length > 0 && sysFailedTasks.length === data.failedTasks.length) {
          // SQL 스크립트 생성
          const taskNames = sysFailedTasks.map((t: any) => t.taskName);
          const script = `-- SYS AS SYSDBA로 접속 후 실행하세요
-- sqlplus sys/password@DB as sysdba

BEGIN
${taskNames.map((name: string) => `  DBMS_SQLTUNE.DROP_TUNING_TASK('${name}');`).join('\n')}
END;
/

-- 또는 개별 실행:
${taskNames.map((name: string) => `EXEC DBMS_SQLTUNE.DROP_TUNING_TASK('${name}');`).join('\n')}`;

          setDeleteScript(script);
          setDeleteScriptDialogOpen(true);

          toast({
            title: 'SYS 소유 작업 삭제 불가',
            description: `${sysFailedTasks.length}개 작업은 SYSDBA 권한이 필요합니다. SQL 스크립트를 확인하세요.`,
            variant: 'destructive',
          });
        } else {
          toast({
            title: '작업 목록 일부 정리 완료',
            description: `${data.deletedCount}개 삭제 성공, ${data.failedTasks.length}개 삭제 실패. ${data.warning || ''}`,
            variant: 'destructive',
          });
        }
      } else if (data.deletedCount > 0) {
        toast({
          title: '작업 목록 정리 완료',
          description: data.message || '튜닝 작업 목록이 정리되었습니다.',
        });
      } else {
        toast({
          title: '삭제할 작업 없음',
          description: '삭제할 SQL Tuning Advisor 작업이 없습니다.',
        });
      }
      // 캐시 무효화로 즉시 새로고침
      queryClient.invalidateQueries({ queryKey: ['sql-tuning-tasks', selectedConnectionId] });
    },
    onError: (error: Error) => {
      // API에서 반환한 상세 에러 메시지 확인
      let description = error.message;

      if (error.message.includes('권한이 부족')) {
        description = 'ADVISOR 권한이 필요합니다. DBA로 접속하거나 권한을 부여받아주세요.';
      } else if (error.message.includes('실행 중')) {
        description = '일부 작업이 아직 실행 중입니다. 잠시 후 다시 시도해주세요.';
      }

      toast({
        title: '작업 목록 정리 실패',
        description,
        variant: 'destructive',
      });
    },
  });

  // 튜닝 권장사항 조회
  const {
    data: recommendationsData,
    isLoading: isLoadingRecommendations,
    error: recommendationsError,
  } = useQuery<RecommendationsResponse>({
    queryKey: ['sql-tuning-recommendations', selectedTask?.task_name, selectedTask?.owner, selectedConnectionId],
    queryFn: async () => {
      if (!selectedTask) return null as unknown as RecommendationsResponse;

      // task_owner 파라미터 추가 - DBA 뷰에서 특정 소유자의 작업 조회에 필요
      const params = new URLSearchParams({
        connection_id: selectedConnectionId!,
        task_name: selectedTask.task_name,
      });
      if (selectedTask.owner) {
        params.append('task_owner', selectedTask.owner);
      }
      const res = await fetch(`/api/advisor/sql-tuning/recommendations?${params.toString()}`);

      if (!res.ok) {
        const error = await res.json();
        // 202 Accepted: 작업이 아직 완료되지 않음
        if (res.status === 202) {
          throw new Error(error.error || '작업이 아직 완료되지 않았습니다.');
        }
        throw new Error(error.error || 'Failed to fetch recommendations');
      }

      return res.json();
    },
    enabled: !!selectedTask && recommendationsDialogOpen,
    retry: false,
    staleTime: 60000, // 1분 동안 캐시 유지
  });

  // SQL Profile 자동 적용
  const applyProfileMutation = useMutation({
    mutationFn: async ({ taskName, taskOwner, forceMatch }: { taskName: string; taskOwner?: string; forceMatch?: boolean }) => {
      const res = await fetch('/api/advisor/sql-tuning/apply-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: selectedConnectionId,
          task_name: taskName,
          task_owner: taskOwner,
          force_match: forceMatch || false,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to apply SQL Profile');
      }

      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'SQL Profile 적용 완료',
        description: data.message || `SQL Profile '${data.data?.profile_name}'이(가) 성공적으로 적용되었습니다.`,
      });
      // 권장사항 새로고침
      queryClient.invalidateQueries({ queryKey: ['sql-tuning-recommendations', selectedTask?.task_name, selectedTask?.owner, selectedConnectionId] });
    },
    onError: (error: Error) => {
      toast({
        title: 'SQL Profile 적용 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const recommendations: TuningRecommendation[] = useMemo(
    () => (Array.isArray(recommendationsData?.data) ? recommendationsData.data : []),
    [recommendationsData?.data]
  );

  // SQL_ID로 SQL 텍스트 자동 조회
  const lookupSqlId = useCallback(async () => {
    if (!sqlId.trim() || !selectedConnectionId || selectedConnectionId === 'all') {
      return;
    }

    setIsLoadingSqlId(true);
    try {
      const response = await fetch(`/api/monitoring/sql-text?connection_id=${selectedConnectionId}&sql_id=${sqlId.trim()}`);
      const data = await response.json();

      if (!response.ok || !data.success || !data.data?.sql_text) {
        throw new Error(data.error || 'SQL을 찾을 수 없습니다');
      }

      setSqlText(data.data.sql_text);
      setInputMode('sql-text');
      toast({
        title: 'SQL 조회 완료',
        description: `SQL_ID ${sqlId.trim()}의 SQL 텍스트를 불러왔습니다.`,
      });
    } catch (error) {
      toast({
        title: 'SQL 조회 실패',
        description: error instanceof Error ? error.message : 'SQL을 찾을 수 없습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingSqlId(false);
    }
  }, [sqlId, selectedConnectionId, toast]);

  // 성능 저하 SQL 자동 수집 (Discovery)
  const discoverSlowSqls = useCallback(async () => {
    if (!selectedConnectionId || selectedConnectionId === 'all') {
      toast({
        title: '데이터베이스 선택 필요',
        description: '데이터베이스를 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoadingDiscovery(true);
    try {
      const response = await fetch(`/api/advisor/sql-tuning/discover?connection_id=${selectedConnectionId}&limit=20&order_by=elapsed_time`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'SQL 수집에 실패했습니다');
      }

      setDiscoveredSqls(data.data || []);
      setInputMode('discover');
      toast({
        title: 'SQL 수집 완료',
        description: `${data.count}개의 성능 저하 SQL을 찾았습니다.`,
      });
    } catch (error) {
      toast({
        title: 'SQL 수집 실패',
        description: error instanceof Error ? error.message : 'SQL 수집에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingDiscovery(false);
    }
  }, [selectedConnectionId, toast]);

  const handleCreateTask = useCallback(() => {
    if (!sqlText.trim() && !sqlId.trim()) {
      toast({
        title: '입력 오류',
        description: 'SQL 텍스트 또는 SQL ID를 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    // 작업 이름 자동 생성 (입력하지 않은 경우)
    // Oracle 식별자 규칙: 30자 이하, 영문자로 시작, 영숫자와 _만 허용
    const generateTaskName = () => {
      const timestamp = Date.now().toString(36).toUpperCase(); // 36진수로 변환하여 짧게 (8자 정도)
      const sqlPart = (sqlId.trim() || 'SQL').substring(0, 10).toUpperCase(); // SQL ID 앞 10자만
      return `TUNE_${sqlPart}_${timestamp}`.substring(0, 30); // 최대 30자
    };
    const finalTaskName = taskName.trim() || generateTaskName();

    createTaskMutation.mutate({
      sqlText: sqlText.trim() || undefined,
      sqlId: sqlId.trim() || undefined,
      taskName: finalTaskName,
    });
  }, [taskName, sqlText, sqlId, toast, createTaskMutation]);

  const handleViewRecommendations = useCallback((task: TuningTask) => {
    setSelectedTask(task);
    setRecommendationsDialogOpen(true);
  }, []);

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
              <div className="space-y-1">
                <p className="text-sm font-medium">오류 메시지:</p>
                <p className="text-sm font-mono bg-muted p-2 rounded">{tasksError.message}</p>
              </div>
            )}
            <div className="text-sm space-y-1">
              <p>가능한 원인:</p>
              <ul className="list-disc list-inside ml-2 space-y-1">
                <li>Oracle Standard Edition을 사용 중일 수 있습니다 (Enterprise Edition 필요)</li>
                <li>Tuning Pack 라이센스가 없을 수 있습니다</li>
                <li>CONTROL_MANAGEMENT_PACK_ACCESS 파라미터가 올바르게 설정되지 않았을 수 있습니다</li>
                <li>데이터베이스 연결이 느려서 타임아웃이 발생했을 수 있습니다</li>
              </ul>
            </div>
            <div className="mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchTasks()}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                다시 시도
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {/* 새 튜닝 작업 생성 - sqlrpt.sql 스타일 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                SQL Tuning Advisor 실행
              </CardTitle>
              <CardDescription>
                SQL_ID 또는 SQL 문장을 입력하여 바로 튜닝 분석을 실행하세요
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'sql-id' | 'sql-text' | 'discover')} className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="sql-id">SQL ID로 실행</TabsTrigger>
                    <TabsTrigger value="sql-text">SQL 문장으로 실행</TabsTrigger>
                    <TabsTrigger value="discover">성능 저하 SQL 찾기</TabsTrigger>
                  </TabsList>

                  <TabsContent value="sql-id" className="space-y-3">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">SQL ID</label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="예: 5z9yn8pqm7xk2"
                          value={sqlId}
                          onChange={(e) => setSqlId(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && sqlId.trim()) {
                              lookupSqlId();
                            }
                          }}
                          className="font-mono"
                        />
                        <Button
                          variant="outline"
                          onClick={lookupSqlId}
                          disabled={isLoadingSqlId || !sqlId.trim() || !selectedConnectionId || selectedConnectionId === 'all'}
                        >
                          {isLoadingSqlId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <FileText className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Shared Pool에서 SQL ID로 SQL을 찾아 자동으로 SQL 텍스트를 불러옵니다
                      </p>
                    </div>
                    
                    {sqlText && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">조회된 SQL 문장</label>
                        <Textarea
                          value={sqlText}
                          onChange={(e) => setSqlText(e.target.value)}
                          rows={6}
                          className="font-mono text-sm"
                          readOnly={false}
                        />
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="sql-text" className="space-y-2">
                    <label className="text-sm font-medium">SQL 문장</label>
                    <Textarea
                      placeholder="튜닝할 SQL 문장을 입력하세요..."
                      value={sqlText}
                      onChange={(e) => setSqlText(e.target.value)}
                      rows={10}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      직접 SQL 문장을 입력하여 튜닝 분석을 실행합니다
                    </p>
                  </TabsContent>

                  <TabsContent value="discover" className="space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">성능 저하 SQL 자동 수집</label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={discoverSlowSqls}
                          disabled={isLoadingDiscovery || !selectedConnectionId || selectedConnectionId === 'all'}
                        >
                          {isLoadingDiscovery ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              수집 중...
                            </>
                          ) : (
                            <>
                              <Search className="h-4 w-4 mr-2" />
                              SQL 찾기
                            </>
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        V$SQLAREA에서 부하가 높은 상위 SQL을 자동으로 찾아 제안합니다
                      </p>
                    </div>

                    {discoveredSqls.length > 0 && (
                      <div className="space-y-2 max-h-96 overflow-y-auto border rounded-lg p-3">
                        <div className="text-sm font-medium mb-2">발견된 SQL ({discoveredSqls.length}개)</div>
                        {discoveredSqls.map((sql, index) => (
                          <div
                            key={sql.sql_id || index}
                            className="border rounded p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => {
                              setSqlId(sql.sql_id);
                              setSqlText(sql.sql_text_preview);
                              setInputMode('sql-text');
                            }}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Badge variant={sql.priority === 'CRITICAL' ? 'destructive' : sql.priority === 'WARNING' ? 'default' : 'outline'}>
                                  {sql.priority}
                                </Badge>
                                <code className="text-xs font-mono">{sql.sql_id}</code>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSqlId(sql.sql_id);
                                  setSqlText(sql.sql_text_preview);
                                  setInputMode('sql-text');
                                }}
                              >
                                <ArrowRight className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="text-xs font-mono text-muted-foreground mb-2 line-clamp-2">
                              {sql.sql_text_preview}
                            </div>
                            <div className="grid grid-cols-4 gap-2 text-xs">
                              <div>
                                <span className="text-muted-foreground">실행:</span>
                                <span className="ml-1 font-medium">{sql.executions.toLocaleString()}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">평균 시간:</span>
                                <span className="ml-1 font-medium">{sql.avg_elapsed_time_ms.toLocaleString()}ms</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Buffer Gets:</span>
                                <span className="ml-1 font-medium">{sql.avg_buffer_gets.toLocaleString()}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Schema:</span>
                                <span className="ml-1 font-medium">{sql.schema_name}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>

                {/* 작업 이름 (선택사항) */}
                <div className="border-t pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <label className="text-sm font-medium">작업 이름 (선택사항)</label>
                    <Badge variant="outline" className="text-xs">자동 생성됨</Badge>
                  </div>
                  <Input
                    placeholder="입력하지 않으면 자동으로 생성됩니다"
                    value={taskName}
                    onChange={(e) => setTaskName(e.target.value)}
                  />
                </div>

                <Button
                  onClick={handleCreateTask}
                  disabled={
                    createTaskMutation.isPending ||
                    !selectedConnectionId ||
                    selectedConnectionId === 'all' ||
                    (!sqlText.trim() && !sqlId.trim())
                  }
                  className="w-full"
                  size="lg"
                >
                  {createTaskMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      SQL Tuning Advisor 실행 중...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      SQL Tuning Advisor 실행
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 현재 실행 결과 표시 */}
          {currentResultTask && (
            <Card className="border-primary">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      최근 실행 결과
                    </CardTitle>
                    <CardDescription>
                      {currentResultTask.task_name} - {currentResultTask.status === 'COMPLETED' ? '완료' : '실행 중'}
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCurrentResultTask(null);
                      setRecommendationsDialogOpen(false);
                    }}
                  >
                    닫기
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {currentResultTask.status === 'COMPLETED' ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <Badge variant="default" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        완료
                      </Badge>
                      {(currentResultTask.recommendation_count || 0) > 0 && (
                        <span className="text-sm text-muted-foreground">
                          {currentResultTask.recommendation_count}개의 권장사항 발견
                        </span>
                      )}
                    </div>
                    <Button
                      onClick={() => {
                        setSelectedTask(currentResultTask);
                        setRecommendationsDialogOpen(true);
                      }}
                      className="w-full"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      권장사항 확인하기
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">작업이 실행 중입니다. 완료되면 자동으로 결과가 표시됩니다.</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetchTasks()}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      상태 새로고침
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* SQL Profile 관리 버튼 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    SQL Profile 관리
                  </CardTitle>
                  <CardDescription>
                    현재 데이터베이스에 적용된 SQL Profile 목록 및 관리
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowProfiles(true)}
                  disabled={!selectedConnectionId || selectedConnectionId === 'all'}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Profile 관리
                </Button>
              </div>
            </CardHeader>
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
                    onClick={() => {
                      if (confirm('모든 SQL Tuning Advisor 작업을 삭제하시겠습니까?')) {
                        clearTasksMutation.mutate();
                      }
                    }}
                    disabled={clearTasksMutation.isPending || !selectedConnectionId || selectedConnectionId === 'all'}
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
                    <Skeleton key={`skeleton-sql-tuning-task-${i}`} className="h-24 w-full" />
                  ))}
                </div>
              ) : tasks.length > 0 ? (
                <div className="space-y-3">
                  {tasks.map((task) => {
                    const isCurrentTask = currentResultTask?.task_name === task.task_name;
                    return (
                    <div
                      key={task.task_id}
                      className={`border rounded-lg p-4 hover:shadow-md transition-all ${
                        isCurrentTask ? 'border-primary bg-primary/5' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{task.task_name}</h3>
                            <Badge
                              variant={
                                task.status === 'COMPLETED'
                                  ? 'default'
                                  : task.status === 'EXECUTING' || task.status === 'INITIAL'
                                    ? 'secondary'
                                    : 'outline'
                              }
                            >
                              {task.status === 'COMPLETED'
                                ? '완료'
                                : task.status === 'EXECUTING' || task.status === 'INITIAL'
                                  ? '실행 중'
                                  : task.status}
                            </Badge>
                            {(task.status === 'EXECUTING' || task.status === 'INITIAL') && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span>실행 중...</span>
                              </div>
                            )}
                          </div>
                          {task.description && (
                            <p className="text-sm text-muted-foreground">{task.description}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => executeTaskMutation.mutate({ taskName: task.task_name, taskOwner: task.owner })}
                            disabled={executeTaskMutation.isPending || task.status === 'EXECUTING' || task.status === 'INITIAL'}
                          >
                            {executeTaskMutation.isPending ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                실행 중...
                              </>
                            ) : (
                              <>
                                <Play className="h-4 w-4 mr-1" />
                                실행
                              </>
                            )}
                          </Button>
                          <Button
                            variant={task.status === 'COMPLETED' && (task.recommendation_count || 0) > 0 ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleViewRecommendations(task)}
                            disabled={task.status !== 'COMPLETED'}
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            {task.status === 'COMPLETED'
                              ? (task.recommendation_count || 0) > 0
                                ? `권장사항 (${task.recommendation_count})`
                                : '결과 확인'
                              : '분석 중...'}
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
                        <div>
                          <div className="text-xs text-muted-foreground">권장사항</div>
                          <div className="font-medium">
                            {task.status === 'COMPLETED' ? (
                              task.recommendation_count || 0
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                            {task.status === 'COMPLETED' && '개'}
                          </div>
                        </div>
                      </div>

                      {task.sql_text && (
                        <div className="mt-3 p-2 bg-muted rounded text-xs font-mono truncate">
                          {task.sql_text}
                        </div>
                      )}
                      {(task.status === 'EXECUTING' || task.status === 'INITIAL') && (
                        <Alert className="mt-3">
                          <Info className="h-4 w-4" />
                          <AlertDescription className="text-xs">
                            작업이 실행 중입니다. 완료까지 몇 분이 걸릴 수 있습니다. 잠시 후 새로고침하여 상태를 확인해주세요.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                    );
                  })}
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

          <Tabs defaultValue="findings" className="w-full">
            <div className="px-6 mb-4">
              <TabsList className="grid w-full grid-cols-7">
                <TabsTrigger value="findings">권장사항</TabsTrigger>
                <TabsTrigger value="profile">SQL Profile</TabsTrigger>
                <TabsTrigger value="indexes">인덱스</TabsTrigger>
                <TabsTrigger value="comparison">Before/After</TabsTrigger>
                <TabsTrigger value="script">스크립트</TabsTrigger>
                <TabsTrigger value="report">리포트</TabsTrigger>
                <TabsTrigger value="html">HTML</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="findings" className="px-6 pb-6 outline-none">
              {isLoadingRecommendations ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={`skeleton-sql-tuning-rec-${i}`} className="h-32 w-full" />
                  ))}
                </div>
              ) : recommendationsError ? (
                <div className="space-y-6">
                  <div className="text-center py-8">
                    <AlertCircle className="h-12 w-12 mx-auto mb-3 text-orange-500 opacity-70" />
                    <p className="font-medium text-foreground">권장사항을 불러오는 중 문제가 발생했습니다</p>
                    <p className="text-sm text-muted-foreground mt-2">{recommendationsError.message}</p>
                  </div>

                  {/* 에러 유형별 가이드 */}
                  {recommendationsError.message.includes('아직 완료되지 않았습니다') ||
                   recommendationsError.message.includes('작업이 아직') ||
                   recommendationsError.message.includes('실행 중') ? (
                    <Card className="max-w-lg mx-auto border-blue-200 dark:border-blue-800">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Clock className="h-4 w-4 text-blue-500" />
                          작업 진행 중
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          SQL Tuning Advisor 작업이 아직 실행 중입니다. 복잡한 SQL의 경우 5~10분이 소요될 수 있습니다.
                        </p>
                        <div className="bg-muted/50 p-3 rounded-lg text-xs space-y-2">
                          <p className="font-medium">진행 상황 확인 방법:</p>
                          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                            <li>30초마다 자동으로 상태가 새로고침됩니다</li>
                            <li>작업 목록에서 상태가 COMPLETED로 변경되면 권장사항을 확인할 수 있습니다</li>
                            <li>오래 걸리는 경우 더 짧은 SQL로 테스트해보세요</li>
                          </ul>
                        </div>
                        <div className="flex gap-2 justify-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              queryClient.invalidateQueries({ queryKey: ['sql-tuning-tasks', selectedConnectionId] });
                              queryClient.invalidateQueries({ queryKey: ['sql-tuning-recommendations', selectedTask?.task_name, selectedTask?.owner, selectedConnectionId] });
                            }}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            상태 새로고침
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ) : recommendationsError.message.includes('타임아웃') || recommendationsError.message.includes('timeout') ? (
                    <Card className="max-w-lg mx-auto border-orange-200 dark:border-orange-800">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-orange-500" />
                          타임아웃 발생
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          권장사항 조회 중 타임아웃이 발생했습니다. 작업이 아직 실행 중이거나 네트워크 상태가 불안정할 수 있습니다.
                        </p>
                        <div className="bg-muted/50 p-3 rounded-lg text-xs space-y-2">
                          <p className="font-medium">해결 방법:</p>
                          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                            <li>잠시 후 다시 시도해주세요</li>
                            <li>작업 목록에서 상태를 확인해주세요</li>
                            <li>문제가 지속되면 작업을 재실행해보세요</li>
                          </ul>
                        </div>
                        <div className="flex gap-2 justify-center">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              queryClient.invalidateQueries({ queryKey: ['sql-tuning-recommendations', selectedTask?.task_name, selectedTask?.owner, selectedConnectionId] });
                            }}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            다시 시도
                          </Button>
                          {selectedTask && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => {
                                setRecommendationsDialogOpen(false);
                                executeTaskMutation.mutate({ taskName: selectedTask.task_name, taskOwner: selectedTask.owner });
                              }}
                              disabled={executeTaskMutation.isPending}
                            >
                              {executeTaskMutation.isPending ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  재실행 중...
                                </>
                              ) : (
                                <>
                                  <Play className="h-4 w-4 mr-2" />
                                  작업 재실행
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ) : selectedTask && (
                    <Card className="max-w-lg mx-auto">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Settings className="h-4 w-4" />
                          문제 해결
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="bg-muted/50 p-3 rounded-lg text-xs space-y-2">
                          <p className="font-medium">가능한 원인:</p>
                          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                            <li>SQL 구문에 오류가 있을 수 있습니다</li>
                            <li>데이터베이스 연결이 끊어졌을 수 있습니다</li>
                            <li>권한이 부족할 수 있습니다</li>
                          </ul>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            setRecommendationsDialogOpen(false);
                            executeTaskMutation.mutate({ taskName: selectedTask.task_name, taskOwner: selectedTask.owner });
                          }}
                          disabled={executeTaskMutation.isPending}
                        >
                          {executeTaskMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              재실행 중...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              작업 재실행
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : recommendations.length > 0 ? (
                <div className="space-y-4">
                  {/* 요약 정보 및 빠른 액션 */}
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-green-500" />
                        <span className="font-medium">총 {recommendations.length}개의 권장사항</span>
                      </div>
                      {recommendationsData?.view_type && (
                        <Badge variant="outline">
                          {recommendationsData.view_type === 'DBA' ? 'DBA 뷰' : 'USER 뷰'}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {/* SQL Profile 적용 버튼 */}
                      {recommendationsData?.can_apply_profile && !recommendationsData?.existing_profile && (
                        <Button
                          size="sm"
                          onClick={() => {
                            if (selectedTask) {
                              applyProfileMutation.mutate({
                                taskName: selectedTask.task_name,
                                taskOwner: selectedTask.owner,
                              });
                            }
                          }}
                          disabled={applyProfileMutation.isPending}
                        >
                          {applyProfileMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              적용 중...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              SQL Profile 적용
                            </>
                          )}
                        </Button>
                      )}
                      {recommendationsData?.existing_profile && (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Profile 적용됨: {recommendationsData.existing_profile.NAME}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* 통계 분석 경고 */}
                  {recommendationsData?.statistics_analysis && (
                    <Alert variant={recommendationsData.statistics_analysis.hasMissingStats ? 'destructive' : 'default'}>
                      <BarChart3 className="h-4 w-4" />
                      <AlertTitle>통계 분석 결과</AlertTitle>
                      <AlertDescription>
                        {recommendationsData.statistics_analysis.hasMissingStats && (
                          <p className="text-sm">⚠️ 누락된 통계가 있습니다. 통계 수집이 필요합니다.</p>
                        )}
                        {recommendationsData.statistics_analysis.hasStaleStats && (
                          <p className="text-sm">⚠️ 오래된 통계가 있습니다. 통계 갱신이 권장됩니다.</p>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* 모든 권장사항이 ORA 에러인지 확인 */}
                  {(() => {
                    const allErrors = recommendations.every(
                      (rec) => rec.finding?.includes('ORA-') || rec.message?.includes('ORA-')
                    );
                    const hasTimeoutError = recommendations.some(
                      (rec) => rec.finding?.includes('ORA-01013') || rec.message?.includes('ORA-01013')
                    );

                    if (allErrors && hasTimeoutError) {
                      return (
                        <Alert variant="destructive" className="mb-4">
                          <AlertCircle className="h-4 w-4" />
                          <AlertTitle>분석 작업 실패</AlertTitle>
                          <AlertDescription className="space-y-3">
                            <p>
                              SQL Tuning Advisor 분석이 타임아웃되었거나 취소되었습니다.
                              네트워크 상태를 확인하고 작업을 다시 실행해 주세요.
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (selectedTask) {
                                  setRecommendationsDialogOpen(false);
                                  executeTaskMutation.mutate({ taskName: selectedTask.task_name, taskOwner: selectedTask.owner });
                                }
                              }}
                              disabled={executeTaskMutation.isPending || !selectedTask}
                            >
                              {executeTaskMutation.isPending ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  재실행 중...
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="h-4 w-4 mr-2" />
                                  작업 재실행
                                </>
                              )}
                            </Button>
                          </AlertDescription>
                        </Alert>
                      );
                    }
                    return null;
                  })()}

                  {recommendations.map((rec, index) => {
                    // ORA 에러 감지 (ORA-01013: 사용자 취소, 기타 ORA 에러)
                    const isOracleError = rec.finding?.includes('ORA-') || rec.message?.includes('ORA-');
                    const oraErrorMatch = (rec.finding || rec.message || '').match(/ORA-(\d+)/);
                    const oraErrorCode = oraErrorMatch ? oraErrorMatch[1] : null;

                    // 에러 코드별 사용자 친화적 메시지
                    const getOracleErrorExplanation = (code: string | null) => {
                      switch (code) {
                        case '01013':
                          return '분석 작업이 타임아웃되었거나 취소되었습니다. 작업을 다시 실행해 보세요.';
                        case '00942':
                          return '참조된 테이블이나 뷰가 존재하지 않습니다.';
                        case '00904':
                          return '잘못된 컬럼명이 SQL에 사용되었습니다.';
                        case '01017':
                          return '로그인 권한 문제가 발생했습니다.';
                        default:
                          return 'Oracle에서 분석 중 오류가 발생했습니다. 작업을 다시 실행하거나 SQL을 확인해 주세요.';
                      }
                    };

                    return (
                      <div
                        key={`tuning-rec-${rec.finding || ''}-${rec.benefit_type || ''}-${index}`}
                        className={`border rounded-lg p-4 space-y-3 ${isOracleError ? 'border-orange-300 bg-orange-50 dark:bg-orange-950/20' : ''}`}
                      >
                        <div className="flex items-start justify-between">
                          <h3 className="font-semibold flex items-center gap-2">
                            {isOracleError ? (
                              <AlertCircle className="h-4 w-4 text-orange-500" />
                            ) : (
                              <Zap className="h-4 w-4 text-yellow-500" />
                            )}
                            {isOracleError ? 'Oracle 오류 발생' : rec.finding}
                          </h3>
                          <Badge variant={isOracleError ? 'destructive' : 'outline'}>
                            {isOracleError ? `ORA-${oraErrorCode || 'ERROR'}` : rec.benefit_type}
                          </Badge>
                        </div>

                        {isOracleError ? (
                          <div className="space-y-3">
                            <p className="text-sm text-orange-700 dark:text-orange-300">
                              {getOracleErrorExplanation(oraErrorCode)}
                            </p>
                            <p className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded">
                              {rec.finding || rec.message}
                            </p>
                            {/* ORA-01013 에러인 경우 재실행 버튼 표시 */}
                            {oraErrorCode === '01013' && selectedTask && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setRecommendationsDialogOpen(false);
                                  executeTaskMutation.mutate({ taskName: selectedTask.task_name, taskOwner: selectedTask.owner });
                                }}
                                disabled={executeTaskMutation.isPending}
                                className="mt-2"
                              >
                                {executeTaskMutation.isPending ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    재실행 중...
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                    작업 재실행
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm">{rec.message}</p>
                        )}

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
                                <div key={`action-${rec.finding || ''}-${action.substring(0, 20)}-${idx}`} className="bg-muted p-2 rounded text-xs font-mono">
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
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-6">
                  {/* 권장사항이 없을 때 - 튜닝 가이드 표시 */}
                  <div className="text-center py-8">
                    <div className="flex flex-col items-center space-y-4">
                      <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                        <Sparkles className="h-8 w-8 text-green-500" />
                      </div>
                      <div>
                        <p className="text-lg font-medium text-foreground">
                          {recommendationsData?.tuning_guide?.summary || '권장사항이 없습니다'}
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                          SQL Tuning Advisor가 이 SQL에 대해 추가 개선사항을 찾지 못했습니다.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 튜닝 가이드 */}
                  {recommendationsData?.tuning_guide && (
                    <div className="space-y-4">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Info className="h-4 w-4 text-blue-500" />
                        {recommendationsData.tuning_guide.title}
                      </h4>

                      {/* 다음 단계 */}
                      {recommendationsData.tuning_guide.next_steps.length > 0 && (
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <ArrowRight className="h-4 w-4" />
                              다음 단계
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ul className="space-y-2">
                              {recommendationsData.tuning_guide.next_steps.map((step, idx) => (
                                <li key={`next-step-${idx}`} className="flex items-start gap-2 text-sm">
                                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                                  <span>{step}</span>
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>
                      )}

                      {/* 튜닝 카테고리 설명 */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className={recommendationsData.tuning_guide.categories.sql_profile.available ? 'border-green-200 dark:border-green-800' : ''}>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Database className="h-4 w-4" />
                              {recommendationsData.tuning_guide.categories.sql_profile.name}
                              {recommendationsData.tuning_guide.categories.sql_profile.available && (
                                <Badge variant="default" className="text-xs">적용 가능</Badge>
                              )}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="text-xs space-y-2">
                            <p className="text-muted-foreground">{recommendationsData.tuning_guide.categories.sql_profile.description}</p>
                            <p><span className="font-medium">사용 시점:</span> {recommendationsData.tuning_guide.categories.sql_profile.when_to_use}</p>
                            <Badge variant="outline">{recommendationsData.tuning_guide.categories.sql_profile.impact}</Badge>
                          </CardContent>
                        </Card>

                        <Card className={(recommendationsData.tuning_guide.categories.index.count > 0) ? 'border-yellow-200 dark:border-yellow-800' : ''}>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <TableProperties className="h-4 w-4" />
                              {recommendationsData.tuning_guide.categories.index.name}
                              {recommendationsData.tuning_guide.categories.index.count > 0 && (
                                <Badge variant="secondary" className="text-xs">{recommendationsData.tuning_guide.categories.index.count}개</Badge>
                              )}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="text-xs space-y-2">
                            <p className="text-muted-foreground">{recommendationsData.tuning_guide.categories.index.description}</p>
                            <p><span className="font-medium">사용 시점:</span> {recommendationsData.tuning_guide.categories.index.when_to_use}</p>
                            <Badge variant="outline">{recommendationsData.tuning_guide.categories.index.impact}</Badge>
                          </CardContent>
                        </Card>

                        <Card className={recommendationsData.tuning_guide.categories.statistics.hasIssues ? 'border-orange-200 dark:border-orange-800' : ''}>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <BarChart3 className="h-4 w-4" />
                              {recommendationsData.tuning_guide.categories.statistics.name}
                              {recommendationsData.tuning_guide.categories.statistics.hasIssues && (
                                <Badge variant="destructive" className="text-xs">문제 있음</Badge>
                              )}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="text-xs space-y-2">
                            <p className="text-muted-foreground">{recommendationsData.tuning_guide.categories.statistics.description}</p>
                            <p><span className="font-medium">사용 시점:</span> {recommendationsData.tuning_guide.categories.statistics.when_to_use}</p>
                            <Badge variant="outline">{recommendationsData.tuning_guide.categories.statistics.impact}</Badge>
                          </CardContent>
                        </Card>
                      </div>

                      {/* 팁 */}
                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertTitle>SQL 튜닝 팁</AlertTitle>
                        <AlertDescription>
                          <ul className="list-disc list-inside space-y-1 mt-2 text-xs">
                            {recommendationsData.tuning_guide.tips.map((tip, idx) => (
                              <li key={`tip-${idx}`}>{tip}</li>
                            ))}
                          </ul>
                        </AlertDescription>
                      </Alert>
                    </div>
                  )}

                  {/* 튜닝 가이드가 없을 때 기본 안내 */}
                  {!recommendationsData?.tuning_guide && (
                    <Alert className="max-w-md mx-auto">
                      <Info className="h-4 w-4" />
                      <AlertTitle>참고</AlertTitle>
                      <AlertDescription className="text-xs">
                        <ul className="list-disc list-inside space-y-1 mt-1">
                          <li>통계 정보가 최신인지 확인해보세요</li>
                          <li>다른 SQL ID로 분석을 시도해보세요</li>
                          <li>작업 상태가 COMPLETED인지 확인해보세요</li>
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="script" className="px-6 pb-6 outline-none">
              {isLoadingRecommendations ? (
                <Skeleton className="h-96 w-full" />
              ) : recommendationsData?.script ? (
                <div className="space-y-4">
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>적용 안내</AlertTitle>
                    <AlertDescription>
                      아래 스크립트는 SQL Tuning Advisor가 제안한 개선사항을 적용하는 PL/SQL 코드입니다.
                      DBA 검토 후 적용하세요.
                    </AlertDescription>
                  </Alert>
                  <pre className="p-4 rounded-lg bg-muted border font-mono text-sm overflow-x-auto whitespace-pre-wrap">
                    {recommendationsData.script}
                  </pre>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p>생성된 스크립트가 없습니다.</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="report" className="px-6 pb-6 outline-none">
              {isLoadingRecommendations ? (
                <Skeleton className="h-96 w-full" />
              ) : recommendationsData?.report ? (
                <div className="space-y-4">
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertTitle>Oracle SQL Tuning Advisor 전체 리포트</AlertTitle>
                    <AlertDescription>
                      Oracle DBMS_SQLTUNE 패키지가 생성한 상세 분석 리포트입니다.
                      실행 계획 비교, 통계 정보, 상세한 튜닝 근거가 포함되어 있습니다.
                    </AlertDescription>
                  </Alert>
                  <pre className="p-4 rounded-lg bg-muted border font-mono text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed">
                    {recommendationsData.report}
                  </pre>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p>생성된 리포트가 없습니다.</p>
                </div>
              )}
            </TabsContent>

            {/* SQL Profile 탭 */}
            <TabsContent value="profile" className="px-6 pb-6 outline-none">
              {isLoadingRecommendations ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <div className="space-y-4">
                  <Alert>
                    <Database className="h-4 w-4" />
                    <AlertTitle>SQL Profile 관리</AlertTitle>
                    <AlertDescription>
                      SQL Profile은 옵티마이저에게 더 나은 실행 계획을 선택하도록 추가 정보를 제공합니다.
                      SQL 문장을 수정하지 않고도 성능을 개선할 수 있습니다.
                    </AlertDescription>
                  </Alert>

                  {recommendationsData?.existing_profile ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                          적용된 SQL Profile
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Profile 이름:</span>
                            <p className="font-mono font-medium">{recommendationsData.existing_profile.NAME}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">상태:</span>
                            <p>
                              <Badge variant={recommendationsData.existing_profile.STATUS === 'ENABLED' ? 'default' : 'secondary'}>
                                {recommendationsData.existing_profile.STATUS}
                              </Badge>
                            </p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">생성일:</span>
                            <p>{recommendationsData.existing_profile.CREATED}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ) : recommendationsData?.can_apply_profile ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">SQL Profile 적용 가능</CardTitle>
                        <CardDescription>
                          SQL Tuning Advisor가 이 SQL에 대해 SQL Profile 생성을 권장합니다.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center gap-4">
                          <Button
                            onClick={() => {
                              if (selectedTask) {
                                applyProfileMutation.mutate({
                                  taskName: selectedTask.task_name,
                                  taskOwner: selectedTask.owner,
                                  forceMatch: false,
                                });
                              }
                            }}
                            disabled={applyProfileMutation.isPending}
                          >
                            {applyProfileMutation.isPending ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                적용 중...
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                SQL Profile 적용
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              if (selectedTask) {
                                applyProfileMutation.mutate({
                                  taskName: selectedTask.task_name,
                                  taskOwner: selectedTask.owner,
                                  forceMatch: true,
                                });
                              }
                            }}
                            disabled={applyProfileMutation.isPending}
                          >
                            <GitCompare className="h-4 w-4 mr-2" />
                            Force Match 적용
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          * Force Match: 리터럴 값이 다른 유사 SQL에도 Profile 적용
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>SQL Profile 권장사항이 없습니다.</p>
                      <p className="text-sm mt-2">SQL이 이미 최적화되어 있거나 Profile이 필요하지 않습니다.</p>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* 인덱스 권장사항 탭 */}
            <TabsContent value="indexes" className="px-6 pb-6 outline-none">
              {isLoadingRecommendations ? (
                <Skeleton className="h-64 w-full" />
              ) : recommendationsData?.index_recommendations && recommendationsData.index_recommendations.length > 0 ? (
                <div className="space-y-4">
                  <Alert>
                    <TableProperties className="h-4 w-4" />
                    <AlertTitle>인덱스 권장사항</AlertTitle>
                    <AlertDescription>
                      SQL Tuning Advisor가 성능 향상을 위해 권장하는 인덱스입니다.
                      DBA와 검토 후 적용하세요.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-3">
                    {recommendationsData.index_recommendations.map((idx, i) => (
                      <Card key={`idx-${idx.INDEX_NAME || i}`}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <TableProperties className="h-4 w-4" />
                            {idx.INDEX_NAME || `권장 인덱스 ${i + 1}`}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                            <div>
                              <span className="text-muted-foreground">테이블:</span>
                              <p className="font-mono">{idx.TABLE_OWNER}.{idx.TABLE_NAME}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">컬럼:</span>
                              <p className="font-mono">{idx.COLUMN_LIST}</p>
                            </div>
                            {idx.INDEX_TYPE && (
                              <div>
                                <span className="text-muted-foreground">인덱스 타입:</span>
                                <p>{idx.INDEX_TYPE}</p>
                              </div>
                            )}
                          </div>
                          {idx.CREATE_STATEMENT && (
                            <div className="relative">
                              <pre className="p-3 rounded bg-muted text-xs font-mono overflow-x-auto">
                                {idx.CREATE_STATEMENT}
                              </pre>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="absolute top-1 right-1"
                                onClick={() => {
                                  navigator.clipboard.writeText(idx.CREATE_STATEMENT);
                                  toast({ title: '복사됨', description: 'SQL이 클립보드에 복사되었습니다.' });
                                }}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <TableProperties className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>인덱스 권장사항이 없습니다.</p>
                  <p className="text-sm mt-2">기존 인덱스가 적절하거나 인덱스 추가가 필요하지 않습니다.</p>
                </div>
              )}
            </TabsContent>

            {/* Before & After 비교 탭 */}
            <TabsContent value="comparison" className="px-6 pb-6 outline-none">
              {isLoadingRecommendations ? (
                <Skeleton className="h-96 w-full" />
              ) : selectedTask ? (
                <PlanComparisonTab
                  connectionId={selectedConnectionId!}
                  sqlId={selectedTask.sql_id}
                  sqlText={selectedTask.sql_text}
                  profileName={recommendationsData?.existing_profile?.NAME}
                />
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <GitCompare className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>작업을 선택해주세요.</p>
                </div>
              )}
            </TabsContent>

            {/* HTML 리포트 탭 */}
            <TabsContent value="html" className="px-6 pb-6 outline-none">
              {isLoadingRecommendations ? (
                <Skeleton className="h-96 w-full" />
              ) : recommendationsData?.html_report ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Alert className="flex-1">
                      <ExternalLink className="h-4 w-4" />
                      <AlertTitle>Oracle HTML 리포트</AlertTitle>
                      <AlertDescription>
                        Oracle sqltrpt.sql 스타일의 상세 HTML 리포트입니다.
                      </AlertDescription>
                    </Alert>
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-4"
                      onClick={() => {
                        const blob = new Blob([recommendationsData.html_report], { type: 'text/html' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `sql_tuning_report_${selectedTask?.task_name || 'report'}.html`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      HTML 다운로드
                    </Button>
                  </div>
                  <div className="border rounded-lg overflow-hidden bg-white">
                    <iframe
                      srcDoc={recommendationsData.html_report}
                      className="w-full h-[600px]"
                      title="SQL Tuning Report"
                      sandbox="allow-same-origin"
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <ExternalLink className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>HTML 리포트가 없습니다.</p>
                  <p className="text-sm mt-2">Oracle에서 HTML 형식 리포트 생성을 지원하지 않을 수 있습니다.</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* SQL 삭제 스크립트 다이얼로그 */}
      <Dialog open={deleteScriptDialogOpen} onOpenChange={setDeleteScriptDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              SYS 소유 작업 삭제 SQL 스크립트
            </DialogTitle>
            <DialogDescription>
              아래 SQL을 복사하여 SQL*Plus에서 SYS AS SYSDBA로 접속 후 실행하세요.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative">
              <pre className="p-4 rounded-lg bg-muted border font-mono text-sm overflow-x-auto whitespace-pre-wrap max-h-80">
                {deleteScript}
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => {
                  navigator.clipboard.writeText(deleteScript);
                  toast({
                    title: '복사 완료',
                    description: 'SQL 스크립트가 클립보드에 복사되었습니다.',
                  });
                }}
              >
                <Copy className="h-4 w-4 mr-1" />
                복사
              </Button>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>실행 방법</AlertTitle>
              <AlertDescription className="text-xs space-y-1">
                <p>1. 터미널에서 <code className="bg-muted px-1 rounded">sqlplus sys/비밀번호@DB as sysdba</code> 로 접속</p>
                <p>2. 위 SQL 스크립트를 붙여넣기하고 실행</p>
                <p>3. 실행 완료 후 이 페이지에서 새로고침</p>
              </AlertDescription>
            </Alert>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteScriptDialogOpen(false)}>
              닫기
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* SQL Profile 관리 대시보드 */}
      <Dialog open={showProfiles} onOpenChange={setShowProfiles}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              SQL Profile 관리 대시보드
            </DialogTitle>
            <DialogDescription>
              현재 데이터베이스에 적용된 SQL Profile 목록 및 관리
            </DialogDescription>
          </DialogHeader>
          <SQLProfileDashboard connectionId={selectedConnectionId!} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Before & After 실행 계획 비교 컴포넌트
function PlanComparisonTab({
  connectionId,
  sqlId,
  sqlText,
  profileName,
}: {
  connectionId: string;
  sqlId?: string;
  sqlText?: string;
  profileName?: string;
}) {
  const [comparisonData, setComparisonData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const loadComparison = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        connection_id: connectionId,
      });
      if (sqlId) params.append('sql_id', sqlId);
      if (sqlText) params.append('sql_text', sqlText);
      if (profileName) params.append('profile_name', profileName);

      const response = await fetch(`/api/advisor/sql-tuning/plan-comparison?${params.toString()}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || '실행 계획 비교에 실패했습니다');
      }

      setComparisonData(data.data);
    } catch (error) {
      toast({
        title: '비교 실패',
        description: error instanceof Error ? error.message : '실행 계획 비교에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [connectionId, sqlId, sqlText, profileName, toast]);

  useEffect(() => {
    if (connectionId && (sqlId || sqlText)) {
      loadComparison();
    }
  }, [connectionId, sqlId, sqlText, profileName, loadComparison]);


  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!comparisonData) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <GitCompare className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>실행 계획 비교 데이터가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Before & After 실행 계획 비교</AlertTitle>
        <AlertDescription>
          SQL Profile 적용 전후의 실행 계획을 비교하여 성능 개선 효과를 확인합니다.
        </AlertDescription>
      </Alert>

      {/* 개선 요약 */}
      {comparisonData.improvement && (
        <div className="grid grid-cols-3 gap-4">
          {comparisonData.improvement.cost_reduction !== null && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Cost 개선</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {comparisonData.improvement.cost_reduction > 0 ? '+' : ''}
                  {comparisonData.improvement.cost_reduction.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {comparisonData.before.cost} → {comparisonData.after.cost}
                </div>
              </CardContent>
            </Card>
          )}
          {comparisonData.improvement.cardinality_reduction !== null && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Cardinality 개선</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {comparisonData.improvement.cardinality_reduction > 0 ? '+' : ''}
                  {comparisonData.improvement.cardinality_reduction.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {comparisonData.before.cardinality} → {comparisonData.after.cardinality}
                </div>
              </CardContent>
            </Card>
          )}
          {comparisonData.improvement.bytes_reduction !== null && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Bytes 개선</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {comparisonData.improvement.bytes_reduction > 0 ? '+' : ''}
                  {comparisonData.improvement.bytes_reduction.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {comparisonData.before.bytes} → {comparisonData.after.bytes}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* 실행 계획 비교 */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Before (프로파일 적용 전)</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="p-3 rounded bg-muted text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
              {comparisonData.before.plan_text || '실행 계획을 가져올 수 없습니다.'}
            </pre>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">After (프로파일 적용 후)</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="p-3 rounded bg-muted text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
              {comparisonData.after.plan_text || '실행 계획을 가져올 수 없습니다.'}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// SQL Profile 관리 대시보드 컴포넌트
function SQLProfileDashboard({ connectionId }: { connectionId: string }) {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const loadProfiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/advisor/sql-tuning/profiles?connection_id=${connectionId}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'SQL Profile 목록 조회에 실패했습니다');
      }

      setProfiles(data.data || []);
    } catch (error) {
      toast({
        title: '조회 실패',
        description: error instanceof Error ? error.message : 'SQL Profile 목록 조회에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [connectionId, toast]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);


  const handleDeleteProfile = async (profileName: string) => {
    if (!confirm(`SQL Profile '${profileName}'을(를) 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const response = await fetch('/api/advisor/sql-tuning/profiles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: connectionId,
          profile_name: profileName,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'SQL Profile 삭제에 실패했습니다');
      }

      toast({
        title: '삭제 완료',
        description: data.message,
      });

      loadProfiles();
    } catch (error) {
      toast({
        title: '삭제 실패',
        description: error instanceof Error ? error.message : 'SQL Profile 삭제에 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={`skeleton-profile-${i}`} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>적용된 SQL Profile이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {profiles.map((profile) => (
        <Card key={profile.name}>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <CardTitle className="text-base flex items-center gap-2">
                  {profile.name}
                  <Badge variant={profile.status === 'ENABLED' ? 'default' : 'secondary'}>
                    {profile.status}
                  </Badge>
                  {profile.force_matching && (
                    <Badge variant="outline">Force Match</Badge>
                  )}
                </CardTitle>
                <CardDescription className="font-mono text-xs line-clamp-2">
                  {profile.sql_text}
                </CardDescription>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDeleteProfile(profile.name)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">생성일:</span>
                <p className="font-medium">{format(new Date(profile.created), 'yyyy-MM-dd HH:mm', { locale: ko })}</p>
              </div>
              <div>
                <span className="text-muted-foreground">카테고리:</span>
                <p className="font-medium">{profile.category || 'DEFAULT'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">타입:</span>
                <p className="font-medium">{profile.type || '-'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
