# Oracle Database Performance Optimization Guide

## 분석 결과 요약

### 주요 성능 병목 지점

#### 1. Dashboard 메트릭 조회 (`/api/dashboard/metrics`)

**문제점:**
- v$sysstat, v$sgastat, v$session 뷰를 복잡한 서브쿼리로 다중 조회
- 매번 실시간으로 메트릭을 수집하여 응답 시간 지연

**병목 쿼리:**
```sql
-- Buffer Cache Hit Ratio (3개의 v$sysstat 조인)
SELECT (1 - (phy.value / (cur.value + con.value))) * 100
FROM v$sysstat phy, v$sysstat cur, v$sysstat con
WHERE phy.name = 'physical reads'
  AND cur.name = 'db block gets'
  AND con.name = 'consistent gets'

-- SGA Used (전체 v$sgastat 스캔)
SELECT SUM(bytes) / 1024 / 1024 / 1024
FROM v$sgastat
```

**개선 방안:**
1. **메트릭 캐싱**: Redis 또는 메모리 캐시로 30초~1분 단위 캐싱
2. **뷰 최적화**: 복잡한 서브쿼리를 단일 쿼리로 병합
3. **백그라운드 수집**: 별도 작업으로 메트릭을 주기적으로 수집하여 저장

---

#### 2. SQL Statistics 조회 (`/api/monitoring/sql-statistics`)

**문제점:**
- v$sql 전체 스캔 (인덱스 없음)
- WHERE 조건이 많아 필터링 비용이 높음
- FETCH FIRST N ROWS 전에 정렬 수행

**병목 쿼리:**
```sql
SELECT *
FROM v$sql
WHERE parsing_schema_name NOT IN ('SYS', 'SYSTEM')
  AND sql_text NOT LIKE '%v$%'
  AND sql_text NOT LIKE '%V$%'
  AND executions > 0
  AND buffer_gets >= ?
ORDER BY buffer_gets DESC
FETCH FIRST 100 ROWS ONLY
```

**개선 방안:**
1. **쿼리 최적화**: 불필요한 LIKE 조건 제거 (대소문자 구분 없이)
2. **데이터 스냅샷**: 주기적으로 v$sql 데이터를 Supabase에 저장하여 조회
3. **페이지네이션**: OFFSET 대신 키 기반 페이지네이션

---

#### 3. Session 모니터링 (`/api/monitoring/sessions`)

**문제점:**
- v$session, v$sql, v$sesstat, v$statname 복잡한 조인
- 서브쿼리로 statistic# 조회 (2회)
- 모든 USER 세션을 조회

**병목 쿼리:**
```sql
SELECT ...
FROM v$session s
  LEFT JOIN v$sql sq ON s.sql_id = sq.sql_id
  LEFT JOIN v$sesstat cpu ON s.sid = cpu.sid AND cpu.statistic# = (
    SELECT statistic# FROM v$statname WHERE name = 'CPU used by this session'
  )
  LEFT JOIN v$sesstat logical ON s.sid = logical.sid AND logical.statistic# = (
    SELECT statistic# FROM v$statname WHERE name = 'session logical reads'
  )
WHERE s.type = 'USER'
  AND s.username IS NOT NULL
```

**개선 방안:**
1. **statistic# 캐싱**: v$statname의 statistic# 값을 애플리케이션에서 캐싱
2. **조인 최적화**: v$sesstat 조인을 한 번에 처리
3. **필터 강화**: ACTIVE 세션만 조회하는 옵션 추가

---

## 최적화 SQL 및 인덱스

### 1. 개선된 Dashboard 메트릭 쿼리

```sql
-- 단일 쿼리로 모든 메트릭 조회 (최적화)
SELECT
  -- Buffer Cache Hit Ratio
  ROUND((1 - (
    (SELECT value FROM v$sysstat WHERE name = 'physical reads') /
    NULLIF((SELECT value FROM v$sysstat WHERE name = 'db block gets') +
           (SELECT value FROM v$sysstat WHERE name = 'consistent gets'), 0)
  )) * 100, 2) as buffer_cache_hit_ratio,

  -- Total Executions
  (SELECT value FROM v$sysstat WHERE name = 'execute count') as total_executions,

  -- DB Time
  (SELECT value / 1000 FROM v$sysstat WHERE name = 'DB time') as db_time_ms,

  -- SGA Used (GB) - 캐시된 값 사용 권장
  ROUND((SELECT SUM(bytes) FROM v$sgastat) / 1024 / 1024 / 1024, 2) as sga_used_gb,

  -- Active Sessions (인덱스 활용)
  (SELECT COUNT(*) FROM v$session WHERE status = 'ACTIVE' AND type = 'USER') as active_sessions
FROM dual;
```

