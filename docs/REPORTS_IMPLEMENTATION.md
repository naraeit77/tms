# 성능 요약 보고서 실제 데이터 연동 구현

## 개요

성능 요약 보고서 페이지(`/reports/summary`)를 Supabase `sql_statistics` 테이블의 실제 데이터와 연동하도록 구현했습니다.

## 구현 세부사항

### 1. API 엔드포인트 수정

**파일**: `src/app/api/reports/summary/route.ts`

#### 주요 변경사항

**이전**: Oracle 데이터베이스에 직접 쿼리
```typescript
const result = await executeQuery(config, query);
```

**이후**: Supabase sql_statistics 테이블 조회
```typescript
const { data, error } = await supabase
  .from('sql_statistics')
  .select('sql_id, executions, elapsed_time_ms')
  .eq('oracle_connection_id', databaseId)
  .gte('collected_at', cutoffDate.toISOString());
```

#### 새로운 함수

1. **getSQLStatisticsFromSupabase()**
   - SQL 통계 집계 데이터 조회
   - 총 SQL 수, 총 실행 횟수, 평균 응답 시간 계산

2. **getPerformanceGradesFromSupabase()**
   - 성능 등급(A~F) 분포 계산
   - elapsed_time_ms, cpu_time_ms, gets_per_exec 기반 등급 부여

3. **getTopProblematicSQLFromSupabase()**
   - WARNING, CRITICAL 상태의 SQL 조회
   - elapsed_time_ms 기준 내림차순 정렬

4. **calculateGradeFromSupabase()**
   - Supabase 데이터 형식에 맞춘 등급 계산 로직
   - 밀리초 단위 메트릭 사용

5. **getPeriodCutoffDate()**
   - 기간(24h, 7d, 30d, 90d)별 날짜 필터링

