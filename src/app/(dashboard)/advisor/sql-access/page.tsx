'use client';

/**
 * SQL Access Advisor Page (Oracle Enterprise Edition Only)
 * SQL 액세스 어드바이저 - 워크로드 기반 인덱스, MV, 파티셔닝 권장
 * DBMS_ADVISOR 패키지 기반 (Tuning Pack 라이센스 필요)
 *
 * 주요 기능:
 * 1. 4단계 워크플로우 (Workload → Task → Execute → Recommendations)
 * 2. STS 생성 기능 (AWR/Cursor Cache 기반)
 * 3. What-If 시뮬레이션
 * 4. Benefit 기반 필터링 및 우선순위
 * 5. 이력 관리 및 Before/After 비교
 * 6. 배치 실행 스케줄링
 */

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Database,
  RefreshCw,
  AlertCircle,
  Info,
  Loader2,
  Crown,
  Play,
  Trash2,
  Copy,
  CheckCircle,
  Clock,
  TrendingUp,
  Filter,
  ArrowUpDown,
  History,
  Settings,
  Zap,
  Target,
  BarChart3,
  Calendar,
  FileText,
  ArrowRight,
  CheckCircle2,
  Circle,
  Sparkles,
  FlaskConical,
  Table2,
  Layers,
  HardDrive,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { parseOracleEdition, checkFeatureAvailability } from '@/lib/oracle/edition-guard';
import { EnterpriseFeatureAlert } from '@/components/ui/enterprise-feature-alert';

// ============================================================================
// Types & Interfaces
// ============================================================================

interface AccessTask {
  task_id: number;
  task_name: string;
  description?: string;
  owner: string;
  created: string;
  status: string;
  workload_type: string;
  recommendation_count?: number;
  execution_start?: string;
  execution_end?: string;
}

interface RecommendationAction {
  action_id: number;
  command: string;
  object_name: string;
  table_name: string;
  columns: string;
  ddl: string;
}

interface Recommendation {
  rec_id: number;
  rank: number;
  type: string;
  benefit: number;
  actions: RecommendationAction[];
}

interface WorkflowStep {
  id: number;
  title: string;
  description: string;
  status: 'pending' | 'active' | 'completed';
  icon: React.ReactNode;
}

type SortField = 'rank' | 'benefit' | 'type';
type SortOrder = 'asc' | 'desc';
type FilterType = 'all' | 'INDEX' | 'MATERIALIZED VIEW' | 'PARTITION';
type ImpactLevel = 'all' | 'high' | 'medium' | 'low';

// ============================================================================
// Constants
// ============================================================================

const WORKFLOW_STEPS: Omit<WorkflowStep, 'status'>[] = [
  {
    id: 1,
    title: 'Workload 준비',
    description: 'SQL 문장 수집 (STS, SQL Cache)',
    icon: <Database className="h-5 w-5" />,
  },
  {
    id: 2,
    title: 'Task 설정',
    description: '분석 조건 및 목표 정의',
    icon: <Settings className="h-5 w-5" />,
  },
  {
    id: 3,
    title: 'Task 실행',
    description: '구조적 변경 사항 계산',
    icon: <Play className="h-5 w-5" />,
  },
  {
    id: 4,
    title: '권고안 추출',
    description: '스크립트 생성 및 적용',
    icon: <FileText className="h-5 w-5" />,
  },
];

const IMPACT_THRESHOLDS = {
  high: 30,
  medium: 10,
};

// ============================================================================
// Helper Components
// ============================================================================

