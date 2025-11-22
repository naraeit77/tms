'use client';

/**
 * ASH (Active Session History) Analysis Page
 * ASH 분석 페이지 - 세밀한 시간 단위 제어
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Clock, Play, Download, AlertCircle, TrendingUp, Database, Activity, Info } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

interface ASHSample {
  sample_id: number;
  sample_time: string;
  session_id: number;
  session_serial: number;
  user_id: string;
  sql_id?: string;
  sql_plan_hash_value?: number;
  event?: string;
  wait_class?: string;
  wait_time_ms?: number;
  session_state: string;
  blocking_session?: number;
  current_obj?: string;
  current_file?: string;
  current_block?: number;
  program?: string;
  module?: string;
  machine?: string;
}

interface ASHMetrics {
  total_samples: number;
  active_sessions: number;
  top_wait_events: Array<{ event: string; count: number; percentage: number }>;
  top_sql: Array<{ sql_id: string; count: number; percentage: number }>;
  session_states: Array<{ state: string; count: number; percentage: number }>;
}

export default function ASHPage() {
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
  const { toast } = useToast();
  const effectiveConnectionId = selectedConnectionId || 'all';
  const [selectedSqlId, setSelectedSqlId] = useState<string | null>(null);

  // 시간 범위 상태 (시작/종료 시간)
  const [startDate, setStartDate] = useState('');
  const [startHour, setStartHour] = useState('00');
  const [startMinute, setStartMinute] = useState('00');
  const [startSecond, setStartSecond] = useState('00');

  const [endDate, setEndDate] = useState('');
  const [endHour, setEndHour] = useState('23');
  const [endMinute, setEndMinute] = useState('59');
  const [endSecond, setEndSecond] = useState('59');

  // 빠른 선택 옵션
  const [quickRange, setQuickRange] = useState<string>('');

  // 현재 날짜/시간으로 초기화
  useEffect(() => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // 종료 시간: 현재
    setEndDate(formatDate(now));
    setEndHour(pad(now.getHours()));
    setEndMinute(pad(now.getMinutes()));
    setEndSecond(pad(now.getSeconds()));

    // 시작 시간: 1시간 전
    setStartDate(formatDate(oneHourAgo));
    setStartHour(pad(oneHourAgo.getHours()));
    setStartMinute(pad(oneHourAgo.getMinutes()));
    setStartSecond(pad(oneHourAgo.getSeconds()));
  }, []);

  // 날짜 포맷 헬퍼
  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    return `${year}-${month}-${day}`;
  };

  const pad = (num: number) => String(num).padStart(2, '0');

  // 빠른 시간 범위 선택 핸들러
  const handleQuickRange = (range: string) => {
    setQuickRange(range);
    const now = new Date();
    const end = new Date(now);

    let start = new Date(now);

    switch (range) {
      case '15min':
        start = new Date(now.getTime() - 15 * 60 * 1000);
        break;
      case '30min':
        start = new Date(now.getTime() - 30 * 60 * 1000);
        break;
      case '1hour':
        start = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '3hour':
        start = new Date(now.getTime() - 3 * 60 * 60 * 1000);
        break;
      case '6hour':
        start = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        break;
      case '12hour':
        start = new Date(now.getTime() - 12 * 60 * 60 * 1000);
        break;
      case '24hour':
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
    }

    // 종료 시간
    setEndDate(formatDate(end));
    setEndHour(pad(end.getHours()));
    setEndMinute(pad(end.getMinutes()));
    setEndSecond(pad(end.getSeconds()));

    // 시작 시간
    setStartDate(formatDate(start));
    setStartHour(pad(start.getHours()));
    setStartMinute(pad(start.getMinutes()));
    setStartSecond(pad(start.getSeconds()));
  };

  // 전체 시작/종료 시간 문자열
  const startDateTime = `${startDate} ${startHour}:${startMinute}:${startSecond}`;
  const endDateTime = `${endDate} ${endHour}:${endMinute}:${endSecond}`;

  // ASH 데이터 조회
  const {
    data: ashData,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['ash-samples', effectiveConnectionId, startDateTime, endDateTime],
    queryFn: async () => {
      if (effectiveConnectionId === 'all') {
        throw new Error('Please select a database connection');
      }

      const params = new URLSearchParams({
        connection_id: effectiveConnectionId,
        start_time: startDateTime,
        end_time: endDateTime,
      });

      const res = await fetch(`/api/awr/ash?${params}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to fetch ASH data');
      }
      return res.json();
    },
    enabled: effectiveConnectionId !== 'all' && !!startDate && !!endDate,
    staleTime: 30000, // 30초
  });

  const samples: ASHSample[] = ashData?.data || [];
  const metrics: ASHMetrics | undefined = ashData?.metrics;

  // ASH 리포트 생성
  const handleGenerateReport = async () => {
    try {
      const params = new URLSearchParams({
        connection_id: effectiveConnectionId,
        start_time: startDateTime,
        end_time: endDateTime,
      });

      const res = await fetch(`/api/awr/ash/report?${params}`, {
        method: 'POST',
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to generate ASH report');
      }

      const data = await res.json();

      toast({
        title: 'ASH 리포트 생성 완료',
        description: 'ASH 리포트가 생성되었습니다.',
      });

      // HTML 리포트 다운로드
      const blob = new Blob([data.data.content], { type: 'text/html' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.data.report_name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: 'ASH 리포트 생성 실패',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">ASH 분석</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Active Session History 분석 - 세밀한 성능 분석 도구
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
            ASH 분석을 실행하려면 상단에서 데이터베이스를 선택해주세요.
          </AlertDescription>
        </Alert>
      )}

      {/* 시간 범위 선택 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            분석 시간 범위 설정
          </CardTitle>
          <CardDescription>
            ASH 데이터를 조회할 시간 범위를 설정합니다 (시/분/초 단위 제어 가능)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 빠른 선택 버튼 */}
          <div>
            <Label className="mb-3 block">빠른 선택</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={quickRange === '15min' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleQuickRange('15min')}
              >
                최근 15분
              </Button>
              <Button
                variant={quickRange === '30min' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleQuickRange('30min')}
              >
                최근 30분
              </Button>
              <Button
                variant={quickRange === '1hour' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleQuickRange('1hour')}
              >
                최근 1시간
              </Button>
              <Button
                variant={quickRange === '3hour' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleQuickRange('3hour')}
              >
                최근 3시간
              </Button>
              <Button
                variant={quickRange === '6hour' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleQuickRange('6hour')}
              >
                최근 6시간
              </Button>
              <Button
                variant={quickRange === '12hour' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleQuickRange('12hour')}
              >
                최근 12시간
              </Button>
              <Button
                variant={quickRange === '24hour' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleQuickRange('24hour')}
              >
                최근 24시간
              </Button>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* 시작 시간 */}
            <div className="space-y-4">
              <Label className="text-base font-semibold">시작 시간</Label>

              <div className="space-y-2">
                <Label htmlFor="start-date">날짜</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="start-hour">시</Label>
                  <Select value={startHour} onValueChange={setStartHour}>
                    <SelectTrigger id="start-hour">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={pad(i)}>
                          {pad(i)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="start-minute">분</Label>
                  <Select value={startMinute} onValueChange={setStartMinute}>
                    <SelectTrigger id="start-minute">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 60 }, (_, i) => (
                        <SelectItem key={i} value={pad(i)}>
                          {pad(i)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="start-second">초</Label>
                  <Select value={startSecond} onValueChange={setStartSecond}>
                    <SelectTrigger id="start-second">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 60 }, (_, i) => (
                        <SelectItem key={i} value={pad(i)}>
                          {pad(i)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="text-sm font-mono bg-muted p-2 rounded">
                {startDateTime}
              </div>
            </div>

            {/* 종료 시간 */}
            <div className="space-y-4">
              <Label className="text-base font-semibold">종료 시간</Label>

              <div className="space-y-2">
                <Label htmlFor="end-date">날짜</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="end-hour">시</Label>
                  <Select value={endHour} onValueChange={setEndHour}>
                    <SelectTrigger id="end-hour">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={pad(i)}>
                          {pad(i)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="end-minute">분</Label>
                  <Select value={endMinute} onValueChange={setEndMinute}>
                    <SelectTrigger id="end-minute">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 60 }, (_, i) => (
                        <SelectItem key={i} value={pad(i)}>
                          {pad(i)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="end-second">초</Label>
                  <Select value={endSecond} onValueChange={setEndSecond}>
                    <SelectTrigger id="end-second">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 60 }, (_, i) => (
                        <SelectItem key={i} value={pad(i)}>
                          {pad(i)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="text-sm font-mono bg-muted p-2 rounded">
                {endDateTime}
              </div>
            </div>
          </div>

          {/* 실행 버튼 */}
          <div className="flex gap-3">
            <Button
              onClick={() => refetch()}
              disabled={effectiveConnectionId === 'all' || !startDate || !endDate || isFetching}
              className="flex-1"
            >
              <Play className="h-4 w-4 mr-2" />
              {isFetching ? 'ASH 데이터 조회 중...' : 'ASH 데이터 조회'}
            </Button>
            <Button
              variant="outline"
              onClick={handleGenerateReport}
              disabled={effectiveConnectionId === 'all' || !startDate || !endDate || samples.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              ASH 리포트 생성
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 메트릭 카드 */}
      {metrics && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Database className="h-4 w-4" />
                총 샘플
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{metrics.total_samples.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" />
                활성 세션 (평균)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{metrics.active_sessions}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Top Wait Event
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium truncate">
                {metrics.top_wait_events[0]?.event || 'N/A'}
              </div>
              <div className="text-xs text-muted-foreground">
                {metrics.top_wait_events[0]?.percentage.toFixed(1)}%
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Top SQL
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-mono font-medium truncate">
                {metrics.top_sql[0]?.sql_id || 'N/A'}
              </div>
              <div className="text-xs text-muted-foreground">
                {metrics.top_sql[0]?.percentage.toFixed(1)}%
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ASH 분석 결과 탭 */}
      <Tabs defaultValue="samples" className="space-y-4">
        <TabsList>
          <TabsTrigger value="samples">샘플 데이터</TabsTrigger>
          <TabsTrigger value="wait-events">Wait Events</TabsTrigger>
          <TabsTrigger value="top-sql">Top SQL</TabsTrigger>
          <TabsTrigger value="session-states">Session States</TabsTrigger>
        </TabsList>

        {/* 샘플 데이터 */}
        <TabsContent value="samples">
          <Card>
            <CardHeader>
              <CardTitle>ASH 샘플 데이터</CardTitle>
              <CardDescription>
                Active Session History 원본 샘플 ({samples.length}건)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(10)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : samples.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sample Time</TableHead>
                        <TableHead>SID</TableHead>
                        <TableHead>SQL ID</TableHead>
                        <TableHead>Wait Event</TableHead>
                        <TableHead>Wait Class</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>Program</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {samples.slice(0, 100).map((sample, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-xs">
                            {new Date(sample.sample_time).toLocaleString('ko-KR')}
                          </TableCell>
                          <TableCell className="font-mono">{sample.session_id}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {sample.sql_id || '-'}
                          </TableCell>
                          <TableCell className="text-xs truncate max-w-xs">
                            {sample.event || '-'}
                          </TableCell>
                          <TableCell>
                            {sample.wait_class ? (
                              <Badge variant="outline">{sample.wait_class}</Badge>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={sample.session_state === 'ON CPU' ? 'default' : 'secondary'}>
                              {sample.session_state}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs truncate max-w-xs">
                            {sample.program || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>조회된 ASH 샘플이 없습니다.</p>
                  <p className="text-sm mt-2">시간 범위를 변경하거나 데이터 수집을 확인해주세요.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Wait Events */}
        <TabsContent value="wait-events">
          <Card>
            <CardHeader>
              <CardTitle>Top Wait Events</CardTitle>
              <CardDescription>
                시간 범위 내 주요 대기 이벤트 분석
              </CardDescription>
            </CardHeader>
            <CardContent>
              {metrics && metrics.top_wait_events.length > 0 ? (
                <div className="space-y-3">
                  {metrics.top_wait_events.map((event, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{event.event}</div>
                        <div className="text-sm text-muted-foreground">
                          {event.count.toLocaleString()} samples
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-32 bg-muted rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full"
                            style={{ width: `${event.percentage}%` }}
                          />
                        </div>
                        <div className="text-sm font-medium w-16 text-right">
                          {event.percentage.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>대기 이벤트 데이터가 없습니다.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Top SQL */}
        <TabsContent value="top-sql">
          <Card>
            <CardHeader>
              <CardTitle>Top SQL by ASH</CardTitle>
              <CardDescription>
                ASH 샘플에서 가장 많이 발견된 SQL
              </CardDescription>
            </CardHeader>
            <CardContent>
              {metrics && metrics.top_sql.length > 0 ? (
                <div className="space-y-3">
                  {metrics.top_sql.map((sql, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 border rounded-lg hover:shadow-md transition-shadow">
                      <div className="flex-1">
                        <button
                          onClick={() => setSelectedSqlId(sql.sql_id)}
                          className="font-mono font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                        >
                          {sql.sql_id}
                        </button>
                        <div className="text-sm text-muted-foreground">
                          {sql.count.toLocaleString()} samples
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-32 bg-muted rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full"
                            style={{ width: `${sql.percentage}%` }}
                          />
                        </div>
                        <div className="text-sm font-medium w-16 text-right">
                          {sql.percentage.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>SQL 데이터가 없습니다.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Session States */}
        <TabsContent value="session-states">
          <Card>
            <CardHeader>
              <CardTitle>Session States</CardTitle>
              <CardDescription>
                세션 상태별 분포
              </CardDescription>
            </CardHeader>
            <CardContent>
              {metrics && metrics.session_states.length > 0 ? (
                <div className="space-y-3">
                  {metrics.session_states.map((state, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <Badge variant={state.state === 'ON CPU' ? 'default' : 'secondary'}>
                          {state.state}
                        </Badge>
                        <div className="text-sm text-muted-foreground mt-1">
                          {state.count.toLocaleString()} samples
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-32 bg-muted rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full"
                            style={{ width: `${state.percentage}%` }}
                          />
                        </div>
                        <div className="text-sm font-medium w-16 text-right">
                          {state.percentage.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>세션 상태 데이터가 없습니다.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 안내 메시지 */}
      <Card className="border-blue-500 bg-blue-50">
        <CardContent className="pt-6">
          <div className="text-sm space-y-2">
            <p className="font-medium text-blue-900">ASH (Active Session History) 사용 안내</p>
            <ul className="text-blue-800 space-y-1 list-disc list-inside">
              <li><strong>ASH</strong>: 초 단위로 데이터베이스 활동을 샘플링하여 저장</li>
              <li>시/분/초 단위로 정확한 시간 범위 지정 가능</li>
              <li>짧은 시간 동안의 성능 문제 분석에 유용 (AWR보다 세밀)</li>
              <li>실시간에 가까운 성능 분석 가능</li>
              <li className="font-medium text-red-700">Oracle Diagnostics Pack 라이센스 필요</li>
            </ul>
          </div>
        </CardContent>
      </Card>

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
                      {detailData.execution_plan.map((step: any) => (
                        <tr key={step.id} className="border-b">
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
                        <tr key={idx} className="border-b">
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