### 2. 개선된 SQL Statistics 쿼리

```sql
-- 최적화된 v$sql 조회 (불필요한 LIKE 제거)
SELECT
  sql_id,
  sql_text,
  module,
  parsing_schema_name,
  executions,
  ROUND(elapsed_time / 1000, 2) as elapsed_time_ms,
  ROUND(cpu_time / 1000, 2) as cpu_time_ms,
  buffer_gets,
  disk_reads,
  rows_processed,
  ROUND(elapsed_time / NULLIF(executions, 0) / 1000, 2) as avg_elapsed_time_ms,
  ROUND(buffer_gets / NULLIF(executions, 0), 2) as gets_per_exec,
  first_load_time,
  last_active_time,
  plan_hash_value
FROM v$sql
WHERE parsing_schema_name NOT IN ('SYS', 'SYSTEM')
  AND UPPER(sql_text) NOT LIKE '%V$%'  -- 단일 UPPER 사용
  AND executions > 0
  AND buffer_gets >= :min_buffer_gets  -- 바인드 변수 사용
ORDER BY buffer_gets DESC
FETCH FIRST :limit ROWS ONLY;
```

### 3. 개선된 Session 모니터링 쿼리

```sql
-- statistic# 값을 하드코딩 (애플리케이션 초기화 시 한 번만 조회)
-- CPU used by this session: statistic# = 12
-- session logical reads: statistic# = 9

SELECT
  s.sid,
  s.serial# as serial_number,
  s.username,
  s.osuser,
  s.machine,
  s.program,
  s.module,
  s.status,
  s.state,
  s.sql_id,
  s.event,
  s.wait_class,
  s.seconds_in_wait * 1000 as wait_time_ms,
  s.logon_time,
  s.last_call_et,
  s.blocking_session,
  sq.sql_text,
  NVL(cpu.value, 0) / 10 as cpu_time_ms,
  NVL(logical.value, 0) as logical_reads
FROM v$session s
  LEFT JOIN v$sql sq ON s.sql_id = sq.sql_id AND ROWNUM = 1  -- 첫 번째 매치만
  LEFT JOIN v$sesstat cpu ON s.sid = cpu.sid AND cpu.statistic# = 12
  LEFT JOIN v$sesstat logical ON s.sid = logical.sid AND logical.statistic# = 9
WHERE s.type = 'USER'
  AND s.username IS NOT NULL
  AND s.status = 'ACTIVE'  -- ACTIVE만 조회로 성능 향상
ORDER BY s.last_call_et DESC
FETCH FIRST 100 ROWS ONLY;
```

---

## Supabase 테이블 인덱스 최적화

### 현재 테이블 분석

```sql
-- oracle_connections 테이블
-- 자주 조회되는 컬럼: id, is_active, health_status, user_id
CREATE INDEX IF NOT EXISTS idx_oracle_connections_user_active
ON oracle_connections(user_id, is_active)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_oracle_connections_health
ON oracle_connections(health_status)
WHERE health_status = 'HEALTHY';

-- sql_statistics 테이블
-- 자주 조회되는 컬럼: oracle_connection_id, status, priority, collected_at
CREATE INDEX IF NOT EXISTS idx_sql_statistics_connection_collected
ON sql_statistics(oracle_connection_id, collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_sql_statistics_status_priority
ON sql_statistics(status, priority)
WHERE status IN ('CRITICAL', 'WARNING');

CREATE INDEX IF NOT EXISTS idx_sql_statistics_performance
ON sql_statistics(oracle_connection_id, buffer_gets DESC, elapsed_time_ms DESC);

-- tuning_recommendations 테이블
CREATE INDEX IF NOT EXISTS idx_tuning_recommendations_sql
ON tuning_recommendations(sql_statistic_id, status);

-- awr_reports 테이블
CREATE INDEX IF NOT EXISTS idx_awr_reports_connection_created
ON awr_reports(oracle_connection_id, created_at DESC);
```

---

## 애플리케이션 레벨 최적화

### 1. React Query 캐싱 전략

```typescript
// src/hooks/use-dashboard-metrics.ts
export function useDashboardMetrics(connectionId: string) {
  return useQuery({
    queryKey: ['dashboard-metrics', connectionId],
    queryFn: () => fetchDashboardMetrics(connectionId),
    staleTime: 30000, // 30초 캐시
    refetchInterval: 60000, // 1분마다 자동 갱신
    enabled: !!connectionId && connectionId !== 'all',
  });
}
```

### 2. 백그라운드 데이터 수집

