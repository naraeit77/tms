'use client';

/**
 * Sessions Monitoring Page
 * 세션 모니터링 페이지
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, RefreshCw, AlertTriangle, XCircle, Loader2, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { useToast } from '@/hooks/use-toast';

interface Session {
  id: string;
  oracle_connection_id: string;
  sid: number;
  serial_number: number;
  username?: string;
  osuser?: string;
  machine?: string;
  program?: string;
  module?: string;
  status?: string;
  state?: string;
  sql_id?: string;
  sql_text?: string;
  event?: string;
  wait_class?: string;
  wait_time_ms?: number;
  logical_reads?: number;
  physical_reads?: number;
  cpu_time_ms?: number;
  logon_time?: string;
  last_call_et?: number;
  blocking_session?: number;
  blocking_session_status?: string;
  collected_at: string;
}

export default function SessionsPage() {
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [killDialogOpen, setKillDialogOpen] = useState(false);
  const [sessionToKill, setSessionToKill] = useState<Session | null>(null);
  const [selectedSqlId, setSelectedSqlId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Use the global selected connection ID or 'all'
  const effectiveConnectionId = selectedConnectionId || 'all';

  // Sessions 조회
  const {
    data: sessionsData,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['sessions', effectiveConnectionId, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '100',
      });

      if (effectiveConnectionId !== 'all') {
        params.append('connection_id', effectiveConnectionId);
      }

      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      const res = await fetch(`/api/monitoring/sessions?${params}`);
      if (!res.ok) throw new Error('Failed to fetch sessions');
      return res.json();
    },
    refetchInterval: 10000, // 10초마다 자동 새로고침
  });

  const rawSessions: Session[] = sessionsData?.data || [];

  // 중복 제거 - 동일한 oracle_connection_id, sid, serial_number 조합은 하나만 유지
  const uniqueSessionsMap = new Map<string, Session>();
  rawSessions.forEach(session => {
    const key = `${session.oracle_connection_id}-${session.sid}-${session.serial_number}`;
    if (!uniqueSessionsMap.has(key)) {
      uniqueSessionsMap.set(key, session);
    } else {
      console.warn(`Duplicate session detected and filtered: ${key}`);
    }
  });
  const sessions = Array.from(uniqueSessionsMap.values());

  // 디버깅을 위한 로그
  if (rawSessions.length !== sessions.length) {
    console.log(`Filtered ${rawSessions.length - sessions.length} duplicate sessions`);
    console.log('Raw sessions count:', rawSessions.length, 'Unique sessions count:', sessions.length);
  }

  // 검색 및 상태 필터링
  const filteredSessions = sessions.filter((session) => {
    // 검색어 필터링
    const matchesSearch =
      !searchTerm ||
      session.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.osuser?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.machine?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.program?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.sql_id?.toLowerCase().includes(searchTerm.toLowerCase());

    // 상태 필터링
    const matchesStatus =
      statusFilter === 'all' || session.status === statusFilter.toUpperCase();

    return matchesSearch && matchesStatus;
  });

  // 통계 계산
  const stats = {
    total: filteredSessions.length,
    active: filteredSessions.filter((s) => s.status === 'ACTIVE').length,
    inactive: filteredSessions.filter((s) => s.status === 'INACTIVE').length,
    blocked: filteredSessions.filter((s) => s.blocking_session).length,
  };

  // 세션 킬 mutation
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
        title: '세션 종료 성공',
        description: data.message || '세션이 성공적으로 종료되었습니다.',
      });
      // 세션 목록 새로고침
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setKillDialogOpen(false);
      setSessionToKill(null);
    },
    onError: (error: Error) => {
      toast({
        title: '세션 종료 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // 세션 킬 핸들러
  const handleKillSession = (session: Session) => {
    setSessionToKill(session);
    setKillDialogOpen(true);
  };

  const confirmKillSession = () => {
    if (sessionToKill && effectiveConnectionId !== 'all') {
      killSessionMutation.mutate({
        connectionId: effectiveConnectionId,
        sid: sessionToKill.sid,
        serial: sessionToKill.serial_number,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Sessions</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Oracle 데이터베이스 세션 모니터링
          </p>
          {selectedConnection && (
            <p className="text-sm text-muted-foreground mt-1">
              연결: <span className="font-medium">{selectedConnection.name}</span> ({selectedConnection.host}:{selectedConnection.port})
            </p>
          )}
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              총 세션
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active 세션
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.active}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Inactive 세션
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-600">{stats.inactive}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Blocked 세션
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{stats.blocked}</div>
          </CardContent>
        </Card>
      </div>

      {/* 필터 */}
      <Card>
        <CardHeader>
          <CardTitle>필터</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            {/* 검색 */}
            <Input
              placeholder="사용자명, 머신, 프로그램 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            {/* DB 연결 - 현재 글로벌 선택기 사용 */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/50">
              <span className="text-sm text-muted-foreground">
                연결: <span className="font-medium text-foreground">
                  {selectedConnection?.name || '전체 DB'}
                </span>
              </span>
            </div>

            {/* 상태 필터 */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
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

      {/* Sessions 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>Sessions 목록 ({filteredSessions.length}건)</CardTitle>
          <CardDescription>
            실시간 세션 정보 (10초마다 자동 새로고침)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={`session-skeleton-${i}`} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredSessions.length > 0 ? (
            <div className="space-y-3">
              {filteredSessions.map((session) => (
                <div
                  key={`${session.oracle_connection_id}-${session.sid}-${session.serial_number}`}
                  className={`border rounded-lg p-4 hover:shadow-md transition-shadow ${
                    session.blocking_session ? 'bg-red-50 border-red-200' : ''
                  }`}
                >
                  {/* 세션 헤더 */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">SID</span>
                        <span className="font-mono text-lg font-bold">{session.sid}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Serial#</span>
                        <span className="font-mono text-sm text-muted-foreground">
                          {session.serial_number}
                        </span>
                      </div>
                      <Badge variant={session.status === 'ACTIVE' ? 'default' : 'secondary'}>
                        {session.status}
                      </Badge>
                      {session.blocking_session && (
                        <Badge variant="destructive">
                          Blocked by SID {session.blocking_session}
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleKillSession(session)}
                      disabled={effectiveConnectionId === 'all'}
                      className="flex-shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                      title={effectiveConnectionId === 'all' ? '연결을 선택해주세요' : '세션 종료'}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      세션 종료
                    </Button>
                  </div>

                  {/* 세션 정보 그리드 */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Username</div>
                      <div className="font-medium">{session.username || '-'}</div>
                    </div>

                    {session.sql_id && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">SQL ID</div>
                        <button
                          onClick={() => setSelectedSqlId(session.sql_id!)}
                          className="font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                        >
                          {session.sql_id}
                        </button>
                      </div>
                    )}

                    <div>
                      <div className="text-xs text-muted-foreground mb-1">CPU (ms)</div>
                      <div className="font-medium">
                        {session.cpu_time_ms?.toLocaleString() || '0'}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Logical Reads</div>
                      <div className="font-medium">
                        {session.logical_reads?.toLocaleString() || '0'}
                      </div>
                    </div>

                    {session.event && (
                      <div className="col-span-2">
                        <div className="text-xs text-muted-foreground mb-1">Event</div>
                        <div className="text-xs truncate">{session.event}</div>
                      </div>
                    )}

                    {session.wait_class && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Wait Class</div>
                        <Badge variant="outline" className="text-xs">
                          {session.wait_class}
                        </Badge>
                      </div>
                    )}

                    {session.machine && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Machine</div>
                        <div className="text-xs truncate">{session.machine}</div>
                      </div>
                    )}

                    {session.program && (
                      <div className="col-span-2">
                        <div className="text-xs text-muted-foreground mb-1">Program</div>
                        <div className="text-xs truncate">{session.program}</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>조회된 세션이 없습니다.</p>
              <p className="text-sm mt-2">필터 조건을 변경하거나 데이터 수집을 진행해주세요.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Blocked Sessions 알림 */}
      {stats.blocked > 0 && (
        <Card className="border-red-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Blocked Sessions 감지
            </CardTitle>
            <CardDescription>
              {stats.blocked}개의 세션이 블로킹 상태입니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {filteredSessions
                .filter((s) => s.blocking_session)
                .map((session) => (
                  <div
                    key={`blocked-${session.oracle_connection_id}-${session.sid}-${session.serial_number}`}
                    className="flex items-center justify-between p-3 bg-red-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium">
                        <span className="font-mono font-semibold">SID {session.sid}</span>
                        <span className="font-mono text-muted-foreground"> / Serial# {session.serial_number}</span>
                        <span> ({session.username})</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Blocked by SID {session.blocking_session}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive">Blocked</Badge>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleKillSession(session)}
                        disabled={effectiveConnectionId === 'all'}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        세션 종료
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 세션 종료 확인 다이얼로그 */}
      <Dialog open={killDialogOpen} onOpenChange={setKillDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              세션 종료 확인
            </DialogTitle>
            <DialogDescription>
              이 작업은 되돌릴 수 없습니다. 정말로 이 세션을 강제 종료하시겠습니까?
            </DialogDescription>
          </DialogHeader>

          {sessionToKill && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-muted-foreground">SID:</span>
                  <span className="text-sm font-mono font-semibold">
                    {sessionToKill.sid}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Serial#:</span>
                  <span className="text-sm font-mono text-muted-foreground">
                    {sessionToKill.serial_number}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Username:</span>
                  <span className="text-sm">{sessionToKill.username || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Status:</span>
                  <Badge variant={sessionToKill.status === 'ACTIVE' ? 'default' : 'secondary'}>
                    {sessionToKill.status}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Machine:</span>
                  <span className="text-sm truncate max-w-xs">{sessionToKill.machine || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Program:</span>
                  <span className="text-sm truncate max-w-xs">{sessionToKill.program || '-'}</span>
                </div>
                {sessionToKill.sql_id && (
                  <div className="flex justify-between">
                    <span className="text-sm font-medium text-muted-foreground">SQL ID:</span>
                    <span className="text-sm font-mono">{sessionToKill.sql_id}</span>
                  </div>
                )}
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-800">
                  <strong>경고:</strong> 이 세션을 강제 종료하면 진행 중인 트랜잭션이 롤백되고,
                  세션에서 실행 중인 모든 작업이 중단됩니다.
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
              onClick={confirmKillSession}
              disabled={killSessionMutation.isPending}
            >
              {killSessionMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  종료 중...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  세션 종료
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SQL 상세 정보 다이얼로그 */}
      {selectedSqlId && selectedConnectionId && (
        <SQLDetailDialog
          sqlId={selectedSqlId}
          connectionId={selectedConnectionId}
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
                      {detailData.execution_plan.map((step: any, index: number) => (
                        <tr key={`plan-step-${index}-${step.id}`} className="border-b">
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
                        <tr key={`bind-${idx}-${bind.name}-${bind.position}`} className="border-b">
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
