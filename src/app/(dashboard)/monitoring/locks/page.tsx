'use client';

/**
 * Locks Monitoring Page
 * Oracle Lock 모니터링 및 관리
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, RefreshCw, AlertTriangle, XCircle, Loader2, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { useToast } from '@/hooks/use-toast';

interface LockInfo {
  id: string;
  oracle_connection_id: string;
  holding_session: number;
  holding_serial: number;
  holding_username?: string;
  holding_osuser?: string;
  holding_machine?: string;
  holding_program?: string;
  oracle_username?: string;
  os_user_name?: string;
  process?: string;
  object_id: number;
  object_owner: string;
  object_name: string;
  object_type: string;
  locked_mode: number;
  lock_mode_name: string;
  lock_duration_sec: number;
  sql_id?: string;
  sql_text?: string;
  waiting_session?: number;
  waiting_serial?: number;
  waiting_username?: string;
  waiting_event?: string;
  wait_time?: number;
  seconds_in_wait?: number;
  collected_at: string;
}

export default function LocksPage() {
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
  const [lockTypeFilter, setLockTypeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [killDialogOpen, setKillDialogOpen] = useState(false);
  const [lockToRelease, setLockToRelease] = useState<LockInfo | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const effectiveConnectionId = selectedConnectionId || 'all';

  // Locks 조회
  const {
    data: locksData,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<{ data: LockInfo[] }>({
    queryKey: ['locks', effectiveConnectionId, lockTypeFilter],
    queryFn: async () => {
      if (effectiveConnectionId === 'all') {
        return { data: [] };
      }
      const params = new URLSearchParams({
        connection_id: effectiveConnectionId,
      });
      if (lockTypeFilter !== 'all') {
        params.append('lock_type', lockTypeFilter);
      }
      const res = await fetch(`/api/monitoring/locks?${params}`);
      if (!res.ok) throw new Error('Failed to fetch locks');
      return res.json();
    },
    enabled: effectiveConnectionId !== 'all',
    refetchInterval: 10000, // 10초마다 자동 새로고침
  });

  const locks = locksData?.data || [];

  // 검색 필터링
  const filteredLocks = locks.filter((lock) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      lock.object_name.toLowerCase().includes(searchLower) ||
      lock.holding_username?.toLowerCase().includes(searchLower) ||
      lock.holding_machine?.toLowerCase().includes(searchLower) ||
      lock.sql_id?.toLowerCase().includes(searchLower)
    );
  });

  // 통계 계산
  const stats = {
    total: filteredLocks.length,
    blocking: filteredLocks.filter((l) => l.waiting_session).length,
    exclusive: filteredLocks.filter((l) => l.locked_mode === 6).length,
    longRunning: filteredLocks.filter((l) => l.lock_duration_sec > 300).length, // 5분 이상
  };

  // 세션 킬 mutation (Lock 해제를 위해)
  const killSessionMutation = useMutation({
    mutationFn: async ({ connectionId, sid, serial }: { connectionId: string; sid: number; serial: number }) => {
      const res = await fetch('/api/monitoring/sessions/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: connectionId,
          sid,
          serial,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to kill session');
      }

      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Lock 해제 성공',
        description: '세션을 종료하여 Lock을 해제했습니다.',
      });
      queryClient.invalidateQueries({ queryKey: ['locks'] });
      setKillDialogOpen(false);
      setLockToRelease(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Lock 해제 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleReleaseLock = (lock: LockInfo) => {
    setLockToRelease(lock);
    setKillDialogOpen(true);
  };

  const confirmReleaseLock = () => {
    if (lockToRelease && effectiveConnectionId !== 'all') {
      killSessionMutation.mutate({
        connectionId: effectiveConnectionId,
        sid: lockToRelease.holding_session,
        serial: lockToRelease.holding_serial,
      });
    }
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}초`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}분`;
    return `${Math.floor(seconds / 3600)}시간 ${Math.floor((seconds % 3600) / 60)}분`;
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Locks</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Oracle 데이터베이스 Lock 모니터링 및 관리
          </p>
          {selectedConnection && (
            <p className="text-sm text-muted-foreground mt-1">
              연결: <span className="font-medium">{selectedConnection.name}</span> ({selectedConnection.host}:{selectedConnection.port})
            </p>
          )}
        </div>
      </div>

      {/* 데이터베이스 선택 경고 */}
      {effectiveConnectionId === 'all' && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Lock 정보를 조회하려면 상단에서 데이터베이스를 선택해주세요.
          </AlertDescription>
        </Alert>
      )}

      {/* 통계 카드 */}
      {effectiveConnectionId !== 'all' && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">총 Locks</CardTitle>
              <Lock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Blocking Locks</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats.blocking}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Exclusive Locks</CardTitle>
              <XCircle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.exclusive}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">장시간 Lock</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.longRunning}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 필터 및 검색 */}
      {effectiveConnectionId !== 'all' && (
        <Card>
          <CardHeader>
            <CardTitle>필터</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {/* 검색 */}
              <Input
                placeholder="객체명, 사용자명, 머신 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />

              {/* Lock Type 필터 */}
              <Select value={lockTypeFilter} onValueChange={setLockTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Lock Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 타입</SelectItem>
                  <SelectItem value="TABLE">TABLE</SelectItem>
                  <SelectItem value="INDEX">INDEX</SelectItem>
                  <SelectItem value="VIEW">VIEW</SelectItem>
                  <SelectItem value="PACKAGE">PACKAGE</SelectItem>
                </SelectContent>
              </Select>

              {/* 새로고침 버튼 */}
              <Button
                variant="outline"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
                새로고침
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Locks 테이블 */}
      {effectiveConnectionId !== 'all' && (
        <Card>
          <CardHeader>
            <CardTitle>Locks 목록 ({filteredLocks.length}건)</CardTitle>
            <CardDescription>
              실시간 Lock 정보 (10초마다 자동 새로고침)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(10)].map((_, i) => (
                  <Skeleton key={`lock-skeleton-${i}`} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredLocks.length > 0 ? (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>객체</TableHead>
                      <TableHead>Lock Mode</TableHead>
                      <TableHead>Holding Session</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Waiting Session</TableHead>
                      <TableHead>SQL ID</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLocks.map((lock) => (
                      <TableRow
                        key={lock.id}
                        className={lock.waiting_session ? 'bg-orange-50' : ''}
                      >
                        <TableCell>
                          <div>
                            <div className="font-medium">{lock.object_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {lock.object_owner}.{lock.object_type}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              lock.locked_mode === 6
                                ? 'destructive'
                                : lock.locked_mode >= 4
                                ? 'default'
                                : 'secondary'
                            }
                          >
                            {lock.lock_mode_name}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-sm">
                            <span className="font-semibold">{lock.holding_session}</span>
                            <span className="text-muted-foreground">,{lock.holding_serial}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{lock.holding_username || '-'}</div>
                            <div className="text-xs text-muted-foreground">
                              {lock.holding_machine}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className={lock.lock_duration_sec > 300 ? 'text-yellow-600 font-medium' : ''}>
                              {formatDuration(lock.lock_duration_sec)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {lock.waiting_session ? (
                            <div className="flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 text-orange-600" />
                              <span className="font-mono text-sm text-orange-600">
                                {lock.waiting_session},{lock.waiting_serial}
                              </span>
                            </div>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {lock.sql_id || '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReleaseLock(lock)}
                            className="h-8 w-8 p-0"
                            title="Lock 해제 (세션 종료)"
                          >
                            <XCircle className="h-4 w-4 text-red-600" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Lock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>현재 활성화된 Lock이 없습니다.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Lock 해제 확인 다이얼로그 */}
      <Dialog open={killDialogOpen} onOpenChange={setKillDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Lock 해제 확인
            </DialogTitle>
            <DialogDescription>
              세션을 강제 종료하여 Lock을 해제합니다. 이 작업은 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>

          {lockToRelease && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-muted-foreground">객체:</span>
                  <span className="text-sm font-mono font-semibold">
                    {lockToRelease.object_owner}.{lockToRelease.object_name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Lock Mode:</span>
                  <Badge>{lockToRelease.lock_mode_name}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Holding Session:</span>
                  <span className="text-sm font-mono">
                    {lockToRelease.holding_session},{lockToRelease.holding_serial}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Username:</span>
                  <span className="text-sm">{lockToRelease.holding_username || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Duration:</span>
                  <span className="text-sm">{formatDuration(lockToRelease.lock_duration_sec)}</span>
                </div>
                {lockToRelease.waiting_session && (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Waiting Session:</span>
                    <span className="text-sm font-mono text-orange-600">
                      {lockToRelease.waiting_session},{lockToRelease.waiting_serial}
                    </span>
                  </div>
                )}
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-800">
                  <strong>경고:</strong> 세션을 강제 종료하면 진행 중인 트랜잭션이 롤백되고,
                  해당 Lock이 즉시 해제됩니다.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setKillDialogOpen(false)}
              disabled={killSessionMutation.isPending}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReleaseLock}
              disabled={killSessionMutation.isPending}
            >
              {killSessionMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  해제 중...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  Lock 해제
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 안내 메시지 */}
      {effectiveConnectionId !== 'all' && (
        <Card className="border-blue-500 bg-blue-50">
          <CardContent className="pt-6">
            <div className="text-sm space-y-2">
              <p className="font-medium text-blue-900">Lock 관리 안내</p>
              <ul className="text-blue-800 space-y-1 list-disc list-inside">
                <li>Blocking Lock은 다른 세션의 작업을 대기시키는 Lock입니다</li>
                <li>Exclusive Lock (모드 6)은 가장 강력한 Lock으로 주의가 필요합니다</li>
                <li>장시간 Lock (5분 이상)은 성능 문제를 일으킬 수 있습니다</li>
                <li>Lock 해제는 해당 세션을 강제 종료하므로 신중히 사용하세요</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