```typescript
// src/lib/background/metrics-collector.ts
// Node-cron으로 주기적 메트릭 수집
import cron from 'node-cron';

// 1분마다 메트릭 수집하여 Supabase에 저장
cron.schedule('*/1 * * * *', async () => {
  const connections = await getActiveConnections();

  for (const conn of connections) {
    const metrics = await collectOracleMetrics(conn);
    await saveMetricsToSupabase(conn.id, metrics);
  }
});
```

### 3. 가상 스크롤링 (Long List)

```typescript
// 100개 이상의 SQL 결과를 가상 스크롤로 처리
import { useVirtualizer } from '@tanstack/react-virtual';

export function SQLList({ sqlList }: { sqlList: SQLStat[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: sqlList.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // 각 행의 예상 높이
    overscan: 10,
  });

  // 보이는 항목만 렌더링
  return (
    <div ref={parentRef} style={{ height: '600px', overflow: 'auto' }}>
      {virtualizer.getVirtualItems().map((virtualRow) => (
        <SQLRow key={virtualRow.index} sql={sqlList[virtualRow.index]} />
      ))}
    </div>
  );
}
```

---

## 권장 구현 우선순위

### Phase 1: 즉시 적용 (High Priority)
1. ✅ **Supabase 인덱스 추가**: 위의 인덱스 SQL을 마이그레이션으로 생성
2. ✅ **쿼리 최적화**: 불필요한 LIKE, 서브쿼리 제거
3. ✅ **React Query 캐싱**: staleTime 30초로 설정

### Phase 2: 중기 개선 (Medium Priority)
4. **백그라운드 메트릭 수집**: Node-cron으로 주기적 수집
5. **statistic# 캐싱**: v$statname 조회 결과를 메모리에 캐싱
6. **가상 스크롤**: 긴 리스트에 react-virtual 적용

### Phase 3: 장기 개선 (Low Priority)
7. **Redis 캐싱**: 메트릭 데이터를 Redis에 캐싱
8. **GraphQL 도입**: 필요한 필드만 조회
9. **SSE/WebSocket**: 실시간 업데이트 스트리밍

---

## 예상 성능 개선 효과

| 최적화 항목 | Before | After | 개선율 |
|------------|--------|-------|--------|
| Dashboard 로딩 | 3-5초 | 0.5-1초 | **80%** |
| SQL Statistics | 2-4초 | 0.3-0.8초 | **75%** |
| Session Monitor | 2-3초 | 0.5-1초 | **70%** |
| Analysis Page | 4-6초 | 1-2초 | **70%** |

---

## 모니터링 및 측정

### 성능 메트릭 추적

```typescript
// src/lib/monitoring/performance.ts
export function trackQueryPerformance(queryName: string, duration: number) {
  console.log(`[Performance] ${queryName}: ${duration}ms`);

  // 평균 응답 시간이 1초 이상이면 경고
  if (duration > 1000) {
    console.warn(`[Performance Warning] ${queryName} took ${duration}ms`);
  }
}
```

### 사용 예시

```typescript
const start = Date.now();
const data = await fetch('/api/dashboard/metrics');
const duration = Date.now() - start;
trackQueryPerformance('dashboard-metrics', duration);
```

---

---

## 2025-11-27: Oracle 직접 조회 API 성능 개선 작업 완료

### 개요
Oracle 데이터베이스를 직접 조회하는 모니터링 API들의 성능을 최적화했습니다.

### 적용된 최적화 기법

#### 1. 병렬 쿼리 실행 (Promise.all)
독립적인 여러 쿼리를 순차 실행에서 병렬 실행으로 변경:

```typescript
// Before
const result1 = await executeQuery(config, query1);
const result2 = await executeQuery(config, query2);
const result3 = await executeQuery(config, query3);

// After
const [result1, result2, result3] = await Promise.all([
  executeQuery(config, query1),
  executeQuery(config, query2),
  executeQuery(config, query3)
]);
```

**적용 API**: `/api/monitoring/metrics`, `/api/monitoring/wait-events`

#### 2. Oracle 힌트 추가

**PARALLEL(n)**: 병렬 처리 지시
```sql
SELECT /*+ PARALLEL(2) */ * FROM v$sql
```

**FIRST_ROWS(n)**: 첫 n개 행을 빠르게 반환
```sql
SELECT /*+ FIRST_ROWS(10) */ * FROM v$sql ORDER BY elapsed_time DESC
```

**INDEX_FFS**: Index Full Fast Scan 사용
```sql
SELECT /*+ INDEX_FFS(v$system_event) */ * FROM v$system_event
```

**LEADING + USE_HASH**: 조인 순서 및 Hash Join 지정
```sql
SELECT /*+ LEADING(s) USE_HASH(sq cpu) */ *
FROM v$session s
LEFT JOIN v$sql sq ON s.sql_id = sq.sql_id
```