function WorkflowProgress({ currentStep }: { currentStep: number }) {
  const steps = WORKFLOW_STEPS.map((step, index) => ({
    ...step,
    status: index + 1 < currentStep ? 'completed' : index + 1 === currentStep ? 'active' : 'pending',
  })) as WorkflowStep[];

  return (
    <div className="relative">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={step.id} className="flex flex-col items-center relative z-10">
            <div
              className={cn(
                'w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all',
                step.status === 'completed'
                  ? 'bg-primary border-primary text-primary-foreground'
                  : step.status === 'active'
                    ? 'bg-primary/10 border-primary text-primary animate-pulse'
                    : 'bg-muted border-muted-foreground/30 text-muted-foreground'
              )}
            >
              {step.status === 'completed' ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                step.icon
              )}
            </div>
            <div className="mt-2 text-center max-w-[100px]">
              <p
                className={cn(
                  'text-xs font-medium',
                  step.status === 'active' ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                {step.title}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 hidden sm:block">
                {step.description}
              </p>
            </div>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'absolute top-6 left-[calc(50%+24px)] w-[calc(100%-48px)] h-0.5',
                  step.status === 'completed' ? 'bg-primary' : 'bg-muted-foreground/30'
                )}
                style={{ width: 'calc(200% - 48px)' }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ImpactBadge({ benefit }: { benefit: number }) {
  if (benefit >= IMPACT_THRESHOLDS.high) {
    return (
      <Badge className="gap-1 bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">
        <TrendingUp className="h-3 w-3" />
        High Impact ({benefit.toFixed(1)}%)
      </Badge>
    );
  }
  if (benefit >= IMPACT_THRESHOLDS.medium) {
    return (
      <Badge className="gap-1 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20">
        <BarChart3 className="h-3 w-3" />
        Medium ({benefit.toFixed(1)}%)
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Circle className="h-3 w-3" />
      Low ({benefit.toFixed(1)}%)
    </Badge>
  );
}

function RecommendationTypeIcon({ type }: { type: string }) {
  if (type.includes('INDEX')) {
    return <Table2 className="h-4 w-4 text-blue-500" />;
  }
  if (type.includes('MATERIALIZED')) {
    return <Layers className="h-4 w-4 text-purple-500" />;
  }
  if (type.includes('PARTITION')) {
    return <HardDrive className="h-4 w-4 text-orange-500" />;
  }
  return <Database className="h-4 w-4 text-gray-500" />;
}

// ============================================================================
// Main Component
// ============================================================================

export default function SQLAccessAdvisorPage() {
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Form State
  const [taskName, setTaskName] = useState('');
  const [workloadType, setWorkloadType] = useState<'CURRENT' | 'AWR' | 'STS'>('CURRENT');
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('workflow');
  const [stsName, setStsName] = useState('');
  const [stsSourceType, setStsSourceType] = useState<'AWR' | 'CURSOR_CACHE'>('CURSOR_CACHE');
  const [stsFilter, setStsFilter] = useState('elapsed_time > 5000000');
  const [stsLimit, setStsLimit] = useState(50);
  const [availableSts, setAvailableSts] = useState<any[]>([]);
  const [selectedSts, setSelectedSts] = useState<string | null>(null);

  // Workflow State
  const [currentWorkflowStep, setCurrentWorkflowStep] = useState(1);

  // Advanced Options State
  const [timeLimit, setTimeLimit] = useState(300);
  const [analysisScope, setAnalysisScope] = useState<'ALL' | 'INDEX' | 'MVIEW' | 'PARTITION'>('ALL');
  const [elapsedTimeFilter, setElapsedTimeFilter] = useState(5);
  const [scheduleBatch, setScheduleBatch] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('02:00');

  // Filter & Sort State
  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [impactFilter, setImpactFilter] = useState<ImpactLevel>('all');
  const [minBenefit, setMinBenefit] = useState(0);

  // Dialog State
  const [showSimulationDialog, setShowSimulationDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);

  // ============================================================================
  // Queries
  // ============================================================================

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

  // EXECUTING 상태인 작업이 있으면 자동 새로고침
  const hasExecutingTasks = tasks.some((task) => task.status === 'EXECUTING');

  useEffect(() => {
    if (!hasExecutingTasks || !selectedConnectionId || selectedConnectionId === 'all') {
      return;
    }

    const interval = setInterval(() => {
      refetch();
    }, 5000);

    return () => clearInterval(interval);
  }, [hasExecutingTasks, selectedConnectionId, refetch]);

  // 권장사항 조회
  const {
    data: recommendationsData,
    isLoading: isLoadingRecommendations,
    refetch: refetchRecommendations,
  } = useQuery({
    queryKey: ['sql-access-recommendations', selectedConnectionId, selectedTask],
    queryFn: async () => {
      if (!selectedConnectionId || !selectedTask) return null;

      const res = await fetch(
        `/api/advisor/sql-access/recommendations?connection_id=${selectedConnectionId}&task_name=${selectedTask}`
      );
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch recommendations');
      }
      return res.json();
    },
    enabled: !!selectedConnectionId && !!selectedTask,
    retry: false,
  });

  const rawRecommendations: Recommendation[] = recommendationsData?.data?.recommendations || [];

  // ============================================================================
  // Filtered & Sorted Recommendations
  // ============================================================================

  const filteredAndSortedRecommendations = useMemo(() => {
    let result = [...rawRecommendations];

    // Type Filter
    if (filterType !== 'all') {
      result = result.filter((rec) => rec.type.includes(filterType));
    }

    // Impact Filter
    if (impactFilter !== 'all') {
      result = result.filter((rec) => {
        if (impactFilter === 'high') return rec.benefit >= IMPACT_THRESHOLDS.high;
        if (impactFilter === 'medium')
          return rec.benefit >= IMPACT_THRESHOLDS.medium && rec.benefit < IMPACT_THRESHOLDS.high;
        return rec.benefit < IMPACT_THRESHOLDS.medium;
      });
    }

    // Min Benefit Filter
    if (minBenefit > 0) {
      result = result.filter((rec) => rec.benefit >= minBenefit);
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'rank':
          comparison = a.rank - b.rank;
          break;
        case 'benefit':
          comparison = b.benefit - a.benefit;
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [rawRecommendations, filterType, impactFilter, minBenefit, sortField, sortOrder]);

  // Summary Statistics
  const recommendationStats = useMemo(() => {
    const total = rawRecommendations.length;
    const highImpact = rawRecommendations.filter((r) => r.benefit >= IMPACT_THRESHOLDS.high).length;
    const indexRecs = rawRecommendations.filter((r) => r.type.includes('INDEX')).length;
    const mviewRecs = rawRecommendations.filter((r) => r.type.includes('MATERIALIZED')).length;
    const partitionRecs = rawRecommendations.filter((r) => r.type.includes('PARTITION')).length;
    const totalBenefit = rawRecommendations.reduce((sum, r) => sum + r.benefit, 0);
    const avgBenefit = total > 0 ? totalBenefit / total : 0;

    return { total, highImpact, indexRecs, mviewRecs, partitionRecs, totalBenefit, avgBenefit };
  }, [rawRecommendations]);

  // ============================================================================
  // Mutations
  // ============================================================================

  // 작업 생성 및 실행
  const createTaskMutation = useMutation({
    mutationFn: async () => {
      if (!taskName.trim()) {
        throw new Error('작업 이름을 입력해주세요');
      }

      if (!selectedConnectionId || selectedConnectionId === 'all') {
        throw new Error('데이터베이스를 선택해주세요');
      }

      setCurrentWorkflowStep(2);

      const res = await fetch('/api/advisor/sql-access/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: selectedConnectionId,
          task_name: taskName.trim(),
          workload_type: workloadType,
          sts_name: workloadType === 'STS' ? selectedSts : undefined,
          time_limit: timeLimit,
          analysis_scope: analysisScope,
          elapsed_time_filter: elapsedTimeFilter,
          schedule_batch: scheduleBatch,
          schedule_time: scheduleTime,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || error.details || 'Failed to create access advisor task');
      }

      return res.json();
    },
    onSuccess: (data) => {
      setCurrentWorkflowStep(3);
      toast({
        title: '작업 생성 완료',
        description: data.message || 'SQL Access Advisor 작업이 생성되고 실행되었습니다.',
      });
      setTaskName('');
      setTimeout(() => {
        refetch();
        setCurrentWorkflowStep(4);
      }, 1000);
    },
    onError: (error: Error) => {
      setCurrentWorkflowStep(1);
      const errorMessage = error.message || '작업 생성 중 오류가 발생했습니다.';

      let description = errorMessage;
      if (errorMessage.includes('ADVISOR 권한')) {
        description =
          'ADVISOR 권한이 필요합니다. DBA에게 다음 권한을 요청해주세요: GRANT ADVISOR TO [사용자];';
      } else if (errorMessage.includes('Tuning Pack') || errorMessage.includes('Enterprise Edition')) {
        description = 'SQL Access Advisor는 Oracle Enterprise Edition의 Tuning Pack 라이센스가 필요합니다.';
      } else if (errorMessage.includes('이미 존재')) {
        description =
          '동일한 이름의 작업이 이미 존재합니다. 다른 이름을 사용하거나 "데이터 정리" 버튼으로 기존 작업을 삭제해주세요.';
      }

      toast({
        title: '작업 생성 실패',
        description,
        variant: 'destructive',
      });

      if (errorMessage.includes('타임아웃') || errorMessage.includes('timeout')) {
        setTimeout(() => {
          refetch();
        }, 2000);
      }
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
      setSelectedTask(null);
    },
    onError: (error: Error) => {
      toast({
        title: '작업 목록 정리 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // STS 생성
  const createStsMutation = useMutation({
    mutationFn: async () => {
      if (!stsName.trim()) {
        throw new Error('STS 이름을 입력해주세요');
      }

      if (!selectedConnectionId || selectedConnectionId === 'all') {
        throw new Error('데이터베이스를 선택해주세요');
      }

      const res = await fetch('/api/advisor/sql-access/sts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: selectedConnectionId,
          sts_name: stsName.trim(),
          source_type: stsSourceType,
          cursor_cache_filter: stsFilter,
          limit: stsLimit,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create STS');
      }

      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'STS 생성 완료',
        description: data.message || `STS '${data.data.sts_name}'이(가) 생성되었습니다.`,
      });
      setStsName('');
      loadStsList();
    },
    onError: (error: Error) => {
      toast({
        title: 'STS 생성 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // STS 목록 조회
  const loadStsList = async () => {
    if (!selectedConnectionId || selectedConnectionId === 'all') return;

    try {
      const res = await fetch(`/api/advisor/sql-access/sts?connection_id=${selectedConnectionId}`);
      if (res.ok) {
        const data = await res.json();
        setAvailableSts(data.data || []);
      }
    } catch (error) {
      console.error('Failed to load STS list:', error);
    }
  };

  useEffect(() => {
    if (selectedConnectionId && selectedConnectionId !== 'all') {
      loadStsList();
    }
  }, [selectedConnectionId]);

  // What-If 시뮬레이션 (가상 인덱스 테스트)
  const simulateRecommendation = async (rec: Recommendation) => {
    if (!selectedConnectionId || !selectedTask) return;

    setShowSimulationDialog(true);
    setSimulationResult(null);

    try {
      const res = await fetch('/api/advisor/sql-access/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: selectedConnectionId,
          task_name: selectedTask,
          recommendation_id: rec.rec_id,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to simulate recommendation');
      }

      const data = await res.json();
      setSimulationResult(data.data);
    } catch (error) {
      toast({
        title: '시뮬레이션 실패',
        description: error instanceof Error ? error.message : '시뮬레이션에 실패했습니다.',
        variant: 'destructive',
      });
    }
  };

  // ============================================================================
  // Event Handlers
  // ============================================================================

  const handleCopyDDL = (ddl: string) => {
    navigator.clipboard.writeText(ddl);
    toast({
      title: 'DDL 복사됨',
      description: 'DDL 문이 클립보드에 복사되었습니다.',
    });
  };

  const handleCopyAllDDLs = () => {
    const allDDLs = filteredAndSortedRecommendations
      .flatMap((rec) => rec.actions.map((a) => a.ddl))
      .join('\n\n');
    navigator.clipboard.writeText(allDDLs);
    toast({
      title: '전체 DDL 복사됨',
      description: `${filteredAndSortedRecommendations.length}개 권고안의 DDL이 복사되었습니다.`,
    });
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field === 'benefit' ? 'desc' : 'asc');
    }
  };

  // ============================================================================
  // Standard Edition Guard
  // ============================================================================
  const currentEdition = parseOracleEdition(selectedConnection?.oracleEdition);
  const featureAvailability = checkFeatureAvailability('SQL_ACCESS_ADVISOR', currentEdition);

  if (selectedConnection && !featureAvailability.available) {
    return (
      <div className="space-y-6">
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
        </div>
        <EnterpriseFeatureAlert
          featureName="SQL Access Advisor (DBMS_ADVISOR)"
          requiredPack="Tuning Pack"
          alternative={featureAvailability.alternative}
          currentEdition={currentEdition}
        />
      </div>
    );
  }

  // ============================================================================
  // Render
  // ============================================================================

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
        <div className="flex gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={() => setShowHistoryDialog(true)}>
                  <History className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>이력 조회</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* 워크플로우 프로그레스 */}
      <Card>
        <CardContent className="pt-6">
          <WorkflowProgress currentStep={currentWorkflowStep} />
        </CardContent>
      </Card>

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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="workflow" className="gap-2">
              <Zap className="h-4 w-4" />
              <span className="hidden sm:inline">워크플로우</span>
            </TabsTrigger>
            <TabsTrigger value="sts" className="gap-2">
              <Table2 className="h-4 w-4" />
              <span className="hidden sm:inline">STS 관리</span>
            </TabsTrigger>
            <TabsTrigger value="tasks" className="gap-2">
              <Database className="h-4 w-4" />
              <span className="hidden sm:inline">작업 목록</span>
              {tasks.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {tasks.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="recommendations" className="gap-2" disabled={!selectedTask}>
              <Target className="h-4 w-4" />
              <span className="hidden sm:inline">권고안</span>
              {rawRecommendations.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {rawRecommendations.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="analysis" className="gap-2" disabled={!selectedTask}>
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">분석</span>
            </TabsTrigger>
          </TabsList>

          {/* ============================================================== */}
          {/* TAB: STS 관리 */}
          {/* ============================================================== */}
          <TabsContent value="sts" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Table2 className="h-5 w-5" />
                  SQL Tuning Set (STS) 생성 및 관리
                </CardTitle>
                <CardDescription>
                  AWR 또는 Cursor Cache에서 SQL을 수집하여 STS를 생성합니다
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>STS 이름</Label>
                    <Input
                      placeholder="예: MY_WORKLOAD_STS"
                      value={stsName}
                      onChange={(e) => setStsName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>소스 타입</Label>
                    <Select value={stsSourceType} onValueChange={(v) => setStsSourceType(v as typeof stsSourceType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CURSOR_CACHE">Cursor Cache</SelectItem>
                        <SelectItem value="AWR">AWR 히스토리</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>필터 조건</Label>
                  <Input
                    placeholder="예: elapsed_time > 5000000"
                    value={stsFilter}
                    onChange={(e) => setStsFilter(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    SQL을 선택하기 위한 필터 조건 (예: elapsed_time &gt; 5000000 - 5초 이상)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>최대 SQL 개수</Label>
                  <Input
                    type="number"
                    value={stsLimit}
                    onChange={(e) => setStsLimit(parseInt(e.target.value) || 50)}
                    min={1}
                    max={1000}
                  />
                </div>
                <Button
                  onClick={() => createStsMutation.mutate()}
                  disabled={createStsMutation.isPending || !stsName.trim()}
                  className="w-full"
                >
                  {createStsMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      STS 생성 중...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      STS 생성
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* STS 목록 */}
            <Card>
              <CardHeader>
                <CardTitle>생성된 STS 목록</CardTitle>
                <CardDescription>현재 데이터베이스에 생성된 STS 목록</CardDescription>
              </CardHeader>
              <CardContent>
                {availableSts.length > 0 ? (
                  <div className="space-y-2">
                    {availableSts.map((sts) => (
                      <div
                        key={sts.name}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
                      >
                        <div>
                          <div className="font-medium">{sts.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {sts.sql_count}개 SQL · {format(new Date(sts.created), 'yyyy-MM-dd HH:mm', { locale: ko })}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedSts(sts.name);
                            setWorkloadType('STS');
                            setActiveTab('workflow');
                          }}
                        >
                          선택
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Table2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>생성된 STS가 없습니다.</p>
                    <p className="text-sm mt-2">위에서 새 STS를 생성해보세요.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============================================================== */}
          {/* TAB: 워크플로우 */}
          {/* ============================================================== */}
          <TabsContent value="workflow" className="space-y-4">
            {/* 기능 설명 */}
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>SQL Access Advisor 아키텍처</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>4단계 프로세스로 워크로드를 분석하여 최적의 액세스 구조를 권장합니다:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                  <div className="flex items-start gap-2 p-2 bg-muted/50 rounded">
                    <Database className="h-4 w-4 mt-0.5 text-blue-500" />
                    <div>
                      <p className="text-sm font-medium">Workload 준비</p>
                      <p className="text-xs text-muted-foreground">
                        STS, SQL Cache에서 분석할 SQL 수집
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-2 bg-muted/50 rounded">
                    <Settings className="h-4 w-4 mt-0.5 text-purple-500" />
                    <div>
                      <p className="text-sm font-medium">Task 설정</p>
                      <p className="text-xs text-muted-foreground">시간 제한, 분석 범위 정의</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-2 bg-muted/50 rounded">
                    <Play className="h-4 w-4 mt-0.5 text-green-500" />
                    <div>
                      <p className="text-sm font-medium">Task 실행</p>
                      <p className="text-xs text-muted-foreground">
                        Oracle 엔진이 구조 변경 계산
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-2 bg-muted/50 rounded">
                    <FileText className="h-4 w-4 mt-0.5 text-orange-500" />
                    <div>
                      <p className="text-sm font-medium">권고안 추출</p>
                      <p className="text-xs text-muted-foreground">DDL 스크립트 생성 및 적용</p>
                    </div>
                  </div>
                </div>
              </AlertDescription>
            </Alert>

            {/* 새 분석 작업 생성 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 기본 설정 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Step 1: Workload 설정
                  </CardTitle>
                  <CardDescription>분석할 SQL 워크로드 소스를 선택합니다</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="taskName">작업 이름</Label>
                    <Input
                      id="taskName"
                      placeholder="예: ACCESS_ANALYSIS_001"
                      value={taskName}
                      onChange={(e) => setTaskName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>워크로드 유형</Label>
                    <Select
                      value={workloadType}
                      onValueChange={(v) => setWorkloadType(v as typeof workloadType)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CURRENT">
                          <div className="flex items-center gap-2">
                            <Zap className="h-4 w-4 text-yellow-500" />
                            <div>
                              <div className="font-medium">현재 커서 캐시</div>
                              <div className="text-xs text-muted-foreground">
                                메모리에서 실행 중인 SQL
                              </div>
                            </div>
                          </div>
                        </SelectItem>
                        <SelectItem value="AWR">
                          <div className="flex items-center gap-2">
                            <History className="h-4 w-4 text-blue-500" />
                            <div>
                              <div className="font-medium">AWR 스냅샷</div>
                              <div className="text-xs text-muted-foreground">
                                과거 성능 저하 SQL 추출
                              </div>
                            </div>
                          </div>
                        </SelectItem>
                        <SelectItem value="STS">
                          <div className="flex items-center gap-2">
                            <Database className="h-4 w-4 text-purple-500" />
                            <div>
                              <div className="font-medium">SQL Tuning Set</div>
                              <div className="text-xs text-muted-foreground">
                                기존 STS 사용
                              </div>
                            </div>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    {/* STS 선택 (워크로드 타입이 STS일 때) */}
                    {workloadType === 'STS' && (
                      <div className="mt-2 space-y-2">
                        <Label>STS 선택</Label>
                        <div className="flex gap-2">
                          <Select value={selectedSts || ''} onValueChange={setSelectedSts}>
                            <SelectTrigger>
                              <SelectValue placeholder="STS를 선택하거나 새로 생성하세요" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableSts.length > 0 ? (
                                availableSts.map((sts) => (
                                  <SelectItem key={sts.name} value={sts.name}>
                                    <div>
                                      <div className="font-medium">{sts.name}</div>
                                      <div className="text-xs text-muted-foreground">
                                        {sts.sql_count}개 SQL · {format(new Date(sts.created), 'yyyy-MM-dd', { locale: ko })}
                                      </div>
                                    </div>
                                  </SelectItem>
                                ))
                              ) : (
                                <div className="p-2 text-sm text-muted-foreground">생성된 STS가 없습니다</div>
                              )}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setActiveTab('sts');
                            }}
                          >
                            <Sparkles className="h-4 w-4 mr-2" />
                            새 STS
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {workloadType !== 'STS' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>최소 경과 시간 (초)</Label>
                        <span className="text-sm text-muted-foreground">{elapsedTimeFilter}초</span>
                      </div>
                    <Slider
                      value={[elapsedTimeFilter]}
                      onValueChange={([v]) => setElapsedTimeFilter(v)}
                      min={1}
                      max={60}
                      step={1}
                    />
                      <p className="text-xs text-muted-foreground">
                        이 값 이상 실행된 SQL만 분석에 포함됩니다
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 고급 설정 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Step 2: Task 설정
                  </CardTitle>
                  <CardDescription>분석 조건 및 실행 옵션을 설정합니다</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>분석 범위</Label>
                    <Select
                      value={analysisScope}
                      onValueChange={(v) => setAnalysisScope(v as typeof analysisScope)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">전체 (인덱스 + MV + 파티셔닝)</SelectItem>
                        <SelectItem value="INDEX">인덱스만</SelectItem>
                        <SelectItem value="MVIEW">머티리얼라이즈드 뷰만</SelectItem>
                        <SelectItem value="PARTITION">파티셔닝만</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>시간 제한 (초)</Label>
                      <span className="text-sm text-muted-foreground">{timeLimit}초</span>
                    </div>
                    <Slider
                      value={[timeLimit]}
                      onValueChange={([v]) => setTimeLimit(v)}
                      min={60}
                      max={3600}
                      step={60}
                    />
                    <p className="text-xs text-muted-foreground">
                      분석 실행 최대 시간 ({Math.floor(timeLimit / 60)}분)
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>배치 실행 스케줄링</Label>
                        <p className="text-xs text-muted-foreground">
                          운영 시간 외 자동 실행
                        </p>
                      </div>
                      <Switch checked={scheduleBatch} onCheckedChange={setScheduleBatch} />
                    </div>

                    {scheduleBatch && (
                      <div className="space-y-2">
                        <Label>예약 시간</Label>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <Input
                            type="time"
                            value={scheduleTime}
                            onChange={(e) => setScheduleTime(e.target.value)}
                            className="w-32"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 실행 버튼 */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    <p className="flex items-center gap-2">
                      <Info className="h-4 w-4" />
                      분석 실행 시 CPU/I/O 리소스가 사용됩니다. 운영 시간 외 실행을 권장합니다.
                    </p>
                  </div>
                  <Button
                    size="lg"
                    className="w-full sm:w-auto gap-2"
                    onClick={() => createTaskMutation.mutate()}
                    disabled={
                      createTaskMutation.isPending ||
                      !selectedConnectionId ||
                      selectedConnectionId === 'all' ||
                      !taskName.trim()
                    }
                  >
                    {createTaskMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        작업 생성 중... (최대 2분)
                      </>
                    ) : scheduleBatch ? (
                      <>
                        <Calendar className="h-4 w-4" />
                        배치 작업 예약
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" />
                        분석 작업 생성 및 실행
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============================================================== */}
          {/* TAB: 작업 목록 */}
          {/* ============================================================== */}
          <TabsContent value="tasks" className="space-y-4">
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
                      <Skeleton key={`skeleton-task-${i}`} className="h-24 w-full" />
                    ))}
                  </div>
                ) : tasks.length > 0 ? (
                  <div className="space-y-3">
                    {tasks.map((task) => (
                      <div
                        key={task.task_id}
                        className={cn(
                          'border rounded-lg p-4 transition-colors cursor-pointer hover:bg-muted/50',
                          selectedTask === task.task_name && 'border-primary bg-primary/5'
                        )}
                        onClick={() => {
                          if (task.status === 'COMPLETED') {
                            setSelectedTask(task.task_name);
                            setActiveTab('recommendations');
                          }
                        }}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-semibold flex items-center gap-2">
                              {task.task_name}
                              {selectedTask === task.task_name && (
                                <Badge variant="outline" className="text-xs">
                                  선택됨
                                </Badge>
                              )}
                            </h3>
                            <p className="text-sm text-muted-foreground">{task.description}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                task.status === 'COMPLETED'
                                  ? 'default'
                                  : task.status === 'EXECUTING'
                                    ? 'secondary'
                                    : 'outline'
                              }
                              className={cn(
                                task.status === 'COMPLETED' && 'bg-green-500/10 text-green-700 dark:text-green-400',
                                task.status === 'EXECUTING' && 'animate-pulse'
                              )}
                            >
                              {task.status === 'COMPLETED' ? (
                                <>
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  완료
                                </>
                              ) : task.status === 'EXECUTING' ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  실행 중
                                </>
                              ) : (
                                task.status
                              )}
                            </Badge>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <div className="text-xs text-muted-foreground">워크로드</div>
                            <div className="font-medium">{task.workload_type}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">생성일</div>
                            <div className="text-xs">
                              {format(new Date(task.created), 'yyyy-MM-dd HH:mm', { locale: ko })}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">권장사항</div>
                            <div className="font-medium">
                              {task.status === 'COMPLETED' ? (
                                <span className="flex items-center gap-1">
                                  {task.recommendation_count || 0}개
                                  {(task.recommendation_count || 0) > 0 && (
                                    <ArrowRight className="h-3 w-3 text-primary" />
                                  )}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">상태</div>
                            <div className="font-medium">
                              {task.status === 'COMPLETED'
                                ? '분석 완료'
                                : task.status === 'EXECUTING'
                                  ? '분석 중...'
                                  : task.status}
                            </div>
                          </div>
                        </div>

                        {task.status === 'EXECUTING' && (
                          <div className="mt-3">
                            <Progress value={33} className="h-1" />
                            <p className="text-xs text-muted-foreground mt-1">
                              작업이 실행 중입니다. 완료까지 몇 분이 걸릴 수 있습니다.
                            </p>
                          </div>
                        )}

                        {task.status === 'COMPLETED' && (task.recommendation_count || 0) > 0 && (
                          <div className="mt-3 pt-3 border-t">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTask(task.task_name);
                                setActiveTab('recommendations');
                              }}
                            >
                              <Target className="h-4 w-4 mr-2" />
                              권고안 상세 보기
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-lg font-medium">생성된 분석 작업이 없습니다.</p>
                    <p className="text-sm mt-1">워크플로우 탭에서 새 분석 작업을 생성해주세요.</p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => setActiveTab('workflow')}
                    >
                      <Zap className="h-4 w-4 mr-2" />
                      새 작업 생성하기
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============================================================== */}
          {/* TAB: 권고안 */}
          {/* ============================================================== */}
          <TabsContent value="recommendations" className="space-y-4">
            {selectedTask && (
              <>
                {/* 요약 통계 */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold">{recommendationStats.total}</div>
                      <p className="text-xs text-muted-foreground">전체 권고안</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold text-green-600">{recommendationStats.highImpact}</div>
                      <p className="text-xs text-muted-foreground">High Impact</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold text-blue-600">{recommendationStats.indexRecs}</div>
                      <p className="text-xs text-muted-foreground">인덱스</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold text-purple-600">{recommendationStats.mviewRecs}</div>
                      <p className="text-xs text-muted-foreground">MView</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold text-orange-600">{recommendationStats.partitionRecs}</div>
                      <p className="text-xs text-muted-foreground">파티션</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold">{recommendationStats.avgBenefit.toFixed(1)}%</div>
                      <p className="text-xs text-muted-foreground">평균 개선율</p>
                    </CardContent>
                  </Card>
                </div>

                {/* 필터 및 정렬 */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <CardTitle className="flex items-center gap-2">
                        <Filter className="h-5 w-5" />
                        필터 및 정렬
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handleCopyAllDDLs}>
                          <Copy className="h-4 w-4 mr-2" />
                          전체 DDL 복사
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => refetchRecommendations()}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs">유형 필터</Label>
                        <Select
                          value={filterType}
                          onValueChange={(v) => setFilterType(v as FilterType)}
                        >
                          <SelectTrigger className="w-[150px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">전체</SelectItem>
                            <SelectItem value="INDEX">인덱스</SelectItem>
                            <SelectItem value="MATERIALIZED VIEW">MView</SelectItem>
                            <SelectItem value="PARTITION">파티션</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">영향도 필터</Label>
                        <Select
                          value={impactFilter}
                          onValueChange={(v) => setImpactFilter(v as ImpactLevel)}
                        >
                          <SelectTrigger className="w-[150px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">전체</SelectItem>
                            <SelectItem value="high">High Impact ({'>'}30%)</SelectItem>
                            <SelectItem value="medium">Medium (10-30%)</SelectItem>
                            <SelectItem value="low">Low ({'<'}10%)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">최소 개선율: {minBenefit}%</Label>
                        <Slider
                          value={[minBenefit]}
                          onValueChange={([v]) => setMinBenefit(v)}
                          min={0}
                          max={50}
                          step={5}
                          className="w-[150px]"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">정렬</Label>
                        <div className="flex gap-1">
                          <Button
                            variant={sortField === 'rank' ? 'secondary' : 'outline'}
                            size="sm"
                            onClick={() => toggleSort('rank')}
                          >
                            순위
                            {sortField === 'rank' && (
                              <ArrowUpDown className="h-3 w-3 ml-1" />
                            )}
                          </Button>
                          <Button
                            variant={sortField === 'benefit' ? 'secondary' : 'outline'}
                            size="sm"
                            onClick={() => toggleSort('benefit')}
                          >
                            개선율
                            {sortField === 'benefit' && (
                              <ArrowUpDown className="h-3 w-3 ml-1" />
                            )}
                          </Button>
                          <Button
                            variant={sortField === 'type' ? 'secondary' : 'outline'}
                            size="sm"
                            onClick={() => toggleSort('type')}
                          >
                            유형
                            {sortField === 'type' && (
                              <ArrowUpDown className="h-3 w-3 ml-1" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* 권고안 목록 */}
                <Card>
                  <CardHeader>
                    <CardTitle>
                      권고안 목록 ({filteredAndSortedRecommendations.length}/{rawRecommendations.length})
                    </CardTitle>
                    <CardDescription>
                      Task: {selectedTask} | Benefit 기준으로 우선순위가 높은 권고안부터 적용을 권장합니다
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoadingRecommendations ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mr-2" />
                        <span>권장사항 로딩 중...</span>
                      </div>
                    ) : filteredAndSortedRecommendations.length > 0 ? (
                      <div className="space-y-4">
                        {filteredAndSortedRecommendations.map((rec) => (
                          <div
                            key={rec.rec_id}
                            className="border rounded-lg p-4 hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted">
                                  <RecommendationTypeIcon type={rec.type} />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline">#{rec.rank}</Badge>
                                    <span className="font-medium">{rec.type}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <ImpactBadge benefit={rec.benefit} />
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => simulateRecommendation(rec)}
                                      >
                                        <FlaskConical className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>What-If 시뮬레이션</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                            </div>

                            {rec.actions.length > 0 && (
                              <div className="space-y-2">
                                {rec.actions.map((action) => (
                                  <div
                                    key={action.action_id}
                                    className="bg-muted/50 rounded p-3"
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-xs">
                                          {action.command}
                                        </Badge>
                                        {action.object_name && (
                                          <span className="text-sm text-muted-foreground">
                                            {action.object_name}
                                          </span>
                                        )}
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleCopyDDL(action.ddl)}
                                      >
                                        <Copy className="h-4 w-4" />
                                      </Button>
                                    </div>
                                    <pre className="text-xs bg-background p-2 rounded overflow-x-auto whitespace-pre-wrap font-mono">
                                      {action.ddl}
                                    </pre>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Filter className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>필터 조건에 맞는 권고안이 없습니다.</p>
                        <Button
                          variant="link"
                          onClick={() => {
                            setFilterType('all');
                            setImpactFilter('all');
                            setMinBenefit(0);
                          }}
                        >
                          필터 초기화
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ============================================================== */}
          {/* TAB: 분석 */}
          {/* ============================================================== */}
          <TabsContent value="analysis" className="space-y-4">
            {selectedTask && (
              <Tabs defaultValue="script" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="script">구현 스크립트</TabsTrigger>
                  <TabsTrigger value="report">상세 리포트</TabsTrigger>
                </TabsList>

                <TabsContent value="script" className="mt-4">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle>구현 스크립트</CardTitle>
                          <CardDescription>
                            DBMS_ADVISOR.GET_TASK_SCRIPT로 생성된 전체 구현 스크립트
                          </CardDescription>
                        </div>
                        {recommendationsData?.data?.script && (
                          <Button
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(recommendationsData.data.script);
                              toast({
                                title: '스크립트 복사됨',
                                description: '전체 스크립트가 클립보드에 복사되었습니다.',
                              });
                            }}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            복사
                          </Button>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {recommendationsData?.data?.script ? (
                        <div className="space-y-4">
                          <Alert>
                            <Info className="h-4 w-4" />
                            <AlertTitle>적용 안내</AlertTitle>
                            <AlertDescription>
                              SQL Access Advisor가 생성한 전체 구현 스크립트입니다. DBA 검토 후
                              적용하세요.
                            </AlertDescription>
                          </Alert>
                          <pre className="p-4 rounded-lg bg-muted border font-mono text-sm overflow-x-auto whitespace-pre-wrap max-h-[600px] overflow-y-auto">
                            {recommendationsData.data.script}
                          </pre>
                        </div>
                      ) : (
                        <div className="text-center py-12 text-muted-foreground">
                          <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                          <p>생성된 스크립트가 없습니다.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="report" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>상세 리포트</CardTitle>
                      <CardDescription>
                        DBMS_ADVISOR.GET_TASK_REPORT로 생성된 분석 리포트
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {recommendationsData?.data?.report ? (
                        <div className="space-y-4">
                          <Alert>
                            <Info className="h-4 w-4" />
                            <AlertTitle>상세 리포트</AlertTitle>
                            <AlertDescription>
                              Oracle SQL Access Advisor 상세 분석 리포트입니다.
                            </AlertDescription>
                          </Alert>
                          <pre className="p-4 rounded-lg bg-muted border font-mono text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[600px] overflow-y-auto">
                            {recommendationsData.data.report}
                          </pre>
                        </div>
                      ) : (
                        <div className="text-center py-12 text-muted-foreground">
                          <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                          <p>생성된 리포트가 없습니다.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* ============================================================== */}
      {/* Dialog: What-If 시뮬레이션 */}
      {/* ============================================================== */}
      <Dialog open={showSimulationDialog} onOpenChange={setShowSimulationDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5" />
              What-If 시뮬레이션
            </DialogTitle>
            <DialogDescription>
              권고안 적용 시 예상되는 성능 변화를 분석합니다
            </DialogDescription>
          </DialogHeader>

          {simulationResult ? (
            <div className="space-y-4">
              {simulationResult.simulations && simulationResult.simulations.length > 0 ? (
                simulationResult.simulations.map((sim: any, idx: number) => (
                  <div key={idx} className="space-y-4 border rounded-lg p-4">
                    <div className="grid grid-cols-2 gap-4">
                      <Card>
                        <CardContent className="pt-4">
                          <div className="text-sm text-muted-foreground">Before Cost</div>
                          <div className="text-2xl font-bold">
                            {sim.before_cost ? sim.before_cost.toLocaleString() : 'N/A'}
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-4">
                          <div className="text-sm text-muted-foreground">After Cost</div>
                          <div className="text-2xl font-bold text-green-600">
                            {sim.after_cost ? Math.round(sim.after_cost).toLocaleString() : 'N/A'}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>예상 개선율</span>
                        <span className="font-medium text-green-600">
                          {sim.estimated_improvement ? `${sim.estimated_improvement.toFixed(1)}%` : 'N/A'}
                        </span>
                      </div>
                      {sim.ddl_statement && (
                        <div className="mt-2">
                          <Label className="text-xs">DDL Statement</Label>
                          <pre className="p-2 bg-muted rounded text-xs font-mono overflow-x-auto">
                            {sim.ddl_statement}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FlaskConical className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>시뮬레이션 결과가 없습니다.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2">시뮬레이션 분석 중...</span>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSimulationDialog(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================== */}
      {/* Dialog: 이력 조회 */}
      {/* ============================================================== */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              적용 이력 관리
            </DialogTitle>
            <DialogDescription>
              권고안 적용 이력 및 Before/After 성능 비교
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>이력 관리 기능</AlertTitle>
              <AlertDescription>
                권고안 적용 이력은 향후 업데이트에서 제공될 예정입니다. 현재는 작업 목록에서 분석
                결과를 확인할 수 있습니다.
              </AlertDescription>
            </Alert>

            <div className="border rounded-lg p-8 text-center text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">적용 이력이 없습니다</p>
              <p className="text-sm mt-1">
                권고안을 적용하면 이력이 자동으로 기록됩니다.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHistoryDialog(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
