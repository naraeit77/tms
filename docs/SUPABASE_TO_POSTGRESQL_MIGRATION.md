# Supabase → 자체 PostgreSQL 마이그레이션 가이드

> **작성일**: 2024-11-21
> **대상 프로젝트**: Narae TMS v2.0
> **목적**: Supabase에서 자체 호스팅 PostgreSQL로 안전하게 전환

## 📋 문서 개요

본 문서는 Narae TMS v2.0 애플리케이션을 Supabase BaaS에서 자체 호스팅 PostgreSQL 데이터베이스로 마이그레이션하기 위한 **완전한 가이드**입니다.

**예상 소요 시간**: 7-9일
**예상 비용 절감**: 월 $120 (80% 절감)
**위험도**: 🟡 중간 (적절한 계획과 테스트로 관리 가능)

---

## 🎯 마이그레이션 목표

### 제거할 의존성
- `@supabase/ssr` - Supabase SSR 라이브러리
- Supabase Auth (NextAuth로 완전 대체)
- Supabase 클라이언트 SDK

### 유지할 기능
- NextAuth 인증 시스템 (완전 독립)
- 모든 비즈니스 로직
- Oracle 데이터베이스 연결 및 모니터링
- UI/UX 및 사용자 경험

### 추가할 구성요소
- `pg` (node-postgres) - PostgreSQL 클라이언트
- `pg-pool` - 연결 풀링
- PostgreSQL 연결 풀 관리 시스템
- 백업 및 복구 자동화

---

## 📊 현재 시스템 분석

### Supabase 사용 현황

#### 1. 인증 시스템
- **Supabase Auth**: 사용자 인증 및 세션 관리
- **NextAuth**: JWT 기반 세션 전략으로 Supabase Auth 래핑
- **파일**: `src/lib/auth.ts`, `src/app/api/auth/signup/route.ts`

#### 2. 데이터베이스 연결
```typescript
// 3가지 클라이언트 패턴 사용 중
- createClient() (server.ts) - 서버 컴포넌트용, service role key 사용
- createAuthClient() (server.ts) - 인증 전용, anon key 사용
- createPureClient() (server.ts) - 사용자 컨텍스트 없는 작업용
- createClient() (client.ts) - 브라우저 클라이언트용
```

#### 3. 데이터베이스 스키마
- **22개 테이블**:
  - 핵심: `oracle_connections`, `user_roles`, `user_profiles`, `system_settings`, `audit_logs`
  - 모니터링: `sql_statistics`, `wait_events`, `session_monitoring`, `execution_plans`
  - 튜닝: `sql_tuning_tasks`, `tuning_history`, `tuning_recommendations`, `plan_baselines`
  - 리포트: `reports`, `report_activities`, `awr_reports`, `statspack_snapshots`

#### 4. RLS 정책
- 모든 테이블에 RLS 활성화
- `auth.uid()` 함수를 통한 사용자 컨텍스트 접근
- 역할 기반 정책 (admin, tuner, viewer)

#### 5. API 사용 현황
- **97개 파일**에서 Supabase 클라이언트 import
- NextAuth 인증 흐름과 통합
- 대부분 API 라우트와 서버 컴포넌트에서 사용

#### 6. 환경 변수
```env
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

---

## 📝 상세 마이그레이션 단계

## Phase 1: 준비 단계 (2일)

### 1.1 환경 평가 및 백업 전략

#### 현재 Supabase 데이터 백업
```bash
# 1. Supabase에서 전체 데이터베이스 덤프 생성
pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" \
  -f backup_$(date +%Y%m%d_%H%M%S).sql \
  --no-owner --no-acl --clean --if-exists

# 2. 인증 사용자 데이터 백업 (Supabase Auth)
# Supabase Dashboard → Authentication → Users → Export CSV

# 3. 백업 검증
psql -f backup_20241121_120000.sql --dry-run
```

#### 백업 검증 체크리스트
```markdown
✅ PostgreSQL 덤프 파일 생성 완료
✅ 덤프 파일 크기 및 무결성 확인
✅ 테이블 개수 확인 (22개)
✅ 레코드 수 확인 (주요 테이블별)
✅ 인덱스 및 제약조건 확인
✅ 트리거 및 함수 확인
```

### 1.2 개발 및 테스트 환경 구축

#### PostgreSQL 설치 (CentOS/Rocky Linux)
```bash
# PostgreSQL 15 레포지토리 추가
sudo yum install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-8-x86_64/pgdg-redhat-repo-latest.noarch.rpm

