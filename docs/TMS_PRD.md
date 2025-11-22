# 📋 Product Requirements Document (PRD)
## Narae TMS v2.0

━━━━━━━━━━━━━━━━━━━━━━━━━━
    Narae TMS v2.0
    SQL Tuning Management System

    by 주식회사 나래정보기술
━━━━━━━━━━━━━━━━━━━━━━━━━━

---

## 1. 제품 개요

### 1.1 제품명
- **제품명**: Narae TMS (SQL Tuning Management System)
- **한글명**: 나래 튜닝관리시스템
- **영문명**: Narae Tuning Management System
- **버전**: v2.0
- **제조사**: 주식회사 나래정보기술

### 1.2 제품 비전
Oracle 데이터베이스의 SQL 성능을 실시간으로 모니터링하고, 체계적인 튜닝 프로세스를 통해 데이터베이스 성능을 최적화하는 엔터프라이즈급 통합 관리 시스템

### 1.3 목표 사용자
- **Primary Users**
  - Database Administrator (DBA)
  - SQL Tuner
  - Performance Engineer
  
- **Secondary Users**
  - IT Manager
  - Application Developer
  - System Operator

### 1.4 핵심 가치
- **자동화**: SQL 성능 문제 자동 감지 및 분류
- **효율성**: 체계적인 튜닝 워크플로우 관리
- **가시성**: 실시간 성능 메트릭 대시보드
- **추적성**: 완전한 튜닝 이력 관리

---

## 2. 기능 요구사항

### 2.1 SQL 모니터링

#### 2.1.1 실시간 SQL 모니터링
- **설명**: v$sql, v$sqlstats 뷰를 통한 실시간 SQL 성능 모니터링
- **우선순위**: P0 (Critical)
- **기능 상세**:
  - 5분/30분/1시간 단위 자동 수집
  - SQL ID별 성능 메트릭 추적
  - 임계값 초과 SQL 자동 식별
  - 실시간 알림 발송

#### 2.1.2 Top SQL 분석
- **설명**: 성능 지표별 상위 SQL 분석
- **우선순위**: P0 (Critical)
- **기능 상세**:
  - Buffer Gets 기준 Top SQL
  - Elapsed Time 기준 Top SQL
  - CPU Time 기준 Top SQL
  - Disk Reads 기준 Top SQL
  - Executions 기준 Top SQL

#### 2.1.3 SQL 검색 및 필터링
- **설명**: 다양한 조건을 통한 SQL 검색
- **우선순위**: P1 (High)
- **검색 조건**:
  - SQL ID
  - Module
  - Schema
  - 조회 기간
  - 성능 임계값 (Elapsed Time, Buffer Gets, CPU Time)
  - Execution 횟수

### 2.2 튜닝 관리

#### 2.2.1 튜닝 대상 SQL 등록
- **설명**: 튜닝이 필요한 SQL을 시스템에 등록
- **우선순위**: P0 (Critical)
- **기능 상세**:
  - 자동 식별 (임계값 기반)
  - 수동 등록
  - 우선순위 설정 (Critical/High/Medium/Low)
  - 튜닝 담당자 할당

#### 2.2.2 튜닝 워크플로우
- **설명**: 체계적인 튜닝 프로세스 관리
- **우선순위**: P0 (Critical)
- **프로세스 단계**:
  1. **식별** (Identified)
  2. **할당** (Assigned)
  3. **진행중** (In Progress)
  4. **검토** (Review)
  5. **완료** (Completed)
  6. **취소** (Cancelled)

#### 2.2.3 튜닝 이력 관리
- **설명**: 모든 튜닝 활동의 이력 관리
- **우선순위**: P1 (High)
- **기록 항목**:
  - 튜닝 일시
  - 튜너 정보
  - 튜닝 방법
  - 개선 전/후 메트릭
  - 개선율
  - 튜닝 상세 내용

### 2.3 실행계획 관리

#### 2.3.1 실행계획 조회
- **설명**: SQL의 실행계획 분석
- **우선순위**: P1 (High)
- **기능 상세**:
  - 트리 구조 표시
  - Cost, Cardinality, Bytes 정보
  - Predicate Information
  - Access/Filter 조건

#### 2.3.2 실행계획 비교
- **설명**: 튜닝 전/후 실행계획 비교
- **우선순위**: P2 (Medium)
- **기능 상세**:
  - Side-by-side 비교
  - 변경점 하이라이트
  - Cost 차이 분석

### 2.4 AWR/ADDM 연동

#### 2.4.1 AWR Report 생성
- **설명**: Automatic Workload Repository 리포트 생성
- **우선순위**: P1 (High)
- **기능 상세**:
  - Snapshot 구간 선택
  - HTML/Text 포맷
  - 자동 생성 스케줄링

#### 2.4.2 ADDM Report 분석
- **설명**: Automatic Database Diagnostic Monitor 분석
- **우선순위**: P2 (Medium)
- **기능 상세**:
  - Finding 우선순위
  - Recommendation 제시
  - Impact 분석

### 2.5 SQL Trace

#### 2.5.1 Trace 설정
- **설명**: Session/System 레벨 SQL Trace 설정
- **우선순위**: P2 (Medium)
- **기능 상세**:
  - Event 10046 설정
  - Bind/Wait 옵션
  - Trace 파일 관리

#### 2.5.2 TKPROF 분석
- **설명**: Trace 파일 분석 및 리포트
- **우선순위**: P2 (Medium)
- **기능 상세**:
  - 자동 TKPROF 실행
  - 결과 파싱 및 저장
  - 성능 메트릭 추출

---

## 3. 비기능 요구사항

### 3.1 성능 요구사항
- **응답시간**: 
  - 대시보드 로딩: < 3초
  - SQL 검색: < 2초
  - 리포트 생성: < 10초
