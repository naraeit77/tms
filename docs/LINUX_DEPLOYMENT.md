# Narae TMS v2.0 Linux 배포 가이드

## 목차
1. [시스템 요구사항](#1-시스템-요구사항)
2. [서버 환경 구성](#2-서버-환경-구성)
3. [Oracle Instant Client 설치](#3-oracle-instant-client-설치)
4. [Ollama 및 Kanana 모델 설치](#4-ollama-및-kanana-모델-설치)
5. [Node.js 및 PM2 설치](#5-nodejs-및-pm2-설치)
6. [프로젝트 배포](#6-프로젝트-배포)
7. [환경변수 설정](#7-환경변수-설정)
8. [PM2로 서비스 시작](#8-pm2로-서비스-시작)
9. [Nginx 리버스 프록시 설정](#9-nginx-리버스-프록시-설정)
10. [SSL 인증서 설정](#10-ssl-인증서-설정)
11. [방화벽 설정](#11-방화벽-설정)
12. [모니터링 및 로그 관리](#12-모니터링-및-로그-관리)
13. [트러블슈팅](#13-트러블슈팅)

---

## 1. 시스템 요구사항

### 하드웨어 최소 사양
| 항목 | 최소 | 권장 |
|------|------|------|
| CPU | 4 Core | 8 Core |
| RAM | 8 GB | 16 GB (LLM 사용 시) |
| Disk | 50 GB SSD | 100 GB NVMe |
| GPU | - | NVIDIA GPU (LLM 가속용) |

### 소프트웨어 요구사항
- OS: Rocky Linux 8/9, Ubuntu 22.04 LTS, CentOS Stream 8/9
- Node.js: v20.x LTS 이상
- Oracle Instant Client: 21c
- Ollama: 최신 버전
- PM2: v5.x 이상
- Nginx: 1.20 이상

---

## 2. 서버 환경 구성

### 2.1 시스템 업데이트

```bash
# Rocky Linux / CentOS
sudo dnf update -y
sudo dnf install -y epel-release
sudo dnf install -y git curl wget vim tar unzip

# Ubuntu
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl wget vim tar unzip build-essential
```

### 2.2 전용 사용자 생성

```bash
# tms 서비스 전용 사용자 생성
sudo useradd -m -s /bin/bash tms
sudo passwd tms

# sudoers 권한 부여 (선택사항)
sudo usermod -aG wheel tms  # Rocky/CentOS
sudo usermod -aG sudo tms   # Ubuntu
```

### 2.3 디렉토리 구조 생성

```bash
sudo mkdir -p /var/www/tms
sudo mkdir -p /var/log/pm2
sudo mkdir -p /var/log/tms
sudo chown -R tms:tms /var/www/tms
sudo chown -R tms:tms /var/log/pm2
sudo chown -R tms:tms /var/log/tms
```

---

## 3. Oracle Instant Client 설치

### 3.1 Oracle Instant Client 다운로드

```bash
# Rocky Linux / CentOS
sudo dnf install -y libaio

# Ubuntu
sudo apt install -y libaio1

# Oracle Instant Client 21c 다운로드 및 설치
cd /tmp

# RPM 방식 (Rocky/CentOS)
wget https://download.oracle.com/otn_software/linux/instantclient/2111000/oracle-instantclient-basic-21.11.0.0.0-1.el8.x86_64.rpm
wget https://download.oracle.com/otn_software/linux/instantclient/2111000/oracle-instantclient-sqlplus-21.11.0.0.0-1.el8.x86_64.rpm

sudo rpm -ivh oracle-instantclient-basic-21.11.0.0.0-1.el8.x86_64.rpm
sudo rpm -ivh oracle-instantclient-sqlplus-21.11.0.0.0-1.el8.x86_64.rpm
```

### 3.2 환경변수 설정

```bash
# /etc/profile.d/oracle.sh 생성
sudo tee /etc/profile.d/oracle.sh << 'EOF'
export ORACLE_HOME=/usr/lib/oracle/21/client64
export LD_LIBRARY_PATH=$ORACLE_HOME/lib:$LD_LIBRARY_PATH
export PATH=$ORACLE_HOME/bin:$PATH
export TNS_ADMIN=$ORACLE_HOME/network/admin
EOF

# 적용
source /etc/profile.d/oracle.sh

# 라이브러리 캐시 업데이트
echo "/usr/lib/oracle/21/client64/lib" | sudo tee /etc/ld.so.conf.d/oracle.conf
sudo ldconfig
```

### 3.3 TNS 설정 (선택사항)

```bash
sudo mkdir -p /usr/lib/oracle/21/client64/network/admin

# tnsnames.ora 예시
sudo tee /usr/lib/oracle/21/client64/network/admin/tnsnames.ora << 'EOF'
MYDB =
  (DESCRIPTION =
    (ADDRESS = (PROTOCOL = TCP)(HOST = your-db-host)(PORT = 1521))
    (CONNECT_DATA =
      (SERVICE_NAME = your-service-name)
    )
  )
EOF
```

---

## 4. Ollama 및 Kanana 모델 설치

### 4.1 Ollama 설치

```bash
# Ollama 설치 스크립트 실행
curl -fsSL https://ollama.com/install.sh | sh

# 설치 확인
ollama --version
```

### 4.2 Ollama 시스템 서비스 설정

```bash
# systemd 서비스 파일 생성
sudo tee /etc/systemd/system/ollama.service << 'EOF'
[Unit]
Description=Ollama Service
After=network-online.target

[Service]
Type=simple
User=tms
Group=tms
ExecStart=/usr/local/bin/ollama serve
Restart=always
RestartSec=3
Environment="OLLAMA_HOST=0.0.0.0"
Environment="OLLAMA_NUM_PARALLEL=4"
Environment="OLLAMA_MAX_LOADED_MODELS=2"

# GPU 사용 시 (NVIDIA)
# Environment="CUDA_VISIBLE_DEVICES=0"

[Install]
WantedBy=default.target
EOF

# 서비스 활성화 및 시작
sudo systemctl daemon-reload
sudo systemctl enable ollama
sudo systemctl start ollama
sudo systemctl status ollama
```

### 4.3 Kanana 1.5 8B 모델 다운로드

```bash
# tms 사용자로 전환
su - tms

# Kanana 모델 다운로드 (Q4_K_M 양자화 버전)
ollama pull hf.co/Mungert/kanana-1.5-8b-instruct-2505-GGUF:Q4_K_M

# 모델 목록 확인
ollama list

# 모델 테스트
ollama run hf.co/Mungert/kanana-1.5-8b-instruct-2505-GGUF:Q4_K_M "안녕하세요"
```

### 4.4 Ollama API 테스트

```bash
# Health Check
curl http://localhost:11434/api/tags

# 채팅 테스트
curl http://localhost:11434/api/chat -d '{
  "model": "hf.co/Mungert/kanana-1.5-8b-instruct-2505-GGUF:Q4_K_M",
  "messages": [{"role": "user", "content": "SELECT * FROM employees 쿼리를 분석해주세요"}],
  "stream": false
}'
```

---

## 5. Node.js 및 PM2 설치

### 5.1 Node.js 20 LTS 설치

```bash
# NodeSource 저장소 추가 및 설치
# Rocky Linux / CentOS
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Ubuntu
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 버전 확인
node --version
npm --version
```

### 5.2 PM2 전역 설치

```bash
# PM2 설치
sudo npm install -g pm2

# 버전 확인
pm2 --version

# PM2 자동 시작 설정
pm2 startup systemd -u tms --hp /home/tms
```

---

## 6. 프로젝트 배포

### 6.1 소스코드 배포

```bash
# tms 사용자로 전환
su - tms
cd /var/www/tms

# Git Clone (또는 파일 직접 복사)
git clone https://github.com/your-org/narae-tms.git .

# 또는 rsync로 복사
# rsync -avz --exclude='node_modules' --exclude='.next' --exclude='.git' \
#   /path/to/local/tms/ tms@your-server:/var/www/tms/
```

### 6.2 의존성 설치

```bash
cd /var/www/tms

# Production 의존성만 설치
npm ci --only=production

# 또는 모든 의존성 설치 (개발 도구 포함)
npm ci
```

### 6.3 프로덕션 빌드

```bash
# Next.js 빌드
npm run build

# 빌드 결과 확인
ls -la .next/
```

---

## 7. 환경변수 설정

### 7.1 환경변수 파일 생성

```bash
# /var/www/tms/.env.local 생성
cat > /var/www/tms/.env.local << 'EOF'
# ============================================
# Narae TMS v2.0 Production Environment
# ============================================

# --------------------------------------------
# Supabase Configuration
# --------------------------------------------
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# --------------------------------------------
# NextAuth Configuration
# --------------------------------------------
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=your-secure-random-secret-key-minimum-32-chars

# --------------------------------------------
# Application Configuration
# --------------------------------------------
NODE_ENV=production
PORT=3000

# Log Level (error, warn, info, debug)
LOG_LEVEL=info

# --------------------------------------------
# Security & Encryption
# --------------------------------------------
# AES-256 encryption key (32 bytes hex)
ENCRYPTION_KEY=your-64-char-hex-encryption-key

# --------------------------------------------
# Oracle Configuration
# --------------------------------------------
ORACLE_THICK_MODE=true
ORACLE_CLIENT_LIB_DIR=/usr/lib/oracle/21/client64/lib

# --------------------------------------------
# LLM Configuration (Kanana 1.5 8B)
# --------------------------------------------
LLM_BASE_URL=http://localhost:11434
LLM_MODEL_NAME=hf.co/Mungert/kanana-1.5-8b-instruct-2505-GGUF:Q4_K_M
LLM_API_TYPE=ollama
LLM_MAX_TOKENS=4096
LLM_TEMPERATURE=0.3
LLM_TIMEOUT=120000

# --------------------------------------------
# Feature Flags
# --------------------------------------------
FEATURE_AI_TUNING_GUIDE=true
FEATURE_AI_TUNING_ADVISOR=false
FEATURE_AUTO_TUNING=false
FEATURE_EMAIL_ALERTS=false
FEATURE_SLACK_ALERTS=false

# --------------------------------------------
# Performance & Caching
# --------------------------------------------
SQL_COLLECTION_INTERVAL=300
METRICS_COLLECTION_INTERVAL=60
SQL_STATS_RETENTION_DAYS=90
AUDIT_LOG_RETENTION_DAYS=365

# --------------------------------------------
# Debug (Production에서는 false)
# --------------------------------------------
DEBUG=false
SQL_DEBUG=false
USE_MOCK_ORACLE=false
EOF

# 권한 설정
chmod 600 /var/www/tms/.env.local
```

### 7.2 NEXTAUTH_SECRET 생성

```bash
# 안전한 랜덤 시크릿 생성
openssl rand -base64 32
```

### 7.3 ENCRYPTION_KEY 생성

```bash
# AES-256용 64자 hex 키 생성
openssl rand -hex 32
```

---

## 8. PM2로 서비스 시작

### 8.1 ecosystem.config.js 확인

```javascript
// /var/www/tms/ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'tms',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: '/var/www/tms',

      // 클러스터 모드
      instances: 'max',  // 또는 CPU 코어 수 지정 (예: 4)
      exec_mode: 'cluster',

      // 환경변수
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        LD_LIBRARY_PATH: '/usr/lib/oracle/21/client64/lib',
        ORACLE_HOME: '/usr/lib/oracle/21/client64',
        TNS_ADMIN: '/usr/lib/oracle/21/client64/network/admin',
      },

      // 메모리 관리
      max_memory_restart: '1G',
      min_uptime: '10s',
      max_restarts: 10,
      autorestart: true,

      // 로그 설정
      error_file: '/var/log/pm2/tms-error.log',
      out_file: '/var/log/pm2/tms-out.log',
      log_file: '/var/log/pm2/tms-combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // 성능 설정
      watch: false,
      kill_timeout: 5000,
      listen_timeout: 3000,
      wait_ready: true,
      node_args: '--max-old-space-size=2048',
    },
  ],
};
```

### 8.2 PM2 서비스 시작

```bash
# tms 사용자로 전환
su - tms
cd /var/www/tms

# 서비스 시작
pm2 start ecosystem.config.js --env production

# 상태 확인
pm2 status
pm2 logs tms

# PM2 프로세스 저장 (재부팅 시 자동 시작)
pm2 save
```

### 8.3 PM2 주요 명령어

```bash
# 상태 확인
pm2 status
pm2 list

# 로그 확인
pm2 logs tms
pm2 logs tms --lines 100

# 재시작
pm2 restart tms
pm2 reload tms  # Zero-downtime 재시작

# 중지
pm2 stop tms

# 삭제
pm2 delete tms

# 모니터링
pm2 monit

# 클러스터 스케일링
pm2 scale tms 4  # 인스턴스 4개로 조정
```

---

## 9. Nginx 리버스 프록시 설정

### 9.1 Nginx 설치

```bash
# Rocky Linux / CentOS
sudo dnf install -y nginx

# Ubuntu
sudo apt install -y nginx

# 시작 및 활성화
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 9.2 Nginx 설정

```bash
sudo tee /etc/nginx/conf.d/tms.conf << 'EOF'
# TMS Upstream
upstream tms_backend {
    least_conn;
    server 127.0.0.1:3000;
    keepalive 32;
}

# HTTP -> HTTPS 리다이렉트
server {
    listen 80;
    server_name your-domain.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS 설정
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 인증서 (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # SSL 보안 설정
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_stapling on;
    ssl_stapling_verify on;

    # 보안 헤더
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Gzip 압축
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript
               application/xml+rss application/atom+xml image/svg+xml;

    # 정적 파일 캐싱
    location /_next/static/ {
        alias /var/www/tms/.next/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /static/ {
        alias /var/www/tms/public/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API 및 Next.js 프록시
    location / {
        proxy_pass http://tms_backend;
        proxy_http_version 1.1;

        # 웹소켓 지원
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';

        # 프록시 헤더
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 타임아웃 설정 (LLM 응답 대기)
        proxy_connect_timeout 60s;
        proxy_send_timeout 120s;
        proxy_read_timeout 120s;

        # SSE (Server-Sent Events) 지원
        proxy_buffering off;
        proxy_cache off;

        # 버퍼 설정
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
    }

    # LLM 스트리밍 API 특별 설정
    location /api/llm/stream {
        proxy_pass http://tms_backend;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection '';

        # SSE 필수 설정
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;

        # LLM 응답 대기 시간 (최대 2분)
        proxy_read_timeout 120s;
    }

    # 로그 설정
    access_log /var/log/nginx/tms-access.log;
    error_log /var/log/nginx/tms-error.log;
}
EOF
```

### 9.3 Nginx 설정 테스트 및 재시작

```bash
# 설정 테스트
sudo nginx -t

# 재시작
sudo systemctl reload nginx
```

---

## 10. SSL 인증서 설정

### 10.1 Certbot 설치

```bash
# Rocky Linux / CentOS
sudo dnf install -y certbot python3-certbot-nginx

# Ubuntu
sudo apt install -y certbot python3-certbot-nginx
```

### 10.2 SSL 인증서 발급

```bash
# Let's Encrypt 인증서 발급
sudo certbot --nginx -d your-domain.com

# 자동 갱신 테스트
sudo certbot renew --dry-run

# 자동 갱신 크론 등록 (보통 자동 설정됨)
sudo systemctl enable certbot-renew.timer
sudo systemctl start certbot-renew.timer
```

---

## 11. 방화벽 설정

### 11.1 Firewalld (Rocky/CentOS)

```bash
# HTTP/HTTPS 허용
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https

# 적용
sudo firewall-cmd --reload

# 확인
sudo firewall-cmd --list-all
```

### 11.2 UFW (Ubuntu)

```bash
# HTTP/HTTPS 허용
sudo ufw allow 'Nginx Full'

# 상태 확인
sudo ufw status
```

### 11.3 SELinux 설정 (Rocky/CentOS)

```bash
# Nginx가 네트워크에 연결할 수 있도록 허용
sudo setsebool -P httpd_can_network_connect 1

# 필요 시 SELinux 컨텍스트 설정
sudo semanage fcontext -a -t httpd_sys_content_t "/var/www/tms(/.*)?"
sudo restorecon -Rv /var/www/tms
```

---

## 12. 모니터링 및 로그 관리

### 12.1 PM2 모니터링

```bash
# 실시간 모니터링
pm2 monit

# 웹 기반 모니터링 (PM2 Plus)
pm2 plus

# 상태 확인
pm2 status
pm2 show tms
```

### 12.2 로그 로테이션 설정

```bash
# PM2 로그 로테이션 모듈 설치
pm2 install pm2-logrotate

# 설정
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
```

### 12.3 시스템 로그 확인

```bash
# PM2 로그
pm2 logs tms
pm2 logs tms --lines 200 --err

# Nginx 로그
sudo tail -f /var/log/nginx/tms-access.log
sudo tail -f /var/log/nginx/tms-error.log

# Ollama 로그
sudo journalctl -u ollama -f

# 시스템 로그
sudo journalctl -u pm2-tms -f
```

### 12.4 헬스체크 스크립트

```bash
# /home/tms/health-check.sh
cat > /home/tms/health-check.sh << 'EOF'
#!/bin/bash

# TMS 헬스체크
TMS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000)
if [ "$TMS_STATUS" != "200" ] && [ "$TMS_STATUS" != "307" ]; then
    echo "[$(date)] TMS 서비스 이상: HTTP $TMS_STATUS"
    pm2 restart tms
fi

# Ollama 헬스체크
OLLAMA_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:11434/api/tags)
if [ "$OLLAMA_STATUS" != "200" ]; then
    echo "[$(date)] Ollama 서비스 이상: HTTP $OLLAMA_STATUS"
    sudo systemctl restart ollama
fi
EOF

chmod +x /home/tms/health-check.sh

# 크론 등록 (5분마다 실행)
(crontab -l 2>/dev/null; echo "*/5 * * * * /home/tms/health-check.sh >> /var/log/tms/health-check.log 2>&1") | crontab -
```

---

## 13. 트러블슈팅

### 13.1 일반적인 문제

#### PM2 시작 실패
```bash
# 로그 확인
pm2 logs tms --err

# 메모리 부족 시
pm2 delete tms
pm2 start ecosystem.config.js --env production

# Node.js 버전 확인
node --version
```

#### Oracle 연결 실패
```bash
# 환경변수 확인
echo $LD_LIBRARY_PATH
echo $ORACLE_HOME

# 라이브러리 확인
ldconfig -p | grep oracle

# Oracle Client 테스트
sqlplus -v
```

#### LLM 응답 없음
```bash
# Ollama 상태 확인
sudo systemctl status ollama
ollama list

# 모델 다시 로드
ollama pull hf.co/Mungert/kanana-1.5-8b-instruct-2505-GGUF:Q4_K_M

# API 테스트
curl http://localhost:11434/api/tags
```

### 13.2 성능 문제

#### 메모리 부족
```bash
# 메모리 사용량 확인
free -h
pm2 monit

# PM2 인스턴스 수 줄이기
pm2 scale tms 2

# Node.js 메모리 제한 조정
# ecosystem.config.js에서 node_args 수정
node_args: '--max-old-space-size=1024'
```

#### LLM 응답 느림
```bash
# 더 작은 모델 사용
ollama pull qwen2:1.5b

# .env.local에서 모델 변경
LLM_MODEL_NAME=qwen2:1.5b

# PM2 재시작
pm2 restart tms
```

### 13.3 배포 업데이트

```bash
# tms 사용자로 전환
su - tms
cd /var/www/tms

# 소스 업데이트
git pull origin main

# 의존성 업데이트
npm ci

# 빌드
npm run build

# Zero-downtime 재시작
pm2 reload tms

# 상태 확인
pm2 status
pm2 logs tms --lines 50
```

---

## 부록: 빠른 배포 체크리스트

```bash
# 1. 시스템 준비
[ ] OS 업데이트
[ ] 전용 사용자 (tms) 생성
[ ] 디렉토리 생성 (/var/www/tms, /var/log/pm2)

# 2. 의존성 설치
[ ] Oracle Instant Client 21c
[ ] Node.js 20 LTS
[ ] PM2 전역 설치
[ ] Nginx 설치
[ ] Ollama 설치

# 3. 모델 및 소스 배포
[ ] Kanana 모델 다운로드
[ ] 소스코드 배포
[ ] npm ci && npm run build

# 4. 설정
[ ] .env.local 환경변수 설정
[ ] ecosystem.config.js 확인
[ ] Nginx 리버스 프록시 설정
[ ] SSL 인증서 발급

# 5. 서비스 시작
[ ] Ollama 서비스 시작
[ ] PM2로 TMS 시작
[ ] pm2 save

# 6. 검증
[ ] https://your-domain.com 접속 확인
[ ] 로그인 테스트
[ ] AI 튜닝 가이드 테스트
[ ] Oracle 연결 테스트
```

---

## 문의 및 지원

- **기술 지원**: support@naraeit.com
- **문서 버전**: 2.0.0
- **최종 업데이트**: 2025-12-12