# PostgreSQL 15 설치
sudo yum install -y postgresql15-server postgresql15-contrib

# PostgreSQL 초기화 및 시작
sudo /usr/pgsql-15/bin/postgresql-15-setup initdb
sudo systemctl enable postgresql-15
sudo systemctl start postgresql-15

# 버전 확인
psql --version
```

#### PostgreSQL 기본 설정
```bash
# PostgreSQL 설정 편집
sudo vi /var/lib/pgsql/15/data/postgresql.conf

# 권장 설정:
listen_addresses = 'localhost,192.168.x.x'  # 애플리케이션 서버 IP
max_connections = 100
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1  # SSD의 경우
effective_io_concurrency = 200

# pg_hba.conf 편집 (접근 제어)
sudo vi /var/lib/pgsql/15/data/pg_hba.conf

# 추가:
host    tms_production    tms_user    192.168.x.x/32    md5
host    tms_production    tms_user    localhost         md5

# PostgreSQL 재시작
sudo systemctl restart postgresql-15
```

#### 데이터베이스 및 사용자 생성
```sql
-- PostgreSQL에 접속
sudo -u postgres psql

-- 필수 확장 설치
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 데이터베이스 생성
CREATE DATABASE tms_production
  WITH ENCODING 'UTF8'
  LC_COLLATE='en_US.UTF-8'
  LC_CTYPE='en_US.UTF-8'
  TEMPLATE=template0;

-- 사용자 생성
CREATE USER tms_user WITH PASSWORD 'secure_password_here';

-- 권한 부여
GRANT ALL PRIVILEGES ON DATABASE tms_production TO tms_user;

-- 데이터베이스에 접속
\c tms_production

-- 스키마 권한 부여
GRANT ALL ON SCHEMA public TO tms_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO tms_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO tms_user;

-- 향후 생성될 객체에 대한 기본 권한 설정
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO tms_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO tms_user;
```

### 1.3 리스크 평가 매트릭스

| 리스크 항목 | 확률 | 영향도 | 심각도 | 완화 전략 |
|------------|------|--------|--------|----------|
| 데이터 손실 | 낮음 | 치명적 | 🔴 높음 | 다중 백업, 검증 프로세스 |
| 인증 시스템 장애 | 중간 | 높음 | 🟡 중간 | NextAuth 독립 테스트, 단계적 전환 |
| RLS 정책 누락 | 중간 | 높음 | 🟡 중간 | 애플리케이션 레벨 권한 검증 철저히 |
| 성능 저하 | 낮음 | 중간 | 🟢 낮음 | 인덱스 최적화, 연결 풀링 |
| 서비스 다운타임 | 중간 | 높음 | 🟡 중간 | 블루-그린 배포, 롤백 계획 |

---

## Phase 2: 데이터베이스 마이그레이션 (1일)

### 2.1 스키마 마이그레이션 수정

#### 변경 필요 사항:

**1. `auth.users` 참조 제거**

Supabase의 `auth.users` 테이블은 자체 PostgreSQL에 존재하지 않습니다. 다음과 같이 수정:

```sql
-- auth 스키마 및 users 테이블 생성
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    encrypted_password VARCHAR(255),
    email_confirmed_at TIMESTAMPTZ,
    email_verification_token VARCHAR(255),
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_auth_users_email ON auth.users(email);
CREATE INDEX idx_auth_users_verification_token ON auth.users(email_verification_token);
CREATE INDEX idx_auth_users_reset_token ON auth.users(password_reset_token);

-- updated_at 트리거 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- updated_at 트리거
CREATE TRIGGER update_auth_users_updated_at
    BEFORE UPDATE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

**2. RLS 정책 변경**

**권장 방식: RLS 비활성화 + 애플리케이션 레벨 권한 관리**

