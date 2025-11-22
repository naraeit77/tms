# Oracle 연결 문제 해결 가이드

## 빠른 해결 방법

### NJS-116 오류 (Password Verifier Type)

**증상**:
```
NJS-116: password verifier type 0x939 is not supported by node-oracledb in Thin mode
```

**빠른 해결**:
1. Oracle에서 비밀번호 재설정:
   ```sql
   ALTER USER your_username IDENTIFIED BY your_password;
   ```

2. 또는 Thick 모드 활성화:
   ```bash
   # .env.local 파일에 추가
   ORACLE_THICK_MODE=true
   ORACLE_CLIENT_LIB_DIR=/usr/local/lib  # Mac 기준
   ```

**상세 가이드**: [ORACLE_THICK_MODE.md](./ORACLE_THICK_MODE.md)

---

## 일반적인 오류 메시지

### ORA-01017: Invalid username/password
**원인**: 잘못된 사용자명 또는 비밀번호

**해결**:
```sql
-- 비밀번호 확인 및 재설정
ALTER USER your_username IDENTIFIED BY new_password;

-- 계정 상태 확인
SELECT username, account_status
FROM dba_users
WHERE username = 'YOUR_USERNAME';

-- 계정 잠김 해제
ALTER USER your_username ACCOUNT UNLOCK;
```

### ORA-12541: TNS:no listener
**원인**: Oracle 리스너가 실행되지 않음

**해결**:
```bash
# 리스너 상태 확인
lsnrctl status

# 리스너 시작
lsnrctl start
```

### ORA-12514: TNS:listener does not currently know of service
**원인**: Service Name이 잘못됨

**해결**:
- Service Name 확인:
  ```sql
  SELECT value FROM v$parameter WHERE name = 'service_names';
  ```
- TMS UI에서 올바른 Service Name 입력

### ORA-12505: TNS:listener does not currently know of SID
**원인**: SID가 잘못됨

**해결**:
- SID 확인:
  ```sql
  SELECT instance_name FROM v$instance;
  ```
- TMS UI에서 올바른 SID 입력

### ORA-01031: Insufficient privileges
**원인**: 권한 부족

**해결**:
```sql
-- DBA 권한 부여 (v$sql 접근 필요)
GRANT SELECT_CATALOG_ROLE TO your_username;

-- 또는 개별 뷰 권한 부여
GRANT SELECT ON v$sql TO your_username;
GRANT SELECT ON v$session TO your_username;
GRANT SELECT ON v$system_event TO your_username;
GRANT SELECT ON v$sql_plan TO your_username;
```

### ORA-00942: Table or view does not exist
**원인**: v$sql 등의 뷰에 접근 권한 없음

**해결**:
```sql
-- 필요한 권한 부여
GRANT SELECT ON v$sql TO your_username;
GRANT SELECT ON v$sqltext TO your_username;
GRANT SELECT ON v$session TO your_username;
GRANT SELECT ON v$system_event TO your_username;
GRANT SELECT ON v$sql_plan TO your_username;
GRANT SELECT ON v$instance TO your_username;
GRANT SELECT ON v$version TO your_username;
```

---

## 연결 테스트 절차

### 1. 기본 연결 테스트
```bash
# SQL*Plus로 테스트
sqlplus username/password@host:port/service_name
```

### 2. TMS에서 테스트
1. TMS 로그인
2. 데이터베이스 연결 관리
3. 새 연결 추가
4. "연결 테스트" 버튼 클릭

### 3. 로그 확인
```bash
# 개발 서버 로그
npm run dev

# 브라우저 콘솔에서 오류 확인
```

---

## 권장 사용자 권한 설정

TMS를 위한 전용 Oracle 사용자 생성:

```sql
-- 1. 사용자 생성
CREATE USER tms_monitor IDENTIFIED BY secure_password;

-- 2. 기본 권한 부여
GRANT CREATE SESSION TO tms_monitor;
GRANT SELECT_CATALOG_ROLE TO tms_monitor;

-- 3. 필요한 뷰 권한 부여
GRANT SELECT ON v$sql TO tms_monitor;
GRANT SELECT ON v$sqltext TO tms_monitor;
GRANT SELECT ON v$session TO tms_monitor;
GRANT SELECT ON v$system_event TO tms_monitor;
GRANT SELECT ON v$sql_plan TO tms_monitor;
GRANT SELECT ON v$instance TO tms_monitor;
GRANT SELECT ON v$version TO tms_monitor;
GRANT SELECT ON v$statname TO tms_monitor;
GRANT SELECT ON v$sesstat TO tms_monitor;

-- 4. 읽기 전용 보장 (선택사항)
GRANT SELECT ANY TABLE TO tms_monitor;  -- 주의: 모든 테이블 읽기 가능
```

**보안 권장사항**:
- 읽기 전용 사용자 사용
- 강력한 비밀번호 설정
- 프로파일 설정으로 로그인 실패 제한
- 정기적인 비밀번호 변경

---

## 네트워크 문제

### 방화벽 확인
```bash
# 포트 열림 확인
telnet host port

# 또는
nc -zv host port
```

### 연결 타임아웃
**.env.local 설정**:
```bash
# 연결 풀 타임아웃 (초)
ORACLE_POOL_TIMEOUT=60

# 큐 타임아웃 (밀리초)
ORACLE_QUEUE_TIMEOUT=60000
```

---

## 성능 최적화

### 연결 풀 설정
```bash
# .env.local에 추가
ORACLE_POOL_MIN=2
ORACLE_POOL_MAX=10
ORACLE_POOL_INCREMENT=1
```

### 통계 수집 간격 조정
```bash
# SQL 통계 수집 간격 (초)
SQL_COLLECTION_INTERVAL=300

# 메트릭 수집 간격 (초)
METRICS_COLLECTION_INTERVAL=60
```

---

## 추가 도움말

문제가 계속되면:
1. [ORACLE_THICK_MODE.md](./ORACLE_THICK_MODE.md) 참조
2. 개발 팀에 문의
3. Oracle 로그 확인: `$ORACLE_HOME/diag/rdbms/.../trace/`
