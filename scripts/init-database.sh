#!/bin/bash
# ============================================================
# TMS PostgreSQL 17 데이터베이스 초기화 스크립트
# 주식회사 나래정보기술
# ============================================================
# 사용법: ./scripts/init-database.sh
# ============================================================

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 설정 변수
DB_NAME="tms"
DB_USER="tms_app"
DB_PASSWORD="song7409"
DB_HOST="localhost"
DB_PORT="5432"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}TMS PostgreSQL 17 초기화 시작${NC}"
echo -e "${BLUE}========================================${NC}"

# Step 1: PostgreSQL 서비스 상태 확인
echo -e "\n${YELLOW}[Step 1/6] PostgreSQL 서비스 상태 확인...${NC}"
if command -v pg_isready &> /dev/null; then
    if pg_isready -h $DB_HOST -p $DB_PORT > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PostgreSQL이 실행 중입니다.${NC}"
    else
        echo -e "${RED}✗ PostgreSQL이 실행되지 않습니다. 먼저 PostgreSQL을 시작해주세요.${NC}"
        echo -e "  macOS: brew services start postgresql@17"
        echo -e "  Linux: sudo systemctl start postgresql"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠ pg_isready를 찾을 수 없습니다. PostgreSQL 실행 상태를 확인해주세요.${NC}"
fi

# Step 2: 데이터베이스 존재 확인 및 생성
echo -e "\n${YELLOW}[Step 2/6] 데이터베이스 생성...${NC}"
if psql -U postgres -h $DB_HOST -p $DB_PORT -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo -e "${GREEN}✓ 데이터베이스 '$DB_NAME'이(가) 이미 존재합니다.${NC}"
else
    echo -e "  데이터베이스 '$DB_NAME' 생성 중..."
    createdb -U postgres -h $DB_HOST -p $DB_PORT -E UTF8 -l en_US.UTF-8 -T template0 $DB_NAME
    echo -e "${GREEN}✓ 데이터베이스 '$DB_NAME' 생성 완료${NC}"
fi

# Step 3: 사용자 생성 및 권한 부여
echo -e "\n${YELLOW}[Step 3/6] 사용자 생성 및 권한 설정...${NC}"
psql -U postgres -h $DB_HOST -p $DB_PORT -d postgres <<EOF
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
        CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASSWORD';
        RAISE NOTICE 'User $DB_USER created';
    ELSE
        ALTER ROLE $DB_USER WITH PASSWORD '$DB_PASSWORD';
        RAISE NOTICE 'User $DB_USER password updated';
    END IF;
END
\$\$;

GRANT CONNECT ON DATABASE $DB_NAME TO $DB_USER;
EOF
echo -e "${GREEN}✓ 사용자 '$DB_USER' 설정 완료${NC}"

# Step 4: 데이터베이스 권한 및 확장 설정
echo -e "\n${YELLOW}[Step 4/6] 데이터베이스 권한 및 확장 설정...${NC}"
psql -U postgres -h $DB_HOST -p $DB_PORT -d $DB_NAME <<EOF
-- 권한 부여
GRANT USAGE ON SCHEMA public TO $DB_USER;
GRANT CREATE ON SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO $DB_USER;

-- 기본 권한 설정
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO $DB_USER;

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
echo -e "${GREEN}✓ 권한 및 확장 설정 완료${NC}"

# Step 5: 연결 테스트
echo -e "\n${YELLOW}[Step 5/6] 연결 테스트...${NC}"
if PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -h $DB_HOST -p $DB_PORT -d $DB_NAME -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ $DB_USER 사용자로 $DB_NAME 데이터베이스 연결 성공${NC}"
else
    echo -e "${RED}✗ 연결 테스트 실패${NC}"
    exit 1
fi

# Step 6: Drizzle 마이그레이션 실행
echo -e "\n${YELLOW}[Step 6/6] Drizzle 스키마 적용...${NC}"
if [ -f "package.json" ]; then
    echo -e "  마이그레이션 생성 중..."
    npm run db:generate

    echo -e "  마이그레이션 적용 중..."
    npm run db:push

    echo -e "${GREEN}✓ Drizzle 스키마 적용 완료${NC}"
else
    echo -e "${YELLOW}⚠ package.json을 찾을 수 없습니다. 프로젝트 루트에서 실행해주세요.${NC}"
fi

# 완료 메시지
echo -e "\n${BLUE}========================================${NC}"
echo -e "${GREEN}TMS PostgreSQL 17 초기화 완료!${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e ""
echo -e "데이터베이스 정보:"
echo -e "  Host:     ${DB_HOST}"
echo -e "  Port:     ${DB_PORT}"
echo -e "  Database: ${DB_NAME}"
echo -e "  User:     ${DB_USER}"
echo -e "  Password: ${DB_PASSWORD}"
echo -e ""
echo -e "연결 문자열:"
echo -e "  postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
echo -e ""
echo -e "다음 단계:"
echo -e "  ${YELLOW}npm run db:seed${NC}    - 초기 데이터 생성"
echo -e "  ${YELLOW}npm run dev${NC}        - 개발 서버 시작"
echo -e ""
echo -e "${BLUE}========================================${NC}"
