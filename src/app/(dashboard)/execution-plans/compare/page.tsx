'use client';

/**
 * Execution Plans Compare Page
 * 실행계획 비교 페이지 - 개선된 버전
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  GitCompare,
  ArrowRight,
  AlertCircle,
  TrendingDown,
  TrendingUp,
  Search,
  ArrowLeft,
  Activity,
  Clock,
  Database,
  Zap,
  Target,
  BarChart3
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

interface ExecutionPlan {
  id: string;
  sql_id: string;
  plan_hash_value: string;
  plan_text: string;
  cost: number;
  cardinality: number;
  bytes: number;
  cpu_cost?: number;
  io_cost?: number;
  temp_space?: number;
  collected_at: string;
}

interface SqlSummary {
  sql_id: string;
  sql_text: string;
  plan_hash_value: number;
  plan_count?: number;
  executions: number;
  avg_elapsed_ms: number;
  avg_cpu_ms: number;
  avg_buffer_gets: number;
  avg_disk_reads: number;
  avg_rows: number;
}

export default function CompareExecutionPlansPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSqlId = searchParams.get('sql_id') || '';
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSqlId, setSelectedSqlId] = useState<string>(initialSqlId);
  const [selectedPlan1, setSelectedPlan1] = useState<string>('');
  const [selectedPlan2, setSelectedPlan2] = useState<string>('');
  const [showOnlyMultiplePlans, setShowOnlyMultiplePlans] = useState(false);

  // SQL 목록 조회 (검색용)
  const { data: sqlList, isLoading: sqlListLoading } = useQuery<SqlSummary[]>({
    queryKey: ['execution-plans-list', selectedConnectionId],
    queryFn: async () => {
      if (!selectedConnectionId) return [];
      const res = await fetch(
        `/api/monitoring/execution-plans?connection_id=${selectedConnectionId}`
      );
      if (!res.ok) throw new Error('Failed to fetch SQL list');
      const data = await res.json();
      return data.data || [];
    },
    enabled: !!selectedConnectionId,
  });

  // 특정 SQL의 실행계획 목록 조회
  const { data: plans, isLoading: plansLoading, error } = useQuery<ExecutionPlan[]>({
    queryKey: ['execution-plans', selectedConnectionId, selectedSqlId],
    queryFn: async () => {
      if (!selectedSqlId || !selectedConnectionId) return [];
      const res = await fetch(
        `/api/monitoring/execution-plans?connection_id=${selectedConnectionId}&sql_id=${selectedSqlId}`
      );
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch execution plans');
      }
      const data = await res.json();
      return data.data || [];
    },
    enabled: !!selectedSqlId && !!selectedConnectionId,
  });

  // 자동으로 처음 두 개의 플랜 선택
  useEffect(() => {
    if (plans && plans.length >= 2 && !selectedPlan1 && !selectedPlan2) {
      setSelectedPlan1(plans[0].id);
      setSelectedPlan2(plans[1].id);
    }
  }, [plans]);

  const plan1 = plans?.find(p => p.id === selectedPlan1);
  const plan2 = plans?.find(p => p.id === selectedPlan2);
  const selectedSql = sqlList?.find(sql => sql.sql_id === selectedSqlId);

  // API에서 이미 고유한 plan_count를 포함하여 반환하므로 그대로 사용
  const uniqueSqlList = sqlList || [];

  // 검색 및 필터링
  const filteredSqlList = uniqueSqlList.filter(sql => {
    // 검색어 필터
    const matchesSearch = sql.sql_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sql.sql_text.toLowerCase().includes(searchQuery.toLowerCase());

    // 여러 플랜 필터
    const matchesFilter = !showOnlyMultiplePlans || (sql.plan_count || 1) >= 2;

    return matchesSearch && matchesFilter;
  });

  const handleSqlSelect = (sqlId: string) => {
    setSelectedSqlId(sqlId);
    setSelectedPlan1('');
    setSelectedPlan2('');
    router.push(`/execution-plans/compare?sql_id=${sqlId}`);
  };

  const handleBack = () => {
    setSelectedSqlId('');
    setSelectedPlan1('');
    setSelectedPlan2('');
    router.push('/execution-plans/compare');
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div>
        <div className="flex items-center gap-4">
          {selectedSqlId && (
            <Button variant="ghost" size="icon" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">실행계획 비교</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              동일 SQL의 서로 다른 실행계획을 비교하여 성능을 분석합니다
            </p>
          </div>
        </div>
        {selectedConnection && (
          <p className="text-sm text-muted-foreground mt-2">
            연결: <span className="font-medium">{selectedConnection.name}</span> ({selectedConnection.host}:{selectedConnection.port})
          </p>
        )}
      </div>

      {/* 에러 표시 */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>오류</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : '실행계획을 불러오는데 실패했습니다'}
          </AlertDescription>
        </Alert>
      )}

      {/* DB 연결 안내 */}
      {!selectedConnectionId && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>데이터베이스 연결 필요</AlertTitle>
          <AlertDescription>
            실행계획을 조회하려면 먼저 데이터베이스를 선택해주세요.
          </AlertDescription>
        </Alert>
      )}

      {selectedConnectionId && !selectedSqlId && (
        <>
          {/* SQL 검색 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                SQL 검색
              </CardTitle>
              <CardDescription className="flex items-center justify-between">
                <span>비교할 SQL을 검색하여 선택하세요</span>
                {uniqueSqlList.length > 0 && (
                  <span className="text-xs">
                    전체 {uniqueSqlList.length}개 SQL 중 {uniqueSqlList.filter(s => (s.plan_count || 1) >= 2).length}개가 비교 가능
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="SQL ID 또는 SQL 텍스트로 검색..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant={showOnlyMultiplePlans ? "default" : "outline"}
                    size="default"
                    onClick={() => setShowOnlyMultiplePlans(!showOnlyMultiplePlans)}
                    className="shrink-0"
                  >
                    <GitCompare className="h-4 w-4 mr-2" />
                    2개 이상만
                  </Button>
                </div>

                {showOnlyMultiplePlans && (
                  <Alert>
                    <GitCompare className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      실행계획이 2개 이상인 SQL만 표시됩니다
                    </AlertDescription>
                  </Alert>
                )}

                {sqlListLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={`skeleton-compare-list-${i}`} className="h-20 w-full" />
                    ))}
                  </div>
                ) : filteredSqlList.length > 0 ? (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {filteredSqlList.map((sql, index) => {
                      const planCount = sql.plan_count || 1;
                      const hasMultiplePlans = planCount >= 2;

                      return (
                        <Card
                          key={`${sql.sql_id}-${sql.plan_count || 0}-${index}`}
                          className={`cursor-pointer hover:bg-accent transition-colors ${
                            hasMultiplePlans ? 'border-l-4 border-l-blue-500' : ''
                          }`}
                          onClick={() => handleSqlSelect(sql.sql_id)}
                        >
                          <CardContent className="p-4">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <code className="font-mono text-sm font-semibold truncate">{sql.sql_id}</code>
                                  {hasMultiplePlans && (
                                    <Badge variant="secondary" className="flex items-center gap-1 shrink-0">
                                      <GitCompare className="h-3 w-3" />
                                      {planCount}개 플랜
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                                  <span className="flex items-center gap-1">
                                    <Activity className="h-3 w-3" />
                                    {sql.executions.toLocaleString()}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {sql.avg_elapsed_ms.toFixed(1)}ms
                                  </span>
                                </div>
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {sql.sql_text}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {searchQuery ? '검색 결과가 없습니다' : 'SQL 목록이 비어있습니다'}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* SQL 정보 및 실행계획 선택 */}
      {selectedSqlId && selectedConnectionId && (
        <>
          {/* SQL 정보 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>SQL 정보</span>
                <Badge variant="outline">{selectedSqlId}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {selectedSql && (
                  <>
                    <div>
                      <h4 className="text-sm font-semibold mb-2">SQL 텍스트</h4>
                      <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
                        {selectedSql.sql_text}
                      </pre>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-xs text-muted-foreground">실행 횟수</div>
                          <div className="text-sm font-semibold">{selectedSql.executions.toLocaleString()}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-xs text-muted-foreground">평균 경과시간</div>
                          <div className="text-sm font-semibold">{selectedSql.avg_elapsed_ms.toFixed(2)}ms</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-xs text-muted-foreground">평균 CPU</div>
                          <div className="text-sm font-semibold">{selectedSql.avg_cpu_ms.toFixed(2)}ms</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="text-xs text-muted-foreground">평균 버퍼 읽기</div>
                          <div className="text-sm font-semibold">{selectedSql.avg_buffer_gets.toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 실행계획 선택 */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>실행계획 1</CardTitle>
                <CardDescription>비교할 첫 번째 실행계획 선택</CardDescription>
              </CardHeader>
              <CardContent>
                <Select
                  value={selectedPlan1}
                  onValueChange={setSelectedPlan1}
                  disabled={!plans || plans.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="실행계획 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans?.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        PHV: {plan.plan_hash_value} | Cost: {plan.cost.toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {plans && plans.length === 0 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    실행계획이 없습니다
                  </p>
                )}
                {plans && plans.length === 1 && (
                  <Alert className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      이 SQL에는 하나의 실행계획만 있습니다. 비교하려면 최소 2개의 실행계획이 필요합니다.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>실행계획 2</CardTitle>
                <CardDescription>비교할 두 번째 실행계획 선택</CardDescription>
              </CardHeader>
              <CardContent>
                <Select
                  value={selectedPlan2}
                  onValueChange={setSelectedPlan2}
                  disabled={!plans || plans.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="실행계획 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans?.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        PHV: {plan.plan_hash_value} | Cost: {plan.cost.toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* 비교 결과 */}
      {plan1 && plan2 && (
        <Tabs defaultValue="metrics" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="metrics">메트릭 비교</TabsTrigger>
            <TabsTrigger value="plans">실행계획 비교</TabsTrigger>
          </TabsList>

          <TabsContent value="metrics" className="space-y-4">
            {/* 요약 비교 */}
            <div className="grid gap-4 md:grid-cols-3">
              <ComparisonCard
                icon={<BarChart3 className="h-4 w-4" />}
                label="Cost"
                value1={plan1.cost}
                value2={plan2.cost}
              />
              <ComparisonCard
                icon={<Target className="h-4 w-4" />}
                label="Cardinality"
                value1={plan1.cardinality}
                value2={plan2.cardinality}
              />
              <ComparisonCard
                icon={<Database className="h-4 w-4" />}
                label="Bytes"
                value1={plan1.bytes}
                value2={plan2.bytes}
              />
            </div>

            {/* 상세 메트릭 비교 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitCompare className="h-5 w-5" />
                  상세 메트릭 비교
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <MetricComparison
                    label="Cost"
                    value1={plan1.cost}
                    value2={plan2.cost}
                  />
                  <MetricComparison
                    label="Cardinality"
                    value1={plan1.cardinality}
                    value2={plan2.cardinality}
                  />
                  <MetricComparison
                    label="Bytes"
                    value1={plan1.bytes}
                    value2={plan2.bytes}
                  />
                  {plan1.cpu_cost && plan2.cpu_cost && (
                    <MetricComparison
                      label="CPU Cost"
                      value1={plan1.cpu_cost}
                      value2={plan2.cpu_cost}
                    />
                  )}
                  {plan1.io_cost && plan2.io_cost && (
                    <MetricComparison
                      label="I/O Cost"
                      value1={plan1.io_cost}
                      value2={plan2.io_cost}
                    />
                  )}
                  {plan1.temp_space && plan2.temp_space && (
                    <MetricComparison
                      label="Temp Space"
                      value1={plan1.temp_space}
                      value2={plan2.temp_space}
                    />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 종합 평가 */}
            <Card>
              <CardHeader>
                <CardTitle>종합 평가</CardTitle>
              </CardHeader>
              <CardContent>
                <ComparisonSummary plan1={plan1} plan2={plan2} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="plans" className="space-y-4">
            {/* 실행계획 텍스트 비교 */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">실행계획 1</CardTitle>
                  <CardDescription>
                    <div className="space-y-1">
                      <div>PHV: {plan1.plan_hash_value}</div>
                      <div>수집: {new Date(plan1.collected_at).toLocaleString('ko-KR')}</div>
                    </div>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    <pre className="overflow-auto p-4 bg-muted rounded-lg h-[600px] text-xs font-mono whitespace-pre">
                      {plan1.plan_text}
                    </pre>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">실행계획 2</CardTitle>
                  <CardDescription>
                    <div className="space-y-1">
                      <div>PHV: {plan2.plan_hash_value}</div>
                      <div>수집: {new Date(plan2.collected_at).toLocaleString('ko-KR')}</div>
                    </div>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="relative">
                    <pre className="overflow-auto p-4 bg-muted rounded-lg h-[600px] text-xs font-mono whitespace-pre">
                      {plan2.plan_text}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {/* 로딩 상태 */}
      {plansLoading && selectedSqlId && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={`skeleton-compare-result-${i}`} className="h-32 w-full" />
          ))}
        </div>
      )}
    </div>
  );
}

// 메트릭 비교 컴포넌트
interface MetricComparisonProps {
  label: string;
  value1: number;
  value2: number;
}

function MetricComparison({ label, value1, value2 }: MetricComparisonProps) {
  const diff = value2 - value1;
  const diffPercent = value1 !== 0 ? ((diff / value1) * 100).toFixed(1) : '0';
  const isImprovement = diff < 0;

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors">
      <div className="font-semibold text-base min-w-[120px]">{label}</div>
      <div className="flex items-center gap-6">
        <div className="text-right">
          <div className="text-xl font-bold">{value1.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">플랜 1</div>
        </div>
        <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        <div className="text-right">
          <div className="text-xl font-bold">{value2.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">플랜 2</div>
        </div>
        <div className={`flex items-center gap-2 min-w-[140px] justify-end ${
          isImprovement ? 'text-green-600 dark:text-green-500' :
          diff > 0 ? 'text-red-600 dark:text-red-500' :
          'text-muted-foreground'
        }`}>
          {diff !== 0 && (
            isImprovement ?
              <TrendingDown className="h-4 w-4" /> :
              <TrendingUp className="h-4 w-4" />
          )}
          <div className="text-right">
            <div className="text-sm font-bold">
              {diff > 0 ? '+' : ''}{diff.toLocaleString()}
            </div>
            <div className="text-xs">
              ({diff > 0 ? '+' : ''}{diffPercent}%)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 비교 카드 컴포넌트
interface ComparisonCardProps {
  icon: React.ReactNode;
  label: string;
  value1: number;
  value2: number;
}

function ComparisonCard({ icon, label, value1, value2 }: ComparisonCardProps) {
  const diff = value2 - value1;
  const diffPercent = value1 !== 0 ? ((diff / value1) * 100).toFixed(1) : '0';
  const isImprovement = diff < 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">플랜 1</span>
            <span className="text-lg font-bold">{value1.toLocaleString()}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">플랜 2</span>
            <span className="text-lg font-bold">{value2.toLocaleString()}</span>
          </div>
          <div className={`flex items-center justify-between pt-2 border-t ${
            isImprovement ? 'text-green-600 dark:text-green-500' :
            diff > 0 ? 'text-red-600 dark:text-red-500' :
            'text-muted-foreground'
          }`}>
            <span className="text-xs font-medium">차이</span>
            <div className="flex items-center gap-1">
              {diff !== 0 && (
                isImprovement ?
                  <TrendingDown className="h-3 w-3" /> :
                  <TrendingUp className="h-3 w-3" />
              )}
              <span className="text-sm font-bold">
                {diff > 0 ? '+' : ''}{diffPercent}%
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// 종합 평가 컴포넌트
interface ComparisonSummaryProps {
  plan1: ExecutionPlan;
  plan2: ExecutionPlan;
}

function ComparisonSummary({ plan1, plan2 }: ComparisonSummaryProps) {
  const metrics = [
    { name: 'cost', label: 'Cost', value1: plan1.cost, value2: plan2.cost, weight: 0.4 },
    { name: 'cardinality', label: 'Cardinality', value1: plan1.cardinality, value2: plan2.cardinality, weight: 0.2 },
    { name: 'bytes', label: 'Bytes', value1: plan1.bytes, value2: plan2.bytes, weight: 0.2 },
    { name: 'cpu_cost', label: 'CPU Cost', value1: plan1.cpu_cost || 0, value2: plan2.cpu_cost || 0, weight: 0.1 },
    { name: 'io_cost', label: 'I/O Cost', value1: plan1.io_cost || 0, value2: plan2.io_cost || 0, weight: 0.1 },
  ];

  let totalScore = 0;
  let improvements = 0;
  let degradations = 0;

  metrics.forEach(metric => {
    const diff = metric.value2 - metric.value1;
    if (diff < 0) {
      improvements++;
      totalScore += metric.weight;
    } else if (diff > 0) {
      degradations++;
      totalScore -= metric.weight;
    }
  });

  const betterPlan = totalScore > 0 ? 'plan1' : totalScore < 0 ? 'plan2' : 'equal';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center p-4 border rounded-lg">
          <div className="text-2xl font-bold text-green-600 dark:text-green-500">{improvements}</div>
          <div className="text-xs text-muted-foreground">개선 항목</div>
        </div>
        <div className="text-center p-4 border rounded-lg">
          <div className="text-2xl font-bold text-red-600 dark:text-red-500">{degradations}</div>
          <div className="text-xs text-muted-foreground">저하 항목</div>
        </div>
        <div className="text-center p-4 border rounded-lg">
          <div className="text-2xl font-bold text-muted-foreground">{metrics.length - improvements - degradations}</div>
          <div className="text-xs text-muted-foreground">동일 항목</div>
        </div>
      </div>

      <Alert className={
        betterPlan === 'plan1' ? 'border-green-600 dark:border-green-500' :
        betterPlan === 'plan2' ? 'border-red-600 dark:border-red-500' :
        ''
      }>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>종합 평가</AlertTitle>
        <AlertDescription>
          {betterPlan === 'plan1' && (
            <span className="text-green-600 dark:text-green-500 font-semibold">
              실행계획 1이 전반적으로 더 나은 성능을 보입니다.
            </span>
          )}
          {betterPlan === 'plan2' && (
            <span className="text-red-600 dark:text-red-500 font-semibold">
              실행계획 2가 전반적으로 더 나은 성능을 보입니다.
            </span>
          )}
          {betterPlan === 'equal' && (
            <span className="font-semibold">
              두 실행계획의 성능이 비슷합니다.
            </span>
          )}
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">권장사항</h4>
        <ul className="text-sm space-y-1 text-muted-foreground list-disc list-inside">
          {betterPlan === 'plan1' && (
            <>
              <li>실행계획 1을 선호하여 사용하세요</li>
              <li>SQL Plan Baseline을 사용하여 실행계획 1을 고정할 수 있습니다</li>
            </>
          )}
          {betterPlan === 'plan2' && (
            <>
              <li>실행계획 2가 더 효율적입니다</li>
              <li>실행계획 1이 사용되는 경우 원인을 분석하세요</li>
            </>
          )}
          {betterPlan === 'equal' && (
            <>
              <li>두 실행계획 모두 사용 가능합니다</li>
              <li>실제 실행 통계를 확인하여 최종 결정하세요</li>
            </>
          )}
          <li>통계 정보가 최신 상태인지 확인하세요</li>
          <li>인덱스 및 테이블 구조를 검토하세요</li>
        </ul>
      </div>
    </div>
  );
}
