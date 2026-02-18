'use client';

/**
 * SQL Plan Baselines Page
 * SQL Plan Baseline 관리 페이지
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Check, X, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

interface PlanBaseline {
  id: string;
  oracle_connection_id: string;
  sql_id: string;
  plan_hash_value: number;
  plan_name: string;
  sql_handle: string | null;
  is_enabled: boolean;
  is_accepted: boolean;
  is_fixed: boolean;
  plan_table: any;
  cost: number | null;
  executions: number;
  avg_elapsed_time_ms: number | null;
  avg_buffer_gets: number | null;
  created_in_oracle_at: string | null;
  last_modified_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface OracleConnection {
  id: string;
  name: string;
}

interface CreateBaselineForm {
  oracle_connection_id: string;
  sql_id: string;
  plan_hash_value: string;
  plan_name: string;
}

export default function PlanBaselinesPage() {
  const queryClient = useQueryClient();
  const { selectedConnection: globalSelectedConnection } = useSelectedDatabase();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConnection, setSelectedConnection] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [formData, setFormData] = useState<CreateBaselineForm>({
    oracle_connection_id: '',
    sql_id: '',
    plan_hash_value: '',
    plan_name: '',
  });

  // Oracle 연결 목록 조회
  const { data: connections } = useQuery<OracleConnection[]>({
    queryKey: ['oracle-connections'],
    queryFn: async () => {
      const res = await fetch('/api/oracle/connections');
      if (!res.ok) throw new Error('Failed to fetch connections');
      return res.json();
    },
  });

  // Plan Baselines 조회
  const { data: baselinesData, isLoading } = useQuery({
    queryKey: ['plan-baselines', selectedConnection],
    queryFn: async () => {
      const url =
        selectedConnection === 'all'
          ? '/api/plan-baselines'
          : `/api/plan-baselines?connection_id=${selectedConnection}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch baselines');
      const result = await res.json();
      return result.data || [];
    },
  });

  const baselines = baselinesData as PlanBaseline[] | undefined;

  // Baseline 생성 mutation
  const createBaselineMutation = useMutation({
    mutationFn: async (data: CreateBaselineForm) => {
      const res = await fetch('/api/plan-baselines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oracle_connection_id: data.oracle_connection_id,
          sql_id: data.sql_id,
          plan_hash_value: parseInt(data.plan_hash_value),
          plan_name: data.plan_name,
          sql_handle: `SQL_${data.sql_id}`,
          is_enabled: true,
          is_accepted: true,
          is_fixed: false,
          plan_table: {},
          executions: 0,
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create baseline');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Baseline이 성공적으로 생성되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['plan-baselines'] });
      setIsCreateDialogOpen(false);
      setFormData({
        oracle_connection_id: '',
        sql_id: '',
        plan_hash_value: '',
        plan_name: '',
      });
    },
    onError: (error: Error) => {
      toast.error(`Baseline 생성 실패: ${error.message}`);
    },
  });

  // Baseline 삭제 mutation
  const deleteBaselineMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/plan-baselines/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete baseline');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Baseline이 성공적으로 삭제되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['plan-baselines'] });
    },
    onError: (error: Error) => {
      toast.error(`Baseline 삭제 실패: ${error.message}`);
    },
  });

  const handleCreateBaseline = () => {
    if (!formData.oracle_connection_id) {
      toast.error('DB 연결을 선택해주세요.');
      return;
    }
    if (!formData.sql_id) {
      toast.error('SQL ID를 입력해주세요.');
      return;
    }
    if (!formData.plan_hash_value) {
      toast.error('Plan Hash Value를 입력해주세요.');
      return;
    }
    if (!formData.plan_name) {
      toast.error('Plan Name을 입력해주세요.');
      return;
    }

    createBaselineMutation.mutate(formData);
  };

  const handleDeleteBaseline = (id: string, planName: string) => {
    if (window.confirm(`'${planName}' Baseline을 삭제하시겠습니까?`)) {
      deleteBaselineMutation.mutate(id);
    }
  };

  // 검색 필터링
  const filteredBaselines = baselines?.filter((baseline) => {
    const matchesSearch =
      (baseline.sql_handle?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
      baseline.plan_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      baseline.sql_id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'enabled' && baseline.is_enabled) ||
      (statusFilter === 'disabled' && !baseline.is_enabled) ||
      (statusFilter === 'fixed' && baseline.is_fixed);

    return matchesSearch && matchesStatus;
  });

  // 통계 계산
  const stats = {
    total: baselines?.length || 0,
    enabled: baselines?.filter((b) => b.is_enabled).length || 0,
    fixed: baselines?.filter((b) => b.is_fixed).length || 0,
    accepted: baselines?.filter((b) => b.is_accepted).length || 0,
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">SQL Plan Baselines</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            SQL 실행계획을 고정하여 성능 회귀를 방지합니다
          </p>
          {globalSelectedConnection && (
            <p className="text-sm text-muted-foreground mt-1">
              연결: <span className="font-medium">{globalSelectedConnection.name}</span> ({globalSelectedConnection.host}:{globalSelectedConnection.port})
            </p>
          )}
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Baseline 생성
        </Button>
      </div>

      {/* 통계 카드 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              총 Baselines
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              활성화됨
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.enabled}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              고정됨
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats.fixed}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              승인됨
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.accepted}</div>
          </CardContent>
        </Card>
      </div>

      {/* 안내 메시지 */}
      <Card className="border-blue-500 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="text-sm space-y-2">
              <p className="font-medium text-blue-900">SQL Plan Baseline이란?</p>
              <p className="text-blue-800">
                SQL Plan Baseline은 검증된 실행계획을 고정하여 데이터베이스가 다른
                (잠재적으로 느린) 실행계획을 선택하지 못하도록 방지하는 기능입니다.
              </p>
              <ul className="text-blue-800 space-y-1 list-disc list-inside">
                <li>성능 회귀 방지</li>
                <li>실행계획 안정성 보장</li>
                <li>업그레이드 시 성능 유지</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 필터 */}
      <Card>
        <CardHeader>
          <CardTitle>필터</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Input
              placeholder="SQL Handle, Plan Name 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            <Select value={selectedConnection} onValueChange={setSelectedConnection}>
              <SelectTrigger>
                <SelectValue placeholder="DB 연결" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 DB</SelectItem>
                {connections?.map((conn) => (
                  <SelectItem key={conn.id} value={conn.id}>
                    {conn.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                <SelectItem value="enabled">활성화됨</SelectItem>
                <SelectItem value="disabled">비활성화됨</SelectItem>
                <SelectItem value="fixed">고정됨</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Baselines 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>Plan Baselines ({filteredBaselines?.length || 0}건)</CardTitle>
          <CardDescription>등록된 SQL Plan Baseline 목록</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={`skeleton-baselines-${i}`} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredBaselines && filteredBaselines.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SQL ID</TableHead>
                    <TableHead>Plan Name</TableHead>
                    <TableHead>Plan Hash</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>실행 횟수</TableHead>
                    <TableHead>평균 응답시간</TableHead>
                    <TableHead>생성일</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBaselines.map((baseline) => (
                    <TableRow key={baseline.id}>
                      <TableCell className="font-mono text-xs">
                        {baseline.sql_id}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {baseline.plan_name}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {baseline.plan_hash_value}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {baseline.is_enabled && (
                            <Badge variant="default">
                              <Check className="h-3 w-3 mr-1" />
                              Enabled
                            </Badge>
                          )}
                          {baseline.is_fixed && (
                            <Badge variant="secondary">
                              <Shield className="h-3 w-3 mr-1" />
                              Fixed
                            </Badge>
                          )}
                          {!baseline.is_enabled && (
                            <Badge variant="destructive">
                              <X className="h-3 w-3 mr-1" />
                              Disabled
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {baseline.executions.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm">
                        {baseline.avg_elapsed_time_ms
                          ? `${baseline.avg_elapsed_time_ms.toFixed(2)}ms`
                          : '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(baseline.created_at).toLocaleDateString('ko-KR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleDeleteBaseline(baseline.id, baseline.plan_name)
                          }
                          disabled={deleteBaselineMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>등록된 Plan Baseline이 없습니다.</p>
              <p className="text-sm mt-2">
                성능이 검증된 실행계획을 Baseline으로 등록하세요.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Baseline 생성 다이얼로그 */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>SQL Plan Baseline 생성</DialogTitle>
            <DialogDescription>
              SQL 실행계획을 Baseline으로 등록하여 성능 회귀를 방지합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="connection">DB 연결 *</Label>
              <Select
                value={formData.oracle_connection_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, oracle_connection_id: value })
                }
              >
                <SelectTrigger id="connection">
                  <SelectValue placeholder="DB 연결 선택" />
                </SelectTrigger>
                <SelectContent>
                  {connections?.map((conn) => (
                    <SelectItem key={conn.id} value={conn.id}>
                      {conn.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sql_id">SQL ID *</Label>
              <Input
                id="sql_id"
                placeholder="예: 1a2b3c4d5e6f7"
                value={formData.sql_id}
                onChange={(e) =>
                  setFormData({ ...formData, sql_id: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                V$SQL 또는 DBA_HIST_SQLSTAT에서 확인한 SQL ID를 입력하세요.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="plan_hash">Plan Hash Value *</Label>
              <Input
                id="plan_hash"
                type="number"
                placeholder="예: 123456789"
                value={formData.plan_hash_value}
                onChange={(e) =>
                  setFormData({ ...formData, plan_hash_value: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                고정할 실행계획의 Plan Hash Value를 입력하세요.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="plan_name">Plan Name *</Label>
              <Input
                id="plan_name"
                placeholder="예: BASELINE_OPTIMAL_PLAN"
                value={formData.plan_name}
                onChange={(e) =>
                  setFormData({ ...formData, plan_name: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Baseline을 식별할 수 있는 고유한 이름을 입력하세요.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
              disabled={createBaselineMutation.isPending}
            >
              취소
            </Button>
            <Button
              onClick={handleCreateBaseline}
              disabled={createBaselineMutation.isPending}
            >
              {createBaselineMutation.isPending ? '생성 중...' : 'Baseline 생성'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
