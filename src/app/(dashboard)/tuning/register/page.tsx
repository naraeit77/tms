'use client';

/**
 * SQL Tuning Registration Wizard
 * SQL 튜닝 등록 마법사 - 단계별 가이드
 */

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Database,
  FileCode,
  Settings,
  Clock,
  Zap,
  AlertTriangle,
  HelpCircle,
  Copy,
  Search,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface FormData {
  // Step 1: DB 선택
  oracle_connection_id: string;
  // Step 2: SQL 정보
  sql_id: string;
  sql_text: string;
  // Step 3: 튜닝 정보
  title: string;
  description: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  // 성능 메트릭 (선택)
  before_elapsed_time_ms?: number;
  before_buffer_gets?: number;
  before_cpu_time_ms?: number;
  before_disk_reads?: number;
}

const STEPS = [
  { id: 1, title: 'DB 선택', description: '튜닝할 SQL이 있는 데이터베이스 선택', icon: Database },
  { id: 2, title: 'SQL 정보', description: 'SQL ID와 SQL 텍스트 입력', icon: FileCode },
  { id: 3, title: '튜닝 정보', description: '우선순위와 상세 정보 입력', icon: Settings },
];

const PRIORITY_OPTIONS = [
  {
    value: 'CRITICAL',
    label: '긴급',
    description: '즉시 처리 필요 (서비스 장애 수준)',
    color: 'text-red-600 border-red-200 bg-red-50',
  },
  {
    value: 'HIGH',
    label: '높음',
    description: '빠른 처리 필요 (사용자 불만 발생)',
    color: 'text-orange-600 border-orange-200 bg-orange-50',
  },
  {
    value: 'MEDIUM',
    label: '보통',
    description: '일반적인 성능 개선 대상',
    color: 'text-blue-600 border-blue-200 bg-blue-50',
  },
  {
    value: 'LOW',
    label: '낮음',
    description: '여유 있을 때 처리',
    color: 'text-gray-600 border-gray-200 bg-gray-50',
  },
];