```sql
-- 모든 테이블의 RLS 비활성화
ALTER TABLE oracle_connections DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE sql_statistics DISABLE ROW LEVEL SECURITY;
ALTER TABLE sql_tuning_tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE reports DISABLE ROW LEVEL SECURITY;
-- ... 모든 테이블에 적용

-- RLS 정책 삭제
DROP POLICY IF EXISTS "Users can view active connections" ON oracle_connections;
DROP POLICY IF EXISTS "Admins can manage connections" ON oracle_connections;
-- ... 모든 정책 삭제
```

### 2.2 수정된 마이그레이션 디렉토리 생성

#### 새로운 마이그레이션 디렉토리 구조
```
migrations-postgres/
├── 0001_create_auth_schema.sql          # auth 스키마 및 users 테이블
├── 0002_create_core_tables.sql          # 기존 수정본
├── 0003_create_sql_monitoring_tables.sql
├── 0004_create_tuning_tables.sql
├── 0005_create_awr_reports_table.sql
├── 0006_create_statspack_tables.sql
├── 0007_create_stats_collection_history.sql
├── 0008_create_reports_tables.sql
└── 9999_disable_rls.sql                 # RLS 비활성화
```

### 2.3 스키마 적용

```bash
# PostgreSQL에 접속하여 마이그레이션 실행
for file in migrations-postgres/*.sql; do
  echo "Applying $file..."
  psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB -f "$file"
done
```

### 2.4 데이터 마이그레이션

#### Supabase에서 데이터 추출
```bash
# pg_dump로 데이터만 추출
pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" \
  --data-only \
  --no-owner \
  --no-acl \
  --table=oracle_connections \
  --table=user_roles \
  --table=user_profiles \
  --table=sql_statistics \
  --table=sql_tuning_tasks \
  --table=reports \
  -f supabase_data.sql
```

#### 데이터 가져오기
```bash
# auth.users 데이터 먼저 가져오기
# Supabase Dashboard에서 사용자 목록 CSV 다운로드 후:
psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB <<EOF
COPY auth.users (id, email, email_confirmed_at, created_at)
FROM '/path/to/users.csv' DELIMITER ',' CSV HEADER;
EOF

# 나머지 데이터 가져오기
psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB -f supabase_data.sql

# 검증
psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB <<EOF
SELECT 'auth.users' AS table_name, COUNT(*) FROM auth.users
UNION ALL
SELECT 'user_profiles', COUNT(*) FROM user_profiles
UNION ALL
SELECT 'oracle_connections', COUNT(*) FROM oracle_connections
UNION ALL
SELECT 'sql_statistics', COUNT(*) FROM sql_statistics;
EOF
```

---

## Phase 3: 애플리케이션 코드 변경 (2일)

### 3.1 패키지 의존성 업데이트

#### `package.json` 수정

```json
{
  "dependencies": {
    // 제거
    // "@supabase/ssr": "0.5.2",

    // 추가
    "pg": "^8.11.3",
    "pg-pool": "^3.6.1",
    "@types/pg": "^8.10.9"
  }
}
```

```bash
npm uninstall @supabase/ssr
npm install pg pg-pool @types/pg
```

### 3.2 데이터베이스 클라이언트 재구현

#### 새로운 파일 구조
```
src/lib/database/
├── client.ts          # PostgreSQL 클라이언트 (브라우저용 API 호출)
├── server.ts          # PostgreSQL 연결 풀 (서버용)
├── types.ts           # 타입 정의
└── queries/           # SQL 쿼리 헬퍼
    ├── users.ts
    ├── connections.ts
    └── sql-statistics.ts
```

#### `src/lib/database/server.ts` (새로 생성)

```typescript
import 'server-only';
import { Pool, PoolClient, QueryResult } from 'pg';

// 싱글톤 연결 풀
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'tms_production',
      user: process.env.POSTGRES_USER || 'tms_user',
      password: process.env.POSTGRES_PASSWORD,
      max: 20, // 최대 연결 수
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected pool error:', err);
    });
  }

  return pool;
}

// 트랜잭션 헬퍼
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// 간단한 쿼리 헬퍼
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const pool = getPool();
  return pool.query(text, params);
}

// 연결 풀 종료 (graceful shutdown용)
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
```

### 3.3 인증 시스템 업데이트

#### `src/lib/auth.ts` 수정

