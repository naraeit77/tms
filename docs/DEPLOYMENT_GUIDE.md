# Narae TMS v2.0 배포 가이드 (Oracle Linux 8.6)

**대상 환경**: Oracle Linux 8.6
**도메인**: sqltms.info
**프로세스 관리**: PM2
**웹 서버**: Nginx
**SSL**: Let's Encrypt (Certbot)

---

## 목차

1. [사전 요구사항](#1-사전-요구사항)
2. [서버 초기 설정](#2-서버-초기-설정)
3. [Node.js 설치](#3-nodejs-설치)
4. [Oracle Instant Client 설치](#4-oracle-instant-client-설치)
5. [프로젝트 배포](#5-프로젝트-배포)
6. [환경 변수 설정](#6-환경-변수-설정)
7. [PM2 설정](#7-pm2-설정)
8. [Nginx 설정](#8-nginx-설정)
9. [SSL 인증서 설정](#9-ssl-인증서-설정)
10. [방화벽 설정](#10-방화벽-설정)
11. [자동 시작 설정](#11-자동-시작-설정)
12. [배포 확인](#12-배포-확인)
13. [문제 해결](#13-문제-해결)

---

## 1. 사전 요구사항

### 하드웨어 요구사항
- **CPU**: 2 코어 이상 (권장: 4 코어)
- **메모리**: 4GB 이상 (권장: 8GB)
- **디스크**: 20GB 이상 여유 공간

### 소프트웨어 요구사항
- Oracle Linux 8.6
- root 또는 sudo 권한
- 인터넷 연결

### 도메인 설정
```bash
# DNS A 레코드 설정 확인
nslookup sqltms.info
# 결과: 서버 IP 주소가 정확히 표시되어야 함
```

---

## 2. 서버 초기 설정

### 2.1 시스템 업데이트
```bash
# root 권한으로 실행
sudo dnf update -y
sudo dnf upgrade -y
```

### 2.2 필수 패키지 설치
```bash
# 개발 도구 및 라이브러리 설치
sudo dnf groupinstall "Development Tools" -y
sudo dnf install -y wget curl git gcc-c++ make openssl-devel \
    libaio libaio-devel python3 python3-pip
```

### 2.3 배포 사용자 생성 (권장)
```bash
# tms 사용자 생성
sudo useradd -m -s /bin/bash tms
sudo passwd tms

# sudo 권한 부여 (필요시)
sudo usermod -aG wheel tms

# tms 사용자로 전환
su - tms
```

---

## 3. Node.js 설치

### 3.1 NodeSource 저장소 추가
```bash
# Node.js 20.x LTS 설치 (권장)
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
```

### 3.2 Node.js 및 npm 설치
```bash
sudo dnf install -y nodejs

# 버전 확인
node --version  # v20.x.x
npm --version   # 10.x.x
```

### 3.3 PM2 전역 설치
```bash
sudo npm install -g pm2

# PM2 버전 확인
pm2 --version
```

---

## 4. Oracle Instant Client 설치

### 4.1 Oracle Instant Client 다운로드
```bash
# /opt/oracle 디렉토리 생성
sudo mkdir -p /opt/oracle
cd /opt/oracle

# Oracle Instant Client 21c Basic 다운로드
sudo wget https://download.oracle.com/otn_software/linux/instantclient/2110000/oracle-instantclient-basic-21.10.0.0.0-1.el8.x86_64.rpm
sudo wget https://download.oracle.com/otn_software/linux/instantclient/2110000/oracle-instantclient-sqlplus-21.10.0.0.0-1.el8.x86_64.rpm
sudo wget https://download.oracle.com/otn_software/linux/instantclient/2110000/oracle-instantclient-devel-21.10.0.0.0-1.el8.x86_64.rpm
```

### 4.2 RPM 패키지 설치
```bash
sudo dnf install -y oracle-instantclient-basic-21.10.0.0.0-1.el8.x86_64.rpm
sudo dnf install -y oracle-instantclient-sqlplus-21.10.0.0.0-1.el8.x86_64.rpm
sudo dnf install -y oracle-instantclient-devel-21.10.0.0.0-1.el8.x86_64.rpm
```

### 4.3 환경 변수 설정
```bash
# /etc/profile.d/oracle.sh 파일 생성
sudo tee /etc/profile.d/oracle.sh > /dev/null <<'EOF'
export ORACLE_HOME=/usr/lib/oracle/21/client64
export LD_LIBRARY_PATH=$ORACLE_HOME/lib:$LD_LIBRARY_PATH
export PATH=$ORACLE_HOME/bin:$PATH
EOF

# 환경 변수 적용
source /etc/profile.d/oracle.sh

# 확인
echo $ORACLE_HOME
echo $LD_LIBRARY_PATH
```

### 4.4 ldconfig 설정
```bash
# Oracle 라이브러리 경로 추가
sudo tee /etc/ld.so.conf.d/oracle-instantclient.conf > /dev/null <<EOF
/usr/lib/oracle/21/client64/lib
EOF

# ldconfig 캐시 갱신
sudo ldconfig

# 확인
ldconfig -p | grep oracle
```

---

## 5. 프로젝트 배포

### 5.1 프로젝트 디렉토리 생성
```bash
# 배포 디렉토리 생성 (tms 사용자로)
sudo mkdir -p /var/www/tms
sudo chown -R tms:tms /var/www/tms
cd /var/www/tms
```

### 5.2 Git 저장소 클론
```bash
# Git 저장소에서 클론 (예시)
git clone https://github.com/your-repo/narae-tms.git .

# 또는 파일 업로드 방식 (scp/rsync)
# scp -r /local/path/* tms@sqltms.info:/var/www/tms/
```

### 5.3 의존성 설치
```bash
# npm 패키지 설치 (프로덕션 모드)
npm ci --omit=dev

# 또는 모든 의존성 설치
npm install
```

### 5.4 프로젝트 빌드
```bash
# Next.js 프로덕션 빌드
npm run build

# 빌드 결과 확인
ls -la .next/
```

---

## 6. 환경 변수 설정

### 6.1 .env.production 파일 생성
```bash
cd /var/www/tms
nano .env.production
```

### 6.2 환경 변수 설정 (아래 내용 입력)
```env
# ===================================
# Node Environment
# ===================================
NODE_ENV=production
PORT=3000

# ===================================
# Oracle Instant Client
# ===================================
LD_LIBRARY_PATH=/usr/lib/oracle/21/client64/lib
ORACLE_HOME=/usr/lib/oracle/21/client64

# ===================================
# Next.js Configuration
# ===================================
NEXT_PUBLIC_APP_URL=https://sqltms.info
NEXT_PUBLIC_API_URL=https://sqltms.info/api

# ===================================
# Supabase Configuration
# ===================================
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# ===================================
# NextAuth Configuration
# ===================================
NEXTAUTH_URL=https://sqltms.info
NEXTAUTH_SECRET=your_nextauth_secret_key_here

# ===================================
# Database Configuration (Supabase)
# ===================================
DATABASE_URL=your_supabase_database_url

# ===================================
# Encryption Keys
# ===================================
ENCRYPTION_KEY=your_32_character_encryption_key

# ===================================
# Feature Flags (Optional)
# ===================================
ENABLE_SQL_TUNING_ADVISOR=true
ENABLE_AWR_REPORTS=true
ENABLE_STATSPACK=true
ENABLE_SQL_MONITORING=true

# ===================================
# Email Configuration (Optional)
# ===================================
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your_email@gmail.com
# SMTP_PASSWORD=your_app_password
# SMTP_FROM=noreply@sqltms.info

# ===================================
# Monitoring & Logging (Optional)
# ===================================
# LOG_LEVEL=info
# SENTRY_DSN=your_sentry_dsn
```

### 6.3 파일 권한 설정
```bash
chmod 600 .env.production
```

### 6.4 암호화 키 생성 방법
```bash
# NEXTAUTH_SECRET 생성
openssl rand -base64 32

# ENCRYPTION_KEY 생성 (32자)
openssl rand -hex 16
```

---

## 7. PM2 설정

### 7.1 ecosystem.config.js 파일 생성
```bash
cd /var/www/tms
nano ecosystem.config.js
```

### 7.2 PM2 설정 파일 작성
```javascript
module.exports = {
  apps: [
    {
      name: 'narae-tms',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: '/var/www/tms',
      instances: 'max',
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        LD_LIBRARY_PATH: '/usr/lib/oracle/21/client64/lib',
        ORACLE_HOME: '/usr/lib/oracle/21/client64',
      },
      error_file: '/var/log/pm2/narae-tms-error.log',
      out_file: '/var/log/pm2/narae-tms-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '1G',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};
```

### 7.3 PM2 로그 디렉토리 생성
```bash
sudo mkdir -p /var/log/pm2
sudo chown -R tms:tms /var/log/pm2
```

### 7.4 PM2로 애플리케이션 시작
```bash
# 프로덕션 모드로 시작
pm2 start ecosystem.config.js --env production

# 상태 확인
pm2 status
pm2 logs narae-tms

# 모니터링
pm2 monit
```

### 7.5 PM2 저장 및 자동 시작 설정
```bash
# 현재 PM2 프로세스 목록 저장
pm2 save

# 부팅 시 자동 시작 설정
pm2 startup systemd -u tms --hp /home/tms
# 출력된 명령어를 복사하여 실행 (sudo 포함)

# 확인
sudo systemctl status pm2-tms
```

---

## 8. Nginx 설정

### 8.1 Nginx 설치
```bash
sudo dnf install -y nginx

# Nginx 버전 확인
nginx -v
```

### 8.2 Nginx 설정 파일 생성
```bash
sudo nano /etc/nginx/conf.d/sqltms.info.conf
```

### 8.3 Nginx 설정 내용
```nginx
# HTTP -> HTTPS 리다이렉트
server {
    listen 80;
    listen [::]:80;
    server_name sqltms.info www.sqltms.info;

    # Let's Encrypt ACME Challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # 모든 HTTP 트래픽을 HTTPS로 리다이렉트
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS 서버
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name sqltms.info www.sqltms.info;

    # SSL 인증서 (Let's Encrypt로 발급 후 설정)
    ssl_certificate /etc/letsencrypt/live/sqltms.info/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sqltms.info/privkey.pem;

    # SSL 설정
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # HSTS (HTTP Strict Transport Security)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # 보안 헤더
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # 최대 업로드 크기
    client_max_body_size 50M;

    # Gzip 압축
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml+rss application/rss+xml font/truetype font/opentype application/vnd.ms-fontobject image/svg+xml;

    # Next.js 정적 파일 캐싱
    location /_next/static/ {
        alias /var/www/tms/.next/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Public 폴더 정적 파일
    location /static/ {
        alias /var/www/tms/public/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # API 라우트 (Oracle 쿼리용 긴 타임아웃)
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Oracle 쿼리를 위한 긴 타임아웃
        proxy_connect_timeout 90s;
        proxy_send_timeout 90s;
        proxy_read_timeout 90s;
    }

    # Next.js 애플리케이션 프록시
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # 일반 타임아웃
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 로그 파일
    access_log /var/log/nginx/sqltms.info.access.log;
    error_log /var/log/nginx/sqltms.info.error.log;
}
```

### 8.4 Nginx 설정 테스트
```bash
# 설정 파일 문법 검사
sudo nginx -t

# Nginx 서비스 시작 및 활성화
sudo systemctl start nginx
sudo systemctl enable nginx

# 상태 확인
sudo systemctl status nginx
```

---

## 9. SSL 인증서 설정

### 9.1 Certbot 설치
```bash
# EPEL 저장소 활성화
sudo dnf install -y epel-release

# Certbot 및 Nginx 플러그인 설치
sudo dnf install -y certbot python3-certbot-nginx
```

### 9.2 Let's Encrypt 인증서 발급
```bash
# Certbot으로 인증서 발급 (Nginx 자동 설정)
sudo certbot --nginx -d sqltms.info -d www.sqltms.info

# 이메일 입력 및 약관 동의
# 입력 예: admin@sqltms.info
```

### 9.3 수동 인증서 발급 (Standalone 모드)
```bash
# Nginx 임시 중지
sudo systemctl stop nginx

# Standalone 모드로 인증서 발급
sudo certbot certonly --standalone -d sqltms.info -d www.sqltms.info

# Nginx 재시작
sudo systemctl start nginx
```

### 9.4 인증서 자동 갱신 설정
```bash
# Certbot 자동 갱신 타이머 확인
sudo systemctl status certbot-renew.timer

# 수동 갱신 테스트 (Dry Run)
sudo certbot renew --dry-run

# 자동 갱신 활성화
sudo systemctl enable certbot-renew.timer
```

### 9.5 Nginx 설정 업데이트
```bash
# SSL 인증서 경로 확인 후 Nginx 설정 파일 수정
sudo nano /etc/nginx/conf.d/sqltms.info.conf

# Nginx 재로드
sudo nginx -t && sudo systemctl reload nginx
```

---

## 10. 방화벽 설정

### 10.1 Firewalld 설정
```bash
# Firewalld 상태 확인
sudo systemctl status firewalld

# Firewalld 시작 및 활성화
sudo systemctl start firewalld
sudo systemctl enable firewalld

# HTTP, HTTPS 포트 허용
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https

# SSH 포트 확인 (기본 22번)
sudo firewall-cmd --permanent --add-service=ssh

# 방화벽 규칙 재로드
sudo firewall-cmd --reload

# 설정 확인
sudo firewall-cmd --list-all
```

### 10.2 SELinux 설정 (필요시)
```bash
# SELinux 상태 확인
getenforce

# SELinux가 Enforcing 모드인 경우
# Nginx가 네트워크 연결 허용
sudo setsebool -P httpd_can_network_connect 1

# 또는 SELinux를 Permissive 모드로 변경 (권장하지 않음)
# sudo setenforce 0
```

---

## 11. 자동 시작 설정

### 11.1 시스템 부팅 시 자동 시작
```bash
# PM2 자동 시작 (이미 설정됨)
sudo systemctl enable pm2-tms

# Nginx 자동 시작
sudo systemctl enable nginx

# Firewalld 자동 시작
sudo systemctl enable firewalld
```

### 11.2 서비스 상태 확인
```bash
# 모든 서비스 상태 확인
sudo systemctl status pm2-tms
sudo systemctl status nginx
sudo systemctl status firewalld
```

---

## 12. 배포 확인

### 12.1 로컬 접속 테스트
```bash
# 서버에서 로컬 테스트
curl http://localhost:3000
curl http://127.0.0.1:3000
```

### 12.2 Nginx 프록시 테스트
```bash
# HTTP 리다이렉트 테스트
curl -I http://sqltms.info

# HTTPS 접속 테스트
curl -I https://sqltms.info
```

### 12.3 웹 브라우저 접속
```
https://sqltms.info
```

### 12.4 로그 확인
```bash
# PM2 로그
pm2 logs narae-tms --lines 100

# Nginx 접속 로그
sudo tail -f /var/log/nginx/sqltms.info.access.log

# Nginx 에러 로그
sudo tail -f /var/log/nginx/sqltms.info.error.log

# 시스템 로그
sudo journalctl -u pm2-tms -f
sudo journalctl -u nginx -f
```

---

## 13. 문제 해결

### 13.1 PM2 애플리케이션이 시작되지 않는 경우
```bash
# 로그 확인
pm2 logs narae-tms --err --lines 50

# 환경 변수 확인
pm2 env 0

# 수동 재시작
pm2 restart narae-tms

# PM2 프로세스 삭제 후 재시작
pm2 delete narae-tms
pm2 start ecosystem.config.js --env production
```

### 13.2 Oracle Instant Client 오류
```bash
# 라이브러리 경로 확인
echo $LD_LIBRARY_PATH
ldconfig -p | grep oracle

# 수동 설정
export LD_LIBRARY_PATH=/usr/lib/oracle/21/client64/lib:$LD_LIBRARY_PATH
export ORACLE_HOME=/usr/lib/oracle/21/client64

# PM2 재시작
pm2 restart narae-tms --update-env
```

### 13.3 Nginx 502 Bad Gateway
```bash
# PM2 애플리케이션 상태 확인
pm2 status

# 포트 리스닝 확인
sudo netstat -tulpn | grep 3000
sudo ss -tulpn | grep 3000

# SELinux 문제인 경우
sudo setsebool -P httpd_can_network_connect 1
```

### 13.4 SSL 인증서 문제
```bash
# 인증서 유효성 확인
sudo certbot certificates

# 인증서 수동 갱신
sudo certbot renew --force-renewal

# Nginx 재시작
sudo systemctl restart nginx
```

### 13.5 메모리 부족 오류
```bash
# 메모리 사용량 확인
free -h
pm2 info narae-tms

# max_memory_restart 조정
# ecosystem.config.js 에서 max_memory_restart 값 증가
pm2 restart narae-tms
```

### 13.6 포트 충돌 확인
```bash
# 3000 포트 사용 프로세스 확인
sudo lsof -i :3000
sudo netstat -tulpn | grep :3000

# 프로세스 종료 (필요시)
sudo kill -9 <PID>
```

---

## 부록: 유용한 명령어

### PM2 명령어
```bash
pm2 list                      # 프로세스 목록
pm2 info narae-tms           # 상세 정보
pm2 logs narae-tms           # 로그 보기
pm2 monit                    # 모니터링
pm2 restart narae-tms        # 재시작
pm2 stop narae-tms           # 중지
pm2 delete narae-tms         # 삭제
pm2 reload narae-tms         # 무중단 재시작
pm2 save                     # 현재 상태 저장
```

### Nginx 명령어
```bash
sudo nginx -t                         # 설정 테스트
sudo systemctl reload nginx           # 설정 재로드
sudo systemctl restart nginx          # 재시작
sudo systemctl status nginx           # 상태 확인
sudo tail -f /var/log/nginx/*.log    # 로그 모니터링
```

### 시스템 모니터링
```bash
htop                        # 리소스 모니터링
df -h                       # 디스크 사용량
free -h                     # 메모리 사용량
uptime                      # 시스템 가동 시간
netstat -tulpn             # 네트워크 포트 확인
```

---

**배포 완료!** 🎉

이제 `https://sqltms.info`로 접속하여 Narae TMS v2.0 애플리케이션을 사용할 수 있습니다.
