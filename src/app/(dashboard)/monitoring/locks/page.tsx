'use client';

/**
 * Locks Monitoring Page
 * Oracle Lock 모니터링 및 관리
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, RefreshCw, AlertTriangle, XCircle, Loader2, Clock, Skull, ArrowLeftRight } from 'lucide-react';
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
  object_owner: string | null;
  object_name: string | null;
  object_type: string | null;
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

interface DeadlockInfo {
  deadlock_time: string;
  inst_id: number;
  message?: string;
  session1_sid?: number;
  session1_serial?: number;
  session1_user?: string;
  session1_machine?: string;
  session1_sql_id?: string;
  session2_sid?: number;
  session2_serial?: number;
  session2_user?: string;
  session2_machine?: string;
  session2_sql_id?: string;
  object_name?: string;
  row_wait_obj?: number;
  event?: string;
  is_current?: boolean;
}

export default function LocksPage() {
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [killDialogOpen, setKillDialogOpen] = useState(false);
  const [lockToRelease, setLockToRelease] = useState<LockInfo | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const effectiveConnectionId = selectedConnectionId || 'all';

  // Locks 조회 (캐싱 최적화)
  const {
    data: locksData,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<{ data: LockInfo[]; deadlocks: DeadlockInfo[]; deadlockCount: number }>({
    queryKey: ['locks', effectiveConnectionId],
    queryFn: async () => {
      if (effectiveConnectionId === 'all') {
        return { data: [], deadlocks: [], deadlockCount: 0 };
      }
      const params = new URLSearchParams({
        connection_id: effectiveConnectionId,
      });
      const res = await fetch(`/api/monitoring/locks?${params}`);
      if (!res.ok) throw new Error('Failed to fetch locks');
      return res.json();
    },
    enabled: effectiveConnectionId !== 'all',
    refetchInterval: 15000, // 15초마다 자동 새로고침
    staleTime: 10 * 1000, // 10초간 캐시 유지
    gcTime: 60 * 1000, // 1분간 가비지 컬렉션 방지
    refetchOnWindowFocus: false, // 윈도우 포커스 시 재요청 비활성화
    placeholderData: (previousData) => previousData, // 이전 데이터 유지
  });

  const locks = locksData?.data || [];
  const deadlocks = locksData?.deadlocks || [];

  // 위험도별 필터링 및 검색
  const filteredLocks = locks.filter((lock) => {
    // 검색어 필터
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || (
      lock.object_name?.toLowerCase().includes(searchLower) ||
      lock.holding_username?.toLowerCase().includes(searchLower) ||
      lock.holding_machine?.toLowerCase().includes(searchLower) ||
      lock.sql_id?.toLowerCase().includes(searchLower)
    );

    // 위험도 필터
    let matchesRisk = true;
    if (riskFilter === 'blocking') {
      matchesRisk = !!lock.waiting_session;
    } else if (riskFilter === 'exclusive') {
      matchesRisk = lock.locked_mode === 6;
    } else if (riskFilter === 'long') {
      matchesRisk = lock.lock_duration_sec > 300;
    }

    return matchesSearch && matchesRisk;
  });

  // 통계 계산
  const stats = {
    total: filteredLocks.length,
    blocking: filteredLocks.filter((l) => l.waiting_session).length,
    exclusive: filteredLocks.filter((l) => l.locked_mode === 6).length,
    longRunning: filteredLocks.filter((l) => l.lock_duration_sec > 300).length, // 5분 이상
    deadlocks: deadlocks.length,
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
        <div className="grid gap-4 md:grid-cols-5">
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

          <Card className={stats.deadlocks > 0 ? 'border-red-500 bg-red-50' : ''}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Deadlocks (24h)</CardTitle>
              <Skull className={`h-4 w-4 ${stats.deadlocks > 0 ? 'text-red-600' : 'text-muted-foreground'}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${stats.deadlocks > 0 ? 'text-red-600' : ''}`}>
                {stats.deadlocks}
              </div>
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

              {/* 위험도 필터 */}
              <Select value={riskFilter} onValueChange={setRiskFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="위험도 필터" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 (위험 Lock만)</SelectItem>
                  <SelectItem value="blocking">Blocking Lock</SelectItem>
                  <SelectItem value="exclusive">Exclusive Lock</SelectItem>
                  <SelectItem value="long">장시간 Lock (5분+)</SelectItem>
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
            <CardTitle>위험 Locks 목록 ({filteredLocks.length}건)</CardTitle>
            <CardDescription>
              Blocking, Exclusive, 장시간 Lock만 표시 (15초마다 자동 새로고침)
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
                            <div className="font-medium">{lock.object_name || `Object ID: ${lock.object_id}`}</div>
                            {lock.object_owner && lock.object_type && (
                              <div className="text-xs text-muted-foreground">
                                {lock.object_owner}.{lock.object_type}
                              </div>
                            )}
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
                    {lockToRelease.object_owner && lockToRelease.object_name
                      ? `${lockToRelease.object_owner}.${lockToRelease.object_name}`
                      : `Object ID: ${lockToRelease.object_id}`}
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

      {/* Deadlock 이력 섹션 */}
      {effectiveConnectionId !== 'all' && (
        <Card className={deadlocks.length > 0 ? 'border-red-300' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Skull className={`h-5 w-5 ${deadlocks.length > 0 ? 'text-red-600' : 'text-muted-foreground'}`} />
              Deadlock 이력 (최근 24시간)
            </CardTitle>
            <CardDescription>
              교착 상태(Deadlock) 발생 이력 및 관련 세션 정보
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={`deadlock-skeleton-${i}`} className="h-20 w-full" />
                ))}
              </div>
            ) : deadlocks.length > 0 ? (
              <div className="space-y-4">
                {deadlocks.map((deadlock, index) => (
                  <div
                    key={`deadlock-${deadlock.deadlock_time}-${index}`}
                    className="border border-red-200 rounded-lg p-4 bg-red-50"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive" className="gap-1">
                          <Skull className="h-3 w-3" />
                          Deadlock
                        </Badge>
                        {deadlock.is_current && (
                          <Badge variant="outline" className="text-red-600 border-red-600">
                            현재 발생 중
                          </Badge>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {new Date(deadlock.deadlock_time).toLocaleString('ko-KR')}
                      </span>
                    </div>

                    {deadlock.message ? (
                      <div className="bg-white rounded p-3 border">
                        <p className="text-sm font-mono text-red-800">{deadlock.message}</p>
                      </div>
                    ) : (
                      <div className="grid md:grid-cols-2 gap-4">
                        {/* Session 1 */}
                        <div className="bg-white rounded p-3 border">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline">Session 1</Badge>
                          </div>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">SID,Serial#:</span>
                              <span className="font-mono">{deadlock.session1_sid},{deadlock.session1_serial}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">User:</span>
                              <span>{deadlock.session1_user || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Machine:</span>
                              <span className="truncate max-w-[150px]">{deadlock.session1_machine || '-'}</span>
                            </div>
                            {deadlock.session1_sql_id && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">SQL ID:</span>
                                <span className="font-mono text-xs">{deadlock.session1_sql_id}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Arrow */}
                        <div className="hidden md:flex items-center justify-center absolute left-1/2 transform -translate-x-1/2">
                          <ArrowLeftRight className="h-6 w-6 text-red-400" />
                        </div>

                        {/* Session 2 */}
                        <div className="bg-white rounded p-3 border">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline">Session 2</Badge>
                          </div>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">SID,Serial#:</span>
                              <span className="font-mono">{deadlock.session2_sid},{deadlock.session2_serial}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">User:</span>
                              <span>{deadlock.session2_user || '-'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Machine:</span>
                              <span className="truncate max-w-[150px]">{deadlock.session2_machine || '-'}</span>
                            </div>
                            {deadlock.session2_sql_id && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">SQL ID:</span>
                                <span className="font-mono text-xs">{deadlock.session2_sql_id}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {deadlock.event && (
                      <div className="mt-3 text-xs text-muted-foreground">
                        Wait Event: {deadlock.event}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Skull className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>최근 24시간 내 Deadlock이 발생하지 않았습니다.</p>
                <p className="text-sm mt-1">정상적인 상태입니다.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 안내 메시지 */}
      {effectiveConnectionId !== 'all' && (
        <Card className="border-blue-500 bg-blue-50">
          <CardContent className="pt-6">
            <div className="text-sm space-y-2">
              <p className="font-medium text-blue-900">⚠️ 위험 Lock 모니터링 안내</p>
              <ul className="text-blue-800 space-y-1 list-disc list-inside">
                <li><strong>표시 대상:</strong> Blocking Lock, Exclusive Lock(모드 6), Share Lock 이상(모드 4+), 장시간 Lock(5분+)만 표시됩니다</li>
                <li><strong>Blocking Lock:</strong> 다른 세션을 대기시키는 Lock으로 즉각적인 확인이 필요합니다</li>
                <li><strong>Exclusive Lock:</strong> 가장 강력한 Lock으로 다른 모든 접근을 차단합니다</li>
                <li><strong>Lock 해제:</strong> 세션을 강제 종료하므로 신중히 사용하세요</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
