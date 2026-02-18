'use client';

/**
 * Advanced SQL Analysis Tools Page
 * 고급 SQL 분석 도구 - AI 기반 성능 분석과 최적화
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Search,
  TrendingUp,
  AlertTriangle,
  Database,
  Activity,
  ArrowRight,
  RefreshCw,
  Brain,
  GitCompare,
  Code,
  Layers,
  BarChart3,
} from 'lucide-react';
import { useDatabaseStore } from '@/lib/stores/database-store';

// Quick action items - 고급 분석 도구 하위 경로
const quickActions = [
  {
    title: 'SQL 통합 검색',
    description: 'AI 기반 스마트 검색 및 패턴 매칭',
    href: '/advanced-analysis/search',
    icon: Search,
    color: 'bg-blue-500',
    features: ['자연어 검색', '정규식 지원', '실시간 필터링'],
  },
  {
    title: '실행 계획 분석',
    description: '실행 계획 시각화 및 최적화 제안',
    href: '/advanced-analysis/execution-plan',
    icon: GitCompare,
    color: 'bg-green-500',
    features: ['트리 시각화', '비용 분석', '인덱스 추천'],
  },
  {
    title: 'AI 성능 진단',
    description: '머신러닝 기반 성능 이슈 자동 진단',
    href: '/advanced-analysis/ai-diagnosis',
    icon: Brain,
    color: 'bg-purple-500',
    features: ['자동 분석', '개선 제안', '예상 개선율'],
  },
  {
    title: '성능 비교 분석',
    description: '여러 SQL의 성능 메트릭 비교',
    href: '/advanced-analysis/compare',
    icon: BarChart3,
    color: 'bg-orange-500',
    features: ['다중 비교', '트렌드 분석', '벤치마킹'],
  },
];

// Advanced analysis tools
const advancedToolsDefault = [
  {
    id: 'pattern-detection',
    title: '패턴 기반 이슈 탐지',
    description: '반복되는 성능 패턴을 자동으로 식별하고 분류',
    features: ['패턴 인식', '이상 탐지', '자동 분류', '트렌드 예측'],
    icon: Layers,
    status: 'active',
  },
  {
    id: 'sql-refactoring',
    title: 'SQL 리팩토링 어시스턴트',
    description: 'AI가 제안하는 SQL 재작성 및 최적화',
    features: ['구문 분석', '재작성 제안', '성능 예측', '버전 비교'],
    icon: Code,
    status: 'active',
  },
  {
    id: 'realtime-monitoring',
    title: '실시간 성능 모니터링',
    description: '실시간 SQL 실행 추적 및 알림',
    features: ['실시간 추적', '임계값 알림', '자동 캡처', '성능 기록'],
    icon: Activity,
    status: 'active',
  },
];

export default function AdvancedAnalysisPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [advancedTools, setAdvancedTools] = useState(advancedToolsDefault);
  const [stats, setStats] = useState({
    totalAnalyzed: 0,
    issuesFound: 0,
    avgImprovement: 0,
    activeMonitoring: 0,
  });

  // Use global database store
  const { selectedConnectionId } = useDatabaseStore();

  // Fetch Oracle connections
  const { data: connections, isLoading: connectionsLoading } = useQuery({
    queryKey: ['oracle-connections'],
    queryFn: async () => {
      const res = await fetch('/api/oracle/connections');
      if (!res.ok) throw new Error('Failed to fetch connections');
      const data = await res.json();
      console.log('Fetched connections:', data);
      return data;
    },
  });

  // Fetch recent SQL statistics for selected connection
  const { data: sqlStats, isLoading: statsLoading, refetch } = useQuery({
    queryKey: ['sql-stats', selectedConnectionId],
    queryFn: async () => {
      if (!selectedConnectionId) return null;

      const res = await fetch(`/api/monitoring/stats?connection_id=${selectedConnectionId}`);
      if (!res.ok) throw new Error('Failed to fetch SQL stats');
      const data = await res.json();
      console.log('SQL stats response:', data);
      return data;
    },
    enabled: !!selectedConnectionId,
  });

  // Fetch recent SQL queries from selected connection
  const { data: recentSQLs, isLoading: sqlsLoading, refetch: refetchSQLs } = useQuery({
    queryKey: ['recent-sqls', selectedConnectionId],
    queryFn: async () => {
      if (!connections || connections.length === 0 || !selectedConnectionId) {
        console.log('Query disabled - connections:', connections?.length, 'selectedId:', selectedConnectionId);
        return [];
      }

      console.log('Fetching SQL stats for connection:', selectedConnectionId);
      const res = await fetch(`/api/monitoring/sql-statistics?connection_id=${selectedConnectionId}&limit=5&order_by=elapsed_time`);
      if (!res.ok) throw new Error('Failed to fetch SQL statistics');
      const data = await res.json();
      console.log('SQL statistics response:', data);
      return data.data || [];
    },
    enabled: !!connections && connections.length > 0 && !!selectedConnectionId,
  });

  // Fetch all SQL statistics to calculate stats
  const { data: allSqlStats } = useQuery({
    queryKey: ['all-sql-stats', selectedConnectionId],
    queryFn: async () => {
      if (!selectedConnectionId) return [];

      const res = await fetch(`/api/monitoring/sql-statistics?connection_id=${selectedConnectionId}&limit=1000`);
      if (!res.ok) throw new Error('Failed to fetch all SQL statistics');
      const data = await res.json();
      console.log('All SQL statistics:', data);
      return data.data || [];
    },
    enabled: !!selectedConnectionId,
  });

  useEffect(() => {
    console.log('=== Stats Calculation ===');
    console.log('allSqlStats:', allSqlStats);
    console.log('Is Array:', Array.isArray(allSqlStats));
    console.log('Length:', allSqlStats?.length);

    if (allSqlStats && Array.isArray(allSqlStats) && allSqlStats.length > 0) {
      // Calculate stats from actual SQL data
      const totalQueries = allSqlStats.length;
      const slowQueries = allSqlStats.filter((sql: any) => sql.avg_elapsed_time_ms > 1000).length;

      console.log('Total Queries:', totalQueries);
      console.log('Slow Queries (>1000ms):', slowQueries);

      // Calculate estimated improvement potential based on SQL statistics
      // 개선 잠재력 = (느린 쿼리 수 / 전체 쿼리 수) * 100
      // 최소 10%, 최대 95%로 제한
      let estimatedImprovement = 0;

      if (slowQueries > 0) {
        // 느린 쿼리가 있을 경우: 느린 쿼리 비율을 기반으로 계산
        const slowRatio = slowQueries / totalQueries;
        // 느린 쿼리 비율 * 70% (평균적으로 70% 개선 가능하다고 가정)
        estimatedImprovement = Math.round(slowRatio * 70);
        console.log('Slow Ratio:', slowRatio);
        console.log('Calculated from slow queries:', estimatedImprovement);
      } else if (totalQueries > 0) {
        // 느린 쿼리가 없어도 전체 쿼리 분석을 통한 개선 가능성
        // 평균 실행 시간을 기반으로 계산
        const avgElapsedTime = allSqlStats.reduce((sum: number, sql: any) => sum + (sql.avg_elapsed_time_ms || 0), 0) / totalQueries;

        console.log('Average Elapsed Time:', avgElapsedTime, 'ms');

        if (avgElapsedTime > 500) {
          estimatedImprovement = Math.round(Math.min(avgElapsedTime / 1000 * 20, 50));
        } else if (avgElapsedTime > 100) {
          estimatedImprovement = Math.round(Math.min(avgElapsedTime / 500 * 15, 30));
        } else {
          estimatedImprovement = 10; // 최소 개선 가능성
        }
        console.log('Calculated from avg time:', estimatedImprovement);
      }

      // 10% ~ 95% 범위로 제한
      estimatedImprovement = Math.max(10, Math.min(95, estimatedImprovement));

      console.log('Final Estimated Improvement:', estimatedImprovement, '%');

      setStats({
        totalAnalyzed: totalQueries,
        issuesFound: slowQueries,
        avgImprovement: estimatedImprovement,
        activeMonitoring: connections?.filter((c: any) => c.is_active).length || 0,
      });
    } else {
      console.log('No SQL stats available, setting to 0');
      setStats({
        totalAnalyzed: 0,
        issuesFound: 0,
        avgImprovement: 0,
        activeMonitoring: connections?.filter((c: any) => c.is_active).length || 0,
      });
    }
  }, [allSqlStats, connections]);

  const handleQuickSearch = () => {
    if (searchQuery) {
      router.push(`/advanced-analysis/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  const toggleAdvancedTool = (toolId: string) => {
    setAdvancedTools((prevTools) =>
      prevTools.map((tool) =>
        tool.id === toolId ? { ...tool, status: tool.status === 'active' ? 'inactive' : 'active' } : tool
      )
    );
  };

  const activeConnections = connections?.filter((c: any) => c.is_active) || [];
  const healthyConnections = connections?.filter((c: any) => c.health_status === 'HEALTHY') || [];

  // Get selected connection info
  const selectedConnectionInfo = selectedConnectionId
    ? activeConnections.find((c: any) => c.id === selectedConnectionId)
    : null;

  // Debug logging
  useEffect(() => {
    console.log('Selected Connection ID:', selectedConnectionId);
    console.log('Selected Connection Info:', selectedConnectionInfo);
    console.log('Active Connections:', activeConnections);
  }, [selectedConnectionId, selectedConnectionInfo, activeConnections]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">고급 SQL 분석 도구</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            AI 기반 성능 분석과 최적화 제안으로 SQL 성능을 극대화하세요
          </p>
        </div>
        <Button onClick={() => { refetch(); refetchSQLs(); }} variant="outline" disabled={statsLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${statsLoading ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-muted-foreground">선택된 DB</p>
                <p className="text-2xl font-bold truncate">
                  {selectedConnectionInfo?.name || 'N/A'}
                </p>
                {selectedConnectionInfo && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedConnectionInfo.health_status === 'HEALTHY' ? '✓ 정상' : '✗ 이상'}
                  </p>
                )}
              </div>
              <Database className="h-8 w-8 text-blue-500 flex-shrink-0 ml-2" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">분석된 SQL</p>
                <p className="text-2xl font-bold">{stats.totalAnalyzed.toLocaleString()}</p>
              </div>
              <Activity className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">발견된 이슈</p>
                <p className="text-2xl font-bold text-orange-600">{stats.issuesFound}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">평균 개선율</p>
                <p className="text-2xl font-bold text-green-600">+{stats.avgImprovement}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Search Bar */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  placeholder="SQL ID, 텍스트, 스키마로 검색... (예: SELECT * FROM users)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleQuickSearch()}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedFilter} onValueChange={setSelectedFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="필터 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">모든 SQL</SelectItem>
                <SelectItem value="critical">심각한 이슈</SelectItem>
                <SelectItem value="slow">느린 쿼리</SelectItem>
                <SelectItem value="frequent">자주 실행</SelectItem>
                <SelectItem value="recent">최근 실행</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleQuickSearch}>
              <Search className="h-4 w-4 mr-2" />
              검색
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Advanced Analysis Tools - Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {quickActions.map((action) => (
          <Card
            key={action.href}
            className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-blue-500"
            onClick={() => router.push(action.href)}
          >
            <CardContent className="p-6">
              <div className={`inline-flex p-3 rounded-lg ${action.color} text-white mb-4`}>
                <action.icon className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-lg mb-2">{action.title}</h3>
              <p className="text-sm text-muted-foreground mb-4">{action.description}</p>
              <div className="space-y-1">
                {action.features.map((feature, idx) => (
                  <div key={`feature-${action.title}-${feature.substring(0, 20)}-${idx}`} className="flex items-center text-xs text-muted-foreground">
                    <div className="w-1 h-1 bg-gray-400 rounded-full mr-2" />
                    {feature}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center text-sm font-medium text-blue-600">
                시작하기 <ArrowRight className="h-4 w-4 ml-1" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent SQL Analysis Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>최근 분석 결과</span>
            <Button variant="outline" size="sm" onClick={() => router.push('/advanced-analysis/search')}>
              전체 보기
            </Button>
          </CardTitle>
          <CardDescription>
            최근 분석된 SQL 쿼리와 발견된 이슈들
            {selectedConnectionInfo && ` (${selectedConnectionInfo.name})`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sqlsLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={`skeleton-analysis-sql-${i}`} className="p-4 border rounded-lg animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          ) : recentSQLs && recentSQLs.length > 0 ? (
            <div className="space-y-4">
              {recentSQLs.map((sql: any) => (
                <div
                  key={sql.id}
                  className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                  onClick={() => router.push(`/monitoring/top-sql`)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2 flex-wrap">
                        <code className="text-sm font-mono text-blue-600">{sql.sql_id}</code>
                        <Badge variant="outline" className="text-xs">
                          {sql.schema_name || 'UNKNOWN'}
                        </Badge>
                        {sql.status && (
                          <Badge
                            variant={sql.status === 'CRITICAL' ? 'destructive' : sql.status === 'WARNING' ? 'outline' : 'default'}
                            className="text-xs"
                          >
                            {sql.status}
                          </Badge>
                        )}
                        <Badge
                          className={`text-xs ${
                            sql.cpu_time_ms > 1000
                              ? 'bg-red-100 text-red-700'
                              : sql.cpu_time_ms > 500
                                ? 'bg-orange-100 text-orange-700'
                                : 'bg-green-100 text-green-700'
                          }`}
                        >
                          CPU: {sql.cpu_time_ms.toFixed(0)}ms
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                        {sql.sql_text || 'SQL text not available'}
                      </p>
                      <div className="flex items-center space-x-4 text-xs text-muted-foreground flex-wrap">
                        <span>실행: {sql.executions.toLocaleString()}회</span>
                        <span>Buffer Gets: {sql.buffer_gets.toLocaleString()}</span>
                        <span>Disk Reads: {sql.disk_reads.toLocaleString()}</span>
                        <span>평균 시간: {sql.avg_elapsed_time_ms.toFixed(0)}ms</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                {healthyConnections.length === 0
                  ? 'DB 연결이 필요합니다. 먼저 Oracle 데이터베이스를 연결해주세요.'
                  : '분석 결과가 없습니다. 새로운 분석을 시작해보세요.'}
              </p>
              {healthyConnections.length === 0 && (
                <Button className="mt-4" onClick={() => router.push('/connections')}>
                  DB 연결 추가
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Advanced Tools Grid */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <BarChart3 className="h-5 w-5 mr-2" />
            고급 분석 기능
          </CardTitle>
          <CardDescription>전문가 수준의 SQL 성능 분석 도구</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {advancedTools.map((tool) => (
              <Card
                key={tool.id}
                className={`border-2 cursor-pointer transition-all duration-200 hover:shadow-lg ${
                  tool.status === 'active'
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20'
                    : 'border-gray-300 bg-gray-50/50 dark:bg-gray-800/50 opacity-75'
                }`}
                onClick={() => toggleAdvancedTool(tool.id)}
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <tool.icon
                      className={`h-8 w-8 transition-colors ${
                        tool.status === 'active' ? 'text-blue-600' : 'text-gray-400'
                      }`}
                    />
                    <Badge
                      variant={tool.status === 'active' ? 'default' : 'secondary'}
                      className={`text-xs cursor-pointer hover:scale-105 transition-transform ${
                        tool.status === 'active' ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 hover:bg-gray-500'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleAdvancedTool(tool.id);
                      }}
                    >
                      {tool.status === 'active' ? '활성' : '비활성'}
                    </Badge>
                  </div>
                  <h3
                    className={`font-semibold mb-2 transition-colors ${
                      tool.status === 'active' ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {tool.title}
                  </h3>
                  <p
                    className={`text-sm mb-4 transition-colors ${
                      tool.status === 'active' ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    {tool.description}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {tool.features.map((feature, idx) => (
                      <div
                        key={`tool-feature-${tool.id}-${feature.substring(0, 20)}-${idx}`}
                        className={`flex items-center text-xs transition-colors ${
                          tool.status === 'active' ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'
                        }`}
                      >
                        <div
                          className={`w-1 h-1 rounded-full mr-1 transition-colors ${
                            tool.status === 'active' ? 'bg-blue-500' : 'bg-gray-400'
                          }`}
                        />
                        {feature}
                      </div>
                    ))}
                  </div>
                  {tool.status === 'active' && (
                    <div className="mt-4 text-xs text-blue-600 dark:text-blue-400 font-medium animate-pulse">● 실행 중</div>
                  )}
                  {tool.status === 'inactive' && (
                    <div className="mt-4 text-xs text-gray-400 font-medium">클릭하여 활성화</div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