### 2. 데이터 흐름

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 사용자가 /reports/summary 페이지 방문                   │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. 데이터베이스 선택 (oracle_connections ID)               │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. API 호출:                                                │
│    GET /api/reports/summary?databaseId=xxx&period=7d        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Supabase sql_statistics 테이블 쿼리                      │
│    - 기간 필터링 (collected_at >= cutoffDate)              │
│    - oracle_connection_id 필터링                            │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. 데이터 집계 및 계산                                      │
│    - 총 SQL 수 (DISTINCT sql_id)                           │
│    - 총 실행 횟수 (SUM executions)                         │
│    - 평균 응답 시간                                         │
│    - 성능 등급 분포 (A~F)                                   │
│    - 문제 SQL 목록                                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. JSON 응답 반환                                           │
│    {                                                        │
│      success: true,                                         │
│      data: { ... },                                         │
│      metadata: { source: 'supabase', ... }                  │
│    }                                                        │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. 페이지에 실제 데이터 표시                                │
│    - metadata.source === 'supabase' → 실제 데이터          │
│    - metadata.source === 'demo*' → 데모 데이터 배지 표시   │
└─────────────────────────────────────────────────────────────┘
```

### 3. 성능 등급 계산 로직

```typescript
function calculateGradeFromSupabase(row: any): string {
  let score = 0;

  // Elapsed time (milliseconds)
  if (avgElapsed < 10) score += 20;      // Excellent: < 10ms
  else if (avgElapsed < 100) score += 15; // Good: < 100ms
  else if (avgElapsed < 1000) score += 10; // Average: < 1s
  else if (avgElapsed < 10000) score += 5; // Poor: < 10s

  // CPU time (milliseconds)
  if (avgCpu < 5) score += 20;
  else if (avgCpu < 50) score += 15;
  else if (avgCpu < 500) score += 10;
  else if (avgCpu < 5000) score += 5;

  // Buffer gets
  if (avgBufferGets < 100) score += 20;
  else if (avgBufferGets < 1000) score += 15;
  else if (avgBufferGets < 10000) score += 10;
  else if (avgBufferGets < 100000) score += 5;

  // Grade assignment
  if (score >= 50) return 'A';
  if (score >= 40) return 'B';
  if (score >= 30) return 'C';
  if (score >= 20) return 'D';
  return 'F';
}
```

## 테스트 데이터 생성

### 샘플 데이터 삽입 스크립트

**파일**: `scripts/insert-sample-sql-statistics.sql`

#### 데이터 분포

- **Grade A**: 215개 (16%) - 우수한 성능
- **Grade B**: 417개 (32%) - 양호한 성능
- **Grade C**: 255개 (19%) - 보통 성능
- **Grade D**: 287개 (22%) - 불량한 성능
- **Grade F**: 142개 (11%) - 심각한 성능 문제

**총 1,316개의 SQL 통계 데이터**

#### 실행 방법

1. Supabase SQL Editor에서 스크립트 실행
2. 첫 번째 활성 oracle_connection을 자동으로 사용
3. 최근 7일간의 랜덤 타임스탬프로 데이터 생성

```sql
-- 예시: Supabase SQL Editor에서 실행
-- 파일 내용을 복사하여 붙여넣기
```

## 데이터베이스 스키마

### sql_statistics 테이블

주요 컬럼:
- `oracle_connection_id`: Oracle 연결 참조 (FK)
- `sql_id`: SQL 식별자 (13자)
- `elapsed_time_ms`: 총 경과 시간 (밀리초)
- `cpu_time_ms`: CPU 시간 (밀리초)
- `buffer_gets`: 버퍼 읽기 횟수
- `disk_reads`: 디스크 읽기 횟수
- `executions`: 실행 횟수
- `avg_elapsed_time_ms`: 평균 경과 시간
- `avg_cpu_time_ms`: 평균 CPU 시간
- `gets_per_exec`: 실행당 버퍼 읽기
- `collected_at`: 수집 시간
- `status`: 상태 (NORMAL, WARNING, CRITICAL, TUNING)
- `priority`: 우선순위 (LOW, MEDIUM, HIGH, CRITICAL)

## 사용 방법

### 1. Oracle 연결 생성

Supabase `oracle_connections` 테이블에 연결 정보 추가:

```sql
INSERT INTO oracle_connections (
  name, host, port, service_name, username,
  password_encrypted, connection_type, is_active
) VALUES (
  'Production DB',
  'oracle.example.com',
  1521,
  'ORCL',
  'system',
  'encrypted_password',
  'SERVICE_NAME',
  true
);
```

### 2. 샘플 데이터 삽입

```bash
# Supabase SQL Editor에서 scripts/insert-sample-sql-statistics.sql 실행
```

### 3. 보고서 페이지 확인

1. 로그인 후 `/reports/summary` 페이지 방문
2. 상단에서 데이터베이스 선택
3. 기간 선택 (24h, 7d, 30d, 90d)
4. 실제 데이터 확인

## 메타데이터 표시

페이지는 `metadata.source` 값을 기반으로 데이터 소스를 표시합니다:

- `'supabase'`: 실제 Supabase 데이터 (배지 없음)
- `'demo'`: 데이터베이스 미선택 시 데모 데이터
- `'demo-fallback'`: 데이터 조회 실패 시 폴백 (주황색 배지 + 안내 메시지)

```tsx
{isDemo && (
  <span className="px-3 py-1 bg-orange-100 text-orange-800 text-sm font-medium rounded-full">
    데모 데이터
  </span>
)}
```

## 향후 개선 사항

### 1. 실시간 Oracle 데이터 수집

현재는 `sql_statistics` 테이블에 저장된 데이터만 사용합니다. 향후 다음을 구현할 수 있습니다:

- **배치 수집**: 주기적으로 Oracle v$sql 뷰에서 데이터 수집
- **실시간 모니터링**: WebSocket을 통한 실시간 업데이트
- **자동 갱신**: 5분마다 최신 데이터 자동 수집

### 2. 리소스 사용률 실제 데이터

현재 CPU, 메모리, I/O 사용률은 하드코딩된 값입니다:

```typescript
resourceUtilization: {
  cpu: 67.3,  // TODO: Get from actual monitoring data
  memory: 78.5,
  io: 45.2
}
```

향후 Oracle v$sysstat, v$osstat 뷰에서 실제 데이터 수집 필요.

### 3. 캐싱 및 성능 최적화

- **Redis 캐싱**: 집계 데이터 캐싱 (5분 TTL)
- **Materialized View**: Supabase에서 사전 집계된 뷰 생성
- **인덱스 최적화**: collected_at + oracle_connection_id 복합 인덱스

### 4. 고급 분석 기능

- **트렌드 차트**: 시간별 성능 변화 추이
- **비교 분석**: 기간별 성능 비교
- **예측 분석**: 성능 저하 예측 및 경고

## 트러블슈팅

### 데모 데이터만 표시되는 경우

1. **oracle_connections 테이블 확인**
   ```sql
   SELECT id, name, is_active FROM oracle_connections;
   ```

2. **sql_statistics 데이터 확인**
   ```sql
   SELECT COUNT(*) FROM sql_statistics WHERE oracle_connection_id = 'YOUR_CONNECTION_ID';
   ```

3. **브라우저 콘솔 확인**
   - 네트워크 탭에서 API 응답 확인
   - metadata.source 값 확인
   - 오류 메시지 확인

### API 오류 발생 시

1. **Supabase 연결 확인**
   ```bash
   # .env.local 파일 확인
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
   ```

2. **RLS 정책 확인**
   - sql_statistics 테이블의 SELECT 정책이 활성화되어 있는지 확인

3. **서버 로그 확인**
   ```bash
   npm run dev
   # API 오류 메시지 확인
   ```

## 참고 자료

- [Supabase Documentation](https://supabase.com/docs)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)
- [Oracle SQL Monitoring](https://docs.oracle.com/en/database/oracle/oracle-database/)
