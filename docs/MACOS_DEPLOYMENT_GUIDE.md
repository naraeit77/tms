# Narae TMS v2.0 - macOS 완전 배포 가이드

**대상 환경**: macOS (Apple Silicon/Intel), PostgreSQL 17, Nginx, PM2
**작성일**: 2026-02-16
**버전**: 2.0.0

---

## 📋 목차

1. [사전 준비사항](#1-사전-준비사항)
2. [PostgreSQL 17 설치 및 설정](#2-postgresql-17-설치-및-설정)
3. [Node.js 및 필수 도구 설치](#3-nodejs-및-필수-도구-설치)
4. [Oracle Instant Client 설치](#4-oracle-instant-client-설치)
5. [TMS 프로젝트 설정](#5-tms-프로젝트-설정)
6. [Nginx 설치 및 HTTPS 설정](#6-nginx-설치-및-https-설정)
7. [PM2 자동 시작 설정](#7-pm2-자동-시작-설정)
8. [시스템 재부팅 시 자동 시작](#8-시스템-재부팅-시-자동-시작)
9. [배포 확인 및 문제 해결](#9-배포-확인-및-문제-해결)
10. [유지보수 및 업데이트](#10-유지보수-및-업데이트)

---

## 1. 사전 준비사항

### 1.1 시스템 요구사항

- **OS**: macOS 12.0 이상 (Apple Silicon 또는 Intel)
- **메모리**: 최소 8GB RAM (권장 16GB 이상)
- **디스크**: 최소 20GB 여유 공간
- **네트워크**: 인터넷 연결 (패키지 다운로드용)
- **권한**: sudo 권한 필요

### 1.2 도메인 및 네트워크 설정

```bash
# 1. 도메인 DNS 설정 (예: sqltms.info)
# A 레코드: sqltms.info → 공인 IP
# A 레코드: www.sqltms.info → 공인 IP

# 2. 공유기 포트포워딩 설정
# 외부 포트 80 → 내부 IP:80 (Mac IP 주소)
# 외부 포트 443 → 내부 IP:443 (Mac IP 주소)

# 3. Mac IP 주소 확인
ifconfig | grep "inet " | grep -v 127.0.0.1
# 예: 192.168.0.4
```

### 1.3 Homebrew 설치

```bash
# Homebrew가 없으면 설치
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 설치 확인
brew --version
```

---

## 2. PostgreSQL 17 설치 및 설정

### 2.1 PostgreSQL 17 설치

```bash
# PostgreSQL 17 설치
brew install postgresql@17

# PATH 설정 (.zshrc 또는 .bash_profile에 추가)
echo 'export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# 버전 확인
psql --version
# psql (PostgreSQL) 17.x
```

### 2.2 PostgreSQL 서비스 시작 및 자동 시작 설정

```bash
# PostgreSQL 서비스 시작
brew services start postgresql@17

# 상태 확인
brew services list | grep postgresql
# postgresql@17 started ...

# 자동 시작 확인 (부팅 시 자동 실행됨)
ls ~/Library/LaunchAgents/ | grep postgres
# homebrew.mxcl.postgresql@17.plist
```

### 2.3 데이터베이스 및 사용자 생성

```bash
# PostgreSQL 슈퍼유저로 접속
psql postgres

# SQL 실행 (psql 프롬프트에서)
```

```sql
-- TMS 데이터베이스 생성
CREATE DATABASE tms;

-- TMS 애플리케이션 사용자 생성 (비밀번호 변경 필요)
CREATE USER tms_app WITH PASSWORD 'song7409';

-- 데이터베이스 소유권 부여
ALTER DATABASE tms OWNER TO tms_app;

-- 권한 부여
GRANT ALL PRIVILEGES ON DATABASE tms TO tms_app;

-- 연결 확인
\c tms tms_app
\dt

-- 종료
\q
```

### 2.4 PostgreSQL 원격 접속 설정 (선택사항)

```bash
# postgresql.conf 편집
nano /opt/homebrew/var/postgresql@17/postgresql.conf

# 다음 라인을 찾아서 수정
# listen_addresses = 'localhost' → listen_addresses = '*'

# pg_hba.conf 편집
nano /opt/homebrew/var/postgresql@17/pg_hba.conf

# 파일 끝에 추가 (로컬 네트워크에서 접속 허용)
host    all             all             192.168.0.0/24          scram-sha-256

# PostgreSQL 재시작
brew services restart postgresql@17
```

### 2.5 데이터베이스 스키마 생성

```bash
# 프로젝트 디렉토리로 이동 (나중에 설정하지만 여기서 미리 준비)
cd /Users/nit/tms

# Drizzle ORM으로 스키마 생성 (프로젝트 설정 후 실행)
npm run db:push

# 또는 수동으로 SQL 실행
psql -U tms_app -d tms -f scripts/setup-postgresql-tms.sql
```

---

## 3. Node.js 및 필수 도구 설치

### 3.1 Node.js LTS 설치

```bash
# Node.js 설치 (LTS 버전 권장)
brew install node@20

# PATH 설정
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# 버전 확인
node --version  # v20.x.x
npm --version   # 10.x.x
```

### 3.2 필수 글로벌 패키지 설치

```bash
# PM2 설치 (프로세스 관리자)
npm install -g pm2

# Drizzle Kit 설치 (DB 마이그레이션)
npm install -g drizzle-kit

# 설치 확인
pm2 --version
drizzle-kit --version
```

---

## 4. Oracle Instant Client 설치

### 4.1 Oracle Instant Client 다운로드

```bash
# Oracle 공식 사이트에서 다운로드
# https://www.oracle.com/database/technologies/instant-client/macos-intel-x86-downloads.html
# (Apple Silicon은 ARM64 버전 다운로드)

# 다운로드 파일 (예시)
# instantclient-basic-macos.arm64-21.13.0.0.0dbru.zip
# instantclient-sqlplus-macos.arm64-21.13.0.0.0dbru.zip (선택)
```

### 4.2 Instant Client 설치

```bash
# 설치 디렉토리 생성
sudo mkdir -p /opt/oracle

# 다운로드한 ZIP 압축 해제
cd ~/Downloads
unzip instantclient-basic-macos.arm64-21.13.0.0.0dbru.zip -d /tmp

# /opt/oracle로 이동
sudo mv /tmp/instantclient_21_13 /opt/oracle/instantclient

# 심볼릭 링크 생성 (선택)
sudo ln -s /opt/oracle/instantclient/libclntsh.dylib /opt/oracle/instantclient/libclntsh.dylib.21.1

# 권한 설정
sudo chown -R $(whoami):staff /opt/oracle
chmod -R 755 /opt/oracle/instantclient

# 환경 변수 설정 (.zshrc에 추가)
cat >> ~/.zshrc <<'EOF'

# Oracle Instant Client
export ORACLE_HOME=/opt/oracle/instantclient
export DYLD_LIBRARY_PATH=$ORACLE_HOME:$DYLD_LIBRARY_PATH
export PATH=$ORACLE_HOME:$PATH
EOF

source ~/.zshrc

# 설치 확인
ls -la /opt/oracle/instantclient
echo $ORACLE_HOME
```

---

## 5. TMS 프로젝트 설정

### 5.1 프로젝트 클론 또는 이동

```bash
# 프로젝트가 이미 있는 경우
cd /Users/nit/tms

# Git에서 클론하는 경우 (예시)
# git clone https://github.com/naraeit77/tms.git /Users/nit/tms
# cd /Users/nit/tms
```

### 5.2 의존성 설치

```bash
# npm 패키지 설치
npm install

# 설치 확인
ls node_modules | wc -l
# 수백 개의 패키지가 설치되어야 함
```

### 5.3 환경 변수 설정 (.env.local)

```bash
# .env.local 파일 생성
cp .env.example .env.local  # 또는 직접 생성

# .env.local 편집
nano .env.local
```

**.env.local 내용** (전체):

```bash
# -------------------------------------
# NextAuth Configuration
# -------------------------------------
NEXTAUTH_URL=https://sqltms.info
NEXTAUTH_SECRET=qAqoju8LEUr1vDifA6NNSUUkBu6pzXJzozU2dr2awtI=

# NextAuth Providers (Optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# -------------------------------------
# Database Configuration (Local PostgreSQL 17)
# -------------------------------------
DATABASE_URL=postgresql://tms_app:song7409@localhost:5432/tms

# -------------------------------------
# Oracle Database (for testing)
# -------------------------------------
# 실제 Oracle 연결은 TMS UI에서 관리
ORACLE_TEST_HOST=mcseoper.iptime.org
ORACLE_TEST_PORT=2521
ORACLE_TEST_SERVICE_NAME=NITDB
ORACLE_TEST_USER=system
ORACLE_TEST_PASSWORD=oracle

# -------------------------------------
# Application Configuration
# -------------------------------------
PORT=3000
LOG_LEVEL=info

# -------------------------------------
# Security & Encryption
# -------------------------------------
# AES-256 encryption key for Oracle passwords
ENCRYPTION_KEY=27a3341b73e4dcd0aa3638995ee315180a01ee836f29d5dca99447c1f6bf3278

# Next.js Server Actions encryption key (stable across builds)
# CVE-2025-66478 방어 및 빌드 간 서버 액션 ID 일관성 보장
NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=3JxXYmVU9OaM+u2gEHvHfv6P1CBfiAOHCj6bbLR0YL8=

# -------------------------------------
# Monitoring & Alerts
# -------------------------------------
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@tms.com

SLACK_WEBHOOK_URL=

# -------------------------------------
# Performance & Caching
# -------------------------------------
REDIS_URL=redis://localhost:6379

SQL_COLLECTION_INTERVAL=300
METRICS_COLLECTION_INTERVAL=60

SQL_STATS_RETENTION_DAYS=90
AUDIT_LOG_RETENTION_DAYS=365

# -------------------------------------
# Feature Flags
# -------------------------------------
FEATURE_AI_TUNING_ADVISOR=false
FEATURE_AUTO_TUNING=false
FEATURE_EMAIL_ALERTS=false
FEATURE_SLACK_ALERTS=false

# -------------------------------------
# Development Tools
# -------------------------------------
DEBUG=false
SQL_DEBUG=false
USE_MOCK_ORACLE=false

# -------------------------------------
# Oracle Thick Mode Configuration
# -------------------------------------
ORACLE_THICK_MODE=true
ORACLE_CLIENT_LIB_DIR=/opt/oracle/instantclient

# -------------------------------------
# LLM Configuration (Qwen3 8B via Ollama)
# -------------------------------------
LLM_BASE_URL=http://localhost:11434
LLM_MODEL_NAME=qwen3:8b
LLM_API_TYPE=ollama
LLM_MAX_TOKENS=4096
LLM_TEMPERATURE=0.3
LLM_TIMEOUT=180000
FEATURE_AI_TUNING_GUIDE=true
```

**중요 설정 설명:**

| 환경 변수 | 설명 | 필수 여부 |
|-----------|------|----------|
| `NEXTAUTH_URL` | 배포할 도메인 URL | ✅ 필수 |
| `NEXTAUTH_SECRET` | NextAuth 세션 암호화 키 (변경 권장) | ✅ 필수 |
| `DATABASE_URL` | PostgreSQL 연결 문자열 | ✅ 필수 |
| `ENCRYPTION_KEY` | Oracle 비밀번호 암호화 키 (변경 권장) | ✅ 필수 |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Server Actions ID 안정화 (CVE 방어) | ✅ 필수 |
| `ORACLE_THICK_MODE` | Oracle Thick 모드 활성화 | ✅ 필수 |
| `ORACLE_CLIENT_LIB_DIR` | Oracle Instant Client 경로 | ✅ 필수 |

**비밀 키 생성 방법:**

```bash
# NEXTAUTH_SECRET 생성
openssl rand -base64 32

# ENCRYPTION_KEY 생성 (64자 hex)
openssl rand -hex 32

# NEXT_SERVER_ACTIONS_ENCRYPTION_KEY 생성
openssl rand -base64 32
```

### 5.4 데이터베이스 스키마 적용

```bash
# Drizzle ORM으로 스키마 푸시
npm run db:push

# 또는 마이그레이션 실행
npm run db:migrate

# 초기 데이터 시딩 (선택)
npm run db:seed
```

### 5.5 프로젝트 빌드

```bash
# Next.js 프로덕션 빌드
npm run build

# 빌드 성공 확인
ls -la .next/
# standalone, static, server 디렉토리가 있어야 함
```

### 5.6 로컬 테스트

```bash
# 프로덕션 모드 실행
npm start

# 브라우저에서 확인
# http://localhost:3000

# 테스트 완료 후 Ctrl+C로 종료
```

---

## 6. Nginx 설치 및 HTTPS 설정

### 6.1 Nginx 설치

```bash
# Nginx 설치
brew install nginx

# 버전 확인
nginx -v
# nginx version: nginx/1.25.x

# 설정 디렉토리 확인
ls /opt/homebrew/etc/nginx/
# nginx.conf, servers/ 등
```

### 6.2 SSL 인증서 발급 (Let's Encrypt)

```bash
# Certbot 설치
brew install certbot

# 인증서 발급 (standalone 모드)
# 주의: 포트 80이 비어있어야 함 (nginx 중지 상태)
sudo certbot certonly --standalone -d sqltms.info -d www.sqltms.info

# 프롬프트 응답:
# Email: your-email@example.com
# Agree to Terms: Y
# Share email: N (선택)

# 인증서 생성 확인
sudo ls -la /etc/letsencrypt/live/sqltms.info/
# fullchain.pem, privkey.pem 등이 있어야 함
```

**DNS 방식 (포트 80 사용 불가능한 경우):**

```bash
# DNS 챌린지 방식
sudo certbot certonly --manual --preferred-challenges dns -d sqltms.info -d www.sqltms.info

# TXT 레코드 추가 안내가 나오면:
# DNS 관리 화면에서 _acme-challenge.sqltms.info TXT 레코드 추가
# 값: (Certbot이 제시하는 값)
# 추가 후 Enter 키 입력
```

### 6.3 Nginx 설정 파일 작성

```bash
# servers 디렉토리 생성
mkdir -p /opt/homebrew/etc/nginx/servers

# sqltms.conf 파일 생성
nano /opt/homebrew/etc/nginx/servers/sqltms.conf
```

**sqltms.conf 전체 내용:**

```nginx
# ============================================
# Narae TMS v2.0 - Nginx Reverse Proxy Config
# https://www.sqltms.info → localhost:3000
# ============================================

# HTTP → HTTPS 리다이렉트
server {
    listen 80;
    server_name sqltms.info www.sqltms.info;
    return 301 https://$host$request_uri;
}

# HTTPS 메인 서버
server {
    listen 443 ssl;
    http2 on;
    server_name sqltms.info www.sqltms.info;

    # ─── SSL 인증서 ───
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
        return 403;
    }

    # ─── 로그 ───
    access_log /opt/homebrew/var/log/nginx/sqltms-access.log;
    error_log  /opt/homebrew/var/log/nginx/sqltms-error.log;

    # ─── 리버스 프록시 → Next.js (localhost:3000) ───
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

        # 타임아웃 (Oracle 쿼리가 느릴 수 있으므로 넉넉하게)
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
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # ─── 파비콘 등 정적 리소스 ───
    location ~* \.(ico|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 200 30d;
        add_header Cache-Control "public, max-age=2592000";
    }

    # ─── 요청 크기 제한 ───
    client_max_body_size 10M;
}
```

### 6.4 Nginx 메인 설정 확인

```bash
# nginx.conf에 servers 디렉토리 include 확인
grep "include.*servers" /opt/homebrew/etc/nginx/nginx.conf

# 없으면 http {} 블록 마지막에 추가
nano /opt/homebrew/etc/nginx/nginx.conf

# http { } 블록 끝부분에 추가:
# include servers/*;
```

### 6.5 Nginx 설정 검증 및 시작

```bash
# 설정 문법 검증
sudo nginx -t
# nginx: configuration file /opt/homebrew/etc/nginx/nginx.conf test is successful

# Nginx 시작
sudo nginx

# 프로세스 확인
ps aux | grep nginx | grep -v grep
# nginx: master process
# nginx: worker process
```

### 6.6 Nginx 자동 시작 설정 (LaunchDaemon)

```bash
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
</dict>
</plist>
EOF

# 권한 설정
sudo chown root:wheel /Library/LaunchDaemons/com.nginx.plist
sudo chmod 644 /Library/LaunchDaemons/com.nginx.plist

# 기존 nginx 프로세스 종료
sudo pkill -9 nginx 2>/dev/null

# LaunchDaemon 등록 및 시작
sudo launchctl load /Library/LaunchDaemons/com.nginx.plist

# 확인
ps aux | grep nginx | grep -v grep
launchctl list | grep nginx
```

### 6.7 SSL 자동 갱신 설정

```bash
# crontab 편집
crontab -e

# 다음 줄 추가 (매일 새벽 3시 인증서 갱신 체크)
0 3 * * * /opt/homebrew/bin/certbot renew --quiet --post-hook "sudo launchctl kickstart -k system/com.nginx"

# 저장 후 종료 (vim: :wq, nano: Ctrl+X → Y → Enter)

# crontab 확인
crontab -l
```

---

## 7. PM2 자동 시작 설정

### 7.1 ecosystem.config.js 확인 및 수정

```bash
# 프로젝트 디렉토리로 이동
cd /Users/nit/tms

# ecosystem.config.js 편집
nano ecosystem.config.js
```

**ecosystem.config.js 전체 내용:**

```javascript
/**
 * PM2 Ecosystem Configuration for Narae TMS v2.0
 * macOS Production deployment configuration
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

      // 기본 환경 변수
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // 프로덕션 환경 변수 (Mac Studio)
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        // Oracle Instant Client 경로 (Mac)
        DYLD_LIBRARY_PATH: '/opt/oracle/instantclient',
        ORACLE_HOME: '/opt/oracle/instantclient',
      },

      // 메모리 및 재시작 설정
      max_memory_restart: '2G',
      min_uptime: '10s',
      max_restarts: 10,
      autorestart: true,

      // 로그 설정 (Mac 경로)
      error_file: '/Users/nit/tms/logs/pm2-error.log',
      out_file: '/Users/nit/tms/logs/pm2-out.log',
      log_file: '/Users/nit/tms/logs/pm2-combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Watch 설정 (Production에서는 false 권장)
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.next', '.git'],

      // Graceful shutdown 설정
      kill_timeout: 5000,
      listen_timeout: 3000,
      wait_ready: true,

      // 프로세스 관리
      instance_var: 'INSTANCE_ID',

      // 소스 맵 비활성화 (성능 향상)
      source_map_support: false,

      // 인터프리터 옵션
      node_args: '--max-old-space-size=2048',
    },
  ],
};
```

### 7.2 로그 디렉토리 생성

```bash
# 로그 디렉토리 생성
mkdir -p /Users/nit/tms/logs

# 권한 설정
chmod 755 /Users/nit/tms/logs
```

### 7.3 PM2로 애플리케이션 시작

```bash
# PM2로 Next.js 앱 시작
cd /Users/nit/tms
pm2 start ecosystem.config.js --env production

# PM2 상태 확인
pm2 list
# ┌────┬─────────┬─────────────┬─────────┬─────────┬──────────┬────────┬──────┬───────────┐
# │ id │  name   │  mode       │  status │  cpu    │  memory  │ ...    │
# ├────┼─────────┼─────────────┼─────────┼─────────┼──────────┼────────┼──────┼───────────┤
# │ 0  │  tms    │  cluster    │  online │  0%     │  120M    │ ...    │
# └────┴─────────┴─────────────┴─────────┴─────────┴──────────┴────────┴──────┴───────────┘

# 로그 확인
pm2 logs tms --lines 50
```

### 7.4 PM2 프로세스 저장

```bash
# PM2 프로세스 목록 저장
pm2 save

# 저장 확인
ls ~/.pm2/dump.pm2
```

### 7.5 PM2 자동 시작 설정 (macOS)

```bash
# PM2 startup 스크립트 생성
pm2 startup

# 위 명령을 실행하면 아래와 같은 sudo 명령이 출력됨 (예시):
# [PM2] Init System found: launchd
# [PM2] To setup the Startup Script, copy/paste the following command:
# sudo env PATH=$PATH:/opt/homebrew/bin /opt/homebrew/lib/node_modules/pm2/bin/pm2 startup launchd -u nit --hp /Users/nit

# 출력된 sudo 명령을 복사해서 실행
sudo env PATH=$PATH:/opt/homebrew/bin /opt/homebrew/lib/node_modules/pm2/bin/pm2 startup launchd -u nit --hp /Users/nit

# PM2 LaunchAgent 확인
ls ~/Library/LaunchAgents/ | grep pm2
# pm2.nit.plist

# 다시 PM2 프로세스 저장
pm2 save
```

---

## 8. 시스템 재부팅 시 자동 시작

### 8.1 자동 시작 서비스 정리

**macOS 재부팅 시 자동으로 시작되는 서비스:**

| 서비스 | 시작 방식 | 확인 방법 |
|--------|----------|----------|
| **PostgreSQL** | Homebrew LaunchAgent | `brew services list \| grep postgresql` |
| **Nginx** | LaunchDaemon (system) | `launchctl list \| grep nginx` |
| **PM2 (TMS)** | LaunchAgent (user) | `pm2 list` |

### 8.2 자동 시작 확인

```bash
# PostgreSQL 자동 시작 확인
brew services list | grep postgresql@17
# postgresql@17 started ...

# Nginx LaunchDaemon 확인
sudo launchctl list | grep nginx
# - 0 com.nginx

# PM2 LaunchAgent 확인
launchctl list | grep PM2
# - 0 pm2.nit

# PM2 프로세스 확인
pm2 list
# tms가 online 상태여야 함
```

### 8.3 재부팅 테스트

```bash
# Mac 재시작
sudo reboot
```

**재부팅 후 확인 사항:**

```bash
# 1. PostgreSQL 실행 확인
psql -U tms_app -d tms -c "SELECT version();"

# 2. Nginx 실행 확인
ps aux | grep nginx | grep -v grep

# 3. PM2 실행 확인
pm2 list

# 4. 브라우저에서 접속 확인
# https://sqltms.info
```

---

## 9. 배포 확인 및 문제 해결

### 9.1 전체 서비스 상태 확인

```bash
# 통합 상태 확인 스크립트
cat > ~/check-tms-status.sh <<'EOF'
#!/bin/bash
echo "=== TMS v2.0 서비스 상태 확인 ==="
echo ""

echo "1. PostgreSQL:"
brew services list | grep postgresql@17

echo ""
echo "2. Nginx:"
ps aux | grep nginx | grep -v grep | head -2

echo ""
echo "3. PM2:"
pm2 list

echo ""
echo "4. 포트 확인:"
lsof -i :3000 | head -2
lsof -i :80 | head -2
lsof -i :443 | head -2

echo ""
echo "5. 로그 확인 (마지막 10줄):"
echo "--- PM2 Error Log ---"
tail -10 /Users/nit/tms/logs/pm2-error.log 2>/dev/null || echo "No errors"
echo ""
echo "--- Nginx Error Log ---"
tail -10 /opt/homebrew/var/log/nginx/sqltms-error.log 2>/dev/null || echo "No errors"
EOF

chmod +x ~/check-tms-status.sh

# 실행
~/check-tms-status.sh
```

### 9.2 일반적인 문제 해결

#### 9.2.1 PostgreSQL 연결 실패

**증상:**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**해결:**
```bash
# PostgreSQL 상태 확인
brew services list | grep postgresql

# 시작되지 않았으면 시작
brew services start postgresql@17

# 연결 테스트
psql -U tms_app -d tms -c "SELECT 1;"
```

#### 9.2.2 Nginx 403 Forbidden (SSL 인증서 권한)

**증상:**
```
nginx: [emerg] cannot load certificate ... Permission denied
```

**해결:**
```bash
# SSL 인증서 권한 확인
sudo ls -la /etc/letsencrypt/live/sqltms.info/

# Nginx가 인증서를 읽을 수 있도록 권한 설정 (이미 설정되어 있어야 함)
# 인증서는 root 소유이므로 nginx는 sudo로 실행되어야 함
```

#### 9.2.3 PM2 앱이 자동 시작되지 않음

**증상:**
```bash
pm2 list
# 아무것도 표시되지 않음
```

**해결:**
```bash
# PM2 startup 재설정
pm2 unstartup
pm2 startup
# 출력된 sudo 명령 실행

# PM2 프로세스 재시작
cd /Users/nit/tms
pm2 start ecosystem.config.js --env production
pm2 save
```

#### 9.2.4 Oracle Instant Client 라이브러리 오류

**증상:**
```
Error: DPI-1047: Cannot locate a 64-bit Oracle Client library
```

**해결:**
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

#### 9.2.5 "Failed to find Server Action x" 에러

**증상:**
```
Error: Failed to find Server Action "x". This request might be from an older or newer deployment.
```

**해결:**

이 에러는 **CVE-2025-66478 스캐닝 트래픽**으로, 앱 버그가 아닙니다. Nginx가 403으로 차단하므로 기능에 영향 없음.

확인:
```bash
# Nginx access log 확인 (403 응답이 보이면 정상 차단 중)
tail -50 /opt/homebrew/var/log/nginx/sqltms-access.log | grep "POST.*403"
```

### 9.3 성능 모니터링

```bash
# PM2 모니터링 대시보드
pm2 monit

# 메모리/CPU 사용량 확인
pm2 list

# 로그 실시간 확인
pm2 logs tms --lines 100

# Nginx 접속 로그 확인
tail -f /opt/homebrew/var/log/nginx/sqltms-access.log
```

---

## 10. 유지보수 및 업데이트

### 10.1 애플리케이션 업데이트

```bash
# 1. Git pull (코드 업데이트)
cd /Users/nit/tms
git pull origin main

# 2. 의존성 업데이트
npm install

# 3. 데이터베이스 마이그레이션 (필요시)
npm run db:migrate

# 4. 빌드
npm run build

# 5. PM2 재시작 (무중단)
pm2 reload ecosystem.config.js --env production

# 6. 확인
pm2 logs tms --lines 50
```

### 10.2 SSL 인증서 갱신

```bash
# 수동 갱신 (crontab 설정이 있으면 자동 갱신됨)
sudo certbot renew --dry-run  # 테스트
sudo certbot renew            # 실제 갱신

# Nginx 재시작
sudo launchctl kickstart -k system/com.nginx

# 인증서 만료일 확인
sudo certbot certificates
```

### 10.3 로그 관리

```bash
# PM2 로그 삭제
pm2 flush

# Nginx 로그 로테이션 설정
sudo tee /etc/newsyslog.d/nginx.conf > /dev/null <<'EOF'
/opt/homebrew/var/log/nginx/*.log {
    weekly
    rotate 4
    compress
    missingok
    notifempty
    sharedscripts
    postrotate
        sudo launchctl kickstart -k system/com.nginx
    endscript
}
EOF
```

### 10.4 데이터베이스 백업

```bash
# PostgreSQL 백업 스크립트 생성
cat > ~/backup-tms-db.sh <<'EOF'
#!/bin/bash
BACKUP_DIR="/Users/nit/tms-backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/tms_backup_$DATE.sql"

mkdir -p $BACKUP_DIR

pg_dump -U tms_app -d tms -F p -f $BACKUP_FILE

# 7일 이상 된 백업 삭제
find $BACKUP_DIR -name "tms_backup_*.sql" -mtime +7 -delete

echo "Backup completed: $BACKUP_FILE"
EOF

chmod +x ~/backup-tms-db.sh

# 매일 새벽 2시 백업 (crontab 추가)
crontab -e
# 0 2 * * * /Users/nit/backup-tms-db.sh >> /Users/nit/tms-backups/backup.log 2>&1

# 백업 테스트
~/backup-tms-db.sh
```

### 10.5 복구 절차

```bash
# 백업에서 데이터베이스 복구
psql -U tms_app -d tms -f /Users/nit/tms-backups/tms_backup_20260216_020000.sql

# PM2 재시작
pm2 restart tms
```

---

## 부록 A: 전체 설치 스크립트

**자동 설치 스크립트** (`install-tms.sh`):

```bash
#!/bin/bash
set -e

echo "=== Narae TMS v2.0 macOS 배포 스크립트 ==="
echo ""

# 1. Homebrew 확인
if ! command -v brew &> /dev/null; then
    echo "Homebrew를 설치합니다..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# 2. PostgreSQL 설치
echo "PostgreSQL 17 설치 중..."
brew install postgresql@17
brew services start postgresql@17

# 3. Node.js 설치
echo "Node.js 설치 중..."
brew install node@20

# 4. Nginx 설치
echo "Nginx 설치 중..."
brew install nginx

# 5. Certbot 설치
echo "Certbot 설치 중..."
brew install certbot

# 6. PM2 설치
echo "PM2 설치 중..."
npm install -g pm2

echo ""
echo "✅ 기본 패키지 설치 완료!"
echo ""
echo "다음 단계:"
echo "1. Oracle Instant Client 설치 (/opt/oracle/instantclient)"
echo "2. PostgreSQL 데이터베이스 생성 (tms, tms_app)"
echo "3. SSL 인증서 발급 (sudo certbot certonly --standalone -d sqltms.info)"
echo "4. 프로젝트 설정 (.env.local)"
echo "5. 나머지 설정은 매뉴얼을 따라 진행하세요."
```

사용법:
```bash
curl -o install-tms.sh https://raw.githubusercontent.com/naraeit77/tms/main/scripts/install-tms.sh
chmod +x install-tms.sh
./install-tms.sh
```

---

## 부록 B: 서비스 관리 명령어 요약

### PostgreSQL
```bash
brew services start postgresql@17    # 시작
brew services stop postgresql@17     # 중지
brew services restart postgresql@17  # 재시작
psql -U tms_app -d tms               # 접속
```

### Nginx
```bash
sudo nginx                                        # 시작
sudo nginx -s quit                                # 정상 종료
sudo nginx -s reload                              # 설정 리로드
sudo nginx -t                                     # 설정 검증
sudo launchctl load /Library/LaunchDaemons/com.nginx.plist    # 자동 시작 활성화
sudo launchctl unload /Library/LaunchDaemons/com.nginx.plist  # 자동 시작 비활성화
```

### PM2
```bash
pm2 start ecosystem.config.js --env production   # 시작
pm2 stop tms                                     # 중지
pm2 restart tms                                  # 재시작
pm2 reload tms                                   # 무중단 재시작
pm2 delete tms                                   # 삭제
pm2 list                                         # 목록
pm2 logs tms                                     # 로그
pm2 monit                                        # 모니터링
pm2 save                                         # 프로세스 저장
```

---

## 부록 C: 체크리스트

### 배포 전 체크리스트

- [ ] macOS 버전 확인 (12.0 이상)
- [ ] Homebrew 설치
- [ ] 도메인 DNS A 레코드 설정
- [ ] 공유기 포트포워딩 설정 (80, 443)
- [ ] Mac 고정 IP 설정 (공유기에서)

### 설치 체크리스트

- [ ] PostgreSQL 17 설치 및 시작
- [ ] PostgreSQL 데이터베이스/사용자 생성
- [ ] Node.js 20 설치
- [ ] Oracle Instant Client 설치 및 환경 변수 설정
- [ ] TMS 프로젝트 클론/복사
- [ ] npm install 완료
- [ ] .env.local 설정 완료
- [ ] npm run build 성공
- [ ] Nginx 설치
- [ ] SSL 인증서 발급 (Let's Encrypt)
- [ ] Nginx 설정 파일 작성
- [ ] PM2 설치
- [ ] ecosystem.config.js 수정

### 자동 시작 체크리스트

- [ ] PostgreSQL 자동 시작 (brew services)
- [ ] Nginx LaunchDaemon 등록
- [ ] PM2 startup 설정
- [ ] PM2 save 완료
- [ ] SSL 자동 갱신 crontab 등록

### 배포 후 확인 체크리스트

- [ ] https://sqltms.info 접속 확인
- [ ] 로그인 기능 확인
- [ ] Oracle 연결 테스트
- [ ] SQL 모니터링 기능 확인
- [ ] Mac 재부팅 후 자동 시작 확인
- [ ] PM2 로그 확인 (에러 없음)
- [ ] Nginx 로그 확인 (403 CVE 차단 정상)

---

## 문의 및 지원

- **개발사**: 주식회사 나래정보기술
- **제품명**: Narae TMS v2.0
- **문서 버전**: 2.0.0
- **최종 업데이트**: 2026-02-16

---

**배포 성공을 기원합니다! 🎉**
