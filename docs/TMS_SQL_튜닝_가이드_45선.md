# 🚀 TMS SQL 튜닝 가이드 45선

## Oracle 데이터베이스 성능 최적화를 위한 실무 중심 가이드

---

**문서 버전**: 1.0  
**최종 수정일**: 2025-01-13  
**적용 대상**: Oracle Database 11g, 12c, 19c, 21c  
**TMS 연동**: TMS v2.0 AI 기반 튜닝 권고 시스템

---

## 📋 목차

1. [Section 1: 인덱스 기초와 실행계획 이해](#section-1-인덱스-기초와-실행계획-이해)
2. [Section 2: 인덱스 스캔 최적화](#section-2-인덱스-스캔-최적화)
3. [Section 3: 데이터 조인 최적화](#section-3-데이터-조인-최적화)
4. [Section 4: 고급 튜닝 기법](#section-4-고급-튜닝-기법)
5. [부록: TMS 활용 가이드](#부록-tms-활용-가이드)

---

## Section 1: 인덱스 기초와 실행계획 이해

### 1. 인덱스의 구조를 이해해야 해요

**문제 상황**
인덱스의 내부 구조를 이해하지 못하면 효율적인 인덱스 설계와 튜닝이 불가능합니다.

**핵심 개념**

Oracle의 B*Tree 인덱스는 세 가지 노드로 구성됩니다:

| 구성요소 | 설명 |
|---------|------|
| Root Block | 인덱스 트리의 최상위 노드, 브랜치 블록으로 분기 정보 포함 |
| Branch Block | 리프 블록을 찾기 위한 분기 정보를 저장하는 중간 노드 |
| Leaf Block | 실제 인덱스 키 값과 ROWID를 저장하는 최하위 노드 |

**인덱스 ROWID 구조**

```
ROWID = 오브젝트번호 + 데이터파일번호 + 블록번호 + 블록내행번호
```

**TMS 권고 기준**
- Leaf Block 스캔량이 전체 테이블의 15% 초과 시 Full Table Scan 고려
- 클러스터링 팩터(CF)가 테이블 블록 수의 2배 초과 시 인덱스 재구성 권고

---

### 2. 실행계획을 볼 줄 알아야 해요

**실행계획 확인 방법**

```sql
-- 방법 1: EXPLAIN PLAN
EXPLAIN PLAN FOR
SELECT * FROM emp WHERE deptno = 10;

SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY);

-- 방법 2: AUTOTRACE
SET AUTOTRACE ON EXPLAIN

-- 방법 3: 실제 실행 통계 (가장 정확)
SELECT /*+ GATHER_PLAN_STATISTICS */ * FROM emp WHERE deptno = 10;
SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(NULL, NULL, 'ALLSTATS LAST'));
```

**실행계획 주요 항목**

| 항목 | 의미 | TMS 임계값 |
|-----|------|-----------|
| Cost | 옵티마이저 예상 비용 | 상대적 비교 |
| Rows | 예상 반환 행 수 | A-Rows와 비교 |
| Bytes | 예상 데이터 크기 | - |
| Buffers | 버퍼 I/O 횟수 | 1000 이상 주의 |

**TMS 활용**
TMS는 실행계획을 자동 분석하여 비효율적인 오퍼레이션을 식별하고 개선안을 제시합니다.

---

### 3. 튜너들만 아는 또 다른 실행계획

**숨겨진 실행계획 정보 확인**

```sql
-- V$SQL_PLAN_STATISTICS_ALL 활용
SELECT * FROM V$SQL_PLAN_STATISTICS_ALL
WHERE SQL_ID = '&sql_id';

-- 바인드 변수 피킹 확인
SELECT * FROM V$SQL_BIND_CAPTURE
WHERE SQL_ID = '&sql_id';
```

**핵심 분석 포인트**

1. **A-Rows vs E-Rows 비교**: 실제 행 수와 예상 행 수의 차이가 클수록 통계 정보 불일치
2. **Starts 컬럼**: 해당 오퍼레이션의 실행 횟수
3. **A-Time**: 실제 수행 시간

**TMS 자동 분석 항목**
- E-Rows와 A-Rows 편차율 10배 이상 시 통계 수집 권고
- 비효율적인 조인 순서 자동 감지

---

### 4. WHERE 절에서 인덱스 컬럼을 가공하지 마세요

**문제 SQL**

```sql
-- ❌ 나쁜 예: 인덱스 컬럼 가공
SELECT * FROM emp WHERE SUBSTR(empno, 1, 2) = '79';
SELECT * FROM emp WHERE sal * 12 > 50000000;
SELECT * FROM emp WHERE TO_CHAR(hire_date, 'YYYY') = '2023';
SELECT * FROM emp WHERE NVL(comm, 0) > 1000;
```

**튜닝된 SQL**

```sql
-- ✅ 좋은 예: 상수 또는 우변 가공
SELECT * FROM emp WHERE empno LIKE '79%';
SELECT * FROM emp WHERE sal > 50000000 / 12;
SELECT * FROM emp WHERE hire_date >= TO_DATE('2023-01-01', 'YYYY-MM-DD')
                    AND hire_date < TO_DATE('2024-01-01', 'YYYY-MM-DD');
SELECT * FROM emp WHERE comm > 1000;
```

**일반적인 컬럼 가공 사례와 튜닝 방안**

| 나쁜 예 | 좋은 예 |
|--------|--------|
| `SUBSTR(col, 1, 4) = '2023'` | `col LIKE '2023%'` |
| `col * 1.1 > 100` | `col > 100 / 1.1` |
| `TO_CHAR(date_col, 'YYYYMMDD') = '20231225'` | `date_col = TO_DATE('20231225', 'YYYYMMDD')` |
| `NVL(col, 0) = 0` | `col IS NULL OR col = 0` |
| `col || '' = 'ABC'` | `col = 'ABC'` |
| `UPPER(col) = 'ABC'` | 함수 기반 인덱스 생성 |

**TMS 자동 감지**
TMS는 WHERE 절의 인덱스 컬럼 가공을 자동으로 감지하고 대안을 제시합니다.

---

### 5. HAVING 절에 일반 검색조건을 쓰지 마세요

**문제 SQL**

```sql
-- ❌ 나쁜 예: HAVING에 일반 조건
SELECT deptno, AVG(sal)
FROM emp
GROUP BY deptno
HAVING deptno IN (10, 20) AND AVG(sal) > 2000;
```

**튜닝된 SQL**

```sql
-- ✅ 좋은 예: WHERE에 일반 조건, HAVING에 집계 조건
SELECT deptno, AVG(sal)
FROM emp
WHERE deptno IN (10, 20)
GROUP BY deptno
HAVING AVG(sal) > 2000;
```

**원리**
- WHERE 절: 그룹핑 전에 데이터를 필터링 (인덱스 사용 가능)
- HAVING 절: 그룹핑 후에 그룹을 필터링 (집계 함수에만 사용)

**성능 차이**
전체 데이터가 100만 건, deptno 10, 20이 10만 건인 경우:
- 나쁜 예: 100만 건 GROUP BY 후 필터링
- 좋은 예: 10만 건만 GROUP BY

---

### 6. WHERE 절에서 인덱스 컬럼 가공이 불가피하다면 함수 기반 인덱스를 생성하세요

**함수 기반 인덱스(FBI) 생성**

```sql
-- 함수 기반 인덱스 생성
CREATE INDEX idx_emp_upper_ename ON emp(UPPER(ename));

-- 활용 쿼리
SELECT * FROM emp WHERE UPPER(ename) = 'SCOTT';
```

**FBI 활용 사례**

```sql
-- 사례 1: 대소문자 무관 검색
CREATE INDEX idx_upper_name ON customers(UPPER(name));

-- 사례 2: 날짜 연도 추출
CREATE INDEX idx_year_order ON orders(EXTRACT(YEAR FROM order_date));

-- 사례 3: 문자열 앞부분 추출
CREATE INDEX idx_substr_code ON products(SUBSTR(product_code, 1, 3));

-- 사례 4: NULL 처리
CREATE INDEX idx_nvl_status ON orders(NVL(status, 'PENDING'));
```

**FBI 사용 시 주의사항**
1. 쿼리에서 FBI와 동일한 함수 표현식 사용 필요
2. FBI 유지 비용 증가 (DML 부하)
3. 통계 정보 수집 필요: `DBMS_STATS.GATHER_INDEX_STATS`

---

### 7. 암시적 형변환에 주의하세요

**문제 상황**

```sql
-- emp.empno가 NUMBER 타입일 때
-- ❌ 나쁜 예: 문자열과 비교 (empno가 형변환됨)
SELECT * FROM emp WHERE empno = '7788';

-- 실제 변환된 쿼리 (인덱스 사용 불가)
SELECT * FROM emp WHERE TO_NUMBER(empno) = 7788;
```

**Oracle 형변환 우선순위**

| 우선순위 | 데이터 타입 |
|---------|-----------|
| 1 | DATE/TIMESTAMP |
| 2 | NUMBER |
| 3 | VARCHAR2/CHAR |

**튜닝 방법**

```sql
-- ✅ 좋은 예: 명시적 형변환 (인덱스 컬럼 기준으로 변환)
-- empno가 NUMBER인 경우
SELECT * FROM emp WHERE empno = 7788;

-- order_date가 DATE인 경우
SELECT * FROM orders 
WHERE order_date = TO_DATE('2023-12-25', 'YYYY-MM-DD');

-- product_code가 VARCHAR2인 경우
SELECT * FROM products WHERE product_code = TO_CHAR(12345);
```

**TMS 감지 항목**
- 암시적 형변환 발생 시 경고
- 인덱스 컬럼의 데이터 타입과 비교값 타입 불일치 감지

---

### 8. ORDER BY를 통한 과도한 정렬작업을 피하세요

**문제 상황**

정렬 작업은 많은 CPU와 메모리를 사용하며, 임시 테이블스페이스 디스크 I/O를 유발합니다.

**인덱스를 활용한 정렬 생략**

```sql
-- 인덱스: emp_idx(deptno, sal)

-- ❌ 나쁜 예: 인덱스와 ORDER BY 불일치로 정렬 발생
SELECT * FROM emp 
WHERE deptno = 10 
ORDER BY ename;

-- ✅ 좋은 예: 인덱스 순서와 일치하여 정렬 생략
SELECT * FROM emp 
WHERE deptno = 10 
ORDER BY sal;
```

**정렬 생략 조건**

1. ORDER BY 컬럼이 인덱스 컬럼 순서와 일치
2. WHERE 조건이 인덱스 선두 컬럼을 '=' 조건으로 사용
3. ASC/DESC 방향이 인덱스와 일치 (또는 INDEX_DESC 힌트 사용)

**MIN/MAX 최적화**

```sql
-- 인덱스: orders_idx(customer_id, order_date)

-- ✅ 최신 주문일 조회 (INDEX RANGE SCAN - MIN/MAX)
SELECT MAX(order_date) 
FROM orders 
WHERE customer_id = 100;
```

---

### 9. 그룹함수 대신 인덱스를 사용해서 SQL을 튜닝하세요

**문제 SQL**

```sql
-- ❌ 나쁜 예: 전체 테이블 스캔 후 집계
SELECT MIN(sal), MAX(sal) FROM emp;
```

**튜닝된 SQL**

```sql
-- sal 컬럼에 인덱스가 있다면
-- ✅ 좋은 예: FIRST_ROWS 힌트로 INDEX FULL SCAN (MIN/MAX) 유도
SELECT /*+ INDEX_DESC(emp emp_sal_idx) */ sal
FROM emp
WHERE ROWNUM = 1;  -- MAX 값

SELECT /*+ INDEX(emp emp_sal_idx) */ sal
FROM emp
WHERE ROWNUM = 1;  -- MIN 값

-- 또는 스칼라 서브쿼리 활용
SELECT 
    (SELECT MIN(sal) FROM emp) AS min_sal,
    (SELECT MAX(sal) FROM emp) AS max_sal
FROM dual;
```

---

### 10. 인덱스를 액세스하지 못하는 검색조건을 알아야 해요

**인덱스를 사용할 수 없는 조건**

| 유형 | 예시 | 대안 |
|-----|-----|-----|
| NOT 조건 | `WHERE NOT status = 'A'` | `WHERE status IN ('B', 'C', 'D')` |
| IS NOT NULL | `WHERE col IS NOT NULL` | 함수 기반 인덱스 |
| LIKE 앞 % | `WHERE name LIKE '%ABC'` | Full Text Index |
| OR 조건 | `WHERE col1 = 'A' OR col2 = 'B'` | UNION ALL |
| 부정 비교 | `WHERE col <> 'A'` | 긍정 조건으로 변환 |
| 함수 적용 | `WHERE TRUNC(date_col) = ...` | 범위 조건으로 변환 |

**OR 조건 튜닝**

```sql
-- ❌ 나쁜 예
SELECT * FROM emp WHERE deptno = 10 OR job = 'MANAGER';

-- ✅ 좋은 예: UNION ALL 사용
SELECT * FROM emp WHERE deptno = 10
UNION ALL
SELECT * FROM emp WHERE job = 'MANAGER' AND deptno <> 10;
```

---

### 11. 어차피 Full Table Scan이라면 빠르게 수행되게 하기

**Parallel 처리**

```sql
-- 힌트를 통한 병렬 처리
SELECT /*+ PARALLEL(emp, 4) */ * FROM emp;

-- 테이블 레벨 병렬도 설정
ALTER TABLE emp PARALLEL 4;
```

**Direct Path Read**

```sql
-- _serial_direct_read 파라미터 또는 힌트
SELECT /*+ PARALLEL(emp, 4) FULL(emp) */ * FROM emp;
```

**Full Table Scan 최적화 체크리스트**

1. **DB_FILE_MULTIBLOCK_READ_COUNT** 파라미터 확인 (권장: 128)
2. 테이블 High Water Mark 정리 (불필요한 블록 제거)
3. 파티션 Pruning 활용
4. 압축 테이블 고려

```sql
-- HWM 정리
ALTER TABLE emp MOVE;
ALTER INDEX emp_pk REBUILD;

-- 통계 재수집
EXEC DBMS_STATS.GATHER_TABLE_STATS('HR', 'EMP');
```

---

### 12. 인덱스를 탈 수 있도록 힌트를 사용하세요

**주요 인덱스 힌트**

```sql
-- 특정 인덱스 사용 강제
SELECT /*+ INDEX(emp emp_deptno_idx) */ * FROM emp WHERE deptno = 10;

-- 인덱스 사용 금지
SELECT /*+ NO_INDEX(emp emp_deptno_idx) */ * FROM emp WHERE deptno = 10;

-- Full Table Scan 강제
SELECT /*+ FULL(emp) */ * FROM emp WHERE deptno = 10;

-- Index Range Scan 내림차순
SELECT /*+ INDEX_DESC(emp emp_date_idx) */ * 
FROM emp 
WHERE hire_date > SYSDATE - 30
ORDER BY hire_date DESC;

-- Index Fast Full Scan 유도
SELECT /*+ INDEX_FFS(emp emp_sal_idx) */ COUNT(*) FROM emp;
```

**힌트 사용 시 주의사항**

1. 힌트의 테이블명/인덱스명 정확히 기술 (Alias 사용 시 Alias 명시)
2. 오타가 있으면 힌트 무시됨 (에러 발생 안 함)
3. 통계 정보가 정확하면 힌트 없이도 최적 실행계획 수립

```sql
-- Alias 사용 시
SELECT /*+ INDEX(e emp_deptno_idx) */ * FROM emp e WHERE e.deptno = 10;
```

---

### 13. 여러 인덱스를 동시에 활용하여 시너지 효과 발휘하기

**Index Merge (AND-EQUAL)**

```sql
-- deptno_idx와 job_idx가 각각 존재할 때
SELECT /*+ AND_EQUAL(emp deptno_idx job_idx) */ * 
FROM emp 
WHERE deptno = 10 AND job = 'CLERK';
```

**Bitmap Conversion**

```sql
-- 비용 기반 옵티마이저가 자동으로 선택
SELECT * FROM emp 
WHERE deptno = 10 AND job = 'CLERK';

-- 실행계획에서 BITMAP CONVERSION 확인
-- BITMAP CONVERSION TO ROWIDS
--   BITMAP AND
--     BITMAP CONVERSION FROM ROWIDS
--       INDEX RANGE SCAN EMP_DEPTNO_IDX
--     BITMAP CONVERSION FROM ROWIDS
--       INDEX RANGE SCAN EMP_JOB_IDX
```

---

### 14. 결합 컬럼 인덱스로 테이블 접근 횟수를 줄이세요

**단일 컬럼 인덱스 vs 결합 컬럼 인덱스**

```sql
-- 쿼리: WHERE deptno = 10 AND job = 'CLERK'

-- 단일 컬럼 인덱스 사용 시
-- 1. deptno_idx로 ROWID 조회
-- 2. 테이블 액세스
-- 3. job 조건 필터링

-- 결합 컬럼 인덱스 (deptno, job) 사용 시
-- 1. 인덱스에서 바로 조건 만족하는 ROWID 조회
-- 2. 테이블 액세스 (필터링 불필요)

CREATE INDEX emp_deptno_job_idx ON emp(deptno, job);
```

**커버링 인덱스 (Index Only Scan)**

```sql
-- 인덱스에 필요한 모든 컬럼이 포함되어 테이블 액세스 불필요
CREATE INDEX emp_covering_idx ON emp(deptno, job, sal);

SELECT deptno, job, sal FROM emp WHERE deptno = 10;
-- 실행계획: INDEX RANGE SCAN (테이블 액세스 없음)
```

---

### 15. 결합 컬럼 인덱스의 컬럼 순서에도 최적화 순서가 있습니다

**컬럼 순서 결정 원칙**

1. **항상 '=' 조건으로 사용되는 컬럼** → 선두에 배치
2. **선택도(Selectivity)가 높은 컬럼** → 앞쪽에 배치 (좁은 범위)
3. **범위 조건 컬럼** → 뒤쪽에 배치
4. **정렬 기준 컬럼** → 마지막에 배치

**예시**

```sql
-- 자주 사용되는 쿼리 패턴
WHERE status = 'ACTIVE' 
  AND create_date >= SYSDATE - 30 
  AND create_date < SYSDATE
ORDER BY create_date DESC

-- 최적 인덱스: status(=조건) + create_date(범위+정렬)
CREATE INDEX orders_idx ON orders(status, create_date);
```

**선택도 확인**

```sql
-- 컬럼별 카디널리티 확인
SELECT column_name, num_distinct, density
FROM user_tab_col_statistics
WHERE table_name = 'ORDERS';
```

---

## Section 2: 인덱스 스캔 최적화

### 16. INDEX SKIP SCAN을 활용한 성능 최적화

**Index Skip Scan 원리**

결합 인덱스의 선두 컬럼이 WHERE 절에 없어도 후행 컬럼으로 인덱스를 사용할 수 있습니다.

```sql
-- 인덱스: emp_idx(deptno, sal)

-- 선두 컬럼 없이 쿼리
SELECT * FROM emp WHERE sal > 3000;

-- INDEX SKIP SCAN 유도
SELECT /*+ INDEX_SS(emp emp_idx) */ * FROM emp WHERE sal > 3000;
```

**Skip Scan 효과적인 상황**

- 선두 컬럼의 Distinct 값이 적을 때 (예: 성별, 상태코드)
- 후행 컬럼의 조건이 선택도가 높을 때

**TMS 권고 기준**
- 선두 컬럼 NDV < 10이고, 후행 컬럼 선택도 < 5%일 때 Skip Scan 권고

---

### 17. INDEX FULL SCAN을 이용하여 그룹핑 작업을 빠르게 하는 방법

**Index Full Scan 활용**

```sql
-- sal_idx(sal) 인덱스 존재 시
-- 정렬된 순서로 전체 인덱스 스캔

SELECT /*+ INDEX(emp sal_idx) */ sal
FROM emp
ORDER BY sal;  -- 정렬 작업 생략
```

**GROUP BY 최적화**

```sql
-- 인덱스: emp_idx(deptno, sal)

-- INDEX FULL SCAN으로 GROUP BY 정렬 생략
SELECT /*+ INDEX(emp emp_idx) */ deptno, SUM(sal)
FROM emp
GROUP BY deptno;  -- deptno 순서로 이미 정렬됨
```

---

### 18. INDEX FAST FULL SCAN을 이용한 성능 최적화

**Index Fast Full Scan vs Index Full Scan**

| 특성 | Index Full Scan | Index Fast Full Scan |
|-----|-----------------|---------------------|
| 읽기 순서 | 논리적 순서 (정렬 유지) | 물리적 순서 (정렬 무시) |
| Multiblock I/O | 불가 | 가능 |
| 병렬 처리 | 불가 | 가능 |
| 용도 | ORDER BY 생략 필요 시 | COUNT(*), SUM 등 집계 |

```sql
-- Index Fast Full Scan 유도
SELECT /*+ INDEX_FFS(emp emp_sal_idx) */ COUNT(*), SUM(sal) FROM emp;

-- 병렬 처리와 함께
SELECT /*+ INDEX_FFS(emp emp_sal_idx) PARALLEL_INDEX(emp emp_sal_idx 4) */ 
       COUNT(*), SUM(sal) 
FROM emp;
```

---

### 19. INDEX BITMAP MERGE SCAN으로 성능 최적화하기

**Bitmap Index Merge**

여러 인덱스를 Bitmap으로 변환하여 AND/OR 연산 후 결과 병합

```sql
-- 자동으로 Bitmap Merge 선택되는 경우
SELECT * FROM emp 
WHERE deptno = 10 OR job = 'CLERK';

-- 실행계획
-- BITMAP CONVERSION TO ROWIDS
--   BITMAP OR
--     BITMAP CONVERSION FROM ROWIDS
--       INDEX RANGE SCAN EMP_DEPTNO_IDX
--     BITMAP CONVERSION FROM ROWIDS
--       INDEX RANGE SCAN EMP_JOB_IDX
```

**주의사항**
- B*Tree 인덱스를 Bitmap으로 변환하는 오버헤드 존재
- 소량 데이터에서는 오히려 비효율적

---

### 20. 중복된 데이터가 없다면 UNIQUE 인덱스를 생성하세요

**Unique Index 장점**

1. INDEX UNIQUE SCAN 사용 (단 한 건만 검색)
2. 옵티마이저에게 카디널리티 정보 제공
3. 데이터 무결성 보장

```sql
-- Unique 인덱스 생성
CREATE UNIQUE INDEX emp_empno_idx ON emp(empno);

-- 복합 Unique 인덱스
CREATE UNIQUE INDEX orders_uk ON orders(order_no, order_seq);
```

**Index Unique Scan vs Index Range Scan**

```sql
-- Unique Index에서 '=' 조건
SELECT * FROM emp WHERE empno = 7788;
-- INDEX UNIQUE SCAN (한 건만 검색하고 종료)

-- Non-Unique Index에서 '=' 조건  
SELECT * FROM emp WHERE deptno = 10;
-- INDEX RANGE SCAN (조건 만족하는 모든 건 검색)
```

---

## Section 3: 데이터 조인 최적화

### 21. 조인 문장 튜닝 시 조인순서 튜닝의 중요성

**조인 순서가 성능에 미치는 영향**

```sql
-- 테이블 규모: 부서(7건), 사원(1000만건)

-- ✅ 좋은 조인 순서: 작은 테이블 → 큰 테이블
-- 부서(7건) 먼저 읽고, 각 부서별로 사원 조회 = 7회 조인 시도

-- ❌ 나쁜 조인 순서: 큰 테이블 → 작은 테이블
-- 사원(1000만건) 먼저 읽고, 각 사원별로 부서 조회 = 1000만회 조인 시도
```

**조인 순서 제어 힌트**

```sql
-- LEADING: 조인 순서 지정
SELECT /*+ LEADING(d e) */ e.*, d.dname
FROM emp e, dept d
WHERE e.deptno = d.deptno;

-- ORDERED: FROM 절 순서대로 조인
SELECT /*+ ORDERED */ e.*, d.dname
FROM dept d, emp e
WHERE e.deptno = d.deptno;
```

---

### 22. 소량 데이터 조인의 최적 선택

**Nested Loop Join 특성**

- 선행(Driving) 테이블의 각 행마다 후행 테이블 조회
- 인덱스를 통한 랜덤 액세스
- OLTP 환경의 소량 데이터 조인에 최적

```sql
-- NL 조인 유도
SELECT /*+ USE_NL(e d) LEADING(d e) */ e.ename, d.dname
FROM dept d, emp e
WHERE e.deptno = d.deptno
  AND d.deptno = 10;
```

**NL 조인 최적화 조건**

1. 선행 테이블의 결과 집합이 작아야 함
2. 후행 테이블 조인 컬럼에 인덱스 필수
3. 부분 범위 처리가 필요한 OLTP 쿼리에 적합

**TMS 권고 기준**
- 선행 집합 < 1000건 & 후행 테이블 인덱스 존재 시 NL 조인 권고

---

### 23. 3개 이상의 테이블을 NESTED LOOP 조인으로 조인하는 방법

**3테이블 NL 조인**

```sql
-- 조인 순서: dept → emp → sal_history
SELECT /*+ LEADING(d e s) USE_NL(e) USE_NL(s) */
       d.dname, e.ename, s.sal
FROM dept d, emp e, sal_history s
WHERE d.deptno = e.deptno
  AND e.empno = s.empno
  AND d.deptno = 10;
```

**조인 순서 결정 원칙**

1. 가장 적은 결과 집합을 반환하는 테이블이 선행
2. 각 단계마다 조인 결과가 작아지는 순서
3. 조인 컬럼에 인덱스가 있는 테이블이 후행

---

### 24. 대량의 데이터를 조인할 때는 HASH 조인을 사용하세요

**Hash Join 특성**

- 작은 테이블로 해시 테이블 생성 (Build Input)
- 큰 테이블을 스캔하며 해시 조회 (Probe Input)
- 대용량 배치 처리에 최적

```sql
-- Hash 조인 유도
SELECT /*+ USE_HASH(e d) */ e.ename, d.dname
FROM emp e, dept d
WHERE e.deptno = d.deptno;

-- Build Input 지정 (작은 테이블)
SELECT /*+ USE_HASH(e d) SWAP_JOIN_INPUTS(d) */ e.ename, d.dname
FROM emp e, dept d
WHERE e.deptno = d.deptno;
```

**Hash Join 최적화 조건**

1. '=' 조인 조건 필수 (해시 함수 사용)
2. Build Input이 PGA 메모리(HASH_AREA_SIZE)에 적재 가능해야 함
3. 인덱스 유무와 무관하게 동작

**TMS 권고 기준**
- 양쪽 테이블 모두 10,000건 이상 & '=' 조인 시 Hash 조인 권고

---

### 25. 3개의 테이블을 HASH 조인할 때 해시 테이블을 선택하는 방법

**3테이블 Hash 조인**

```sql
-- 조인 순서와 Build Input 지정
SELECT /*+ LEADING(d e s) 
           USE_HASH(e) USE_HASH(s)
           SWAP_JOIN_INPUTS(d) */
       d.dname, e.ename, s.sal
FROM dept d, emp e, sal_history s
WHERE d.deptno = e.deptno
  AND e.empno = s.empno;
```

**Build Input 선택 원칙**

1. 가장 작은 테이블이 Build Input
2. 메모리에 적재 가능한 크기인지 확인
3. SWAP_JOIN_INPUTS 힌트로 Build/Probe 역할 교체

---

### 26. 해시조인이 불가능한 조인 연결 조건에 대한 대처방법

**Hash Join 불가 조건**

Hash Join은 '=' 조건에서만 사용 가능합니다.

```sql
-- ❌ Hash Join 불가: 부등호 조인
SELECT * FROM emp e, sal_grade g
WHERE e.sal BETWEEN g.low_sal AND g.high_sal;

-- ✅ 대안 1: Sort Merge Join
SELECT /*+ USE_MERGE(e g) */ * 
FROM emp e, sal_grade g
WHERE e.sal BETWEEN g.low_sal AND g.high_sal;

-- ✅ 대안 2: Nested Loop Join
SELECT /*+ USE_NL(e g) */ * 
FROM emp e, sal_grade g
WHERE e.sal BETWEEN g.low_sal AND g.high_sal;
```

---

### 27. SORT MERGE 조인이 유리한 SQL은 이 경우입니다

**Sort Merge Join 특성**

- 양쪽 테이블을 조인 키로 정렬 후 병합
- 정렬 작업 부하 발생
- 부등호 조인, 대용량 조인에 유리

**Sort Merge Join 유리한 상황**

1. Non-Equi 조인 (BETWEEN, <, >, <=, >=)
2. 이미 정렬된 데이터 (인덱스 또는 ORDER BY)
3. 조인 컬럼에 인덱스가 없는 경우

```sql
-- Sort Merge 조인 유도
SELECT /*+ USE_MERGE(e g) */ e.ename, g.grade
FROM emp e, sal_grade g
WHERE e.sal BETWEEN g.low_sal AND g.high_sal;
```

**조인 방식 비교**

| 특성 | NL Join | Hash Join | Sort Merge Join |
|-----|---------|-----------|-----------------|
| 조인 조건 | 모든 조건 | '=' 만 | 모든 조건 |
| 인덱스 필요 | 후행 테이블 필수 | 불필요 | 불필요 |
| 메모리 사용 | 적음 | Hash Area | Sort Area |
| 부분 범위 처리 | 가능 | 불가 | 불가 |
| 최적 상황 | OLTP, 소량 | 배치, 대량 | Non-Equi, 대량 |

---

### 28. 아우터 조인의 성능을 높이는 방법

**Outer Join 기본**

```sql
-- LEFT OUTER JOIN
SELECT e.ename, d.dname
FROM emp e LEFT OUTER JOIN dept d ON e.deptno = d.deptno;

-- Oracle 전용 문법 (+)
SELECT e.ename, d.dname
FROM emp e, dept d
WHERE e.deptno = d.deptno(+);
```

**Outer Join 최적화**

```sql
-- 1. 인덱스 활용
-- Outer 쪽 테이블(+)이 아닌 테이블에 조건 추가
SELECT e.ename, d.dname
FROM emp e, dept d
WHERE e.deptno = d.deptno(+)
  AND e.job = 'CLERK';  -- emp 테이블 조건으로 범위 축소

-- 2. Hash Outer Join
SELECT /*+ USE_HASH(e d) */ e.ename, d.dname
FROM emp e LEFT OUTER JOIN dept d ON e.deptno = d.deptno;
```

**Outer Join 주의사항**

```sql
-- ❌ 잘못된 조건 위치 (Outer Join 무효화)
SELECT e.ename, d.dname
FROM emp e, dept d
WHERE e.deptno = d.deptno(+)
  AND d.loc = 'DALLAS';  -- Inner Join으로 변환됨

-- ✅ 올바른 조건 위치
SELECT e.ename, d.dname
FROM emp e, dept d
WHERE e.deptno = d.deptno(+)
  AND d.loc(+) = 'DALLAS';  -- Outer Join 유지
```

---

### 29. 이럴 때는 FULL OUTER 조인으로 유도하세요

**Full Outer Join**

양쪽 테이블 모두에서 매칭되지 않는 행도 포함

```sql
-- ANSI 표준
SELECT e.ename, d.dname
FROM emp e FULL OUTER JOIN dept d ON e.deptno = d.deptno;

-- Oracle 전용 (11g 이전)
SELECT e.ename, d.dname
FROM emp e, dept d
WHERE e.deptno = d.deptno(+)
UNION ALL
SELECT NULL, d.dname
FROM dept d
WHERE NOT EXISTS (SELECT 1 FROM emp e WHERE e.deptno = d.deptno);
```

**Full Outer Join 최적화**

```sql
-- Hash Full Outer Join 유도
SELECT /*+ USE_HASH(e d) */ e.ename, d.dname
FROM emp e FULL OUTER JOIN dept d ON e.deptno = d.deptno;
```

---

### 30. 3개의 테이블을 아우터 조인할 때 튜닝방법

**3테이블 Outer Join**

```sql
-- 주문 → 주문상세 → 상품 (순차적 Outer Join)
SELECT /*+ LEADING(o od p) USE_NL(od) USE_NL(p) */
       o.order_no, od.product_id, p.product_name
FROM orders o
LEFT OUTER JOIN order_details od ON o.order_id = od.order_id
LEFT OUTER JOIN products p ON od.product_id = p.product_id
WHERE o.order_date >= TRUNC(SYSDATE);
```

**주의사항**
- Outer Join의 연쇄에서 조인 순서 변경 불가
- 각 단계의 Outer 관계가 유지되어야 함

---

## Section 4: 고급 튜닝 기법

### 31. 인라인 뷰와 조인할 때 주의점

**View Merging**

옵티마이저가 인라인 뷰를 메인 쿼리와 병합하여 최적화

```sql
-- 인라인 뷰
SELECT e.*, v.avg_sal
FROM emp e,
     (SELECT deptno, AVG(sal) avg_sal FROM emp GROUP BY deptno) v
WHERE e.deptno = v.deptno;

-- View Merging이 안 되는 경우
-- - GROUP BY, DISTINCT, ROWNUM 포함
-- - 집합 연산자 (UNION, INTERSECT 등)
-- - 분석 함수 포함
```

**View Merging 제어**

```sql
-- View Merging 방지
SELECT /*+ NO_MERGE(v) */ e.*, v.avg_sal
FROM emp e,
     (SELECT deptno, AVG(sal) avg_sal FROM emp GROUP BY deptno) v
WHERE e.deptno = v.deptno;

-- View Merging 유도
SELECT /*+ MERGE(v) */ ...
```

---

### 32. View 안의 조인 순서를 조정해서 성능을 높이는 튜닝방법

**View 내부 조인 순서 제어**

```sql
-- 뷰 정의
CREATE VIEW emp_dept_v AS
SELECT /*+ LEADING(d e) USE_NL(e) */
       e.empno, e.ename, d.dname
FROM dept d, emp e
WHERE d.deptno = e.deptno;

-- 또는 쿼리에서 힌트 사용
SELECT /*+ LEADING(emp_dept_v.d emp_dept_v.e) */ *
FROM emp_dept_v
WHERE dname = 'SALES';
```

---

### 33. MVIEW로 조인 성능 혁신하기

**Materialized View 활용**

복잡한 조인/집계 결과를 미리 계산하여 저장

```sql
-- MVIEW 생성
CREATE MATERIALIZED VIEW mv_sales_summary
BUILD IMMEDIATE
REFRESH FAST ON COMMIT
ENABLE QUERY REWRITE
AS
SELECT p.product_id, p.product_name, 
       SUM(s.quantity) total_qty,
       SUM(s.amount) total_amount
FROM products p, sales s
WHERE p.product_id = s.product_id
GROUP BY p.product_id, p.product_name;

-- MVIEW Log 생성 (Fast Refresh용)
CREATE MATERIALIZED VIEW LOG ON products WITH ROWID;
CREATE MATERIALIZED VIEW LOG ON sales WITH ROWID;
```

**Query Rewrite**

```sql
-- 자동으로 MVIEW 사용
SELECT product_name, SUM(amount)
FROM products p, sales s
WHERE p.product_id = s.product_id
GROUP BY product_name;
-- 옵티마이저가 mv_sales_summary를 대신 사용
```

---

### 34. 서브쿼리문 튜닝 1. 실행 순서 조정하기

**서브쿼리 실행 순서**

```sql
-- Filter 방식: 메인 → 서브쿼리 (기본)
SELECT * FROM emp e
WHERE EXISTS (SELECT 1 FROM dept d WHERE d.deptno = e.deptno);

-- Unnesting: 서브쿼리를 조인으로 변환
SELECT /*+ UNNEST(@subq) */ * FROM emp e
WHERE EXISTS (SELECT /*+ QB_NAME(subq) */ 1 FROM dept d WHERE d.deptno = e.deptno);
```

**실행 순서 제어**

```sql
-- 서브쿼리 먼저 실행 후 메인 쿼리 필터링
SELECT /*+ NO_UNNEST(@subq) PUSH_SUBQ(@subq) */ * FROM emp e
WHERE e.deptno IN (SELECT /*+ QB_NAME(subq) */ deptno FROM dept WHERE loc = 'DALLAS');
```

---

### 35. 서브쿼리문 튜닝 2. 서브쿼리를 세미조인으로 변경하기

**Semi Join**

서브쿼리의 조건을 만족하는 첫 번째 매칭만 확인

```sql
-- EXISTS 서브쿼리 → Semi Join
SELECT * FROM dept d
WHERE EXISTS (SELECT 1 FROM emp e WHERE e.deptno = d.deptno);

-- Semi Join 힌트
SELECT /*+ SEMIJOIN(d e) */ * FROM dept d
WHERE EXISTS (SELECT 1 FROM emp e WHERE e.deptno = d.deptno);
```

**NL Semi Join 유도**

```sql
SELECT * FROM dept d
WHERE EXISTS (SELECT /*+ NL_SJ */ 1 FROM emp e WHERE e.deptno = d.deptno);
```

---

### 36. 서브쿼리문 튜닝 3. 서브쿼리를 해쉬 세미 조인으로 유도하기

**Hash Semi Join**

```sql
-- 대량 데이터 Semi Join에 효과적
SELECT * FROM dept d
WHERE EXISTS (SELECT /*+ HASH_SJ */ 1 FROM emp e WHERE e.deptno = d.deptno);

-- 또는
SELECT /*+ USE_HASH(d e) */ * FROM dept d
WHERE EXISTS (SELECT 1 FROM emp e WHERE e.deptno = d.deptno);
```

---

### 37. 서브쿼리문 튜닝 4. NOT IN 연산자를 사용하는 서브쿼리의 튜닝방법

**NOT IN 주의사항**

```sql
-- NOT IN은 NULL 값이 있으면 결과가 공집합
SELECT * FROM dept
WHERE deptno NOT IN (SELECT deptno FROM emp);
-- emp.deptno에 NULL이 있으면 결과 없음

-- ✅ NULL 안전한 대안
SELECT * FROM dept
WHERE deptno NOT IN (SELECT deptno FROM emp WHERE deptno IS NOT NULL);
```

**Anti Join 유도**

```sql
-- Hash Anti Join
SELECT * FROM dept d
WHERE NOT EXISTS (SELECT /*+ HASH_AJ */ 1 FROM emp e WHERE e.deptno = d.deptno);

-- NL Anti Join
SELECT * FROM dept d
WHERE NOT EXISTS (SELECT /*+ NL_AJ */ 1 FROM emp e WHERE e.deptno = d.deptno);
```

---

### 38. 서브쿼리문 튜닝 5. IN 연산자를 EXISTS로 변경하여 성능 최적화하기

**IN vs EXISTS**

```sql
-- IN: 서브쿼리 결과를 모두 구한 후 비교
SELECT * FROM emp
WHERE deptno IN (SELECT deptno FROM dept WHERE loc = 'DALLAS');

-- EXISTS: 매칭되는 첫 행 발견 시 종료
SELECT * FROM emp e
WHERE EXISTS (SELECT 1 FROM dept d WHERE d.deptno = e.deptno AND d.loc = 'DALLAS');
```

**선택 기준**

| 상황 | 권장 방식 |
|-----|---------|
| 서브쿼리 결과가 적을 때 | IN |
| 메인쿼리 결과가 적을 때 | EXISTS |
| 서브쿼리 테이블에 인덱스 있을 때 | EXISTS |
| 서브쿼리에 DISTINCT 필요할 때 | EXISTS |

---

### 39. 서브쿼리문 튜닝 6. NOT IN 대신 NOT EXISTS로 변경하여 성능 최적화하기

**NOT IN → NOT EXISTS 변환**

```sql
-- NOT IN (NULL 문제 있음)
SELECT * FROM dept
WHERE deptno NOT IN (SELECT deptno FROM emp);

-- NOT EXISTS (NULL 안전, 성능 우수)
SELECT * FROM dept d
WHERE NOT EXISTS (SELECT 1 FROM emp e WHERE e.deptno = d.deptno);
```

**LEFT OUTER JOIN 활용**

```sql
-- NOT EXISTS 대안
SELECT d.*
FROM dept d
LEFT OUTER JOIN emp e ON d.deptno = e.deptno
WHERE e.deptno IS NULL;
```

---

### 40. 전체 합계를 빠르게 구하는 튜닝방법

**ROLLUP / CUBE 활용**

```sql
-- 부서별 합계 + 전체 합계
SELECT deptno, SUM(sal)
FROM emp
GROUP BY ROLLUP(deptno);

-- GROUPING SETS 활용
SELECT deptno, job, SUM(sal)
FROM emp
GROUP BY GROUPING SETS ((deptno, job), (deptno), ());
```

**분석 함수 활용**

```sql
-- 행별 상세 + 전체 합계
SELECT empno, ename, sal,
       SUM(sal) OVER() AS total_sal
FROM emp;
```

---

### 41. UNION ALL을 사용한 SQL문의 튜닝방법

**UNION vs UNION ALL**

```sql
-- UNION: 중복 제거 (정렬 발생)
SELECT deptno FROM emp WHERE job = 'CLERK'
UNION
SELECT deptno FROM emp WHERE job = 'MANAGER';

-- UNION ALL: 중복 허용 (정렬 없음, 더 빠름)
SELECT deptno FROM emp WHERE job = 'CLERK'
UNION ALL
SELECT deptno FROM emp WHERE job = 'MANAGER';
```

**UNION ALL 최적화**

```sql
-- 인덱스 활용 극대화
SELECT /*+ INDEX(emp emp_job_idx) */ deptno FROM emp WHERE job = 'CLERK'
UNION ALL
SELECT /*+ INDEX(emp emp_job_idx) */ deptno FROM emp WHERE job = 'MANAGER';
```

---

### 42. 누적 합계를 빠르게 구하는 튜닝방법

**분석 함수 활용**

```sql
-- 누적 합계
SELECT empno, ename, sal,
       SUM(sal) OVER(ORDER BY empno ROWS UNBOUNDED PRECEDING) AS running_total
FROM emp;

-- 부서별 누적 합계
SELECT empno, ename, deptno, sal,
       SUM(sal) OVER(PARTITION BY deptno ORDER BY empno) AS dept_running_total
FROM emp;
```

**Self Join 대비 성능**

```sql
-- ❌ 비효율적: Self Join
SELECT e1.empno, e1.sal, SUM(e2.sal)
FROM emp e1, emp e2
WHERE e2.empno <= e1.empno
GROUP BY e1.empno, e1.sal;

-- ✅ 효율적: 분석 함수
SELECT empno, sal,
       SUM(sal) OVER(ORDER BY empno) AS running_total
FROM emp;
```

---

### 43. 이전행 값과 다음행 값을 비교하는 SQL 튜닝방법

**LAG / LEAD 함수**

```sql
-- 이전 행 값 조회
SELECT empno, sal,
       LAG(sal) OVER(ORDER BY empno) AS prev_sal,
       sal - LAG(sal) OVER(ORDER BY empno) AS sal_diff
FROM emp;

-- 다음 행 값 조회
SELECT empno, sal,
       LEAD(sal) OVER(ORDER BY empno) AS next_sal
FROM emp;

-- N번째 이전/다음 행
SELECT empno, sal,
       LAG(sal, 2) OVER(ORDER BY empno) AS prev_2_sal,  -- 2행 이전
       LEAD(sal, 3, 0) OVER(ORDER BY empno) AS next_3_sal  -- 3행 다음, 기본값 0
FROM emp;
```

---

### 44. MERGE 문이 UPDATE 문보다 빠른 이유

**MERGE 문 구조**

```sql
MERGE INTO target_table t
USING source_table s
ON (t.id = s.id)
WHEN MATCHED THEN
    UPDATE SET t.col1 = s.col1, t.col2 = s.col2
WHEN NOT MATCHED THEN
    INSERT (id, col1, col2) VALUES (s.id, s.col1, s.col2);
```

**MERGE vs UPDATE + INSERT**

| 특성 | MERGE | UPDATE + INSERT |
|-----|-------|-----------------|
| 테이블 스캔 | 1회 | 2회 |
| 조인 연산 | 1회 | 2회 |
| 트랜잭션 | 1개 | 2개 |
| 성능 | 빠름 | 느림 |

**MERGE 최적화**

```sql
-- 병렬 처리
MERGE /*+ PARALLEL(t 4) */ INTO target_table t
USING source_table s
ON (t.id = s.id)
...

-- UPDATE ONLY
MERGE INTO target_table t
USING source_table s
ON (t.id = s.id)
WHEN MATCHED THEN
    UPDATE SET t.col1 = s.col1
    DELETE WHERE t.status = 'D';  -- 조건부 삭제도 가능
```

---

### 45. 중간 데이터 검색을 빠르게 하는 SQL 튜닝 방법

**OFFSET-FETCH (12c 이상)**

```sql
-- 11~20번째 행 조회
SELECT empno, ename, sal
FROM emp
ORDER BY sal DESC
OFFSET 10 ROWS FETCH NEXT 10 ROWS ONLY;
```

**ROWNUM 활용 (11g 이하)**

```sql
-- 11~20번째 행 조회 (최적화된 방식)
SELECT *
FROM (
    SELECT /*+ INDEX_DESC(emp sal_idx) */ 
           empno, ename, sal, ROWNUM AS rn
    FROM emp
    WHERE ROWNUM <= 20
)
WHERE rn > 10;
```

**ROW_NUMBER() 활용**

```sql
SELECT *
FROM (
    SELECT empno, ename, sal,
           ROW_NUMBER() OVER(ORDER BY sal DESC) AS rn
    FROM emp
)
WHERE rn BETWEEN 11 AND 20;
```

**Top-N 쿼리 최적화 원리**

1. 인덱스 정렬 순서와 ORDER BY 일치
2. 필요한 행 수만큼만 스캔 후 종료 (STOPKEY)
3. 불필요한 전체 정렬 회피

---

## 부록: TMS 활용 가이드

### TMS 자동 튜닝 권고 체계

**성능 등급 분류**

| 등급 | 기준 | 권고 수준 |
|-----|------|---------|
| A | Buffer Gets < 100, Elapsed < 0.1초 | 양호 |
| B | Buffer Gets < 1,000, Elapsed < 1초 | 모니터링 필요 |
| C | Buffer Gets < 10,000, Elapsed < 5초 | 튜닝 권고 |
| D | Buffer Gets < 100,000, Elapsed < 30초 | 튜닝 필수 |
| F | Buffer Gets >= 100,000, Elapsed >= 30초 | 긴급 조치 |

### TMS 분석 항목

**1. 실행계획 분석**
- Full Table Scan 감지
- 인덱스 미사용 감지
- 비효율적 조인 방식 감지

**2. SQL 패턴 분석**
- 인덱스 컬럼 가공
- 암시적 형변환
- 카티시안 곱 발생

**3. 통계 정보 분석**
- E-Rows vs A-Rows 편차
- 오래된 통계 정보
- 히스토그램 필요성

### TMS 힌트 자동 생성

TMS는 분석 결과를 바탕으로 최적의 힌트를 자동 생성합니다:

```sql
-- TMS 생성 힌트 예시
SELECT /*+ 
    LEADING(d e)           -- 조인 순서
    USE_NL(e)              -- 조인 방식
    INDEX(e emp_deptno_idx) -- 인덱스 선택
    NO_MERGE               -- 뷰 머징 방지
*/ ...
```

### TMS 모니터링 대시보드 지표

**실시간 모니터링 항목**
- Active Session History (ASH)
- Top SQL by Elapsed Time
- Top SQL by Buffer Gets
- Wait Events

**튜닝 효과 측정**
- Before/After 성능 비교
- 개선율 자동 계산
- 튜닝 이력 관리

---

## 📚 참고 자료

- Oracle Database SQL Tuning Guide
- 친절한 SQL 튜닝 (조시형 저)
- SQL 튜닝 45가지 예제 (https://s-personal-organization-15.gitbook.io/sql-45)

---

**문서 작성**: TMS v2.0 AI 기반 튜닝 권고 시스템  
**Copyright**: © 2025 Narae Information Technology (naraeit.co.kr)
