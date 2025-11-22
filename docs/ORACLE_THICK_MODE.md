# Oracle Thick Mode 설정 가이드

## 문제 상황

Oracle 데이터베이스 연결 시 다음과 같은 오류가 발생하는 경우:

```
NJS-116: password verifier type 0x939 is not supported by node-oracledb in Thin mode
```

이는 Oracle 사용자 계정의 비밀번호 검증 방식이 node-oracledb Thin 모드에서 지원되지 않는 형식을 사용하고 있기 때문입니다.

## 해결 방법

### 방법 1: Oracle에서 비밀번호 재설정 (권장)

가장 간단한 해결 방법은 Oracle 데이터베이스에서 사용자의 비밀번호를 재설정하는 것입니다.

```sql
-- SQL*Plus 또는 SQL Developer에서 실행
ALTER USER your_username IDENTIFIED BY your_password;
```

DBA 권한이 있는 경우, 사용자의 비밀번호 검증 방식을 확인할 수 있습니다:

```sql
-- 사용자의 비밀번호 검증 타입 확인
SELECT username, password_versions
FROM dba_users
WHERE username = 'YOUR_USERNAME';

-- 프로파일의 비밀번호 설정 확인
SELECT *
FROM dba_profiles
WHERE resource_name LIKE '%PASSWORD%';
```

### 방법 2: Thick 모드 활성화

Oracle Instant Client를 사용하는 Thick 모드는 모든 비밀번호 검증 방식을 지원합니다.

## Thick 모드 설정 방법

### 1. Oracle Instant Client 설치

#### macOS (Homebrew)
```bash
# Oracle Instant Client 설치
brew tap InstantClientTap/instantclient
brew install instantclient-basic

# 또는 직접 다운로드
# https://www.oracle.com/database/technologies/instant-client/downloads.html
```

#### macOS (수동 설치)
```bash
# 1. Oracle 웹사이트에서 Instant Client 다운로드
# https://www.oracle.com/database/technologies/instant-client/macos-intel-x86-downloads.html

# 2. 압축 해제
unzip instantclient-basic-macos.x64-21.8.0.0.0.zip

# 3. 라이브러리 디렉토리로 이동
sudo mkdir -p /usr/local/lib
sudo mv instantclient_21_8/* /usr/local/lib/

# 4. 심볼릭 링크 생성
cd /usr/local/lib
sudo ln -s libclntsh.dylib.21.1 libclntsh.dylib
```

#### Linux (Ubuntu/Debian)
```bash
# 1. Oracle 웹사이트에서 Instant Client 다운로드
wget https://download.oracle.com/otn_software/linux/instantclient/218000/instantclient-basic-linux.x64-21.8.0.0.0.zip

# 2. 압축 해제
sudo mkdir -p /opt/oracle
sudo unzip instantclient-basic-linux.x64-21.8.0.0.0.zip -d /opt/oracle

# 3. 라이브러리 경로 설정
sudo sh -c "echo /opt/oracle/instantclient_21_8 > /etc/ld.so.conf.d/oracle-instantclient.conf"
sudo ldconfig
```

#### Windows
```powershell
# 1. Oracle 웹사이트에서 Instant Client 다운로드
# https://www.oracle.com/database/technologies/instant-client/winx64-64-downloads.html

# 2. 압축 해제 (예: C:\oracle\instantclient_21_8)

# 3. 환경 변수 PATH에 추가
# 시스템 속성 > 환경 변수 > PATH 편집
# C:\oracle\instantclient_21_8 추가
```

### 2. 환경변수 설정

`.env.local` 파일에 다음 설정을 추가합니다:

```bash
# Oracle Thick Mode 활성화
ORACLE_THICK_MODE=true

# Oracle Instant Client 라이브러리 경로
# Mac
ORACLE_CLIENT_LIB_DIR=/usr/local/lib

# Linux
# ORACLE_CLIENT_LIB_DIR=/opt/oracle/instantclient_21_8

# Windows
# ORACLE_CLIENT_LIB_DIR=C:\oracle\instantclient_21_8
```

**참고**: `ORACLE_CLIENT_LIB_DIR`를 비워두면 시스템 기본 경로를 사용합니다.

### 3. 서버 재시작

```bash
# 개발 서버 재시작
npm run dev
```

성공적으로 초기화되면 콘솔에 다음 메시지가 표시됩니다:
```
✓ Oracle Thick mode initialized
  Library directory: /usr/local/lib
```

## 확인 방법

1. TMS 애플리케이션 접속
2. 데이터베이스 연결 테스트
3. SQL 통계 수집 시도

오류 없이 정상 작동하면 성공입니다.

## 문제 해결

### "Cannot find shared library" 오류
```
Error: DPI-1047: Cannot locate a 64-bit Oracle Client library
```

**해결 방법**:
- Oracle Instant Client가 올바르게 설치되었는지 확인
- `ORACLE_CLIENT_LIB_DIR` 경로가 정확한지 확인
- macOS: `otool -L /usr/local/lib/libclntsh.dylib` 실행하여 의존성 확인
- Linux: `ldd /opt/oracle/instantclient_21_8/libclntsh.so` 실행

### "Architecture mismatch" 오류
```
Error: DPI-1047: 64-bit Oracle Client library cannot be loaded: dlopen... not compatible
```

**해결 방법**:
- Oracle Instant Client 아키텍처가 시스템 아키텍처와 일치하는지 확인
- Apple Silicon (M1/M2) Mac: x64 또는 ARM64 버전 사용
- Intel Mac: x64 버전 사용

### Thick 모드가 초기화되지 않음

콘솔 로그 확인:
```bash
npm run dev
```

로그에서 다음을 확인:
- `✓ Oracle Thick mode initialized`: 성공
- `✗ Oracle Thick mode initialization failed`: 실패 (상세 오류 메시지 참조)

## Thin 모드 vs Thick 모드 비교

| 특징 | Thin 모드 | Thick 모드 |
|-----|----------|-----------|
| 설치 | 추가 설치 불필요 | Instant Client 필요 |
| 성능 | 빠름 | 약간 느림 |
| 비밀번호 검증 | 제한적 (11G, 12C 미지원) | 모든 방식 지원 |
| 기능 | 기본 기능 | 전체 기능 |
| 배포 | 간단 | 복잡 |

## 권장 사항

1. **개발 환경**: Thin 모드 사용 (간편함)
   - 문제 발생 시 비밀번호 재설정

2. **프로덕션 환경**: 상황에 따라 선택
   - 비밀번호 정책 변경 가능: Thin 모드 (권장)
   - 레거시 시스템: Thick 모드

## 추가 참고 자료

- [node-oracledb 공식 문서](https://node-oracledb.readthedocs.io/)
- [Oracle Instant Client 다운로드](https://www.oracle.com/database/technologies/instant-client/downloads.html)
- [Thin vs Thick 모드 비교](https://node-oracledb.readthedocs.io/en/latest/user_guide/initialization.html)
