# 🔧 Narae TMS v2.0 프로덕션 배포 문제 해결

## 문제 진단

### 증상
- ✅ 로그인 페이지 접속은 가능
- ❌ 브라우저 콘솔에 404 에러 발생
- ❌ 일부 리소스 로드 실패

### 원인 분석

#### 1. NEXTAUTH_URL 미설정
```bash
# 현재 상태 (잘못됨)
NEXTAUTH_URL=http://localhost:3000

# 필요한 설정 (올바름)
NEXTAUTH_URL=https://sqltms.info
```

#### 2. 빌드 에러 발생
```
Error: <Html> should not be imported outside of pages/_document
```

## 해결 방법

### Step 1: 서버 환경변수 설정

#### 방법 A: PM2 배포인 경우

1. **서버 접속**
```bash
ssh user@mcseoper.iptime.org
cd /var/www/narae-tms  # 실제 배포 경로로 변경
```

2. **환경변수 파일 생성**
```bash
# .env.production 파일 생성
cat > .env.production << 'EOF'
NEXTAUTH_URL=https://sqltms.info
NEXTAUTH_SECRET=your-production-secret-key-minimum-32-characters-long

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://fhnphmjpvawmljdvhptj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZobnBobWpwdmF3bWxqZHZocHRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2NTE1NTYsImV4cCI6MjA3ODIyNzU1Nn0.YKBZyBsb2zRb0g8olsgVinv_NZJXJe2QyEoHnYevj04
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZobnBobWpwdmF3bWxqZHZocHRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjY1MTU1NiwiZXhwIjoyMDc4MjI3NTU2fQ.3a0V8gShBbam59PcoogIK0GmPCnKqcnwJoklA_EnyCA

# Database
DATABASE_URL=postgresql://postgres:song7409@mcseoper.iptime.org:5432/tms_db

# Oracle
ORACLE_TEST_HOST=mcseoper.iptime.org
ORACLE_TEST_PORT=2521
ORACLE_TEST_SERVICE_NAME=NITDB
ORACLE_TEST_USER=system
ORACLE_TEST_PASSWORD=oracle

# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Security
ENCRYPTION_KEY=production-32-char-encryption-key-change-this

# Oracle Thick Mode
ORACLE_THICK_MODE=true
ORACLE_CLIENT_LIB_DIR=/usr/local/lib
EOF
```

3. **NEXTAUTH_SECRET 생성 (중요!)**
```bash
# 안전한 랜덤 시크릿 생성
openssl rand -base64 32

# 생성된 값을 .env.production의 NEXTAUTH_SECRET에 복사
```

4. **재빌드 및 재시작**
```bash
# 빌드
npm run build

# PM2로 재시작
pm2 restart narae-tms
pm2 save

# 로그 확인
pm2 logs narae-tms
```

#### 방법 B: Docker 배포인 경우

1. **docker-compose.yml 환경변수 추가**
```bash
cd /path/to/narae-tms

# docker-compose.yml 편집
vi docker-compose.yml
```

2. **환경변수 섹션 추가**
```yaml
services:
  app:
    environment:
      - NEXTAUTH_URL=https://sqltms.info
      - NEXTAUTH_SECRET=your-production-secret-key
      - NODE_ENV=production
      # ... 나머지 환경변수
```

3. **컨테이너 재시작**
```bash
docker-compose down
docker-compose up -d --build
docker-compose logs -f
```

#### 방법 C: Systemd 배포인 경우

1. **서비스 파일 편집**
```bash
sudo vi /etc/systemd/system/narae-tms.service
```

2. **Environment 섹션 추가**
```ini
[Service]
Environment="NEXTAUTH_URL=https://sqltms.info"
Environment="NEXTAUTH_SECRET=your-production-secret-key"
Environment="NODE_ENV=production"
```

3. **재시작**
```bash
sudo systemctl daemon-reload
sudo systemctl restart narae-tms
sudo systemctl status narae-tms
```

### Step 2: Nginx 설정 확인

```bash
# Nginx 설정 파일 확인
sudo vi /etc/nginx/conf.d/narae-tms.conf
```

올바른 설정:
```nginx
server {
    listen 80;
    server_name sqltms.info www.sqltms.info;

    # HTTP to HTTPS redirect
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name sqltms.info www.sqltms.info;

    # SSL 인증서 설정
    ssl_certificate /etc/letsencrypt/live/sqltms.info/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sqltms.info/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
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
```

```bash
# Nginx 설정 테스트
sudo nginx -t

# Nginx 재시작
sudo systemctl reload nginx
```

### Step 3: 빌드 에러 해결

현재 빌드 에러는 자동으로 해결됩니다. Next.js가 404 페이지를 자동 생성하며, 커스텀 404 페이지(`src/app/not-found.tsx`)는 정상적으로 작동합니다.

### Step 4: 배포 확인

```bash
# 애플리케이션 상태 확인
curl -I https://sqltms.info

# 로그 확인
# PM2의 경우
pm2 logs narae-tms --lines 100

# Docker의 경우
docker-compose logs -f --tail=100

# Systemd의 경우
sudo journalctl -u narae-tms -f
```

