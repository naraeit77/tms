'use client';

/**
 * Execution Plans Page
 * SQL 실행계획 조회 및 분석
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Search, GitCompare, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  access_predicates?: string;
  filter_predicates?: string;
  collected_at: string;
}

export default function ExecutionPlansPage() {
  const [sqlId, setSqlId] = useState('');
  const [searchSqlId, setSearchSqlId] = useState('');
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
  const searchParams = useSearchParams();

  // URL에서 connection_id를 가져오거나 선택된 데이터베이스 사용
  const urlConnectionId = searchParams.get('connection_id');
  const effectiveConnectionId = urlConnectionId || selectedConnectionId || 'all';

  // URL 쿼리 파라미터에서 SQL_ID 자동 입력 및 검색
  useEffect(() => {
    const urlSqlId = searchParams.get('sql_id');
    if (urlSqlId) {
      setSqlId(urlSqlId);
      setSearchSqlId(urlSqlId);
    }
  }, [searchParams]);

  // 실행계획 조회
  const { data: plans, isLoading, error } = useQuery<ExecutionPlan[]>({
    queryKey: ['execution-plans', effectiveConnectionId, searchSqlId],
    queryFn: async () => {
      if (!searchSqlId) return [];
      if (effectiveConnectionId === 'all') {
        throw new Error('데이터베이스를 선택해주세요');
      }
      const res = await fetch(
        `/api/monitoring/execution-plans?connection_id=${effectiveConnectionId}&sql_id=${searchSqlId}`
      );
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch execution plans');
      }
      const data = await res.json();
      return data.data || [];
    },
    enabled: !!searchSqlId && effectiveConnectionId !== 'all',
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchSqlId(sqlId.trim());
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">실행계획 조회</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          SQL 실행계획을 조회하고 분석합니다
        </p>
        {selectedConnection && (
          <p className="text-sm text-muted-foreground mt-1">
            연결: <span className="font-medium">{selectedConnection.name}</span> ({selectedConnection.host}:{selectedConnection.port})
          </p>
        )}
      </div>

      {/* 데이터베이스 선택 경고 */}
      {effectiveConnectionId === 'all' && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            실행계획을 조회하려면 상단에서 데이터베이스를 선택해주세요.
          </AlertDescription>
        </Alert>
      )}

      {/* 검색 폼 */}
      <Card>
        <CardHeader>
          <CardTitle>SQL ID 검색</CardTitle>
          <CardDescription>
            조회할 SQL의 SQL_ID를 입력하세요
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="sql_id">SQL ID</Label>
              <div className="flex gap-2">
                <Input
                  id="sql_id"
                  value={sqlId}
                  onChange={(e) => setSqlId(e.target.value)}
                  placeholder="예: 4ztz048yfq32g"
                  className="font-mono"
                  disabled={effectiveConnectionId === 'all'}
                />
                <Button
                  type="submit"
                  disabled={!sqlId.trim() || effectiveConnectionId === 'all'}
                >
                  <Search className="h-4 w-4 mr-2" />
                  조회
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 실행계획 목록 */}
      {searchSqlId && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={`skeleton-exec-plans-${i}`} className="h-64 w-full" />
              ))}
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error instanceof Error ? error.message : '실행계획을 조회하는 중 오류가 발생했습니다.'}
              </AlertDescription>
            </Alert>
          ) : plans && plans.length > 0 ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  {plans.length}개의 실행계획 발견
                </h2>
                {plans.length > 1 && (
                  <Button variant="outline" asChild>
                    <a href={`/execution-plans/compare?sql_id=${searchSqlId}`}>
                      <GitCompare className="h-4 w-4 mr-2" />
                      실행계획 비교
                    </a>
                  </Button>
                )}
              </div>
              {plans.map((plan) => (
                <ExecutionPlanCard key={plan.id} plan={plan} />
              ))}
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Search className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  해당 SQL ID에 대한 실행계획을 찾을 수 없습니다.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// 실행계획 카드 컴포넌트
interface ExecutionPlanCardProps {
  plan: ExecutionPlan;
}

function ExecutionPlanCard({ plan }: ExecutionPlanCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="font-mono text-base">
              Plan Hash Value: {plan.plan_hash_value}
            </CardTitle>
            <CardDescription className="mt-1">
              수집 시간: {new Date(plan.collected_at).toLocaleString('ko-KR')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 메트릭 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Cost</div>
            <div className="text-2xl font-bold">{(plan.cost || 0).toLocaleString()}</div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Cardinality</div>
            <div className="text-2xl font-bold">{(plan.cardinality || 0).toLocaleString()}</div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">Bytes</div>
            <div className="text-2xl font-bold">{(plan.bytes || 0).toLocaleString()}</div>
          </div>
          {plan.cpu_cost && (
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">CPU Cost</div>
              <div className="text-2xl font-bold">{plan.cpu_cost.toLocaleString()}</div>
            </div>
          )}
        </div>

        {/* 실행계획 텍스트 */}
        <div className="space-y-2">
          <Label>실행계획</Label>
          <Textarea
            value={plan.plan_text}
            readOnly
            className="font-mono text-xs h-64 resize-none"
          />
        </div>

        {/* Predicates */}
        {(plan.access_predicates || plan.filter_predicates) && (
          <div className="space-y-3 pt-4 border-t">
            {plan.access_predicates && (
              <div className="space-y-1">
                <Label className="text-sm">Access Predicates</Label>
                <div className="text-sm font-mono bg-muted p-2 rounded">
                  {plan.access_predicates}
                </div>
              </div>
            )}
            {plan.filter_predicates && (
              <div className="space-y-1">
                <Label className="text-sm">Filter Predicates</Label>
                <div className="text-sm font-mono bg-muted p-2 rounded">
                  {plan.filter_predicates}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
