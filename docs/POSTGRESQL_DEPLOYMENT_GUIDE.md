# TMS PostgreSQL 배포 가이드

## 고객사 초기 구성을 위한 PostgreSQL 17 설치 및 설정

> **Narae TMS v2.0** - SQL Tuning Management System
> 주식회사 나래정보기술

---

## 목차

1. [사전 요구사항](#1-사전-요구사항)
2. [PostgreSQL 17 설치](#2-postgresql-17-설치)
3. [PostgreSQL 기본 설정](#3-postgresql-기본-설정)
4. [TMS 데이터베이스 구성](#4-tms-데이터베이스-구성)
5. [보안 설정](#5-보안-설정)
6. [성능 최적화](#6-성능-최적화)
7. [백업 설정](#7-백업-설정)
8. [TMS 애플리케이션 배포](#8-tms-애플리케이션-배포)
9. [검증 및 테스트](#9-검증-및-테스트)
10. [문제 해결](#10-문제-해결)

---

## 1. 사전 요구사항

### 1.1 시스템 요구사항

| 구분 | 최소 사양 | 권장 사양 |
|-----|---------|---------|
| **OS** | RHEL/Rocky 8+, Ubuntu 20.04+, macOS 13+ | RHEL/Rocky 9, Ubuntu 22.04, macOS 14+ |
| **CPU** | 2 Core | 4 Core 이상 |
| **RAM** | 4 GB | 8 GB 이상 |
| **Disk** | 50 GB | 100 GB 이상 (SSD 권장) |
| **Network** | 1 Gbps | 1 Gbps 이상 |

### 1.2 필수 포트

| 포트 | 용도 | 방화벽 설정 |
|-----|------|-----------|
| 5432 | PostgreSQL | 내부 네트워크만 허용 |
| 3000 | TMS 웹 애플리케이션 | 필요시 외부 허용 |

### 1.3 사전 확인 사항

```bash
# OS 버전 확인
cat /etc/os-release

# 메모리 확인
free -h

# 디스크 확인
df -h

# 방화벽 상태 확인
sudo firewall-cmd --state  # RHEL/Rocky
sudo ufw status            # Ubuntu
```

---

## 2. PostgreSQL 17 설치

### 2.1 RHEL / Rocky Linux / CentOS

```bash
# 1. PostgreSQL 공식 저장소 추가
sudo dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-$(rpm -E %{rhel})-x86_64/pgdg-redhat-repo-latest.noarch.rpm

# 2. 기본 PostgreSQL 모듈 비활성화 (RHEL 8+)
sudo dnf -qy module disable postgresql

# 3. PostgreSQL 17 설치
sudo dnf install -y postgresql17-server postgresql17-contrib

# 4. 데이터베이스 클러스터 초기화
sudo /usr/pgsql-17/bin/postgresql-17-setup initdb

# 5. 서비스 시작 및 자동 시작 설정
sudo systemctl start postgresql-17
sudo systemctl enable postgresql-17

# 6. 설치 확인
sudo -u postgres /usr/pgsql-17/bin/psql -c "SELECT version();"
```

### 2.2 Ubuntu / Debian

```bash
# 1. 필수 패키지 설치
sudo apt update
sudo apt install -y wget gnupg2 lsb-release

# 2. PostgreSQL 공식 저장소 추가
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'

# 3. 저장소 키 추가
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -

# 4. 패키지 목록 업데이트 및 설치
sudo apt update
sudo apt install -y postgresql-17 postgresql-contrib-17

# 5. 서비스 상태 확인
sudo systemctl status postgresql

# 6. 설치 확인
sudo -u postgres psql -c "SELECT version();"
```

### 2.3 macOS (Homebrew)

macOS 환경에서는 Homebrew를 사용하여 PostgreSQL을 설치합니다.

#### 2.3.1 Homebrew 설치 (미설치 시)

```bash
# Homebrew 설치
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Apple Silicon (M1/M2/M3) 환경 변수 설정
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"

# 설치 확인
brew --version
```

#### 2.3.2 PostgreSQL 17 설치

```bash
# 1. PostgreSQL 17 설치
brew install postgresql@17

# 2. 환경 변수 설정 (~/.zshrc 또는 ~/.bash_profile에 추가)
echo 'export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# 3. 서비스 시작 및 자동 시작 설정
brew services start postgresql@17

# 4. 서비스 상태 확인
brew services list | grep postgresql

# 5. 설치 확인
psql --version
```

#### 2.3.3 macOS 특이사항

**기본 사용자**: macOS Homebrew 설치에서는 `postgres` 대신 **현재 macOS 사용자명**이 superuser입니다.

```bash
# 현재 사용자 확인
whoami

# 현재 사용자로 PostgreSQL 접속
psql -d postgres -c "SELECT current_user, version();"

# 결과 예시:
#  current_user |                          version
# --------------+-----------------------------------------------------------
#  nit          | PostgreSQL 17.7 (Homebrew) on aarch64-apple-darwin...
```

**설정 파일 위치**:

| 파일 | 경로 |
|-----|------|
| postgresql.conf | `/opt/homebrew/var/postgresql@17/postgresql.conf` |
| pg_hba.conf | `/opt/homebrew/var/postgresql@17/pg_hba.conf` |
| 데이터 디렉토리 | `/opt/homebrew/var/postgresql@17/` |
| 로그 파일 | `/opt/homebrew/var/log/postgresql@17.log` |

#### 2.3.4 TMS 데이터베이스 생성 (macOS)

```bash
# 1. 현재 사용자로 psql 접속
psql -d postgres

# 2. 데이터베이스 및 사용자 생성
CREATE ROLE tms_app WITH LOGIN PASSWORD 'your_secure_password';
CREATE DATABASE tms ENCODING 'UTF8' LC_COLLATE 'en_US.UTF-8' LC_CTYPE 'en_US.UTF-8' TEMPLATE template0 OWNER tms_app;
GRANT CONNECT ON DATABASE tms TO tms_app;
\q

# 3. tms 데이터베이스에서 권한 설정
psql -d tms

GRANT USAGE ON SCHEMA public TO tms_app;
GRANT CREATE ON SCHEMA public TO tms_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO tms_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO tms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO tms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO tms_app;

-- 확장 설치
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 트리거 함수
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

\q
```

#### 2.3.5 pg_hba.conf 설정 (macOS)

```bash
# pg_hba.conf 편집
vi /opt/homebrew/var/postgresql@17/pg_hba.conf
```

파일 끝에 추가:

```
# TMS Application
host    tms    tms_app    127.0.0.1/32    scram-sha-256
host    tms    tms_app    ::1/128         scram-sha-256
```

```bash
# 설정 리로드
brew services restart postgresql@17
```

#### 2.3.6 연결 테스트 (macOS)

```bash
# tms_app 사용자로 연결 테스트
PGPASSWORD='your_secure_password' psql -U tms_app -h localhost -d tms -c "SELECT current_user, current_database();"

# 예상 결과:
#  current_user | current_database
# --------------+------------------
#  tms_app      | tms
```

#### 2.3.7 macOS 서비스 관리

```bash
# 서비스 시작
brew services start postgresql@17

# 서비스 중지
brew services stop postgresql@17

# 서비스 재시작
brew services restart postgresql@17

# 서비스 상태 확인
brew services list | grep postgresql

# 로그 확인
tail -f /opt/homebrew/var/log/postgresql@17.log
```

#### 2.3.8 macOS 자동 시작 설정

```bash
# 로그인 시 자동 시작 (기본적으로 brew services start 시 활성화됨)
brew services start postgresql@17

# 자동 시작 확인
ls ~/Library/LaunchAgents/ | grep postgresql

# 자동 시작 비활성화
brew services stop postgresql@17
```

### 2.4 설치 확인

```bash
# PostgreSQL 버전 확인
# RHEL/Ubuntu
sudo -u postgres psql -c "SELECT version();"
# macOS
psql -d postgres -c "SELECT version();"

# 서비스 상태 확인
sudo systemctl status postgresql-17  # RHEL
sudo systemctl status postgresql     # Ubuntu
brew services list | grep postgresql  # macOS

# 포트 리스닝 확인
sudo ss -tlnp | grep 5432  # Linux
lsof -i :5432              # macOS
```

---

## 3. PostgreSQL 기본 설정

### 3.1 설정 파일 위치

| OS | postgresql.conf | pg_hba.conf |
|----|-----------------|-------------|
| RHEL/Rocky | `/var/lib/pgsql/17/data/postgresql.conf` | `/var/lib/pgsql/17/data/pg_hba.conf` |
| Ubuntu | `/etc/postgresql/17/main/postgresql.conf` | `/etc/postgresql/17/main/pg_hba.conf` |
| macOS | `/opt/homebrew/var/postgresql@17/postgresql.conf` | `/opt/homebrew/var/postgresql@17/pg_hba.conf` |

### 3.2 postgresql.conf 설정

```bash
# 설정 파일 편집
sudo vi /var/lib/pgsql/17/data/postgresql.conf  # RHEL
sudo vi /etc/postgresql/17/main/postgresql.conf  # Ubuntu
vi /opt/homebrew/var/postgresql@17/postgresql.conf  # macOS
```

**필수 설정 변경:**

```ini
#------------------------------------------------------------------------------
# 연결 설정
#------------------------------------------------------------------------------
listen_addresses = 'localhost'          # 로컬만 허용 (보안)
# listen_addresses = '*'                # 외부 접속 허용 시
port = 5432
max_connections = 100

#------------------------------------------------------------------------------
# 메모리 설정 (서버 RAM 기준 조정)
#------------------------------------------------------------------------------
# 8GB RAM 서버 기준 권장값
shared_buffers = 2GB                    # RAM의 25%
effective_cache_size = 6GB              # RAM의 75%
work_mem = 64MB                         # 복잡한 쿼리용
maintenance_work_mem = 512MB            # VACUUM, CREATE INDEX 용

#------------------------------------------------------------------------------
# WAL 설정
#------------------------------------------------------------------------------
wal_level = replica                     # 복제 대비
max_wal_size = 2GB
min_wal_size = 512MB
checkpoint_completion_target = 0.9

#------------------------------------------------------------------------------
# 로깅 설정
#------------------------------------------------------------------------------
logging_collector = on
log_directory = 'pg_log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_rotation_age = 1d
log_rotation_size = 100MB
log_min_duration_statement = 1000       # 1초 이상 쿼리 로깅
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d '

#------------------------------------------------------------------------------
# 한글 설정
#------------------------------------------------------------------------------
lc_messages = 'en_US.UTF-8'
lc_monetary = 'ko_KR.UTF-8'
lc_numeric = 'ko_KR.UTF-8'
lc_time = 'ko_KR.UTF-8'

#------------------------------------------------------------------------------
# 타임존 설정
#------------------------------------------------------------------------------
timezone = 'Asia/Seoul'
```

### 3.3 pg_hba.conf 설정 (인증)

```bash
# 설정 파일 편집
sudo vi /var/lib/pgsql/17/data/pg_hba.conf  # RHEL
sudo vi /etc/postgresql/17/main/pg_hba.conf  # Ubuntu
vi /opt/homebrew/var/postgresql@17/pg_hba.conf  # macOS
```

**기본 설정 (로컬 접속만 허용):**

```
# TYPE  DATABASE        USER            ADDRESS                 METHOD

# 로컬 소켓 연결
local   all             all                                     peer

# IPv4 로컬 연결
host    all             all             127.0.0.1/32            scram-sha-256

# IPv6 로컬 연결
host    all             all             ::1/128                 scram-sha-256

# TMS 애플리케이션 전용 (같은 서버)
host    tms             tms_app         127.0.0.1/32            scram-sha-256
```

**외부 접속 허용 시 (필요한 경우만):**

```
# 특정 IP에서 TMS 데이터베이스 접속 허용
host    tms             tms_app         192.168.1.0/24          scram-sha-256

# 특정 IP에서 모든 데이터베이스 접속 허용 (관리용)
host    all             postgres        192.168.1.100/32        scram-sha-256
```

### 3.4 설정 적용

```bash
# 서비스 재시작
sudo systemctl restart postgresql-17  # RHEL
sudo systemctl restart postgresql     # Ubuntu
brew services restart postgresql@17   # macOS

# 또는 설정만 리로드 (pg_hba.conf 변경 시)
sudo -u postgres psql -c "SELECT pg_reload_conf();"  # Linux
psql -d postgres -c "SELECT pg_reload_conf();"       # macOS
```

---

## 4. TMS 데이터베이스 구성

### 4.1 데이터베이스 및 사용자 생성

```bash
# postgres 사용자로 전환
sudo -u postgres psql
```

**SQL 실행:**

```sql
-- 1. TMS 애플리케이션 사용자 생성
CREATE ROLE tms_app WITH
    LOGIN
    PASSWORD 'your_secure_password_here'  -- 반드시 강력한 비밀번호로 변경
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE;

-- 2. TMS 데이터베이스 생성
CREATE DATABASE tms
    ENCODING 'UTF8'
    LC_COLLATE 'en_US.UTF-8'
    LC_CTYPE 'en_US.UTF-8'
    TEMPLATE template0
    OWNER tms_app;

-- 3. 데이터베이스 연결 권한 부여
GRANT CONNECT ON DATABASE tms TO tms_app;

-- 4. 확인
\l tms
\du tms_app

-- 종료
\q
```

### 4.2 스키마 권한 설정

```bash
# tms 데이터베이스에 접속
sudo -u postgres psql -d tms
```

**SQL 실행:**

```sql
-- 1. 스키마 권한 부여
GRANT USAGE ON SCHEMA public TO tms_app;
GRANT CREATE ON SCHEMA public TO tms_app;

-- 2. 테이블/시퀀스/함수 권한 부여
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO tms_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO tms_app;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO tms_app;

-- 3. 향후 생성될 객체에 대한 기본 권한
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO tms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO tms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO tms_app;

-- 4. 필수 확장 설치
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 5. updated_at 자동 갱신 트리거 함수
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. 설치 확인
SELECT extname, extversion FROM pg_extension
WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pg_trgm');

-- 종료
\q
```

### 4.3 연결 테스트

```bash
# tms_app 사용자로 연결 테스트
PGPASSWORD='your_secure_password_here' psql -U tms_app -h localhost -d tms -c "SELECT current_user, current_database();"

# 예상 결과:
#  current_user | current_database
# --------------+------------------
#  tms_app      | tms
```

---

## 5. 보안 설정

### 5.1 비밀번호 정책

```sql
-- 강력한 비밀번호 설정 (최소 16자, 특수문자 포함)
-- 예: Tms@2024!SecureDB#Pwd
ALTER ROLE tms_app WITH PASSWORD 'Tms@2024!SecureDB#Pwd';
```

### 5.2 방화벽 설정

**RHEL / Rocky Linux:**

```bash
# PostgreSQL 포트 허용 (내부 네트워크만)
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.1.0/24" port port="5432" protocol="tcp" accept'
sudo firewall-cmd --reload

# 또는 로컬만 허용 (같은 서버에서 실행 시)
# 기본적으로 localhost는 허용됨
```

**Ubuntu:**

```bash
# UFW 규칙 추가
sudo ufw allow from 192.168.1.0/24 to any port 5432

# 상태 확인
sudo ufw status
```

### 5.3 SSL 설정 (권장)

```bash
# 인증서 생성 (자체 서명)
sudo -u postgres openssl req -new -x509 -days 365 -nodes \
    -out /var/lib/pgsql/17/data/server.crt \
    -keyout /var/lib/pgsql/17/data/server.key \
    -subj "/CN=tms-db-server"

# 권한 설정
sudo chmod 600 /var/lib/pgsql/17/data/server.key
sudo chown postgres:postgres /var/lib/pgsql/17/data/server.*
```

**postgresql.conf에 추가:**

```ini
ssl = on
ssl_cert_file = 'server.crt'
ssl_key_file = 'server.key'
```

### 5.4 연결 제한

**postgresql.conf:**

```ini
# 최대 연결 수 제한
max_connections = 100

# 연결 타임아웃
authentication_timeout = 1min
```

---

## 6. 성능 최적화

### 6.1 메모리 설정 가이드

| 서버 RAM | shared_buffers | effective_cache_size | work_mem | maintenance_work_mem |
|---------|----------------|---------------------|----------|---------------------|
| 4 GB | 1 GB | 3 GB | 32 MB | 256 MB |
| 8 GB | 2 GB | 6 GB | 64 MB | 512 MB |
| 16 GB | 4 GB | 12 GB | 128 MB | 1 GB |
| 32 GB | 8 GB | 24 GB | 256 MB | 2 GB |

### 6.2 TMS 권장 인덱스

TMS 스키마에는 이미 필요한 인덱스가 포함되어 있습니다. 추가 성능 최적화가 필요한 경우:

```sql
-- 대용량 SQL 통계 조회 최적화
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sql_stats_performance
ON sql_statistics (oracle_connection_id, collected_at DESC, elapsed_time_ms DESC);

-- 튜닝 작업 검색 최적화
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tuning_tasks_search
ON sql_tuning_tasks (oracle_connection_id, status, priority, created_at DESC);
```

### 6.3 VACUUM 설정

**postgresql.conf:**

```ini
# 자동 VACUUM 설정
autovacuum = on
autovacuum_max_workers = 3
autovacuum_naptime = 1min
autovacuum_vacuum_threshold = 50
autovacuum_analyze_threshold = 50
autovacuum_vacuum_scale_factor = 0.1
autovacuum_analyze_scale_factor = 0.05
```

---

## 7. 백업 설정

### 7.1 일일 백업 스크립트

```bash
# 백업 스크립트 생성
sudo vi /opt/tms/scripts/backup_tms.sh
```

**스크립트 내용:**

```bash
#!/bin/bash
# TMS 데이터베이스 백업 스크립트

# 설정
BACKUP_DIR="/opt/tms/backups"
DB_NAME="tms"
DB_USER="tms_app"
RETENTION_DAYS=7
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/tms_backup_${DATE}.sql.gz"

# 백업 디렉토리 생성
mkdir -p ${BACKUP_DIR}

# 백업 실행
echo "[$(date)] Starting backup..."
PGPASSWORD='your_secure_password_here' pg_dump -U ${DB_USER} -h localhost ${DB_NAME} | gzip > ${BACKUP_FILE}

if [ $? -eq 0 ]; then
    echo "[$(date)] Backup completed: ${BACKUP_FILE}"

    # 오래된 백업 삭제
    find ${BACKUP_DIR} -name "tms_backup_*.sql.gz" -mtime +${RETENTION_DAYS} -delete
    echo "[$(date)] Old backups cleaned up (retention: ${RETENTION_DAYS} days)"
else
    echo "[$(date)] Backup failed!"
    exit 1
fi
```

```bash
# 실행 권한 부여
sudo chmod +x /opt/tms/scripts/backup_tms.sh

# 크론탭 설정 (매일 새벽 2시)
sudo crontab -e
# 추가: 0 2 * * * /opt/tms/scripts/backup_tms.sh >> /var/log/tms_backup.log 2>&1
```

### 7.2 백업 복원

```bash
# 백업 복원
gunzip -c /opt/tms/backups/tms_backup_YYYYMMDD_HHMMSS.sql.gz | \
    PGPASSWORD='your_secure_password_here' psql -U tms_app -h localhost -d tms
```

---

## 8. TMS 애플리케이션 배포

### 8.1 Node.js 설치

```bash
# Node.js 20 LTS 설치 (RHEL/Rocky)
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Ubuntu
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# macOS (Homebrew)
brew install node@20
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# 버전 확인
node --version
npm --version
```

### 8.2 TMS 애플리케이션 설치

```bash
# 애플리케이션 디렉토리 생성
sudo mkdir -p /opt/tms/app
sudo chown $USER:$USER /opt/tms/app

# 소스 코드 배포 (예: git clone 또는 파일 복사)
cd /opt/tms/app
# git clone <repository-url> .
# 또는
# tar -xzf tms-v2.0.tar.gz -C .

# 의존성 설치
npm install --production

# 환경 설정
cp .env.example .env.local
vi .env.local
```

### 8.3 환경 변수 설정 (.env.local)

```env
# Database Configuration
DATABASE_URL=postgresql://tms_app:your_secure_password_here@localhost:5432/tms

# NextAuth Configuration
NEXTAUTH_URL=http://your-server-ip:3000
NEXTAUTH_SECRET=generate_random_secret_key_here

# Encryption Key (AES-256)
ENCRYPTION_KEY=generate_32_byte_hex_key_here

# Application
PORT=3000
NODE_ENV=production
```

**보안 키 생성:**

```bash
# NEXTAUTH_SECRET 생성
openssl rand -base64 32

# ENCRYPTION_KEY 생성 (32바이트 hex)
openssl rand -hex 32
```

### 8.4 데이터베이스 스키마 적용

```bash
cd /opt/tms/app

# Drizzle 스키마 적용
npm run db:push

# 초기 데이터 시딩
npm run db:seed
```

### 8.5 프로덕션 빌드 및 실행

```bash
# 빌드
npm run build

# PM2로 실행 (권장)
npm install -g pm2
pm2 start npm --name "tms" -- start
pm2 save
pm2 startup

# 또는 직접 실행
npm start
```

### 8.6 Systemd 서비스 설정 (대안)

```bash
sudo vi /etc/systemd/system/tms.service
```

```ini
[Unit]
Description=Narae TMS Application
After=network.target postgresql-17.service

[Service]
Type=simple
User=tms
Group=tms
WorkingDirectory=/opt/tms/app
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable tms
sudo systemctl start tms
```

---

## 9. 검증 및 테스트

### 9.1 PostgreSQL 상태 확인

```bash
# 서비스 상태
sudo systemctl status postgresql-17

# 연결 테스트
PGPASSWORD='your_secure_password_here' psql -U tms_app -h localhost -d tms -c "SELECT 1;"

# 테이블 목록 확인
PGPASSWORD='your_secure_password_here' psql -U tms_app -h localhost -d tms -c "\dt"

# 초기 데이터 확인
PGPASSWORD='your_secure_password_here' psql -U tms_app -h localhost -d tms -c "SELECT name, display_name FROM user_roles;"
```

### 9.2 TMS 애플리케이션 확인

```bash
# 서비스 상태
pm2 status  # PM2 사용 시
sudo systemctl status tms  # Systemd 사용 시

# 로그 확인
pm2 logs tms
# 또는
sudo journalctl -u tms -f

# 웹 접속 테스트
curl -I http://localhost:3000
```

### 9.3 체크리스트

- [ ] PostgreSQL 17 설치 완료
- [ ] tms 데이터베이스 생성
- [ ] tms_app 사용자 생성 및 권한 부여
- [ ] 필수 확장 설치 (uuid-ossp, pgcrypto, pg_trgm)
- [ ] pg_hba.conf 인증 설정
- [ ] 방화벽 설정
- [ ] TMS 스키마 적용 (32개 테이블)
- [ ] 초기 데이터 시딩
- [ ] TMS 애플리케이션 실행
- [ ] 웹 접속 확인
- [ ] 백업 스크립트 설정

---

## 10. 문제 해결

### 10.1 연결 오류

**"connection refused" 오류:**

```bash
# PostgreSQL 서비스 확인
sudo systemctl status postgresql-17

# 리스닝 포트 확인
sudo ss -tlnp | grep 5432

# listen_addresses 확인
sudo grep listen_addresses /var/lib/pgsql/17/data/postgresql.conf
```

**"authentication failed" 오류:**

```bash
# pg_hba.conf 확인
sudo cat /var/lib/pgsql/17/data/pg_hba.conf | grep -v "^#" | grep -v "^$"

# 비밀번호 재설정
sudo -u postgres psql -c "ALTER ROLE tms_app WITH PASSWORD 'new_password';"

# 설정 리로드
sudo systemctl reload postgresql-17
```

### 10.2 성능 문제

**슬로우 쿼리 확인:**

```sql
-- 현재 실행 중인 쿼리
SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds'
AND state != 'idle';

-- 슬로우 쿼리 로그 확인
tail -f /var/lib/pgsql/17/data/pg_log/postgresql-*.log | grep duration
```

**테이블 통계 갱신:**

```sql
ANALYZE VERBOSE;
```

### 10.3 디스크 공간 부족

```bash
# 디스크 사용량 확인
df -h

# PostgreSQL 데이터 크기
sudo du -sh /var/lib/pgsql/17/data/

# WAL 파일 정리
sudo -u postgres psql -c "SELECT pg_switch_wal();"

# 오래된 로그 삭제
find /var/lib/pgsql/17/data/pg_log -name "*.log" -mtime +7 -delete
```

### 10.4 로그 확인

```bash
# PostgreSQL 로그
sudo tail -f /var/lib/pgsql/17/data/pg_log/postgresql-*.log  # RHEL
sudo tail -f /var/log/postgresql/postgresql-17-main.log       # Ubuntu
tail -f /opt/homebrew/var/log/postgresql@17.log               # macOS

# 시스템 로그
sudo journalctl -u postgresql-17 -f  # Linux

# TMS 애플리케이션 로그
pm2 logs tms
```

### 10.5 macOS 관련 문제

**"psql: command not found" 오류:**

```bash
# PATH에 PostgreSQL 추가
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"

# 영구 설정 (~/.zshrc에 추가)
echo 'export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

**"role does not exist" 오류:**

macOS Homebrew PostgreSQL은 기본 superuser가 현재 macOS 사용자입니다.

```bash
# 현재 사용자로 접속
psql -d postgres

# postgres 역할이 필요한 경우 생성
CREATE ROLE postgres WITH SUPERUSER LOGIN;
```

**서비스 시작 실패:**

```bash
# 로그 확인
tail -f /opt/homebrew/var/log/postgresql@17.log

# 데이터 디렉토리 권한 확인
ls -la /opt/homebrew/var/postgresql@17/

# 서비스 재시작
brew services restart postgresql@17

# 수동 시작 (디버깅용)
/opt/homebrew/opt/postgresql@17/bin/pg_ctl -D /opt/homebrew/var/postgresql@17 start
```

**포트 충돌:**

```bash
# 5432 포트 사용 중인 프로세스 확인
lsof -i :5432

# 다른 PostgreSQL 버전 중지
brew services stop postgresql
brew services stop postgresql@16
brew services stop postgresql@15
```

**Homebrew 권한 문제:**

```bash
# Homebrew 디렉토리 권한 수정
sudo chown -R $(whoami) /opt/homebrew/var/postgresql@17
```

---

## 부록 A: macOS 빠른 설치 스크립트

macOS 전용 자동화 스크립트:

```bash
# 사용법
./scripts/deploy-postgresql-macos.sh
```

이 스크립트가 수행하는 작업:
1. macOS 버전 확인 (13+ 필요)
2. Homebrew 확인/설치
3. PostgreSQL 17 설치
4. 데이터베이스/사용자 생성
5. 권한 및 확장 설정
6. 인증 구성 (pg_hba.conf)
7. 연결 테스트
8. 백업 스크립트 생성

---

## 부록 B: Linux 빠른 설치 스크립트

전체 설치 과정을 자동화한 스크립트 (RHEL/Rocky/Ubuntu 지원):

```bash
#!/bin/bash
# TMS PostgreSQL 빠른 설치 스크립트 (RHEL/Rocky 9)
# 사용법: sudo ./quick_install.sh

set -e

# 변수 설정
DB_NAME="tms"
DB_USER="tms_app"
DB_PASSWORD="Tms@2024!SecureDB#Pwd"  # 반드시 변경!

echo "=== TMS PostgreSQL 설치 시작 ==="

# 1. PostgreSQL 17 설치
echo "[1/6] PostgreSQL 17 설치..."
dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-$(rpm -E %{rhel})-x86_64/pgdg-redhat-repo-latest.noarch.rpm
dnf -qy module disable postgresql
dnf install -y postgresql17-server postgresql17-contrib

# 2. 초기화 및 시작
echo "[2/6] PostgreSQL 초기화..."
/usr/pgsql-17/bin/postgresql-17-setup initdb
systemctl start postgresql-17
systemctl enable postgresql-17

# 3. 데이터베이스 생성
echo "[3/6] 데이터베이스 생성..."
sudo -u postgres psql <<EOF
CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';
CREATE DATABASE ${DB_NAME} ENCODING 'UTF8' LC_COLLATE 'en_US.UTF-8' LC_CTYPE 'en_US.UTF-8' TEMPLATE template0 OWNER ${DB_USER};
GRANT CONNECT ON DATABASE ${DB_NAME} TO ${DB_USER};
EOF

# 4. 권한 설정
echo "[4/6] 권한 설정..."
sudo -u postgres psql -d ${DB_NAME} <<EOF
GRANT USAGE ON SCHEMA public TO ${DB_USER};
GRANT CREATE ON SCHEMA public TO ${DB_USER};
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${DB_USER};
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${DB_USER};
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
EOF

# 5. pg_hba.conf 설정
echo "[5/6] 인증 설정..."
cat >> /var/lib/pgsql/17/data/pg_hba.conf <<EOF
host    ${DB_NAME}    ${DB_USER}    127.0.0.1/32    scram-sha-256
EOF
systemctl reload postgresql-17

# 6. 연결 테스트
echo "[6/6] 연결 테스트..."
PGPASSWORD="${DB_PASSWORD}" psql -U ${DB_USER} -h localhost -d ${DB_NAME} -c "SELECT 1;" && echo "✓ 연결 성공!"

echo ""
echo "=== TMS PostgreSQL 설치 완료 ==="
echo ""
echo "연결 정보:"
echo "  Host:     localhost"
echo "  Port:     5432"
echo "  Database: ${DB_NAME}"
echo "  User:     ${DB_USER}"
echo "  Password: ${DB_PASSWORD}"
echo ""
echo "Connection String:"
echo "  postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"
echo ""
```

---

## 지원 연락처

- **기술 지원**: support@narae-it.co.kr
- **긴급 연락처**: 02-XXX-XXXX

---

*Last Updated: 2024-12*
*Narae TMS v2.0 - 주식회사 나래정보기술*
