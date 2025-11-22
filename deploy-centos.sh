#!/bin/bash

# ====================================
# TMS v2.0 CentOS 자동 배포 스크립트
# ====================================
#
# 지원 OS: CentOS 7/8, Rocky Linux 8/9, AlmaLinux 8/9
# 배포 방법: Docker (권장), PM2, Systemd
#
# 사용법:
#   chmod +x deploy-centos.sh
#   ./deploy-centos.sh [docker|pm2|systemd]

set -e  # Exit on error

# ====================================
# 색상 정의
# ====================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# ====================================
# 함수 정의
# ====================================

print_header() {
    echo -e "${CYAN}${BOLD}"
    echo "╔═══════════════════════════════════════════════════════╗"
    echo "║         TMS v2.0 CentOS 자동 배포 스크립트            ║"
    echo "╚═══════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "\n${BLUE}${BOLD}>>> $1${NC}\n"
}

check_root() {
    if [[ $EUID -ne 0 ]] && ! sudo -v &>/dev/null; then
        print_error "이 스크립트는 root 권한이 필요합니다."
        print_info "sudo ./deploy-centos.sh 로 실행하세요."
        exit 1
    fi
}

detect_os() {
    if [ -f /etc/redhat-release ]; then
        OS_INFO=$(cat /etc/redhat-release)

        # CentOS 7 확인
        if [[ $OS_INFO == *"CentOS Linux release 7"* ]]; then
            OS_VERSION="centos7"
            PKG_MANAGER="yum"
        # RHEL 7 확인
        elif [[ $OS_INFO == *"Red Hat Enterprise Linux"* ]] && [[ $OS_INFO == *"release 7"* ]]; then
            OS_VERSION="rhel7"
            PKG_MANAGER="yum"
        # CentOS 8+ / Rocky / AlmaLinux / RHEL 8+ 확인
        elif [[ $OS_INFO == *"CentOS"* ]] || [[ $OS_INFO == *"Rocky"* ]] || [[ $OS_INFO == *"AlmaLinux"* ]] || [[ $OS_INFO == *"Red Hat Enterprise Linux"* ]]; then
            OS_VERSION="rhel8"
            PKG_MANAGER="dnf"
        else
            print_error "지원하지 않는 OS입니다: $OS_INFO"
            exit 1
        fi

        print_info "감지된 OS: $OS_INFO"
        print_info "버전: $OS_VERSION"
        print_info "패키지 매니저: $PKG_MANAGER"
    else
        print_error "RHEL 계열 리눅스가 아닙니다."
        exit 1
    fi
}

update_system() {
    print_step "시스템 업데이트 중..."

    if [ "$PKG_MANAGER" == "yum" ]; then
        sudo yum update -y
        sudo yum install -y epel-release
        sudo yum update -y
    else
        sudo dnf update -y
        sudo dnf install -y epel-release
        sudo dnf update -y
    fi

    print_info "✓ 시스템 업데이트 완료"
}

install_basic_tools() {
    print_step "기본 도구 설치 중..."

    if [ "$PKG_MANAGER" == "yum" ]; then
        sudo yum groupinstall -y "Development Tools"
        sudo yum install -y git curl wget vim
    else
        sudo dnf groupinstall -y "Development Tools"
        sudo dnf install -y git curl wget vim
    fi

    print_info "✓ 기본 도구 설치 완료"
}

configure_firewall() {
    print_step "방화벽 설정 중..."

    sudo systemctl start firewalld
    sudo systemctl enable firewalld

    sudo firewall-cmd --permanent --add-service=http
    sudo firewall-cmd --permanent --add-service=https
    sudo firewall-cmd --permanent --add-port=3000/tcp
    sudo firewall-cmd --reload

    print_info "✓ 방화벽 설정 완료"
    sudo firewall-cmd --list-all
}

configure_selinux() {
    print_step "SELinux 설정 중..."

    CURRENT_MODE=$(getenforce)
    print_info "현재 SELinux 모드: $CURRENT_MODE"

    if [ "$CURRENT_MODE" == "Enforcing" ]; then
        print_warn "SELinux를 Permissive 모드로 변경합니다..."
        sudo setenforce Permissive
        sudo sed -i 's/SELINUX=enforcing/SELINUX=permissive/' /etc/selinux/config
        print_info "✓ SELinux를 Permissive 모드로 설정했습니다."
    else
        print_info "✓ SELinux는 이미 $CURRENT_MODE 모드입니다."
    fi
}

# ====================================
# Docker 배포
# ====================================