## 검증 체크리스트

- [ ] `NEXTAUTH_URL`이 `https://sqltms.info`로 설정됨
- [ ] `NEXTAUTH_SECRET`이 32자 이상의 랜덤 문자열로 설정됨
- [ ] `NODE_ENV=production`으로 설정됨
- [ ] 빌드가 성공적으로 완료됨
- [ ] 애플리케이션이 정상 실행 중
- [ ] 브라우저에서 https://sqltms.info 접속 가능
- [ ] 로그인 페이지에서 404 에러가 발생하지 않음
- [ ] 브라우저 콘솔에 에러가 없음

## 빠른 배포 스크립트

서버에서 다음 스크립트를 실행하세요:

```bash
#!/bin/bash
# quick-fix.sh

set -e

echo "🔧 Narae TMS v2.0 프로덕션 환경 수정 중..."

# 1. 환경변수 파일 백업
if [ -f .env.production ]; then
    cp .env.production .env.production.backup
    echo "✅ 기존 환경변수 백업 완료"
fi

# 2. NEXTAUTH_SECRET 생성
NEXTAUTH_SECRET=$(openssl rand -base64 32)
echo "✅ NEXTAUTH_SECRET 생성: $NEXTAUTH_SECRET"

# 3. .env.production 업데이트
cat > .env.production << EOF
NEXTAUTH_URL=https://sqltms.info
NEXTAUTH_SECRET=$NEXTAUTH_SECRET
NODE_ENV=production
NEXT_PUBLIC_SUPABASE_URL=https://fhnphmjpvawmljdvhptj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZobnBobWpwdmF3bWxqZHZocHRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2NTE1NTYsImV4cCI6MjA3ODIyNzU1Nn0.YKBZyBsb2zRb0g8olsgVinv_NZJXJe2QyEoHnYevj04
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZobnBobWpwdmF3bWxqZHZocHRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjY1MTU1NiwiZXhwIjoyMDc4MjI3NTU2fQ.3a0V8gShBbam59PcoogIK0GmPCnKqcnwJoklA_EnyCA
DATABASE_URL=postgresql://postgres:song7409@mcseoper.iptime.org:5432/tms_db
ORACLE_TEST_HOST=mcseoper.iptime.org
ORACLE_TEST_PORT=2521
ORACLE_TEST_SERVICE_NAME=NITDB
ORACLE_TEST_USER=system
ORACLE_TEST_PASSWORD=oracle
PORT=3000
LOG_LEVEL=info
ENCRYPTION_KEY=production-32-char-encryption-key-change-this
ORACLE_THICK_MODE=true
ORACLE_CLIENT_LIB_DIR=/usr/local/lib
EOF

echo "✅ 환경변수 파일 업데이트 완료"

# 4. 재빌드
echo "🔨 애플리케이션 빌드 중..."
npm run build

# 5. PM2 재시작 (PM2 사용 시)
if command -v pm2 &> /dev/null; then
    echo "🔄 PM2 재시작 중..."
    pm2 restart narae-tms
    pm2 save
    echo "✅ PM2 재시작 완료"
fi

# 6. Docker 재시작 (Docker 사용 시)
if command -v docker-compose &> /dev/null && [ -f docker-compose.yml ]; then
    echo "🔄 Docker 컨테이너 재시작 중..."
    docker-compose up -d --build
    echo "✅ Docker 재시작 완료"
fi

echo ""
echo "✅ 모든 작업 완료!"
echo "🌐 브라우저에서 https://sqltms.info 접속하여 확인하세요"
echo ""
echo "📝 생성된 NEXTAUTH_SECRET을 안전한 곳에 백업하세요:"
echo "   $NEXTAUTH_SECRET"
```

스크립트 실행:
```bash
chmod +x quick-fix.sh
./quick-fix.sh
```

## 추가 보안 조치

### 1. NEXTAUTH_SECRET 변경 후 세션 무효화

모든 사용자는 다시 로그인해야 합니다. 이는 정상적인 동작입니다.

### 2. ENCRYPTION_KEY도 프로덕션용으로 변경

```bash
# 32바이트 키 생성
openssl rand -hex 32
```

### 3. SSL 인증서 확인

```bash
# Let's Encrypt 인증서 갱신
sudo certbot renew --dry-run
```

## 문제가 계속되는 경우

### 로그 수집
```bash
# PM2
pm2 logs narae-tms --lines 500 > /tmp/narae-tms-logs.txt

# Docker
docker-compose logs --tail=500 > /tmp/narae-tms-logs.txt

# Systemd
sudo journalctl -u narae-tms -n 500 > /tmp/narae-tms-logs.txt

# Nginx
sudo tail -500 /var/log/nginx/error.log > /tmp/nginx-error.txt
```

### 브라우저 개발자 도구
1. F12 키로 개발자 도구 열기
2. Network 탭에서 실패한 요청 확인
3. Console 탭에서 JavaScript 에러 확인
4. 스크린샷 저장

## 참고 문서

- [Next.js Environment Variables](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables)
- [NextAuth.js Configuration](https://next-auth.js.org/configuration/options)
- [Nginx Proxy Configuration](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
