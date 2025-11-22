'use client';

/**
 * SQL Monitor Page (Oracle Enterprise Edition Only)
 * Oracle Enterprise Edition 전용 실시간 SQL 모니터링 도구
 * DBMS_SQLTUNE.REPORT_SQL_MONITOR 기능을 활용한 고급 성능 분석 도구
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  RefreshCw,
  AlertCircle,
  Info,
  Loader2,
  Crown,
  Clock,
  Database,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Play,
  Pause,
  Trash2
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

interface SQLMonitorEntry {
  key: string;
  sql_id: string;
  sql_exec_id: number;
  sql_exec_start: string;
  status: string;
  username: string;
  module?: string;
  action?: string;
  service_name?: string;
  duration?: number;
  cpu_time?: number;
  elapsed_time?: number;
  buffer_gets?: number;
  disk_reads?: number;
  fetches?: number;
  io_interconnect_bytes?: number;
  physical_read_bytes?: number;
  physical_write_bytes?: number;
  sql_text?: string;
  error_message?: string;
  plan_hash_value?: number;
  parallel_degree?: number;
  parallel_instances?: number;
  refresh_count?: number;
  binds_xml?: string;
  other_xml?: string;
}

export default function SQLMonitorPage() {
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [usernameFilter, setUsernameFilter] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<SQLMonitorEntry | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testResults, setTestResults] = useState<any>(null);
  const [clearedAt, setClearedAt] = useState<Date | null>(null);

  // SQL Monitor 엔트리 조회
  const {
    data: monitorData,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['sql-monitor', selectedConnectionId, statusFilter, usernameFilter],
    queryFn: async () => {
      if (!selectedConnectionId || selectedConnectionId === 'all') {
        throw new Error('특정 데이터베이스를 선택해주세요');
      }

      const params = new URLSearchParams({
        connection_id: selectedConnectionId,
      });

      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      if (usernameFilter) {
        params.append('username', usernameFilter);
      }

      const res = await fetch(`/api/monitoring/sql-monitor?${params}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch SQL Monitor data');
      }
      return res.json();
    },
    enabled: !!selectedConnectionId && selectedConnectionId !== 'all',
    refetchInterval: autoRefresh ? 5000 : false, // 5초마다 자동 새로고침
    retry: false,
  });

  const rawEntries: SQLMonitorEntry[] = monitorData?.data || [];
  const isEnterpriseEdition = monitorData?.isEnterprise !== false;

  // 중복 제거 - 동일한 SQL_ID + SQL_EXEC_ID 조합은 하나만 유지
  const uniqueEntriesMap = new Map<string, SQLMonitorEntry>();
  rawEntries.forEach(entry => {
    const key = `${entry.sql_id}-${entry.sql_exec_id}`;
    if (!uniqueEntriesMap.has(key)) {
      uniqueEntriesMap.set(key, entry);
    } else {
      console.warn(`Duplicate SQL Monitor entry detected and filtered: ${key}`);
    }
  });

  // clearedAt 이후의 데이터만 필터링
  let filteredEntries = Array.from(uniqueEntriesMap.values());
  if (clearedAt) {
    filteredEntries = filteredEntries.filter(entry => {
      const execStart = new Date(entry.sql_exec_start);
      return execStart > clearedAt;
    });
    console.log(`Filtered entries by cleared timestamp (${clearedAt.toISOString()}):`, {
      before: Array.from(uniqueEntriesMap.values()).length,
      after: filteredEntries.length,
      filtered: Array.from(uniqueEntriesMap.values()).length - filteredEntries.length
    });
  }

  const entries = filteredEntries;

  // 디버깅: 받아온 데이터 확인
  console.log('SQL Monitor Data:', {
    monitorData,
    rawEntries: rawEntries.length,
    entries: entries.length,
    duplicatesFiltered: rawEntries.length - entries.length,
    isEnterpriseEdition,
    edition: monitorData?.edition,
    license: monitorData?.license,
    error: error?.message || error,
    selectedConnectionId
  });

  // 통계 계산
  const stats = {
    total: entries.length,
    executing: entries.filter(e => e.status === 'EXECUTING').length,
    done: entries.filter(e => e.status === 'DONE').length,
    error: entries.filter(e => e.status === 'ERROR').length,
    avgDuration: entries.length > 0
      ? Math.round(entries.reduce((sum, e) => sum + (e.duration || 0), 0) / entries.length)
      : 0,
  };

  // SQL Monitor 리포트 생성
  const generateReportMutation = useMutation({
    mutationFn: async ({ sqlId, execId }: { sqlId: string; execId: number }) => {
      const res = await fetch('/api/monitoring/sql-monitor/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: selectedConnectionId,
          sql_id: sqlId,
          sql_exec_id: execId,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to generate SQL Monitor report');
      }

      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'SQL Monitor 리포트 생성 완료',
        description: '상세 리포트가 생성되었습니다.',
      });
      setReportData(data.data);
      setReportDialogOpen(true);
    },
    onError: (error: Error) => {
      toast({
        title: 'SQL Monitor 리포트 생성 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // SQL Monitor 데이터 정리
  const { mutate: clearSQLMonitor, isPending: isClearingData } = useMutation({
    mutationFn: async () => {
      if (!selectedConnectionId || selectedConnectionId === 'all') {
        throw new Error('데이터베이스를 선택해주세요');
      }

      const res = await fetch('/api/monitoring/sql-monitor/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: selectedConnectionId }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to clear SQL Monitor data');
      }

      return res.json();
    },
    onSuccess: (data) => {
      console.log('[SQL Monitor Clear] Response:', data);

      // clearedAt 타임스탬프 저장 - Oracle DB 서버 시각 사용
      if (data.clearedAt) {
        const clearedTimestamp = new Date(data.clearedAt);
        setClearedAt(clearedTimestamp);
        console.log('[SQL Monitor Clear] Set cleared timestamp:', clearedTimestamp.toISOString());
      }

      toast({
        title: 'SQL Monitor 데이터 정리 완료',
        description: data.message || 'SQL Monitor 데이터가 정리되었습니다.',
      });

      // 즉시 refetch하여 필터링된 결과 표시
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: 'SQL Monitor 데이터 정리 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // SQL Monitor 테스트 실행
  const runTest = async () => {
    if (!selectedConnectionId || selectedConnectionId === 'all') {
      toast({
        title: '테스트 실패',
        description: '데이터베이스를 선택해주세요',
        variant: 'destructive',
      });
      return;
    }

    try {
      const res = await fetch(`/api/monitoring/sql-monitor/test?connection_id=${selectedConnectionId}`);
      const data = await res.json();

      if (data.success) {
        setTestResults(data.data);
        setTestDialogOpen(true);
      } else {
        toast({
          title: '테스트 실패',
          description: data.message || '테스트 중 오류가 발생했습니다',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: '테스트 실패',
        description: '테스트 요청 중 오류가 발생했습니다',
        variant: 'destructive',
      });
    }
  };

  // 실행 시간 포맷팅
  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  // 바이트 포맷팅
  const formatBytes = (bytes?: number) => {
    if (!bytes) return '0';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  // 상태별 색상 설정
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'EXECUTING': return 'default';
      case 'DONE': return 'success';
      case 'ERROR': return 'destructive';
      case 'DONE (FIRST N ROWS)': return 'secondary';
      default: return 'outline';
    }
  };

  // 상태별 아이콘
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'EXECUTING': return <Play className="h-3 w-3" />;
      case 'DONE': return <CheckCircle className="h-3 w-3" />;
      case 'ERROR': return <XCircle className="h-3 w-3" />;
      default: return <AlertCircle className="h-3 w-3" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">SQL Monitor</h1>
            <Badge variant="secondary" className="gap-1">
              <Crown className="h-3 w-3" />
              Enterprise Only
            </Badge>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Oracle Enterprise Edition 전용 실시간 SQL 실행 모니터링 (DBMS_SQLTUNE)
          </p>
          {selectedConnection && (
            <p className="text-sm text-muted-foreground mt-1">
              연결: <span className="font-medium">{selectedConnection.name}</span> ({selectedConnection.host}:{selectedConnection.port})
            </p>
          )}
        </div>
      </div>

      {/* SQL Monitor 기능 설명 */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>SQL Monitor 소개</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            SQL Monitor는 Oracle Enterprise Edition의 Tuning Pack 기능으로, DBMS_SQLTUNE 패키지를 통해 제공됩니다. (오라클 진단팩 및 튜닝팩 구매 고객만 사용가능)
          </p>
          <div className="space-y-1">
            <p className="font-semibold">Oracle이 자동으로 모니터링하는 SQL 조건:</p>
            <ul className="list-disc list-inside space-y-0.5 text-sm ml-2">
              <li><strong>5초 이상의 CPU 시간</strong> 또는 <strong>5초 이상의 경과 시간</strong>을 소비하는 SQL</li>
              <li>병렬 처리(PARALLEL) SQL</li>
              <li>/*+ MONITOR */ 힌트를 사용한 SQL (실행 시간과 무관하게 모니터링)</li>
            </ul>
          </div>
          <div className="bg-muted/50 p-3 rounded-md text-sm space-y-1 mt-2">
            <p className="font-medium">💡 테스트 예제:</p>
            <code className="block text-xs">
              {'-- 5초 이상 실행되는 SQL 예제\n'}
              {'SELECT /*+ FULL(t) */ * FROM big_table t WHERE ROWNUM <= 1000000;\n\n'}
              {'-- 명시적 모니터링 (실행 시간 무관)\n'}
              {'SELECT /*+ MONITOR */ * FROM dual;'}
            </code>
          </div>
        </AlertDescription>
      </Alert>

      {/* Enterprise Edition 안내 */}
      {!selectedConnectionId || selectedConnectionId === 'all' ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>데이터베이스 선택 필요</AlertTitle>
          <AlertDescription>
            SQL Monitor 기능을 사용하려면 특정 Oracle 데이터베이스를 선택해주세요.
          </AlertDescription>
        </Alert>
      ) : error ? (
        <Alert variant="destructive">
          <Crown className="h-4 w-4" />
          <AlertTitle>SQL Monitor 사용 불가</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>SQL Monitor는 Oracle Enterprise Edition의 Tuning Pack 기능으로, DBMS_SQLTUNE 패키지를 통해 제공됩니다.</p>
            {error.message && (
              <p className="text-sm font-medium text-red-600">{error.message}</p>
            )}
            <div className="text-sm space-y-1 mt-2">
              {monitorData?.edition && (
                <p>현재 에디션: <span className="font-mono">{monitorData.edition}</span></p>
              )}
              {monitorData?.license && (
                <p>현재 라이센스: <span className="font-mono">{monitorData.license}</span></p>
              )}
            </div>
            <p className="text-sm">
              Enterprise Edition이 아니거나 CONTROL_MANAGEMENT_PACK_ACCESS 파라미터가 올바르게 설정되지 않았을 수 있습니다.
            </p>
            <p className="text-sm font-mono bg-background/50 p-2 rounded mt-2">
              ALTER SYSTEM SET CONTROL_MANAGEMENT_PACK_ACCESS='DIAGNOSTIC+TUNING' SCOPE=BOTH;
            </p>
            <div className="mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={runTest}
              >
                <AlertCircle className="h-4 w-4 mr-2" />
                SQL Monitor 진단 테스트 실행
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {/* 통계 카드 */}
          <div className="grid gap-4 md:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  총 SQL
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  실행 중
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{stats.executing}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  완료
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{stats.done}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  오류
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{stats.error}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  평균 실행 시간
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatDuration(stats.avgDuration)}</div>
              </CardContent>
            </Card>
          </div>

          {/* 필터 */}
          <Card>
            <CardHeader>
              <CardTitle>필터</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <Input
                  placeholder="사용자명 필터..."
                  value={usernameFilter}
                  onChange={(e) => setUsernameFilter(e.target.value)}
                />

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="상태" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 상태</SelectItem>
                    <SelectItem value="EXECUTING">실행 중</SelectItem>
                    <SelectItem value="DONE">완료</SelectItem>
                    <SelectItem value="ERROR">오류</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={autoRefresh ? 'text-green-600' : ''}
                >
                  {autoRefresh ? (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      자동 새로고침 ON
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      자동 새로고침 OFF
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => refetch()}
                  disabled={isFetching}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
                  새로고침
                </Button>

                <Button
                  variant="destructive"
                  onClick={() => clearSQLMonitor()}
                  disabled={isClearingData || !selectedConnectionId || selectedConnectionId === 'all'}
                >
                  {isClearingData ? (
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
            </CardContent>
          </Card>

          {/* SQL Monitor 목록 */}
          <Card>
            <CardHeader>
              <CardTitle>실시간 SQL 모니터링 ({entries.length}건)</CardTitle>
              <CardDescription>
                장시간 실행되는 SQL 및 병렬 처리 SQL 자동 모니터링 (5초마다 갱신)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={`monitor-skeleton-${i}`} className="h-24 w-full" />
                  ))}
                </div>
              ) : entries.length > 0 ? (
                <div className="space-y-4">
                  {entries.map((entry) => (
                    <div
                      key={`${entry.sql_id}-${entry.sql_exec_id}-${entry.sql_exec_start}`}
                      className={`border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer ${
                        entry.status === 'ERROR' ? 'bg-red-50 border-red-200' :
                        entry.status === 'EXECUTING' ? 'bg-blue-50 border-blue-200' : ''
                      }`}
                      onClick={() => setSelectedEntry(entry)}
                    >
                      {/* 헤더 */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <Badge variant={getStatusColor(entry.status)} className="gap-1">
                            {getStatusIcon(entry.status)}
                            {entry.status}
                          </Badge>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">SQL ID</span>
                            <code className="font-mono text-sm font-bold">{entry.sql_id}</code>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Exec ID</span>
                            <span className="font-mono text-sm">{entry.sql_exec_id}</span>
                          </div>
                          {entry.parallel_degree && entry.parallel_degree > 1 && (
                            <Badge variant="outline" className="gap-1">
                              <Database className="h-3 w-3" />
                              Parallel {entry.parallel_degree}
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            generateReportMutation.mutate({
                              sqlId: entry.sql_id,
                              execId: entry.sql_exec_id,
                            });
                          }}
                          disabled={generateReportMutation.isPending}
                        >
                          {generateReportMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Activity className="h-4 w-4 mr-1" />
                              상세 리포트
                            </>
                          )}
                        </Button>
                      </div>

                      {/* 정보 그리드 */}
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-sm mb-3">
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">사용자</div>
                          <div className="font-medium">{entry.username}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">시작 시간</div>
                          <div className="text-xs">
                            {format(new Date(entry.sql_exec_start), 'HH:mm:ss', { locale: ko })}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">실행 시간</div>
                          <div className="font-medium">{formatDuration(entry.duration)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">CPU 시간</div>
                          <div className="font-medium">{formatDuration(entry.cpu_time)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Buffer Gets</div>
                          <div className="font-medium">{entry.buffer_gets?.toLocaleString() || '0'}</div>
                        </div>
                      </div>

                      {/* 성능 지표 바 */}
                      {entry.status === 'EXECUTING' && entry.elapsed_time && entry.cpu_time && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground w-16">CPU</span>
                            <Progress
                              value={(entry.cpu_time / entry.elapsed_time) * 100}
                              className="flex-1 h-2"
                            />
                            <span className="text-xs font-mono">
                              {((entry.cpu_time / entry.elapsed_time) * 100).toFixed(1)}%
                            </span>
                          </div>
                          {entry.physical_read_bytes && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground w-16">I/O</span>
                              <span className="text-xs">
                                Read: {formatBytes(entry.physical_read_bytes)}
                              </span>
                              {entry.physical_write_bytes && (
                                <span className="text-xs">
                                  Write: {formatBytes(entry.physical_write_bytes)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* SQL 텍스트 미리보기 */}
                      {entry.sql_text && (
                        <div className="mt-3 p-2 bg-muted rounded text-xs font-mono truncate">
                          {entry.sql_text}
                        </div>
                      )}

                      {/* 에러 메시지 */}
                      {entry.error_message && (
                        <Alert variant="destructive" className="mt-3">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription className="text-xs">
                            {entry.error_message}
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-lg font-medium mb-2">현재 모니터링 중인 SQL이 없습니다.</p>
                  <div className="text-sm mb-4 space-y-2">
                    <p className="font-medium">Oracle SQL Monitor는 다음 조건의 SQL만 자동으로 캡처합니다:</p>
                    <ul className="space-y-1 inline-block text-left">
                      <li>• <strong>5초 이상의 CPU 시간</strong> 또는 <strong>5초 이상의 경과 시간</strong>을 소비하는 SQL</li>
                      <li>• 병렬 처리(PARALLEL) SQL</li>
                      <li>• /*+ MONITOR */ 힌트가 포함된 SQL (실행 시간 무관)</li>
                    </ul>
                  </div>
                  <div className="bg-muted/50 p-4 rounded-lg text-sm max-w-2xl mx-auto mt-4">
                    <p className="font-medium mb-2">💡 테스트 방법:</p>
                    <div className="text-left space-y-2">
                      <p>1. 간단한 테스트 (실행 시간 무관):</p>
                      <code className="block bg-background p-2 rounded text-xs">
                        SELECT /*+ MONITOR */ * FROM dual;
                      </code>
                      <p className="mt-3">2. 5초 이상 실행되는 쿼리:</p>
                      <code className="block bg-background p-2 rounded text-xs">
                        SELECT /*+ FULL(t) */ COUNT(*) FROM large_table t;
                      </code>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* SQL 상세 정보 다이얼로그 */}
      {selectedEntry && (
        <SQLMonitorDetailDialog
          entry={selectedEntry}
          open={!!selectedEntry}
          onClose={() => setSelectedEntry(null)}
          connectionId={selectedConnectionId!}
        />
      )}

      {/* SQL Monitor 리포트 다이얼로그 */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              SQL Monitor 상세 리포트
            </DialogTitle>
            <DialogDescription>
              DBMS_SQLTUNE.REPORT_SQL_MONITOR 패키지를 사용한 고급 성능 분석 리포트
            </DialogDescription>
          </DialogHeader>

          {reportData ? (
            <div className="space-y-4">
              {/* 리포트 정보 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-muted rounded-lg text-sm">
                <div>
                  <div className="text-muted-foreground text-xs mb-1">SQL ID</div>
                  <div className="font-mono font-semibold">{reportData.sql_id}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Exec ID</div>
                  <div className="font-mono font-semibold">{reportData.sql_exec_id}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-1">사용자</div>
                  <div className="font-semibold">{reportData.statistics?.username || '-'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs mb-1">실행 시간</div>
                  <div className="font-semibold">
                    {reportData.statistics?.elapsed_time_sec
                      ? `${reportData.statistics.elapsed_time_sec.toFixed(2)}s`
                      : '-'}
                  </div>
                </div>
              </div>

              {/* HTML 리포트 */}
              {reportData.reports?.html && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    HTML 리포트
                  </h3>
                  <div
                    className="border rounded-lg p-4 bg-white overflow-auto max-h-[500px]"
                    dangerouslySetInnerHTML={{ __html: reportData.reports.html }}
                  />
                </div>
              )}

              {/* TEXT 리포트 */}
              {reportData.reports?.text && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">TEXT 리포트</h3>
                  <pre className="border rounded-lg p-4 bg-muted text-xs overflow-auto max-h-[400px] whitespace-pre-wrap font-mono">
                    {reportData.reports.text}
                  </pre>
                </div>
              )}

              {/* 통계 정보 */}
              {reportData.statistics && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">실행 통계</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    {reportData.statistics.cpu_time_sec !== null && (
                      <div className="border rounded p-2">
                        <div className="text-muted-foreground text-xs mb-1">CPU 시간</div>
                        <div className="font-semibold">{reportData.statistics.cpu_time_sec.toFixed(2)}s</div>
                      </div>
                    )}
                    {reportData.statistics.buffer_gets !== null && (
                      <div className="border rounded p-2">
                        <div className="text-muted-foreground text-xs mb-1">Buffer Gets</div>
                        <div className="font-semibold">{reportData.statistics.buffer_gets.toLocaleString()}</div>
                      </div>
                    )}
                    {reportData.statistics.disk_reads !== null && (
                      <div className="border rounded p-2">
                        <div className="text-muted-foreground text-xs mb-1">Disk Reads</div>
                        <div className="font-semibold">{reportData.statistics.disk_reads.toLocaleString()}</div>
                      </div>
                    )}
                    {reportData.statistics.parallel_servers !== null && (
                      <div className="border rounded p-2">
                        <div className="text-muted-foreground text-xs mb-1">병렬 서버</div>
                        <div className="font-semibold">{reportData.statistics.parallel_servers}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              리포트 데이터를 불러올 수 없습니다.
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 테스트 결과 다이얼로그 */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              SQL Monitor 진단 테스트 결과
            </DialogTitle>
            <DialogDescription>
              SQL Monitor 기능 사용을 위한 시스템 요구사항 검증
            </DialogDescription>
          </DialogHeader>

          {testResults && (
            <div className="space-y-4">
              {/* 요약 */}
              {testResults.summary && (
                <Alert variant={testResults.summary.canUseSQLMonitor ? 'default' : 'destructive'}>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {testResults.summary.canUseSQLMonitor ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600" />
                      )}
                      <span className="font-semibold">
                        SQL Monitor {testResults.summary.canUseSQLMonitor ? '사용 가능' : '사용 불가'}
                      </span>
                    </div>
                    <div className="text-sm">
                      테스트 결과: {testResults.summary.successful}/{testResults.summary.totalTests} 성공
                    </div>
                    {testResults.summary.issues && testResults.summary.issues.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="text-sm font-medium">❌ 문제점:</div>
                        {testResults.summary.issues.map((issue: string, idx: number) => (
                          <div key={`issue-${idx}`} className="text-sm text-red-600">• {issue}</div>
                        ))}
                      </div>
                    )}
                    {testResults.summary.warnings && testResults.summary.warnings.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="text-sm font-medium">⚠️ 경고:</div>
                        {testResults.summary.warnings.map((warning: string, idx: number) => (
                          <div key={`warning-${idx}`} className="text-sm text-yellow-600">• {warning}</div>
                        ))}
                      </div>
                    )}
                    {testResults.summary.dataStatistics && (
                      <div className="mt-3 p-3 bg-muted rounded text-sm">
                        <div className="font-medium mb-2">📊 V$SQL_MONITOR 데이터 통계 (최근 24시간):</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>총 데이터: <span className="font-mono">{testResults.summary.dataStatistics.total}</span></div>
                          <div>5초 이상 경과 시간: <span className="font-mono">{testResults.summary.dataStatistics.fiveSecElapsed}</span></div>
                          <div>5초 이상 CPU 시간: <span className="font-mono">{testResults.summary.dataStatistics.fiveSecCPU}</span></div>
                          <div>병렬 처리: <span className="font-mono">{testResults.summary.dataStatistics.parallel}</span></div>
                        </div>
                      </div>
                    )}
                    {testResults.summary.lastHourStatistics && (
                      <div className="mt-2 p-3 bg-muted rounded text-sm">
                        <div className="font-medium mb-2">📊 최근 1시간 통계:</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>총 데이터: <span className="font-mono">{testResults.summary.lastHourStatistics.total}</span></div>
                          <div>5초 이상 실행: <span className="font-mono">{testResults.summary.lastHourStatistics.fiveSecElapsed}</span></div>
                          <div className="col-span-2">최대 실행 시간: <span className="font-mono">{testResults.summary.lastHourStatistics.maxElapsedSec}초</span></div>
                        </div>
                      </div>
                    )}
                  </div>
                </Alert>
              )}

              {/* 상세 테스트 결과 */}
              <div className="space-y-3">
                {testResults.tests?.map((test: any, idx: number) => (
                  <div key={idx} className="border rounded-lg p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {test.status === 'success' ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                        <span className="font-medium text-sm">{test.test}</span>
                      </div>
                      <Badge variant={test.status === 'success' ? 'default' : 'destructive'}>
                        {test.status}
                      </Badge>
                    </div>

                    {test.error && (
                      <div className="text-xs text-red-600 font-mono bg-red-50 p-2 rounded">
                        {test.error}
                      </div>
                    )}

                    {test.result && (
                      <div className="text-xs space-y-1 mt-2">
                        <pre className="bg-muted p-2 rounded overflow-x-auto">
                          {JSON.stringify(test.result, null, 2)}
                        </pre>
                      </div>
                    )}

                    {test.isEnterprise !== undefined && (
                      <div className="text-xs mt-1">
                        Enterprise Edition: {test.isEnterprise ? '✅' : '❌'}
                      </div>
                    )}

                    {test.isDiagnosticTuning !== undefined && (
                      <div className="text-xs mt-1">
                        Diagnostic+Tuning License: {test.isDiagnosticTuning ? '✅' : '❌'}
                      </div>
                    )}

                    {test.privileges && (
                      <div className="text-xs mt-2">
                        <div className="font-medium mb-1">권한:</div>
                        <div className="space-y-1">
                          {test.privileges.map((priv: any, pidx: number) => (
                            <div key={pidx} className="font-mono">
                              • {priv.PRIVILEGE}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {test.samples && test.samples.length > 0 && (
                      <div className="text-xs mt-2">
                        <div className="font-medium mb-1">샘플 데이터 ({test.count}건):</div>
                        <div className="space-y-2">
                          {test.samples.slice(0, 5).map((sample: any, sidx: number) => (
                            <div key={`sample-${idx}-${sidx}`} className="bg-muted p-2 rounded border text-xs">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-mono font-semibold">{sample.SQL_ID}</span>
                                <Badge variant="outline" className="text-xs h-5">
                                  {sample.STATUS}
                                </Badge>
                                {sample.CAPTURE_REASON && (
                                  <Badge
                                    variant={sample.CAPTURE_REASON.includes('5s') ? 'default' : 'secondary'}
                                    className="text-xs h-5"
                                  >
                                    {sample.CAPTURE_REASON}
                                  </Badge>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground mt-1">
                                <div>실행 시간: <span className="font-mono">{sample.ELAPSED_SEC || 0}초</span></div>
                                <div>CPU: <span className="font-mono">{sample.CPU_SEC || 0}초</span></div>
                                {sample.USERNAME && <div className="col-span-2">사용자: {sample.USERNAME}</div>}
                                {sample.MODULE && <div className="col-span-2 truncate">모듈: {sample.MODULE}</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// SQL Monitor 상세 정보 다이얼로그
interface SQLMonitorDetailDialogProps {
  entry: SQLMonitorEntry;
  open: boolean;
  onClose: () => void;
  connectionId: string;
}

function SQLMonitorDetailDialog({
  entry,
  open,
  onClose,
  connectionId,
}: SQLMonitorDetailDialogProps) {
  const { data: detailData, isLoading } = useQuery({
    queryKey: ['sql-monitor-detail', entry.sql_id, entry.sql_exec_id, connectionId],
    queryFn: async () => {
      const params = new URLSearchParams({
        connection_id: connectionId,
        sql_id: entry.sql_id,
        sql_exec_id: entry.sql_exec_id.toString(),
      });
      const res = await fetch(`/api/monitoring/sql-monitor/detail?${params}`);
      if (!res.ok) throw new Error('Failed to fetch SQL Monitor detail');
      return res.json();
    },
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            SQL Monitor 상세 정보
          </DialogTitle>
          <DialogDescription>
            SQL ID: {entry.sql_id} | Execution ID: {entry.sql_exec_id}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : detailData ? (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">개요</TabsTrigger>
              <TabsTrigger value="plan">실행 계획</TabsTrigger>
              <TabsTrigger value="statistics">통계</TabsTrigger>
              <TabsTrigger value="activity">활동</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">상태</div>
                  <Badge variant={getStatusColor(entry.status)}>
                    {entry.status}
                  </Badge>
                </div>
                <div>
                  <div className="text-muted-foreground">사용자</div>
                  <div className="font-medium">{entry.username}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">모듈</div>
                  <div className="font-medium">{entry.module || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">서비스</div>
                  <div className="font-medium">{entry.service_name || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">병렬 처리</div>
                  <div className="font-medium">
                    {entry.parallel_degree && entry.parallel_degree > 1
                      ? `DOP ${entry.parallel_degree}`
                      : 'No'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Plan Hash</div>
                  <div className="font-mono text-sm">{entry.plan_hash_value || 'N/A'}</div>
                </div>
              </div>

              {entry.sql_text && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">SQL 텍스트</h4>
                  <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-xs">
                    {entry.sql_text}
                  </pre>
                </div>
              )}
            </TabsContent>

            <TabsContent value="plan" className="space-y-4">
              {detailData?.data?.plan ? (
                <div className="bg-muted p-4 rounded-lg overflow-x-auto">
                  <pre className="text-xs font-mono">
                    {detailData.data.plan}
                  </pre>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  실행 계획 정보가 없습니다.
                </p>
              )}
            </TabsContent>

            <TabsContent value="statistics" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">실행 시간</div>
                  <div className="font-medium">
                    {formatDuration(entry.elapsed_time)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">CPU 시간</div>
                  <div className="font-medium">
                    {formatDuration(entry.cpu_time)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Buffer Gets</div>
                  <div className="font-medium">
                    {entry.buffer_gets?.toLocaleString() || '0'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Disk Reads</div>
                  <div className="font-medium">
                    {entry.disk_reads?.toLocaleString() || '0'}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Physical Read</div>
                  <div className="font-medium">
                    {formatBytes(entry.physical_read_bytes)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Physical Write</div>
                  <div className="font-medium">
                    {formatBytes(entry.physical_write_bytes)}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="activity" className="space-y-4">
              {detailData?.data?.activity ? (
                <div className="space-y-4">
                  {/* 활동 차트 또는 타임라인 */}
                  <p className="text-sm text-muted-foreground">
                    SQL 실행 활동 타임라인 및 대기 이벤트 분석
                  </p>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  활동 정보가 없습니다.
                </p>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            상세 정보를 불러올 수 없습니다.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// 상태별 색상 헬퍼 함수
function getStatusColor(status: string): "default" | "secondary" | "destructive" | "outline" | "success" {
  switch (status) {
    case 'EXECUTING': return 'default';
    case 'DONE': return 'secondary';  // 'success'를 지원하지 않으므로 secondary 사용
    case 'ERROR': return 'destructive';
    default: return 'outline';
  }
}

// 상태별 아이콘 헬퍼 함수
function getStatusIcon(status: string) {
  switch (status) {
    case 'EXECUTING': return <Play className="h-3 w-3" />;
    case 'DONE': return <CheckCircle className="h-3 w-3" />;
    case 'ERROR': return <XCircle className="h-3 w-3" />;
    default: return <AlertCircle className="h-3 w-3" />;
  }
}

// 실행 시간 포맷팅 헬퍼 함수
function formatDuration(ms?: number) {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// 바이트 포맷팅 헬퍼 함수
function formatBytes(bytes?: number) {
  if (!bytes) return '0';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}