- **동시 사용자**: 최대 100명
- **데이터 처리**:
  - SQL 수집: 10,000 SQL/분
  - 저장 용량: 90일 데이터 보관

### 3.2 보안 요구사항
- **인증**: JWT 토큰 기반 인증
- **권한**: Role 기반 접근 제어 (RBAC)
  - Admin: 전체 권한
  - Tuner: 튜닝 작업 권한
  - Viewer: 조회 권한
- **암호화**: 
  - 전송 구간: HTTPS
  - 저장 데이터: AES-256

### 3.3 가용성 요구사항
- **SLA**: 99.5% (연간 다운타임 < 44시간)
- **백업**: 일일 백업, 30일 보관
- **복구**: RPO < 1시간, RTO < 4시간

### 3.4 확장성 요구사항
- **수평 확장**: 로드밸런싱 지원
- **데이터베이스**: 파티셔닝 지원
- **모니터링 대상**: 최대 10개 DB 인스턴스

### 3.5 호환성 요구사항
- **Oracle 버전**: 11g, 12c, 19c, 21c
- **브라우저**: Chrome, Edge, Firefox, Safari (최신 2개 버전)
- **운영체제**: Linux (RHEL 7+, Ubuntu 18.04+), Windows Server 2016+

---

## 4. 시스템 아키텍처

### 4.1 기술 스택
- **Frontend**:
  - Framework: React 18
  - UI Library: Tailwind CSS
  - Charts: Recharts
  - State Management: Context API
  
- **Backend**:
  - Runtime: Node.js 18 LTS
  - Framework: Express.js
  - ORM: Sequelize
  - Cache: Redis
  
- **Database**:
  - Management DB: PostgreSQL 14
  - Target DB: Oracle 11g+
  
- **Infrastructure**:
  - Container: Docker
  - Orchestration: Docker Compose
  - Web Server: Nginx
  - Process Manager: PM2

### 4.2 시스템 구성도
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│   Nginx     │────▶│  Node.js    │
└─────────────┘     └─────────────┘     │   API       │
                                         └──────┬──────┘
                                                │
                    ┌───────────────────────────┼───────────────────────────┐
                    │                           │                           │
             ┌──────▼──────┐           ┌───────▼───────┐          ┌────────▼────────┐
             │ PostgreSQL  │           │     Redis     │          │  Oracle DB      │
             │ (Mgmt DB)   │           │    (Cache)    │          │  (Target)       │
             └─────────────┘           └───────────────┘          └─────────────────┘
```

---

## 5. 개발 일정

### Phase 1: 기반 구축 (2주)
- [ ] 프로젝트 환경 설정
- [ ] 데이터베이스 스키마 설계
- [ ] 기본 API 구조
- [ ] 인증/권한 시스템

### Phase 2: 핵심 기능 (4주)
- [ ] SQL 모니터링
- [ ] Top SQL 분석
- [ ] 튜닝 워크플로우
- [ ] 실행계획 조회

### Phase 3: 고급 기능 (3주)
- [ ] AWR/ADDM 연동
- [ ] SQL Trace
- [ ] 튜닝 이력 관리
- [ ] 리포트 생성

### Phase 4: UI/UX (2주)
- [ ] 대시보드 구현
- [ ] 차트/그래프
- [ ] 반응형 디자인
- [ ] 사용성 개선

### Phase 5: 테스트 및 배포 (1주)
- [ ] 통합 테스트
- [ ] 성능 테스트
- [ ] 보안 테스트
- [ ] 배포

---

## 6. 성공 지표 (KPI)

### 6.1 제품 지표
- SQL 성능 문제 자동 감지율: > 90%
- 평균 튜닝 소요 시간: < 2일
- 튜닝 후 평균 개선율: > 50%
- 시스템 가용성: > 99.5%

### 6.2 사용자 지표
- 일일 활성 사용자(DAU): > 20명
- 월간 튜닝 건수: > 100건
- 사용자 만족도(NPS): > 40

### 6.3 비즈니스 지표
- 데이터베이스 다운타임 감소: > 30%
- DBA 생산성 향상: > 40%
- TCO 절감: > 20%

---

## 7. 리스크 및 대응 방안

### 7.1 기술적 리스크
| 리스크 | 확률 | 영향 | 대응 방안 |
|--------|------|------|----------|
| Oracle 연결 성능 이슈 | 중 | 고 | Connection Pool 최적화, 비동기 처리 |
| 대용량 데이터 처리 | 중 | 고 | 파티셔닝, 인덱싱, 캐싱 전략 |
| 실시간 모니터링 부하 | 저 | 중 | 샘플링, 집계 테이블 활용 |

### 7.2 운영 리스크
| 리스크 | 확률 | 영향 | 대응 방안 |
|--------|------|------|----------|
| DBA 교육 부족 | 중 | 중 | 사용자 교육, 매뉴얼 제공 |
| 레거시 시스템 연동 | 중 | 고 | 단계적 마이그레이션 |
| 변경 저항 | 중 | 중 | 파일럿 프로젝트, 점진적 도입 |

---

## 8. 부록

### 8.1 용어 정의
- **SQL ID**: Oracle이 SQL 문장에 부여하는 고유 식별자
- **Buffer Gets**: 메모리에서 읽은 블록 수
- **Elapsed Time**: SQL 실행 총 소요 시간
- **AWR**: Automatic Workload Repository
- **ADDM**: Automatic Database Diagnostic Monitor

### 8.2 참고 자료
- Oracle Database Performance Tuning Guide
- Oracle Database SQL Tuning Guide
- Oracle Database Reference (v$ Views)

---

*문서 버전: 1.0*  
*작성일: 2025-01-08*  
*작성자: TMS Development Team*
