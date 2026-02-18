#!/bin/bash
# ============================================================
# TMS PostgreSQL 17 배포 스크립트 (macOS)
# 주식회사 나래정보기술
# ============================================================
# 지원 환경: macOS 13+ (Ventura, Sonoma, Sequoia)
# 요구사항: Homebrew
# 사용법: ./scripts/deploy-postgresql-macos.sh
# ============================================================

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# 기본 설정
DB_NAME="tms"
DB_USER="tms_app"
DB_PASSWORD=""
CURRENT_USER=$(whoami)
HOMEBREW_PREFIX=$(brew --prefix 2>/dev/null || echo "/opt/homebrew")
PG_VERSION="17"
PG_DATA="${HOMEBREW_PREFIX}/var/postgresql@${PG_VERSION}"
PSQL_BIN="${HOMEBREW_PREFIX}/opt/postgresql@${PG_VERSION}/bin/psql"

# 로깅 함수
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }

# 배너 출력
print_banner() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}     ${GREEN}TMS PostgreSQL 17 배포 스크립트 (macOS)${NC}              ${BLUE}║${NC}"
    echo -e "${BLUE}║${NC}     ${CYAN}주식회사 나래정보기술${NC}                                 ${BLUE}║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# macOS 버전 확인
check_macos() {
    if [[ "$(uname)" != "Darwin" ]]; then
        log_error "이 스크립트는 macOS 전용입니다."
        exit 1
    fi

    MACOS_VERSION=$(sw_vers -productVersion)
    MACOS_MAJOR=$(echo "$MACOS_VERSION" | cut -d. -f1)

    if [[ "$MACOS_MAJOR" -lt 13 ]]; then
        log_error "macOS 13 (Ventura) 이상이 필요합니다. 현재: $MACOS_VERSION"
        exit 1
    fi

    log_info "macOS 버전: $MACOS_VERSION"
}

# Homebrew 확인 및 설치
check_homebrew() {
    log_step "Homebrew 확인 중..."

    if ! command -v brew &> /dev/null; then
        log_warning "Homebrew가 설치되어 있지 않습니다. 설치를 진행합니다..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

        # Apple Silicon 환경 변수 설정
        if [[ -d "/opt/homebrew" ]]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
            echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        fi

        HOMEBREW_PREFIX=$(brew --prefix)
    fi

    log_success "Homebrew 확인 완료: $(brew --version | head -1)"
}

