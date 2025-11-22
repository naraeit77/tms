'use client';

/**
 * DBMS_STATS Statistics Collection Page
 * Oracle DBMS_STATS 패키지를 이용한 통계정보 수집 및 관리
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RefreshCw,
  BarChart4,
  Table as TableIcon,
  Database,
  AlertCircle,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Info,
  TrendingUp,
  Eye,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface TableStats {
  owner: string;
  table_name: string;
  num_rows: number | null;
  blocks: number | null;
  avg_row_len: number | null;
  last_analyzed: string | null;
  stale_stats: string;
  stattype_locked: string | null;
}

interface StatsHistory {
  id: string;
  oracle_connection_id: string;
  owner: string;
  table_name: string;
  operation: string;
  status: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS';
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  error_message: string | null;
  created_at: string;
}

interface GatherStatsRequest {
  connection_id: string;
  owner: string;
  table_name: string;
  estimate_percent?: number;
  cascade?: boolean;
  degree?: number;
  method_opt?: string;
}

export default function StatsCollectionPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [gatherDialogOpen, setGatherDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);

  // 검색 입력 필드 state (사용자가 타이핑하는 값)
  const [searchOwnerInput, setSearchOwnerInput] = useState('');
  const [searchTableInput, setSearchTableInput] = useState('');

  // 실제 검색에 사용되는 state (검색 버튼 클릭 시 업데이트)
  const [searchOwner, setSearchOwner] = useState('');
  const [searchTable, setSearchTable] = useState('');

  // Gather stats options
  const [estimatePercent, setEstimatePercent] = useState<number>(10);
  const [cascade, setCascade] = useState<boolean>(true);
  const [degree, setDegree] = useState<number>(4);

  const effectiveConnectionId = selectedConnectionId || 'all';

  // 테이블 통계 정보 조회
  const { data: tablesData, isLoading: isLoadingTables, refetch: refetchTables, error: tablesError } = useQuery({
    queryKey: ['table-stats', effectiveConnectionId, searchOwner, searchTable],
    queryFn: async () => {
      if (effectiveConnectionId === 'all') {
        return { data: [] };
      }
      const params = new URLSearchParams({
        connection_id: effectiveConnectionId,
        ...(searchOwner && { owner: searchOwner.toUpperCase() }),
        ...(searchTable && { table_name: searchTable.toUpperCase() }),
      });
      const res = await fetch(`/api/monitoring/stats/tables?${params}`);
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: '테이블 통계 조회 실패' }));
        throw new Error(error.details || error.error || '테이블 통계 조회 실패');
      }
      return res.json();
    },
    enabled: effectiveConnectionId !== 'all',
    retry: 1,
  });

  const tables: TableStats[] = Array.isArray(tablesData?.data) ? tablesData.data : [];

  // 통계 수집 이력 조회
  const { data: historyData, isLoading: isLoadingHistory, refetch: refetchHistory } = useQuery({
    queryKey: ['stats-history', effectiveConnectionId],
    queryFn: async () => {
      if (effectiveConnectionId === 'all') {
        return { data: [] };
      }
      const params = new URLSearchParams({ connection_id: effectiveConnectionId });
      const res = await fetch(`/api/monitoring/stats/history?${params}`);
      if (!res.ok) throw new Error('통계 수집 이력 조회 실패');
      return res.json();
    },
    enabled: effectiveConnectionId !== 'all',
    refetchInterval: 5000, // Poll every 5 seconds for in-progress stats
  });

  const history: StatsHistory[] = historyData?.data || [];

  // 통계 수집 Mutation
  const gatherStatsMutation = useMutation({
    mutationFn: async (request: GatherStatsRequest) => {
      const res = await fetch('/api/monitoring/stats/gather', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.details || '통계 수집 실패');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: '통계 수집 시작',
        description: '통계 수집이 시작되었습니다. 이력에서 진행 상황을 확인하세요.',
      });
      setGatherDialogOpen(false);
      setSelectedTables([]);
      refetchHistory();
      setTimeout(() => refetchTables(), 1000);
    },
    onError: (error: Error) => {
      toast({
        title: '통계 수집 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // 테이블 선택/해제
  const toggleTable = (owner: string, tableName: string) => {
    const key = `${owner}.${tableName}`;
    setSelectedTables((prev) => {
      if (prev.includes(key)) {
        return prev.filter((t) => t !== key);
      } else {
        return [...prev, key];
      }
    });
  };

  // 통계 수집 실행
  const handleGatherStats = () => {
    if (effectiveConnectionId === 'all') {
      toast({
        title: 'DB 연결 선택 필요',
        description: 'DB 연결을 선택한 후 통계를 수집할 수 있습니다.',
        variant: 'destructive',
      });
      return;
    }

    if (selectedTables.length === 0) {
      toast({
        title: '테이블 선택 필요',
        description: '통계를 수집할 테이블을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    setGatherDialogOpen(true);
  };

  // 실제 통계 수집 실행
  const executeGatherStats = async () => {
    for (const tableKey of selectedTables) {
      const [owner, table_name] = tableKey.split('.');
      await gatherStatsMutation.mutateAsync({
        connection_id: effectiveConnectionId,
        owner,
        table_name,
        estimate_percent: estimatePercent,
        cascade,
        degree,
        method_opt: 'FOR ALL COLUMNS SIZE AUTO',
      });
    }
  };

  // 검색 핸들러
  const handleSearch = () => {
    setSearchOwner(searchOwnerInput);
    setSearchTable(searchTableInput);
  };

  // 검색 초기화
  const handleResetSearch = () => {
    setSearchOwnerInput('');
    setSearchTableInput('');
    setSearchOwner('');
    setSearchTable('');
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">통계정보 수집</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Oracle DBMS_STATS 패키지를 이용한 테이블 통계정보 수집 및 관리
          </p>
          {selectedConnection && (
            <p className="text-sm text-muted-foreground mt-1">
              연결: <span className="font-medium">{selectedConnection.name}</span> ({selectedConnection.host}:{selectedConnection.port})
            </p>
          )}
        </div>
      </div>

      {/* 안내 메시지 */}
      {effectiveConnectionId === 'all' && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-yellow-900">DB 연결을 선택해주세요</h3>
                <p className="text-sm text-yellow-700 mt-1">
                  통계정보 수집 기능을 사용하려면 상단 헤더에서 Oracle DB 연결을 선택해야 합니다.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* DBMS_STATS 정보 카드 */}
      <Card>
        <CardHeader>
          <CardTitle>DBMS_STATS란?</CardTitle>
          <CardDescription>
            Oracle의 옵티마이저가 효율적인 실행 계획을 생성하기 위한 통계정보 수집 패키지
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">주요 기능</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>테이블 및 인덱스 통계 수집</li>
                <li>히스토그램 생성으로 데이터 분포 분석</li>
                <li>병렬 처리로 빠른 통계 수집</li>
                <li>오래된(Stale) 통계 자동 감지</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">권장 수집 시점</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>대량의 데이터 변경 후</li>
                <li>테이블 구조 변경 후</li>
                <li>SQL 성능 저하 발생 시</li>
                <li>통계가 오래되었거나(Stale) 없는 경우</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 검색 필터 */}
      <Card>
        <CardHeader>
          <CardTitle>테이블 검색</CardTitle>
          <CardDescription>Owner와 테이블명으로 검색</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="owner">Owner</Label>
              <Input
                id="owner"
                placeholder="예: SEO"
                value={searchOwnerInput}
                onChange={(e) => setSearchOwnerInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="table">Table Name</Label>
              <Input
                id="table"
                placeholder="예: INVENTORIES"
                value={searchTableInput}
                onChange={(e) => setSearchTableInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={handleSearch} disabled={effectiveConnectionId === 'all'}>
                <RefreshCw className="h-4 w-4 mr-2" />
                검색
              </Button>
              <Button variant="outline" onClick={handleResetSearch}>
                초기화
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 테이블 통계 목록 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>테이블 통계 현황</CardTitle>
              <CardDescription className="mt-1">
                {selectedTables.length > 0 && (
                  <span className="text-primary font-medium">
                    {selectedTables.length}개 선택됨
                  </span>
                )}
                {selectedTables.length === 0 && '통계를 수집할 테이블을 선택하세요'}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleGatherStats}
                disabled={selectedTables.length === 0 || effectiveConnectionId === 'all'}
              >
                <Play className="h-4 w-4 mr-2" />
                통계 수집
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setHistoryDialogOpen(true)}
                disabled={effectiveConnectionId === 'all'}
              >
                <Clock className="h-4 w-4 mr-2" />
                수집 이력
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchTables()}
                disabled={effectiveConnectionId === 'all'}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                새로고침
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingTables ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={`table-skeleton-${i}`} className="h-16 w-full" />
              ))}
            </div>
          ) : tables.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">선택</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Table Name</TableHead>
                    <TableHead className="text-right">행 수</TableHead>
                    <TableHead className="text-right">블록 수</TableHead>
                    <TableHead className="text-right">평균 행 길이</TableHead>
                    <TableHead>마지막 분석</TableHead>
                    <TableHead>상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tables.map((table) => {
                    const key = `${table.owner}.${table.table_name}`;
                    const isStale = table.stale_stats === 'YES';
                    const isLocked = table.stattype_locked !== null;

                    return (
                      <TableRow
                        key={key}
                        className={`cursor-pointer ${selectedTables.includes(key) ? 'bg-blue-50' : 'hover:bg-accent'}`}
                        onClick={() => toggleTable(table.owner, table.table_name)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedTables.includes(key)}
                            onChange={() => toggleTable(table.owner, table.table_name)}
                            className="h-4 w-4 cursor-pointer"
                          />
                        </TableCell>
                        <TableCell className="font-medium">{table.owner}</TableCell>
                        <TableCell className="font-mono text-sm">{table.table_name}</TableCell>
                        <TableCell className="text-right">
                          {table.num_rows != null ? table.num_rows.toLocaleString() : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {table.blocks != null ? table.blocks.toLocaleString() : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {table.avg_row_len != null ? table.avg_row_len.toLocaleString() : '-'}
                        </TableCell>
                        <TableCell>
                          {table.last_analyzed
                            ? format(new Date(table.last_analyzed), 'yyyy-MM-dd HH:mm', { locale: ko })
                            : '미분석'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {isStale && (
                              <Badge variant="destructive" className="text-xs">
                                Stale
                              </Badge>
                            )}
                            {isLocked && (
                              <Badge variant="secondary" className="text-xs">
                                Locked
                              </Badge>
                            )}
                            {!isStale && !isLocked && table.last_analyzed && (
                              <Badge variant="default" className="text-xs">
                                OK
                              </Badge>
                            )}
                            {!table.last_analyzed && (
                              <Badge variant="outline" className="text-xs">
                                미분석
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">테이블이 없습니다</p>
              <p className="text-sm mt-2">검색 조건을 변경하거나 DB 연결을 확인하세요</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 통계 수집 옵션 다이얼로그 */}
      <Dialog open={gatherDialogOpen} onOpenChange={setGatherDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>통계 수집 설정</DialogTitle>
            <DialogDescription>
              선택한 {selectedTables.length}개 테이블의 통계를 수집합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="estimate">샘플링 비율 (%)</Label>
              <Input
                id="estimate"
                type="number"
                min="1"
                max="100"
                value={estimatePercent}
                onChange={(e) => setEstimatePercent(parseInt(e.target.value) || 10)}
              />
              <p className="text-xs text-muted-foreground">
                10% 권장. 100%는 전체 스캔으로 느릴 수 있습니다.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="degree">병렬도 (Degree)</Label>
              <Input
                id="degree"
                type="number"
                min="1"
                max="16"
                value={degree}
                onChange={(e) => setDegree(parseInt(e.target.value) || 4)}
              />
              <p className="text-xs text-muted-foreground">
                CPU 코어 수를 고려하여 설정하세요.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="cascade"
                checked={cascade}
                onChange={(e) => setCascade(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="cascade" className="cursor-pointer">
                인덱스 통계도 함께 수집 (CASCADE)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGatherDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={executeGatherStats} disabled={gatherStatsMutation.isPending}>
              {gatherStatsMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  수집 중...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  통계 수집 시작
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 통계 수집 이력 다이얼로그 */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>통계 수집 이력</DialogTitle>
            <DialogDescription>
              최근 통계 수집 작업의 이력과 상태를 확인합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[70vh]">
            {isLoadingHistory ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={`history-skeleton-${i}`} className="h-16 w-full" />
                ))}
              </div>
            ) : history.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Owner.Table</TableHead>
                      <TableHead>작업</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead>시작 시간</TableHead>
                      <TableHead>완료 시간</TableHead>
                      <TableHead className="text-right">소요 시간</TableHead>
                      <TableHead>오류 메시지</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-sm">
                          {item.owner}.{item.table_name}
                        </TableCell>
                        <TableCell>{item.operation}</TableCell>
                        <TableCell>
                          {item.status === 'SUCCESS' && (
                            <Badge variant="default" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              성공
                            </Badge>
                          )}
                          {item.status === 'FAILED' && (
                            <Badge variant="destructive" className="gap-1">
                              <XCircle className="h-3 w-3" />
                              실패
                            </Badge>
                          )}
                          {item.status === 'IN_PROGRESS' && (
                            <Badge variant="secondary" className="gap-1">
                              <RefreshCw className="h-3 w-3 animate-spin" />
                              진행중
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {format(new Date(item.start_time), 'yyyy-MM-dd HH:mm:ss', { locale: ko })}
                        </TableCell>
                        <TableCell>
                          {item.end_time
                            ? format(new Date(item.end_time), 'yyyy-MM-dd HH:mm:ss', { locale: ko })
                            : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.duration_seconds !== null ? `${item.duration_seconds}초` : '-'}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-xs">
                          {item.error_message || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-lg font-medium">통계 수집 이력이 없습니다</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryDialogOpen(false)}>
              닫기
            </Button>
            <Button onClick={() => refetchHistory()} disabled={effectiveConnectionId === 'all'}>
              <RefreshCw className="h-4 w-4 mr-2" />
              새로고침
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
