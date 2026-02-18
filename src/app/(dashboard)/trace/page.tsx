'use client';

/**
 * SQL Trace Page
 * SQL 트레이스 관리
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { FileText, Download, Play, Square, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

interface TraceSession {
  id: string;
  session_id: number;
  sql_id?: string;
  trace_file: string;
  status: 'ACTIVE' | 'STOPPED' | 'COMPLETED';
  started_at: string;
  stopped_at?: string;
  file_size?: number;
}

export default function TracePage() {
  const [sessionId, setSessionId] = useState<string>('');
  const { selectedConnectionId, selectedConnection, connections } = useSelectedDatabase();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 선택된 데이터베이스 연결 ID 가져오기
  const effectiveConnectionId = selectedConnectionId || 'all';

  // 트레이스 세션 목록 조회
  const { data: traces, isLoading } = useQuery<TraceSession[]>({
    queryKey: ['trace-sessions', effectiveConnectionId],
    queryFn: async () => {
      if (effectiveConnectionId === 'all') return [];
      const res = await fetch(`/api/trace?connection_id=${effectiveConnectionId}`);
      if (!res.ok) throw new Error('Failed to fetch traces');
      const data = await res.json();
      return data.data || [];
    },
    enabled: effectiveConnectionId !== 'all',
    refetchInterval: 10000, // 10초마다 갱신
  });

  // 트레이스 시작
  const startTraceMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/trace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: effectiveConnectionId,
          session_id: parseInt(sessionId),
          action: 'start',
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to start trace');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: '트레이스 시작 성공',
        description: `세션 ${sessionId}에 대한 트레이스가 시작되었습니다.`,
      });
      queryClient.invalidateQueries({ queryKey: ['trace-sessions'] });
      setSessionId('');
    },
    onError: (error: Error) => {
      toast({
        title: '트레이스 시작 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // 트레이스 중지
  const stopTraceMutation = useMutation({
    mutationFn: async (traceSessionId: number) => {
      const res = await fetch('/api/trace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: effectiveConnectionId,
          session_id: traceSessionId,
          action: 'stop',
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to stop trace');
      }
      return res.json();
    },
    onSuccess: (data, traceSessionId) => {
      toast({
        title: '트레이스 중지 성공',
        description: `세션 ${traceSessionId}의 트레이스가 중지되었습니다.`,
      });
      queryClient.invalidateQueries({ queryKey: ['trace-sessions'] });
    },
    onError: (error: Error) => {
      toast({
        title: '트레이스 중지 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleStartTrace = () => {
    if (!sessionId || effectiveConnectionId === 'all') return;
    startTraceMutation.mutate();
  };

  const handleStopTrace = (traceSessionId: number) => {
    stopTraceMutation.mutate(traceSessionId);
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">SQL Trace</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Oracle SQL 트레이스를 실행하고 분석합니다
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
            SQL 트레이스를 사용하려면 상단에서 데이터베이스를 선택해주세요.
          </AlertDescription>
        </Alert>
      )}

      {/* 트레이스 시작 */}
      <Card>
        <CardHeader>
          <CardTitle>새 트레이스 세션</CardTitle>
          <CardDescription>
            특정 세션 또는 SQL에 대한 트레이스를 시작합니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="connection">DB 연결</Label>
              <Select
                value={effectiveConnectionId !== 'all' ? effectiveConnectionId : ''}
                disabled
              >
                <SelectTrigger>
                  <SelectValue placeholder="상단에서 데이터베이스를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((conn) => (
                    <SelectItem key={conn.id} value={conn.id}>
                      {conn.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                상단 헤더의 데이터베이스 선택기를 사용하여 DB를 선택하세요
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="session_id">Session ID</Label>
              <Input
                id="session_id"
                type="number"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="예: 123"
                disabled={effectiveConnectionId === 'all'}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleStartTrace}
                disabled={effectiveConnectionId === 'all' || !sessionId || startTraceMutation.isPending}
              >
                <Play className="h-4 w-4 mr-2" />
                {startTraceMutation.isPending ? '시작 중...' : '트레이스 시작'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 트레이스 세션 목록 */}
      <Card>
        <CardHeader>
          <CardTitle>트레이스 세션 목록</CardTitle>
          <CardDescription>실행 중이거나 완료된 트레이스 세션</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={`skeleton-trace-${i}`} className="h-24 w-full" />
              ))}
            </div>
          ) : traces && traces.length > 0 ? (
            <div className="space-y-3">
              {traces.map((trace) => (
                <TraceSessionCard
                  key={trace.id}
                  trace={trace}
                  onStop={handleStopTrace}
                  isStopping={stopTraceMutation.isPending}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>실행된 트레이스 세션이 없습니다.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 안내 메시지 */}
      <Card className="border-blue-500 bg-blue-50">
        <CardContent className="pt-6">
          <div className="text-sm space-y-2">
            <p className="font-medium text-blue-900">SQL Trace 사용 안내</p>
            <ul className="text-blue-800 space-y-1 list-disc list-inside">
              <li>트레이스는 성능에 영향을 줄 수 있으므로 운영 환경에서는 신중히 사용하세요</li>
              <li>트레이스 파일은 자동으로 분석되어 성능 병목을 식별합니다</li>
              <li>TKPROF 리포트를 통해 상세한 분석 결과를 확인할 수 있습니다</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// 트레이스 세션 카드 컴포넌트
interface TraceSessionCardProps {
  trace: TraceSession;
  onStop: (sessionId: number) => void;
  isStopping: boolean;
}

function TraceSessionCard({ trace, onStop, isStopping }: TraceSessionCardProps) {
  const statusColors = {
    ACTIVE: 'default',
    STOPPED: 'secondary',
    COMPLETED: 'outline',
  } as const;

  return (
    <div className="border rounded-lg p-4 hover:bg-accent transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
              Session: {trace.session_id}
            </code>
            {trace.sql_id && (
              <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                SQL: {trace.sql_id}
              </code>
            )}
            <Badge variant={statusColors[trace.status]}>{trace.status}</Badge>
          </div>
          <div className="text-sm text-muted-foreground space-y-1">
            <div>파일: {trace.trace_file}</div>
            <div>시작: {new Date(trace.started_at).toLocaleString('ko-KR')}</div>
            {trace.stopped_at && (
              <div>종료: {new Date(trace.stopped_at).toLocaleString('ko-KR')}</div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {trace.status === 'COMPLETED' && (
            <Button size="sm" variant="outline">
              <Download className="h-4 w-4 mr-2" />
              다운로드
            </Button>
          )}
          {trace.status === 'ACTIVE' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onStop(trace.session_id)}
              disabled={isStopping}
            >
              <Square className="h-4 w-4 mr-2" />
              {isStopping ? '중지 중...' : '중지'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
