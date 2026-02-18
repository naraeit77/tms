# Narae TMS v2.0 - macOS 완전 배포 가이드

**작성일**: 2026-02-16
**대상**: macOS (Apple Silicon 및 Intel)
**목적**: PostgreSQL, Nginx, PM2, Local LLM을 포함한 완전한 프로덕션 환경 구축

---

## 📋 목차

1. [개요](#1-개요)
2. [사전 준비사항](#2-사전-준비사항)
3. [PostgreSQL 17 설치 및 초기 구성](#3-postgresql-17-설치-및-초기-구성)
4. [Node.js 및 개발 도구 설치](#4-nodejs-및-개발-도구-설치)
5. [Oracle Instant Client 설치](#5-oracle-instant-client-설치)
6. [TMS 프로젝트 설정](#6-tms-프로젝트-설정)
7. [Nginx 설치 및 HTTPS 설정](#7-nginx-설치-및-https-설정)
8. [Certbot SSL 인증서 발급](#8-certbot-ssl-인증서-발급)
9. [PM2 프로세스 관리자 설정](#9-pm2-프로세스-관리자-설정)
10. [Local LLM (Ollama) 구성](#10-local-llm-ollama-구성)
11. [시스템 자동 시작 설정](#11-시스템-자동-시작-설정)
12. [배포 확인 및 테스트](#12-배포-확인-및-테스트)
13. [문제 해결 가이드](#13-문제-해결-가이드)
14. [유지보수 및 업데이트](#14-유지보수-및-업데이트)

---

## 1. 개요

### 1.1 배포 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                     인터넷 (HTTPS)                           │
└────────────────────────┬────────────────────────────────────┘
                         │ Port 443 (SSL)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Nginx (Reverse Proxy)                     │
│  - SSL/TLS 종료                                              │
│  - 정적 파일 캐싱                                            │
│  - 보안 헤더 설정                                            │
└────────────────────────┬────────────────────────────────────┘
                         │ localhost:3000
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  PM2 (Process Manager)                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           Next.js 16 (TMS v2.0)                     │    │
│  │  - React 19 Server Components                       │    │
│  │  - API Routes                                       │    │
│  │  - Cluster Mode (max instances)                     │    │
│  └─────────────────────────────────────────────────────┘    │
└───────────┬──────────────────────────────┬──────────────────┘
            │                              │
            ▼                              ▼
┌────────────────────────┐   ┌──────────────────────────────┐
│   PostgreSQL 17        │   │   Oracle Instant Client      │
│  - TMS 메타데이터      │   │  - Oracle DB 연결            │
│  - 사용자 정보         │   │  - SQL 모니터링              │
│  - SQL 통계            │   └──────────────────────────────┘
└────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────────┐
│              Ollama + Kanana 1.5 8B (선택)                  │
│  - AI 튜닝 가이드                                           │
│  - SQL 분석 및 권장사항                                     │
└────────────────────────────────────────────────────────────┘
```

### 1.2 시스템 요구사항

#### 하드웨어
- **CPU**: Apple Silicon (M1/M2/M3) 또는 Intel (4코어 이상 권장)
- **RAM**: 16GB 이상 (LLM 사용 시 16GB 필수)
- **Storage**: 50GB 이상 여유 공간
  - PostgreSQL: ~5GB
  - Node.js + 프로젝트: ~10GB
  - Oracle Instant Client: ~1GB
  - LLM (선택): ~10GB

#### 소프트웨어
- **OS**: macOS 12.0 (Monterey) 이상
- **권한**: sudo 접근 권한
- **네트워크**: 인터넷 연결 (패키지 다운로드용)

---

## 2. 사전 준비사항

### 2.1 Homebrew 설치

macOS의 패키지 관리자인 Homebrew를 설치합니다.

```bash
# Homebrew 설치 (이미 설치된 경우 건너뛰기)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Apple Silicon의 경우 PATH 설정 (.zshrc에 추가)
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zshrc
source ~/.zshrc

# Intel Mac의 경우 PATH는 자동 설정됨

# 설치 확인
brew --version
# Homebrew 4.x.x
```

### 2.2 기본 개발 도구 설치

```bash
# Xcode Command Line Tools 설치
xcode-select --install

# 설치 확인
xcode-select -p
# /Library/Developer/CommandLineTools
```

### 2.3 도메인 및 네트워크 준비

배포 전 다음 사항을 준비해야 합니다:

#### 도메인 DNS 설정
```
A 레코드: sqltms.info → [Mac의 공인 IP]
A 레코드: www.sqltms.info → [Mac의 공인 IP]
```

#### 공유기 포트 포워딩
```
외부 포트 80  → 내부 IP [Mac의 로컬 IP]:80
외부 포트 443 → 내부 IP [Mac의 로컬 IP]:443
```

#### Mac 로컬 IP 확인
```bash
# 네트워크 인터페이스 확인
ifconfig | grep "inet " | grep -v 127.0.0.1
# 예시: inet 192.168.0.10 netmask 0xffffff00 broadcast 192.168.0.255
```

**중요**: 공유기에서 Mac의 로컬 IP를 고정 IP로 설정하는 것을 권장합니다.

---

## 3. PostgreSQL 17 설치 및 초기 구성

### 3.1 PostgreSQL 17 설치

```bash
# PostgreSQL 17 설치
brew install postgresql@17

# 환경 변수 설정 (.zshrc에 추가)
echo 'export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# 버전 확인
psql --version
# psql (PostgreSQL) 17.2
```

### 3.2 PostgreSQL 서비스 시작

```bash
# PostgreSQL 서비스 시작
brew services start postgresql@17

# 상태 확인
brew services list | grep postgresql
# postgresql@17 started [사용자명] ~/Library/LaunchAgents/homebrew.mxcl.postgresql@17.plist

# 프로세스 확인
ps aux | grep postgres | grep -v grep
```

**설명**: Homebrew는 자동으로 LaunchAgent를 생성하여 시스템 부팅 시 PostgreSQL이 자동으로 시작되도록 설정합니다.

### 3.3 PostgreSQL 초기 설정

#### 기본 사용자로 접속
```bash
# 현재 macOS 사용자 이름으로 자동 접속
psql postgres

# psql 프롬프트에서 확인
postgres=# SELECT version();
# PostgreSQL 17.2 on ...
```

### 3.4 TMS 데이터베이스 생성

```sql
-- TMS 데이터베이스 생성
CREATE DATABASE tms
    ENCODING 'UTF8'
    LC_COLLATE 'en_US.UTF-8'
    LC_CTYPE 'en_US.UTF-8'
    TEMPLATE template0;

-- 확인
\l
```

### 3.5 TMS 애플리케이션 사용자 생성

```sql
-- tms_app 사용자 생성
CREATE USER tms_app WITH PASSWORD 'song7409';

-- 데이터베이스 소유권 변경
ALTER DATABASE tms OWNER TO tms_app;

-- 연결 권한 부여
GRANT ALL PRIVILEGES ON DATABASE tms TO tms_app;

-- 사용자 확인
\du
```

**보안 권고**: 프로덕션 환경에서는 강력한 비밀번호로 변경하세요.
```sql
ALTER USER tms_app WITH PASSWORD 'your_strong_password_here';
```

### 3.6 데이터베이스 접속 및 권한 설정

```sql
-- TMS 데이터베이스로 전환
\c tms

-- public 스키마 권한 부여
GRANT USAGE ON SCHEMA public TO tms_app;
GRANT CREATE ON SCHEMA public TO tms_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO tms_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO tms_app;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO tms_app;

-- 향후 생성될 객체에 대한 기본 권한 설정
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO tms_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON SEQUENCES TO tms_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON FUNCTIONS TO tms_app;
```

### 3.7 PostgreSQL 확장 기능 설치

```sql
-- UUID 생성 함수
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 암호화 함수
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 텍스트 검색 (trigram)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 설치된 확장 확인
\dx
```

### 3.8 연결 테스트

```bash
# psql 종료
\q

# tms_app 사용자로 재접속 테스트
PGPASSWORD=song7409 psql -U tms_app -h localhost -d tms

# 간단한 쿼리 테스트
tms=> SELECT current_user, current_database();
# current_user │ current_database
# ──────────────┼──────────────────
# tms_app      │ tms

# 종료
\q
```

### 3.9 PostgreSQL 원격 접속 설정 (선택사항)

로컬 네트워크에서 PostgreSQL에 접속하려면 다음 설정을 추가합니다.

```bash
# postgresql.conf 편집
nano /opt/homebrew/var/postgresql@17/postgresql.conf

# listen_addresses 수정 (주석 제거 및 변경)
# listen_addresses = 'localhost' → listen_addresses = '*'
```

```bash
# pg_hba.conf 편집
nano /opt/homebrew/var/postgresql@17/pg_hba.conf

# 파일 끝에 추가 (로컬 네트워크 192.168.0.0/24 허용)
host    all             all             192.168.0.0/24          scram-sha-256
```

```bash
# PostgreSQL 재시작
brew services restart postgresql@17

# 방화벽에서 5432 포트 허용 (macOS 방화벽 사용 시)
# 시스템 설정 > 네트워크 > 방화벽 > 옵션 > PostgreSQL 허용
```

**보안 경고**: 인터넷에 직접 노출하지 마세요. 로컬 네트워크만 허용하세요.

---

## 4. Node.js 및 개발 도구 설치

### 4.1 Node.js 20 LTS 설치

```bash
# Node.js 20 설치
brew install node@20

# 환경 변수 설정
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# 버전 확인
node --version
# v20.18.0

npm --version
# 10.8.2
```

### 4.2 전역 패키지 설치

```bash
# PM2 (프로세스 관리자)
npm install -g pm2

# Drizzle Kit (DB 마이그레이션 도구)
npm install -g drizzle-kit

# 설치 확인
pm2 --version
# 5.4.2

drizzle-kit --version
# 0.31.8
```

### 4.3 Node.js 성능 최적화 (선택사항)

```bash
# Node.js 메모리 제한 설정 (.zshrc에 추가)
cat >> ~/.zshrc <<'EOF'

# Node.js 최적화
export NODE_OPTIONS="--max-old-space-size=4096"
EOF

source ~/.zshrc
```

---

## 5. Oracle Instant Client 설치

### 5.1 Oracle Instant Client 다운로드

Oracle 공식 사이트에서 다운로드:
- **Apple Silicon**: https://www.oracle.com/database/technologies/instant-client/macos-arm64-downloads.html
- **Intel Mac**: https://www.oracle.com/database/technologies/instant-client/macos-intel-x86-downloads.html

**필수 패키지**:
- `instantclient-basic-macos.{arch}-21.x.x.zip`
- `instantclient-sqlplus-macos.{arch}-21.x.x.zip` (선택)

예시 (Apple Silicon):
```
instantclient-basic-macos.arm64-21.13.0.0.0dbru.zip
```

### 5.2 설치 디렉토리 생성

```bash
# Oracle 설치 디렉토리 생성
sudo mkdir -p /opt/oracle

# 소유권 변경
sudo chown -R $(whoami):staff /opt/oracle
```

### 5.3 Instant Client 압축 해제 및 설치

```bash
# 다운로드 디렉토리로 이동
cd ~/Downloads

# ZIP 파일 압축 해제
unzip instantclient-basic-macos.arm64-21.13.0.0.0dbru.zip

# /opt/oracle로 이동
mv instantclient_21_13 /opt/oracle/instantclient

# SQL*Plus도 사용하는 경우
# unzip instantclient-sqlplus-macos.arm64-21.13.0.0.0dbru.zip
# mv instantclient_21_13/* /opt/oracle/instantclient/
```

### 5.4 심볼릭 링크 생성

```bash
cd /opt/oracle/instantclient

# 라이브러리 심볼릭 링크 생성
ln -s libclntsh.dylib.21.1 libclntsh.dylib
ln -s libclntsh.dylib.21.1 libclntsh.dylib.12.1
ln -s libclntsh.dylib.21.1 libclntsh.dylib.11.1

# 확인
ls -la *.dylib
```

### 5.5 환경 변수 설정

```bash
# .zshrc에 Oracle 환경 변수 추가
cat >> ~/.zshrc <<'EOF'

# Oracle Instant Client
export ORACLE_HOME=/opt/oracle/instantclient
export DYLD_LIBRARY_PATH=$ORACLE_HOME:$DYLD_LIBRARY_PATH
export PATH=$ORACLE_HOME:$PATH
EOF

# 환경 변수 적용
source ~/.zshrc

# 확인
echo $ORACLE_HOME
# /opt/oracle/instantclient

ls -la $ORACLE_HOME/libclntsh.dylib
```

### 5.6 설치 확인

```bash
# SQL*Plus 버전 확인 (설치한 경우)
sqlplus -v
# SQL*Plus: Release 21.0.0.0.0

# 라이브러리 로드 테스트
otool -L /opt/oracle/instantclient/libclntsh.dylib | head -5
```

---

## 6. TMS 프로젝트 설정

### 6.1 프로젝트 디렉토리 준비

```bash
# 프로젝트가 이미 /Users/nit/tms에 있다고 가정
cd /Users/nit/tms

# Git 저장소에서 클론하는 경우 (예시)
# git clone https://github.com/naraeit77/tms.git /Users/nit/tms
# cd /Users/nit/tms
```

### 6.2 의존성 설치

```bash
# npm 패키지 설치 (5-10분 소요)
npm install

# 설치 확인
ls node_modules | wc -l
# 수백 개의 패키지가 설치되어야 함

# 주요 패키지 확인
npm list --depth=0 | grep -E "next|react|drizzle|oracledb"
```

### 6.3 환경 변수 설정

#### 환경 변수 파일 생성
```bash
# .env.local 파일 생성
nano .env.local
```

#### .env.local 전체 내용

```bash
# ============================================
# NextAuth Configuration
# ============================================
NEXTAUTH_URL=https://sqltms.info
NEXTAUTH_SECRET=qAqoju8LEUr1vDifA6NNSUUkBu6pzXJzozU2dr2awtI=

# NextAuth OAuth Providers (선택)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# ============================================
# Database Configuration (PostgreSQL 17)
# ============================================
DATABASE_URL=postgresql://tms_app:song7409@localhost:5432/tms

# ============================================
# Oracle Database (테스트 연결 - 선택)
# ============================================
ORACLE_TEST_HOST=mcseoper.iptime.org
ORACLE_TEST_PORT=2521
ORACLE_TEST_SERVICE_NAME=NITDB
ORACLE_TEST_USER=system
ORACLE_TEST_PASSWORD=oracle

# ============================================
# Application Configuration
# ============================================
PORT=3000
LOG_LEVEL=info

# ============================================
# Security & Encryption
# ============================================
# AES-256 encryption key for Oracle passwords (64자 hex)
ENCRYPTION_KEY=27a3341b73e4dcd0aa3638995ee315180a01ee836f29d5dca99447c1f6bf3278

# Server Actions encryption key (CVE-2025-66478 방어)
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=3JxXYmVU9OaM+u2gEHvHfv6P1CBfiAOHCj6bbLR0YL8=

# ============================================
# Monitoring & Alerts (선택)
# ============================================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@tms.com

SLACK_WEBHOOK_URL=

# ============================================
# Performance & Caching (선택)
# ============================================
REDIS_URL=redis://localhost:6379

SQL_COLLECTION_INTERVAL=300
METRICS_COLLECTION_INTERVAL=60

SQL_STATS_RETENTION_DAYS=90
AUDIT_LOG_RETENTION_DAYS=365

# ============================================
# Feature Flags
# ============================================
FEATURE_AI_TUNING_ADVISOR=false
FEATURE_AUTO_TUNING=false
FEATURE_EMAIL_ALERTS=false
FEATURE_SLACK_ALERTS=false

# ============================================
# Development Tools
# ============================================
DEBUG=false
SQL_DEBUG=false
USE_MOCK_ORACLE=false

# ============================================
# Oracle Thick Mode Configuration
# ============================================
ORACLE_THICK_MODE=true
ORACLE_CLIENT_LIB_DIR=/opt/oracle/instantclient

# ============================================
# LLM Configuration (Ollama + Qwen3 8B)
# ============================================
# 10번 섹션 설치 후 활성화
LLM_BASE_URL=http://localhost:11434
LLM_MODEL_NAME=qwen3:8b
LLM_API_TYPE=ollama
LLM_MAX_TOKENS=4096
LLM_TEMPERATURE=0.3
LLM_TIMEOUT=180000
FEATURE_AI_TUNING_GUIDE=false  # LLM 설치 후 true로 변경
```

#### 비밀 키 생성 방법

```bash
# NEXTAUTH_SECRET 생성 (Base64, 32바이트)
openssl rand -base64 32
# 출력: qAqoju8LEUr1vDifA6NNSUUkBu6pzXJzozU2dr2awtI=

# ENCRYPTION_KEY 생성 (Hex, 32바이트)
openssl rand -hex 32
# 출력: 27a3341b73e4dcd0aa3638995ee315180a01ee836f29d5dca99447c1f6bf3278

# NEXT_SERVER_ACTIONS_ENCRYPTION_KEY 생성 (Base64, 32바이트)
openssl rand -base64 32
# 출력: 3JxXYmVU9OaM+u2gEHvHfv6P1CBfiAOHCj6bbLR0YL8=
```

**중요**: 프로덕션 환경에서는 반드시 새로운 키를 생성하여 사용하세요.

### 6.4 데이터베이스 스키마 적용

```bash
# Drizzle ORM으로 스키마 푸시
npm run db:push

# 예상 출력:
# Pushing schema changes to database...
# ✓ Schema pushed successfully
# ✓ 25 tables created
```

**설명**: 이 명령은 `src/db/schema/` 디렉토리의 스키마 정의를 PostgreSQL에 적용합니다.

### 6.5 초기 데이터 시딩 (선택사항)

```bash
# 테스트 데이터 생성
npm run db:seed

# 데이터 확인
PGPASSWORD=song7409 psql -U tms_app -d tms -c "SELECT count(*) FROM users;"
```

### 6.6 프로젝트 빌드

```bash
# Next.js 프로덕션 빌드 (5-10분 소요)
npm run build

# 빌드 성공 확인
ls -la .next/
# drwxr-xr-x  - nit  .next/standalone
# drwxr-xr-x  - nit  .next/static
# drwxr-xr-x  - nit  .next/server
```

**빌드 실패 시**: [13번 문제 해결 가이드](#13-문제-해결-가이드)를 참고하세요.

### 6.7 로컬 테스트

```bash
# 프로덕션 모드로 실행
npm start

# 브라우저에서 접속
open http://localhost:3000

# 확인 후 Ctrl+C로 종료
```

**테스트 확인 사항**:
- ✅ 홈페이지 로드
- ✅ 로그인 페이지 접근
- ✅ PostgreSQL 연결 (회원가입 테스트)

---

## 7. Nginx 설치 및 HTTPS 설정

### 7.1 Nginx 설치

```bash
# Nginx 설치
brew install nginx

# 버전 확인
nginx -v
# nginx version: nginx/1.25.4

# 설정 디렉토리 확인
ls /opt/homebrew/etc/nginx/
# fastcgi.conf  mime.types  nginx.conf  scgi_params  uwsgi_params
```

### 7.2 Nginx 디렉토리 구조 준비

```bash
# servers 디렉토리 생성 (가상 호스트 설정용)
mkdir -p /opt/homebrew/etc/nginx/servers

# 로그 디렉토리 확인
ls /opt/homebrew/var/log/nginx/
# access.log  error.log
```

### 7.3 Nginx 메인 설정 확인

```bash
# nginx.conf 확인
cat /opt/homebrew/etc/nginx/nginx.conf | grep -A 5 "http {"

# http {} 블록 끝에 include 추가 필요 시
nano /opt/homebrew/etc/nginx/nginx.conf
```

**nginx.conf의 http {} 블록 끝에 다음 추가**:
```nginx
http {
    # ... 기존 설정 ...

    # 가상 호스트 설정 포함
    include servers/*;
}
```

### 7.4 TMS 가상 호스트 설정 파일 생성

```bash
# sqltms.conf 파일 생성
nano /opt/homebrew/etc/nginx/servers/sqltms.conf
```

**sqltms.conf 전체 내용**:

```nginx
# ============================================
# Narae TMS v2.0 - Nginx Reverse Proxy Config
# https://sqltms.info
# ============================================

# HTTP → HTTPS 리다이렉트
server {
    listen 80;
    listen [::]:80;
    server_name sqltms.info www.sqltms.info;

    # Let's Encrypt ACME Challenge (인증서 발급용)
    location /.well-known/acme-challenge/ {
        root /opt/homebrew/var/www;
    }

    # 나머지 모든 요청은 HTTPS로 리다이렉트
    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS 메인 서버
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name sqltms.info www.sqltms.info;

    # ─── SSL 인증서 (8번에서 발급) ───
    ssl_certificate     /etc/letsencrypt/live/sqltms.info/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sqltms.info/privkey.pem;

    # ─── SSL 보안 설정 ───
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # ─── 보안 헤더 ───
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # ─── CVE-2025-66478 스캐닝 차단 ───
    # Next-Action 헤더가 "x"인 비정상 POST 요청 차단
    set $block_server_action "";
    if ($request_method = POST) {
        set $block_server_action "P";
    }
    if ($http_next_action = "x") {
        set $block_server_action "${block_server_action}X";
    }
    if ($block_server_action = "PX") {
        return 403 "Forbidden: Invalid Server Action";
    }

    # ─── 로그 파일 ───
    access_log /opt/homebrew/var/log/nginx/sqltms-access.log;
    error_log  /opt/homebrew/var/log/nginx/sqltms-error.log warn;

    # ─── 클라이언트 요청 크기 제한 ───
    client_max_body_size 10M;
    client_body_timeout 60s;

    # ─── 메인 프록시 → Next.js (localhost:3000) ───
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # WebSocket 지원 (HMR, 실시간 모니터링)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # 원본 클라이언트 정보 전달
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;

        # 타임아웃 설정 (Oracle 쿼리가 느릴 수 있으므로 넉넉하게)
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;

        # 버퍼 설정
        proxy_buffering on;
        proxy_buffer_size 16k;
        proxy_buffers 8 16k;
        proxy_busy_buffers_size 32k;
    }

    # ─── Next.js 정적 파일 캐싱 ───
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # 1년 캐싱 (immutable)
        expires 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";

        # 보안 헤더는 유지
        add_header X-Content-Type-Options "nosniff" always;
    }

    # ─── 이미지 및 폰트 캐싱 ───
    location ~* \.(ico|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|eot)$ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # 30일 캐싱
        expires 30d;
        add_header Cache-Control "public, max-age=2592000";
        add_header X-Content-Type-Options "nosniff" always;
    }

    # ─── API 요청 (캐싱 비활성화) ───
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # API는 캐싱하지 않음
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";

        # 헤더 전달
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 타임아웃
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;
    }

    # ─── 헬스체크 엔드포인트 ───
    location /api/health {
        proxy_pass http://127.0.0.1:3000;
        access_log off;
    }
}
```

### 7.5 Nginx 설정 테스트

```bash
# 문법 검증
sudo nginx -t

# 예상 출력:
# nginx: the configuration file /opt/homebrew/etc/nginx/nginx.conf syntax is ok
# nginx: configuration file /opt/homebrew/etc/nginx/nginx.conf test is successful
```

**오류 발생 시**: 설정 파일의 문법 오류를 수정하고 다시 테스트합니다.

---

## 8. Certbot SSL 인증서 발급

### 8.1 Certbot 설치

```bash
# Certbot 설치
brew install certbot

# 버전 확인
certbot --version
# certbot 2.x.x
```

### 8.2 ACME Challenge용 디렉토리 생성

```bash
# Let's Encrypt ACME Challenge용 디렉토리
sudo mkdir -p /opt/homebrew/var/www/.well-known/acme-challenge
sudo chown -R $(whoami):staff /opt/homebrew/var/www
```

### 8.3 SSL 인증서 발급

#### 방법 1: Standalone 모드 (권장)

**주의**: 이 방법은 포트 80이 비어있어야 합니다. Nginx가 실행 중이면 먼저 중지하세요.

```bash
# Nginx 중지 (실행 중인 경우)
sudo pkill nginx

# SSL 인증서 발급
sudo certbot certonly --standalone \
  -d sqltms.info \
  -d www.sqltms.info \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email

# 프롬프트 응답:
# Email address: [이메일 입력]
# Agree to Terms of Service: Y
# Share email with EFF: N (선택)
```

#### 방법 2: DNS 챌린지 (포트 80 사용 불가 시)

```bash
# DNS 챌린지 방식
sudo certbot certonly --manual \
  --preferred-challenges dns \
  -d sqltms.info \
  -d www.sqltms.info \
  --email your-email@example.com \
  --agree-tos

# TXT 레코드 추가 안내가 나옵니다:
# _acme-challenge.sqltms.info TXT [인증 값]
# DNS 관리 화면에서 TXT 레코드 추가 후 Enter
```

### 8.4 인증서 발급 확인

```bash
# 인증서 파일 확인
sudo ls -la /etc/letsencrypt/live/sqltms.info/

# 출력 예시:
# lrwxr-xr-x  1 root  wheel  fullchain.pem -> ../../archive/sqltms.info/fullchain1.pem
# lrwxr-xr-x  1 root  wheel  privkey.pem -> ../../archive/sqltms.info/privkey1.pem
# lrwxr-xr-x  1 root  wheel  cert.pem -> ../../archive/sqltms.info/cert1.pem
# lrwxr-xr-x  1 root  wheel  chain.pem -> ../../archive/sqltms.info/chain1.pem

# 인증서 유효기간 확인
sudo openssl x509 -in /etc/letsencrypt/live/sqltms.info/fullchain.pem -noout -dates
# notBefore=Feb 16 00:00:00 2026 GMT
# notAfter=May 17 00:00:00 2026 GMT
```

### 8.5 Nginx 시작

```bash
# Nginx 시작
sudo nginx

# 프로세스 확인
ps aux | grep nginx | grep -v grep
# root     12345  nginx: master process
# nobody   12346  nginx: worker process
```

### 8.6 SSL 자동 갱신 설정

Let's Encrypt 인증서는 90일마다 갱신이 필요합니다.

```bash
# 갱신 테스트 (실제 갱신하지 않음)
sudo certbot renew --dry-run

# crontab 편집
crontab -e

# 다음 라인 추가 (매일 새벽 3시 갱신 체크)
0 3 * * * sudo /opt/homebrew/bin/certbot renew --quiet --post-hook "sudo pkill -HUP nginx"

# crontab 확인
crontab -l
```

**설명**: `--post-hook` 옵션은 인증서 갱신 시 Nginx를 재로드합니다.

---

## 9. PM2 프로세스 관리자 설정

### 9.1 PM2 Ecosystem 파일 확인

프로젝트 루트의 `ecosystem.config.js` 파일을 확인합니다.

```bash
# ecosystem.config.js 확인
cat ecosystem.config.js
```

**ecosystem.config.js 전체 내용**:

```javascript
/**
 * PM2 Ecosystem Configuration for Narae TMS v2.0
 * macOS Production Deployment
 */

module.exports = {
  apps: [
    {
      name: 'tms',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: '/Users/nit/tms',

      // 클러스터 모드 - CPU 코어 수만큼 인스턴스 생성
      instances: 'max',
      exec_mode: 'cluster',

      // 환경 변수
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,

        // Oracle Instant Client 경로
        DYLD_LIBRARY_PATH: '/opt/oracle/instantclient',
        ORACLE_HOME: '/opt/oracle/instantclient',
      },

      // 메모리 및 재시작 설정
      max_memory_restart: '2G',
      min_uptime: '10s',
      max_restarts: 10,
      autorestart: true,

      // 로그 설정
      error_file: '/Users/nit/tms/logs/pm2-error.log',
      out_file: '/Users/nit/tms/logs/pm2-out.log',
      log_file: '/Users/nit/tms/logs/pm2-combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Watch 설정 (Production에서는 false)
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.next', '.git'],

      // Graceful shutdown 설정
      kill_timeout: 5000,
      listen_timeout: 3000,
      wait_ready: true,

      // 프로세스 관리
      instance_var: 'INSTANCE_ID',

      // Node.js 옵션
      node_args: '--max-old-space-size=2048',
    },
  ],
};
```

### 9.2 로그 디렉토리 생성

```bash
# 로그 디렉토리 생성
mkdir -p /Users/nit/tms/logs

# 권한 설정
chmod 755 /Users/nit/tms/logs
```

### 9.3 PM2로 TMS 시작

```bash
# 프로젝트 디렉토리로 이동
cd /Users/nit/tms

# PM2로 Next.js 앱 시작
pm2 start ecosystem.config.js --env production

# 상태 확인
pm2 list

# 예상 출력:
# ┌─────┬──────────┬─────────────┬─────────┬─────────┬──────────┬────────┐
# │ id  │  name    │  mode       │  status │  cpu    │  memory  │ ...    │
# ├─────┼──────────┼─────────────┼─────────┼─────────┼──────────┼────────┤
# │ 0   │  tms     │  cluster    │  online │  2%     │  150M    │ ...    │
# │ 1   │  tms     │  cluster    │  online │  1%     │  145M    │ ...    │
# │ ...
# └─────┴──────────┴─────────────┴─────────┴─────────┴──────────┴────────┘
```

### 9.4 PM2 로그 확인

```bash
# 실시간 로그 확인
pm2 logs tms

# 최근 50줄
pm2 logs tms --lines 50

# 에러 로그만
pm2 logs tms --err

# Ctrl+C로 종료
```

### 9.5 PM2 프로세스 저장

```bash
# 현재 PM2 프로세스 목록 저장
pm2 save

# 저장 확인
ls ~/.pm2/dump.pm2
# /Users/nit/.pm2/dump.pm2
```

### 9.6 PM2 자동 시작 설정 (macOS)

```bash
# PM2 startup 스크립트 생성
pm2 startup

# 출력 예시:
# [PM2] Init System found: launchd
# [PM2] To setup the Startup Script, copy/paste the following command:
# sudo env PATH=$PATH:/opt/homebrew/bin /opt/homebrew/lib/node_modules/pm2/bin/pm2 startup launchd -u nit --hp /Users/nit

# 출력된 sudo 명령을 복사해서 실행
sudo env PATH=$PATH:/opt/homebrew/bin /opt/homebrew/lib/node_modules/pm2/bin/pm2 startup launchd -u nit --hp /Users/nit

# PM2 LaunchAgent 확인
ls ~/Library/LaunchAgents/ | grep pm2
# pm2.nit.plist

# 다시 프로세스 저장
pm2 save
```

**설명**: PM2는 macOS의 LaunchAgent를 생성하여 시스템 부팅 시 자동으로 TMS를 시작합니다.

### 9.7 PM2 모니터링

```bash
# 실시간 모니터링 대시보드
pm2 monit

# 상세 정보
pm2 describe tms

# 메모리/CPU 사용량
pm2 list
```

---

## 10. Local LLM (Ollama) 구성

**선택사항**: AI 튜닝 가이드 기능을 사용하려면 Local LLM을 설치합니다.

### 10.1 Ollama 설치

```bash
# Ollama 설치
brew install ollama

# 버전 확인
ollama --version
# ollama version 0.5.5
```

### 10.2 Ollama 서비스 시작

```bash
# Ollama 서비스 시작
brew services start ollama

# 상태 확인
brew services list | grep ollama
# ollama  started nit ~/Library/LaunchAgents/homebrew.mxcl.ollama.plist

# 프로세스 확인
ps aux | grep ollama | grep -v grep
```

### 10.3 Qwen3 8B 모델 다운로드

**Qwen3 8B 모델 사양**:
- 파라미터: 8B
- 양자화: Q4_K_M (~5.5GB)
- 권장 RAM: 16GB 이상
- 추론 속도: Apple Silicon 최적화

```bash
# Qwen3 8B 모델 다운로드 (5-10분 소요)
ollama pull qwen3:8b

# 다운로드 진행 상황 확인
# [████████████████████████████████] 100%

# 설치된 모델 확인
ollama list
# NAME            ID              SIZE      MODIFIED
# qwen3:8b        abc123def456    5.5 GB    2 minutes ago
```

**대안 모델** (메모리가 부족한 경우):
```bash
# Qwen3 3B (더 작은 모델)
ollama pull qwen3:3b

# 또는 Kanana 1.5 8B (한국어 특화)
ollama pull hf.co/Mungert/kanana-1.5-8b-instruct-2505-GGUF:Q4_K_M
```

### 10.4 모델 테스트

```bash
# Qwen3 모델 테스트
ollama run qwen3:8b "다음 SQL을 최적화하세요: SELECT * FROM employees WHERE department_id = 10"

# 응답 확인 (예시)
# 이 쿼리는 다음과 같이 최적화할 수 있습니다:
# 1. SELECT * 대신 필요한 컬럼만 선택
# 2. department_id 컬럼에 인덱스 생성
# ...

# Ctrl+D로 종료
```

### 10.5 TMS 환경 변수 업데이트

```bash
# .env.local 편집
nano /Users/nit/tms/.env.local
```

**LLM 관련 설정 수정**:
```bash
# ============================================
# LLM Configuration (Ollama + Qwen3 8B)
# ============================================
LLM_BASE_URL=http://localhost:11434
LLM_MODEL_NAME=qwen3:8b
LLM_API_TYPE=ollama
LLM_MAX_TOKENS=4096
LLM_TEMPERATURE=0.3
LLM_TIMEOUT=180000
FEATURE_AI_TUNING_GUIDE=true  # ← false에서 true로 변경
```

### 10.6 TMS 재시작 및 확인

```bash
# PM2로 TMS 재시작
pm2 restart tms

# 로그 확인 (LLM 초기화 메시지 확인)
pm2 logs tms --lines 50 | grep -i llm

# 예상 출력:
# [LLM] Initializing Ollama client...
# [LLM] Model: qwen3:8b
# [LLM] Health check: OK
```

### 10.7 AI 튜닝 가이드 테스트

```bash
# 브라우저에서 TMS 접속
open https://sqltms.info

# 로그인 후 다음 경로로 이동:
# 분석 > AI 튜닝 가이드
# 또는
# /analysis/ai-tuning-guide
```

**기능 테스트**:
1. SQL 텍스트 입력
2. "AI 분석 시작" 버튼 클릭
3. 스트리밍 응답 확인

### 10.8 Ollama 성능 모니터링

```bash
# Ollama 로그 확인
tail -f ~/Library/Logs/Ollama/server.log

# 메모리 사용량 확인
ps aux | grep ollama

# 모델 로드 시간 측정
time ollama run qwen3:8b "Test" <<< "/bye"
```

**성능 최적화 팁**:
- 메모리가 부족하면 더 작은 양자화 모델 사용 (Q3_K_M)
- Apple Silicon의 경우 Metal 가속 자동 활성화
- 모델은 첫 요청 시 로드 (5-10초 소요)

---

## 11. 시스템 자동 시작 설정

### 11.1 자동 시작 서비스 요약

macOS 재부팅 시 자동으로 시작되는 서비스:

| 서비스 | 시작 방식 | 확인 명령 |
|--------|----------|----------|
| **PostgreSQL** | Homebrew LaunchAgent | `brew services list \| grep postgresql` |
| **Ollama** | Homebrew LaunchAgent | `brew services list \| grep ollama` |
| **Nginx** | LaunchDaemon (system) | `sudo launchctl list \| grep nginx` |
| **PM2 (TMS)** | LaunchAgent (user) | `pm2 list` |

### 11.2 Nginx LaunchDaemon 생성

Nginx는 포트 80/443을 사용하므로 root 권한으로 실행되어야 합니다.

```bash
# 기존 nginx 프로세스 종료
sudo pkill -9 nginx 2>/dev/null

# LaunchDaemon plist 파일 생성
sudo tee /Library/LaunchDaemons/com.nginx.plist > /dev/null <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.nginx</string>

    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/opt/nginx/bin/nginx</string>
        <string>-g</string>
        <string>daemon off;</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardErrorPath</key>
    <string>/opt/homebrew/var/log/nginx/launchd-error.log</string>

    <key>StandardOutPath</key>
    <string>/opt/homebrew/var/log/nginx/launchd-out.log</string>

    <key>WorkingDirectory</key>
    <string>/opt/homebrew/var</string>
</dict>
</plist>
EOF

# 권한 설정
sudo chown root:wheel /Library/LaunchDaemons/com.nginx.plist
sudo chmod 644 /Library/LaunchDaemons/com.nginx.plist

# LaunchDaemon 등록 및 시작
sudo launchctl load -w /Library/LaunchDaemons/com.nginx.plist

# 확인
sudo launchctl list | grep nginx
# -       0       com.nginx

ps aux | grep nginx | grep -v grep
```

### 11.3 자동 시작 확인

```bash
# PostgreSQL 자동 시작 확인
brew services list | grep postgresql@17
# postgresql@17 started nit ~/Library/LaunchAgents/homebrew.mxcl.postgresql@17.plist

# Ollama 자동 시작 확인
brew services list | grep ollama
# ollama  started nit ~/Library/LaunchAgents/homebrew.mxcl.ollama.plist

# Nginx LaunchDaemon 확인
sudo launchctl list | grep nginx
# -       0       com.nginx

# PM2 LaunchAgent 확인
launchctl list | grep PM2
# -       0       pm2.nit

# PM2 프로세스 확인
pm2 list
# tms가 online 상태여야 함
```

### 11.4 재부팅 테스트

```bash
# Mac 재시작
sudo reboot
```

**재부팅 후 확인 (5분 정도 대기)**:

```bash
# 1. PostgreSQL 실행 확인
PGPASSWORD=song7409 psql -U tms_app -d tms -c "SELECT version();"

# 2. Ollama 실행 확인
ollama list

# 3. Nginx 실행 확인
ps aux | grep nginx | grep -v grep

# 4. PM2 실행 확인
pm2 list

# 5. 브라우저에서 접속 확인
open https://sqltms.info
```

---

## 12. 배포 확인 및 테스트

### 12.1 전체 시스템 상태 확인 스크립트

```bash
# 상태 확인 스크립트 생성
cat > ~/check-tms-status.sh <<'EOF'
#!/bin/bash
echo "========================================"
echo "TMS v2.0 시스템 상태 확인"
echo "========================================"
echo ""

echo "1. PostgreSQL:"
brew services list | grep postgresql@17
PGPASSWORD=song7409 psql -U tms_app -d tms -c "SELECT 'Connected' AS status;" 2>&1 | tail -1

echo ""
echo "2. Ollama:"
brew services list | grep ollama
ollama list 2>&1 | head -2

echo ""
echo "3. Nginx:"
ps aux | grep nginx | grep -v grep | head -2
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:80

echo ""
echo "4. PM2:"
pm2 list

echo ""
echo "5. 포트 사용 확인:"
echo "Port 3000 (Next.js):"
lsof -i :3000 2>&1 | head -2
echo "Port 80 (Nginx HTTP):"
lsof -i :80 2>&1 | head -2
echo "Port 443 (Nginx HTTPS):"
lsof -i :443 2>&1 | head -2
echo "Port 11434 (Ollama):"
lsof -i :11434 2>&1 | head -2

echo ""
echo "6. 최근 로그 (PM2 에러):"
tail -10 /Users/nit/tms/logs/pm2-error.log 2>/dev/null || echo "No errors"

echo ""
echo "7. Nginx 에러 로그:"
tail -10 /opt/homebrew/var/log/nginx/sqltms-error.log 2>/dev/null || echo "No errors"

echo ""
echo "========================================"
echo "상태 확인 완료"
echo "========================================"
EOF

# 실행 권한 부여
chmod +x ~/check-tms-status.sh

# 실행
~/check-tms-status.sh
```

### 12.2 기능별 테스트 체크리스트

#### 기본 기능
- [ ] HTTPS 접속 (`https://sqltms.info`)
- [ ] HTTP → HTTPS 리다이렉트
- [ ] 홈페이지 로드
- [ ] 로그인 페이지 접근

#### 인증 및 사용자
- [ ] 회원가입
- [ ] 로그인
- [ ] 로그아웃
- [ ] 비밀번호 변경

#### Oracle 연결
- [ ] Oracle 연결 추가
- [ ] 연결 테스트
- [ ] 연결 목록 조회

#### 모니터링 기능
- [ ] 대시보드 접속
- [ ] SQL 통계 조회
- [ ] 실행 계획 조회
- [ ] 세션 모니터링

#### AI 튜닝 가이드 (LLM 설치한 경우)
- [ ] AI 튜닝 가이드 페이지 접근
- [ ] SQL 텍스트 입력
- [ ] AI 분석 실행
- [ ] 스트리밍 응답 수신

### 12.3 성능 테스트

```bash
# 1. 응답 시간 측정 (HTTPS)
time curl -s -o /dev/null https://sqltms.info

# 예상: real 0m0.100s

# 2. Next.js 응답 시간 (직접)
time curl -s -o /dev/null http://localhost:3000

# 예상: real 0m0.050s

# 3. API 응답 시간
time curl -s -o /dev/null https://sqltms.info/api/health

# 예상: real 0m0.200s

# 4. 동시 요청 테스트 (Apache Bench 필요)
ab -n 100 -c 10 https://sqltms.info/

# 5. SSL 성능 테스트
openssl s_time -connect sqltms.info:443 -new -time 10
```

### 12.4 보안 확인

```bash
# 1. SSL 인증서 확인
echo | openssl s_client -connect sqltms.info:443 2>/dev/null | openssl x509 -noout -text | grep -E "Subject:|Issuer:|Not"

# 2. 보안 헤더 확인
curl -I https://sqltms.info | grep -E "X-Frame-Options|X-Content-Type-Options|Strict-Transport-Security"

# 3. CVE-2025-66478 차단 확인
curl -X POST https://sqltms.info/api/test \
  -H "Next-Action: x" \
  -d '{}' \
  -w "\nHTTP Status: %{http_code}\n"
# 예상: HTTP Status: 403

# 4. 포트 스캔 (외부에서)
# nmap -p 80,443,3000,5432 sqltms.info
# 3000, 5432는 외부에서 접근 불가해야 함
```

---

## 13. 문제 해결 가이드

### 13.1 PostgreSQL 관련

#### 증상: PostgreSQL 연결 실패
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**해결**:
```bash
# PostgreSQL 상태 확인
brew services list | grep postgresql

# 시작되지 않았으면 시작
brew services start postgresql@17

# 로그 확인
tail -50 /opt/homebrew/var/log/postgresql@17.log

# 연결 테스트
PGPASSWORD=song7409 psql -U tms_app -h localhost -d tms -c "SELECT 1;"
```

#### 증상: 권한 오류
```
permission denied for schema public
```

**해결**:
```bash
# postgres 사용자로 접속
psql postgres

# 권한 재부여
\c tms
GRANT ALL PRIVILEGES ON SCHEMA public TO tms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO tms_app;
\q
```

### 13.2 Nginx 관련

#### 증상: 502 Bad Gateway

**해결**:
```bash
# PM2 프로세스 확인
pm2 list
# tms가 online 상태인지 확인

# Next.js 직접 접속 테스트
curl http://localhost:3000

# PM2 재시작
pm2 restart tms

# Nginx 에러 로그 확인
tail -50 /opt/homebrew/var/log/nginx/sqltms-error.log
```

#### 증상: SSL 인증서 오류
```
nginx: [emerg] cannot load certificate
```

**해결**:
```bash
# 인증서 파일 존재 확인
sudo ls -la /etc/letsencrypt/live/sqltms.info/

# 인증서 갱신
sudo certbot renew

# Nginx 재시작
sudo launchctl kickstart -k system/com.nginx
```

### 13.3 PM2 관련

#### 증상: PM2 앱이 시작되지 않음

**해결**:
```bash
# PM2 로그 확인
pm2 logs tms --err --lines 50

# 환경 변수 확인
pm2 env tms | grep -E "ORACLE|DATABASE"

# PM2 삭제 후 재시작
pm2 delete tms
cd /Users/nit/tms
pm2 start ecosystem.config.js --env production
pm2 save
```

#### 증상: PM2가 잘못된 디렉토리에서 실행

```
MODULE_NOT_FOUND
Cannot find module '/Users/xxx/.next/server/chunks/...'
```

**원인**: PM2가 이전 디렉토리나 잘못된 경로에서 실행 중

**해결**:
```bash
# 1. PM2 상세 정보 확인
pm2 describe tms | grep cwd
# cwd: /Users/xxx/old_directory  ← 잘못된 경로

# 2. PM2 완전 삭제
pm2 delete all
pm2 kill

# 3. 올바른 디렉토리로 이동
cd /Users/nit/tms

# 4. ecosystem.config.js 경로 확인
cat ecosystem.config.js | grep cwd
# cwd: '/Users/nit/tms',  ← 올바른 경로

# 5. PM2 재시작
pm2 start ecosystem.config.js --env production

# 6. PM2 프로세스 저장
pm2 save

# 7. 확인
pm2 list
pm2 logs tms --lines 20
```

#### 증상: 메모리 부족으로 재시작 반복

**해결**:
```bash
# ecosystem.config.js에서 메모리 제한 증가
nano ecosystem.config.js
# max_memory_restart: '3G',  // 2G → 3G

# 인스턴스 수 줄이기
# instances: 2,  // 'max' → 고정 숫자

# PM2 재시작
pm2 reload ecosystem.config.js --env production
```

### 13.4 Oracle Instant Client 관련

#### 증상: DPI-1047 에러
```
DPI-1047: Cannot locate a 64-bit Oracle Client library
```

**해결**:
```bash
# 환경 변수 확인
echo $ORACLE_HOME
echo $DYLD_LIBRARY_PATH

# ~/.zshrc 확인
cat ~/.zshrc | grep ORACLE

# 없으면 추가
cat >> ~/.zshrc <<'EOF'
export ORACLE_HOME=/opt/oracle/instantclient
export DYLD_LIBRARY_PATH=$ORACLE_HOME:$DYLD_LIBRARY_PATH
EOF

source ~/.zshrc

# PM2 재시작
pm2 restart tms
```

### 13.5 LLM 관련

#### 증상: Ollama 연결 실패
```
Error: connect ECONNREFUSED 127.0.0.1:11434
```

**해결**:
```bash
# Ollama 상태 확인
brew services list | grep ollama

# 시작
brew services start ollama

# 로그 확인
tail -50 ~/Library/Logs/Ollama/server.log

# API 테스트
curl http://localhost:11434/api/tags
```

#### 증상: Ollama가 자동 시작되지 않음

```
brew services list | grep ollama
# ollama  none
```

**원인**: Ollama가 수동으로 `ollama serve` 명령으로 실행되어 재부팅 시 자동 시작되지 않음

**해결**:
```bash
# 1. 기존 Ollama 프로세스 종료
pkill ollama

# 2. Homebrew 서비스로 시작
brew services start ollama

# 3. 상태 확인
brew services list | grep ollama
# ollama  started nit ~/Library/LaunchAgents/homebrew.mxcl.ollama.plist

# 4. LaunchAgent 생성 확인
ls ~/Library/LaunchAgents/ | grep ollama
# homebrew.mxcl.ollama.plist

# 5. API 테스트
sleep 5 && curl http://localhost:11434/api/tags

# 6. 재부팅 후에도 자동 시작됨
```

**설명**: `brew services start ollama`는 LaunchAgent를 생성하여 시스템 부팅 시 자동으로 Ollama를 시작합니다.

#### 증상: 모델 응답이 느림

**해결**:
```bash
# 더 작은 양자화 모델 사용
ollama pull qwen3:3b

# .env.local 수정
LLM_MODEL_NAME=qwen3:3b

# PM2 재시작
pm2 restart tms
```

### 13.6 Next.js 빌드 관련

#### 증상: 빌드 실패
```
Error: Build failed
```

**해결**:
```bash
# 캐시 정리
rm -rf .next
rm -rf node_modules/.cache

# 의존성 재설치
rm -rf node_modules package-lock.json
npm install

# 빌드 재시도
npm run build
```

### 13.7 네트워크 관련

#### 증상: 외부에서 접속 불가

**체크리스트**:
```bash
# 1. 로컬 접속 확인
curl http://localhost:80

# 2. Mac 로컬 IP로 접속 (같은 네트워크에서)
curl http://192.168.0.10:80

# 3. 공인 IP 확인
curl ifconfig.me

# 4. 포트포워딩 확인 (공유기 설정)
# 80 → 192.168.0.10:80
# 443 → 192.168.0.10:443

# 5. DNS A 레코드 확인
nslookup sqltms.info

# 6. macOS 방화벽 확인
# 시스템 설정 > 네트워크 > 방화벽
```

---

## 14. 유지보수 및 업데이트

### 14.1 애플리케이션 업데이트

```bash
# 1. 백업 생성
cd /Users/nit/tms
tar -czf ~/tms-backup-$(date +%Y%m%d_%H%M%S).tar.gz \
  --exclude=node_modules \
  --exclude=.next \
  .

# 2. Git pull (코드 업데이트)
git pull origin main

# 3. 의존성 업데이트
npm install

# 4. 데이터베이스 마이그레이션 (필요시)
npm run db:migrate

# 5. 빌드
npm run build

# 6. PM2 무중단 재시작
pm2 reload tms

# 7. 확인
pm2 logs tms --lines 50
```

### 14.2 SSL 인증서 갱신

```bash
# 자동 갱신 (crontab 설정되어 있음)
# 매일 새벽 3시 자동 실행

# 수동 갱신
sudo certbot renew

# 테스트 모드
sudo certbot renew --dry-run

# 인증서 만료일 확인
sudo certbot certificates
```

### 14.3 데이터베이스 백업

```bash
# 백업 스크립트 생성
cat > ~/backup-tms-db.sh <<'EOF'
#!/bin/bash
BACKUP_DIR="/Users/nit/tms-backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/tms_backup_$DATE.sql"

mkdir -p $BACKUP_DIR

# PostgreSQL 백업
PGPASSWORD=song7409 pg_dump -U tms_app -d tms -F p -f $BACKUP_FILE

# 압축
gzip $BACKUP_FILE

# 7일 이상 된 백업 삭제
find $BACKUP_DIR -name "tms_backup_*.sql.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_FILE.gz"
EOF

chmod +x ~/backup-tms-db.sh

# crontab 추가 (매일 새벽 2시)
crontab -e
# 0 2 * * * /Users/nit/backup-tms-db.sh >> /Users/nit/tms-backups/backup.log 2>&1

# 백업 테스트
~/backup-tms-db.sh
```

### 14.4 로그 관리

```bash
# PM2 로그 정리
pm2 flush

# Nginx 로그 로테이션
# macOS는 기본적으로 newsyslog를 사용

# 로그 로테이션 설정
sudo nano /etc/newsyslog.d/nginx.conf
```

**/etc/newsyslog.d/nginx.conf**:
```
# logfilename          [owner:group]    mode count size when  flags [/pid_file] [sig_num]
/opt/homebrew/var/log/nginx/*.log    644  7     10000 *     GZ
```

### 14.5 PostgreSQL 유지보수

```bash
# VACUUM (주기적으로 실행 권장)
PGPASSWORD=song7409 psql -U tms_app -d tms -c "VACUUM ANALYZE;"

# 데이터베이스 크기 확인
PGPASSWORD=song7409 psql -U tms_app -d tms -c "
SELECT pg_database.datname,
       pg_size_pretty(pg_database_size(pg_database.datname)) AS size
FROM pg_database
WHERE datname = 'tms';"

# 테이블별 크기 확인
PGPASSWORD=song7409 psql -U tms_app -d tms -c "
SELECT schemaname,
       tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;"
```

### 14.6 시스템 모니터링

```bash
# 디스크 사용량
df -h

# 메모리 사용량
vm_stat

# CPU 사용량
top -l 1 | grep -E "CPU|PhysMem"

# PM2 모니터링
pm2 monit

# 포트 사용 확인
sudo lsof -i -P | grep LISTEN
```

### 14.7 정기 점검 체크리스트

#### 매일
- [ ] PM2 프로세스 상태 확인
- [ ] 에러 로그 확인
- [ ] 디스크 사용량 확인

#### 매주
- [ ] 데이터베이스 백업 확인
- [ ] 시스템 리소스 모니터링
- [ ] 보안 업데이트 확인

#### 매월
- [ ] SSL 인증서 만료일 확인
- [ ] PostgreSQL VACUUM 실행
- [ ] 불필요한 로그 파일 정리
- [ ] 의존성 업데이트 검토

---

## 부록 A: 전체 설치 자동화 스크립트

```bash
#!/bin/bash
# TMS v2.0 macOS 자동 설치 스크립트

set -e

echo "========================================"
echo "Narae TMS v2.0 macOS 자동 설치"
echo "========================================"
echo ""

# 1. Homebrew 확인
if ! command -v brew &> /dev/null; then
    echo "Homebrew를 설치합니다..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# 2. 소프트웨어 설치
echo "필수 소프트웨어를 설치합니다..."
brew install postgresql@17 node@20 nginx certbot ollama

# 3. 전역 npm 패키지 설치
echo "전역 npm 패키지를 설치합니다..."
npm install -g pm2 drizzle-kit

# 4. 서비스 시작
echo "서비스를 시작합니다..."
brew services start postgresql@17
brew services start ollama

echo ""
echo "✅ 기본 설치 완료!"
echo ""
echo "다음 단계를 수동으로 진행하세요:"
echo "1. Oracle Instant Client 설치 (/opt/oracle/instantclient)"
echo "2. PostgreSQL 데이터베이스 생성 (tms, tms_app)"
echo "3. SSL 인증서 발급 (sudo certbot certonly --standalone -d sqltms.info)"
echo "4. 프로젝트 설정 (.env.local)"
echo "5. Ollama 모델 다운로드 (ollama pull qwen3:8b)"
echo "6. 매뉴얼의 6-11번 섹션 진행"
echo ""
```

---

## 부록 B: 서비스 관리 명령어

### PostgreSQL
```bash
brew services start postgresql@17     # 시작
brew services stop postgresql@17      # 중지
brew services restart postgresql@17   # 재시작
psql -U tms_app -d tms                # 접속
```

### Ollama
```bash
brew services start ollama            # 시작
brew services stop ollama             # 중지
ollama list                           # 모델 목록
ollama run qwen3:8b                   # 모델 실행
```

### Nginx
```bash
sudo nginx                                         # 시작
sudo nginx -s quit                                 # 정상 종료
sudo nginx -s reload                               # 설정 리로드
sudo nginx -t                                      # 설정 검증
sudo launchctl kickstart -k system/com.nginx       # LaunchDaemon 재시작
```

### PM2
```bash
pm2 start ecosystem.config.js --env production    # 시작
pm2 stop tms                                      # 중지
pm2 restart tms                                   # 재시작
pm2 reload tms                                    # 무중단 재시작
pm2 delete tms                                    # 삭제
pm2 list                                          # 목록
pm2 logs tms                                      # 로그
pm2 monit                                         # 모니터링
pm2 save                                          # 프로세스 저장
```

---

## 부록 C: 배포 체크리스트

### 사전 준비
- [ ] macOS 12.0 이상
- [ ] 16GB RAM 이상
- [ ] 50GB 디스크 여유 공간
- [ ] sudo 권한
- [ ] 도메인 DNS A 레코드 설정
- [ ] 공유기 포트포워딩 (80, 443)
- [ ] Mac 고정 로컬 IP 설정

### 소프트웨어 설치
- [ ] Homebrew 설치
- [ ] PostgreSQL 17 설치 및 시작
- [ ] Node.js 20 설치
- [ ] PM2 설치
- [ ] Nginx 설치
- [ ] Certbot 설치
- [ ] Ollama 설치 (선택)
- [ ] Oracle Instant Client 설치

### 데이터베이스 설정
- [ ] PostgreSQL 데이터베이스 생성 (tms)
- [ ] PostgreSQL 사용자 생성 (tms_app)
- [ ] 권한 부여
- [ ] 확장 설치 (uuid-ossp, pgcrypto, pg_trgm)
- [ ] 연결 테스트

### 프로젝트 설정
- [ ] 프로젝트 클론/복사
- [ ] npm install
- [ ] .env.local 설정
- [ ] 비밀 키 생성
- [ ] 데이터베이스 스키마 적용
- [ ] npm run build
- [ ] 로컬 테스트

### Nginx 및 SSL
- [ ] Nginx 설정 파일 작성
- [ ] SSL 인증서 발급
- [ ] Nginx 시작
- [ ] HTTPS 접속 확인
- [ ] SSL 자동 갱신 설정

### PM2 설정
- [ ] ecosystem.config.js 확인
- [ ] 로그 디렉토리 생성
- [ ] PM2로 TMS 시작
- [ ] PM2 프로세스 저장
- [ ] PM2 자동 시작 설정

### LLM 설정 (선택)
- [ ] Ollama 서비스 시작
- [ ] Qwen3 8B 모델 다운로드
- [ ] .env.local에 LLM 설정 추가
- [ ] FEATURE_AI_TUNING_GUIDE=true
- [ ] PM2 재시작

### 자동 시작 설정
- [ ] PostgreSQL 자동 시작 (brew services)
- [ ] Ollama 자동 시작 (brew services)
- [ ] Nginx LaunchDaemon 등록
- [ ] PM2 startup 설정
- [ ] 재부팅 테스트

### 배포 후 확인
- [ ] https://sqltms.info 접속
- [ ] 로그인 기능
- [ ] Oracle 연결 테스트
- [ ] 모니터링 기능
- [ ] AI 튜닝 가이드 (LLM 설치 시)
- [ ] 재부팅 후 자동 시작

### 유지보수 설정
- [ ] 데이터베이스 백업 crontab
- [ ] SSL 자동 갱신 crontab
- [ ] 로그 로테이션 설정
- [ ] 모니터링 스크립트 생성

---

## 문의 및 지원

- **개발사**: 주식회사 나래정보기술
- **제품명**: Narae TMS v2.0
- **문서 버전**: 2.0.0
- **최종 업데이트**: 2026-02-16
- **GitHub**: https://github.com/naraeit77/tms

---

**배포 성공을 기원합니다! 🎉**

이 가이드를 따라 진행하면 Mac Studio에서 완전한 프로덕션 환경의 TMS v2.0을 구축할 수 있습니다.
