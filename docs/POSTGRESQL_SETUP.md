# PostgreSQL 17 초기 설정 가이드

## TMS (SQL Tuning Management System) 데이터베이스 설정

### 목차
1. [사전 요구사항](#사전-요구사항)
2. [PostgreSQL 17 설치](#postgresql-17-설치)
3. [데이터베이스 초기화](#데이터베이스-초기화)
4. [수동 설정 (선택사항)](#수동-설정)
5. [문제 해결](#문제-해결)

---

## 사전 요구사항

- PostgreSQL 17
- Node.js 18+ & npm
- macOS, Linux, 또는 Windows

---

## PostgreSQL 17 설치

### macOS (Homebrew)
```bash
# PostgreSQL 17 설치
brew install postgresql@17

# 환경 변수 설정 (~/.zshrc 또는 ~/.bashrc에 추가)
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"

# 서비스 시작
brew services start postgresql@17

# 상태 확인
brew services list | grep postgresql
```

### Ubuntu/Debian
```bash
# PostgreSQL 공식 저장소 추가
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -

# 설치
sudo apt update
sudo apt install postgresql-17

# 서비스 시작
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### CentOS/RHEL
```bash
# PostgreSQL 저장소 설치
sudo dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-8-x86_64/pgdg-redhat-repo-latest.noarch.rpm

# 설치
sudo dnf install -y postgresql17-server postgresql17

# 초기화 및 시작
sudo /usr/pgsql-17/bin/postgresql-17-setup initdb
sudo systemctl start postgresql-17
sudo systemctl enable postgresql-17
```

---

## 데이터베이스 초기화

### 방법 1: 자동 스크립트 (권장)

```bash
# 프로젝트 루트에서 실행
./scripts/init-database.sh
```

이 스크립트가 수행하는 작업:
1. PostgreSQL 서비스 상태 확인
2. `tms` 데이터베이스 생성
3. `tms_app` 사용자 생성 및 권한 부여
4. 필요한 PostgreSQL 확장 설치
5. Drizzle ORM 스키마 적용

### 방법 2: npm 스크립트 (Drizzle만)

PostgreSQL이 이미 설정된 경우:

```bash
# 1. 마이그레이션 파일 생성
npm run db:generate

# 2. 스키마를 데이터베이스에 적용
npm run db:push

# 3. 초기 데이터 생성
npm run db:seed

# (선택) Drizzle Studio로 데이터 확인
npm run db:studio
```

---

## 수동 설정

자동 스크립트를 사용할 수 없는 경우 수동으로 설정할 수 있습니다.

### Step 1: PostgreSQL 서비스 시작

```bash
# macOS
brew services start postgresql@17

# Linux
sudo systemctl start postgresql
```

### Step 2: 데이터베이스 생성

```bash
# postgres 사용자로 psql 접속
psql -U postgres

# 데이터베이스 생성
CREATE DATABASE tms ENCODING 'UTF8' LC_COLLATE 'en_US.UTF-8' LC_CTYPE 'en_US.UTF-8' TEMPLATE template0;

# 사용자 생성
CREATE ROLE tms_app WITH LOGIN PASSWORD 'song7409';

# 연결 권한 부여
GRANT CONNECT ON DATABASE tms TO tms_app;

# 종료
\q
```

### Step 3: 스키마 권한 설정

```bash
# tms 데이터베이스에 접속
psql -U postgres -d tms

# 권한 부여
GRANT USAGE ON SCHEMA public TO tms_app;
GRANT CREATE ON SCHEMA public TO tms_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO tms_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO tms_app;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO tms_app;

# 기본 권한 설정
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO tms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO tms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO tms_app;

# 확장 설치
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

# 종료
\q
```

### Step 4: 연결 테스트

```bash
# tms_app 사용자로 연결 테스트
PGPASSWORD=song7409 psql -U tms_app -h localhost -d tms -c "SELECT 1"
```

### Step 5: Drizzle 스키마 적용

```bash
npm run db:push
npm run db:seed
```

---

## 생성되는 테이블 목록

| 카테고리 | 테이블명 | 설명 |
|---------|---------|------|
| **사용자** | users | 사용자 계정 |
| | user_roles | 역할 정의 |
| | user_profiles | 사용자 프로필 |
| | user_settings | 사용자 설정 |
| **연결** | oracle_connections | Oracle DB 연결 정보 |
| | system_settings | 시스템 설정 |
| | scheduler_jobs | 스케줄러 작업 |
| | audit_logs | 감사 로그 |
| **모니터링** | sql_statistics | SQL 통계 |
| | sql_execution_history | SQL 실행 이력 |
| | wait_events | 대기 이벤트 |
| | session_monitoring | 세션 모니터링 |
| | execution_plans | 실행 계획 |
| | sql_bind_variables | 바인드 변수 |
| **튜닝** | sql_tuning_tasks | 튜닝 작업 |
| | tuning_history | 튜닝 이력 |
| | tuning_comments | 튜닝 코멘트 |
| | tuning_recommendations | 튜닝 권고사항 |
| | plan_baselines | 플랜 베이스라인 |
| | tuning_reports | 튜닝 리포트 |
| **AWR** | awr_reports | AWR 리포트 |
| | statspack_snapshots | Statspack 스냅샷 |
| | statspack_reports | Statspack 리포트 |
| | stats_collection_history | 통계 수집 이력 |
| **리포트** | report_templates | 리포트 템플릿 |
| | reports | 리포트 |
| | report_schedules | 리포트 스케줄 |
| | report_activities | 리포트 활동 |
| **성능** | sql_performance_history | SQL 성능 이력 |
| | sql_performance_daily_summary | 일별 성능 요약 |
| | performance_collection_settings | 수집 설정 |
| | performance_collection_logs | 수집 로그 |

---

## 환경 변수 설정

`.env.local` 파일에서 데이터베이스 연결 정보를 확인/수정:

```env
# Database Configuration (Local PostgreSQL 17)
DATABASE_URL=postgresql://tms_app:song7409@localhost:5432/tms
```

---

## 문제 해결

### 1. PostgreSQL 서비스가 시작되지 않음

```bash
# macOS
brew services restart postgresql@17
tail -f /opt/homebrew/var/log/postgresql@17.log

# Linux
sudo systemctl restart postgresql
sudo journalctl -u postgresql -f
```

### 2. 연결 거부 (Connection refused)

PostgreSQL이 실행 중인지 확인:
```bash
pg_isready -h localhost -p 5432
```

### 3. 인증 실패 (Authentication failed)

pg_hba.conf 파일에서 인증 방법 확인:
```bash
# macOS
cat /opt/homebrew/var/postgresql@17/pg_hba.conf

# Linux
cat /etc/postgresql/17/main/pg_hba.conf
```

로컬 연결에 대해 다음 라인 추가:
```
host    tms    tms_app    127.0.0.1/32    md5
host    tms    tms_app    ::1/128         md5
```

### 4. 권한 오류

postgres 사용자로 권한 재설정:
```bash
psql -U postgres -d tms -f scripts/setup-postgresql-tms.sql
```

### 5. Drizzle 마이그레이션 오류

```bash
# 스키마 강제 동기화 (개발 환경에서만 사용)
npm run db:push

# 또는 마이그레이션 재생성
rm -rf src/db/migrations/*
npm run db:generate
npm run db:migrate
```

---

## 유용한 명령어

```bash
# PostgreSQL 버전 확인
psql -U postgres -c "SELECT version();"

# 데이터베이스 목록
psql -U postgres -c "\l"

# 테이블 목록 (tms DB)
PGPASSWORD=song7409 psql -U tms_app -d tms -c "\dt"

# 특정 테이블 구조 확인
PGPASSWORD=song7409 psql -U tms_app -d tms -c "\d users"

# Drizzle Studio 실행 (GUI)
npm run db:studio
```

---

## 다음 단계

1. `npm run dev` - 개발 서버 시작
2. `http://localhost:3000` 접속
3. 회원가입 및 로그인
4. Oracle 연결 설정
