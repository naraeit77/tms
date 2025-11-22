'use client';

/**
 * Oracle Connection Management Page
 * Oracle DB 연결 관리 화면
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Database, Activity, Play, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

interface OracleConnection {
  id: string;
  name: string;
  description?: string;
  host: string;
  port: number;
  service_name?: string;
  sid?: string;
  username: string;
  connection_type: 'SERVICE_NAME' | 'SID';
  oracle_version?: string;
  oracle_edition?: string;
  is_active: boolean;
  is_default: boolean;
  health_status?: 'HEALTHY' | 'WARNING' | 'ERROR' | 'UNKNOWN';
  last_health_check_at?: string;
  last_connected_at?: string;
  created_at: string;
}

interface NewConnectionForm {
  name: string;
  description: string;
  host: string;
  port: number;
  service_name: string;
  sid: string;
  username: string;
  password: string;
  connection_type: 'SERVICE_NAME' | 'SID';
  is_active: boolean;
  is_default: boolean;
}

export default function ConnectionsPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 초기 폼 상태
  const initialFormState: NewConnectionForm = {
    name: '',
    description: '',
    host: '',
    port: 1521,
    service_name: '',
    sid: '',
    username: '',
    password: '',
    connection_type: 'SERVICE_NAME',
    is_active: true,
    is_default: false,
  };

  const [formData, setFormData] = useState<NewConnectionForm>(initialFormState);

  // 연결 목록 조회
  const { data: connections, isLoading } = useQuery<OracleConnection[]>({
    queryKey: ['oracle-connections'],
    queryFn: async () => {
      const res = await fetch('/api/oracle/connections');
      if (!res.ok) throw new Error('Failed to fetch connections');
      return res.json();
    },
  });

  // 연결 추가 Mutation
  const addConnectionMutation = useMutation({
    mutationFn: async (data: NewConnectionForm) => {
      const res = await fetch('/api/oracle/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to add connection');
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['oracle-connections'] });
      setIsAddDialogOpen(false);
      setFormData(initialFormState);
      toast({
        title: '연결 추가 완료',
        description: 'Oracle DB 연결이 성공적으로 추가되었습니다.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: '연결 추가 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // 연결 테스트 Mutation
  const testConnectionMutation = useMutation({
    mutationFn: async (data: NewConnectionForm) => {
      const res = await fetch('/api/oracle/connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Connection test failed');
      }

      return res.json();
    },
    onSuccess: (data) => {
      setTestResult({ success: true, message: '연결 테스트 성공!' });
      toast({
        title: '연결 테스트 성공',
        description: `Oracle ${data.version || ''} 연결 확인됨`,
      });
    },
    onError: (error: Error) => {
      setTestResult({ success: false, message: error.message });
      toast({
        title: '연결 테스트 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Health Check Mutation
  const healthCheckMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await fetch(`/api/oracle/connections/${connectionId}/health`);
      if (!res.ok) throw new Error('Health check failed');
      return res.json();
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['oracle-connections'] });
      const healthData = response.data;
      const statusText = healthData.isHealthy
        ? `정상 (${healthData.version || 'Unknown'}, ${healthData.responseTime}ms)`
        : '연결 실패';
      toast({
        title: 'Health Check 완료',
        description: `상태: ${statusText}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Health Check 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // 데이터 수집 (활성화) Mutation
  const collectDataMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await fetch('/api/monitoring/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connectionId }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.details || error.error || '활성화 실패');
      }
      return res.json();
    },
    onSuccess: (data) => {
      console.log('Collection response:', data);
      const total = data.total ?? data.collected ?? 0;
      const collected = data.collected ?? 0;
      const errors = data.errors ?? 0;

      toast({
        title: '활성화 완료',
        description: `SQL 정보 수집됨 (전체: ${total}, 성공: ${collected}, 실패: ${errors})`,
      });
    },
    onError: (error: Error) => {
      console.error('Collect data error:', error);
      toast({
        title: '활성화 실패',
        description: error.message || 'SQL 통계 수집 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    },
  });

  // 연결 삭제 Mutation
  const deleteConnectionMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      console.log('[DELETE] Attempting to delete connection:', connectionId);
      const res = await fetch(`/api/oracle/connections/${connectionId}`, {
        method: 'DELETE',
      });
      console.log('[DELETE] Response status:', res.status);

      if (!res.ok) {
        const error = await res.json();
        console.error('[DELETE] Error response:', error);
        throw new Error(error.error || '연결 삭제 실패');
      }
      const result = await res.json();
      console.log('[DELETE] Success:', result);
      return result;
    },
    onSuccess: () => {
      console.log('[DELETE] Mutation success - invalidating queries');
      queryClient.invalidateQueries({ queryKey: ['oracle-connections'] });
      toast({
        title: '연결 삭제 완료',
        description: 'DB 연결이 성공적으로 삭제되었습니다.',
      });
    },
    onError: (error: Error) => {
      console.error('[DELETE] Mutation error:', error);
      toast({
        title: '연결 삭제 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTestResult(null);
    addConnectionMutation.mutate(formData);
  };

  const handleTestConnection = () => {
    setTestResult(null);
    testConnectionMutation.mutate(formData);
  };

  const handleHealthCheck = (connectionId: string) => {
    healthCheckMutation.mutate(connectionId);
  };

  const handleCollectData = (connectionId: string) => {
    collectDataMutation.mutate(connectionId);
  };

  const handleDelete = (connectionId: string) => {
    deleteConnectionMutation.mutate(connectionId);
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">DB 연결 관리</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Oracle 데이터베이스 연결 추가 및 관리
          </p>
        </div>

        {/* 연결 추가 버튼 */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              연결 추가
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>새 Oracle DB 연결 추가</DialogTitle>
              <DialogDescription>
                Oracle 데이터베이스 연결 정보를 입력해주세요.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                {/* 연결 이름 */}
                <div className="grid gap-2">
                  <Label htmlFor="name">연결 이름 *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="예: Production DB"
                    required
                  />
                </div>

                {/* 설명 */}
                <div className="grid gap-2">
                  <Label htmlFor="description">설명</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="연결에 대한 간단한 설명"
                    rows={2}
                  />
                </div>

                {/* 호스트 & 포트 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="host">호스트 *</Label>
                    <Input
                      id="host"
                      value={formData.host}
                      onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                      placeholder="localhost"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="port">포트 *</Label>
                    <Input
                      id="port"
                      type="number"
                      value={formData.port}
                      onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                      required
                    />
                  </div>
                </div>

                {/* 연결 타입 */}
                <div className="grid gap-2">
                  <Label htmlFor="connection_type">연결 타입 *</Label>
                  <Select
                    value={formData.connection_type}
                    onValueChange={(value: 'SERVICE_NAME' | 'SID') =>
                      setFormData({ ...formData, connection_type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SERVICE_NAME">Service Name</SelectItem>
                      <SelectItem value="SID">SID</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Service Name / SID */}
                {formData.connection_type === 'SERVICE_NAME' ? (
                  <div className="grid gap-2">
                    <Label htmlFor="service_name">Service Name *</Label>
                    <Input
                      id="service_name"
                      value={formData.service_name}
                      onChange={(e) => setFormData({ ...formData, service_name: e.target.value })}
                      placeholder="ORCL"
                      required
                    />
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <Label htmlFor="sid">SID *</Label>
                    <Input
                      id="sid"
                      value={formData.sid}
                      onChange={(e) => setFormData({ ...formData, sid: e.target.value })}
                      placeholder="ORCL"
                      required
                    />
                  </div>
                )}

                {/* 사용자명 & 비밀번호 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="username">사용자명 *</Label>
                    <Input
                      id="username"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      placeholder="system"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">비밀번호 *</Label>
                    <Input
                      id="password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {/* 연결 테스트 */}
                <div className="pt-4 border-t">
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={handleTestConnection}
                    disabled={testConnectionMutation.isPending}
                  >
                    <Activity className="h-4 w-4 mr-2" />
                    {testConnectionMutation.isPending ? '테스트 중...' : '연결 테스트'}
                  </Button>

                  {testResult && (
                    <div
                      className={`mt-3 p-3 rounded-md text-sm ${
                        testResult.success
                          ? 'bg-green-50 text-green-800 border border-green-200'
                          : 'bg-red-50 text-red-800 border border-red-200'
                      }`}
                    >
                      {testResult.success ? '✓ ' : '✗ '}
                      {testResult.message}
                    </div>
                  )}
                </div>

                {/* 옵션 */}
                <div className="space-y-3 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="is_active">활성화</Label>
                    <Switch
                      id="is_active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, is_active: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="is_default">기본 연결로 설정</Label>
                    <Switch
                      id="is_default"
                      checked={formData.is_default}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, is_default: checked })
                      }
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddDialogOpen(false)}
                >
                  취소
                </Button>
                <Button type="submit" disabled={addConnectionMutation.isPending}>
                  {addConnectionMutation.isPending ? '추가 중...' : '연결 추가'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* 연결 목록 */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : connections && connections.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {connections.map((conn) => (
            <ConnectionCard
              key={conn.id}
              connection={conn}
              onHealthCheck={handleHealthCheck}
              onCollectData={handleCollectData}
              onDelete={handleDelete}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Database className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-4">등록된 DB 연결이 없습니다.</p>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              첫 번째 연결 추가
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// 연결 카드 컴포넌트
interface ConnectionCardProps {
  connection: OracleConnection;
  onHealthCheck: (id: string) => void;
  onCollectData: (id: string) => void;
  onDelete: (id: string) => void;
}

function ConnectionCard({ connection, onHealthCheck, onCollectData, onDelete }: ConnectionCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const healthStatusColors = {
    HEALTHY: 'default',
    WARNING: 'outline',
    ERROR: 'destructive',
    UNKNOWN: 'secondary',
  } as const;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              {connection.name}
              {connection.is_default && (
                <Badge variant="secondary" className="text-xs">
                  기본
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1">
              {connection.description || `${connection.host}:${connection.port}`}
            </CardDescription>
          </div>
          {connection.health_status && (
            <Badge variant={healthStatusColors[connection.health_status]}>
              {connection.health_status}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">접속 정보:</span>
            <span className="font-mono text-xs">
              {connection.username}@{connection.host}:{connection.port}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">연결 타입:</span>
            <span>
              {connection.connection_type === 'SERVICE_NAME'
                ? connection.service_name
                : connection.sid}
            </span>
          </div>
          {connection.oracle_version && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Oracle 버전:</span>
              <span className="font-medium">{connection.oracle_version}</span>
            </div>
          )}
          {connection.oracle_edition && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Oracle Edition:</span>
              <Badge variant="outline" className="text-xs">
                {connection.oracle_edition}
              </Badge>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">상태:</span>
            <span>{connection.is_active ? '활성' : '비활성'}</span>
          </div>
          {connection.last_health_check_at && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">마지막 체크:</span>
              <span className="text-xs">
                {new Date(connection.last_health_check_at).toLocaleString('ko-KR')}
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onHealthCheck(connection.id)}
          >
            <Activity className="h-4 w-4 mr-2" />
            Health Check
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onCollectData(connection.id)}
          >
            <Play className="h-4 w-4 mr-2" />
            활성화
          </Button>
        </div>

        <div className="mt-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            연결 삭제
          </Button>
        </div>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>연결을 삭제하시겠습니까?</AlertDialogTitle>
              <AlertDialogDescription>
                <span className="font-semibold">{connection.name}</span> 연결을 삭제합니다.
                <br />이 작업은 되돌릴 수 없습니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onDelete(connection.id);
                  setShowDeleteDialog(false);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                삭제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
