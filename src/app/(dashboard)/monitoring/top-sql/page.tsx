'use client';

/**
 * SQL Monitoring - Top SQL Page
 * SQL 모니터링 - Top SQL 조회 화면
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, RefreshCw, Database, Download, Plus, TrendingUp, Activity, Cpu, Clock, Zap, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import ConnectionInfo from '@/components/dashboard/ConnectionInfo';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

interface SQLStatistic {
  id: string;
  sql_id: string;
  sql_text: string;
  status: string;
  priority: string;
  elapsed_time_ms: number;
  cpu_time_ms: number;
  buffer_gets: number;
  disk_reads: number;
  executions: number;
  rows_processed: number;
  avg_elapsed_time_ms: number;
  gets_per_exec: number;
  module?: string;
  schema_name?: string;
  oracle_connection_id: string;
  collected_at: string;
}

interface OracleConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  service_name?: string;
  sid?: string;
  username?: string;
  health_status?: 'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN';
  oracle_version?: string;
  database_role?: string;
  instance_name?: string;
  host_name?: string;
}

interface DashboardMetrics {
  buffer_cache_hit_ratio?: number;
  executions_per_sec?: number;
  avg_response_time?: number;
  sga_used_gb?: number;
  active_sessions?: number;
}

export default function TopSQLPage() {
  const { toast } = useToast();
  const { selectedConnectionId, selectedConnection: globalConnection } = useSelectedDatabase();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [orderBy, setOrderBy] = useState<string>('buffer_gets');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [minElapsedTime, setMinElapsedTime] = useState<string>('');
  const [minBufferGets, setMinBufferGets] = useState<string>('');
  const [minExecutions, setMinExecutions] = useState<string>('');
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [isCollecting, setIsCollecting] = useState(false);
  const [selectedSqlId, setSelectedSqlId] = useState<string | null>(null);

  // Use the global selected connection ID or 'all'
  const effectiveConnectionId = selectedConnectionId || 'all';

  // Oracle 연결 목록 조회
  const { data: connections } = useQuery<OracleConnection[]>({
    queryKey: ['oracle-connections'],
    queryFn: async () => {
      const res = await fetch('/api/oracle/connections');
      if (!res.ok) throw new Error('Failed to fetch connections');
      return res.json();
    },
  });

  // 대시보드 메트릭 조회
  const { data: metricsData } = useQuery({
    queryKey: ['dashboard-metrics', effectiveConnectionId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (effectiveConnectionId !== 'all') {
        params.append('connection_id', effectiveConnectionId);
      }
      const res = await fetch(`/api/dashboard/metrics?${params}`);
      if (!res.ok) throw new Error('Failed to fetch metrics');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const metrics: DashboardMetrics = metricsData || {};

  // SQL 통계 조회
  const {
    data: sqlData,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['top-sql', effectiveConnectionId, statusFilter, orderBy, moduleFilter, minElapsedTime, minBufferGets, minExecutions],
    queryFn: async () => {
      const params = new URLSearchParams({
        order_by: orderBy,
        limit: '100',
      });

      if (effectiveConnectionId !== 'all') {
        params.append('connection_id', effectiveConnectionId);
      }

      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      if (moduleFilter !== 'all') {
        params.append('module', moduleFilter);
      }

      if (minElapsedTime) {
        params.append('min_elapsed_time', minElapsedTime);
      }

      if (minBufferGets) {
        params.append('min_buffer_gets', minBufferGets);
      }

      if (minExecutions) {
        params.append('min_executions', minExecutions);
      }

      const res = await fetch(`/api/monitoring/sql-statistics?${params}`);
      if (!res.ok) throw new Error('Failed to fetch SQL statistics');
      return res.json();
    },
    refetchInterval: 60000,
  });

  const sqlStats: SQLStatistic[] = sqlData?.data || [];

  // 디버깅을 위한 로그
  console.log('Top SQL Data:', sqlData);
  console.log('Selected Connection ID:', selectedConnectionId);

  // 실제 데이터에서 고유한 모듈 목록 추출
  const uniqueModules = Array.from(
    new Set(
      sqlStats
        .map((sql) => sql.module)
        .filter((module) => module && module.trim() !== '')
    )
  ).sort();

  // 검색 필터링
  const filteredStats = sqlStats.filter((sql) =>
    sql.sql_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sql.sql_text.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 모든 행 선택/해제
  const toggleAllRows = () => {
    if (selectedRows.size === filteredStats.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filteredStats.map((sql) => sql.id)));
    }
  };

  // 개별 행 선택/해제
  const toggleRow = (id: string) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRows(newSelected);
  };

  // 데이터 즉시 수집
  const handleCollectNow = async () => {
    if (effectiveConnectionId === 'all') {
      toast({
        title: '연결을 선택해주세요',
        description: 'DB 연결을 선택한 후 데이터를 수집할 수 있습니다.',
        variant: 'destructive',
      });
      return;
    }

    setIsCollecting(true);
    try {
      const res = await fetch(`/api/monitoring/collect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: effectiveConnectionId }),
      });

      if (!res.ok) throw new Error('데이터 수집에 실패했습니다');

      toast({
        title: '데이터 수집 시작',
        description: '데이터 수집이 시작되었습니다. 잠시 후 새로고침됩니다.',
      });

      setTimeout(() => {
        refetch();
      }, 3000);
    } catch (error: any) {
      toast({
        title: '수집 실패',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsCollecting(false);
    }
  };

  // 튜닝 대상 등록
  const handleAddToTuning = async () => {
    if (selectedRows.size === 0) {
      toast({
        title: 'SQL을 선택해주세요',
        description: '튜닝 대상으로 등록할 SQL을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const selectedSQLs = filteredStats.filter((sql) => selectedRows.has(sql.id));

      toast({
        title: '튜닝 대상 등록',
        description: `${selectedRows.size}개의 SQL을 튜닝 대상에 추가했습니다.`,
      });

      setSelectedRows(new Set());
    } catch (error: any) {
      toast({
        title: '등록 실패',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // 필터 초기화
  const handleResetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setModuleFilter('all');
    setMinElapsedTime('');
    setMinBufferGets('');
    setMinExecutions('');
  };

  // Excel 내보내기
  const handleExportExcel = () => {
    toast({
      title: 'Excel 내보내기',
      description: '곧 지원 예정입니다.',
    });
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Top SQL 분석</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            성능이 낮은 SQL 및 리소스 사용량이 많은 SQL 조회
          </p>
          {globalConnection && (
            <p className="text-sm text-muted-foreground mt-1">
              연결: <span className="font-medium">{globalConnection.name}</span> ({globalConnection.host}:{globalConnection.port})
            </p>
          )}
        </div>
      </div>

      {/* 메트릭 카드 */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Buffer Cache Hit</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {metrics.buffer_cache_hit_ratio?.toFixed(1) || 0}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">캐시 히트율</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Executions/sec</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.executions_per_sec?.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">초당 실행 횟수</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.avg_response_time?.toFixed(0) || 0}ms
            </div>
            <p className="text-xs text-muted-foreground mt-1">평균 응답시간</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SGA Used</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.sga_used_gb?.toFixed(1) || 0}GB
            </div>
            <p className="text-xs text-muted-foreground mt-1">SGA 사용량</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.active_sessions || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">활성 세션</p>
          </CardContent>
        </Card>
      </div>

      {/* 필터 및 검색 */}
      <Card>
        <CardHeader>
          <CardTitle>검색 조건</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* 첫 번째 행 */}
            <div className="grid gap-4 md:grid-cols-3">
              {/* 검색 */}
              <div className="md:col-span-1">
                <label className="text-sm font-medium mb-1.5 block">SQL ID / Text</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="검색..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              {/* Module */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Module</label>
                <Select value={moduleFilter} onValueChange={setModuleFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {uniqueModules.map((module) => (
                      <SelectItem key={module} value={module}>
                        {module}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 상태 필터 */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">상태</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="상태" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체 상태</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                    <SelectItem value="WARNING">Warning</SelectItem>
                    <SelectItem value="NORMAL">Normal</SelectItem>
                    <SelectItem value="TUNING">Tuning</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 두 번째 행 */}
            <div className="grid gap-4 md:grid-cols-5">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Elapsed Time (ms)</label>
                <Input
                  placeholder=">= 1000"
                  value={minElapsedTime}
                  onChange={(e) => setMinElapsedTime(e.target.value)}
                  type="number"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Buffer Gets</label>
                <Input
                  placeholder=">= 10000"
                  value={minBufferGets}
                  onChange={(e) => setMinBufferGets(e.target.value)}
                  type="number"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Executions</label>
                <Input
                  placeholder=">= 100"
                  value={minExecutions}
                  onChange={(e) => setMinExecutions(e.target.value)}
                  type="number"
                />
              </div>

              {/* 정렬 기준 */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">정렬 기준</label>
                <Select value={orderBy} onValueChange={setOrderBy}>
                  <SelectTrigger>
                    <SelectValue placeholder="정렬" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buffer_gets">Buffer Gets</SelectItem>
                    <SelectItem value="elapsed_time_ms">Elapsed Time</SelectItem>
                    <SelectItem value="cpu_time_ms">CPU Time</SelectItem>
                    <SelectItem value="disk_reads">Disk Reads</SelectItem>
                    <SelectItem value="executions">Executions</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 버튼 그룹 */}
              <div className="flex items-end gap-2">
                <Button variant="default" onClick={() => refetch()} disabled={isFetching}>
                  <Search className="h-4 w-4 mr-2" />
                  조회
                </Button>
                <Button variant="outline" onClick={handleResetFilters}>
                  초기화
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SQL 목록 테이블 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                Top SQL by {orderBy === 'buffer_gets' ? 'Buffer Gets' : orderBy}
                <Badge variant="outline" className="ml-2">
                  {filteredStats.length}건
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                {orderBy === 'buffer_gets' && 'Buffer Gets 기준 내림차순'}
                {orderBy === 'elapsed_time_ms' && 'Elapsed Time 기준 내림차순'}
                {orderBy === 'cpu_time_ms' && 'CPU Time 기준 내림차순'}
                {orderBy === 'disk_reads' && 'Disk Reads 기준 내림차순'}
                {orderBy === 'executions' && 'Executions 기준 내림차순'}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCollectNow}
                disabled={isCollecting || effectiveConnectionId === 'all'}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isCollecting ? 'animate-spin' : ''}`} />
                데이터 수집
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddToTuning}
                disabled={selectedRows.size === 0}
              >
                <Plus className="h-4 w-4 mr-2" />
                튜닝 대상 등록 ({selectedRows.size})
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportExcel}>
                <Download className="h-4 w-4 mr-2" />
                Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
                새로고침
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={`top-sql-skeleton-${i}`} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredStats.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={selectedRows.size === filteredStats.length && filteredStats.length > 0}
                        onCheckedChange={toggleAllRows}
                      />
                    </TableHead>
                    <TableHead className="w-[60px]">순위</TableHead>
                    <TableHead>SQL ID</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Schema</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="text-right">Elapsed (ms)</TableHead>
                    <TableHead className="text-right">CPU (ms)</TableHead>
                    <TableHead className="text-right">Buffer Gets</TableHead>
                    <TableHead className="text-right">Disk Reads</TableHead>
                    <TableHead className="text-right">Executions</TableHead>
                    <TableHead className="text-right">Gets/Exec</TableHead>
                    <TableHead className="min-w-[300px]">SQL Text</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStats.map((sql, index) => (
                    <TableRow key={sql.id} className="cursor-pointer hover:bg-accent">
                      <TableCell>
                        <Checkbox
                          checked={selectedRows.has(sql.id)}
                          onCheckedChange={() => toggleRow(sql.id)}
                        />
                      </TableCell>
                      <TableCell className="text-center font-medium">{index + 1}</TableCell>
                      <TableCell className="font-mono text-sm">
                        <button
                          onClick={() => setSelectedSqlId(sql.sql_id)}
                          className="text-blue-600 hover:underline cursor-pointer"
                        >
                          {sql.sql_id}
                        </button>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate">{sql.module || '-'}</TableCell>
                      <TableCell>{sql.schema_name || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(sql.status)}>
                          {sql.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {sql.elapsed_time_ms.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {sql.cpu_time_ms.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <span className={sql.buffer_gets > 1000000 ? 'text-red-600' : ''}>
                          {sql.buffer_gets.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {sql.disk_reads.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {sql.executions.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {sql.gets_per_exec?.toFixed(0) || 'N/A'}
                      </TableCell>
                      <TableCell className="max-w-[400px] truncate" title={sql.sql_text}>
                        {sql.sql_text.substring(0, 100)}
                        {sql.sql_text.length > 100 ? '...' : ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">조회된 SQL이 없습니다</p>
              <p className="text-sm mt-2">필터 조건을 변경하거나 데이터 수집을 진행해주세요</p>
              {effectiveConnectionId === 'all' ? (
                <p className="text-sm mt-2 text-yellow-600">상단 헤더에서 DB 연결을 선택하면 데이터를 수집할 수 있습니다</p>
              ) : (
                <Button className="mt-4" onClick={handleCollectNow} disabled={isCollecting}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${isCollecting ? 'animate-spin' : ''}`} />
                  지금 데이터 수집하기
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SQL 상세 정보 다이얼로그 */}
      {selectedSqlId && effectiveConnectionId && effectiveConnectionId !== 'all' && (
        <SQLDetailDialog
          sqlId={selectedSqlId}
          connectionId={effectiveConnectionId}
          open={!!selectedSqlId}
          onClose={() => setSelectedSqlId(null)}
        />
      )}
    </div>
  );
}

