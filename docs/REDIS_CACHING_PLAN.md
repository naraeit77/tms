# TMS v2.0 Redis 캐싱 성능 향상 계획

Redis 도입을 통한 TMS 성능 최적화 전략 문서입니다.

---

## 목차

1. [도입 배경](#1-도입-배경)
2. [현재 성능 병목점 분석](#2-현재-성능-병목점-분석)
3. [캐싱 대상 및 전략](#3-캐싱-대상-및-전략)
4. [아키텍처 설계](#4-아키텍처-설계)
5. [구현 계획](#5-구현-계획)
6. [코드 구현 예시](#6-코드-구현-예시)
7. [예상 성능 개선 효과](#7-예상-성능-개선-효과)
8. [모니터링 및 운영](#8-모니터링-및-운영)
9. [롤백 계획](#9-롤백-계획)

---

## 1. 도입 배경

### 1.1 현재 상황

TMS v2.0은 Oracle 데이터베이스에서 직접 성능 메트릭을 조회합니다:

```
[Browser] → [Next.js API] → [Oracle DB] → [Response]
```

**문제점**:
- 매 요청마다 Oracle 쿼리 실행
- V$VIEW 조회는 DB에 부하 유발
- 동시 사용자 증가 시 응답 시간 급증
- 동일 데이터 반복 조회 (비효율)

### 1.2 Redis 도입 목표

| 목표 | 현재 | 목표 |
|------|------|------|
| 대시보드 응답 시간 | 500ms~2s | < 100ms |
| Oracle DB 부하 | 100% | 30~50% 감소 |
| 동시 사용자 지원 | 10명 | 50명+ |
| API 처리량 | 50 req/s | 200 req/s |

### 1.3 도입 시점 판단 기준

다음 조건 중 하나 이상 충족 시 Redis 도입 권장:

- [ ] 동시 사용자 10명 이상
- [ ] 대시보드 응답 시간 > 1초
- [ ] Oracle DB CPU 사용률 > 70%
- [ ] 동일 API 호출 빈도 > 10회/분

---

## 2. 현재 성능 병목점 분석

### 2.1 고빈도 API 분석

| API | 호출 빈도 | 평균 응답시간 | 캐싱 효과 |
|-----|----------|--------------|----------|
| `/api/dashboard/metrics` | 매 30초 | 800ms | 높음 |
| `/api/monitoring/sessions` | 매 30초 | 500ms | 높음 |
| `/api/monitoring/sql-statistics` | 매 1분 | 1.2s | 매우 높음 |
| `/api/monitoring/wait-events` | 매 30초 | 400ms | 높음 |
| `/api/monitoring/locks` | 매 30초 | 300ms | 높음 |
| `/api/oracle/schemas` | 페이지 로드 | 200ms | 높음 |
| `/api/llm/analyze` | 분석 요청 | 3~10s | 매우 높음 |

### 2.2 Oracle 쿼리 부하 분석

**무거운 V$ VIEW 조회**:
```sql
-- 세션 조회 (V$SESSION + V$PROCESS)
SELECT * FROM V$SESSION s, V$PROCESS p WHERE s.PADDR = p.ADDR;

-- SQL 통계 (V$SQLAREA)
SELECT * FROM V$SQLAREA ORDER BY ELAPSED_TIME DESC;

-- Wait Events (V$SYSTEM_EVENT)
SELECT * FROM V$SYSTEM_EVENT ORDER BY TIME_WAITED DESC;
```

이러한 쿼리들은 매번 실행 시 Oracle 내부 래치 경합을 유발합니다.

---

## 3. 캐싱 대상 및 전략

### 3.1 캐싱 레이어 분류

```
┌─────────────────────────────────────────────────────────────┐
│                    캐싱 레이어 구조                          │
├─────────────────────────────────────────────────────────────┤
│  L1: 메모리 캐시 (Node.js)  │  TTL: 5~10초  │  최신 데이터   │
├─────────────────────────────────────────────────────────────┤
│  L2: Redis 캐시             │  TTL: 30초~5분 │  공유 데이터   │
├─────────────────────────────────────────────────────────────┤
│  L3: Oracle DB              │  원본 데이터   │  영구 저장소   │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 캐싱 대상별 전략

#### Tier 1: 실시간 모니터링 데이터 (TTL: 30초)

| 데이터 | 키 패턴 | TTL | 무효화 조건 |
|--------|---------|-----|------------|
| 세션 목록 | `tms:{connId}:sessions` | 30초 | 수동 새로고침 |
| 락 정보 | `tms:{connId}:locks` | 30초 | 수동 새로고침 |
| Wait Events | `tms:{connId}:wait-events` | 30초 | 수동 새로고침 |
| 실시간 메트릭 | `tms:{connId}:realtime` | 15초 | 자동 갱신 |

#### Tier 2: 통계/분석 데이터 (TTL: 1~5분)

| 데이터 | 키 패턴 | TTL | 무효화 조건 |
|--------|---------|-----|------------|
| Top SQL 목록 | `tms:{connId}:top-sql:{limit}` | 1분 | 수동 새로고침 |
| SQL 상세 통계 | `tms:{connId}:sql:{sqlId}` | 5분 | SQL 변경 시 |
| 대시보드 메트릭 | `tms:{connId}:dashboard` | 30초 | 수동 새로고침 |
| 성능 트렌드 | `tms:{connId}:trend:{period}` | 5분 | 기간 변경 시 |

#### Tier 3: 메타데이터 (TTL: 10분~1시간)

| 데이터 | 키 패턴 | TTL | 무효화 조건 |
|--------|---------|-----|------------|
| 스키마 목록 | `tms:{connId}:schemas` | 1시간 | DDL 감지 시 |
| 테이블 목록 | `tms:{connId}:tables:{schema}` | 30분 | DDL 감지 시 |
| 컬럼 정보 | `tms:{connId}:columns:{table}` | 30분 | DDL 감지 시 |
| DB 연결 정보 | `tms:connections` | 10분 | 연결 변경 시 |

#### Tier 4: LLM 분석 결과 (TTL: 24시간)

| 데이터 | 키 패턴 | TTL | 무효화 조건 |
|--------|---------|-----|------------|
| SQL 분석 결과 | `tms:llm:sql:{hash}` | 24시간 | 모델 변경 시 |
| 실행계획 분석 | `tms:llm:plan:{hash}` | 24시간 | 모델 변경 시 |
| 튜닝 권고사항 | `tms:llm:tuning:{hash}` | 24시간 | 모델 변경 시 |

### 3.3 캐시 키 설계 원칙

```typescript
// 키 네이밍 컨벤션
const cacheKey = {
  // 기본 구조: tms:{scope}:{resource}:{identifier}

  // 연결별 데이터
  sessions: (connId: string) => `tms:${connId}:sessions`,
  topSql: (connId: string, limit: number) => `tms:${connId}:top-sql:${limit}`,

  // SQL 해시 기반
  sqlAnalysis: (sqlHash: string) => `tms:llm:sql:${sqlHash}`,

  // 복합 키
  trend: (connId: string, period: string, metric: string) =>
    `tms:${connId}:trend:${period}:${metric}`,
};
```

---

## 4. 아키텍처 설계

### 4.1 전체 아키텍처

```
┌──────────────────────────────────────────────────────────────────────┐
│                           Client (Browser)                            │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Next.js API Routes                            │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    Cache Middleware Layer                        │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │ │
│  │  │ Cache-Aside │  │ Write-Through│  │ Cache Invalidation     │  │ │
│  │  │   Pattern   │  │   Pattern   │  │ Event Handler          │  │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 │                               │
                 ▼                               ▼
┌────────────────────────────┐    ┌────────────────────────────────────┐
│         Redis              │    │           Oracle DB                 │
│  ┌──────────────────────┐  │    │  ┌──────────────────────────────┐  │
│  │ Cached Data          │  │    │  │ V$SESSION, V$SQLAREA        │  │
│  │ - Sessions           │  │    │  │ V$SYSTEM_EVENT, etc.        │  │
│  │ - Metrics            │  │    │  └──────────────────────────────┘  │
│  │ - SQL Stats          │  │    │                                    │
│  │ - LLM Results        │  │    │  ┌──────────────────────────────┐  │
│  └──────────────────────┘  │    │  │ Application Tables           │  │
│                            │    │  │ - tuning_tasks               │  │
│  Port: 6379                │    │  │ - sql_history                │  │
└────────────────────────────┘    └──────────────────────────────────┘
```

### 4.2 캐싱 패턴

#### Cache-Aside Pattern (주요 패턴)

```
1. 클라이언트 요청
2. Redis 캐시 확인
   - HIT → 캐시 데이터 반환
   - MISS → Oracle 조회 → Redis 저장 → 반환
```

```typescript
async function getCachedData<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl: number
): Promise<T> {
  // 1. Redis에서 조회
  const cached = await redis.get(key);
  if (cached) {
    return JSON.parse(cached);
  }

  // 2. Oracle에서 조회
  const data = await fetchFn();

  // 3. Redis에 저장
  await redis.setex(key, ttl, JSON.stringify(data));

  return data;
}
```

#### Write-Through Pattern (데이터 변경 시)

```
1. 데이터 변경 요청
2. Oracle 업데이트
3. Redis 캐시 무효화 또는 갱신
```

### 4.3 캐시 무효화 전략

```typescript
// 이벤트 기반 무효화
const cacheInvalidation = {
  // 수동 새로고침
  onRefresh: async (connId: string, resource: string) => {
    await redis.del(`tms:${connId}:${resource}`);
  },

  // DDL 감지 시 메타데이터 무효화
  onDDL: async (connId: string) => {
    const keys = await redis.keys(`tms:${connId}:schemas*`);
    keys.push(...await redis.keys(`tms:${connId}:tables*`));
    keys.push(...await redis.keys(`tms:${connId}:columns*`));
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  },

  // 연결 변경 시
  onConnectionChange: async (connId: string) => {
    const keys = await redis.keys(`tms:${connId}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  },
};
```

---

## 5. 구현 계획

### 5.1 단계별 구현 로드맵

```
Phase 1: 기반 구축 (1주)
├── Redis 클라이언트 설정
├── 캐시 유틸리티 함수 구현
└── 환경 설정 및 테스트

Phase 2: Tier 1 캐싱 (1주)
├── 대시보드 메트릭 캐싱
├── 세션 목록 캐싱
└── Wait Events 캐싱

Phase 3: Tier 2 캐싱 (1주)
├── Top SQL 캐싱
├── SQL 상세 통계 캐싱
└── 성능 트렌드 캐싱

Phase 4: Tier 3-4 캐싱 (1주)
├── 메타데이터 캐싱
├── LLM 분석 결과 캐싱
└── 캐시 무효화 로직 구현

Phase 5: 최적화 및 모니터링 (1주)
├── 캐시 적중률 모니터링
├── TTL 최적화
└── 성능 테스트 및 튜닝
```

### 5.2 파일 구조

```
src/
├── lib/
│   ├── redis/
│   │   ├── client.ts          # Redis 클라이언트 설정
│   │   ├── cache.ts           # 캐시 유틸리티 함수
│   │   ├── keys.ts            # 캐시 키 생성 함수
│   │   ├── invalidation.ts    # 캐시 무효화 로직
│   │   └── index.ts           # 모듈 export
│   └── ...
├── app/
│   └── api/
│       └── monitoring/
│           └── sessions/
│               └── route.ts   # 캐싱 적용된 API
└── ...
```

---

## 6. 코드 구현 예시

### 6.1 Redis 클라이언트 설정

```typescript
// src/lib/redis/client.ts
import Redis from 'ioredis';

let redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    redis.on('connect', () => {
      console.log('Redis connected');
    });
  }

  return redis;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
```

### 6.2 캐시 유틸리티 함수

```typescript
// src/lib/redis/cache.ts
import { getRedisClient } from './client';

interface CacheOptions {
  ttl: number;           // TTL in seconds
  prefix?: string;       // Key prefix
  serialize?: boolean;   // JSON serialize (default: true)
}

const DEFAULT_OPTIONS: CacheOptions = {
  ttl: 60,
  prefix: 'tms',
  serialize: true,
};

export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedisClient();
    const data = await redis.get(key);

    if (!data) return null;

    return JSON.parse(data) as T;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
}

export async function setCache<T>(
  key: string,
  data: T,
  options: Partial<CacheOptions> = {}
): Promise<void> {
  try {
    const redis = getRedisClient();
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const serialized = opts.serialize ? JSON.stringify(data) : String(data);

    await redis.setex(key, opts.ttl, serialized);
  } catch (error) {
    console.error('Cache set error:', error);
  }
}

export async function deleteCache(key: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.del(key);
  } catch (error) {
    console.error('Cache delete error:', error);
  }
}

export async function deleteCachePattern(pattern: string): Promise<void> {
  try {
    const redis = getRedisClient();
    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.error('Cache delete pattern error:', error);
  }
}

// Cache-Aside 패턴 구현
export async function withCache<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: Partial<CacheOptions> = {}
): Promise<T> {
  // 1. 캐시 확인
  const cached = await getCache<T>(key);
  if (cached !== null) {
    return cached;
  }

  // 2. 원본 데이터 조회
  const data = await fetchFn();

  // 3. 캐시 저장
  await setCache(key, data, options);

  return data;
}
```

### 6.3 캐시 키 생성 함수

```typescript
// src/lib/redis/keys.ts

export const CacheKeys = {
  // 모니터링 데이터
  sessions: (connId: string) => `tms:${connId}:sessions`,
  locks: (connId: string) => `tms:${connId}:locks`,
  waitEvents: (connId: string) => `tms:${connId}:wait-events`,
  realtime: (connId: string) => `tms:${connId}:realtime`,

  // SQL 통계
  topSql: (connId: string, limit: number = 100) =>
    `tms:${connId}:top-sql:${limit}`,
  sqlDetail: (connId: string, sqlId: string) =>
    `tms:${connId}:sql:${sqlId}`,
  sqlText: (connId: string, sqlId: string) =>
    `tms:${connId}:sql-text:${sqlId}`,

  // 대시보드
  dashboard: (connId: string) => `tms:${connId}:dashboard`,
  trend: (connId: string, period: string) =>
    `tms:${connId}:trend:${period}`,

  // 메타데이터
  schemas: (connId: string) => `tms:${connId}:schemas`,
  tables: (connId: string, schema: string) =>
    `tms:${connId}:tables:${schema}`,
  columns: (connId: string, schema: string, table: string) =>
    `tms:${connId}:columns:${schema}:${table}`,

  // LLM 분석
  llmSqlAnalysis: (sqlHash: string) => `tms:llm:sql:${sqlHash}`,
  llmPlanAnalysis: (planHash: string) => `tms:llm:plan:${planHash}`,
  llmTuning: (sqlHash: string) => `tms:llm:tuning:${sqlHash}`,

  // 연결 정보
  connections: () => 'tms:connections',
  connectionHealth: (connId: string) => `tms:${connId}:health`,
};

// TTL 상수 (초 단위)
export const CacheTTL = {
  REALTIME: 15,           // 15초
  SHORT: 30,              // 30초
  MEDIUM: 60,             // 1분
  LONG: 300,              // 5분
  METADATA: 1800,         // 30분
  SCHEMA: 3600,           // 1시간
  LLM_ANALYSIS: 86400,    // 24시간
};
```

### 6.4 API 라우트에 캐싱 적용 예시

```typescript
// src/app/api/monitoring/sessions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { withCache } from '@/lib/redis/cache';
import { CacheKeys, CacheTTL } from '@/lib/redis/keys';
import { getOracleConnection } from '@/lib/oracle/client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('connectionId');

    if (!connectionId) {
      return NextResponse.json(
        { error: 'connectionId is required' },
        { status: 400 }
      );
    }

    // Redis 캐싱 적용
    const sessions = await withCache(
      CacheKeys.sessions(connectionId),
      async () => {
        // Oracle에서 세션 조회
        const connection = await getOracleConnection(connectionId);
        const result = await connection.execute(`
          SELECT
            s.SID,
            s.SERIAL#,
            s.USERNAME,
            s.STATUS,
            s.PROGRAM,
            s.MACHINE,
            s.SQL_ID,
            s.EVENT,
            s.WAIT_CLASS,
            s.SECONDS_IN_WAIT
          FROM V$SESSION s
          WHERE s.TYPE = 'USER'
          ORDER BY s.STATUS, s.USERNAME
        `);

        return result.rows;
      },
      { ttl: CacheTTL.SHORT }  // 30초 캐싱
    );

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('Sessions API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 }
    );
  }
}
```

### 6.5 LLM 분석 결과 캐싱 예시

```typescript
// src/app/api/llm/analyze/route.ts
import { createHash } from 'crypto';
import { withCache } from '@/lib/redis/cache';
import { CacheKeys, CacheTTL } from '@/lib/redis/keys';

// SQL 해시 생성 (정규화 후)
function getSqlHash(sql: string): string {
  const normalized = sql
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('md5').update(normalized).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const { sql, analysisType } = await request.json();

    const sqlHash = getSqlHash(sql);
    const cacheKey = CacheKeys.llmSqlAnalysis(sqlHash);

    // 동일 SQL에 대한 분석 결과 캐싱 (24시간)
    const analysis = await withCache(
      cacheKey,
      async () => {
        // LLM 분석 수행 (비용이 큰 작업)
        const result = await performLLMAnalysis(sql, analysisType);
        return result;
      },
      { ttl: CacheTTL.LLM_ANALYSIS }
    );

    return NextResponse.json({
      analysis,
      cached: true,  // 캐시 여부 표시
    });
  } catch (error) {
    // ...
  }
}
```

### 6.6 캐시 무효화 API

```typescript
// src/app/api/cache/invalidate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { deleteCache, deleteCachePattern } from '@/lib/redis/cache';
import { CacheKeys } from '@/lib/redis/keys';

export async function POST(request: NextRequest) {
  try {
    const { connectionId, resource, all } = await request.json();

    if (all && connectionId) {
      // 특정 연결의 모든 캐시 삭제
      await deleteCachePattern(`tms:${connectionId}:*`);
      return NextResponse.json({
        success: true,
        message: `All cache cleared for connection: ${connectionId}`
      });
    }

    if (connectionId && resource) {
      // 특정 리소스 캐시만 삭제
      const keyFn = CacheKeys[resource as keyof typeof CacheKeys];
      if (typeof keyFn === 'function') {
        await deleteCache(keyFn(connectionId));
        return NextResponse.json({
          success: true,
          message: `Cache cleared: ${resource}`
        });
      }
    }

    return NextResponse.json(
      { error: 'Invalid parameters' },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to invalidate cache' },
      { status: 500 }
    );
  }
}
```

---

## 7. 예상 성능 개선 효과

### 7.1 응답 시간 개선

| API | 현재 (Oracle 직접) | 캐시 적용 후 | 개선율 |
|-----|-------------------|-------------|--------|
| 대시보드 메트릭 | 800ms | 50ms | 94% |
| 세션 목록 | 500ms | 30ms | 94% |
| Top SQL | 1,200ms | 80ms | 93% |
| Wait Events | 400ms | 25ms | 94% |
| 스키마 목록 | 200ms | 10ms | 95% |
| LLM 분석 (캐시 HIT) | 5,000ms | 100ms | 98% |

### 7.2 Oracle DB 부하 감소

```
Before (10 concurrent users):
- Oracle CPU: 70%
- Queries/sec: 100

After (10 concurrent users):
- Oracle CPU: 25%
- Queries/sec: 30 (캐시 HIT로 인한 감소)
- Cache HIT ratio: 70%+
```

### 7.3 동시 사용자 확장성

```
┌────────────────────────────────────────────────────────────┐
│ 동시 사용자 대비 응답 시간                                   │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  응답시간                                                   │
│  (ms)    │                                                 │
│  2000    │    ●---● Without Redis                         │
│          │   /                                             │
│  1500    │  /                                              │
│          │ /                                               │
│  1000    │●                                                │
│          │                                                 │
│   500    │                                                 │
│          │●---●---●---●---● With Redis                    │
│     0    └─────────────────────────────────────────────   │
│          10    20    30    40    50   동시 사용자          │
└────────────────────────────────────────────────────────────┘
```

### 7.4 비용 절감 효과

| 항목 | 현재 | Redis 도입 후 |
|------|------|---------------|
| Oracle 라이선스 | CPU 기반 과금 | CPU 사용량 30% 감소 |
| 서버 증설 필요성 | 사용자 20명+ 시 | 사용자 100명+ 시 |
| LLM API 호출 비용 | 모든 분석 요청 | 신규 SQL만 (70% 절감) |

---

## 8. 모니터링 및 운영

### 8.1 캐시 모니터링 대시보드

```typescript
// src/app/api/cache/stats/route.ts
export async function GET() {
  const redis = getRedisClient();
  const info = await redis.info('stats');

  // 주요 메트릭 파싱
  const stats = {
    hits: parseInt(info.match(/keyspace_hits:(\d+)/)?.[1] || '0'),
    misses: parseInt(info.match(/keyspace_misses:(\d+)/)?.[1] || '0'),
    memory: await redis.info('memory'),
    keys: await redis.dbsize(),
  };

  const hitRatio = stats.hits / (stats.hits + stats.misses) * 100;

  return NextResponse.json({
    ...stats,
    hitRatio: hitRatio.toFixed(2) + '%',
  });
}
```

### 8.2 알림 설정

```typescript
// 캐시 적중률 모니터링
const CACHE_HIT_THRESHOLD = 60; // 60% 미만 시 알림

async function checkCacheHealth() {
  const stats = await getCacheStats();

  if (stats.hitRatio < CACHE_HIT_THRESHOLD) {
    console.warn(`Cache hit ratio low: ${stats.hitRatio}%`);
    // 알림 발송 로직
  }
}
```

### 8.3 Redis 운영 명령어

```bash
# Redis 상태 확인
redis-cli info

# 메모리 사용량
redis-cli info memory

# 캐시 키 목록
redis-cli keys "tms:*"

# 특정 패턴 키 삭제
redis-cli keys "tms:*:sessions" | xargs redis-cli del

# 전체 캐시 삭제 (주의!)
redis-cli flushdb

# 실시간 모니터링
redis-cli monitor
```

### 8.4 Redis 설정 최적화

```conf
# /opt/homebrew/etc/redis.conf (MacStudio)

# 메모리 제한 (시스템 메모리의 25% 권장)
maxmemory 4gb

# 메모리 초과 시 정책 (LRU 권장)
maxmemory-policy allkeys-lru

# 영속성 설정 (캐시용이므로 비활성화 가능)
save ""
appendonly no

# 연결 설정
timeout 300
tcp-keepalive 60

# 로깅
loglevel notice
logfile /var/log/redis/redis.log
```

---

## 9. 롤백 계획

### 9.1 Redis 장애 시 Fallback

```typescript
// src/lib/redis/cache.ts

export async function withCacheFallback<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: Partial<CacheOptions> = {}
): Promise<T> {
  try {
    // Redis 연결 확인
    const redis = getRedisClient();
    await redis.ping();

    // 정상 동작
    return await withCache(key, fetchFn, options);
  } catch (redisError) {
    console.warn('Redis unavailable, falling back to direct query');

    // Redis 장애 시 Oracle 직접 조회
    return await fetchFn();
  }
}
```

### 9.2 단계별 롤백 절차

```
1. 문제 감지
   - 캐시 적중률 급감
   - Redis 연결 오류
   - 데이터 불일치

2. 즉시 조치
   - 환경변수에서 Redis 비활성화
   - REDIS_ENABLED=false

3. 원인 분석
   - Redis 로그 확인
   - 메모리 사용량 확인
   - 네트워크 상태 확인

4. 복구
   - Redis 재시작
   - 캐시 초기화
   - 점진적 활성화
```

### 9.3 환경변수 기반 제어

```typescript
// src/lib/redis/client.ts

const REDIS_ENABLED = process.env.REDIS_ENABLED !== 'false';

export function isRedisEnabled(): boolean {
  return REDIS_ENABLED && !!process.env.REDIS_URL;
}

export async function withOptionalCache<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: Partial<CacheOptions> = {}
): Promise<T> {
  if (!isRedisEnabled()) {
    return fetchFn();
  }

  return withCacheFallback(key, fetchFn, options);
}
```

---

## 부록: 체크리스트

### 도입 전 체크리스트

- [ ] Redis 서버 설치 및 설정
- [ ] 네트워크 방화벽 설정 (포트 6379)
- [ ] 메모리 용량 계산 및 확보
- [ ] 환경변수 설정 (REDIS_URL)
- [ ] ioredis 패키지 설치

### 구현 체크리스트

- [ ] Redis 클라이언트 모듈 구현
- [ ] 캐시 유틸리티 함수 구현
- [ ] 캐시 키 설계 및 상수 정의
- [ ] 고빈도 API에 캐싱 적용
- [ ] 캐시 무효화 로직 구현
- [ ] Fallback 로직 구현
- [ ] 모니터링 API 구현

### 테스트 체크리스트

- [ ] 단위 테스트 (캐시 함수)
- [ ] 통합 테스트 (API + Redis)
- [ ] 부하 테스트 (동시 사용자)
- [ ] 장애 테스트 (Redis 중단 시)
- [ ] 데이터 정합성 테스트

### 운영 체크리스트

- [ ] 모니터링 대시보드 설정
- [ ] 알림 설정 (적중률, 메모리)
- [ ] 로그 로테이션 설정
- [ ] 백업 정책 수립 (필요 시)
- [ ] 롤백 절차 문서화

---

**작성일**: 2026-02-06
**버전**: v1.0
**상태**: 계획 단계
**작성자**: 주식회사 나래정보기술
