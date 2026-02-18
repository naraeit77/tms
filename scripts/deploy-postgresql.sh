#!/bin/bash
# ============================================================
# TMS PostgreSQL 17 배포 스크립트
# 주식회사 나래정보기술
# ============================================================
# 지원 OS: RHEL/Rocky/CentOS 8+, Ubuntu 20.04+
# 사용법: sudo ./scripts/deploy-postgresql.sh
# ============================================================

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 기본 설정
DB_NAME="tms"
DB_USER="tms_app"
DB_PASSWORD=""  # 대화형으로 입력받음
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 로깅 함수
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# OS 감지
detect_os() {
    if [ -f /etc/redhat-release ]; then
        OS="rhel"
        OS_VERSION=$(rpm -E %{rhel})
        PGDATA="/var/lib/pgsql/17/data"
        PG_SERVICE="postgresql-17"
    elif [ -f /etc/lsb-release ] || [ -f /etc/debian_version ]; then
        OS="ubuntu"
        OS_VERSION=$(lsb_release -rs)
        PGDATA="/etc/postgresql/17/main"
        PG_SERVICE="postgresql"
    else
        log_error "지원하지 않는 OS입니다."
        exit 1
    fi
    log_info "감지된 OS: $OS $OS_VERSION"
}

# root 권한 확인
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "이 스크립트는 root 권한이 필요합니다."
        echo "사용법: sudo $0"
        exit 1
    fi
}

# 비밀번호 입력
get_password() {
    echo ""
    echo -e "${YELLOW}TMS 데이터베이스 비밀번호를 설정합니다.${NC}"
    echo "최소 12자 이상, 대소문자/숫자/특수문자 포함을 권장합니다."
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

# PostgreSQL 설치 (RHEL/Rocky/CentOS)
install_postgresql_rhel() {
    log_info "PostgreSQL 17 설치 중 (RHEL/Rocky)..."

    # 저장소 추가
    if ! rpm -qa | grep -q pgdg-redhat-repo; then
        dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-${OS_VERSION}-x86_64/pgdg-redhat-repo-latest.noarch.rpm
    fi

    # 기본 모듈 비활성화
    dnf -qy module disable postgresql 2>/dev/null || true

    # 설치
    dnf install -y postgresql17-server postgresql17-contrib

    # 초기화
    if [ ! -f "$PGDATA/PG_VERSION" ]; then
        /usr/pgsql-17/bin/postgresql-17-setup initdb
    fi

    # 서비스 시작
    systemctl start $PG_SERVICE
    systemctl enable $PG_SERVICE

    log_success "PostgreSQL 17 설치 완료"
}

# PostgreSQL 설치 (Ubuntu/Debian)
install_postgresql_ubuntu() {
    log_info "PostgreSQL 17 설치 중 (Ubuntu/Debian)..."

    # 필수 패키지
    apt update
    apt install -y wget gnupg2 lsb-release

    # 저장소 추가
    if [ ! -f /etc/apt/sources.list.d/pgdg.list ]; then
        sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
        wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
    fi

    # 설치
    apt update
    apt install -y postgresql-17 postgresql-contrib-17

    # 서비스 상태 확인
    systemctl start $PG_SERVICE
    systemctl enable $PG_SERVICE

    log_success "PostgreSQL 17 설치 완료"
}

# 데이터베이스 생성
setup_database() {
    log_info "TMS 데이터베이스 생성 중..."

    # 사용자 및 데이터베이스 생성
    sudo -u postgres psql <<EOF
-- 사용자 생성
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
        CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';
    ELSE
        ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';
    END IF;
END
\$\$;

-- 데이터베이스 생성
SELECT 'CREATE DATABASE ${DB_NAME} ENCODING ''UTF8'' LC_COLLATE ''en_US.UTF-8'' LC_CTYPE ''en_US.UTF-8'' TEMPLATE template0 OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}');

-- 연결 권한
GRANT CONNECT ON DATABASE ${DB_NAME} TO ${DB_USER};
EOF

    # 데이터베이스가 없으면 생성
    if ! sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw ${DB_NAME}; then
        sudo -u postgres createdb -E UTF8 -l en_US.UTF-8 -T template0 -O ${DB_USER} ${DB_NAME}
    fi

    log_success "데이터베이스 생성 완료"
}