export default function TuningRegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [currentStep, setCurrentStep] = useState(1);
  const [isFetchingSql, setIsFetchingSql] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    oracle_connection_id: '',
    sql_id: '',
    sql_text: '',
    title: '',
    description: '',
    priority: 'MEDIUM',
  });

  // URL 파라미터에서 초기값 로드 (Top SQL에서 넘어온 경우)
  useEffect(() => {
    const sqlId = searchParams.get('sql_id');
    const sqlText = searchParams.get('sql_text');
    const connectionId = searchParams.get('connection_id');
    const elapsedTime = searchParams.get('elapsed_time_ms');
    const bufferGets = searchParams.get('buffer_gets');

    if (sqlId || sqlText || connectionId) {
      setFormData((prev) => ({
        ...prev,
        sql_id: sqlId || prev.sql_id,
        sql_text: sqlText ? decodeURIComponent(sqlText) : prev.sql_text,
        oracle_connection_id: connectionId || prev.oracle_connection_id,
        before_elapsed_time_ms: elapsedTime ? Number(elapsedTime) : prev.before_elapsed_time_ms,
        before_buffer_gets: bufferGets ? Number(bufferGets) : prev.before_buffer_gets,
      }));

      // 이미 SQL 정보가 있으면 Step 3으로
      if (sqlId && connectionId && sqlText) {
        setCurrentStep(3);
      } else if (connectionId) {
        setCurrentStep(2);
      }
    }
  }, [searchParams]);

  // Oracle 연결 목록 조회
  const { data: connections, isLoading: connectionsLoading } = useQuery({
    queryKey: ['oracle-connections'],
    queryFn: async () => {
      const res = await fetch('/api/databases');
      if (!res.ok) throw new Error('Failed to fetch connections');
      const data = await res.json();
      return data.data || [];
    },
  });

  // SQL 등록 Mutation
  const registerMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await fetch('/api/tuning/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to register tuning task');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tuning-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tuning-tasks-kanban'] });
      toast({
        title: '등록 완료!',
        description: 'SQL이 튜닝 대상으로 등록되었습니다.',
      });
      router.push('/tuning');
    },
    onError: (error: Error) => {
      toast({
        title: '등록 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // SQL 정보 조회 함수
  const handleFetchSqlInfo = async () => {
    if (!formData.oracle_connection_id) {
      toast({
        title: 'DB 선택 필요',
        description: 'SQL을 조회하기 전에 먼저 DB를 선택해주세요.',
        variant: 'destructive',
      });
      setCurrentStep(1);
      return;
    }

    if (!formData.sql_id) {
      toast({
        title: 'SQL ID 필요',
        description: '조회할 SQL ID를 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    setIsFetchingSql(true);
    try {
      const res = await fetch(`/api/monitoring/sql-text?connection_id=${formData.oracle_connection_id}&sql_id=${formData.sql_id}`);
      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'SQL 정보를 가져오는데 실패했습니다.');
      }

      const sqlData = result.data;
      if (sqlData) {
        setFormData((prev) => ({
          ...prev,
          sql_text: sqlData.sql_text || prev.sql_text,
          before_elapsed_time_ms: sqlData.avg_elapsed_ms,
          before_buffer_gets: sqlData.avg_buffer_gets,
          before_cpu_time_ms: sqlData.avg_cpu_ms,
          before_disk_reads: sqlData.avg_disk_reads,
        }));

        toast({
          title: 'SQL 정보 조회 성공',
          description: 'SQL 텍스트와 성능 지표를 불러왔습니다.',
        });
      }
    } catch (error: any) {
      console.error('Fetch SQL Error:', error);
      toast({
        title: '조회 실패',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsFetchingSql(false);
    }
  };

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = () => {
    // 제목 자동 생성
    const finalData = {
      ...formData,
      title: formData.title || `${formData.sql_id} 튜닝 작업`,
    };
    registerMutation.mutate(finalData);
  };

  const isStepValid = (step: number) => {
    switch (step) {
      case 1:
        return !!formData.oracle_connection_id;
      case 2:
        return !!formData.sql_id && !!formData.sql_text;
      case 3:
        return true; // priority는 기본값이 있음
      default:
        return false;
    }
  };

  const selectedConnection = connections?.find(
    (c: any) => c.id === formData.oracle_connection_id
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">SQL 튜닝 등록</h1>
          <p className="text-muted-foreground">성능 문제가 있는 SQL을 튜닝 대상으로 등록합니다</p>
        </div>
      </div>

      {/* 진행 단계 표시 */}
      <div className="flex items-center justify-between">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;

          return (
            <div key={step.id} className="flex items-center flex-1">
              <div
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors flex-1',
                  isCurrent && 'bg-blue-50 border border-blue-200',
                  isCompleted && 'bg-green-50',
                  !isCurrent && !isCompleted && 'bg-slate-50'
                )}
              >
                <div
                  className={cn(
                    'w-10 h-10 rounded-full flex items-center justify-center',
                    isCurrent && 'bg-blue-600 text-white',
                    isCompleted && 'bg-green-600 text-white',
                    !isCurrent && !isCompleted && 'bg-slate-200 text-slate-500'
                  )}
                >
                  {isCompleted ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                </div>
                <div className="hidden sm:block">
                  <p className={cn('font-medium text-sm', isCurrent && 'text-blue-900')}>
                    {step.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    'h-0.5 w-8 mx-2',
                    isCompleted ? 'bg-green-500' : 'bg-slate-200'
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1: DB 선택 */}
      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              데이터베이스 선택
            </CardTitle>
            <CardDescription>
              튜닝할 SQL이 실행되는 Oracle 데이터베이스를 선택해주세요
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {connectionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : connections?.length > 0 ? (
              <RadioGroup
                value={formData.oracle_connection_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, oracle_connection_id: value })
                }
                className="grid gap-3"
              >
                {connections.map((conn: any) => (
                  <Label
                    key={conn.id}
                    htmlFor={conn.id}
                    className={cn(
                      'flex items-center gap-4 p-4 border rounded-lg cursor-pointer transition-colors',
                      formData.oracle_connection_id === conn.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'hover:bg-slate-50'
                    )}
                  >
                    <RadioGroupItem value={conn.id} id={conn.id} />
                    <div className="flex-1">
                      <p className="font-medium">{conn.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {conn.host}:{conn.port}/{conn.service_name}
                      </p>
                    </div>
                    <Badge variant={conn.is_active ? 'default' : 'secondary'}>
                      {conn.is_active ? '연결됨' : '비활성'}
                    </Badge>
                  </Label>
                ))}
              </RadioGroup>
            ) : (
              <div className="text-center py-8">
                <Database className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">등록된 데이터베이스가 없습니다</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => router.push('/connections')}
                >
                  DB 연결 관리로 이동
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: SQL 정보 입력 */}
      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5" />
              SQL 정보 입력
            </CardTitle>
            <CardDescription>
              튜닝할 SQL의 ID를 입력하고 조회하거나 직접 텍스트를 입력해주세요
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* SQL ID */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="sql_id">SQL ID *</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <p>
                        V$SQL.SQL_ID 값입니다. 13자리 영문+숫자 조합입니다.
                        <br />
                        Top SQL 모니터링에서 확인하거나 직접 쿼리로 조회할 수 있습니다.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex gap-2">
                <Input
                  id="sql_id"
                  value={formData.sql_id}
                  onChange={(e) => setFormData({ ...formData, sql_id: e.target.value })}
                  placeholder="예: 7p5mw8x2n4j9k"
                  className="font-mono"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleFetchSqlInfo();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleFetchSqlInfo}
                  disabled={isFetchingSql || !formData.sql_id}
                  className="w-24"
                >
                  {isFetchingSql ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      조회
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* SQL Text */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label htmlFor="sql_text">SQL Text *</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        <p>성능 문제가 있는 SQL 전문을 입력해주세요.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                {formData.sql_text && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFormData({
                        ...formData,
                        sql_text: '',
                        before_elapsed_time_ms: undefined,
                        before_buffer_gets: undefined,
                      });
                    }}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    초기화
                  </Button>
                )}
              </div>
              <Textarea
                id="sql_text"
                value={formData.sql_text}
                onChange={(e) => setFormData({ ...formData, sql_text: e.target.value })}
                placeholder="SQL ID를 입력하고 '조회' 버튼을 누르면 자동으로 채워집니다."
                rows={10}
                className="font-mono text-sm bg-slate-50"
              />
            </div>

            {/* 성능 메트릭 (선택) */}
            <div className="p-4 bg-slate-50 rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  현재 성능 메트릭 (선택사항)
                </p>
                {formData.before_elapsed_time_ms !== undefined && (
                  <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full border border-blue-100">
                    자동 수집됨
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                튜닝 전 성능을 기록해두면 개선율을 측정할 수 있습니다.
                SQL ID로 조회 시 평균값이 자동 입력됩니다.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="elapsed_time">실행 시간 (ms)</Label>
                  <Input
                    id="elapsed_time"
                    type="number"
                    value={formData.before_elapsed_time_ms ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        before_elapsed_time_ms: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder="예: 5000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buffer_gets">Buffer Gets</Label>
                  <Input
                    id="buffer_gets"
                    type="number"
                    value={formData.before_buffer_gets ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        before_buffer_gets: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder="예: 100000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cpu_time">CPU Time (ms)</Label>
                  <Input
                    id="cpu_time"
                    type="number"
                    value={formData.before_cpu_time_ms ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        before_cpu_time_ms: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder="예: 500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="disk_reads">Disk Reads</Label>
                  <Input
                    id="disk_reads"
                    type="number"
                    value={formData.before_disk_reads ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        before_disk_reads: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder="예: 100"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: 튜닝 정보 */}
      {currentStep === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              튜닝 작업 정보
            </CardTitle>
            <CardDescription>우선순위와 상세 정보를 입력해주세요</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 선택된 SQL 요약 */}
            <div className="p-4 bg-blue-50 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-blue-900">선택된 SQL</span>
                {selectedConnection && (
                  <Badge variant="outline">{selectedConnection.name}</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <code className="text-sm bg-white px-2 py-1 rounded border shadow-sm">{formData.sql_id}</code>
                {formData.before_elapsed_time_ms && (
                  <Badge variant="secondary" className="text-xs">
                    {formData.before_elapsed_time_ms.toLocaleString()} ms
                  </Badge>
                )}
              </div>
              <pre className="text-xs text-blue-800 bg-white p-3 rounded border overflow-x-auto max-h-32">
                {formData.sql_text.substring(0, 300)}
                {formData.sql_text.length > 300 && '...'}
              </pre>
            </div>

            {/* 우선순위 선택 */}
            <div className="space-y-3">
              <Label>우선순위 *</Label>
              <RadioGroup
                value={formData.priority}
                onValueChange={(value: any) => setFormData({ ...formData, priority: value })}
                className="grid grid-cols-2 gap-3"
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <Label
                    key={option.value}
                    htmlFor={option.value}
                    className={cn(
                      'flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors',
                      formData.priority === option.value
                        ? option.color
                        : 'hover:bg-slate-50 border-slate-200'
                    )}
                  >
                    <RadioGroupItem value={option.value} id={option.value} className="mt-0.5" />
                    <div>
                      <p className="font-medium">{option.label}</p>
                      <p className="text-xs opacity-80">{option.description}</p>
                    </div>
                  </Label>
                ))}
              </RadioGroup>
            </div>

            {/* 제목 */}
            <div className="space-y-2">
              <Label htmlFor="title">제목</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder={`${formData.sql_id} 튜닝 작업`}
              />
              <p className="text-xs text-muted-foreground">
                비워두면 자동으로 생성됩니다
              </p>
            </div>

            {/* 설명 */}
            <div className="space-y-2">
              <Label htmlFor="description">상세 설명</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="성능 문제 상황, 영향 범위, 기대 효과 등을 작성해주세요"
                rows={4}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* 하단 버튼 */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button variant="outline" onClick={handlePrev} disabled={currentStep === 1}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          이전
        </Button>

        {currentStep < STEPS.length ? (
          <Button onClick={handleNext} disabled={!isStepValid(currentStep)}>
            다음
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={registerMutation.isPending}
            className="bg-green-600 hover:bg-green-700"
          >
            {registerMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                등록 중...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                등록 완료
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
