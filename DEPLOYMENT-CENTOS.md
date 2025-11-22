# TMS v2.0 - CentOS/RHEL 배포 가이드 📚

CentOS 7/8, Rocky Linux 8/9, AlmaLinux 8/9 등 RHEL 계열 리눅스를 위한 완전한 배포 가이드입니다.

---

## 📋 목차

1. [사전 요구사항](#사전-요구사항)
2. [시스템 준비](#시스템-준비)
3. [방법 1: Docker 배포 (권장)](#방법-1-docker-배포-권장)
4. [방법 2: PM2 배포](#방법-2-pm2-배포)
5. [방법 3: Systemd 배포](#방법-3-systemd-배포)
6. [Nginx 설정](#nginx-설정)
7. [방화벽 설정](#방화벽-설정)
8. [SELinux 설정](#selinux-설정)
9. [모니터링 및 로그](#모니터링-및-로그)
10. [문제 해결](#문제-해결)

---

## 📋 사전 요구사항

### 시스템 요구사항
- **OS**: CentOS 7/8, Rocky Linux 8/9, AlmaLinux 8/9
- **CPU**: 최소 2코어 (권장 4코어)
- **메모리**: 최소 2GB RAM (권장 4GB)
- **디스크**: 최소 20GB (권장 50GB)
- **네트워크**: 인터넷 연결 필수

### 필요한 권한
```bash
# Root 권한 확인
sudo -v

# Root 계정으로 전환 (필요시)
sudo su -
```

### 방화벽 포트
- **3000**: TMS 애플리케이션
- **80**: HTTP (Nginx)
- **443**: HTTPS (Nginx)
- **22**: SSH

---

## 🔧 시스템 준비

### 1. 시스템 업데이트

#### CentOS 7
```bash
# 시스템 업데이트
sudo yum update -y

# EPEL 저장소 설치
sudo yum install -y epel-release
sudo yum update -y
```

#### CentOS 8 / Rocky Linux / AlmaLinux
```bash
# 시스템 업데이트
sudo dnf update -y

# EPEL 저장소 설치
sudo dnf install -y epel-release
sudo dnf update -y
```

### 2. 개발 도구 설치

```bash
# CentOS 7
sudo yum groupinstall -y "Development Tools"
sudo yum install -y git curl wget vim

# CentOS 8+
sudo dnf groupinstall -y "Development Tools"
sudo dnf install -y git curl wget vim
```

### 3. SELinux 확인 및 설정

```bash
# SELinux 상태 확인
getenforce

# SELinux 임시 비활성화 (권장하지 않음)
# sudo setenforce 0

# SELinux를 Permissive 모드로 설정 (권장)
sudo sed -i 's/SELINUX=enforcing/SELINUX=permissive/' /etc/selinux/config

# 재부팅 없이 적용 (경고 발생 가능)
sudo setenforce Permissive
```

### 4. 방화벽 기본 설정

```bash
# firewalld 시작 및 활성화
sudo systemctl start firewalld
sudo systemctl enable firewalld

# 기본 포트 개방
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload

# 방화벽 상태 확인
sudo firewall-cmd --list-all
```

---

## 🚀 방법 1: Docker 배포 (권장)

### 장점
✅ **환경 독립성** - OS 버전과 무관하게 동일하게 작동
✅ **간편한 관리** - 컨테이너 기반 격리
✅ **빠른 배포** - 5분 내 배포 완료
✅ **롤백 용이** - 이전 버전으로 즉시 복구
✅ **Nginx 포함** - 리버스 프록시 자동 구성

---

### Step 1: Docker 설치

#### CentOS 7에서 Docker 설치
```bash
# 기존 Docker 제거 (있을 경우)
sudo yum remove -y docker docker-client docker-client-latest \
    docker-common docker-latest docker-latest-logrotate \
    docker-logrotate docker-engine

# Docker 저장소 설정
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo \
    https://download.docker.com/linux/centos/docker-ce.repo

# Docker 설치
sudo yum install -y docker-ce docker-ce-cli containerd.io

# Docker 시작 및 자동 시작 설정
sudo systemctl start docker
sudo systemctl enable docker

# 현재 사용자를 docker 그룹에 추가
sudo usermod -aG docker $USER

# 그룹 변경 적용 (재로그인 필요)
newgrp docker

# Docker 설치 확인
docker --version
# 출력 예시: Docker version 24.0.7, build afdd53b
```

#### CentOS 8 / Rocky Linux / AlmaLinux에서 Docker 설치
```bash
# 기존 Docker 제거
sudo dnf remove -y docker docker-client docker-client-latest \
    docker-common docker-latest docker-latest-logrotate \
    docker-logrotate docker-engine podman runc

# Docker 저장소 설정
sudo dnf install -y dnf-plugins-core
sudo dnf config-manager --add-repo \
    https://download.docker.com/linux/centos/docker-ce.repo

# Docker 설치
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Docker 시작 및 자동 시작 설정
sudo systemctl start docker
sudo systemctl enable docker

# 현재 사용자를 docker 그룹에 추가
sudo usermod -aG docker $USER
newgrp docker

# Docker 설치 확인
docker --version
docker compose version
```

#### Docker 설치 확인
```bash
# Hello World 테스트
docker run hello-world

# 성공 메시지가 표시되면 정상 설치됨
```

---

### Step 2: 프로젝트 배포

```bash
# 1. 배포 디렉토리 생성
sudo mkdir -p /opt/tms
sudo chown -R $USER:$USER /opt/tms

# 2. 프로젝트 클론
cd /opt/tms
git clone <your-repository-url> .

# Git이 없는 경우, 파일을 직접 업로드할 수 있습니다:
# - WinSCP, FileZilla 등 FTP 클라이언트 사용
# - 또는 scp 명령어: scp -r /local/path user@server:/opt/tms
```

---

### Step 3: 환경 변수 설정

```bash
# 환경 변수 파일 생성
cd /opt/tms
cp .env.production.example .env.production

# 환경 변수 편집
vi .env.production
```

**필수 환경 변수 설정**:
```env
# 서버 설정
NODE_ENV=production
PORT=3000
NEXTAUTH_URL=https://your-domain.com  # 또는 http://서버IP:3000

# NextAuth 시크릿 생성 (아래 명령어 실행)
NEXTAUTH_SECRET=생성된_시크릿_값

# 암호화 키 생성 (아래 명령어 실행)
ENCRYPTION_KEY=생성된_암호화_키

# Supabase 설정
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Oracle 설정
ORACLE_THICK_MODE=false
```

**시크릿 키 생성**:
```bash
# NEXTAUTH_SECRET 생성 (32자 랜덤 문자열)
openssl rand -base64 32

# ENCRYPTION_KEY 생성 (32자 hex 문자열)
openssl rand -hex 16

# 생성된 값을 .env.production에 복사
```

**vi 에디터 사용법**:
```bash
# 편집 모드로 전환: i 키
# 저장하고 종료: ESC 후 :wq 입력
# 저장하지 않고 종료: ESC 후 :q! 입력
```

---

### Step 4: 배포 실행

```bash
# 배포 스크립트 실행 권한 부여
chmod +x deploy.sh

# 배포 실행
./deploy.sh

# 배포 진행 상황을 확인할 수 있습니다
# 약 5-10분 소요
```

**수동 배포 (deploy.sh가 작동하지 않을 경우)**:
```bash
# 1. Docker 이미지 빌드
docker compose build

# 2. 컨테이너 시작
docker compose up -d

# 3. 로그 확인
docker compose logs -f
```

---

### Step 5: 배포 확인

```bash
# 1. 컨테이너 상태 확인
docker compose ps

# 출력 예시:
# NAME        IMAGE       COMMAND                  STATUS    PORTS
# tms-app     tms:latest  "node server.js"         Up        0.0.0.0:3000->3000/tcp
# tms-nginx   nginx       "/docker-entrypoint.…"   Up        0.0.0.0:80->80/tcp

# 2. 헬스체크
curl http://localhost:3000/api/health

# 성공 응답:
# {"status":"ok","timestamp":"2024-01-01T00:00:00.000Z"}

# 3. 브라우저에서 접속
# http://서버IP:3000
```

---

### Docker 관리 명령어

```bash
# === 기본 명령어 ===

# 컨테이너 시작
docker compose up -d

# 컨테이너 중지
docker compose down

# 컨테이너 재시작
docker compose restart

# 컨테이너 상태 확인
docker compose ps

# === 로그 관리 ===

# 전체 로그 보기
docker compose logs

# 실시간 로그 (Ctrl+C로 종료)
docker compose logs -f

# 특정 서비스 로그
docker compose logs -f tms

# 마지막 100줄만 보기
docker compose logs --tail=100 tms

# === 업데이트 ===

# 코드 업데이트 후 재배포
cd /opt/tms
git pull
./deploy.sh

# 또는 수동으로:
docker compose down
docker compose build
docker compose up -d

# === 문제 해결 ===

# 컨테이너 내부 접속
docker compose exec tms sh

# 컨테이너 강제 재생성
docker compose up -d --force-recreate

# 모든 컨테이너 및 이미지 정리
docker compose down -v
docker system prune -a
```

---

## 🔧 방법 2: PM2 배포

### 장점
✅ **고성능** - 네이티브 Node.js 실행으로 최고 성능
✅ **클러스터링** - 멀티코어 CPU 완전 활용
✅ **프로세스 관리** - 자동 재시작 및 모니터링
✅ **메모리 효율** - Docker 오버헤드 없음

---

### Step 1: Node.js 설치

#### CentOS 7
```bash
# Node.js 20.x 저장소 추가
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -

# Node.js 설치
sudo yum install -y nodejs

# 버전 확인
node --version   # v20.x.x
npm --version    # 10.x.x
```

#### CentOS 8 / Rocky Linux / AlmaLinux
```bash
# Node.js 20.x 저장소 추가
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -

# Node.js 설치
sudo dnf install -y nodejs

# 버전 확인
node --version   # v20.x.x
npm --version    # 10.x.x
```

**Node.js 설치 확인**:
```bash
# Node.js 버전 확인
node --version

# npm 버전 확인
npm --version

# 테스트 실행
node -e "console.log('Node.js is working!')"
```

---

### Step 2: PM2 설치

```bash
# PM2 글로벌 설치
sudo npm install -g pm2

# PM2 버전 확인
pm2 --version

# PM2 상태 확인
pm2 status
```

---

### Step 3: 프로젝트 설정

```bash
# 1. 배포 디렉토리 생성
sudo mkdir -p /var/www/tms
sudo chown -R $USER:$USER /var/www/tms

# 2. 프로젝트 클론
cd /var/www/tms
git clone <your-repository-url> .

# 3. 의존성 설치 (5-10분 소요)
npm ci --only=production

# 4. 애플리케이션 빌드 (5-10분 소요)
npm run build

# 5. 빌드 확인
ls -la .next/
# .next 디렉토리가 생성되어 있어야 함
```

---

### Step 4: 환경 변수 설정

```bash
# 환경 변수 파일 생성
cp .env.production.example .env.production

# 환경 변수 편집
vi .env.production
```

앞서 Docker 섹션의 [환경 변수 설정](#step-3-환경-변수-설정)과 동일하게 설정

---

### Step 5: PM2로 애플리케이션 시작

```bash
# PM2로 애플리케이션 시작
pm2 start ecosystem.config.js --env production

# 상태 확인
pm2 status

# 출력 예시:
# ┌────┬────────┬─────────────┬─────────┬─────────┬──────────┐
# │ id │ name   │ mode        │ ↺       │ status  │ cpu      │
# ├────┼────────┼─────────────┼─────────┼─────────┼──────────┤
# │ 0  │ tms    │ cluster     │ 0       │ online  │ 0%       │
# └────┴────────┴─────────────┴─────────┴─────────┴──────────┘

# 로그 확인
pm2 logs tms

# 실시간 모니터링 (q로 종료)
pm2 monit
```

---

### Step 6: 부팅 시 자동 시작 설정

```bash
# PM2 startup 스크립트 생성
pm2 startup systemd

# 위 명령어 실행 후 출력되는 명령어를 실행
# 예시: sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u username --hp /home/username

# 현재 PM2 프로세스 저장
pm2 save

# PM2 서비스 상태 확인
sudo systemctl status pm2-$USER
```

---

### Step 7: 배포 확인

```bash
# 1. PM2 프로세스 확인
pm2 status

# 2. 헬스체크
curl http://localhost:3000/api/health

# 3. 브라우저에서 접속
# http://서버IP:3000
```

---

### PM2 관리 명령어

```bash
# === 프로세스 관리 ===

# 시작
pm2 start ecosystem.config.js --env production

# 중지
pm2 stop tms

# 재시작
pm2 restart tms

# 무중단 재시작 (Zero Downtime)
pm2 reload tms

# 프로세스 삭제
pm2 delete tms

# 모든 프로세스 중지
pm2 stop all

# 모든 프로세스 삭제
pm2 delete all

# === 모니터링 ===

# 상태 확인
pm2 status

# 실시간 로그
pm2 logs tms

# 최근 로그 (마지막 100줄)
pm2 logs tms --lines 100

# 에러 로그만 보기
pm2 logs tms --err

# 실시간 모니터링 대시보드
pm2 monit

# 프로세스 상세 정보
pm2 describe tms

# === 업데이트 ===

# 코드 업데이트
cd /var/www/tms
git pull

# 의존성 재설치
npm ci --only=production

# 빌드
npm run build

# 무중단 재시작
pm2 reload tms

# === 로그 관리 ===

# 로그 파일 위치
# /var/www/tms/logs/pm2-out.log
# /var/www/tms/logs/pm2-error.log

# 로그 비우기
pm2 flush

# 로그 파일 직접 확인
tail -f /var/www/tms/logs/pm2-out.log
```

---

## ⚙️ 방법 3: Systemd 배포

### 장점
✅ **시스템 통합** - systemd와 네이티브 통합
✅ **리소스 제한** - CPU/메모리 제한 가능
✅ **보안** - 상세한 보안 설정 가능

---

### Step 1-4: Node.js 및 프로젝트 설정

PM2 배포의 [Step 1-4](#step-1-nodejs-설치)와 동일하게 진행

---

### Step 5: Systemd 서비스 설정

```bash
# 1. 서비스 파일 복사
sudo cp /var/www/tms/systemd/tms.service /etc/systemd/system/

# 2. 서비스 파일 수정 (필요시)
sudo vi /etc/systemd/system/tms.service

# 3. systemd 데몬 재로드
sudo systemctl daemon-reload

# 4. 서비스 활성화 (부팅 시 자동 시작)
sudo systemctl enable tms

# 5. 서비스 시작
sudo systemctl start tms

# 6. 서비스 상태 확인
sudo systemctl status tms

# 출력 예시:
# ● tms.service - TMS v2.0 - Oracle Tuning Management System
#    Loaded: loaded (/etc/systemd/system/tms.service; enabled)
#    Active: active (running) since...
```

---

### Systemd 관리 명령어

```bash
# === 서비스 관리 ===

# 시작
sudo systemctl start tms

# 중지
sudo systemctl stop tms

# 재시작
sudo systemctl restart tms

# 상태 확인
sudo systemctl status tms

# === 부팅 시 자동 시작 ===

# 자동 시작 활성화
sudo systemctl enable tms

# 자동 시작 비활성화
sudo systemctl disable tms

# 자동 시작 여부 확인
sudo systemctl is-enabled tms

# === 로그 확인 ===

# 실시간 로그
sudo journalctl -u tms -f

# 최근 로그 (마지막 100줄)
sudo journalctl -u tms -n 100

# 오늘의 로그
sudo journalctl -u tms --since today

# 특정 기간의 로그
sudo journalctl -u tms --since "2024-01-01" --until "2024-01-02"

# === 업데이트 ===

# 코드 업데이트
cd /var/www/tms
sudo git pull
sudo npm ci --only=production
sudo npm run build

# 서비스 재시작
sudo systemctl restart tms
```

---

## 🌐 Nginx 설정

Nginx를 리버스 프록시로 사용하여 HTTPS 지원 및 성능 향상

### Step 1: Nginx 설치

```bash
# CentOS 7
sudo yum install -y nginx

# CentOS 8+
sudo dnf install -y nginx

# Nginx 버전 확인
nginx -v
```

---

### Step 2: Nginx 설정

```bash
# 1. 설정 파일 백업
sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup

# 2. 프로젝트의 Nginx 설정 복사
sudo cp /opt/tms/nginx/nginx.conf /etc/nginx/nginx.conf

# 또는 /var/www/tms 경로의 경우:
sudo cp /var/www/tms/nginx/nginx.conf /etc/nginx/nginx.conf

# 3. 도메인 설정 수정
sudo vi /etc/nginx/nginx.conf

# 파일 내에서 'your-domain.com'을 실제 도메인 또는 IP로 변경
# :%s/your-domain.com/실제도메인/g
# :wq

# 4. Nginx 설정 문법 확인
sudo nginx -t

# 출력: nginx: configuration file /etc/nginx/nginx.conf test is successful
```

---

### Step 3: SSL 인증서 설정 (HTTPS)

#### Let's Encrypt 무료 SSL 인증서

```bash
# 1. Certbot 설치 (CentOS 7)
sudo yum install -y certbot python2-certbot-nginx

# Certbot 설치 (CentOS 8+)
sudo dnf install -y certbot python3-certbot-nginx

# 2. SSL 인증서 발급
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# 이메일 입력 및 약관 동의 후 진행
# 리다이렉트 설정: 2번 선택 (HTTP -> HTTPS 자동 리다이렉트)

# 3. 자동 갱신 설정
sudo certbot renew --dry-run

# 4. Cron 작업 추가 (자동 갱신)
echo "0 3 * * * certbot renew --quiet" | sudo tee -a /etc/crontab
```

#### 자체 서명 인증서 (테스트용)

```bash
# 1. SSL 디렉토리 생성
sudo mkdir -p /etc/nginx/ssl

# 2. 자체 서명 인증서 생성
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/key.pem \
    -out /etc/nginx/ssl/cert.pem

# 국가, 지역, 조직 정보 입력

# 3. 권한 설정
sudo chmod 600 /etc/nginx/ssl/key.pem
sudo chmod 644 /etc/nginx/ssl/cert.pem
```

---

### Step 4: Nginx 시작

```bash
# Nginx 시작
sudo systemctl start nginx

# 부팅 시 자동 시작
sudo systemctl enable nginx

# 상태 확인
sudo systemctl status nginx

# Nginx 재시작
sudo systemctl restart nginx
```

---

### Nginx 관리 명령어

```bash
# === 서비스 관리 ===

# 시작
sudo systemctl start nginx

# 중지
sudo systemctl stop nginx

# 재시작
sudo systemctl restart nginx

# 설정 리로드 (무중단)
sudo systemctl reload nginx

# 상태 확인
sudo systemctl status nginx

# === 설정 관리 ===

# 설정 문법 확인
sudo nginx -t

# 설정 파일 위치
# /etc/nginx/nginx.conf

# 로그 파일 위치
# /var/log/nginx/access.log
# /var/log/nginx/error.log

# 로그 실시간 확인
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## 🔥 방화벽 설정

### firewalld 설정

```bash
# === 기본 포트 개방 ===

# HTTP (80)
sudo firewall-cmd --permanent --add-service=http

# HTTPS (443)
sudo firewall-cmd --permanent --add-service=https

# TMS 애플리케이션 (3000) - Nginx 사용 시 불필요
sudo firewall-cmd --permanent --add-port=3000/tcp

# 설정 적용
sudo firewall-cmd --reload

# === 포트 포워딩 (선택사항) ===

# 80 -> 3000 포워딩
sudo firewall-cmd --permanent --add-forward-port=port=80:proto=tcp:toport=3000

# 443 -> 3000 포워딩 (HTTPS 종료를 애플리케이션에서 처리하는 경우)
sudo firewall-cmd --permanent --add-forward-port=port=443:proto=tcp:toport=3000

# 설정 적용
sudo firewall-cmd --reload

# === 방화벽 확인 ===

# 현재 설정 확인
sudo firewall-cmd --list-all

# 특정 포트 확인
sudo firewall-cmd --query-port=3000/tcp

# === 특정 IP만 허용 ===

# 신뢰할 수 있는 IP 추가
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.1.100" port port="3000" protocol="tcp" accept'

# 설정 적용
sudo firewall-cmd --reload

# === 방화벽 비활성화 (권장하지 않음) ===

# 방화벽 중지
sudo systemctl stop firewalld

# 방화벽 비활성화
sudo systemctl disable firewalld
```

### iptables 설정 (CentOS 7)

```bash
# firewalld 대신 iptables 사용하는 경우

# iptables 설치
sudo yum install -y iptables-services

# firewalld 중지
sudo systemctl stop firewalld
sudo systemctl disable firewalld

# iptables 시작
sudo systemctl start iptables
sudo systemctl enable iptables

# 기본 규칙 추가
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT   # SSH
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT   # HTTP
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT  # HTTPS
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT # TMS

# 규칙 저장
sudo service iptables save

# 규칙 확인
sudo iptables -L -n
```

---

## 🔒 SELinux 설정

### SELinux 상태 확인

```bash
# 현재 모드 확인
getenforce

# 상세 정보 확인
sestatus
```

### SELinux 허용 설정 (Enforcing 모드 유지)

```bash
# === HTTP 네트워크 연결 허용 ===

# Nginx에서 외부 연결 허용
sudo setsebool -P httpd_can_network_connect 1

# === 포트 컨텍스트 추가 ===

# 3000 포트를 HTTP 포트로 추가
sudo semanage port -a -t http_port_t -p tcp 3000

# 포트 목록 확인
sudo semanage port -l | grep http_port_t

# === 파일 컨텍스트 설정 ===

# TMS 디렉토리 컨텍스트 설정 (Docker 사용 시)
sudo semanage fcontext -a -t container_file_t "/opt/tms(/.*)?"
sudo restorecon -Rv /opt/tms

# TMS 디렉토리 컨텍스트 설정 (PM2/Systemd 사용 시)
sudo semanage fcontext -a -t httpd_sys_content_t "/var/www/tms(/.*)?"
sudo restorecon -Rv /var/www/tms

# === SELinux 문제 해결 ===

# SELinux 로그 확인
sudo ausearch -m avc -ts recent

# 거부된 작업 확인
sudo audit2why < /var/log/audit/audit.log

# 임시 허용 정책 생성 (문제가 있는 경우)
sudo audit2allow -a -M tms_policy
sudo semodule -i tms_policy.pp
```

### SELinux Permissive 모드 (권장)

```bash
# Permissive 모드로 변경 (로그만 기록, 차단하지 않음)
sudo setenforce Permissive

# 영구 적용
sudo sed -i 's/SELINUX=enforcing/SELINUX=permissive/' /etc/selinux/config

# 확인
getenforce  # Permissive
```

### SELinux 비활성화 (비추천)

```bash
# 영구 비활성화
sudo sed -i 's/SELINUX=enforcing/SELINUX=disabled/' /etc/selinux/config

# 재부팅 필요
sudo reboot

# 재부팅 후 확인
getenforce  # Disabled
```

---

## 📊 모니터링 및 로그

### 시스템 리소스 모니터링

```bash
# === CPU 및 메모리 확인 ===

# 실시간 모니터링
top

# 또는 htop (설치 필요)
sudo yum install -y htop  # CentOS 7
sudo dnf install -y htop  # CentOS 8+
htop

# 메모리 사용량
free -h

# 디스크 사용량
df -h

# === 프로세스 확인 ===

# TMS 프로세스 확인
ps aux | grep node

# 포트 사용 확인
sudo netstat -tulpn | grep 3000
# 또는
sudo ss -tulpn | grep 3000

# === 네트워크 확인 ===

# 네트워크 연결 확인
curl http://localhost:3000/api/health

# 외부에서 접근 확인
curl http://서버IP:3000/api/health
```

### 애플리케이션 로그

#### Docker 로그
```bash
# 실시간 로그
docker compose logs -f

# 특정 서비스 로그
docker compose logs -f tms

# 마지막 100줄
docker compose logs --tail=100 tms

# 특정 시간 이후 로그
docker compose logs --since 2024-01-01T00:00:00 tms
```

#### PM2 로그
```bash
# 실시간 로그
pm2 logs tms

# 로그 파일 직접 확인
tail -f /var/www/tms/logs/pm2-out.log
tail -f /var/www/tms/logs/pm2-error.log

# 로그 파일 크기 제한 설정
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 10
```

#### Systemd 로그
```bash
# 실시간 로그
sudo journalctl -u tms -f

# 최근 100줄
sudo journalctl -u tms -n 100

# 오늘의 로그
sudo journalctl -u tms --since today

# 에러만 필터링
sudo journalctl -u tms -p err

# 로그 저장
sudo journalctl -u tms > tms.log
```

#### Nginx 로그
```bash
# 접속 로그 (실시간)
sudo tail -f /var/log/nginx/access.log

# 에러 로그 (실시간)
sudo tail -f /var/log/nginx/error.log

# 최근 100줄
sudo tail -n 100 /var/log/nginx/access.log

# 로그 파일 크기 확인
sudo du -sh /var/log/nginx/*

# 로그 로테이션 설정 확인
cat /etc/logrotate.d/nginx
```

### 로그 로테이션 설정

```bash
# Nginx 로그 로테이션 설정
sudo vi /etc/logrotate.d/nginx

# 내용:
/var/log/nginx/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 nginx adm
    sharedscripts
    postrotate
        if [ -f /var/run/nginx.pid ]; then
            kill -USR1 `cat /var/run/nginx.pid`
        fi
    endscript
}
```

---

## 🐛 문제 해결

### 일반적인 문제

#### 1. 포트 충돌 (Address already in use)

```bash
# 문제: 포트가 이미 사용 중

# 해결: 사용 중인 프로세스 확인
sudo lsof -i :3000
# 또는
sudo netstat -tulpn | grep 3000

# 프로세스 종료
sudo kill -9 <PID>

# 또는 Docker 컨테이너 확인
docker ps | grep 3000
docker stop <container-name>
```

#### 2. 메모리 부족 (Out of Memory)

```bash
# 문제: 메모리 부족으로 프로세스 종료

# 메모리 사용량 확인
free -h

# Swap 메모리 추가 (2GB 예시)
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# 영구 적용
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# PM2 메모리 제한 조정
# ecosystem.config.js에서 max_memory_restart 값 조정
```

#### 3. 권한 문제 (Permission denied)

```bash
# 문제: 파일/디렉토리 권한 부족

# 디렉토리 소유권 변경
sudo chown -R $USER:$USER /opt/tms
# 또는
sudo chown -R www-data:www-data /var/www/tms

# 파일 권한 설정
chmod 755 /opt/tms
chmod 644 /opt/tms/.env.production
chmod +x /opt/tms/deploy.sh

# SELinux 컨텍스트 복원
sudo restorecon -Rv /opt/tms
```

#### 4. Docker 빌드 실패

```bash
# 문제: Docker 이미지 빌드 실패

# 빌드 캐시 삭제 후 재시도
docker compose build --no-cache

# Docker 시스템 정리
docker system prune -a

# 디스크 공간 확인
df -h
```

#### 5. Nginx 502 Bad Gateway

```bash
# 문제: Nginx에서 502 에러 발생

# 1. TMS 애플리케이션 상태 확인
curl http://localhost:3000/api/health

# 2. Nginx 에러 로그 확인
sudo tail -f /var/log/nginx/error.log

# 3. SELinux 문제 확인
sudo ausearch -m avc -ts recent

# 4. Nginx 네트워크 연결 허용
sudo setsebool -P httpd_can_network_connect 1

# 5. Nginx 재시작
sudo systemctl restart nginx
```

#### 6. 환경 변수 미적용

```bash
# 문제: 환경 변수가 적용되지 않음

# .env.production 파일 확인
cat .env.production

# 파일 권한 확인
ls -la .env.production

# Docker 컨테이너 재시작
docker compose down
docker compose up -d

# PM2 재시작
pm2 restart tms --update-env

# Systemd 재시작
sudo systemctl restart tms
```

### 로그 분석

```bash
# === 에러 메시지 검색 ===

# Docker 로그에서 에러 찾기
docker compose logs tms | grep -i error

# PM2 로그에서 에러 찾기
pm2 logs tms --err

# Systemd 로그에서 에러 찾기
sudo journalctl -u tms -p err

# Nginx 에러 로그
sudo grep -i error /var/log/nginx/error.log

# === 일반적인 에러 패턴 ===

# 1. Database connection error
# -> Supabase URL/Key 확인

# 2. ECONNREFUSED
# -> 애플리케이션이 실행 중인지 확인

# 3. MODULE_NOT_FOUND
# -> npm ci 재실행

# 4. Permission denied
# -> 파일 권한 및 소유권 확인
```

---

## 🔄 업데이트 및 유지보수

### 정기 업데이트

```bash
# === 시스템 업데이트 ===

# CentOS 7
sudo yum update -y

# CentOS 8+
sudo dnf update -y

# 재부팅 (필요시)
sudo reboot

# === 애플리케이션 업데이트 ===

# Docker 방식
cd /opt/tms
git pull
./deploy.sh

# PM2 방식
cd /var/www/tms
git pull
npm ci --only=production
npm run build
pm2 reload tms

# Systemd 방식
cd /var/www/tms
sudo git pull
sudo npm ci --only=production
sudo npm run build
sudo systemctl restart tms
```

### 백업

```bash
# === 데이터베이스 백업 ===
# Supabase 대시보드에서 백업 설정

# === 애플리케이션 백업 ===

# Docker 방식
cd /opt/tms
tar -czf tms-backup-$(date +%Y%m%d).tar.gz \
    .env.production docker-compose.yml nginx/

# PM2/Systemd 방식
cd /var/www/tms
tar -czf tms-backup-$(date +%Y%m%d).tar.gz \
    .env.production ecosystem.config.js logs/

# 백업 파일 다운로드
# scp user@server:/path/to/backup.tar.gz /local/path
```

### 모니터링 설정

```bash
# === 자동 재시작 모니터링 ===

# Docker: 이미 자동 재시작 설정됨 (restart: unless-stopped)

# PM2: 이미 자동 재시작 설정됨

# Systemd: 이미 자동 재시작 설정됨 (Restart=always)

# === 헬스체크 스크립트 ===

# /usr/local/bin/tms-healthcheck.sh
cat << 'EOF' | sudo tee /usr/local/bin/tms-healthcheck.sh
#!/bin/bash
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health)
if [ "$response" != "200" ]; then
    echo "TMS health check failed with status: $response"
    # 알림 전송 (이메일, Slack 등)
    # systemctl restart tms  # 자동 재시작
fi
EOF

sudo chmod +x /usr/local/bin/tms-healthcheck.sh

# Cron 작업 추가 (5분마다 체크)
echo "*/5 * * * * /usr/local/bin/tms-healthcheck.sh" | sudo tee -a /etc/crontab
```

---

## 📚 추가 리소스

### 유용한 명령어 모음

```bash
# === 시스템 정보 ===

# OS 버전 확인
cat /etc/redhat-release

# 커널 버전
uname -r

# CPU 정보
lscpu

# 메모리 정보
free -h

# 디스크 정보
df -h

# 네트워크 인터페이스
ip addr show

# === 서비스 관리 ===

# 모든 서비스 상태
sudo systemctl list-units --type=service

# 실행 중인 서비스
sudo systemctl list-units --type=service --state=running

# 시작 실패한 서비스
sudo systemctl list-units --type=service --state=failed

# === 네트워크 ===

# 열린 포트 확인
sudo netstat -tulpn
# 또는
sudo ss -tulpn

# 방화벽 상태
sudo firewall-cmd --state
sudo firewall-cmd --list-all

# DNS 확인
nslookup your-domain.com
dig your-domain.com
```

### 성능 최적화

```bash
# === Node.js 최적화 ===

# 프로덕션 모드 확인
echo $NODE_ENV  # production

# V8 힙 메모리 설정
export NODE_OPTIONS="--max-old-space-size=2048"

# === PM2 클러스터 최적화 ===

# CPU 코어 수 확인
nproc

# ecosystem.config.js에서 instances 조정
# instances: 4,  # 코어 수에 맞게 조정

# === Nginx 최적화 ===

# worker_processes 최적화
# /etc/nginx/nginx.conf
# worker_processes auto;

# 연결 수 증가
# worker_connections 2048;
```

---

## 🎓 참고 자료

- [CentOS 공식 문서](https://docs.centos.org/)
- [Docker 공식 문서](https://docs.docker.com/)
- [PM2 공식 문서](https://pm2.keymetrics.io/)
- [Nginx 공식 문서](https://nginx.org/en/docs/)
- [Next.js 배포 가이드](https://nextjs.org/docs/deployment)

---

## 📞 지원

문제가 발생하면:
1. 위의 [문제 해결](#문제-해결) 섹션 참조
2. 로그 확인 후 에러 메시지 기록
3. GitHub Issues에 에러 로그와 함께 보고
4. 이메일 문의: support@tms.com

---

**배포 성공을 기원합니다! 🚀**