```typescript
import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { query } from "@/lib/database/server";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("이메일과 비밀번호를 입력해주세요.");
        }

        // PostgreSQL에서 사용자 조회
        const userResult = await query(
          `SELECT
            au.id,
            au.email,
            au.encrypted_password,
            au.email_confirmed_at,
            up.full_name,
            ur.name as role,
            ur.id as role_id,
            ur.permissions
          FROM auth.users au
          LEFT JOIN user_profiles up ON au.id = up.id
          LEFT JOIN user_roles ur ON up.role_id = ur.id
          WHERE au.email = $1`,
          [credentials.email]
        );

        if (userResult.rows.length === 0) {
          throw new Error("이메일 또는 비밀번호가 올바르지 않습니다.");
        }

        const user = userResult.rows[0];

        // 이메일 확인 여부 체크
        if (!user.email_confirmed_at) {
          throw new Error("이메일 주소를 확인해주세요.");
        }

        // 비밀번호 검증
        const passwordMatch = await bcrypt.compare(
          credentials.password,
          user.encrypted_password
        );

        if (!passwordMatch) {
          throw new Error("이메일 또는 비밀번호가 올바르지 않습니다.");
        }

        // 마지막 로그인 시간 업데이트
        await query(
          `UPDATE user_profiles SET last_login_at = NOW() WHERE id = $1`,
          [user.id]
        );

        return {
          id: user.id,
          email: user.email,
          name: user.full_name || user.email,
          role: user.role || "viewer",
          roleId: user.role_id,
          permissions: user.permissions || {},
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = (user as any).role;
        token.roleId = (user as any).roleId;
        token.permissions = (user as any).permissions;
      }
      return token;
    },

    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.role = token.role as string;
        session.user.roleId = token.roleId as string;
        session.user.permissions = token.permissions as any;
      }
      return session;
    },
  },

  pages: {
    signIn: "/auth/signin",
    signOut: "/auth/signout",
    error: "/auth/error",
  },

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === "development",
};
```

### 3.4 API 라우트 업데이트 패턴

#### 기존 패턴 (Supabase)
```typescript
// src/app/api/databases/route.ts (기존)
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('oracle_connections')
    .select('*')
    .eq('is_active', true);

  return NextResponse.json({ data });
}
```

#### 새로운 패턴 (PostgreSQL)
```typescript
// src/app/api/databases/route.ts (변경 후)
import { query } from '@/lib/database/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  // 인증 확인
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // PostgreSQL 쿼리
  const result = await query(
    `SELECT id, name, host, port, service_name, username,
            oracle_version, is_active, health_status, created_at
     FROM oracle_connections
     WHERE is_active = true
     ORDER BY created_at DESC`
  );

  return NextResponse.json({
    success: true,
    data: result.rows
  });
}
```

### 3.5 환경 변수 업데이트

#### `.env.production` (새로 작성)

```env
# ====================================
# TMS v2.0 Self-hosted Environment
# ====================================

# -------------------------------------
# PostgreSQL Configuration (NEW)
# -------------------------------------
POSTGRES_HOST=192.168.1.100
POSTGRES_PORT=5432
POSTGRES_DB=tms_production
POSTGRES_USER=tms_user
POSTGRES_PASSWORD=your_secure_postgres_password_here

# Connection Pool Settings
POSTGRES_MAX_CONNECTIONS=20
POSTGRES_IDLE_TIMEOUT=30000

# -------------------------------------
# NextAuth Configuration (KEEP)
# -------------------------------------
NEXTAUTH_URL=https://tms.yourcompany.com
NEXTAUTH_SECRET=your_production_nextauth_secret_here

# -------------------------------------
# 제거할 환경 변수
# -------------------------------------
# NEXT_PUBLIC_SUPABASE_URL (제거)
# NEXT_PUBLIC_SUPABASE_ANON_KEY (제거)
# SUPABASE_SERVICE_ROLE_KEY (제거)
```

---

## Phase 4: 테스트 단계 (2일)

### 4.1 테스트 체크리스트

