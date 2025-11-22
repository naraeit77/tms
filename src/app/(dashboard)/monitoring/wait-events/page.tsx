'use client';

/**
 * Wait Events Monitoring Page
 * Wait Events 모니터링 페이지
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

interface WaitEvent {
  id: string;
  oracle_connection_id: string;
  event_name: string;
  wait_class?: string;
  total_waits: number;
  total_timeouts: number;
  time_waited_ms: number;
  average_wait_ms?: number;
  pct_db_time?: number;
  collected_at: string;
}

interface OracleConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  service_name?: string;
  sid?: string;
  username?: string;
  health_status?: 'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN';
  oracle_version?: string;
  database_role?: string;
  instance_name?: string;
  host_name?: string;
}

export default function WaitEventsPage() {
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
  const [waitClassFilter, setWaitClassFilter] = useState<string>('all');

  // Use the global selected connection ID or 'all'
  const effectiveConnectionId = selectedConnectionId || 'all';

  // Wait Events 조회
  const {
    data: waitEventsData,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['wait-events', effectiveConnectionId, waitClassFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '100',
      });

      if (effectiveConnectionId !== 'all') {
        params.append('connection_id', effectiveConnectionId);
      }

      if (waitClassFilter !== 'all') {
        params.append('wait_class', waitClassFilter);
      }

      const res = await fetch(`/api/monitoring/wait-events?${params}`);
      if (!res.ok) throw new Error('Failed to fetch wait events');
      return res.json();
    },
    refetchInterval: 30000, // 30초마다 자동 새로고침
  });

  const waitEvents: WaitEvent[] = waitEventsData?.data || [];

  // 디버깅을 위한 로그
  console.log('Wait Events Data:', waitEventsData);
  console.log('Selected Connection ID:', selectedConnectionId);

  // 통계 계산
  const totalWaits = waitEvents.reduce((sum, e) => sum + e.total_waits, 0);
  const totalTimeWaited = waitEvents.reduce((sum, e) => sum + e.time_waited_ms, 0);
  const avgWaitTime = totalWaits > 0 ? totalTimeWaited / totalWaits : 0;

  // Wait Class별 집계
  const waitClassStats = waitEvents.reduce((acc, event) => {
    const waitClass = event.wait_class || 'Other';
    if (!acc[waitClass]) {
      acc[waitClass] = {
        count: 0,
        total_waits: 0,
        time_waited_ms: 0,
      };
    }
    acc[waitClass].count++;
    acc[waitClass].total_waits += event.total_waits;
    acc[waitClass].time_waited_ms += event.time_waited_ms;
    return acc;
  }, {} as Record<string, { count: number; total_waits: number; time_waited_ms: number }>);

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Wait Events</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Oracle 데이터베이스 대기 이벤트 모니터링
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
              총 Wait Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{waitEvents.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              총 대기 횟수
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalWaits.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              총 대기 시간
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {(totalTimeWaited / 1000).toFixed(2)}s
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              평균 대기 시간
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {avgWaitTime.toFixed(2)}ms
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Wait Class 별 분석 */}
      <Card>
        <CardHeader>
          <CardTitle>Wait Class 분석</CardTitle>
          <CardDescription>대기 이벤트 클래스별 통계</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(waitClassStats)
              .sort((a, b) => b[1].time_waited_ms - a[1].time_waited_ms)
              .slice(0, 10)
              .map(([waitClass, stats]) => {
                const percentage = (stats.time_waited_ms / totalTimeWaited) * 100;
                return (
                  <div key={waitClass} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{waitClass}</span>
                      <div className="flex items-center gap-4 text-muted-foreground">
                        <span>{stats.total_waits.toLocaleString()} waits</span>
                        <span>{(stats.time_waited_ms / 1000).toFixed(2)}s</span>
                        <span className="font-medium">{percentage.toFixed(1)}%</span>
                      </div>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                );
              })}
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
            {/* DB 연결 - 현재 글로벌 선택기 사용 */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/50">
              <span className="text-sm text-muted-foreground">
                연결: <span className="font-medium text-foreground">
                  {selectedConnection?.name || '전체 DB'}
                </span>
              </span>
            </div>

            {/* Wait Class 필터 */}
            <Select value={waitClassFilter} onValueChange={setWaitClassFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Wait Class" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 Class</SelectItem>
                <SelectItem value="User I/O">User I/O</SelectItem>
                <SelectItem value="System I/O">System I/O</SelectItem>
                <SelectItem value="Concurrency">Concurrency</SelectItem>
                <SelectItem value="Application">Application</SelectItem>
                <SelectItem value="Configuration">Configuration</SelectItem>
                <SelectItem value="Network">Network</SelectItem>
                <SelectItem value="Commit">Commit</SelectItem>
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

      {/* Wait Events 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>Wait Events 상세 ({waitEvents.length}건)</CardTitle>
          <CardDescription>
            대기 시간 기준 내림차순 정렬
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={`wait-event-skeleton-${i}`} className="h-16 w-full" />
              ))}
            </div>
          ) : waitEvents.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event Name</TableHead>
                    <TableHead>Wait Class</TableHead>
                    <TableHead className="text-right">Total Waits</TableHead>
                    <TableHead className="text-right">Timeouts</TableHead>
                    <TableHead className="text-right">Time Waited (s)</TableHead>
                    <TableHead className="text-right">Avg Wait (ms)</TableHead>
                    <TableHead className="text-right">% DB Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {waitEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-medium max-w-xs truncate">
                        {event.event_name}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getWaitClassVariant(event.wait_class)}>
                          {event.wait_class || 'Other'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {event.total_waits.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {event.total_timeouts.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {(event.time_waited_ms / 1000).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        {event.average_wait_ms?.toFixed(2) || 'N/A'}
                      </TableCell>
                      <TableCell className="text-right">
                        {event.pct_db_time?.toFixed(2) || 'N/A'}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>조회된 Wait Events가 없습니다.</p>
              <p className="text-sm mt-2">필터 조건을 변경하거나 데이터 수집을 진행해주세요.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Wait Class별 뱃지 색상
function getWaitClassVariant(waitClass?: string) {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    'User I/O': 'default',
    'System I/O': 'secondary',
    'Concurrency': 'destructive',
    'Application': 'outline',
    'Configuration': 'secondary',
    'Network': 'default',
    'Commit': 'default',
  };
  return variants[waitClass || ''] || 'outline';
}
