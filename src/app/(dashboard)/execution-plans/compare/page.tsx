'use client';

/**
 * Execution Plans Compare Page
 * 실행계획 비교 페이지
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { GitCompare, ArrowRight, AlertCircle, TrendingDown, TrendingUp } from 'lucide-react';
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
  collected_at: string;
}

export default function CompareExecutionPlansPage() {
  const searchParams = useSearchParams();
  const sqlId = searchParams.get('sql_id') || '';
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();

  const [selectedPlan1, setSelectedPlan1] = useState<string>('');
  const [selectedPlan2, setSelectedPlan2] = useState<string>('');

  // 실행계획 목록 조회
  const { data: plans, isLoading, error } = useQuery<ExecutionPlan[]>({
    queryKey: ['execution-plans', selectedConnectionId, sqlId],
    queryFn: async () => {
      if (!sqlId || !selectedConnectionId) return [];
      const res = await fetch(
        `/api/monitoring/execution-plans?connection_id=${selectedConnectionId}&sql_id=${sqlId}`
      );
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch execution plans');
      }
      const data = await res.json();
      return data.data || [];
    },
    enabled: !!sqlId && !!selectedConnectionId,
  });

  const plan1 = plans?.find(p => p.id === selectedPlan1);
  const plan2 = plans?.find(p => p.id === selectedPlan2);

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">실행계획 비교</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          동일 SQL의 서로 다른 실행계획을 비교합니다
        </p>
        {selectedConnection && (
          <p className="text-sm text-muted-foreground mt-1">
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
      {!selectedConnectionId && !isLoading && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>데이터베이스 연결 필요</AlertTitle>
          <AlertDescription>
            실행계획을 조회하려면 먼저 데이터베이스를 선택해주세요.
          </AlertDescription>
        </Alert>
      )}

      {/* SQL ID 안내 */}
      {!sqlId && !isLoading && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>SQL ID 필요</AlertTitle>
          <AlertDescription>
            비교할 SQL ID를 URL 파라미터로 전달해주세요. (예: ?sql_id=abc123)
          </AlertDescription>
        </Alert>
      )}

      {/* SQL ID 정보 */}
      {sqlId && selectedConnectionId && (
        <Card>
          <CardHeader>
            <CardTitle>SQL ID</CardTitle>
          </CardHeader>
          <CardContent>
            <code className="font-mono text-lg bg-muted px-3 py-2 rounded">{sqlId}</code>
          </CardContent>
        </Card>
      )}

      {/* 실행계획 선택 */}
      {sqlId && selectedConnectionId && (
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
                      PHV: {plan.plan_hash_value} (Cost: {plan.cost.toLocaleString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {plans && plans.length === 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  실행계획이 없습니다
                </p>
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
                      PHV: {plan.plan_hash_value} (Cost: {plan.cost.toLocaleString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {plans && plans.length === 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  실행계획이 없습니다
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 비교 결과 */}
      {plan1 && plan2 && (
        <>
          {/* 메트릭 비교 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitCompare className="h-5 w-5" />
                성능 메트릭 비교
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
              </div>
            </CardContent>
          </Card>

          {/* 실행계획 텍스트 비교 */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>실행계획 1</CardTitle>
                <CardDescription>
                  PHV: {plan1.plan_hash_value}
                  <br />
                  수집: {new Date(plan1.collected_at).toLocaleString('ko-KR')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <pre className="overflow-auto p-4 bg-muted rounded-lg h-96 text-xs font-mono whitespace-pre">
                    {plan1.plan_text}
                  </pre>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>실행계획 2</CardTitle>
                <CardDescription>
                  PHV: {plan2.plan_hash_value}
                  <br />
                  수집: {new Date(plan2.collected_at).toLocaleString('ko-KR')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <pre className="overflow-auto p-4 bg-muted rounded-lg h-96 text-xs font-mono whitespace-pre">
                    {plan2.plan_text}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* 로딩 상태 */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
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
          <div className="text-xs text-muted-foreground">실행계획 1</div>
        </div>
        <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        <div className="text-right">
          <div className="text-xl font-bold">{value2.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">실행계획 2</div>
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
