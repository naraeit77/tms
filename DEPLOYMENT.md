# TMS v2.0 - Linux 서버 배포 가이드

리눅스 서버에 TMS v2.0을 배포하는 세 가지 방법을 제공합니다.

## 📋 사전 요구사항

### 공통 요구사항
- Linux Server (Ubuntu 20.04+ / CentOS 8+ 권장)
- Root 또는 sudo 권한
- 최소 2GB RAM, 2 CPU 코어
- 10GB 디스크 공간

### 방법별 요구사항

#### 1. Docker (권장)
- Docker 20.10+
- Docker Compose 2.0+

#### 2. PM2
- Node.js 20+
- PM2 (`npm install -g pm2`)

#### 3. Systemd
- Node.js 20+
- Systemd (대부분의 리눅스에 기본 포함)

---

## 🚀 방법 1: Docker 배포 (권장)

### 장점
✅ 환경 독립성 - 어떤 서버든 동일하게 작동
✅ 간편한 관리 - 컨테이너 기반 격리
✅ Nginx 포함 - 리버스 프록시 자동 구성
✅ 자동 재시작 - 장애 시 자동 복구

### 설치 단계

#### 1. Docker 설치 (Ubuntu)
```bash
# Docker 설치
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Docker Compose 설치
sudo apt-get update
sudo apt-get install docker-compose-plugin

# 현재 사용자를 docker 그룹에 추가
sudo usermod -aG docker $USER
newgrp docker
```

#### 2. 프로젝트 클론 및 설정
```bash
# 프로젝트 클론
git clone <your-repo-url> /opt/tms
cd /opt/tms

# 환경 변수 설정
cp .env.production.example .env.production
nano .env.production  # 환경 변수 수정
```

#### 3. 환경 변수 생성
```bash
# NEXTAUTH_SECRET 생성
openssl rand -base64 32

# ENCRYPTION_KEY 생성
openssl rand -hex 16
```

`.env.production` 파일 수정:
```env
NODE_ENV=production
PORT=3000
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=<생성된-secret>
ENCRYPTION_KEY=<생성된-key>

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-key>
SUPABASE_SERVICE_ROLE_KEY=<your-key>

ORACLE_THICK_MODE=false
```

#### 4. 배포 실행
```bash
# 배포 스크립트 실행
chmod +x deploy.sh
./deploy.sh
```

#### 5. 확인
```bash
# 컨테이너 상태 확인
docker-compose ps

# 로그 확인
docker-compose logs -f

# 헬스체크
curl http://localhost:3000/api/health
```

### Docker 관리 명령어
```bash
# 시작
docker-compose up -d

# 중지
docker-compose down

# 재시작
docker-compose restart

# 로그 보기
docker-compose logs -f tms

# 업데이트 및 재배포
git pull
./deploy.sh
```

---

## 🔧 방법 2: PM2 배포

### 장점
✅ 프로세스 관리 - 자동 재시작 및 클러스터링
✅ 모니터링 - 실시간 CPU/메모리 모니터링
✅ 로그 관리 - 통합 로그 수집

### 설치 단계

#### 1. Node.js 설치 (Ubuntu)
```bash
# NodeSource 저장소 추가
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Node.js 설치
sudo apt-get install -y nodejs

# 버전 확인
node --version  # v20.x.x
npm --version   # 10.x.x
```

#### 2. PM2 설치
```bash
sudo npm install -g pm2
```

#### 3. 프로젝트 설정
```bash
# 프로젝트 디렉토리 생성
sudo mkdir -p /var/www/tms
sudo chown -R $USER:$USER /var/www/tms

# 프로젝트 클론
git clone <your-repo-url> /var/www/tms
cd /var/www/tms

# 의존성 설치
npm ci --only=production

# 빌드
npm run build

# 환경 변수 설정
cp .env.production.example .env.production
nano .env.production  # 환경 변수 수정
```

#### 4. PM2로 실행
```bash
# PM2 시작
pm2 start ecosystem.config.js --env production

# 부팅 시 자동 시작 설정
pm2 startup
pm2 save

# 상태 확인
pm2 status
pm2 logs tms
pm2 monit
```

### PM2 관리 명령어
```bash
# 재시작
pm2 restart tms

# 중지
pm2 stop tms

# 로그 보기
pm2 logs tms

# 모니터링
pm2 monit

# 프로세스 삭제
pm2 delete tms

# 업데이트
git pull
npm ci --only=production
npm run build
pm2 reload tms
```

---

## ⚙️ 방법 3: Systemd 배포

### 장점
✅ 시스템 통합 - systemd와 네이티브 통합
✅ 자동 시작 - 부팅 시 자동 실행
✅ 리소스 제한 - CPU/메모리 제한 가능

### 설치 단계

