# Narae TMS v2.0 - 프로덕션 배포 가이드

PM2 + Nginx 환경에서 리눅스 서버에 Narae TMS v2.0을 배포하는 완벽한 가이드입니다.

## 📋 목차

1. [서버 요구사항](#서버-요구사항)
2. [사전 준비](#사전-준비)
3. [소프트웨어 설치](#소프트웨어-설치)
4. [Oracle Instant Client 설치](#oracle-instant-client-설치)
5. [프로젝트 배포](#프로젝트-배포)
6. [PM2 설정](#pm2-설정)
7. [Nginx 설정](#nginx-설정)
8. [SSL 인증서 설정](#ssl-인증서-설정)
9. [방화벽 설정](#방화벽-설정)
10. [모니터링 및 로그](#모니터링-및-로그)
11. [트러블슈팅](#트러블슈팅)

---

## 서버 요구사항

### 최소 사양
- **CPU**: 2 cores
- **RAM**: 4GB
- **Storage**: 20GB SSD
- **OS**: Ubuntu 20.04 LTS 이상

### 권장 사양
- **CPU**: 4+ cores
- **RAM**: 8GB+
- **Storage**: 50GB+ SSD
- **OS**: Ubuntu 22.04 LTS
- **Network**: 1Gbps

---

## 사전 준비

### 1. 시스템 업데이트
```bash
sudo apt update && sudo apt upgrade -y
sudo reboot
```

### 2. 기본 도구 설치
```bash
sudo apt install -y git curl wget vim build-essential
```

### 3. 사용자 생성 (선택사항)
```bash
# deploy 사용자 생성
sudo adduser deploy
sudo usermod -aG sudo deploy

# SSH 키 설정
su - deploy
mkdir -p ~/.ssh
chmod 700 ~/.ssh
```

---

## 소프트웨어 설치

### 1. Node.js 20.x LTS 설치
```bash
# NodeSource repository 추가
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Node.js 설치
sudo apt-get install -y nodejs

# 버전 확인
node --version  # v20.x.x
npm --version   # 10.x.x
```

### 2. PM2 전역 설치
```bash
sudo npm install -g pm2

# PM2 버전 확인
pm2 --version
```

### 3. Nginx 설치
```bash
sudo apt install -y nginx

# Nginx 시작 및 자동 시작 설정
sudo systemctl start nginx
sudo systemctl enable nginx

# 상태 확인
sudo systemctl status nginx
```

---

## Oracle Instant Client 설치

### 1. Oracle Instant Client 다운로드

Oracle 공식 사이트에서 다운로드:
https://www.oracle.com/database/technologies/instant-client/linux-x86-64-downloads.html

필수 패키지:
- `instantclient-basic-linux.x64-21.x.0.0.0.zip`
- `instantclient-sqlplus-linux.x64-21.x.0.0.0.zip`
- `instantclient-sdk-linux.x64-21.x.0.0.0.zip`

### 2. 설치 디렉토리 생성
```bash
sudo mkdir -p /usr/lib/oracle/21/client64
cd /usr/lib/oracle/21/client64
```

### 3. ZIP 파일 압축 해제
```bash
sudo unzip /path/to/instantclient-basic-linux.x64-21.x.0.0.0.zip
sudo unzip /path/to/instantclient-sqlplus-linux.x64-21.x.0.0.0.zip
sudo unzip /path/to/instantclient-sdk-linux.x64-21.x.0.0.0.zip

# 파일 이동
sudo mv instantclient_21_* lib
cd lib
```

### 4. 라이브러리 경로 설정
```bash
# ldconfig에 Oracle 라이브러리 경로 추가
sudo sh -c "echo /usr/lib/oracle/21/client64/lib > /etc/ld.so.conf.d/oracle-instantclient.conf"
sudo ldconfig

# 환경 변수 설정
sudo nano /etc/environment
```

다음 내용 추가:
```
LD_LIBRARY_PATH=/usr/lib/oracle/21/client64/lib
ORACLE_HOME=/usr/lib/oracle/21/client64
```

### 5. 재로그인 또는 환경 변수 적용
```bash
source /etc/environment
```

### 6. 설치 확인
```bash
ls -la /usr/lib/oracle/21/client64/lib/
sqlplus -v  # SQL*Plus: Release 21.x.0.0.0
```

---

## 프로젝트 배포

### 1. 프로젝트 디렉토리 생성
```bash
sudo mkdir -p /var/www/narae-tms
sudo chown -R $USER:$USER /var/www/narae-tms
```

### 2. Git 저장소 클론
```bash
cd /var/www
git clone your-repository-url narae-tms
cd narae-tms
```

### 3. 환경 변수 설정
```bash
cp .env.production.example .env.production
nano .env.production
```

필수 환경 변수 설정:
```bash
NODE_ENV=production
PORT=3000
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=your-generated-secret

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Oracle Instant Client
LD_LIBRARY_PATH=/usr/lib/oracle/21/client64/lib
ORACLE_HOME=/usr/lib/oracle/21/client64
TNS_ADMIN=/usr/lib/oracle/21/client64/network/admin
```

### 4. 의존성 설치
```bash
npm ci
```

### 5. 프로덕션 빌드 (Next.js 14 사용 시)
```bash
# Note: Next.js 15 + React 19 조합은 빌드 에러 발생 가능
# 옵션 1: Next.js 14로 다운그레이드
npm install next@14.2.18

# 옵션 2: React 18로 다운그레이드
npm install react@18.3.1 react-dom@18.3.1

# 빌드 실행
npm run build
```

---

## PM2 설정

### 1. PM2 Ecosystem 파일 확인
프로젝트 루트의 `ecosystem.config.js` 파일을 확인하고 필요시 수정:

```javascript
module.exports = {
  apps: [{
    name: 'narae-tms',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    cwd: '/var/www/narae-tms',
    instances: 'max',
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      LD_LIBRARY_PATH: '/usr/lib/oracle/21/client64/lib',
      ORACLE_HOME: '/usr/lib/oracle/21/client64',
    },
  }],
};
```

### 2. PM2로 애플리케이션 시작
```bash
cd /var/www/narae-tms
pm2 start ecosystem.config.js --env production
```

### 3. PM2 프로세스 확인
```bash
pm2 status
pm2 logs narae-tms
```

### 4. PM2 자동 시작 설정
```bash
# Systemd 스크립트 생성
pm2 startup systemd

# 출력된 명령어 실행 (예시)
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp /home/$USER

# 현재 PM2 프로세스 목록 저장
pm2 save
```

### 5. PM2 유용한 명령어
```bash
pm2 status                # 상태 확인
pm2 logs narae-tms        # 로그 보기
pm2 monit                 # 실시간 모니터링
pm2 restart narae-tms     # 재시작
pm2 reload narae-tms      # 무중단 재시작
pm2 stop narae-tms        # 중지
pm2 delete narae-tms      # 삭제
```

---

## Nginx 설정

### 1. Nginx 설정 파일 생성
```bash
sudo nano /etc/nginx/sites-available/narae-tms
```

프로젝트의 `nginx.conf` 내용을 복사하고 다음 항목 수정:
- `your-domain.com` → 실제 도메인
- SSL 인증서 경로 (Let's Encrypt 사용 시)

### 2. Nginx 캐시 디렉토리 생성
```bash
sudo mkdir -p /var/cache/nginx
sudo chown -R www-data:www-data /var/cache/nginx
```

### 3. Nginx 설정 파일 심볼릭 링크
```bash
sudo ln -s /etc/nginx/sites-available/narae-tms /etc/nginx/sites-enabled/
```

### 4. 기본 사이트 비활성화 (선택사항)
```bash
sudo rm /etc/nginx/sites-enabled/default
```

### 5. Nginx 설정 테스트
```bash
sudo nginx -t
```

### 6. Nginx 재시작
```bash
sudo systemctl reload nginx
# 또는
sudo systemctl restart nginx
```

---

## SSL 인증서 설정

### Let's Encrypt (무료 SSL)

#### 1. Certbot 설치
```bash
sudo apt install -y certbot python3-certbot-nginx
```

#### 2. SSL 인증서 발급
```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

#### 3. 자동 갱신 테스트
```bash
sudo certbot renew --dry-run
```

#### 4. 자동 갱신 설정 확인
```bash
sudo systemctl status certbot.timer
```

### 수동 SSL 인증서 사용

#### 1. 인증서 파일 업로드
```bash
sudo mkdir -p /etc/nginx/ssl
sudo cp your-certificate.crt /etc/nginx/ssl/
sudo cp your-private-key.key /etc/nginx/ssl/
sudo chmod 600 /etc/nginx/ssl/your-private-key.key
```

#### 2. Nginx 설정에서 경로 수정
```nginx
ssl_certificate /etc/nginx/ssl/your-certificate.crt;
ssl_certificate_key /etc/nginx/ssl/your-private-key.key;
```

---

## 방화벽 설정

### UFW 방화벽 설정
```bash
# UFW 설치 (미설치 시)
sudo apt install -y ufw

# 기본 정책 설정
sudo ufw default deny incoming
sudo ufw default allow outgoing

# SSH 허용 (중요!)
sudo ufw allow OpenSSH

# HTTP/HTTPS 허용
sudo ufw allow 'Nginx Full'

# 또는 개별 포트 허용
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 방화벽 활성화
sudo ufw enable

# 상태 확인
sudo ufw status
```

---

## 모니터링 및 로그

### 로그 디렉토리 생성
```bash
sudo mkdir -p /var/log/narae-tms
sudo chown -R $USER:$USER /var/log/narae-tms
```

### PM2 로그 확인
```bash
# 실시간 로그
pm2 logs narae-tms

# 최근 100줄
pm2 logs narae-tms --lines 100

# 에러 로그만
pm2 logs narae-tms --err

# 로그 파일 위치
/var/log/narae-tms/pm2-error.log
/var/log/narae-tms/pm2-out.log
/var/log/narae-tms/pm2-combined.log
```

### Nginx 로그 확인
```bash
# Access 로그
sudo tail -f /var/log/nginx/narae-tms-access.log

# Error 로그
sudo tail -f /var/log/nginx/narae-tms-error.log
```

### PM2 모니터링
```bash
# 실시간 모니터링 대시보드
pm2 monit

# 상태 확인
pm2 status

# 메모리/CPU 사용량
pm2 describe narae-tms
```

### 시스템 모니터링
```bash
# 시스템 리소스
htop

# 디스크 사용량
df -h

# 메모리 사용량
free -h

# 네트워크 연결
netstat -tulpn | grep LISTEN
```

---

## 트러블슈팅

### 애플리케이션이 시작되지 않는 경우

#### 1. PM2 로그 확인
```bash
pm2 logs narae-tms --err
```

#### 2. 포트 충돌 확인
```bash
sudo lsof -i :3000
# 프로세스 종료
sudo kill -9 <PID>
```

#### 3. 환경 변수 확인
```bash
pm2 env narae-tms
```

### Oracle 연결 오류

#### 1. Oracle Instant Client 경로 확인
```bash
echo $LD_LIBRARY_PATH
ls -la /usr/lib/oracle/21/client64/lib/
```

#### 2. 라이브러리 로드 확인
```bash
ldd /usr/lib/oracle/21/client64/lib/libclntsh.so
```

#### 3. TNS 설정 확인 (tnsnames.ora)
```bash
cat /usr/lib/oracle/21/client64/network/admin/tnsnames.ora
```

### Nginx 502 Bad Gateway

#### 1. PM2 프로세스 확인
```bash
pm2 status
```

#### 2. 애플리케이션 포트 확인
```bash
curl http://localhost:3000
```

#### 3. Nginx 에러 로그
```bash
sudo tail -f /var/log/nginx/error.log
```

### 메모리 부족

#### 1. PM2 인스턴스 수 줄이기
```javascript
// ecosystem.config.js
instances: 2,  // 'max' 대신 고정 숫자
```

#### 2. Node.js 메모리 제한
```javascript
// ecosystem.config.js
node_args: '--max-old-space-size=1024',  // 1GB
```

### SSL 인증서 문제

#### 1. 인증서 갱신
```bash
sudo certbot renew
```

#### 2. Nginx 재시작
```bash
sudo systemctl restart nginx
```

---

## 자동 배포

프로젝트에 포함된 `deploy.sh` 스크립트를 사용하여 자동 배포:

```bash
cd /var/www/narae-tms
chmod +x deploy.sh
./deploy.sh
```

배포 스크립트는 다음을 수행합니다:
1. ✅ 백업 생성
2. ✅ Git pull
3. ✅ 의존성 설치
4. ✅ 프로덕션 빌드
5. ✅ PM2 무중단 재시작
6. ✅ Nginx 설정 테스트 및 재시작
7. ✅ 헬스 체크

---

## 보안 권장사항

### 1. SSH 보안 강화
```bash
# 비밀번호 인증 비활성화
sudo nano /etc/ssh/sshd_config
# PasswordAuthentication no

# SSH 재시작
sudo systemctl restart sshd
```

### 2. Fail2Ban 설치
```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
```

### 3. 정기 백업 설정
```bash
# Cron 작업 추가
crontab -e

# 매일 새벽 2시 백업
0 2 * * * /var/www/narae-tms/backup.sh
```

### 4. 보안 헤더 확인
```bash
curl -I https://your-domain.com
```

---

## 성능 최적화

### 1. Nginx Gzip 압축 활성화
Nginx 설정에 이미 포함되어 있습니다.

### 2. PM2 클러스터 모드 사용
CPU 코어 수만큼 인스턴스 실행 (`instances: 'max'`)

### 3. Redis 캐싱 (선택사항)
```bash
sudo apt install -y redis-server
sudo systemctl enable redis-server
```

### 4. CDN 사용 (선택사항)
정적 파일을 CDN으로 서빙하여 서버 부하 감소

---

## 유용한 리소스

- [Next.js 공식 문서](https://nextjs.org/docs)
- [PM2 공식 문서](https://pm2.keymetrics.io/docs)
- [Nginx 공식 문서](https://nginx.org/en/docs/)
- [Let's Encrypt 문서](https://letsencrypt.org/docs/)
- [Oracle Instant Client 문서](https://www.oracle.com/database/technologies/instant-client.html)

---

## 지원

문제가 발생하면 다음을 확인하세요:
1. PM2 로그: `pm2 logs narae-tms`
2. Nginx 로그: `sudo tail -f /var/log/nginx/error.log`
3. 시스템 로그: `sudo journalctl -xe`

---

**작성일**: 2025-01-22
**버전**: v2.0
**작성자**: 주식회사 나래정보기술