```markdown
## Unit Tests
✅ 데이터베이스 연결 풀 생성
✅ 단순 쿼리 실행
✅ 트랜잭션 처리
✅ 인증 로직 (로그인/로그아웃)
✅ 비밀번호 해싱/검증
✅ 권한 검증 로직

## Integration Tests
✅ 회원가입 API
✅ 로그인 API
✅ 데이터베이스 연결 CRUD API
✅ SQL 통계 조회 API
✅ 튜닝 작업 관리 API
✅ 리포트 생성 API

## E2E Tests
✅ 사용자 회원가입 플로우
✅ 로그인 → 대시보드 접근
✅ 데이터베이스 연결 추가/테스트
✅ SQL 모니터링 화면
✅ 튜닝 작업 생성/관리

## Performance Tests
✅ 동시 쿼리 처리 (100+ concurrent)
✅ 연결 풀 재사용
✅ 대량 데이터 조회 성능
✅ 응답 시간 < 200ms (API 기준)

## Security Tests
✅ SQL Injection 방어
✅ XSS 방어
✅ 인증 우회 시도 차단
✅ 권한 검증
✅ 민감 정보 암호화
```

---

## Phase 5: 배포 전략 (1일)

### 5.1 블루-그린 배포 계획

#### 배포 단계

**Step 1: Green 환경 구축 및 검증 (D-7일)**
```bash
# Green 환경 서버에 PostgreSQL 설치
# 애플리케이션 배포
# 데이터 마이그레이션 (읽기 전용 복제)
# 모든 테스트 통과 확인
```

**Step 2: 사전 공지 (D-3일)**
```
사용자에게 시스템 업그레이드 공지
- 예상 다운타임: 2-3시간 (야간 시간대)
- 백업 및 롤백 계획 공유
```

**Step 3: 트래픽 전환 (D-Day)**
```bash
# 1. Blue 환경 읽기 전용 모드 전환
# 2. 최종 데이터 동기화
# 3. Green 환경 최종 검증
# 4. DNS/Load Balancer에서 트래픽 전환
# 5. Blue 환경 대기 상태 유지 (롤백 대비)
```

### 5.2 롤백 계획 (15분 목표)

```bash
#!/bin/bash
# rollback.sh

echo "===== 롤백 시작 ====="

# 1. DNS/Load Balancer 트래픽 Blue로 복귀
echo "[1/5] Switching traffic back to Blue environment..."

# 2. Blue 환경 읽기/쓰기 모드 복구
echo "[2/5] Enabling write mode on Blue environment..."

# 3. Green 환경 중단
echo "[3/5] Stopping Green environment..."
systemctl stop tms-app

# 4. 모니터링 확인
echo "[4/5] Monitoring Blue environment..."
curl https://tms.yourcompany.com/api/health

echo "===== 롤백 완료 ====="
```

---

## Phase 6: 모니터링 및 검증 (지속)

### 6.1 모니터링 설정

#### PostgreSQL 모니터링

**Prometheus + Grafana 설정**

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'postgres'
    static_configs:
      - targets: ['localhost:9187']
```

#### 핵심 메트릭 모니터링

```sql
-- 연결 수 모니터링
SELECT
  count(*) as total_connections,
  count(*) FILTER (WHERE state = 'active') as active_connections,
  count(*) FILTER (WHERE state = 'idle') as idle_connections
FROM pg_stat_activity
WHERE datname = 'tms_production';

-- 느린 쿼리 모니터링
SELECT
  pid,
  now() - pg_stat_activity.query_start AS duration,
  query,
  state
FROM pg_stat_activity
WHERE state != 'idle'
  AND now() - pg_stat_activity.query_start > interval '5 seconds'
ORDER BY duration DESC;
```

### 6.2 백업 및 복구 자동화

#### 자동 백업 스크립트
```bash
#!/bin/bash
# backup.sh - Cron: 0 0 * * * (매일 자정)

BACKUP_DIR="/var/backups/tms"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/tms_backup_$DATE.sql.gz"

pg_dump -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB \
  --no-owner --no-acl --clean --if-exists \
  | gzip > $BACKUP_FILE

# 30일 이상 오래된 백업 삭제
find $BACKUP_DIR -name "tms_backup_*.sql.gz" -mtime +30 -delete
```

---

## Phase 7: 문서화 및 정리 (1일)

### 7.1 운영 문서 작성

#### 일상 운영 작업

```bash
# 서비스 시작/중지
pm2 start ecosystem.config.js
pm2 stop tms-app
pm2 restart tms-app