install_docker() {
    print_step "Docker 설치 중..."

    # 기존 Docker 제거
    if [ "$PKG_MANAGER" == "yum" ]; then
        sudo yum remove -y docker docker-client docker-client-latest \
            docker-common docker-latest docker-latest-logrotate \
            docker-logrotate docker-engine
    else
        sudo dnf remove -y docker docker-client docker-client-latest \
            docker-common docker-latest docker-latest-logrotate \
            docker-logrotate docker-engine podman runc
    fi

    # Docker 저장소 추가
    if [ "$PKG_MANAGER" == "yum" ]; then
        sudo yum install -y yum-utils
        sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
        sudo yum install -y docker-ce docker-ce-cli containerd.io
    else
        sudo dnf install -y dnf-plugins-core
        sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
        sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    fi

    # Docker 시작
    sudo systemctl start docker
    sudo systemctl enable docker

    # 사용자를 docker 그룹에 추가
    sudo usermod -aG docker $USER

    print_info "✓ Docker 설치 완료"
    docker --version
}

deploy_with_docker() {
    print_step "Docker로 배포 중..."

    # .env.production 확인
    if [ ! -f ".env.production" ]; then
        print_error ".env.production 파일이 없습니다!"
        print_info "다음 명령어로 파일을 생성하세요:"
        print_info "  cp .env.production.example .env.production"
        print_info "  vi .env.production"
        exit 1
    fi

    # Docker Compose 버전 확인
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    elif docker compose version &> /dev/null; then
        COMPOSE_CMD="docker compose"
    else
        print_error "Docker Compose를 찾을 수 없습니다."
        exit 1
    fi

    print_info "Docker Compose 명령어: $COMPOSE_CMD"

    # 기존 컨테이너 중지
    $COMPOSE_CMD down || true

    # 이미지 빌드
    print_info "Docker 이미지 빌드 중... (5-10분 소요)"
    $COMPOSE_CMD build

    # 컨테이너 시작
    print_info "컨테이너 시작 중..."
    $COMPOSE_CMD up -d

    # 상태 확인
    sleep 5
    $COMPOSE_CMD ps

    print_info "✓ Docker 배포 완료"
}

# ====================================
# PM2 배포
# ====================================

install_nodejs() {
    print_step "Node.js 20.x 설치 중..."

    # NodeSource 저장소 추가
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -

    # Node.js 설치
    if [ "$PKG_MANAGER" == "yum" ]; then
        sudo yum install -y nodejs
    else
        sudo dnf install -y nodejs
    fi

    print_info "✓ Node.js 설치 완료"
    node --version
    npm --version
}

install_pm2() {
    print_step "PM2 설치 중..."

    sudo npm install -g pm2

    print_info "✓ PM2 설치 완료"
    pm2 --version
}

deploy_with_pm2() {
    print_step "PM2로 배포 중..."

    # 배포 디렉토리
    DEPLOY_DIR="/var/www/tms"

    # 디렉토리 생성
    if [ ! -d "$DEPLOY_DIR" ]; then
        sudo mkdir -p $DEPLOY_DIR
        sudo chown -R $USER:$USER $DEPLOY_DIR
    fi

    # 프로젝트 파일 복사 (현재 디렉토리에서)
    if [ "$PWD" != "$DEPLOY_DIR" ]; then
        print_info "프로젝트 파일을 $DEPLOY_DIR 로 복사 중..."
        sudo cp -r . $DEPLOY_DIR/
        sudo chown -R $USER:$USER $DEPLOY_DIR
        cd $DEPLOY_DIR
    fi

    # .env.production 확인
    if [ ! -f ".env.production" ]; then
        print_error ".env.production 파일이 없습니다!"
        exit 1
    fi

    # 의존성 설치
    print_info "의존성 설치 중... (5-10분 소요)"
    npm ci --only=production

    # 빌드
    print_info "애플리케이션 빌드 중... (5-10분 소요)"
    npm run build

    # PM2로 시작
    print_info "PM2로 애플리케이션 시작 중..."
    pm2 start ecosystem.config.js --env production

    # PM2 startup 설정
    pm2 startup systemd -u $USER --hp $HOME
    pm2 save

    print_info "✓ PM2 배포 완료"
    pm2 status
}

# ====================================
# Systemd 배포
# ====================================

deploy_with_systemd() {
    print_step "Systemd로 배포 중..."

    # 배포 디렉토리
    DEPLOY_DIR="/var/www/tms"

    # Node.js 설치 (PM2와 동일)
    install_nodejs

    # 디렉토리 생성
    if [ ! -d "$DEPLOY_DIR" ]; then
        sudo mkdir -p $DEPLOY_DIR
        sudo chown -R www-data:www-data $DEPLOY_DIR 2>/dev/null || \
        sudo chown -R nginx:nginx $DEPLOY_DIR 2>/dev/null || \
        sudo chown -R $USER:$USER $DEPLOY_DIR
    fi

    # 프로젝트 파일 복사
    if [ "$PWD" != "$DEPLOY_DIR" ]; then
        print_info "프로젝트 파일을 $DEPLOY_DIR 로 복사 중..."
        sudo cp -r . $DEPLOY_DIR/
        cd $DEPLOY_DIR
    fi

    # .env.production 확인
    if [ ! -f ".env.production" ]; then
        print_error ".env.production 파일이 없습니다!"
        exit 1
    fi

    # 의존성 설치 및 빌드
    print_info "의존성 설치 및 빌드 중..."
    sudo npm ci --only=production
    sudo npm run build

    # Systemd 서비스 파일 복사
    print_info "Systemd 서비스 설정 중..."
    sudo cp systemd/tms.service /etc/systemd/system/

    # Systemd 데몬 재로드
    sudo systemctl daemon-reload

    # 서비스 시작
    sudo systemctl enable tms
    sudo systemctl start tms

    print_info "✓ Systemd 배포 완료"
    sudo systemctl status tms
}

