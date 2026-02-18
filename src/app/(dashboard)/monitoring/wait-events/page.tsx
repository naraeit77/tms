'use client';

/**
 * Wait Events Monitoring Page
 * Wait Events 모니터링 페이지
 */

import { useState, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, TrendingUp, AlertTriangle, RefreshCw, Database, Code, User, Monitor, Info, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

// Wait Event 설명 데이터 (초보 DBA를 위한 한글 설명)
const WAIT_EVENT_DESCRIPTIONS: Record<string, { description: string; cause: string; solution: string }> = {
  // User I/O 관련
  'db file sequential read': {
    description: '단일 블록 읽기 대기 (인덱스 스캔)',
    cause: '인덱스를 통해 테이블 데이터를 읽을 때 발생. 디스크에서 한 블록씩 읽음.',
    solution: '인덱스 구조 최적화, SSD 사용, Buffer Cache 증가, 불필요한 인덱스 스캔 제거'
  },
  'db file scattered read': {
    description: '멀티 블록 읽기 대기 (풀 테이블 스캔)',
    cause: 'Full Table Scan 시 여러 블록을 동시에 읽을 때 발생.',
    solution: '적절한 인덱스 생성, 파티셔닝 적용, db_file_multiblock_read_count 조정'
  },
  'direct path read': {
    description: '병렬 쿼리나 대량 데이터 읽기',
    cause: 'Buffer Cache를 거치지 않고 직접 디스크에서 읽음. 병렬 쿼리, TEMP 테이블스페이스 사용 시 발생.',
    solution: '정상적인 대기. 과도할 경우 Sort Area 크기 조정'
  },
  'direct path write': {
    description: '직접 경로 쓰기 대기',
    cause: 'Buffer Cache를 거치지 않고 직접 디스크에 쓰기. 대량 INSERT, CTAS 등에서 발생.',
    solution: '정상적인 대기. I/O 서브시스템 성능 확인'
  },
  'direct path read temp': {
    description: 'TEMP 테이블스페이스 읽기',
    cause: '정렬, 해시 조인 등으로 TEMP 영역 사용 시 발생.',
    solution: 'PGA_AGGREGATE_TARGET 증가, Sort/Hash Area 크기 조정'
  },
  'direct path write temp': {
    description: 'TEMP 테이블스페이스 쓰기',
    cause: '메모리 부족으로 TEMP에 데이터 쓸 때 발생.',
    solution: 'PGA_AGGREGATE_TARGET 증가, 쿼리 최적화로 정렬 최소화'
  },

  // Concurrency 관련
  'enq: TX - row lock contention': {
    description: '행 잠금 경합 (다른 세션이 같은 행 수정 중)',
    cause: '여러 세션이 동시에 같은 행을 수정하려 할 때 발생.',
    solution: '트랜잭션 설계 검토, 커밋 주기 단축, 애플리케이션 로직 수정'
  },
  'enq: TM - contention': {
    description: '테이블 잠금 경합',
    cause: 'DDL 작업이나 외래키 없이 DELETE 시 발생.',
    solution: '외래키에 인덱스 생성, DDL 작업 시간 조정'
  },
  'enq: HW - contention': {
    description: '하이워터마크 경합',
    cause: '여러 세션이 동시에 테이블 확장 시 발생.',
    solution: 'ASSM 사용, 테이블 사전 할당'
  },
  'buffer busy waits': {
    description: '버퍼 사용 대기 (같은 블록 동시 접근)',
    cause: '여러 세션이 동시에 같은 버퍼 블록에 접근.',
    solution: 'Hot Block 분산 (해시 파티셔닝), PCTFREE 조정'
  },
  'latch: cache buffers chains': {
    description: 'Buffer Cache 체인 래치 경합',
    cause: '동일 블록에 대한 과도한 동시 접근.',
    solution: 'Hot Block 식별 및 분산, SQL 튜닝'
  },
  'library cache lock': {
    description: '라이브러리 캐시 잠금 대기',
    cause: 'DDL 작업이나 Hard Parsing 시 발생.',
    solution: '바인드 변수 사용, DDL 작업 시간 분산'
  },
  'library cache pin': {
    description: '라이브러리 캐시 핀 대기',
    cause: 'SQL 실행 중 다른 세션이 같은 객체 참조.',
    solution: '바인드 변수 사용, Shared Pool 크기 조정'
  },
  'cursor: pin S wait on X': {
    description: '커서 핀 대기',
    cause: '같은 SQL에 대해 Hard Parsing과 실행이 동시 발생.',
    solution: '바인드 변수 사용, cursor_sharing 파라미터 조정'
  },

  // Application 관련
  'enq: TX - index contention': {
    description: '인덱스 블록 경합',
    cause: '순차 인덱스(시퀀스 기반)에 동시 INSERT 시 발생.',
    solution: '리버스 인덱스 사용, 해시 파티셔닝'
  },
  'SQL*Net message from client': {
    description: '클라이언트 응답 대기 (Idle)',
    cause: '클라이언트가 다음 요청을 보내기를 기다림. 정상적인 Idle 상태.',
    solution: '정상 대기. 과도할 경우 네트워크 지연 확인'
  },
  'SQL*Net more data from client': {
    description: '클라이언트로부터 추가 데이터 대기',
    cause: '대용량 데이터 전송 시 발생.',
    solution: 'SDU 크기 조정, 네트워크 대역폭 확인'
  },

  // Commit 관련
  'log file sync': {
    description: 'Redo Log 동기화 대기 (COMMIT 시)',
    cause: 'COMMIT 시 Redo Log를 디스크에 기록 완료를 기다림.',
    solution: 'Redo Log를 빠른 디스크(SSD)에 배치, COMMIT 빈도 조정'
  },
  'log file parallel write': {
    description: 'Redo Log 병렬 쓰기',
    cause: 'LGWR이 Redo Log 파일에 쓸 때 발생.',
    solution: 'Redo Log 파일을 빠른 스토리지에 배치'
  },
  'log buffer space': {
    description: 'Log Buffer 공간 부족',
    cause: 'Log Buffer가 가득 차서 쓰기를 기다림.',
    solution: 'LOG_BUFFER 크기 증가'
  },

  // Configuration 관련
  'log file switch completion': {
    description: 'Redo Log 스위치 대기',
    cause: '로그 파일 전환 시 발생.',
    solution: 'Redo Log 파일 개수 및 크기 증가'
  },
  'log file switch (checkpoint incomplete)': {
    description: '체크포인트 미완료로 인한 로그 스위치 대기',
    cause: '체크포인트가 완료되지 않아 로그 파일 재사용 불가.',
    solution: 'Redo Log 크기/개수 증가, DBWR 성능 개선'
  },
  'log file switch (archiving needed)': {
    description: '아카이브 미완료로 인한 로그 스위치 대기',
    cause: '아카이브 로그 생성이 지연됨.',
    solution: '아카이브 대상 디스크 공간 확인, ARCH 프로세스 성능 개선'
  },

  // System I/O 관련
  'db file parallel write': {
    description: 'DBWR 병렬 쓰기',
    cause: 'DBWR가 dirty 버퍼를 디스크에 쓸 때 발생.',
    solution: 'I/O 서브시스템 성능 개선, DBWR 프로세스 수 조정'
  },
  'control file sequential read': {
    description: '컨트롤 파일 읽기',
    cause: '컨트롤 파일 정보 읽기 시 발생.',
    solution: '컨트롤 파일을 빠른 스토리지에 배치'
  },
  'control file parallel write': {
    description: '컨트롤 파일 쓰기',
    cause: '컨트롤 파일 업데이트 시 발생.',
    solution: '컨트롤 파일 복사본 수 최소화, 빠른 스토리지 사용'
  },

  // Network 관련
  'SQL*Net message to client': {
    description: '클라이언트로 데이터 전송',
    cause: '결과 데이터를 클라이언트에 전송.',
    solution: '네트워크 대역폭 확인, SDU 조정'
  },
  'SQL*Net more data to client': {
    description: '클라이언트로 추가 데이터 전송',
    cause: '대용량 결과셋 전송 시 발생.',
    solution: '결과 건수 제한, 페이징 적용'
  },

  // 기타
  'resmgr:cpu quantum': {
    description: 'Resource Manager CPU 대기',
    cause: 'Resource Manager에 의해 CPU 사용이 제한됨.',
    solution: 'Resource Manager 설정 검토'
  },
  'latch free': {
    description: '래치 획득 대기',
    cause: '메모리 구조 보호를 위한 래치 경합.',
    solution: '경합 원인 분석 후 개별 대응'
  },
  'gc buffer busy acquire': {
    description: 'RAC Global Cache 버퍼 획득 대기',
    cause: 'RAC 환경에서 다른 인스턴스의 버퍼 접근.',
    solution: 'Hot Block 분산, 인터커넥트 성능 개선'
  },
  'gc buffer busy release': {
    description: 'RAC Global Cache 버퍼 해제 대기',
    cause: 'RAC 환경에서 버퍼 해제 대기.',
    solution: '인터커넥트 대역폭 확인'
  },
  'gc cr request': {
    description: 'RAC Consistent Read 요청',
    cause: 'RAC 환경에서 CR 블록 요청.',
    solution: '데이터 지역성 개선, 파티셔닝'
  },
  'gc current request': {
    description: 'RAC Current 블록 요청',
    cause: 'RAC 환경에서 현재 블록 요청.',
    solution: '데이터 지역성 개선'
  },
};

// Wait Event 설명 가져오기 함수
function getEventDescription(eventName: string): { description: string; cause: string; solution: string } | null {
  // 정확한 매칭
  if (WAIT_EVENT_DESCRIPTIONS[eventName]) {
    return WAIT_EVENT_DESCRIPTIONS[eventName];
  }
  // 부분 매칭 (소문자로 비교)
  const lowerEventName = eventName.toLowerCase();
  for (const [key, value] of Object.entries(WAIT_EVENT_DESCRIPTIONS)) {
    if (lowerEventName.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerEventName)) {
      return value;
    }
  }
  return null;
}

