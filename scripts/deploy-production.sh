#!/bin/bash
#
# Narae TMS v2.0 Production Deployment Script
# Usage: ./scripts/deploy-production.sh
#

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 설정
APP_DIR="/var/www/tms"
APP_USER="tms"
LOG_DIR="/var/log/pm2"
BACKUP_DIR="/var/backups/tms"

# 로그 함수
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 배너 출력
print_banner() {
    echo ""
    echo "=================================================="
    echo "   Narae TMS v2.0 Production Deployment"
    echo "   $(date '+%Y-%m-%d %H:%M:%S')"
    echo "=================================================="
    echo ""
}

# 사전 검사
pre_check() {
    log_info "사전 검사 시작..."

    # Node.js 확인
    if ! command -v node &> /dev/null; then
        log_error "Node.js가 설치되어 있지 않습니다."
        exit 1
    fi
    log_success "Node.js: $(node --version)"

    # PM2 확인
    if ! command -v pm2 &> /dev/null; then
        log_error "PM2가 설치되어 있지 않습니다."
        exit 1
    fi
    log_success "PM2: $(pm2 --version)"

    # Ollama 확인
    if ! command -v ollama &> /dev/null; then
        log_warning "Ollama가 설치되어 있지 않습니다. LLM 기능을 사용하려면 설치하세요."
    else
        log_success "Ollama: $(ollama --version 2>/dev/null || echo 'installed')"
    fi

    # 디렉토리 확인
    if [ ! -d "$APP_DIR" ]; then
        log_error "애플리케이션 디렉토리가 없습니다: $APP_DIR"
        exit 1
    fi

    # .env.local 확인
    if [ ! -f "$APP_DIR/.env.local" ]; then
        log_error ".env.local 파일이 없습니다."
        exit 1
    fi

    log_success "사전 검사 완료"
}

# 백업 생성
create_backup() {
    log_info "현재 버전 백업 중..."

    BACKUP_NAME="tms-$(date '+%Y%m%d-%H%M%S')"
    mkdir -p "$BACKUP_DIR"

    # .next 디렉토리 백업
    if [ -d "$APP_DIR/.next" ]; then
        tar -czf "$BACKUP_DIR/$BACKUP_NAME.tar.gz" \
            -C "$APP_DIR" .next package.json package-lock.json 2>/dev/null || true
        log_success "백업 생성: $BACKUP_DIR/$BACKUP_NAME.tar.gz"
    fi

    # 오래된 백업 정리 (7일 이상)
    find "$BACKUP_DIR" -name "tms-*.tar.gz" -mtime +7 -delete 2>/dev/null || true
}

# 소스 업데이트
update_source() {
    log_info "소스코드 업데이트 중..."

    cd "$APP_DIR"

    # Git 사용 시
    if [ -d ".git" ]; then
        git fetch origin
        git reset --hard origin/main
        log_success "Git 업데이트 완료"
    else
        log_warning "Git 저장소가 아닙니다. 수동으로 소스를 업데이트하세요."
    fi
}

# 의존성 설치
install_dependencies() {
    log_info "의존성 설치 중..."

    cd "$APP_DIR"

    # npm ci 사용 (clean install)
    npm ci --only=production

    log_success "의존성 설치 완료"
}

# 빌드
build_app() {
    log_info "프로덕션 빌드 중..."

    cd "$APP_DIR"

    # Next.js 빌드
    npm run build

    log_success "빌드 완료"
}

# Ollama 서비스 확인
check_ollama() {
    log_info "Ollama 서비스 확인 중..."

    if systemctl is-active --quiet ollama; then
        log_success "Ollama 서비스 실행 중"

        # 모델 확인
        if ollama list | grep -q "kanana"; then
            log_success "Kanana 모델 로드됨"
        else
            log_warning "Kanana 모델이 없습니다. 다운로드 중..."
            ollama pull hf.co/Mungert/kanana-1.5-8b-instruct-2505-GGUF:Q4_K_M
        fi
    else
        log_warning "Ollama 서비스가 실행 중이 아닙니다."
        log_info "Ollama 시작 중..."
        sudo systemctl start ollama
        sleep 5
    fi
}

# PM2 재시작
restart_pm2() {
    log_info "PM2 서비스 재시작 중..."

    cd "$APP_DIR"

    # 기존 프로세스 확인
    if pm2 list | grep -q "tms"; then
        # Zero-downtime 재시작
        pm2 reload ecosystem.config.js --env production
        log_success "PM2 reload 완료 (Zero-downtime)"
    else
        # 새로 시작
        pm2 start ecosystem.config.js --env production
        log_success "PM2 시작 완료"
    fi

    # 프로세스 저장
    pm2 save

    # 상태 확인
    sleep 3
    pm2 status
}

# 헬스체크
health_check() {
    log_info "헬스체크 수행 중..."

    # TMS 헬스체크
    for i in {1..10}; do
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")

        if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "307" ]; then
            log_success "TMS 서비스 정상 (HTTP $HTTP_CODE)"
            break
        fi

        if [ $i -eq 10 ]; then
            log_error "TMS 서비스 응답 없음 (HTTP $HTTP_CODE)"
            pm2 logs tms --lines 50 --nostream
            exit 1
        fi

        log_info "서비스 시작 대기 중... ($i/10)"
        sleep 3
    done

    # LLM 헬스체크
    LLM_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:11434/api/tags 2>/dev/null || echo "000")
    if [ "$LLM_CODE" = "200" ]; then
        log_success "LLM 서비스 정상 (Ollama)"
    else
        log_warning "LLM 서비스 응답 없음 (HTTP $LLM_CODE)"
    fi
}

# 정리
cleanup() {
    log_info "정리 작업 중..."

    cd "$APP_DIR"

    # npm 캐시 정리
    npm cache clean --force 2>/dev/null || true

    # 임시 파일 정리
    rm -rf /tmp/npm-* 2>/dev/null || true

    log_success "정리 완료"
}

# 롤백
rollback() {
    log_warning "롤백 수행 중..."

    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/tms-*.tar.gz 2>/dev/null | head -1)

    if [ -z "$LATEST_BACKUP" ]; then
        log_error "백업 파일이 없습니다."
        exit 1
    fi

    log_info "백업 복원: $LATEST_BACKUP"

    cd "$APP_DIR"
    rm -rf .next
    tar -xzf "$LATEST_BACKUP" -C "$APP_DIR"

    pm2 reload tms

    log_success "롤백 완료"
}

# 메인 실행
main() {
    print_banner

    # 롤백 옵션
    if [ "$1" = "--rollback" ]; then
        rollback
        exit 0
    fi

    # 배포 단계
    pre_check
    create_backup
    update_source
    install_dependencies
    build_app
    check_ollama
    restart_pm2
    health_check
    cleanup

    echo ""
    echo "=================================================="
    log_success "배포가 성공적으로 완료되었습니다!"
    echo "=================================================="
    echo ""
    echo "  URL: https://your-domain.com"
    echo "  PM2: pm2 status / pm2 logs tms"
    echo "  롤백: $0 --rollback"
    echo ""
}

# 스크립트 실행
main "$@"