# ====================================
# Nginx 설치 및 설정
# ====================================

install_nginx() {
    print_step "Nginx 설치 중..."

    if [ "$PKG_MANAGER" == "yum" ]; then
        sudo yum install -y nginx
    else
        sudo dnf install -y nginx
    fi

    # Nginx 설정 복사
    if [ -f "nginx/nginx.conf" ]; then
        print_info "Nginx 설정 파일 복사 중..."
        sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup
        sudo cp nginx/nginx.conf /etc/nginx/nginx.conf

        print_warn "nginx.conf에서 'your-domain.com'을 실제 도메인으로 변경하세요!"
        print_info "  sudo vi /etc/nginx/nginx.conf"
    fi

    # Nginx 시작
    sudo systemctl start nginx
    sudo systemctl enable nginx

    # 설정 테스트
    sudo nginx -t

    print_info "✓ Nginx 설치 완료"
}

# ====================================
# 배포 확인
# ====================================

verify_deployment() {
    print_step "배포 확인 중..."

    sleep 5

    # 헬스체크
    print_info "헬스체크 수행 중..."
    if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
        print_info "✓ 애플리케이션이 정상적으로 실행 중입니다!"
    else
        print_warn "헬스체크 실패. 로그를 확인하세요."
        return 1
    fi

    # 서버 IP 확인
    SERVER_IP=$(hostname -I | awk '{print $1}')

    echo ""
    print_info "=========================================="
    print_info "     배포 완료!"
    print_info "=========================================="
    print_info ""
    print_info "접속 URL: http://$SERVER_IP:3000"
    print_info ""
    print_info "로그 확인:"

    if [ "$DEPLOY_METHOD" == "docker" ]; then
        print_info "  docker compose logs -f"
    elif [ "$DEPLOY_METHOD" == "pm2" ]; then
        print_info "  pm2 logs tms"
    elif [ "$DEPLOY_METHOD" == "systemd" ]; then
        print_info "  sudo journalctl -u tms -f"
    fi

    print_info ""
    print_info "재시작:"

    if [ "$DEPLOY_METHOD" == "docker" ]; then
        print_info "  docker compose restart"
    elif [ "$DEPLOY_METHOD" == "pm2" ]; then
        print_info "  pm2 restart tms"
    elif [ "$DEPLOY_METHOD" == "systemd" ]; then
        print_info "  sudo systemctl restart tms"
    fi

    echo ""
}

# ====================================
# 메인 함수
# ====================================

main() {
    print_header

    # 배포 방법 선택
    DEPLOY_METHOD=${1:-""}

    if [ -z "$DEPLOY_METHOD" ]; then
        echo "배포 방법을 선택하세요:"
        echo "  1) Docker (권장)"
        echo "  2) PM2"
        echo "  3) Systemd"
        read -p "선택 (1-3): " choice

        case $choice in
            1) DEPLOY_METHOD="docker" ;;
            2) DEPLOY_METHOD="pm2" ;;
            3) DEPLOY_METHOD="systemd" ;;
            *) print_error "잘못된 선택입니다."; exit 1 ;;
        esac
    fi

    print_info "선택된 배포 방법: $DEPLOY_METHOD"

    # Root 권한 확인
    check_root

    # OS 감지
    detect_os

    # 시스템 준비
    update_system
    install_basic_tools
    configure_firewall
    configure_selinux

    # 배포 방법에 따른 설치 및 배포
    case $DEPLOY_METHOD in
        docker)
            install_docker
            deploy_with_docker
            ;;
        pm2)
            install_nodejs
            install_pm2
            deploy_with_pm2
            ;;
        systemd)
            deploy_with_systemd
            ;;
        *)
            print_error "알 수 없는 배포 방법: $DEPLOY_METHOD"
            exit 1
            ;;
    esac

    # Nginx 설치 (선택사항)
    read -p "Nginx를 설치하시겠습니까? (y/N): " install_nginx_choice
    if [[ $install_nginx_choice =~ ^[Yy]$ ]]; then
        install_nginx
    fi

    # 배포 확인
    verify_deployment

    print_info ""
    print_info "=========================================="
    print_info "  TMS v2.0 배포가 완료되었습니다! 🚀"
    print_info "=========================================="
}

# 스크립트 실행
main "$@"
