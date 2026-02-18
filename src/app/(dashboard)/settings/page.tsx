'use client';

/**
 * System Settings Page
 * 시스템 환경설정
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, AlertCircle, Play, CheckCircle2, Clock, TrendingUp, Database, RefreshCw, Pause, Settings2, History, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { performanceCollector } from '@/lib/services/performance-collector';

interface SystemSettings {
  // Performance
  performance_threshold_ms: number;
  buffer_gets_threshold: number;
  cpu_time_threshold_ms: number;

  // Auto Tuning
  auto_tuning_enabled: boolean;
}

interface AutoTuningStatus {
  enabled: boolean;
  thresholds: {
    performance_threshold_ms: number;
    buffer_gets_threshold: number;
    cpu_time_threshold_ms: number;
  };
  stats: {
    totalAutoRegistered: number;
    pendingTasks: number;
    completedTasks: number;
  };
}

interface CollectionSettings {
  oracle_connection_id: string;
  is_enabled: boolean;
  collection_interval_minutes: number;
  retention_days: number;
  min_executions: number;
  min_elapsed_time_ms: number;
  excluded_schemas: string[];
  top_sql_limit: number;
  collect_all_hours: boolean;
  collect_start_hour: number;
  collect_end_hour: number;
  last_collection_at: string | null;
  last_collection_status: string | null;
  last_collection_count: number;
  total_collections: number;
  successful_collections: number;
  failed_collections: number;
}

interface OracleConnection {
  id: string;
  name: string;
  host: string;
  is_active: boolean;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('');
  const [isCollecting, setIsCollecting] = useState(false);

  // Oracle 연결 목록 조회
  const { data: connections, isLoading: isLoadingConnections, error: connectionsError } = useQuery<OracleConnection[]>({
    queryKey: ['oracle-connections'],
    queryFn: async () => {
      const res = await fetch('/api/oracle/connections');
      if (!res.ok) throw new Error('Failed to fetch connections');
      return res.json();
    },
  });

  // 선택된 연결이 없으면 첫 번째 연결 선택
  useEffect(() => {
    if (connections && connections.length > 0 && !selectedConnectionId) {
      setSelectedConnectionId(connections[0].id);
    }
  }, [connections, selectedConnectionId]);

  // 수집 설정 조회
  const { data: collectionSettingsData, isLoading: isLoadingCollection } = useQuery<{
    success: boolean;
    data: CollectionSettings;
    is_default: boolean;
  }>({
    queryKey: ['collection-settings', selectedConnectionId],
    queryFn: async () => {
      const res = await fetch(`/api/monitoring/collection-settings?connection_id=${selectedConnectionId}`);
      if (!res.ok) throw new Error('Failed to fetch collection settings');
      return res.json();
    },
    enabled: !!selectedConnectionId,
  });

  // 수집 상태 조회
  const { data: collectionStatus, refetch: refetchStatus } = useQuery<{
    success: boolean;
    settings: CollectionSettings;
    recent_logs: any[];
    today_summary: any;
    total_records: number;
  }>({
    queryKey: ['collection-status', selectedConnectionId],
    queryFn: async () => {
      const res = await fetch(`/api/monitoring/collect-performance?connection_id=${selectedConnectionId}`);
      if (!res.ok) throw new Error('Failed to fetch collection status');
      return res.json();
    },
    enabled: !!selectedConnectionId,
    refetchInterval: 60000, // 60초로 증가
    staleTime: 30 * 1000, // 30초간 캐시 유지
    refetchOnWindowFocus: false,
  });

  // 설정 조회
  const { data: settings, isLoading } = useQuery<SystemSettings>({
    queryKey: ['system-settings'],
    queryFn: async () => {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error('Failed to fetch settings');
      const response = await res.json();
      return response.data; // API returns { success: true, data: {...} }
    },
  });

  // 자동 튜닝 상태 조회
  const { data: autoTuningStatus } = useQuery<AutoTuningStatus>({
    queryKey: ['auto-tuning-status'],
    queryFn: async () => {
      const res = await fetch('/api/auto-tuning');
      if (!res.ok) throw new Error('Failed to fetch auto-tuning status');
      const response = await res.json();
      return response.data;
    },
    refetchInterval: 60000, // 60초로 증가
    staleTime: 30 * 1000, // 30초간 캐시 유지
    refetchOnWindowFocus: false,
  });

  // 자동 튜닝 수동 실행
  const runAutoTuningMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/auto-tuning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Failed to run auto-tuning');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['auto-tuning-status'] });
      toast({
        title: '자동 튜닝 실행 완료',
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: '자동 튜닝 실행 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const [formData, setFormData] = useState<SystemSettings | null>(null);
  const [collectionFormData, setCollectionFormData] = useState<Partial<CollectionSettings>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // formData 초기화
  useEffect(() => {
    if (settings && !formData) {
      setFormData(settings);
    }
  }, [settings, formData]);

  // 수집 설정 폼 데이터 초기화
  useEffect(() => {
    if (collectionSettingsData?.data) {
      setCollectionFormData(collectionSettingsData.data);
    }
  }, [collectionSettingsData]);

  // 수집 로그 삭제 Mutation
  const deleteLogsMutation = useMutation({
    mutationFn: async ({ logId, deleteAll }: { logId?: string; deleteAll?: boolean }) => {
      const params = new URLSearchParams({ connection_id: selectedConnectionId });
      if (deleteAll) {
        params.append('delete_all', 'true');
      } else if (logId) {
        params.append('log_id', logId);
      }
      const res = await fetch(`/api/monitoring/collect-performance?${params.toString()}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete logs');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['collection-status', selectedConnectionId] });
      setShowDeleteConfirm(false);
      toast({
        title: '삭제 완료',
        description: data.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: '삭제 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // 수집 설정 저장 Mutation
  const saveCollectionSettingsMutation = useMutation({
    mutationFn: async (data: Partial<CollectionSettings>) => {
      const res = await fetch('/api/monitoring/collection-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: selectedConnectionId,
          ...data,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save collection settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-settings', selectedConnectionId] });
      queryClient.invalidateQueries({ queryKey: ['collection-status', selectedConnectionId] });
      toast({
        title: '수집 설정 저장 완료',
        description: '성능 데이터 수집 설정이 저장되었습니다.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: '설정 저장 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // 수동 수집 실행
  const handleManualCollect = useCallback(async () => {
    if (!selectedConnectionId) return;

    setIsCollecting(true);
    try {
      const res = await fetch('/api/monitoring/collect-performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: selectedConnectionId }),
      });

      const result = await res.json();

      if (result.success) {
        toast({
          title: '수집 완료',
          description: `${result.records_inserted}개의 SQL 성능 데이터가 수집되었습니다. (${result.duration_ms}ms)`,
        });
        refetchStatus();
      } else {
        toast({
          title: '수집 실패',
          description: result.message || result.error,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: '수집 실패',
        description: error instanceof Error ? error.message : '알 수 없는 오류',
        variant: 'destructive',
      });
    } finally {
      setIsCollecting(false);
    }
  }, [selectedConnectionId, toast, refetchStatus]);

  // 스케줄러 시작/중지
  const handleToggleScheduler = useCallback(() => {
    if (!selectedConnectionId) return;

    const isRunning = performanceCollector.isRunning(selectedConnectionId);

    if (isRunning) {
      performanceCollector.stop(selectedConnectionId);
      toast({
        title: '스케줄러 중지',
        description: '자동 수집이 중지되었습니다.',
      });
    } else {
      const interval = collectionFormData.collection_interval_minutes || 10;
      performanceCollector.start(selectedConnectionId, interval);
      toast({
        title: '스케줄러 시작',
        description: `${interval}분 간격으로 자동 수집이 시작되었습니다.`,
      });
    }
  }, [selectedConnectionId, collectionFormData.collection_interval_minutes, toast]);

  // 설정 저장 Mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (data: SystemSettings) => {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update settings');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      toast({
        title: '설정 저장 완료',
        description: '시스템 설정이 성공적으로 저장되었습니다.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: '설정 저장 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    if (formData) {
      updateSettingsMutation.mutate(formData);
    }
  };

  const updateField = <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => {
    if (formData) {
      setFormData({ ...formData, [key]: value });
    }
  };

  // 숫자 필드 업데이트 - 입력 중에는 자유롭게 입력 가능
  const updateNumberField = (key: keyof SystemSettings, value: string) => {
    // 빈 문자열이면 0으로 설정 (사용자가 지울 수 있도록)
    if (value === '') {
      updateField(key, 0 as SystemSettings[typeof key]);
      return;
    }
    const num = parseInt(value);
    if (!isNaN(num) && num >= 0) {
      updateField(key, num as SystemSettings[typeof key]);
    }
  };

  // blur 시 min/max 범위로 clamp
  const clampNumberField = (key: keyof SystemSettings, min: number, max: number) => {
    if (formData) {
      const currentValue = formData[key] as number;
      const clampedValue = Math.max(min, Math.min(max, currentValue));
      if (clampedValue !== currentValue) {
        updateField(key, clampedValue as SystemSettings[typeof key]);
      }
    }
  };

  if (isLoading || !formData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">시스템 설정</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">시스템 환경을 구성합니다</p>
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">시스템 설정</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">시스템 환경을 구성합니다</p>
        </div>
        <Button onClick={handleSave} disabled={updateSettingsMutation.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {updateSettingsMutation.isPending ? '저장 중...' : '설정 저장'}
        </Button>
      </div>

      {/* 설정 탭 */}
      <Tabs defaultValue="collection" className="space-y-4">
        <TabsList>
          <TabsTrigger value="collection">데이터 수집</TabsTrigger>
          <TabsTrigger value="performance">성능</TabsTrigger>
          <TabsTrigger value="tuning">자동 등록</TabsTrigger>
        </TabsList>

        {/* 데이터 수집 설정 */}
        <TabsContent value="collection" className="space-y-4">
          {/* 연결 선택 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                대상 데이터베이스
              </CardTitle>
              <CardDescription>성능 데이터를 수집할 Oracle 연결 선택</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingConnections ? (
                <Skeleton className="h-10 w-full" />
              ) : connectionsError ? (
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">연결 목록을 불러오지 못했습니다.</span>
                </div>
              ) : !connections || connections.length === 0 ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">등록된 Oracle 연결이 없습니다. 먼저 연결을 추가해주세요.</span>
                </div>
              ) : (
                <Select value={selectedConnectionId} onValueChange={setSelectedConnectionId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="연결을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {connections.map((conn) => (
                      <SelectItem key={conn.id} value={conn.id}>
                        {conn.name} ({conn.host})
                        {!conn.is_active && ' - 비활성'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>

          {selectedConnectionId && (
            <>
              {/* 수집 현황 */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        수집 현황
                      </CardTitle>
                      <CardDescription>성능 데이터 수집 통계</CardDescription>
                    </div>
                    {isLoadingCollection ? (
                      <Skeleton className="h-6 w-24" />
                    ) : (
                      <Badge variant={collectionFormData.is_enabled ? 'default' : 'secondary'}>
                        {collectionFormData.is_enabled ? '수집 활성화' : '수집 비활성화'}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoadingCollection ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[1, 2, 3, 4].map((i) => (
                          <Skeleton key={i} className="h-24 w-full" />
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Skeleton className="h-10 flex-1" />
                        <Skeleton className="h-10 w-32" />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="text-center p-4 bg-muted/50 rounded-lg">
                          <Database className="h-5 w-5 mx-auto mb-2 text-blue-600" />
                          <p className="text-2xl font-bold">{collectionStatus?.total_records?.toLocaleString() || 0}</p>
                          <p className="text-xs text-muted-foreground">총 저장된 레코드</p>
                        </div>
                        <div className="text-center p-4 bg-muted/50 rounded-lg">
                          <CheckCircle2 className="h-5 w-5 mx-auto mb-2 text-green-600" />
                          <p className="text-2xl font-bold">{collectionStatus?.settings?.successful_collections || 0}</p>
                          <p className="text-xs text-muted-foreground">성공 수집</p>
                        </div>
                        <div className="text-center p-4 bg-muted/50 rounded-lg">
                          <AlertCircle className="h-5 w-5 mx-auto mb-2 text-red-600" />
                          <p className="text-2xl font-bold">{collectionStatus?.settings?.failed_collections || 0}</p>
                          <p className="text-xs text-muted-foreground">실패 수집</p>
                        </div>
                        <div className="text-center p-4 bg-muted/50 rounded-lg">
                          <Clock className="h-5 w-5 mx-auto mb-2 text-orange-600" />
                          <p className="text-sm font-medium">
                            {collectionStatus?.settings?.last_collection_at
                              ? new Date(collectionStatus.settings.last_collection_at).toLocaleString('ko-KR')
                              : '-'}
                          </p>
                          <p className="text-xs text-muted-foreground">마지막 수집</p>
                        </div>
                      </div>

                      {/* 오늘 요약 */}
                      {collectionStatus?.today_summary && (
                        <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg mb-4">
                          <h4 className="font-medium mb-2">오늘 수집 요약</h4>
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">수집 횟수:</span>{' '}
                              <span className="font-medium">{collectionStatus.today_summary.collection_count}회</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">총 SQL:</span>{' '}
                              <span className="font-medium">{collectionStatus.today_summary.total_sqls?.toLocaleString()}개</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">평균 실행시간:</span>{' '}
                              <span className="font-medium">{Number(collectionStatus.today_summary.avg_elapsed_time_ms || 0).toFixed(1)}ms</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 수동 수집 및 스케줄러 버튼 */}
                      <div className="flex gap-2">
                        <Button
                          onClick={handleManualCollect}
                          disabled={isCollecting}
                          className="flex-1"
                        >
                          {isCollecting ? (
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4 mr-2" />
                          )}
                          {isCollecting ? '수집 중...' : '지금 수집 실행'}
                        </Button>
                        <Button
                          variant={performanceCollector.isRunning(selectedConnectionId) ? 'destructive' : 'outline'}
                          onClick={handleToggleScheduler}
                        >
                          {performanceCollector.isRunning(selectedConnectionId) ? (
                            <>
                              <Pause className="h-4 w-4 mr-2" />
                              자동 수집 중지
                            </>
                          ) : (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              자동 수집 시작
                            </>
                          )}
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* 수집 설정 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings2 className="h-5 w-5" />
                    수집 설정
                  </CardTitle>
                  <CardDescription>성능 데이터 수집 옵션 구성</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 수집 활성화 */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>수집 활성화</Label>
                      <p className="text-sm text-muted-foreground">
                        이 연결에서 성능 데이터 수집 허용
                      </p>
                    </div>
                    <Switch
                      checked={collectionFormData.is_enabled || false}
                      onCheckedChange={(checked) =>
                        setCollectionFormData({ ...collectionFormData, is_enabled: checked })
                      }
                    />
                  </div>

                  {/* 수집 주기 */}
                  <div className="grid gap-2">
                    <Label>수집 주기</Label>
                    <Select
                      value={String(collectionFormData.collection_interval_minutes || 10)}
                      onValueChange={(value) =>
                        setCollectionFormData({ ...collectionFormData, collection_interval_minutes: Number(value) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5분</SelectItem>
                        <SelectItem value="10">10분 (권장)</SelectItem>
                        <SelectItem value="15">15분</SelectItem>
                        <SelectItem value="30">30분</SelectItem>
                        <SelectItem value="60">60분</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 데이터 보관 기간 */}
                  <div className="grid gap-2">
                    <Label>데이터 보관 기간 (일)</Label>
                    <Input
                      type="number"
                      value={collectionFormData.retention_days || 30}
                      onChange={(e) =>
                        setCollectionFormData({
                          ...collectionFormData,
                          retention_days: Math.max(7, Math.min(90, parseInt(e.target.value) || 30)),
                        })
                      }
                      min={7}
                      max={90}
                    />
                    <p className="text-xs text-muted-foreground">
                      7일 ~ 90일 사이로 설정 가능 (권장: 30일)
                    </p>
                  </div>

                  {/* Top SQL 제한 */}
                  <div className="grid gap-2">
                    <Label>Top SQL 수집 개수</Label>
                    <Select
                      value={String(collectionFormData.top_sql_limit || 500)}
                      onValueChange={(value) =>
                        setCollectionFormData({ ...collectionFormData, top_sql_limit: Number(value) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="100">100개</SelectItem>
                        <SelectItem value="200">200개</SelectItem>
                        <SelectItem value="300">300개</SelectItem>
                        <SelectItem value="500">500개 (권장)</SelectItem>
                        <SelectItem value="1000">1000개</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      수집 시 elapsed_time 기준 상위 SQL 개수
                    </p>
                  </div>

                  {/* 시간대 설정 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>전체 시간대 수집</Label>
                      <Switch
                        checked={collectionFormData.collect_all_hours !== false}
                        onCheckedChange={(checked) =>
                          setCollectionFormData({ ...collectionFormData, collect_all_hours: checked })
                        }
                      />
                    </div>
                    {!collectionFormData.collect_all_hours && (
                      <div className="flex gap-2 items-center pl-4">
                        <Input
                          type="number"
                          className="w-20"
                          value={collectionFormData.collect_start_hour || 0}
                          onChange={(e) =>
                            setCollectionFormData({
                              ...collectionFormData,
                              collect_start_hour: Math.max(0, Math.min(23, parseInt(e.target.value) || 0)),
                            })
                          }
                          min={0}
                          max={23}
                        />
                        <span>시 ~</span>
                        <Input
                          type="number"
                          className="w-20"
                          value={collectionFormData.collect_end_hour || 23}
                          onChange={(e) =>
                            setCollectionFormData({
                              ...collectionFormData,
                              collect_end_hour: Math.max(0, Math.min(23, parseInt(e.target.value) || 23)),
                            })
                          }
                          min={0}
                          max={23}
                        />
                        <span>시</span>
                      </div>
                    )}
                  </div>

                  {/* 저장 버튼 */}
                  <Button
                    onClick={() => saveCollectionSettingsMutation.mutate(collectionFormData)}
                    disabled={saveCollectionSettingsMutation.isPending}
                    className="w-full"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {saveCollectionSettingsMutation.isPending ? '저장 중...' : '수집 설정 저장'}
                  </Button>
                </CardContent>
              </Card>

              {/* 최근 수집 로그 */}
              {collectionStatus?.recent_logs && collectionStatus.recent_logs.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" />
                        최근 수집 로그
                      </CardTitle>
                      {!showDeleteConfirm ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowDeleteConfirm(true)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          로그 삭제
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">모든 로그를 삭제하시겠습니까?</span>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteLogsMutation.mutate({ deleteAll: true })}
                            disabled={deleteLogsMutation.isPending}
                          >
                            {deleteLogsMutation.isPending ? '삭제 중...' : '확인'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowDeleteConfirm(false)}
                            disabled={deleteLogsMutation.isPending}
                          >
                            취소
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {collectionStatus.recent_logs.slice(0, 5).map((log: any) => (
                        <div
                          key={log.id}
                          className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm group"
                        >
                          <div className="flex items-center gap-2">
                            {log.status === 'SUCCESS' ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : log.status === 'FAILED' ? (
                              <AlertCircle className="h-4 w-4 text-red-600" />
                            ) : (
                              <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
                            )}
                            <span>{new Date(log.started_at).toLocaleString('ko-KR')}</span>
                          </div>
                          <div className="flex items-center gap-4 text-muted-foreground">
                            <span>{log.records_inserted || 0}개 수집</span>
                            <span>{log.duration_ms || 0}ms</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                              onClick={() => deleteLogsMutation.mutate({ logId: log.id })}
                              disabled={deleteLogsMutation.isPending}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* 안내 */}
              <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
                <CardContent className="flex gap-3 pt-6">
                  <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                      데이터 수집 안내
                    </p>
                    <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                      <li>Oracle V$SQL에서 성능 데이터를 수집하여 PostgreSQL에 저장합니다</li>
                      <li>AWR 라이선스가 없어도 30일간 성능 히스토리를 보관할 수 있습니다</li>
                      <li>&apos;자동 수집 시작&apos; 버튼으로 브라우저에서 주기적 수집을 실행합니다</li>
                      <li>브라우저를 닫으면 자동 수집이 중지됩니다 (서버 스케줄러는 별도 구성 필요)</li>
                      <li>&apos;성능 히스토리&apos; 메뉴에서 수집된 데이터를 조회할 수 있습니다</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* 성능 설정 */}
        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>성능 임계값</CardTitle>
              <CardDescription>성능 모니터링 기준값 설정</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="performance_threshold_ms">
                  실행 시간 임계값 (밀리초)
                </Label>
                <Input
                  id="performance_threshold_ms"
                  type="number"
                  value={formData.performance_threshold_ms || ''}
                  onChange={(e) => updateNumberField('performance_threshold_ms', e.target.value)}
                  onBlur={() => clampNumberField('performance_threshold_ms', 100, 60000)}
                  min={100}
                  max={60000}
                />
                <p className="text-xs text-muted-foreground">
                  이 값을 초과하는 SQL은 느린 쿼리로 분류됩니다 (권장: 1000ms)
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="buffer_gets_threshold">
                  Buffer Gets 임계값
                </Label>
                <Input
                  id="buffer_gets_threshold"
                  type="number"
                  value={formData.buffer_gets_threshold || ''}
                  onChange={(e) => updateNumberField('buffer_gets_threshold', e.target.value)}
                  onBlur={() => clampNumberField('buffer_gets_threshold', 1000, 1000000)}
                  min={1000}
                  max={1000000}
                />
                <p className="text-xs text-muted-foreground">
                  이 값을 초과하는 SQL은 I/O 집약적으로 분류됩니다 (권장: 10000)
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="cpu_time_threshold_ms">
                  CPU 시간 임계값 (밀리초)
                </Label>
                <Input
                  id="cpu_time_threshold_ms"
                  type="number"
                  value={formData.cpu_time_threshold_ms || ''}
                  onChange={(e) => updateNumberField('cpu_time_threshold_ms', e.target.value)}
                  onBlur={() => clampNumberField('cpu_time_threshold_ms', 100, 60000)}
                  min={100}
                  max={60000}
                />
                <p className="text-xs text-muted-foreground">
                  이 값을 초과하는 SQL은 CPU 집약적으로 분류됩니다 (권장: 5000ms)
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 자동 등록 설정 */}
        <TabsContent value="tuning" className="space-y-4">
          {/* 자동 등록 활성화 */}
          <Card>
            <CardHeader>
              <CardTitle>튜닝 대상 자동 등록</CardTitle>
              <CardDescription>문제 SQL을 자동으로 튜닝 대상에 등록</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>자동 등록 활성화</Label>
                  <p className="text-sm text-muted-foreground">
                    임계값 초과 SQL을 튜닝 대상으로 자동 등록
                  </p>
                </div>
                <Switch
                  checked={formData.auto_tuning_enabled}
                  onCheckedChange={(checked) =>
                    updateField('auto_tuning_enabled', checked)
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* 자동 등록 통계 */}
          {autoTuningStatus && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">자동 등록 현황</CardTitle>
                    <CardDescription>자동 등록된 튜닝 작업 통계</CardDescription>
                  </div>
                  <Badge variant={autoTuningStatus.enabled ? 'default' : 'secondary'}>
                    {autoTuningStatus.enabled ? '활성' : '비활성'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <TrendingUp className="h-5 w-5 mx-auto mb-2 text-blue-600" />
                    <p className="text-2xl font-bold">{autoTuningStatus.stats.totalAutoRegistered}</p>
                    <p className="text-xs text-muted-foreground">총 자동 등록</p>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <Clock className="h-5 w-5 mx-auto mb-2 text-orange-600" />
                    <p className="text-2xl font-bold">{autoTuningStatus.stats.pendingTasks}</p>
                    <p className="text-xs text-muted-foreground">진행 중</p>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <CheckCircle2 className="h-5 w-5 mx-auto mb-2 text-green-600" />
                    <p className="text-2xl font-bold">{autoTuningStatus.stats.completedTasks}</p>
                    <p className="text-xs text-muted-foreground">완료</p>
                  </div>
                </div>

                {/* 수동 실행 버튼 */}
                <div className="mt-4 pt-4 border-t">
                  <Button
                    onClick={() => runAutoTuningMutation.mutate()}
                    disabled={!formData.auto_tuning_enabled || runAutoTuningMutation.isPending}
                    className="w-full"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    {runAutoTuningMutation.isPending ? '분석 중...' : '문제 SQL 자동 등록'}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    수집된 SQL 통계를 분석하여 임계값 초과 SQL을 튜닝 대상으로 등록합니다
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 임계값 안내 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">감지 기준</CardTitle>
              <CardDescription>아래 임계값 중 하나라도 초과하면 자동 등록됩니다</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm">실행 시간</span>
                  <Badge variant="outline">{formData.performance_threshold_ms.toLocaleString()} ms 이상</Badge>
                </div>
                <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm">Buffer Gets</span>
                  <Badge variant="outline">{formData.buffer_gets_threshold.toLocaleString()} 이상</Badge>
                </div>
                <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm">CPU 시간</span>
                  <Badge variant="outline">{formData.cpu_time_threshold_ms.toLocaleString()} ms 이상</Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                * 임계값은 &apos;성능&apos; 탭에서 수정할 수 있습니다
              </p>
            </CardContent>
          </Card>

          {/* 안내 카드 */}
          <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
            <CardContent className="flex gap-3 pt-6">
              <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  자동 등록 작동 방식
                </p>
                <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                  <li>SQL 수집 시 임계값 초과 SQL이 자동으로 튜닝 대상에 등록됩니다</li>
                  <li>등록된 작업은 &apos;튜닝 관리 &gt; 튜닝 대시보드&apos;에서 확인할 수 있습니다</li>
                  <li>이미 등록된 SQL은 중복 등록되지 않습니다</li>
                  <li>실제 튜닝 적용은 관리자가 직접 수행해야 합니다</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