interface EventSqlInfo {
  sql_id: string;
  sample_count: number;
  session_count: number;
  avg_wait_ms: number;
}

interface OracleEventDescription {
  display_name: string;
  wait_class: string;
  parameter1: string;
  parameter2: string;
  parameter3: string;
}

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
  // Oracle에서 가져온 설명
  display_name?: string;
  parameter1?: string;
  parameter2?: string;
  parameter3?: string;
}

interface WaitingSession {
  sid: number;
  serial: number;
  username: string;
  program: string;
  machine: string;
  event: string;
  wait_class: string;
  seconds_in_wait: number;
  state: string;
  sql_id: string;
  prev_sql_id: string;
  sql_text: string | null;
  sql_text_full: string | null;
  executions: number;
  avg_elapsed_ms: number;
  avg_buffer_gets: number;
  rows_processed: number;
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
    refetchInterval: 60000, // 60초로 증가
    staleTime: 30 * 1000, // 30초간 캐시 유지
    refetchOnWindowFocus: false,
  });

  const waitEvents: WaitEvent[] = waitEventsData?.data || [];
  const waitingSessions: WaitingSession[] = waitEventsData?.waitingSessions || [];
  const eventSqlMap: Record<string, EventSqlInfo[]> = waitEventsData?.eventSqlMap || {};
  const oracleEventDescriptions: Record<string, OracleEventDescription> = waitEventsData?.eventDescriptions || {};

  // 펼침 상태 관리
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  const toggleEventExpand = (eventName: string) => {
    setExpandedEvents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(eventName)) {
        newSet.delete(eventName);
      } else {
        newSet.add(eventName);
      }
      return newSet;
    });
  };

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

      {/* 현재 대기 중인 세션 SQL 정보 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                대기 중인 세션 SQL ({waitingSessions.length}건)
              </CardTitle>
              <CardDescription>
                현재 Non-Idle 대기 상태인 세션과 실행 중인 SQL 정보
              </CardDescription>
            </div>
            {waitingSessions.length > 0 && (
              <Badge variant="destructive" className="animate-pulse">
                실시간
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={`session-skeleton-${i}`} className="h-24 w-full" />
              ))}
            </div>
          ) : waitingSessions.length > 0 ? (
            <div className="space-y-4">
              {waitingSessions.map((session, index) => (
                <div
                  key={`${session.sid}-${session.serial}-${index}`}
                  className="border rounded-lg p-4 space-y-3 hover:bg-muted/50 transition-colors"
                >
                  {/* 세션 정보 헤더 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{session.username || 'N/A'}</span>
                        <span className="text-sm text-muted-foreground">
                          (SID: {session.sid}, Serial#: {session.serial})
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={getWaitClassVariant(session.wait_class)}>
                        {session.wait_class}
                      </Badge>
                      <Badge variant={session.seconds_in_wait > 10 ? 'destructive' : 'secondary'}>
                        {session.seconds_in_wait}s 대기
                      </Badge>
                    </div>
                  </div>

                  {/* 대기 이벤트 */}
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-orange-500" />
                    <span className="text-muted-foreground">대기 이벤트:</span>
                    <span className="font-medium">{session.event}</span>
                  </div>

                  {/* 프로그램/머신 정보 */}
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Monitor className="h-3 w-3" />
                      <span>{session.program || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Database className="h-3 w-3" />
                      <span>{session.machine || 'N/A'}</span>
                    </div>
                  </div>

                  {/* SQL 정보 */}
                  {session.sql_id ? (
                    <div className="bg-muted/50 rounded-md p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Code className="h-4 w-4 text-blue-500" />
                          <span className="font-mono text-sm font-medium">{session.sql_id}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>실행: {session.executions.toLocaleString()}회</span>
                          <span>평균: {session.avg_elapsed_ms.toFixed(1)}ms</span>
                          <span>Buffer: {session.avg_buffer_gets.toLocaleString()}</span>
                        </div>
                      </div>
                      {session.sql_text && (
                        <pre className="text-xs font-mono bg-background p-2 rounded border overflow-x-auto whitespace-pre-wrap break-words">
                          {session.sql_text}
                        </pre>
                      )}
                    </div>
                  ) : session.prev_sql_id ? (
                    <div className="bg-muted/30 rounded-md p-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Code className="h-4 w-4" />
                        <span>이전 SQL ID: {session.prev_sql_id}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground italic">
                      SQL 정보 없음
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>현재 대기 중인 세션이 없습니다.</p>
              <p className="text-sm mt-1">모든 세션이 정상적으로 작업 중입니다.</p>
            </div>
          )}
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
          <CardTitle className="flex items-center gap-2">
            Wait Events 상세 ({waitEvents.length}건)
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <p>각 이벤트 이름 옆의 <Info className="inline h-3 w-3" /> 아이콘을 클릭하면 설명을 볼 수 있습니다.</p>
                  <p className="mt-1">행을 클릭하면 해당 이벤트와 관련된 SQL 정보를 확인할 수 있습니다.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <CardDescription>
            대기 시간 기준 내림차순 정렬 • 이벤트 클릭 시 관련 SQL 정보 표시
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
            <TooltipProvider>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
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
                    {waitEvents.map((event) => {
                      const koreanDesc = getEventDescription(event.event_name);
                      const oracleDesc = oracleEventDescriptions[event.event_name] || null;
                      const relatedSqls = eventSqlMap[event.event_name] || [];
                      const isExpanded = expandedEvents.has(event.event_name);
                      // Oracle 설명이 있거나 한글 설명이 있거나 SQL 정보가 있으면 확장 가능
                      const hasInfo = koreanDesc || oracleDesc || event.display_name || relatedSqls.length > 0;

                      return (
                        <Fragment key={event.id}>
                          <TableRow
                            className={`${hasInfo ? 'cursor-pointer hover:bg-muted/50' : ''} ${isExpanded ? 'bg-muted/30' : ''}`}
                            onClick={() => hasInfo && toggleEventExpand(event.event_name)}
                          >
                            <TableCell className="w-8 px-2">
                              {hasInfo && (
                                isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                )
                              )}
                            </TableCell>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <span className="max-w-xs truncate">{event.event_name}</span>
                                {hasInfo && (
                                  <Tooltip>
                                    <TooltipTrigger onClick={(e) => e.stopPropagation()}>
                                      <Info className="h-4 w-4 text-blue-500 hover:text-blue-600 flex-shrink-0" />
                                    </TooltipTrigger>
                                    <TooltipContent side="right" className="max-w-lg p-4">
                                      <div className="space-y-2">
                                        {/* Oracle 공식 설명 */}
                                        {(event.display_name || oracleDesc?.display_name) && (
                                          <div>
                                            <p className="text-xs font-medium text-blue-600">Oracle 설명:</p>
                                            <p className="text-sm">{event.display_name || oracleDesc?.display_name}</p>
                                          </div>
                                        )}
                                        {/* 한글 설명 */}
                                        {koreanDesc && (
                                          <>
                                            <p className="font-semibold text-sm">{koreanDesc.description}</p>
                                            <div>
                                              <p className="text-xs font-medium text-orange-600">원인:</p>
                                              <p className="text-xs text-muted-foreground">{koreanDesc.cause}</p>
                                            </div>
                                            <div>
                                              <p className="text-xs font-medium text-green-600">해결방안:</p>
                                              <p className="text-xs text-muted-foreground">{koreanDesc.solution}</p>
                                            </div>
                                          </>
                                        )}
                                        {/* 파라미터 정보 */}
                                        {(event.parameter1 || oracleDesc?.parameter1) && (
                                          <div className="text-xs text-muted-foreground border-t pt-2 mt-2">
                                            <span className="font-medium">P1:</span> {event.parameter1 || oracleDesc?.parameter1}
                                            {(event.parameter2 || oracleDesc?.parameter2) && (
                                              <span className="ml-2"><span className="font-medium">P2:</span> {event.parameter2 || oracleDesc?.parameter2}</span>
                                            )}
                                            {(event.parameter3 || oracleDesc?.parameter3) && (
                                              <span className="ml-2"><span className="font-medium">P3:</span> {event.parameter3 || oracleDesc?.parameter3}</span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                                {relatedSqls.length > 0 && (
                                  <Badge variant="outline" className="text-xs">
                                    {relatedSqls.length} SQL
                                  </Badge>
                                )}
                              </div>
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

                          {/* 확장된 상세 정보 */}
                          {isExpanded && (
                            <TableRow key={`${event.id}-details`}>
                              <TableCell colSpan={8} className="bg-muted/20 p-0">
                                <div className="p-4 space-y-4">
                                  {/* Oracle 공식 설명 */}
                                  {(event.display_name || oracleDesc) && (
                                    <div className="bg-background rounded-lg p-4 border">
                                      <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                        <Database className="h-4 w-4 text-blue-500" />
                                        Oracle 공식 설명
                                      </h4>
                                      <p className="text-sm font-medium mb-3">
                                        {event.display_name || oracleDesc?.display_name || event.event_name}
                                      </p>
                                      {/* 파라미터 정보 */}
                                      {(event.parameter1 || oracleDesc?.parameter1) && (
                                        <div className="grid md:grid-cols-3 gap-2 mt-3">
                                          {(event.parameter1 || oracleDesc?.parameter1) && (
                                            <div className="bg-blue-50 dark:bg-blue-950/30 rounded-md p-2">
                                              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Parameter 1</p>
                                              <p className="text-sm text-muted-foreground">{event.parameter1 || oracleDesc?.parameter1}</p>
                                            </div>
                                          )}
                                          {(event.parameter2 || oracleDesc?.parameter2) && (
                                            <div className="bg-blue-50 dark:bg-blue-950/30 rounded-md p-2">
                                              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Parameter 2</p>
                                              <p className="text-sm text-muted-foreground">{event.parameter2 || oracleDesc?.parameter2}</p>
                                            </div>
                                          )}
                                          {(event.parameter3 || oracleDesc?.parameter3) && (
                                            <div className="bg-blue-50 dark:bg-blue-950/30 rounded-md p-2">
                                              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Parameter 3</p>
                                              <p className="text-sm text-muted-foreground">{event.parameter3 || oracleDesc?.parameter3}</p>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* 한글 상세 설명 (DBA 가이드) */}
                                  {koreanDesc && (
                                    <div className="bg-background rounded-lg p-4 border">
                                      <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                                        <Info className="h-4 w-4 text-green-500" />
                                        DBA 가이드 (한글)
                                      </h4>
                                      <p className="text-sm font-medium mb-3">{koreanDesc.description}</p>
                                      <div className="grid md:grid-cols-2 gap-4">
                                        <div className="bg-orange-50 dark:bg-orange-950/30 rounded-md p-3">
                                          <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 mb-1">🔍 발생 원인</p>
                                          <p className="text-sm text-muted-foreground">{koreanDesc.cause}</p>
                                        </div>
                                        <div className="bg-green-50 dark:bg-green-950/30 rounded-md p-3">
                                          <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">💡 해결 방안</p>
                                          <p className="text-sm text-muted-foreground">{koreanDesc.solution}</p>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* 관련 SQL 목록 */}
                                  {relatedSqls.length > 0 && (
                                    <div className="bg-background rounded-lg p-4 border">
                                      <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                                        <Code className="h-4 w-4 text-blue-500" />
                                        최근 5분간 관련 SQL (상위 {relatedSqls.length}개)
                                      </h4>
                                      <div className="space-y-2">
                                        {relatedSqls.map((sql, idx) => (
                                          <div
                                            key={`${event.id}-sql-${idx}`}
                                            className="flex items-center justify-between p-3 bg-muted/50 rounded-md hover:bg-muted transition-colors"
                                          >
                                            <div className="flex items-center gap-3">
                                              <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                                              <code className="font-mono text-sm font-medium text-blue-600 dark:text-blue-400">
                                                {sql.sql_id}
                                              </code>
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                              <span title="ASH 샘플 수">
                                                <Clock className="inline h-3 w-3 mr-1" />
                                                {sql.sample_count} 샘플
                                              </span>
                                              <span title="세션 수">
                                                <User className="inline h-3 w-3 mr-1" />
                                                {sql.session_count} 세션
                                              </span>
                                              <span title="평균 대기 시간">
                                                <TrendingUp className="inline h-3 w-3 mr-1" />
                                                {sql.avg_wait_ms.toFixed(2)} ms
                                              </span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                      <p className="text-xs text-muted-foreground mt-2">
                                        * V$ACTIVE_SESSION_HISTORY 기반 최근 5분간 데이터
                                      </p>
                                    </div>
                                  )}

                                  {/* 정보 없음 */}
                                  {!koreanDesc && !oracleDesc && !event.display_name && relatedSqls.length === 0 && (
                                    <div className="text-center py-4 text-muted-foreground">
                                      <p className="text-sm">이 이벤트에 대한 추가 정보가 없습니다.</p>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TooltipProvider>
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