# 비밀번호 입력
get_password() {
    echo ""
    echo -e "${YELLOW}TMS 데이터베이스 비밀번호를 설정합니다.${NC}"
    echo "최소 8자 이상을 권장합니다."
    echo ""

    while true; do
        read -sp "비밀번호 입력: " DB_PASSWORD
        echo ""
        read -sp "비밀번호 확인: " DB_PASSWORD_CONFIRM
        echo ""

        if [ "$DB_PASSWORD" != "$DB_PASSWORD_CONFIRM" ]; then
            log_error "비밀번호가 일치하지 않습니다. 다시 입력해주세요."
        elif [ ${#DB_PASSWORD} -lt 8 ]; then
            log_error "비밀번호는 최소 8자 이상이어야 합니다."
        else
            break
        fi
    done
}

# PostgreSQL 설치
install_postgresql() {
    log_step "PostgreSQL ${PG_VERSION} 설치 중..."

    # 이미 설치되어 있는지 확인
    if brew list postgresql@${PG_VERSION} &>/dev/null; then
        log_info "PostgreSQL ${PG_VERSION}이(가) 이미 설치되어 있습니다."
    else
        brew install postgresql@${PG_VERSION}
    fi

    # 환경 변수 설정
    PG_BIN_PATH="${HOMEBREW_PREFIX}/opt/postgresql@${PG_VERSION}/bin"

    if ! grep -q "postgresql@${PG_VERSION}" ~/.zshrc 2>/dev/null; then
        echo "export PATH=\"${PG_BIN_PATH}:\$PATH\"" >> ~/.zshrc
        log_info "PATH에 PostgreSQL 바이너리 경로 추가됨"
    fi

    # 현재 세션에 적용
    export PATH="${PG_BIN_PATH}:$PATH"

    # psql 경로 업데이트
    PSQL_BIN="${PG_BIN_PATH}/psql"

    log_success "PostgreSQL ${PG_VERSION} 설치 완료"
}

# PostgreSQL 서비스 시작
start_postgresql() {
    log_step "PostgreSQL 서비스 시작 중..."

    # 기존 서비스 중지 (다른 버전)
    brew services stop postgresql 2>/dev/null || true
    brew services stop postgresql@14 2>/dev/null || true
    brew services stop postgresql@15 2>/dev/null || true
    brew services stop postgresql@16 2>/dev/null || true

    # PostgreSQL 17 시작
    brew services start postgresql@${PG_VERSION}

    # 시작 대기
    sleep 3

    # 상태 확인
    if brew services list | grep "postgresql@${PG_VERSION}" | grep -q "started"; then
        log_success "PostgreSQL 서비스 시작됨"
    else
        log_error "PostgreSQL 서비스 시작 실패"
        log_info "로그 확인: tail -f ${HOMEBREW_PREFIX}/var/log/postgresql@${PG_VERSION}.log"
        exit 1
    fi
}

# 데이터베이스 생성
setup_database() {
    log_step "TMS 데이터베이스 생성 중..."

    # 데이터베이스 존재 확인
    if $PSQL_BIN -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1; then
        log_info "데이터베이스 '${DB_NAME}'이(가) 이미 존재합니다."
    else
        $PSQL_BIN -d postgres -c "CREATE DATABASE ${DB_NAME} ENCODING 'UTF8' LC_COLLATE 'en_US.UTF-8' LC_CTYPE 'en_US.UTF-8' TEMPLATE template0;"
        log_success "데이터베이스 '${DB_NAME}' 생성 완료"
    fi

    # 사용자 생성
    if $PSQL_BIN -d postgres -tc "SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}'" | grep -q 1; then
        log_info "사용자 '${DB_USER}'이(가) 이미 존재합니다. 비밀번호 업데이트..."
        $PSQL_BIN -d postgres -c "ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"
    else
        $PSQL_BIN -d postgres -c "CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';"
        log_success "사용자 '${DB_USER}' 생성 완료"
    fi

    # 연결 권한 부여
    $PSQL_BIN -d postgres -c "GRANT CONNECT ON DATABASE ${DB_NAME} TO ${DB_USER};"
}

# 권한 및 확장 설정
setup_permissions() {
    log_step "권한 및 확장 설정 중..."

    $PSQL_BIN -d ${DB_NAME} <<EOF
-- 스키마 권한
GRANT USAGE ON SCHEMA public TO ${DB_USER};
GRANT CREATE ON SCHEMA public TO ${DB_USER};
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${DB_USER};
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${DB_USER};
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO ${DB_USER};

-- 기본 권한
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO ${DB_USER};

-- 확장 설치
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 트리거 함수
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS \$\$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
\$\$ LANGUAGE plpgsql;
EOF

    log_success "권한 및 확장 설정 완료"
}

# pg_hba.conf 설정
configure_authentication() {
    log_step "인증 설정 중..."

    PG_HBA="${PG_DATA}/pg_hba.conf"

    # 이미 설정되어 있는지 확인
    if ! grep -q "host.*${DB_NAME}.*${DB_USER}" "$PG_HBA" 2>/dev/null; then
        echo "" >> "$PG_HBA"
        echo "# TMS Application" >> "$PG_HBA"
        echo "host    ${DB_NAME}    ${DB_USER}    127.0.0.1/32    scram-sha-256" >> "$PG_HBA"
        echo "host    ${DB_NAME}    ${DB_USER}    ::1/128         scram-sha-256" >> "$PG_HBA"

        # 설정 리로드
        $PSQL_BIN -d postgres -c "SELECT pg_reload_conf();" > /dev/null

        log_success "인증 설정 완료"
    else
        log_info "인증 설정이 이미 존재합니다."
    fi
}

# 연결 테스트
test_connection() {
    log_step "연결 테스트 중..."

    if PGPASSWORD="${DB_PASSWORD}" $PSQL_BIN -U ${DB_USER} -h localhost -d ${DB_NAME} -c "SELECT 1;" > /dev/null 2>&1; then
        log_success "연결 테스트 성공!"

        # 확장 확인
        echo ""
        log_info "설치된 확장:"
        PGPASSWORD="${DB_PASSWORD}" $PSQL_BIN -U ${DB_USER} -h localhost -d ${DB_NAME} -c "SELECT extname, extversion FROM pg_extension WHERE extname IN ('uuid-ossp', 'pgcrypto', 'pg_trgm');"
    else
        log_error "연결 테스트 실패"
        return 1
    fi
}

# 백업 스크립트 설정
setup_backup() {
    log_step "백업 스크립트 설정 중..."

    BACKUP_DIR="$HOME/tms_backups"
    SCRIPT_DIR="$HOME/tms_scripts"

    mkdir -p "$BACKUP_DIR"
    mkdir -p "$SCRIPT_DIR"

    cat > "$SCRIPT_DIR/backup_tms.sh" <<BACKUP_SCRIPT
#!/bin/bash
BACKUP_DIR="$BACKUP_DIR"
DB_NAME="${DB_NAME}"
DB_USER="${DB_USER}"
PSQL_BIN="${PSQL_BIN}"
PG_DUMP="${HOMEBREW_PREFIX}/opt/postgresql@${PG_VERSION}/bin/pg_dump"
RETENTION_DAYS=7
DATE=\$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="\${BACKUP_DIR}/tms_backup_\${DATE}.sql.gz"

mkdir -p \${BACKUP_DIR}

echo "[\$(date)] Starting backup..."
\$PG_DUMP -U ${CURRENT_USER} \${DB_NAME} | gzip > \${BACKUP_FILE}

if [ \$? -eq 0 ]; then
    echo "[\$(date)] Backup completed: \${BACKUP_FILE}"
    find \${BACKUP_DIR} -name "tms_backup_*.sql.gz" -mtime +\${RETENTION_DAYS} -delete
else
    echo "[\$(date)] Backup failed!"
    exit 1
fi
BACKUP_SCRIPT

    chmod +x "$SCRIPT_DIR/backup_tms.sh"

    log_success "백업 스크립트 생성: $SCRIPT_DIR/backup_tms.sh"
    log_info "백업 저장 위치: $BACKUP_DIR"
}

# 결과 출력
print_summary() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC}     ${GREEN}TMS PostgreSQL 17 배포 완료 (macOS)${NC}                  ${BLUE}║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  ${YELLOW}데이터베이스 정보:${NC}"
    echo "    Host:     localhost"
    echo "    Port:     5432"
    echo "    Database: ${DB_NAME}"
    echo "    User:     ${DB_USER}"
    echo ""
    echo -e "  ${YELLOW}Connection String:${NC}"
    echo "    postgresql://${DB_USER}:<password>@localhost:5432/${DB_NAME}"
    echo ""
    echo -e "  ${YELLOW}설정 파일 위치:${NC}"
    echo "    postgresql.conf: ${PG_DATA}/postgresql.conf"
    echo "    pg_hba.conf:     ${PG_DATA}/pg_hba.conf"
    echo ""
    echo -e "  ${YELLOW}서비스 관리:${NC}"
    echo "    시작: brew services start postgresql@${PG_VERSION}"
    echo "    중지: brew services stop postgresql@${PG_VERSION}"
    echo "    재시작: brew services restart postgresql@${PG_VERSION}"
    echo "    로그: tail -f ${HOMEBREW_PREFIX}/var/log/postgresql@${PG_VERSION}.log"
    echo ""
    echo -e "  ${YELLOW}다음 단계:${NC}"
    echo "    1. .env.local 파일에 DATABASE_URL 설정"
    echo "    2. npm run db:push (스키마 적용)"
    echo "    3. npm run db:seed (초기 데이터)"
    echo "    4. npm run dev (개발 서버 시작)"
    echo ""
    echo -e "  ${YELLOW}백업:${NC}"
    echo "    스크립트: $HOME/tms_scripts/backup_tms.sh"
    echo "    저장위치: $HOME/tms_backups/"
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
}

# 메인 실행
main() {
    print_banner
    check_macos
    check_homebrew
    get_password

    echo ""
    log_info "설치를 시작합니다..."
    echo ""

    install_postgresql
    start_postgresql
    setup_database
    setup_permissions
    configure_authentication
    test_connection
    setup_backup

    print_summary
}

main "$@"
