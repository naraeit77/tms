#!/bin/bash

################################################################################
# Narae TMS v2.0 - 자동 배포 스크립트
# Domain: sqltms.info
# Environment: Oracle Linux 8.6
# 작성자: 주식회사 나래정보기술
# 설명: PM2 + Nginx 환경에서 무중단 배포 수행
################################################################################

set -e  # 에러 발생 시 스크립트 중단

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 설정 변수
APP_NAME="narae-tms"
APP_DIR="/var/www/tms"
LOG_DIR="/var/log/pm2"
BACKUP_DIR="/var/backups/tms"
NGINX_CONF="/etc/nginx/conf.d/sqltms.info.conf"

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

# 배포 시작
echo ""
echo "=========================================="
echo "  Narae TMS v2.0 Deployment"
echo "=========================================="
echo ""

# 1. 현재 사용자 확인
log_info "Current user: $USER"
if [ "$USER" == "root" ]; then
    log_warning "Running as root is not recommended!"
fi

# 2. 애플리케이션 디렉토리 확인
if [ ! -d "$APP_DIR" ]; then
    log_error "Application directory not found: $APP_DIR"
    exit 1
fi

log_info "Application directory: $APP_DIR"
cd $APP_DIR

# 3. Git 저장소 확인
if [ ! -d ".git" ]; then
    log_error "Not a git repository!"
    exit 1
fi

# 4. 로그 디렉토리 생성
log_info "Creating log directory..."
sudo mkdir -p $LOG_DIR
sudo chown -R $USER:$USER $LOG_DIR
log_success "Log directory ready"

# 5. 현재 브랜치 확인
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
log_info "Current branch: $CURRENT_BRANCH"

# 6. 백업 생성
log_info "Creating backup..."
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
sudo mkdir -p $BACKUP_DIR

if [ -d ".next" ]; then
    BACKUP_FILE="$BACKUP_DIR/backup_$TIMESTAMP.tar.gz"
    sudo tar -czf $BACKUP_FILE .next .env.production 2>/dev/null || true

    if [ -f "$BACKUP_FILE" ]; then
        log_success "Backup created: $BACKUP_FILE"
    else
        log_warning "Backup creation failed (non-critical)"
    fi
else
    log_warning "No .next directory found, skipping backup"
fi

# 7. Git Stash (로컬 변경사항 임시 저장)
if [[ -n $(git status -s) ]]; then
    log_warning "Uncommitted changes detected, stashing..."
    git stash save "Auto-stash before deployment $TIMESTAMP"
fi

# 8. 최신 코드 가져오기
log_info "Pulling latest code from origin/$CURRENT_BRANCH..."
git fetch origin
git pull origin $CURRENT_BRANCH

if [ $? -eq 0 ]; then
    log_success "Code updated successfully"
else
    log_error "Failed to pull latest code"
    exit 1
fi

# 9. 의존성 설치
log_info "Installing dependencies..."
npm ci --production=false

if [ $? -eq 0 ]; then
    log_success "Dependencies installed"
else
    log_error "Failed to install dependencies"
    exit 1
fi

# 10. 환경 변수 파일 확인
if [ ! -f ".env.production" ]; then
    log_error ".env.production file not found!"
    log_error "Please create .env.production file with required variables."
    exit 1
fi

log_success "Environment file found"

# 11. 프로덕션 빌드 (Next.js 14 사용 시)
# 주의: Next.js 15 + React 19 조합에서는 빌드 에러 발생할 수 있음
# 개발 서버 사용 또는 Next.js 14로 다운그레이드 권장
read -p "Do you want to build the application? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Building application..."
    npm run build

    if [ $? -eq 0 ]; then
        log_success "Build completed successfully"
    else
        log_error "Build failed!"
        log_error "You may need to downgrade Next.js or React versions"
        exit 1
    fi
else
    log_warning "Skipping build step"
fi

# 12. PM2로 애플리케이션 재시작
log_info "Managing PM2 process..."

# PM2 프로세스 확인
if pm2 list | grep -q $APP_NAME; then
    log_info "Reloading application with PM2 (zero-downtime)..."
    pm2 reload ecosystem.config.js --env production

    if [ $? -eq 0 ]; then
        log_success "Application reloaded successfully"
    else
        log_error "Failed to reload application"
        exit 1
    fi
else
    log_info "Starting application with PM2..."
    pm2 start ecosystem.config.js --env production

    if [ $? -eq 0 ]; then
        log_success "Application started successfully"
    else
        log_error "Failed to start application"
        exit 1
    fi
fi

# 13. PM2 프로세스 저장
pm2 save
log_success "PM2 process list saved"

# 14. Nginx 설정 테스트
if [ -f "$NGINX_CONF" ]; then
    log_info "Testing Nginx configuration..."
    sudo nginx -t

    if [ $? -eq 0 ]; then
        log_success "Nginx configuration is valid"

        # Nginx 재시작
        log_info "Reloading Nginx..."
        sudo systemctl reload nginx
        log_success "Nginx reloaded"
    else
        log_error "Nginx configuration has errors!"
        log_warning "Application is running, but Nginx not reloaded"
    fi
else
    log_warning "Nginx configuration file not found: $NGINX_CONF"
fi

# 15. 헬스 체크
log_info "Performing health check..."
sleep 3

if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    log_success "Health check passed"
else
    log_warning "Health check failed or endpoint not available"
fi

# 16. 배포 정보 저장
DEPLOY_INFO_FILE="$APP_DIR/.deploy-info"
cat > $DEPLOY_INFO_FILE << EOF
Deployment Information
======================
Date: $(date '+%Y-%m-%d %H:%M:%S')
User: $USER
Branch: $CURRENT_BRANCH
Commit: $(git rev-parse --short HEAD)
Commit Message: $(git log -1 --pretty=%B)
Node Version: $(node --version)
NPM Version: $(npm --version)
PM2 Version: $(pm2 --version)
EOF

log_success "Deployment information saved to $DEPLOY_INFO_FILE"

# 17. PM2 상태 출력
echo ""
log_info "Application status:"
pm2 status

# 18. 최근 로그 출력
echo ""
log_info "Recent logs (last 20 lines):"
pm2 logs $APP_NAME --lines 20 --nostream

# 19. 배포 완료
echo ""
echo "=========================================="
log_success "Deployment completed successfully!"
echo "=========================================="
echo ""
echo "Useful commands:"
echo "  pm2 logs $APP_NAME       - View application logs"
echo "  pm2 monit                - Monitor resources"
echo "  pm2 restart $APP_NAME    - Restart application"
echo "  pm2 stop $APP_NAME       - Stop application"
echo "  pm2 reload $APP_NAME     - Zero-downtime reload"
echo ""

# 20. 이전 백업 정리 (30일 이상 된 백업 삭제)
log_info "Cleaning up old backups..."
find $BACKUP_DIR -name "backup_*.tar.gz" -type f -mtime +30 -delete 2>/dev/null || true
log_success "Old backups cleaned"

echo ""
log_success "All done! 🚀"
echo ""
