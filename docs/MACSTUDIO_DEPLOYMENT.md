# Narae TMS v2.0 - MacStudio 배포 가이드

MacStudio (Apple Silicon) 환경에서 PM2 + Nginx를 사용하여 Narae TMS v2.0을 배포하는 완벽한 가이드입니다.

---

## 목차

1. [시스템 요구사항](#1-시스템-요구사항)
2. [사전 준비](#2-사전-준비)
3. [소프트웨어 설치](#3-소프트웨어-설치)
4. [Oracle Instant Client 설치](#4-oracle-instant-client-설치-apple-silicon)
5. [프로젝트 배포](#5-프로젝트-배포)
6. [PM2 설정](#6-pm2-설정)
7. [Nginx 설정](#7-nginx-설정)
8. [SSL 인증서 설정](#8-ssl-인증서-설정)
9. [macOS 방화벽 설정](#9-macos-방화벽-설정)
10. [PM2 자동 시작 설정](#10-pm2-자동-시작-설정-launchd)
11. [모니터링 및 로그](#11-모니터링-및-로그)
12. [배포 스크립트](#12-배포-스크립트)
13. [트러블슈팅](#13-트러블슈팅)
14. [유지보수](#14-유지보수)

---

## 1. 시스템 요구사항

### MacStudio 사양 확인

```bash
# 시스템 정보 확인
system_profiler SPHardwareDataType

# macOS 버전 확인
sw_vers

# 아키텍처 확인 (arm64 확인)
uname -m
```

### 최소 요구사항
- **Chip**: Apple M1 이상
- **RAM**: 16GB 이상 권장
- **Storage**: 50GB 이상 여유 공간
- **macOS**: Ventura (13.0) 이상 권장

### 권장 사양
- **Chip**: Apple M1 Pro/Max 또는 M2 시리즈
- **RAM**: 32GB 이상
- **Storage**: 100GB SSD
- **Network**: 1Gbps Ethernet

---

## 2. 사전 준비

### 2.1 Xcode Command Line Tools 설치

```bash
# Command Line Tools 설치
xcode-select --install

# 설치 확인
xcode-select -p
# 출력: /Library/Developer/CommandLineTools
```

### 2.2 Homebrew 설치

```bash
# Homebrew 설치
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# PATH 설정 (Apple Silicon)
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"

# 설치 확인
brew --version
```

### 2.3 필수 도구 설치

```bash
# Git, wget, curl 등 기본 도구
brew install git wget curl vim

# 버전 확인
git --version
```

### 2.4 배포 사용자 설정 (선택사항)

보안을 위해 별도의 배포 사용자를 생성할 수 있습니다:

```bash
# 시스템 환경설정 > 사용자 및 그룹에서 사용자 추가
# 또는 기존 사용자 사용
```

---

## 3. 소프트웨어 설치

### 3.1 Node.js 20.x LTS 설치

```bash
# Node.js 설치 (LTS 버전)
brew install node@20

# PATH에 추가
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zprofile
source ~/.zprofile

# 버전 확인
node --version  # v20.x.x
npm --version   # 10.x.x
```

#### 대안: nvm 사용 (권장)

```bash
# nvm 설치
brew install nvm

# nvm 디렉토리 생성
mkdir ~/.nvm

# 환경 변수 설정
cat >> ~/.zprofile << 'EOF'
export NVM_DIR="$HOME/.nvm"
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"
[ -s "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm" ] && \. "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm"
EOF

source ~/.zprofile

# Node.js 20 설치
nvm install 20
nvm use 20
nvm alias default 20
```

### 3.2 PM2 전역 설치

```bash
# PM2 설치
npm install -g pm2

# 버전 확인
pm2 --version

# PM2 로그 로테이션 모듈 설치
pm2 install pm2-logrotate

# 로그 로테이션 설정
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

### 3.3 Nginx 설치

```bash
# Nginx 설치
brew install nginx

# 설치 확인
nginx -v

# Nginx 설정 파일 위치 확인
brew info nginx
# 설정 파일: /opt/homebrew/etc/nginx/nginx.conf
# 문서 루트: /opt/homebrew/var/www
```

### 3.4 Redis 설치 (현재 미사용 - 향후 확장용)

> **참고**: 현재 TMS v2.0은 **Redis를 사용하지 않습니다**. 아래 내용은 향후 캐싱 기능 확장 시 참고용입니다. 현재 배포 시 이 단계는 **건너뛰어도 됩니다**.

```bash
# (향후 캐싱 기능 구현 시에만 필요)
# Redis 설치
brew install redis

# Redis 서비스 시작
brew services start redis

# 연결 테스트
redis-cli ping
# 응답: PONG
```

---

## 4. Oracle Instant Client 설치 (Apple Silicon)

### 4.1 Oracle Instant Client 다운로드

Apple Silicon(ARM64)용 Oracle Instant Client를 다운로드합니다:

1. [Oracle Instant Client Downloads](https://www.oracle.com/database/technologies/instant-client/macos-arm64-downloads.html) 접속
2. 다음 패키지 다운로드:
   - `instantclient-basic-macos.arm64-23.x.0.0.0dbru.dmg`
   - `instantclient-sqlplus-macos.arm64-23.x.0.0.0dbru.dmg` (선택)

### 4.2 설치 진행

```bash
# 다운로드 디렉토리로 이동
cd ~/Downloads

# DMG 마운트 및 설치
# 1. basic DMG 더블클릭하여 마운트
# 2. 내용물을 /opt/oracle 디렉토리로 복사

# 설치 디렉토리 생성
sudo mkdir -p /opt/oracle

# DMG에서 instantclient 폴더 복사
sudo cp -R /Volumes/instantclient-basic-macos.arm64-23.6.0.24.10dbru/instantclient_23_6 /opt/oracle/

# 권한 설정
sudo chmod -R 755 /opt/oracle/instantclient_23_6

# DMG 언마운트
hdiutil detach /Volumes/instantclient-basic-macos.arm64-23.6.0.24.10dbru
```

### 4.3 환경 변수 설정

```bash
# ~/.zprofile에 Oracle 환경 변수 추가
cat >> ~/.zprofile << 'EOF'

# Oracle Instant Client 환경 변수
export ORACLE_HOME=/opt/oracle/instantclient_23_6
export DYLD_LIBRARY_PATH=$ORACLE_HOME:$DYLD_LIBRARY_PATH
export PATH=$ORACLE_HOME:$PATH
export TNS_ADMIN=$ORACLE_HOME/network/admin
EOF

# 환경 변수 적용
source ~/.zprofile
```

### 4.4 TNS 설정 (대부분 불필요)

> **참고**: TMS는 **Easy Connect 방식**(`host:port/service_name`)을 사용하므로 tnsnames.ora 설정이 필요 없습니다. 아래 설정은 RAC 환경, 복잡한 failover 구성, 또는 TNS 별칭을 사용해야 하는 특수한 경우에만 필요합니다.

```bash
# TNS 디렉토리 생성 (필요한 경우에만)
sudo mkdir -p $ORACLE_HOME/network/admin

# tnsnames.ora 파일 생성
sudo nano $ORACLE_HOME/network/admin/tnsnames.ora
```

tnsnames.ora 예시 (RAC 환경):
```
MYDB =
  (DESCRIPTION =
    (ADDRESS_LIST =
      (LOAD_BALANCE = ON)
      (FAILOVER = ON)
      (ADDRESS = (PROTOCOL = TCP)(HOST = rac-node1.example.com)(PORT = 1521))
      (ADDRESS = (PROTOCOL = TCP)(HOST = rac-node2.example.com)(PORT = 1521))
    )
    (CONNECT_DATA =
      (SERVER = DEDICATED)
      (SERVICE_NAME = ORCL)
    )
  )
```

**일반적인 단일 DB 연결은 TMS UI에서 직접 설정합니다** (호스트, 포트, 서비스명 입력).

### 4.5 설치 확인

```bash
# 라이브러리 확인
ls -la $ORACLE_HOME/*.dylib

# Node.js oracledb 모듈 테스트
node -e "const oracledb = require('oracledb'); console.log(oracledb.versionString);"
```

---

## 5. 프로젝트 배포

### 5.1 프로젝트 디렉토리 생성

```bash
# 애플리케이션 디렉토리 생성
sudo mkdir -p /var/www/tms
sudo chown -R $(whoami):staff /var/www/tms

# 로그 디렉토리 생성
sudo mkdir -p /var/log/tms
sudo chown -R $(whoami):staff /var/log/tms
```

### 5.2 Git 저장소 클론

```bash
# 프로젝트 클론
cd /var/www
git clone https://github.com/your-repo/tms.git tms
cd tms

# 또는 기존 프로젝트 복사
# cp -R ~/your-project-path /var/www/tms
```

### 5.3 환경 변수 설정

```bash
# 환경 변수 파일 생성
cp env.production.copy.example .env.production
nano .env.production
```

`.env.production` 필수 설정:

```bash
# ============================================
# Narae TMS v2.0 Production Environment
# MacStudio Deployment
# ============================================

# Node 환경
NODE_ENV=production
PORT=3000

# Supabase 설정
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# NextAuth 설정
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=생성된-시크릿-키  # openssl rand -base64 32

# 암호화 키
ENCRYPTION_KEY=64자-hex-암호화-키  # openssl rand -hex 32

# Oracle 설정 (MacStudio Apple Silicon)
ORACLE_THICK_MODE=true
ORACLE_CLIENT_LIB_DIR=/opt/oracle/instantclient_23_6

# LLM 설정 (Ollama 사용 시)
LLM_BASE_URL=http://localhost:11434
LLM_MODEL_NAME=hf.co/Mungert/kanana-1.5-8b-instruct-2505-GGUF:Q4_K_M
LLM_API_TYPE=ollama
LLM_MAX_TOKENS=4096
LLM_TEMPERATURE=0.3
LLM_TIMEOUT=120000

# 기능 플래그
FEATURE_AI_TUNING_GUIDE=true
FEATURE_AI_TUNING_ADVISOR=false

# 성능 설정
SQL_COLLECTION_INTERVAL=300
METRICS_COLLECTION_INTERVAL=60

# Redis (현재 미사용 - 향후 캐싱 기능 구현 시 사용 예정)
# REDIS_URL=redis://localhost:6379
```

### 5.4 의존성 설치

```bash
cd /var/www/tms

# 의존성 설치 (clean install)
npm ci

# 또는 일반 설치
npm install
```

### 5.5 프로덕션 빌드

```bash
# 환경 변수 로드 확인
cat .env.production

# 프로덕션 빌드
npm run build

# 빌드 결과 확인
ls -la .next/
```

#### 빌드 오류 발생 시

```bash
# 캐시 삭제 후 재빌드
rm -rf .next
rm -rf node_modules/.cache
npm run build

# 메모리 부족 시
NODE_OPTIONS='--max-old-space-size=4096' npm run build
```

---

## 6. PM2 설정

### 6.1 PM2 Ecosystem 파일 생성

`ecosystem.config.js` 파일을 MacStudio에 맞게 수정합니다:

```bash
nano /var/www/tms/ecosystem.config.js
```

```javascript
/**
 * PM2 Ecosystem Configuration for Narae TMS v2.0
 * MacStudio (Apple Silicon) Production Environment
 */

module.exports = {
  apps: [
    {
      name: 'tms',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: '/var/www/tms',

      // 클러스터 모드 - MacStudio 코어 수에 맞게 조정
      // M1: 8 코어, M1 Pro: 10 코어, M1 Max: 10 코어, M2: 8 코어
      instances: 4, // 또는 'max'로 설정
      exec_mode: 'cluster',

      // 환경 변수
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        // Oracle Instant Client (Apple Silicon)
        DYLD_LIBRARY_PATH: '/opt/oracle/instantclient_23_6',
        ORACLE_HOME: '/opt/oracle/instantclient_23_6',
        TNS_ADMIN: '/opt/oracle/instantclient_23_6/network/admin',
      },

      // 메모리 및 재시작 설정
      max_memory_restart: '2G',
      min_uptime: '10s',
      max_restarts: 10,
      autorestart: true,

      // 로그 설정
      error_file: '/var/log/tms/pm2-error.log',
      out_file: '/var/log/tms/pm2-out.log',
      log_file: '/var/log/tms/pm2-combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Watch 설정 (Production에서는 false)
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.next', '.git'],

      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 3000,
      wait_ready: true,

      // 메모리 최적화
      node_args: '--max-old-space-size=2048',

      // 소스 맵 비활성화 (성능 향상)
      source_map_support: false,
    },
  ],
};
```

### 6.2 PM2로 애플리케이션 시작

```bash
cd /var/www/tms

# 애플리케이션 시작
pm2 start ecosystem.config.js --env production

# 상태 확인
pm2 status

# 로그 확인
pm2 logs tms
```

### 6.3 PM2 유용한 명령어

```bash
# 상태 확인
pm2 status
pm2 list

# 로그 보기
pm2 logs tms
pm2 logs tms --lines 100
pm2 logs tms --err

# 실시간 모니터링
pm2 monit

# 재시작
pm2 restart tms

# 무중단 재시작 (Zero-downtime)
pm2 reload tms

# 중지
pm2 stop tms

# 삭제
pm2 delete tms

# 상세 정보
pm2 describe tms

# 환경 변수 확인
pm2 env tms
```

---

## 7. Nginx 설정

### 7.1 Nginx 설정 파일 생성

```bash
# Nginx 설정 디렉토리 확인
ls /opt/homebrew/etc/nginx/

# 서버 설정 디렉토리 생성
mkdir -p /opt/homebrew/etc/nginx/servers

# TMS 설정 파일 생성
nano /opt/homebrew/etc/nginx/servers/tms.conf
```

### 7.2 Nginx 설정 내용

```nginx
# Narae TMS v2.0 - MacStudio Nginx Configuration
# 파일: /opt/homebrew/etc/nginx/servers/tms.conf

# 캐시 설정
proxy_cache_path /opt/homebrew/var/cache/nginx levels=1:2 keys_zone=STATIC:10m inactive=7d use_temp_path=off;

# Upstream 설정
upstream tms_backend {
    server 127.0.0.1:3000;
    keepalive 32;
}

# HTTP 서버 (HTTPS 리다이렉트 또는 로컬 개발용)
server {
    listen 80;
    listen [::]:80;
    server_name localhost your-domain.com;

    # Let's Encrypt 인증용 (외부 도메인 사용 시)
    location /.well-known/acme-challenge/ {
        root /opt/homebrew/var/www/certbot;
    }

    # 로컬 환경에서는 바로 프록시
    # 외부 도메인 사용 시 HTTPS로 리다이렉트
    # return 301 https://$host$request_uri;

    # 로컬 개발/테스트용 설정
    location / {
        proxy_pass http://tms_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# HTTPS 서버 (SSL 인증서 설정 후 활성화)
# server {
#     listen 443 ssl http2;
#     listen [::]:443 ssl http2;
#     server_name your-domain.com;
#
#     # SSL 인증서
#     ssl_certificate /opt/homebrew/etc/nginx/ssl/cert.pem;
#     ssl_certificate_key /opt/homebrew/etc/nginx/ssl/key.pem;
#
#     # SSL 설정
#     ssl_protocols TLSv1.2 TLSv1.3;
#     ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
#     ssl_prefer_server_ciphers off;
#     ssl_session_cache shared:SSL:10m;
#     ssl_session_timeout 10m;
#
#     # 이하 location 블록은 HTTP와 동일
# }

# ========================================
# 공통 Location 블록
# ========================================

server {
    listen 8080;
    server_name localhost;

    # 로그 설정
    access_log /opt/homebrew/var/log/nginx/tms-access.log;
    error_log /opt/homebrew/var/log/nginx/tms-error.log warn;

    # 보안 헤더
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Gzip 압축
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 1024;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml
        image/svg+xml;

    # 클라이언트 요청 크기
    client_max_body_size 10M;
    client_body_buffer_size 128k;

    # 타임아웃 설정
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;

    # Next.js 정적 파일
    location /_next/static {
        proxy_cache STATIC;
        proxy_pass http://tms_backend;
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header X-Cache-Status $upstream_cache_status;
    }

    # Next.js 이미지 최적화
    location /_next/image {
        proxy_pass http://tms_backend;
        proxy_cache STATIC;
        proxy_cache_valid 200 7d;
        add_header X-Cache-Status $upstream_cache_status;
    }

    # API 라우트
    location /api {
        proxy_pass http://tms_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_no_cache 1;

        # Oracle 쿼리 타임아웃 고려
        proxy_read_timeout 90s;
    }

    # Health check
    location /health {
        proxy_pass http://tms_backend;
        access_log off;
        proxy_connect_timeout 3s;
        proxy_read_timeout 3s;
    }

    # 메인 애플리케이션
    location / {
        proxy_pass http://tms_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # 숨김 파일 차단
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
```

### 7.3 Nginx 메인 설정 수정

```bash
# 메인 설정 파일 수정
nano /opt/homebrew/etc/nginx/nginx.conf
```

http 블록 마지막에 추가:
```nginx
http {
    # ... 기존 설정 ...

    # 서버 설정 포함
    include /opt/homebrew/etc/nginx/servers/*.conf;
}
```

### 7.4 캐시 디렉토리 생성

```bash
# Nginx 캐시 디렉토리 생성
sudo mkdir -p /opt/homebrew/var/cache/nginx
sudo chown -R $(whoami):staff /opt/homebrew/var/cache/nginx

# Let's Encrypt 인증용 디렉토리
sudo mkdir -p /opt/homebrew/var/www/certbot
```

### 7.5 Nginx 시작

```bash
# 설정 테스트
nginx -t

# Nginx 시작
brew services start nginx

# 또는 수동 시작
nginx

# 상태 확인
brew services list

# Nginx 재시작
brew services restart nginx

# 설정 리로드
nginx -s reload
```

---

## 8. SSL 인증서 설정

### 8.1 로컬 개발용 (mkcert)

```bash
# mkcert 설치
brew install mkcert

# 로컬 CA 설치
mkcert -install

# 인증서 생성
mkdir -p /opt/homebrew/etc/nginx/ssl
cd /opt/homebrew/etc/nginx/ssl
mkcert localhost 127.0.0.1 ::1

# 파일명 변경
mv localhost+2.pem cert.pem
mv localhost+2-key.pem key.pem
```

### 8.2 프로덕션용 (Let's Encrypt)

외부 도메인을 사용하는 경우:

```bash
# Certbot 설치
brew install certbot

# 인증서 발급 (웹서버 중지 필요)
sudo certbot certonly --standalone -d your-domain.com

# 또는 Nginx 플러그인 사용
sudo certbot --nginx -d your-domain.com

# 자동 갱신 테스트
sudo certbot renew --dry-run
```

### 8.3 자체 서명 인증서 (테스트용)

```bash
# 자체 서명 인증서 생성
mkdir -p /opt/homebrew/etc/nginx/ssl
cd /opt/homebrew/etc/nginx/ssl

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout key.pem \
  -out cert.pem \
  -subj "/C=KR/ST=Seoul/L=Seoul/O=Narae/CN=localhost"
```

---

## 9. macOS 방화벽 설정

### 9.1 내장 방화벽 설정

```bash
# 방화벽 상태 확인
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate

# 방화벽 활성화
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on

# 스텔스 모드 활성화
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setstealthmode on

# Node.js 허용
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /opt/homebrew/bin/node

# Nginx 허용
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /opt/homebrew/bin/nginx
```

### 9.2 pfctl 방화벽 (고급)

```bash
# pf 규칙 파일 생성
sudo nano /etc/pf.anchors/tms

# 규칙 내용
pass in on en0 proto tcp from any to any port 80
pass in on en0 proto tcp from any to any port 443
pass in on en0 proto tcp from any to any port 8080

# pf.conf에 앵커 추가
sudo nano /etc/pf.conf
# anchor "tms"
# load anchor "tms" from "/etc/pf.anchors/tms"

# pf 리로드
sudo pfctl -f /etc/pf.conf
```

### 9.3 포트 확인

```bash
# 사용 중인 포트 확인
sudo lsof -i :3000
sudo lsof -i :80
sudo lsof -i :443
sudo lsof -i :8080

# 네트워크 연결 확인
netstat -an | grep LISTEN
```

---

## 10. PM2 자동 시작 설정 (launchd)

### 10.1 PM2 startup 명령어

```bash
# PM2 startup 스크립트 생성
pm2 startup

# 출력된 명령어 복사하여 실행
# 예: sudo env PATH=$PATH:/opt/homebrew/bin pm2 startup launchd -u username --hp /Users/username
```

### 10.2 수동 launchd 설정

```bash
# launchd plist 파일 생성
nano ~/Library/LaunchAgents/com.pm2.tms.plist
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.pm2.tms</string>

    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/pm2</string>
        <string>resurrect</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <false/>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>PM2_HOME</key>
        <string>/Users/YOUR_USERNAME/.pm2</string>
        <key>DYLD_LIBRARY_PATH</key>
        <string>/opt/oracle/instantclient_23_6</string>
    </dict>

    <key>StandardOutPath</key>
    <string>/var/log/tms/pm2-launchd.log</string>

    <key>StandardErrorPath</key>
    <string>/var/log/tms/pm2-launchd-error.log</string>
</dict>
</plist>
```

### 10.3 launchd 서비스 등록

```bash
# PM2 프로세스 저장
pm2 save

# launchd 서비스 로드
launchctl load ~/Library/LaunchAgents/com.pm2.tms.plist

# 상태 확인
launchctl list | grep pm2

# 서비스 제거 (필요 시)
launchctl unload ~/Library/LaunchAgents/com.pm2.tms.plist
```

### 10.4 재부팅 테스트

```bash
# 재부팅 전 PM2 상태 저장
pm2 save

# 재부팅
sudo reboot

# 재부팅 후 확인
pm2 status
pm2 logs tms
```

---

## 11. 모니터링 및 로그

### 11.1 PM2 모니터링

```bash
# 실시간 모니터링 대시보드
pm2 monit

# 웹 기반 모니터링 (PM2 Plus)
pm2 plus

# 상태 확인
pm2 status
pm2 describe tms

# CPU/메모리 사용량
pm2 prettylist
```

### 11.2 로그 확인

```bash
# PM2 로그
pm2 logs tms
pm2 logs tms --lines 200
pm2 logs tms --err

# 로그 파일 직접 확인
tail -f /var/log/tms/pm2-combined.log
tail -f /var/log/tms/pm2-error.log

# Nginx 로그
tail -f /opt/homebrew/var/log/nginx/tms-access.log
tail -f /opt/homebrew/var/log/nginx/tms-error.log
```

### 11.3 시스템 모니터링

```bash
# CPU/메모리 사용량
top -o cpu
htop  # brew install htop

# 디스크 사용량
df -h

# 네트워크 연결
netstat -an | grep LISTEN
lsof -i -P | grep LISTEN

# 프로세스 확인
ps aux | grep node
ps aux | grep nginx
```

### 11.4 Health Check 스크립트

```bash
# health-check.sh 생성
nano /var/www/tms/scripts/health-check.sh
```

```bash
#!/bin/bash

# TMS Health Check Script

echo "=== TMS Health Check ==="
echo "Date: $(date)"
echo ""

# PM2 상태
echo "--- PM2 Status ---"
pm2 status

# 애플리케이션 응답
echo ""
echo "--- Application Response ---"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\nResponse Time: %{time_total}s\n" http://localhost:3000/health

# 메모리 사용량
echo ""
echo "--- Memory Usage ---"
pm2 describe tms | grep -E "memory|cpu"

# Nginx 상태
echo ""
echo "--- Nginx Status ---"
if pgrep nginx > /dev/null; then
    echo "Nginx is running"
else
    echo "Nginx is NOT running"
fi

echo ""
echo "=== Check Complete ==="
```

```bash
chmod +x /var/www/tms/scripts/health-check.sh
```

---

## 12. 배포 스크립트

### 12.1 MacStudio용 배포 스크립트

```bash
nano /var/www/tms/deploy-macstudio.sh
```

```bash
#!/bin/bash

################################################################################
# Narae TMS v2.0 - MacStudio 자동 배포 스크립트
# Environment: macOS (Apple Silicon)
################################################################################

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 설정 변수
APP_NAME="tms"
APP_DIR="/var/www/tms"
LOG_DIR="/var/log/tms"
BACKUP_DIR="/var/backups/tms"

# 로그 함수
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo ""
echo "=========================================="
echo "  Narae TMS v2.0 - MacStudio Deployment"
echo "=========================================="
echo ""

# 1. 디렉토리 확인
if [ ! -d "$APP_DIR" ]; then
    log_error "Application directory not found: $APP_DIR"
    exit 1
fi

cd $APP_DIR
log_info "Working directory: $APP_DIR"

# 2. Git 저장소 확인
if [ ! -d ".git" ]; then
    log_error "Not a git repository!"
    exit 1
fi

# 3. 현재 브랜치 확인
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
log_info "Current branch: $CURRENT_BRANCH"

# 4. 백업 생성
log_info "Creating backup..."
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

if [ -d ".next" ]; then
    BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.tar.gz"
    tar -czf $BACKUP_FILE .next .env.production 2>/dev/null || true
    log_success "Backup created: $BACKUP_FILE"
fi

# 5. Git 변경사항 처리
if [[ -n $(git status -s) ]]; then
    log_warning "Uncommitted changes detected, stashing..."
    git stash save "Auto-stash before deployment $TIMESTAMP"
fi

# 6. 최신 코드 가져오기
log_info "Pulling latest code..."
git fetch origin
git pull origin $CURRENT_BRANCH
log_success "Code updated"

# 7. 의존성 설치
log_info "Installing dependencies..."
npm ci
log_success "Dependencies installed"

# 8. 환경 변수 확인
if [ ! -f ".env.production" ]; then
    log_error ".env.production file not found!"
    exit 1
fi

# 9. 프로덕션 빌드
log_info "Building application..."
npm run build
log_success "Build completed"

# 10. PM2 재시작
log_info "Restarting PM2 process..."
if pm2 list | grep -q $APP_NAME; then
    pm2 reload ecosystem.config.js --env production
    log_success "Application reloaded"
else
    pm2 start ecosystem.config.js --env production
    log_success "Application started"
fi

# 11. PM2 저장
pm2 save
log_success "PM2 process saved"

# 12. Nginx 리로드
log_info "Reloading Nginx..."
nginx -t && nginx -s reload
log_success "Nginx reloaded"

# 13. Health check
log_info "Performing health check..."
sleep 3
if curl -s -f http://localhost:3000/health > /dev/null 2>&1; then
    log_success "Health check passed"
else
    log_warning "Health check failed or endpoint not available"
fi

# 14. 배포 정보 저장
cat > $APP_DIR/.deploy-info << EOF
Deployment Information
======================
Date: $(date '+%Y-%m-%d %H:%M:%S')
User: $USER
Branch: $CURRENT_BRANCH
Commit: $(git rev-parse --short HEAD)
Node Version: $(node --version)
PM2 Version: $(pm2 --version)
EOF

# 15. 상태 출력
echo ""
pm2 status

# 16. 오래된 백업 정리
find $BACKUP_DIR -name "backup_*.tar.gz" -type f -mtime +30 -delete 2>/dev/null || true

echo ""
echo "=========================================="
log_success "Deployment completed! 🚀"
echo "=========================================="
echo ""
echo "Useful commands:"
echo "  pm2 logs $APP_NAME       - View logs"
echo "  pm2 monit                - Monitor"
echo "  pm2 reload $APP_NAME     - Reload"
echo ""
```

```bash
chmod +x /var/www/tms/deploy-macstudio.sh
```

### 12.2 빠른 재시작 스크립트

```bash
nano /var/www/tms/scripts/quick-restart.sh
```

```bash
#!/bin/bash
# 빠른 재시작 (빌드 없이)

cd /var/www/tms
pm2 reload tms --env production
pm2 status
```

```bash
chmod +x /var/www/tms/scripts/quick-restart.sh
```

---

## 13. 트러블슈팅

### 13.1 애플리케이션 시작 실패

```bash
# PM2 에러 로그 확인
pm2 logs tms --err --lines 100

# 프로세스 상태 확인
pm2 describe tms

# 포트 충돌 확인
lsof -i :3000
# 충돌 시 프로세스 종료
kill -9 <PID>

# 수동 시작 테스트
cd /var/www/tms
npm start
```

### 13.2 Oracle 연결 오류

```bash
# 환경 변수 확인
echo $DYLD_LIBRARY_PATH
echo $ORACLE_HOME

# 라이브러리 확인
ls -la /opt/oracle/instantclient_23_6/*.dylib

# Node.js에서 테스트
node -e "
const oracledb = require('oracledb');
console.log('oracledb version:', oracledb.versionString);
try {
  oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_23_6' });
  console.log('Oracle client initialized');
} catch (err) {
  console.error('Error:', err);
}
"
```

### 13.3 Nginx 502 Bad Gateway

```bash
# PM2 프로세스 확인
pm2 status

# 애플리케이션 직접 접속 테스트
curl http://localhost:3000

# Nginx 에러 로그
tail -f /opt/homebrew/var/log/nginx/tms-error.log

# Nginx 설정 테스트
nginx -t

# Nginx 재시작
brew services restart nginx
```

### 13.4 메모리 부족

```bash
# 현재 메모리 사용량
vm_stat
top -o mem

# PM2 인스턴스 수 줄이기
# ecosystem.config.js에서 instances: 2로 변경

# Node.js 메모리 제한 조정
# node_args: '--max-old-space-size=1024'

# PM2 재시작
pm2 reload tms
```

### 13.5 빌드 오류

```bash
# 캐시 삭제
rm -rf .next
rm -rf node_modules/.cache

# node_modules 재설치
rm -rf node_modules
npm ci

# 메모리 증가 후 빌드
NODE_OPTIONS='--max-old-space-size=4096' npm run build
```

### 13.6 PM2 자동 시작 안 됨

```bash
# launchd 서비스 상태 확인
launchctl list | grep pm2

# 서비스 리로드
launchctl unload ~/Library/LaunchAgents/com.pm2.tms.plist
launchctl load ~/Library/LaunchAgents/com.pm2.tms.plist

# PM2 dump 파일 확인
ls -la ~/.pm2/dump.pm2

# PM2 저장 재실행
pm2 save
```

---

## 14. 유지보수

### 14.1 정기 작업

```bash
# 주간 작업
# - 로그 확인 및 정리
pm2 flush

# - 의존성 보안 검사
npm audit

# - 디스크 공간 확인
df -h
```

### 14.2 업데이트

```bash
# Node.js 업데이트
brew upgrade node@20

# PM2 업데이트
npm update -g pm2

# Nginx 업데이트
brew upgrade nginx

# 애플리케이션 업데이트
./deploy-macstudio.sh
```

### 14.3 백업

```bash
# 수동 백업
cd /var/www/tms
tar -czf /var/backups/tms/manual_$(date +%Y%m%d).tar.gz \
  .next \
  .env.production \
  ecosystem.config.js

# 자동 백업 (cron)
crontab -e
# 매일 새벽 2시 백업
0 2 * * * cd /var/www/tms && tar -czf /var/backups/tms/daily_$(date +\%Y\%m\%d).tar.gz .next .env.production
```

### 14.4 로그 관리

```bash
# PM2 로그 로테이션 설정
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'

# Nginx 로그 로테이션
# macOS에서는 newsyslog 사용
sudo nano /etc/newsyslog.d/nginx.conf
```

```
# logfilename          [owner:group]    mode count size when  flags [/pid_file] [sig_num]
/opt/homebrew/var/log/nginx/*.log    644  7     *    @T00  GZ
```

---

## 부록: 빠른 참조

### 자주 사용하는 명령어

```bash
# 배포
./deploy-macstudio.sh

# PM2 관리
pm2 status
pm2 logs tms
pm2 monit
pm2 reload tms

# Nginx 관리
nginx -t
brew services restart nginx

# 로그 확인
tail -f /var/log/tms/pm2-combined.log
tail -f /opt/homebrew/var/log/nginx/tms-error.log

# Health check
curl http://localhost:3000/health
```

### 주요 경로

| 항목 | 경로 |
|------|------|
| 애플리케이션 | `/var/www/tms` |
| 로그 | `/var/log/tms` |
| PM2 설정 | `~/.pm2` |
| Nginx 설정 | `/opt/homebrew/etc/nginx` |
| Oracle Client | `/opt/oracle/instantclient_23_6` |
| 백업 | `/var/backups/tms` |

### 포트 정보

| 서비스 | 포트 | 비고 |
|--------|------|------|
| Next.js | 3000 | 필수 |
| Nginx HTTP | 80 | 필수 |
| Nginx HTTPS | 443 | SSL 사용 시 |
| Nginx 대체 | 8080 | 선택 |
| Ollama | 11434 | LLM 사용 시 |
| Redis | 6379 | 현재 미사용 |

---

**작성일**: 2026-02-06
**버전**: v2.0
**대상 환경**: MacStudio (Apple Silicon)
**작성자**: 주식회사 나래정보기술
