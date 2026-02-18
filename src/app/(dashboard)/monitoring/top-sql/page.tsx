'use client';

/**
 * SQL Monitoring - Top SQL Page
 * SQL 모니터링 - Top SQL 조회 화면
 * 성능 최적화: ExcelJS 지연 로딩
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Search, RefreshCw, Database, Download, Plus, TrendingUp, Activity, Cpu, Clock, Zap, Info, Wrench, BarChart3 } from 'lucide-react';
// ExcelJS는 필요 시 동적 임포트로 로드 (초기 번들 크기 감소)
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
import { PageHeader } from '@/components/ui/page-header';
import { DataCard, DataCardGrid } from '@/components/ui/data-card';
import { ConnectionRequired, EmptyState } from '@/components/ui/empty-state';
import { GradeBadge } from '@/components/ui/status-badge';

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
  const router = useRouter();
  const { toast } = useToast();
  const { selectedConnectionId, selectedConnection: globalConnection } = useSelectedDatabase();
  const [mounted, setMounted] = useState(false);
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

  // 클라이언트 마운트 감지 (Hydration 에러 방지)
  useEffect(() => {
    setMounted(true);
  }, []);

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
      const result = await res.json();
      // API 응답이 직접 메트릭 객체인 경우와 { data: {...} } 형식인 경우 모두 처리
      return result.data || result;
    },
    refetchInterval: 60000, // 60초로 증가
    staleTime: 30 * 1000, // 30초간 캐시 유지
    refetchOnWindowFocus: false,
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
    refetchInterval: 90000, // 90초로 증가
    staleTime: 60 * 1000, // 60초간 캐시 유지
    refetchOnWindowFocus: false,
  });

  const sqlStats: SQLStatistic[] = sqlData?.data || [];

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

  // 튜닝 대상 등록 - 단일 SQL
  const handleRegisterSingleSQL = (sql: SQLStatistic) => {
    const params = new URLSearchParams({
      sql_id: sql.sql_id,
      sql_text: encodeURIComponent(sql.sql_text),
      connection_id: sql.oracle_connection_id,
      elapsed_time_ms: sql.elapsed_time_ms.toString(),
      buffer_gets: sql.buffer_gets.toString(),
    });
    router.push(`/tuning/register?${params}`);
  };

  // 튜닝 대상 등록 - 복수 SQL (첫 번째 SQL만 직접 등록, 나머지는 안내)
  const handleAddToTuning = async () => {
    if (selectedRows.size === 0) {
      toast({
        title: 'SQL을 선택해주세요',
        description: '튜닝 대상으로 등록할 SQL을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    const selectedSQLs = filteredStats.filter((sql) => selectedRows.has(sql.id));

    if (selectedSQLs.length === 1) {
      // 단일 선택 시 바로 등록 페이지로 이동
      handleRegisterSingleSQL(selectedSQLs[0]);
    } else {
      // 복수 선택 시 첫 번째 SQL로 이동하고 안내
      toast({
        title: '튜닝 등록',
        description: `${selectedSQLs.length}개 중 첫 번째 SQL을 먼저 등록합니다. 나머지는 순차적으로 등록해주세요.`,
      });
      handleRegisterSingleSQL(selectedSQLs[0]);
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
  const handleExportExcel = async () => {
    if (filteredStats.length === 0) {
      toast({
        title: '내보낼 데이터가 없습니다',
        description: 'SQL 데이터가 없어 Excel 파일을 생성할 수 없습니다.',
        variant: 'destructive',
      });
      return;
    }

    try {
      // ExcelJS 동적 임포트 (초기 번들 크기 감소)
      const ExcelJS = await import('exceljs');
      // Excel 워크북 생성
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Narae TMS';
      workbook.created = new Date();
      workbook.modified = new Date();

      // 워크시트 추가
      const worksheet = workbook.addWorksheet('Top SQL', {
        properties: { tabColor: { argb: '2563EB' } }
      });

      // 헤더 스타일 정의
      const headerStyle = {
        font: { bold: true, size: 11, color: { argb: 'FFFFFF' } },
        fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: '2563EB' } },
        alignment: { vertical: 'middle' as const, horizontal: 'center' as const, wrapText: true },
        border: {
          top: { style: 'thin' as const },
          left: { style: 'thin' as const },
          bottom: { style: 'thin' as const },
          right: { style: 'thin' as const }
        }
      };

      // 데이터 행 스타일
      const dataStyle = {
        border: {
          top: { style: 'thin' as const },
          left: { style: 'thin' as const },
          bottom: { style: 'thin' as const },
          right: { style: 'thin' as const }
        }
      };

      // 헤더 행 추가
      const headers = [
        '순위',
        'SQL ID',
        'Module',
        'Schema',
        '상태',
        'Elapsed Time (ms)',
        'CPU Time (ms)',
        'Buffer Gets',
        'Disk Reads',
        'Executions',
        'Gets/Exec',
        'SQL Text'
      ];

      worksheet.addRow(headers);
      const headerRow = worksheet.getRow(1);
      headerRow.height = 25;
      headers.forEach((_, index) => {
        const cell = headerRow.getCell(index + 1);
        cell.style = headerStyle;
      });

      // 데이터 행 추가
      filteredStats.forEach((sql, index) => {
        const row = worksheet.addRow([
          index + 1,
          sql.sql_id,
          sql.module || '-',
          sql.schema_name || '-',
          sql.status,
          sql.elapsed_time_ms,
          sql.cpu_time_ms,
          sql.buffer_gets,
          sql.disk_reads,
          sql.executions,
          sql.gets_per_exec?.toFixed(0) || 'N/A',
          sql.sql_text.substring(0, 500) // SQL 텍스트는 500자로 제한
        ]);

        // 데이터 행 스타일 적용
        row.eachCell((cell) => {
          cell.style = dataStyle;
        });

        // SQL Text 열은 왼쪽 정렬, 나머지는 오른쪽 정렬 (숫자 열)
        const sqlTextCell = row.getCell(12);
        sqlTextCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

        // 숫자 열 오른쪽 정렬
        [6, 7, 8, 9, 10, 11].forEach(colIndex => {
          const cell = row.getCell(colIndex);
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
          cell.numFmt = '#,##0';
        });
      });

      // 열 너비 설정
      worksheet.columns = [
        { width: 8 },   // 순위
        { width: 20 },  // SQL ID
        { width: 15 },  // Module
        { width: 15 },  // Schema
        { width: 12 },  // 상태
        { width: 15 },  // Elapsed Time
        { width: 15 },  // CPU Time
        { width: 15 },  // Buffer Gets
        { width: 15 },  // Disk Reads
        { width: 15 },  // Executions
        { width: 12 },  // Gets/Exec
        { width: 60 }   // SQL Text
      ];

      // 필터 정보 추가 (두 번째 시트)
      const infoSheet = workbook.addWorksheet('필터 정보', {
        properties: { tabColor: { argb: '10B981' } }
      });

      infoSheet.columns = [
        { key: 'label', width: 25 },
        { key: 'value', width: 50 }
      ];

      const filterInfo = [
        { label: '연결', value: globalConnection?.name || '전체' },
        { label: '정렬 기준', value: orderBy === 'buffer_gets' ? 'Buffer Gets' : 
                                     orderBy === 'elapsed_time_ms' ? 'Elapsed Time' :
                                     orderBy === 'cpu_time_ms' ? 'CPU Time' :
                                     orderBy === 'disk_reads' ? 'Disk Reads' : 'Executions' },
        { label: '상태 필터', value: statusFilter === 'all' ? '전체' : statusFilter },
        { label: 'Module 필터', value: moduleFilter === 'all' ? '전체' : moduleFilter },
        { label: '최소 Elapsed Time', value: minElapsedTime || '미설정' },
        { label: '최소 Buffer Gets', value: minBufferGets || '미설정' },
        { label: '최소 Executions', value: minExecutions || '미설정' },
        { label: '검색어', value: searchTerm || '없음' },
        { label: '총 SQL 수', value: filteredStats.length.toString() },
        { label: '내보내기 일시', value: new Date().toLocaleString('ko-KR') }
      ];

      infoSheet.addRow({ label: '필터 정보', value: '' });
      infoSheet.getRow(1).style = headerStyle;
      infoSheet.getRow(1).getCell(1).style = headerStyle;
      infoSheet.getRow(1).getCell(2).style = headerStyle;

      filterInfo.forEach(info => {
        const row = infoSheet.addRow(info);
        row.getCell(1).style = {
          font: { bold: true },
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F3F4F6' } },
          border: dataStyle.border
        };
        row.getCell(2).style = {
          border: dataStyle.border
        };
      });

      // Excel 파일 생성 및 다운로드
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      // 파일명 생성
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const connectionName = globalConnection?.name || 'all';
      const filename = `TopSQL_${connectionName}_${timestamp}.xlsx`;

      // 다운로드 링크 생성
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Excel 내보내기 완료',
        description: `${filteredStats.length}개의 SQL 데이터가 Excel 파일로 다운로드되었습니다.`,
      });
    } catch (error) {
      console.error('Excel export error:', error);
      toast({
        title: 'Excel 내보내기 실패',
        description: 'Excel 파일 생성 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
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
          {mounted && globalConnection && (
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
                    <TableHead className="w-[80px]">액션</TableHead>
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
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRegisterSingleSQL(sql);
                          }}
                          title="튜닝 대상으로 등록"
                        >
                          <Wrench className="h-4 w-4" />
                        </Button>
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
                        <tr key={`bind-var-${bind.name || ''}-${bind.position || idx}-${bind.datatype || ''}-${idx}`} className="border-b">
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
