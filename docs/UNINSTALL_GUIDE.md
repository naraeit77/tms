# Narae TMS v2.0 삭제 가이드 (Oracle Linux 8.6)

**대상 환경**: Oracle Linux 8.6
**도메인**: sqltms.info
**프로세스 관리**: PM2
**웹 서버**: Nginx

---

## ⚠️ 주의사항

- 이 작업은 **되돌릴 수 없습니다**.
- 삭제 전 반드시 **백업**을 수행하세요.
- 삭제 작업은 **root 또는 sudo 권한**이 필요합니다.
- 데이터베이스는 Supabase에 저장되어 있으므로 서버 삭제 시에도 유지됩니다.

---

## 목차

1. [빠른 삭제 스크립트](#1-빠른-삭제-스크립트)
2. [단계별 수동 삭제](#2-단계별-수동-삭제)
3. [부분 삭제 (선택사항)](#3-부분-삭제-선택사항)
4. [완전 삭제 확인](#4-완전-삭제-확인)

---

## 1. 빠른 삭제 스크립트

### 1.1 자동 삭제 스크립트 생성

```bash
cat > /tmp/uninstall_tms.sh << 'EOF'
#!/bin/bash

################################################################################
# Narae TMS v2.0 완전 삭제 스크립트
# Domain: sqltms.info
################################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_step() {
    echo -e "${GREEN}[STEP]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo ""
echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║                                                            ║${NC}"
echo -e "${RED}║         ⚠️  Narae TMS v2.0 완전 삭제 스크립트 ⚠️          ║${NC}"
echo -e "${RED}║                                                            ║${NC}"
echo -e "${RED}║         이 작업은 되돌릴 수 없습니다!                      ║${NC}"
echo -e "${RED}║                                                            ║${NC}"
echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 확인 프롬프트
read -p "정말로 Narae TMS를 완전히 삭제하시겠습니까? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "삭제가 취소되었습니다."
    exit 0
fi

echo ""
read -p "백업을 생성하시겠습니까? (y/n): " BACKUP
if [[ $BACKUP =~ ^[Yy]$ ]]; then
    print_step "백업 생성 중..."
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    mkdir -p /var/backups/tms
    cd /var/www/tms
    tar -czf /var/backups/tms/final_backup_$TIMESTAMP.tar.gz . || true
    echo -e "${GREEN}백업 완료: /var/backups/tms/final_backup_$TIMESTAMP.tar.gz${NC}"
fi

echo ""
echo -e "${YELLOW}삭제를 시작합니다...${NC}"
sleep 2

# 1. PM2 프로세스 중지 및 삭제
print_step "1/12 - PM2 프로세스 중지 및 삭제"
if command -v pm2 &> /dev/null; then
    pm2 stop narae-tms 2>/dev/null || true
    pm2 delete narae-tms 2>/dev/null || true
    pm2 save --force
    echo "PM2 프로세스 삭제 완료"
else
    print_warning "PM2가 설치되어 있지 않습니다."
fi

# 2. PM2 startup 스크립트 제거
print_step "2/12 - PM2 부팅 시 자동 시작 제거"
if command -v pm2 &> /dev/null; then
    pm2 unstartup systemd 2>/dev/null || true
    sudo systemctl stop pm2-tms 2>/dev/null || true
    sudo systemctl disable pm2-tms 2>/dev/null || true
    sudo rm -f /etc/systemd/system/pm2-tms.service
    sudo systemctl daemon-reload
    echo "PM2 자동 시작 제거 완료"
fi

# 3. Nginx 설정 제거
print_step "3/12 - Nginx 설정 제거"
if [ -f "/etc/nginx/conf.d/sqltms.info.conf" ]; then
    sudo rm -f /etc/nginx/conf.d/sqltms.info.conf
    echo "Nginx 설정 파일 삭제 완료"
fi

# Nginx 테스트 및 재로드
if command -v nginx &> /dev/null; then
    sudo nginx -t && sudo systemctl reload nginx
    echo "Nginx 재로드 완료"
fi

# 4. SSL 인증서 제거 (선택)
print_step "4/12 - SSL 인증서 제거 (선택)"
read -p "Let's Encrypt SSL 인증서를 삭제하시겠습니까? (y/n): " DEL_SSL
if [[ $DEL_SSL =~ ^[Yy]$ ]]; then
    if command -v certbot &> /dev/null; then
        sudo certbot delete --cert-name sqltms.info
        echo "SSL 인증서 삭제 완료"
    fi
else
    echo "SSL 인증서 유지"
fi

# 5. 프로젝트 디렉토리 삭제
print_step "5/12 - 프로젝트 디렉토리 삭제"
if [ -d "/var/www/tms" ]; then
    sudo rm -rf /var/www/tms
    echo "프로젝트 디렉토리 삭제 완료"
fi

# 6. 로그 디렉토리 삭제
print_step "6/12 - 로그 디렉토리 삭제"
sudo rm -rf /var/log/pm2/narae-tms-*.log
echo "로그 파일 삭제 완료"

# 7. Nginx 로그 삭제
print_step "7/12 - Nginx 로그 삭제"
sudo rm -f /var/log/nginx/sqltms.info.*.log
echo "Nginx 로그 삭제 완료"

# 8. 방화벽 규칙 제거 (선택)
print_step "8/12 - 방화벽 규칙 검토"
echo "방화벽 규칙은 다른 서비스에서 사용할 수 있으므로 수동 확인 필요"
echo "명령어: sudo firewall-cmd --list-all"

# 9. tms 사용자 삭제 (선택)
print_step "9/12 - tms 사용자 삭제 (선택)"
read -p "tms 사용자를 삭제하시겠습니까? (y/n): " DEL_USER
if [[ $DEL_USER =~ ^[Yy]$ ]]; then
    sudo userdel -r tms 2>/dev/null || true
    echo "tms 사용자 삭제 완료"
else
    echo "tms 사용자 유지"
fi

# 10. Node.js 삭제 (선택)
print_step "10/12 - Node.js 삭제 (선택)"
read -p "Node.js를 삭제하시겠습니까? (다른 앱에서 사용 중일 수 있음) (y/n): " DEL_NODE
if [[ $DEL_NODE =~ ^[Yy]$ ]]; then
    sudo dnf remove -y nodejs
    echo "Node.js 삭제 완료"
else
    echo "Node.js 유지"
fi

# 11. PM2 삭제 (선택)
print_step "11/12 - PM2 삭제 (선택)"
read -p "PM2를 삭제하시겠습니까? (y/n): " DEL_PM2
if [[ $DEL_PM2 =~ ^[Yy]$ ]]; then
    sudo npm uninstall -g pm2
    echo "PM2 삭제 완료"
else
    echo "PM2 유지"
fi

# 12. Oracle Instant Client 삭제 (선택)
print_step "12/12 - Oracle Instant Client 삭제 (선택)"
read -p "Oracle Instant Client를 삭제하시겠습니까? (다른 앱에서 사용 중일 수 있음) (y/n): " DEL_ORACLE
if [[ $DEL_ORACLE =~ ^[Yy]$ ]]; then
    sudo dnf remove -y oracle-instantclient*
    sudo rm -f /etc/ld.so.conf.d/oracle-instantclient.conf
    sudo rm -f /etc/profile.d/oracle.sh
    sudo ldconfig
    echo "Oracle Instant Client 삭제 완료"
else
    echo "Oracle Instant Client 유지"
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                            ║${NC}"
echo -e "${GREEN}║            ✅ 삭제가 완료되었습니다!                       ║${NC}"
echo -e "${GREEN}║                                                            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [[ $BACKUP =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}백업 위치: /var/backups/tms/final_backup_$TIMESTAMP.tar.gz${NC}"
fi

echo ""
echo "남은 작업:"
echo "  - Nginx 완전 삭제: sudo dnf remove nginx"
echo "  - 백업 삭제: sudo rm -rf /var/backups/tms"
echo "  - Certbot 삭제: sudo dnf remove certbot"

EOF

chmod +x /tmp/uninstall_tms.sh
```

### 1.2 스크립트 실행

```bash
# 스크립트 실행
/tmp/uninstall_tms.sh

# 실행 후 스크립트 삭제
rm /tmp/uninstall_tms.sh
```

---

## 2. 단계별 수동 삭제

자동 스크립트를 사용하지 않고 수동으로 삭제하려면 다음 단계를 따르세요.

### 2.1 PM2 프로세스 중지 및 삭제

```bash
# PM2 프로세스 확인
pm2 list

# 프로세스 중지
pm2 stop narae-tms

# 프로세스 삭제
pm2 delete narae-tms

# PM2 저장
pm2 save --force

# PM2 프로세스 목록 확인 (비어있어야 함)
pm2 list
```

### 2.2 PM2 부팅 시 자동 시작 제거

```bash
# PM2 startup 제거
pm2 unstartup systemd

# 출력된 명령어 복사 후 실행 (sudo 명령어)
# 예: sudo systemctl disable pm2-tms

# systemd 서비스 파일 삭제
sudo systemctl stop pm2-tms
sudo systemctl disable pm2-tms
sudo rm -f /etc/systemd/system/pm2-tms.service

# systemd 데몬 재로드
sudo systemctl daemon-reload
```

### 2.3 Nginx 설정 제거

```bash
# Nginx 설정 파일 백업 (선택)
sudo cp /etc/nginx/conf.d/sqltms.info.conf /tmp/sqltms.info.conf.bak

# Nginx 설정 파일 삭제
sudo rm -f /etc/nginx/conf.d/sqltms.info.conf

# Nginx 설정 테스트
sudo nginx -t

# Nginx 재로드
sudo systemctl reload nginx
```

### 2.4 SSL 인증서 삭제 (선택)

```bash
# Let's Encrypt 인증서 확인
sudo certbot certificates

# 인증서 삭제
sudo certbot delete --cert-name sqltms.info

# Certbot 자동 갱신 타이머 중지 (선택)
sudo systemctl stop certbot-renew.timer
sudo systemctl disable certbot-renew.timer
```

### 2.5 프로젝트 디렉토리 삭제

```bash
# 백업 생성 (권장)
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
sudo mkdir -p /var/backups/tms
sudo tar -czf /var/backups/tms/final_backup_$TIMESTAMP.tar.gz -C /var/www tms

# 프로젝트 디렉토리 삭제
sudo rm -rf /var/www/tms

# 확인
ls -la /var/www/
```

### 2.6 로그 파일 삭제

```bash
# PM2 로그 삭제
sudo rm -rf /var/log/pm2/narae-tms-*.log

# Nginx 로그 삭제
sudo rm -f /var/log/nginx/sqltms.info.*.log

# 백업 디렉토리 확인
ls -lh /var/backups/tms/
```

### 2.7 방화벽 규칙 검토

```bash
# 현재 방화벽 규칙 확인
sudo firewall-cmd --list-all

# HTTP/HTTPS 포트가 다른 서비스에서 사용되지 않는 경우에만 제거
# sudo firewall-cmd --permanent --remove-service=http
# sudo firewall-cmd --permanent --remove-service=https
# sudo firewall-cmd --reload
```

### 2.8 tms 사용자 삭제 (선택)

```bash
# tms 사용자가 로그인 중이 아닌지 확인
who

# 현재 사용자가 tms가 아닌지 확인
echo $USER

# tms 사용자 삭제 (홈 디렉토리 포함)
sudo userdel -r tms

# 확인
cat /etc/passwd | grep tms
```

---

## 3. 부분 삭제 (선택사항)

### 3.1 애플리케이션만 삭제 (Node.js, Nginx 유지)

```bash
# PM2 프로세스만 삭제
pm2 delete narae-tms
pm2 save

# 프로젝트 디렉토리만 삭제
sudo rm -rf /var/www/tms

# Nginx 설정만 삭제
sudo rm -f /etc/nginx/conf.d/sqltms.info.conf
sudo systemctl reload nginx
```

### 3.2 Node.js 패키지 삭제

```bash
# 전역 npm 패키지 확인
npm list -g --depth=0

# PM2만 삭제
sudo npm uninstall -g pm2

# Node.js 완전 삭제
sudo dnf remove -y nodejs
sudo rm -rf /usr/lib/node_modules
sudo rm -rf ~/.npm
```

### 3.3 Nginx 완전 삭제

```bash
# Nginx 중지
sudo systemctl stop nginx
sudo systemctl disable nginx

# Nginx 삭제
sudo dnf remove -y nginx

# Nginx 설정 파일 삭제
sudo rm -rf /etc/nginx

# Nginx 로그 삭제
sudo rm -rf /var/log/nginx
```

### 3.4 Oracle Instant Client 삭제

```bash
# Oracle Instant Client 패키지 확인
rpm -qa | grep oracle-instantclient

# Oracle Instant Client 삭제
sudo dnf remove -y oracle-instantclient-basic
sudo dnf remove -y oracle-instantclient-sqlplus
sudo dnf remove -y oracle-instantclient-devel

# 환경 변수 설정 파일 삭제
sudo rm -f /etc/profile.d/oracle.sh
sudo rm -f /etc/ld.so.conf.d/oracle-instantclient.conf

# ldconfig 갱신
sudo ldconfig

# Oracle 디렉토리 삭제 (잔여 파일)
sudo rm -rf /usr/lib/oracle
sudo rm -rf /opt/oracle
```

### 3.5 Certbot 삭제

```bash
# Certbot 중지
sudo systemctl stop certbot-renew.timer
sudo systemctl disable certbot-renew.timer

# Certbot 삭제
sudo dnf remove -y certbot python3-certbot-nginx

# Let's Encrypt 디렉토리 삭제 (인증서 포함)
sudo rm -rf /etc/letsencrypt
sudo rm -rf /var/lib/letsencrypt
sudo rm -rf /var/log/letsencrypt
```

---

## 4. 완전 삭제 확인

### 4.1 프로세스 확인

```bash
# PM2 프로세스 확인
pm2 list
# 출력: No processes running

# Node.js 프로세스 확인
ps aux | grep node
# Narae TMS 관련 프로세스가 없어야 함

# Nginx 프로세스 확인
ps aux | grep nginx
```

### 4.2 포트 확인

```bash
# 3000번 포트 사용 확인
sudo lsof -i :3000
# 아무 출력이 없어야 함

# 80, 443 포트 확인
sudo lsof -i :80
sudo lsof -i :443
```

### 4.3 디렉토리 확인

```bash
# 프로젝트 디렉토리 확인
ls -la /var/www/ | grep tms
# 출력 없음

# 로그 디렉토리 확인
ls -la /var/log/ | grep -E "pm2|nginx"

# 백업 디렉토리 확인
ls -lh /var/backups/tms/
```

### 4.4 설정 파일 확인

```bash
# Nginx 설정 확인
ls -la /etc/nginx/conf.d/ | grep sqltms
# 출력 없음

# systemd 서비스 확인
sudo systemctl list-units --all | grep pm2
# 출력 없음
```

### 4.5 사용자 확인

```bash
# tms 사용자 확인
cat /etc/passwd | grep tms
# 출력 없음 (삭제한 경우)
```

### 4.6 방화벽 확인

```bash
# 방화벽 규칙 확인
sudo firewall-cmd --list-all
```

---

## 5. 백업 관리

### 5.1 백업 파일 확인

```bash
# 백업 목록 확인
ls -lh /var/backups/tms/

# 백업 파일 크기 확인
du -sh /var/backups/tms/*
```

### 5.2 백업 복원 (필요 시)

```bash
# 프로젝트 디렉토리 생성
sudo mkdir -p /var/www/tms
sudo chown -R tms:tms /var/www/tms

# 백업 복원
cd /var/www/tms
sudo tar -xzf /var/backups/tms/final_backup_20250122_143000.tar.gz -C /var/www/tms/

# 의존성 재설치
npm install

# PM2로 재시작
pm2 start ecosystem.config.js --env production
```

### 5.3 백업 파일 삭제

```bash
# 30일 이상 된 백업 삭제
find /var/backups/tms/ -name "*.tar.gz" -mtime +30 -delete

# 모든 백업 삭제
sudo rm -rf /var/backups/tms/
```

---

## 6. 데이터베이스 정리 (Supabase)

Narae TMS는 Supabase를 사용하므로 서버에서 애플리케이션을 삭제해도 **데이터베이스는 유지**됩니다.

### 6.1 데이터베이스 데이터 삭제 (선택)

```sql
-- Supabase SQL Editor에서 실행

-- Oracle 연결 정보 삭제
DELETE FROM oracle_connections;

-- SQL 모니터링 데이터 삭제
DELETE FROM sql_statistics;
DELETE FROM execution_plans;

-- 튜닝 작업 삭제
DELETE FROM tuning_tasks;
DELETE FROM tuning_recommendations;

-- 보고서 삭제
DELETE FROM reports;

-- 감사 로그 삭제
DELETE FROM audit_logs;

-- 사용자 프로필 삭제 (선택)
-- DELETE FROM user_profiles;
```

### 6.2 Supabase 프로젝트 삭제 (완전 삭제)

1. Supabase Dashboard 접속: https://app.supabase.com
2. 프로젝트 선택
3. Settings → General
4. "Delete project" 클릭
5. 프로젝트 이름 입력 후 확인

---

## 7. 문제 해결

### 7.1 PM2 프로세스가 삭제되지 않음

```bash
# 강제 종료
pm2 kill

# PM2 daemon 재시작
pm2 resurrect

# 다시 삭제 시도
pm2 delete all
```

### 7.2 디렉토리 삭제 권한 오류

```bash
# sudo 권한으로 삭제
sudo rm -rf /var/www/tms

# 소유권 확인
ls -la /var/www/
```

### 7.3 Nginx 재로드 실패

```bash
# Nginx 설정 테스트
sudo nginx -t

# 오류가 있는 설정 파일 확인
sudo nginx -t 2>&1 | grep "failed"

# Nginx 강제 재시작
sudo systemctl restart nginx
```

### 7.4 포트가 여전히 사용 중

```bash
# 포트 사용 프로세스 확인
sudo lsof -i :3000

# 프로세스 강제 종료
sudo kill -9 <PID>
```

---

## 8. 삭제 후 정리 체크리스트

- [ ] PM2 프로세스 완전 삭제 확인
- [ ] Nginx 설정 파일 제거 확인
- [ ] SSL 인증서 삭제 (선택)
- [ ] 프로젝트 디렉토리 삭제 확인
- [ ] 로그 파일 정리 완료
- [ ] 백업 파일 보관 또는 삭제
- [ ] 방화벽 규칙 검토
- [ ] 사용자 계정 삭제 (선택)
- [ ] Node.js/PM2 삭제 (선택)
- [ ] Oracle Instant Client 삭제 (선택)
- [ ] 포트 사용 확인 (3000, 80, 443)
- [ ] Supabase 데이터 정리 (선택)

---

**삭제 완료!** 🗑️

모든 Narae TMS v2.0 관련 파일과 설정이 서버에서 제거되었습니다.

필요 시 백업 파일을 사용하여 복원할 수 있습니다.