#### 3. 결과 제한 추가

대량 데이터 조회를 방지하기 위한 FETCH FIRST 추가:
```sql
FETCH FIRST 200 ROWS ONLY
```

**적용 API**: `/api/monitoring/sessions` (200개), `/api/monitoring/locks` (500개)

#### 4. 조인 최적화

v$sql 조인 시 중복 방지:
```sql
LEFT JOIN v$sql sq ON s.sql_id = sq.sql_id AND ROWNUM <= 1
```

#### 5. 샘플링을 통한 데이터 양 감소

전체 v$sql 스캔 대신 최근 1000개만 샘플링:
```sql
SELECT ... FROM (
  SELECT * FROM v$sql
  WHERE ...
  ORDER BY last_active_time DESC
  FETCH FIRST 1000 ROWS ONLY
)
```

### 최적화된 API 목록

| API | 파일 | 주요 개선사항 | 예상 향상률 |
|-----|------|--------------|------------|
| `/api/monitoring/metrics` | `src/app/api/monitoring/metrics/route.ts` | 병렬 쿼리, 힌트 추가, 샘플링 | 40-60% |
| `/api/monitoring/sessions` | `src/app/api/monitoring/sessions/route.ts` | 힌트, 조인 최적화, 결과 제한 | 30-40% |
| `/api/monitoring/wait-events` | `src/app/api/monitoring/wait-events/route.ts` | 병렬 쿼리, 힌트 추가 | 30-50% |
| `/api/monitoring/sql-statistics` | `src/app/api/monitoring/sql-statistics/route.ts` | 힌트 추가 | 20-30% |
| `/api/monitoring/locks` | `src/app/api/monitoring/locks/route.ts` | 힌트, 조인 최적화, 결과 제한 | 30-40% |
| `/api/dashboard/metrics` | `src/app/api/dashboard/metrics/route.ts` | 힌트 추가 | 10-20% |

### 코드 변경 예시

#### Before
```typescript
// 순차 실행
const sessionResult = await executeQuery(config, sessionQuery);
const sqlStatsResult = await executeQuery(config, sqlStatsQuery);
const memoryResult = await executeQuery(config, memoryQuery);
```

#### After
```typescript
// 병렬 실행 + 힌트
const [sessionResult, sqlStatsResult, memoryResult] = await Promise.all([
  executeQuery(config, `
    SELECT /*+ PARALLEL(2) */ ... FROM v$session
  `),
  executeQuery(config, `
    SELECT /*+ PARALLEL(2) */ ... FROM (
      SELECT * FROM v$sql ... FETCH FIRST 1000 ROWS ONLY
    )
  `),
  executeQuery(config, `SELECT ... FROM v$sga`)
]);
```

### 성능 벤치마크 (예상)

| 메트릭 | 개선 전 | 개선 후 | 향상률 |
|--------|---------|---------|--------|
| 모니터링 페이지 로딩 | ~3000ms | ~1200ms | **60%** ↑ |
| 세션 모니터링 | ~800ms | ~500ms | **37%** ↑ |
| 대기 이벤트 조회 | ~600ms | ~300ms | **50%** ↑ |
| SQL 통계 조회 | ~1000ms | ~750ms | **25%** ↑ |
| Lock 모니터링 | ~700ms | ~450ms | **36%** ↑ |
| **평균** | | | **~40%** ↑ |

### 추가 개선 사항

#### 1. 타입 안정성 개선
- TypeScript 타입 명시 추가
- 불필요한 import 제거

#### 2. 에러 처리 강화
- 권한 부족 시 빈 결과 반환
- 쿼리 실패 시 기본값 제공

### 다음 단계 권장사항

1. **결과 캐싱**: Redis나 메모리 캐시 도입 (30초~1분)
2. **백그라운드 수집**: 주기적으로 메트릭을 수집하여 Supabase에 저장
3. **성능 모니터링**: 실제 응답 시간 측정 및 로깅
4. **가상 스크롤**: 긴 리스트에 react-virtual 적용

### 검증 방법

```bash
# 개발 서버 실행
npm run dev

# 브라우저에서 Network 탭으로 응답 시간 확인
# http://localhost:3000/monitoring
```

---

## 참고 자료

- [Oracle Performance Tuning Guide](https://docs.oracle.com/en/database/oracle/oracle-database/19/tgdba/)
- [Oracle SQL Hints](https://docs.oracle.com/en/database/oracle/oracle-database/19/sqlrf/Comments.html#GUID-D316D545-89E2-4D54-977F-FC97815CD62E)
- [React Query Best Practices](https://tanstack.com/query/latest/docs/react/guides/important-defaults)
- [Supabase Indexing](https://supabase.com/docs/guides/database/indexes)
