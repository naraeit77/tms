'use client';

/**
 * SQL Advanced Search Page
 * SQL 통합 검색 - AI 기반 스마트 검색 및 패턴 매칭
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Search,
  Filter,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  GitCompare,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ArrowLeft,
} from 'lucide-react';
import { debounce } from 'es-toolkit';
import { useDatabaseStore } from '@/lib/stores/database-store';

interface SQLResult {
  id: number;
  sql_id: string;
  sql_text?: string;
  schema_name?: string;
  executions: number;
  elapsed_time_ms: number;
  cpu_time_ms: number;
  buffer_gets: number;
  disk_reads: number;
  rows_processed: number;
  avg_elapsed_time_ms: number;
  status?: string;
}

export default function AdvancedSearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [results, setResults] = useState<SQLResult[]>([]);
  const [selectedSQLs, setSelectedSQLs] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [sortBy, setSortBy] = useState('cpu_time_ms');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filters, setFilters] = useState({
    schema: 'all',
    minExecutions: 0,
    maxCpuTime: Infinity,
    performanceGrade: 'all',
  });

  const { selectedConnectionId } = useDatabaseStore();
  const resultsPerPage = 20;

  // Fetch SQL statistics
  const { data: sqlData, isLoading, refetch } = useQuery({
    queryKey: ['sql-search', selectedConnectionId, searchQuery, filters, sortBy, sortOrder, currentPage],
    queryFn: async () => {
      if (!selectedConnectionId) return { data: [], total: 0 };

      const offset = (currentPage - 1) * resultsPerPage;
      const res = await fetch(
        `/api/monitoring/sql-statistics?connection_id=${selectedConnectionId}&limit=${resultsPerPage}&offset=${offset}&order_by=${sortBy}`
      );
      if (!res.ok) throw new Error('Failed to fetch SQL statistics');
      const data = await res.json();
      return data;
    },
    enabled: !!selectedConnectionId,
  });

  useEffect(() => {
    if (sqlData?.data) {
      let filtered = sqlData.data;

      // Apply search query filter
      if (searchQuery) {
        filtered = filtered.filter(
          (sql: SQLResult) =>
            sql.sql_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (sql.sql_text && sql.sql_text.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (sql.schema_name && sql.schema_name.toLowerCase().includes(searchQuery.toLowerCase()))
        );
      }

      // Apply additional filters
      if (filters.schema !== 'all') {
        filtered = filtered.filter((sql: SQLResult) => sql.schema_name === filters.schema);
      }
      if (filters.minExecutions > 0) {
        filtered = filtered.filter((sql: SQLResult) => sql.executions >= filters.minExecutions);
      }
      if (filters.maxCpuTime < Infinity) {
        filtered = filtered.filter((sql: SQLResult) => sql.cpu_time_ms <= filters.maxCpuTime);
      }

      setResults(filtered);
      setTotalResults(filtered.length);
    }
  }, [sqlData, searchQuery, filters]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const handleSelectSQL = (sqlId: string) => {
    const newSelected = new Set(selectedSQLs);
    if (newSelected.has(sqlId)) {
      newSelected.delete(sqlId);
    } else {
      newSelected.add(sqlId);
    }
    setSelectedSQLs(newSelected);
  };

  const handleCompare = () => {
    if (selectedSQLs.size > 1) {
      const sqlIds = Array.from(selectedSQLs).join(',');
      router.push(`/advanced-analysis/compare?sql_ids=${sqlIds}`);
    }
  };

  const handleExport = () => {
    const dataToExport = selectedSQLs.size > 0 ? results.filter((r) => selectedSQLs.has(r.sql_id)) : results;

    const csv = [
      ['SQL ID', 'Schema', 'Executions', 'CPU Time (ms)', 'Buffer Gets', 'Disk Reads'].join(','),
      ...dataToExport.map((r) => [r.sql_id, r.schema_name, r.executions, r.cpu_time_ms, r.buffer_gets, r.disk_reads].join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sql_search_results.csv';
    a.click();
  };

  const getPerformanceColor = (cpuTime: number) => {
    if (cpuTime < 100) return 'bg-green-100 text-green-700';
    if (cpuTime < 500) return 'bg-yellow-100 text-yellow-700';
    if (cpuTime < 1000) return 'bg-orange-100 text-orange-700';
    return 'bg-red-100 text-red-700';
  };

  const totalPages = Math.ceil(totalResults / resultsPerPage);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">SQL 통합 검색</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">AI 기반 스마트 검색 및 패턴 매칭</p>
        </div>
        <div className="flex space-x-2">
          {selectedSQLs.size > 1 && (
            <Button onClick={handleCompare}>
              <GitCompare className="h-4 w-4 mr-2" />
              {selectedSQLs.size}개 비교
            </Button>
          )}
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            내보내기
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="flex space-x-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  placeholder="SQL ID, SQL 텍스트, 테이블명으로 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                새로고침
              </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-4">
              <Select value={filters.schema} onValueChange={(value) => setFilters({ ...filters, schema: value })}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="스키마 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">모든 스키마</SelectItem>
                  <SelectItem value="SYS">SYS</SelectItem>
                  <SelectItem value="PUBLIC">PUBLIC</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filters.minExecutions.toString()}
                onValueChange={(value) => setFilters({ ...filters, minExecutions: parseInt(value) })}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="최소 실행 횟수" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">모든 실행</SelectItem>
                  <SelectItem value="100">100회 이상</SelectItem>
                  <SelectItem value="1000">1,000회 이상</SelectItem>
                  <SelectItem value="10000">10,000회 이상</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={filters.maxCpuTime === Infinity ? 'all' : filters.maxCpuTime.toString()}
                onValueChange={(value) =>
                  setFilters({ ...filters, maxCpuTime: value === 'all' ? Infinity : parseInt(value) })
                }
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="최대 CPU 시간" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">제한 없음</SelectItem>
                  <SelectItem value="1000">1초 이하</SelectItem>
                  <SelectItem value="5000">5초 이하</SelectItem>
                  <SelectItem value="10000">10초 이하</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <CardTitle>검색 결과 ({totalResults.toLocaleString()}개)</CardTitle>
          <CardDescription>클릭하여 상세 분석을 보거나 여러 개를 선택하여 비교할 수 있습니다</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-left">
                    <Checkbox
                      checked={selectedSQLs.size === results.length && results.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedSQLs(new Set(results.map((r) => r.sql_id)));
                        } else {
                          setSelectedSQLs(new Set());
                        }
                      }}
                    />
                  </th>
                  <th className="p-2 text-left">SQL ID</th>
                  <th className="p-2 text-left">스키마</th>
                  <th className="p-2 text-left cursor-pointer hover:bg-gray-50" onClick={() => handleSort('executions')}>
                    <div className="flex items-center">
                      실행 횟수
                      <ArrowUpDown className="h-4 w-4 ml-1" />
                    </div>
                  </th>
                  <th className="p-2 text-left cursor-pointer hover:bg-gray-50" onClick={() => handleSort('cpu_time_ms')}>
                    <div className="flex items-center">
                      CPU Time
                      <ArrowUpDown className="h-4 w-4 ml-1" />
                    </div>
                  </th>
                  <th className="p-2 text-left cursor-pointer hover:bg-gray-50" onClick={() => handleSort('buffer_gets')}>
                    <div className="flex items-center">
                      Buffer Gets
                      <ArrowUpDown className="h-4 w-4 ml-1" />
                    </div>
                  </th>
                  <th className="p-2 text-left">상태</th>
                  <th className="p-2 text-left">작업</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-gray-500">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                      검색 중...
                    </td>
                  </tr>
                ) : results.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-gray-500">
                      검색 결과가 없습니다
                    </td>
                  </tr>
                ) : (
                  results.map((sql) => (
                    <tr key={sql.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="p-2">
                        <Checkbox checked={selectedSQLs.has(sql.sql_id)} onCheckedChange={() => handleSelectSQL(sql.sql_id)} />
                      </td>
                      <td className="p-2">
                        <code
                          className="text-sm font-mono text-blue-600 cursor-pointer hover:underline"
                          onClick={() => router.push(`/monitoring/top-sql`)}
                        >
                          {sql.sql_id}
                        </code>
                      </td>
                      <td className="p-2">
                        <Badge variant="outline" className="text-xs">
                          {sql.schema_name || 'N/A'}
                        </Badge>
                      </td>
                      <td className="p-2 text-sm">{sql.executions.toLocaleString()}</td>
                      <td className="p-2">
                        <Badge className={getPerformanceColor(sql.cpu_time_ms)}>{sql.cpu_time_ms.toFixed(0)}ms</Badge>
                      </td>
                      <td className="p-2 text-sm">{sql.buffer_gets.toLocaleString()}</td>
                      <td className="p-2">
                        {sql.cpu_time_ms > 1000 ? (
                          <XCircle className="h-5 w-5 text-red-500" />
                        ) : sql.cpu_time_ms > 500 ? (
                          <AlertTriangle className="h-5 w-5 text-orange-500" />
                        ) : (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        )}
                      </td>
                      <td className="p-2">
                        <Button variant="ghost" size="sm" onClick={() => router.push(`/monitoring/top-sql`)}>
                          분석
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-gray-500">
                총 {totalResults}개 중 {(currentPage - 1) * resultsPerPage + 1}-
                {Math.min(currentPage * resultsPerPage, totalResults)}개 표시
              </div>
              <div className="flex space-x-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1}>
                  <ChevronLeft className="h-4 w-4" />
                  이전
                </Button>
                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const page = currentPage - 2 + i;
                    if (page < 1 || page > totalPages) return null;
                    return (
                      <Button
                        key={page}
                        variant={page === currentPage ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </Button>
                    );
                  }).filter(Boolean)}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  다음
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