#### 1. 프로젝트 설정 (PM2와 동일)
```bash
# 프로젝트 클론 및 빌드
sudo mkdir -p /var/www/tms
sudo chown -R www-data:www-data /var/www/tms
cd /var/www/tms
git clone <your-repo-url> .
npm ci --only=production
npm run build
```

#### 2. 환경 변수 파일 생성
```bash
sudo nano /var/www/tms/.env.production
```

#### 3. Systemd 서비스 등록
```bash
# 서비스 파일 복사
sudo cp systemd/tms.service /etc/systemd/system/

# systemd 재로드
sudo systemctl daemon-reload

# 서비스 활성화 및 시작
sudo systemctl enable tms
sudo systemctl start tms

# 상태 확인
sudo systemctl status tms
```

### Systemd 관리 명령어
```bash
# 시작
sudo systemctl start tms

# 중지
sudo systemctl stop tms

# 재시작
sudo systemctl restart tms

# 상태 확인
sudo systemctl status tms

# 로그 보기
sudo journalctl -u tms -f

# 부팅 시 자동 시작 설정
sudo systemctl enable tms

# 부팅 시 자동 시작 해제
sudo systemctl disable tms
```

---

## 🌐 Nginx 설정 (선택 사항)

### HTTPS 및 리버스 프록시 설정

#### 1. Nginx 설치
```bash
sudo apt-get update
sudo apt-get install nginx
```

#### 2. Nginx 설정 복사
```bash
# 설정 파일 복사
sudo cp nginx/nginx.conf /etc/nginx/nginx.conf

# 설정 파일 수정 (도메인 변경)
sudo nano /etc/nginx/nginx.conf
# your-domain.com을 실제 도메인으로 변경
```

#### 3. Let's Encrypt SSL 인증서 설치
```bash
# Certbot 설치
sudo apt-get install certbot python3-certbot-nginx

# SSL 인증서 발급
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# 자동 갱신 테스트
sudo certbot renew --dry-run
```

#### 4. Nginx 재시작
```bash
sudo nginx -t  # 설정 테스트
sudo systemctl restart nginx
```

---

## 🔍 모니터링 및 로그

### Docker
```bash
# 실시간 로그
docker-compose logs -f

# 특정 서비스 로그
docker-compose logs -f tms

# 마지막 100줄
docker-compose logs --tail=100 tms
```

### PM2
```bash
# 실시간 로그
pm2 logs tms

# 실시간 모니터링
pm2 monit

# 메트릭 확인
pm2 describe tms
```

### Systemd
```bash
# 실시간 로그
sudo journalctl -u tms -f

# 최근 100줄
sudo journalctl -u tms -n 100

# 오늘의 로그
sudo journalctl -u tms --since today
```

---

## 🛡️ 보안 권장사항

### 1. 방화벽 설정
```bash
# UFW 활성화
sudo ufw enable

# 필요한 포트만 개방
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS

# 상태 확인
sudo ufw status
```

### 2. 환경 변수 보안
```bash
# .env 파일 권한 설정
chmod 600 .env.production

# root 외 접근 불가
sudo chown root:root .env.production
```

### 3. 정기 업데이트
```bash
# 시스템 업데이트
sudo apt-get update && sudo apt-get upgrade -y

# Node.js 패키지 업데이트
npm audit fix
```

---

## 🐛 문제 해결

### 포트 충돌
```bash
# 3000 포트 사용 중인 프로세스 확인
sudo lsof -i :3000

# 프로세스 종료
sudo kill -9 <PID>
```

### 메모리 부족
```bash
# 메모리 사용량 확인
free -h

# PM2 프로세스 수 조정
# ecosystem.config.js의 instances 값 조정
```

### 빌드 실패
```bash
# 노드 모듈 재설치
rm -rf node_modules package-lock.json
npm install

# 캐시 정리
npm cache clean --force
rm -rf .next
```

---

## 📊 성능 최적화

### 1. Node.js 최적화
```bash
# 프로덕션 모드 설정
export NODE_ENV=production

# 메모리 힙 사이즈 조정
export NODE_OPTIONS="--max-old-space-size=2048"
```

### 2. Nginx 캐싱
nginx.conf에서 캐싱 설정 활성화 (이미 포함됨)

### 3. PM2 클러스터 모드
ecosystem.config.js의 `instances: 'max'` 설정으로 모든 CPU 코어 활용

---

## 🔄 업데이트 프로세스

### Docker
```bash
cd /opt/tms
git pull
./deploy.sh
```

### PM2
```bash
cd /var/www/tms
git pull
npm ci --only=production
npm run build
pm2 reload tms
```

### Systemd
```bash
cd /var/www/tms
git pull
npm ci --only=production
npm run build
sudo systemctl restart tms
```

---

## 📞 지원

문제가 발생하면:
1. 로그 확인 (위의 로그 명령어 참조)
2. GitHub Issues에 보고
3. 이메일 문의: support@tms.com
