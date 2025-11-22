# SSH Connection Refused 문제 해결 가이드

## 문제 상황
```bash
ssh localhost
# ssh: connect to host localhost port 22: Connection refused
```

이 오류는 SSH 서버(sshd)가 설치되지 않았거나 실행되고 있지 않을 때 발생합니다.

---

## 🔍 진단 단계

### 1. SSH 서비스 상태 확인
```bash
# SSH 서비스 상태 확인
sudo systemctl status sshd

# 또는 (CentOS 7/8)
sudo systemctl status ssh
```

**가능한 결과:**
- `Active: active (running)` → SSH가 정상 실행 중
- `Unit sshd.service could not be found` → SSH가 설치되지 않음
- `Active: inactive (dead)` → SSH가 설치되었지만 중지됨

### 2. SSH 프로세스 확인
```bash
# SSH 데몬이 실행 중인지 확인
ps aux | grep sshd

# SSH 포트(22)가 열려있는지 확인
sudo netstat -tulpn | grep :22
# 또는
sudo ss -tulpn | grep :22
```

### 3. 방화벽 확인
```bash
# 방화벽 상태 확인
sudo firewall-cmd --list-all

# SSH 서비스가 허용되어 있는지 확인
sudo firewall-cmd --query-service=ssh
```

---

## 🛠️ 해결 방법

### 방법 1: SSH 서버 설치 및 시작 (가장 일반적)

#### CentOS 7
```bash
# 1. OpenSSH 서버 설치
sudo yum install -y openssh-server

# 2. SSH 서비스 시작
sudo systemctl start sshd

# 3. 부팅 시 자동 시작 설정
sudo systemctl enable sshd

# 4. 상태 확인
sudo systemctl status sshd

# 5. 방화벽에서 SSH 허용
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --reload

# 6. 테스트
ssh localhost
```

#### CentOS 8 / Rocky Linux / AlmaLinux
```bash
# 1. OpenSSH 서버 설치
sudo dnf install -y openssh-server

# 2. SSH 서비스 시작
sudo systemctl start sshd

# 3. 부팅 시 자동 시작 설정
sudo systemctl enable sshd

# 4. 상태 확인
sudo systemctl status sshd

# 5. 방화벽에서 SSH 허용
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --reload

# 6. 테스트
ssh localhost
```

---

### 방법 2: SSH 서비스가 설치되어 있지만 중지된 경우

```bash
# SSH 서비스 시작
sudo systemctl start sshd

# 부팅 시 자동 시작 설정
sudo systemctl enable sshd

# 상태 확인
sudo systemctl status sshd

# 즉시 테스트
ssh localhost
```

---

### 방법 3: 방화벽 문제인 경우

```bash
# 방화벽에서 SSH 허용
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-port=22/tcp
sudo firewall-cmd --reload

# 방화벽 규칙 확인
sudo firewall-cmd --list-all

# 테스트
ssh localhost
```

---

### 방법 4: SELinux 문제인 경우

```bash
# SELinux 상태 확인
getenforce

# SELinux가 차단하고 있는지 확인
sudo ausearch -m avc -ts recent | grep sshd

# SSH 포트 컨텍스트 확인
sudo semanage port -l | grep ssh

# SELinux에서 SSH 허용 (필요시)
sudo setsebool -P ssh_sysadm_login on

# 또는 일시적으로 Permissive 모드로 전환하여 테스트
sudo setenforce 0
ssh localhost

# 성공하면 SELinux 규칙 수정 필요
# 실패하면 다른 문제
sudo setenforce 1  # 다시 Enforcing 모드로
```

---

### 방법 5: SSH 설정 파일 확인

```bash
# SSH 설정 파일 확인
sudo vi /etc/ssh/sshd_config

# 다음 항목들이 올바르게 설정되어 있는지 확인:
# Port 22
# ListenAddress 0.0.0.0
# PermitRootLogin yes  (또는 without-password)
# PubkeyAuthentication yes
# PasswordAuthentication yes

# 설정 파일 문법 검사
sudo sshd -t

# 설정 변경 후 SSH 재시작
sudo systemctl restart sshd
```

---

## 🚀 빠른 해결 스크립트

아래 스크립트를 실행하면 자동으로 SSH를 설치하고 시작합니다:

```bash
#!/bin/bash

# SSH 빠른 설치 및 설정 스크립트

echo "SSH 서버 설치 및 설정 중..."

# OS 감지
if [ -f /etc/redhat-release ]; then
    OS_INFO=$(cat /etc/redhat-release)
    if [[ $OS_INFO == *"CentOS Linux release 7"* ]]; then
        PKG_MANAGER="yum"
    else
        PKG_MANAGER="dnf"
    fi
else
    echo "RHEL 계열 리눅스가 아닙니다."
    exit 1
fi

# SSH 서버 설치
echo "1. SSH 서버 설치 중..."
sudo $PKG_MANAGER install -y openssh-server

# SSH 서비스 시작
echo "2. SSH 서비스 시작 중..."
sudo systemctl start sshd
sudo systemctl enable sshd

# 방화벽 설정
echo "3. 방화벽 설정 중..."
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --reload

# 상태 확인
echo "4. SSH 상태 확인..."
sudo systemctl status sshd --no-pager

# 테스트
echo "5. SSH 연결 테스트..."
if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 localhost "echo 'SSH 연결 성공!'" 2>/dev/null; then
    echo "✓ SSH가 정상적으로 작동합니다!"
else
    echo "✗ SSH 연결에 실패했습니다. 로그를 확인하세요."
    sudo journalctl -u sshd -n 50 --no-pager
fi
```

**스크립트 사용 방법:**
```bash
# 파일 생성
cat > fix-ssh.sh << 'EOF'
[위 스크립트 내용 붙여넣기]
EOF

# 실행 권한 부여
chmod +x fix-ssh.sh

# 실행
./fix-ssh.sh
```

---

## 📋 완전한 체크리스트

1. **SSH 서버 설치 확인**
   ```bash
   rpm -qa | grep openssh-server
   ```

2. **SSH 서비스 실행 확인**
   ```bash
   sudo systemctl is-active sshd
   ```

3. **SSH 포트 리스닝 확인**
   ```bash
   sudo ss -tulpn | grep :22
   ```

4. **방화벽 규칙 확인**
   ```bash
   sudo firewall-cmd --list-services | grep ssh
   ```

5. **SELinux 확인**
   ```bash
   getenforce
   sudo ausearch -m avc -ts recent | grep sshd
   ```

6. **SSH 설정 파일 확인**
   ```bash
   sudo sshd -t
   ```

---

## 🔐 보안 강화 (선택사항)

SSH가 정상 작동하면 보안을 강화하세요:

```bash
# SSH 설정 파일 편집
sudo vi /etc/ssh/sshd_config

# 권장 설정:
# PermitRootLogin no              # Root 직접 로그인 비활성화
# PasswordAuthentication yes       # 비밀번호 인증 (또는 no로 키만 사용)
# PubkeyAuthentication yes        # 공개키 인증 활성화
# Port 22                         # 기본 포트 (변경 가능)
# AllowUsers yourusername         # 특정 사용자만 허용

# 설정 변경 후 재시작
sudo systemctl restart sshd
```

---

## ❓ 여전히 문제가 있나요?

### 로그 확인
```bash
# SSH 데몬 로그 확인
sudo journalctl -u sshd -n 100 --no-pager

# 인증 로그 확인
sudo tail -f /var/log/secure
```

### 상세 디버그 모드로 SSH 실행
```bash
# SSH 데몬을 디버그 모드로 실행
sudo /usr/sbin/sshd -d -p 2222

# 다른 터미널에서 테스트
ssh -p 2222 localhost
```

### 네트워크 연결 확인
```bash
# localhost 해석 확인
ping localhost

# 127.0.0.1로 직접 연결 시도
ssh 127.0.0.1

# hosts 파일 확인
cat /etc/hosts
# 다음 줄이 있어야 함:
# 127.0.0.1   localhost localhost.localdomain
```

---

## 🎯 TMS 배포와의 관계

**중요:** TMS v2.0 배포 자체는 SSH localhost 연결이 **필요하지 않습니다!**

- Docker 배포: SSH 불필요
- PM2 배포: SSH 불필요
- Systemd 배포: SSH 불필요

SSH localhost는 일부 개발 도구나 테스트에서만 필요합니다.

**TMS 배포를 진행하려면:**
```bash
# SSH localhost 문제와 무관하게 배포 가능
cd /opt/tms
./deploy-centos.sh docker
```

---

## 📞 추가 도움

여전히 문제가 해결되지 않으면:
1. 전체 시스템 로그 확인: `sudo journalctl -xe`
2. SSH 버전 확인: `ssh -V`
3. 방화벽 완전 비활성화 테스트: `sudo systemctl stop firewalld` (테스트만!)
4. SELinux 임시 비활성화 테스트: `sudo setenforce 0` (테스트만!)