# 권한 및 확장 설정
setup_permissions() {
    log_info "권한 및 확장 설정 중..."

    sudo -u postgres psql -d ${DB_NAME} <<EOF
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

-- updated_at 트리거 함수
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
    log_info "인증 설정 중..."

    local PG_HBA
    if [ "$OS" = "rhel" ]; then
        PG_HBA="/var/lib/pgsql/17/data/pg_hba.conf"
    else
        PG_HBA="/etc/postgresql/17/main/pg_hba.conf"
    fi

    # 이미 설정되어 있는지 확인
    if ! grep -q "host.*${DB_NAME}.*${DB_USER}" "$PG_HBA"; then
        echo "# TMS Application" >> "$PG_HBA"
        echo "host    ${DB_NAME}    ${DB_USER}    127.0.0.1/32    scram-sha-256" >> "$PG_HBA"
        echo "host    ${DB_NAME}    ${DB_USER}    ::1/128         scram-sha-256" >> "$PG_HBA"

        systemctl reload $PG_SERVICE
    fi

    log_success "인증 설정 완료"
}

# 연결 테스트
test_connection() {
    log_info "연결 테스트 중..."

    if PGPASSWORD="${DB_PASSWORD}" psql -U ${DB_USER} -h localhost -d ${DB_NAME} -c "SELECT 1;" > /dev/null 2>&1; then
        log_success "연결 테스트 성공"
        return 0
    else
        log_error "연결 테스트 실패"
        return 1
    fi
}

# 백업 스크립트 설정
setup_backup() {
    log_info "백업 스크립트 설정 중..."

    mkdir -p /opt/tms/backups
    mkdir -p /opt/tms/scripts

    cat > /opt/tms/scripts/backup_tms.sh <<'BACKUP_SCRIPT'
#!/bin/bash
BACKUP_DIR="/opt/tms/backups"
DB_NAME="tms"
DB_USER="tms_app"
RETENTION_DAYS=7
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/tms_backup_${DATE}.sql.gz"

mkdir -p ${BACKUP_DIR}

echo "[$(date)] Starting backup..."
pg_dump -U ${DB_USER} -h localhost ${DB_NAME} | gzip > ${BACKUP_FILE}

if [ $? -eq 0 ]; then
    echo "[$(date)] Backup completed: ${BACKUP_FILE}"
    find ${BACKUP_DIR} -name "tms_backup_*.sql.gz" -mtime +${RETENTION_DAYS} -delete
else
    echo "[$(date)] Backup failed!"
    exit 1
fi
BACKUP_SCRIPT

    chmod +x /opt/tms/scripts/backup_tms.sh

    # 크론잡 추가 (매일 새벽 2시)
    (crontab -l 2>/dev/null | grep -v "backup_tms.sh"; echo "0 2 * * * /opt/tms/scripts/backup_tms.sh >> /var/log/tms_backup.log 2>&1") | crontab -

    log_success "백업 스크립트 설정 완료"
}

# 결과 출력
print_summary() {
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}    TMS PostgreSQL 17 배포 완료${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
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
    echo -e "  ${YELLOW}다음 단계:${NC}"
    echo "    1. .env.local 파일에 DATABASE_URL 설정"
    echo "    2. npm run db:push (스키마 적용)"
    echo "    3. npm run db:seed (초기 데이터)"
    echo "    4. npm run build && npm start"
    echo ""
    echo -e "  ${YELLOW}백업:${NC}"
    echo "    스크립트: /opt/tms/scripts/backup_tms.sh"
    echo "    저장위치: /opt/tms/backups/"
    echo "    스케줄: 매일 02:00 (크론)"
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
}

# 메인 실행
main() {
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}    TMS PostgreSQL 17 배포 스크립트${NC}"
    echo -e "${BLUE}    주식회사 나래정보기술${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"

    check_root
    detect_os
    get_password

    echo ""
    log_info "설치를 시작합니다..."
    echo ""

    # OS별 설치
    if [ "$OS" = "rhel" ]; then
        install_postgresql_rhel
    else
        install_postgresql_ubuntu
    fi

    setup_database
    setup_permissions
    configure_authentication
    test_connection
    setup_backup

    print_summary
}

main "$@"