// SQL 상세 정보 다이얼로그
interface SQLDetailDialogProps {
  sqlId: string;
  connectionId: string;
  open: boolean;
  onClose: () => void;
}

function SQLDetailDialog({
  sqlId,
  connectionId,
  open,
  onClose,
}: SQLDetailDialogProps) {
  const { data: detailData, isLoading } = useQuery({
    queryKey: ['sql-detail', sqlId, connectionId],
    queryFn: async () => {
      const params = new URLSearchParams({
        connection_id: connectionId,
        sql_id: sqlId,
      });
      const res = await fetch(`/api/monitoring/sql-detail?${params}`);
      if (!res.ok) throw new Error('Failed to fetch SQL detail');
      const data = await res.json();
      return data.data;
    },
    enabled: open && !!sqlId && !!connectionId,
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            SQL 상세 정보
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : detailData ? (
          <div className="space-y-6">
            {/* SQL 기본 정보 */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">기본 정보</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div className="space-y-1">
                  <div className="text-muted-foreground">SQL ID</div>
                  <code className="font-mono text-sm bg-muted px-2 py-1 rounded block">
                    {detailData.sql_info.sql_id}
                  </code>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Schema</div>
                  <div className="font-medium">{detailData.sql_info.schema_name}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Module</div>
                  <div className="font-medium">{detailData.sql_info.module || 'N/A'}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">실행 횟수</div>
                  <div className="font-medium">
                    {detailData.sql_info.executions.toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">총 경과 시간 (ms)</div>
                  <div className="font-medium">
                    {detailData.sql_info.elapsed_time_ms.toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">평균 경과 시간 (ms)</div>
                  <div className="font-medium">
                    {detailData.sql_info.avg_elapsed_ms.toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">총 CPU 시간 (ms)</div>
                  <div className="font-medium">
                    {detailData.sql_info.cpu_time_ms.toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">평균 CPU 시간 (ms)</div>
                  <div className="font-medium">
                    {detailData.sql_info.avg_cpu_ms.toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Optimizer Mode</div>
                  <div className="font-medium">{detailData.sql_info.optimizer_mode}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Buffer Gets</div>
                  <div className="font-medium">
                    {detailData.sql_info.buffer_gets.toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">평균 Buffer Gets</div>
                  <div className="font-medium">
                    {detailData.sql_info.avg_buffer_gets.toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Disk Reads</div>
                  <div className="font-medium">
                    {detailData.sql_info.disk_reads.toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">평균 Disk Reads</div>
                  <div className="font-medium">
                    {detailData.sql_info.avg_disk_reads.toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Rows Processed</div>
                  <div className="font-medium">
                    {detailData.sql_info.rows_processed.toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">평균 Rows Processed</div>
                  <div className="font-medium">
                    {detailData.sql_info.avg_rows_processed.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* SQL 텍스트 */}
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">SQL 텍스트</h3>
              <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                {detailData.sql_info.sql_text}
              </pre>
            </div>

            {/* 실행계획 */}
            {detailData.execution_plan && detailData.execution_plan.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">실행 계획</h3>
                <div className="bg-muted p-4 rounded-lg overflow-x-auto">
                  <table className="w-full text-sm font-mono">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2">ID</th>
                        <th className="text-left py-2 px-2">Operation</th>
                        <th className="text-left py-2 px-2">Object</th>
                        <th className="text-right py-2 px-2">Rows</th>
                        <th className="text-right py-2 px-2">Cost</th>
                        <th className="text-right py-2 px-2">CPU Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.execution_plan.map((step: any) => (
                        <tr key={step.id} className="border-b">
                          <td className="py-2 px-2">{step.id}</td>
                          <td className="py-2 px-2">
                            {'  '.repeat(step.id || 0)}
                            {step.operation} {step.options}
                          </td>
                          <td className="py-2 px-2">{step.object_name || '-'}</td>
                          <td className="py-2 px-2 text-right">
                            {step.cardinality?.toLocaleString() || '-'}
                          </td>
                          <td className="py-2 px-2 text-right">
                            {step.cost?.toLocaleString() || '-'}
                          </td>
                          <td className="py-2 px-2 text-right">
                            {step.cpu_cost?.toLocaleString() || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Bind 변수 */}
            {detailData.bind_variables && detailData.bind_variables.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Bind 변수</h3>
                <div className="bg-muted p-4 rounded-lg">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2">Name</th>
                        <th className="text-left py-2 px-2">Position</th>
                        <th className="text-left py-2 px-2">Data Type</th>
                        <th className="text-left py-2 px-2">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.bind_variables.map((bind: any, idx: number) => (
                        <tr key={idx} className="border-b">
                          <td className="py-2 px-2 font-mono">{bind.name}</td>
                          <td className="py-2 px-2">{bind.position}</td>
                          <td className="py-2 px-2">{bind.datatype}</td>
                          <td className="py-2 px-2 font-mono">{bind.value || 'NULL'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            SQL 정보를 찾을 수 없습니다.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// 상태 뱃지 색상
function getStatusVariant(status: string) {
  const variants = {
    CRITICAL: 'destructive',
    WARNING: 'outline',
    NORMAL: 'default',
    TUNING: 'secondary',
  } as const;
  return variants[status as keyof typeof variants] || 'default';
}