# 로그 확인
pm2 logs tms-app
tail -f /var/lib/pgsql/15/data/log/postgresql-*.log

# 데이터베이스 백업
/opt/tms/scripts/backup.sh

# 복구
/opt/tms/scripts/restore.sh /var/backups/tms/tms_backup_20241120.sql.gz
```

---

## 📈 예상 타임라인

| 단계 | 작업 | 소요시간 | 완료 기준 |
|------|------|----------|----------|
| **Phase 1** | 준비 | 2일 | 백업 완료, PostgreSQL 설치 |
| **Phase 2** | DB 마이그레이션 | 1일 | 데이터 무결성 검증 |
| **Phase 3** | 코드 변경 | 2일 | 97개 파일 변환 완료 |
| **Phase 4** | 테스트 | 2일 | 모든 테스트 통과 |
| **Phase 5** | 배포 | 1일 | 프로덕션 전환 완료 |
| **Phase 6** | 모니터링 | ongoing | 모니터링 시스템 구축 |
| **Phase 7** | 문서화 | 1일 | 문서화 완료 |

**총 예상 소요 시간**: 9일

---

## 💰 비용 분석

### 현재 비용 (Supabase)
- **월 총 비용**: $150/월
- **연간 비용**: $1,800/년

### 예상 비용 (Self-hosted)
- **월 총 비용**: $30/월
- **연간 비용**: $360/년

### 절감 효과
- **월 절감**: $120/월 (80% 절감)
- **연간 절감**: $1,440/년
- **ROI 달성 시점**: 3.1개월

---

## ⚠️ 주의사항

### 기술적 제한사항

1. **Supabase Realtime 기능 손실**
   - 실시간 데이터베이스 구독 기능 사용 불가
   - 대안: WebSocket 또는 Server-Sent Events 직접 구현

2. **고가용성 (HA) 구성 미포함**
   - 단일 PostgreSQL 서버 구성
   - 필요시 Streaming Replication 추가 구성

3. **보안 강화 필요**
   - SSL/TLS 인증서 자동 갱신
   - 방화벽 규칙 정기 검토
   - 침입 탐지 시스템 고려

### 팀 역량 요구사항

1. **PostgreSQL 관리 역량** 필요
2. **서버 인프라 관리** 경험
3. **24/7 온콜 체계** 구축

---

## ✅ 최종 체크리스트

```markdown
## Phase 1: 준비 단계
- [ ] Supabase 데이터 백업 완료
- [ ] PostgreSQL 서버 설치 및 설정
- [ ] 개발 환경 구축
- [ ] 리스크 평가 완료

## Phase 2: 데이터베이스 마이그레이션
- [ ] auth 스키마 및 users 테이블 생성
- [ ] 수정된 마이그레이션 스크립트 작성
- [ ] 스키마 적용 완료
- [ ] 데이터 마이그레이션 완료
- [ ] 데이터 무결성 검증

## Phase 3: 애플리케이션 코드 변경
- [ ] 패키지 의존성 업데이트
- [ ] 데이터베이스 클라이언트 재구현
- [ ] 인증 시스템 업데이트
- [ ] API 라우트 변환 (97개 파일)
- [ ] 환경 변수 재구성

## Phase 4: 테스트
- [ ] 모든 테스트 통과

## Phase 5: 배포
- [ ] Green 환경 구축 완료
- [ ] 배포 실행 및 트래픽 전환

## Phase 6: 모니터링
- [ ] 모니터링 시스템 구축
- [ ] 백업 자동화 구현

## Phase 7: 문서화
- [ ] 운영 가이드 작성
- [ ] 마이그레이션 히스토리 기록
```

---

## 📚 참고 자료

- [PostgreSQL 15 Documentation](https://www.postgresql.org/docs/15/)
- [NextAuth.js Documentation](https://next-auth.js.org/)
- [node-postgres Documentation](https://node-postgres.com/)
- [Supabase Self-hosting Guide](https://supabase.com/docs/guides/self-hosting)

---

**문서 버전**: 1.0
**최종 수정일**: 2024-11-21
**작성자**: TMS Development Team
