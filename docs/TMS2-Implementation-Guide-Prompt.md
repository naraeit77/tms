# TMS 2.0 Oracle Database Tuning Management System
## 구축 가이드 프롬프트 v1.0

---

## 📋 프로젝트 개요

TMS 2.0은 Oracle Database 성능 모니터링 및 SQL 튜닝 자동화 플랫폼입니다.
- **목표**: Enterprise Manager 수준의 모니터링을 Standard Edition에서 구현
- **핵심 기능**: Custom ASH, SQL 등급화, 군집분석, 실시간 대시보드
- **기술 스택**: React + Recharts + Oracle PL/SQL + Redis (선택)

---

## 🏗️ 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         TMS 2.0 Architecture                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      Oracle Database (SE/SE2/EE)                 │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │    │
│  │  │  V$SESSION  │  │  V$SYSSTAT  │  │  V$SYSTEM_WAIT_CLASS    │  │    │
│  │  │  V$SQL      │  │  V$SQLAREA  │  │  V$WAITCLASSMETRIC      │  │    │
│  │  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │    │
│  │         │                │                      │                │    │
│  │         ▼                ▼                      ▼                │    │
│  │  ┌─────────────────────────────────────────────────────────────┐│    │
│  │  │              TMS Custom ASH Tables                          ││    │
│  │  │  • TMS_ASH_SAMPLES (1초 샘플링)                              ││    │
│  │  │  • TMS_SYSMETRIC_HISTORY (1분 메트릭)                        ││    │
│  │  │  • TMS_WAITCLASS_HISTORY (Wait Class 집계)                  ││    │
│  │  │  • TMS_SQL_STATS (SQL 통계 및 등급)                          ││    │
│  │  └─────────────────────────────────────────────────────────────┘│    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                    │                                     │
│                                    │ JDBC / REST API                     │
│                                    ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     TMS 2.0 Application Server                   │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │    │
│  │  │ Data Collector│  │ SQL Analyzer │  │ Grade Calculator    │  │    │
│  │  │ (Scheduler)   │  │ (Clustering) │  │ (A~F Scoring)       │  │    │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                    │                                     │
│                                    │ WebSocket / REST                    │
│                                    ▼                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     TMS 2.0 Dashboard (React)                    │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │    │
│  │  │ Overview │ │Performance│ │ Storage │ │ SQL Analysis     │   │    │
│  │  │   Tab    │ │   Tab    │ │   Tab   │ │ (Cluster/Grade)  │   │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 1. Custom ASH 구현 (Oracle Standard Edition 호환)

### 1.1 핵심 개념

Oracle Standard Edition에서는 V$ACTIVE_SESSION_HISTORY (ASH)를 사용할 수 없습니다.
TMS 2.0은 V$SESSION을 주기적으로 샘플링하여 동등한 기능을 구현합니다.

```
┌────────────────────────────────────────────────────────────┐
│                Custom ASH vs Oracle ASH                     │
├────────────────────────────────────────────────────────────┤
│  Oracle Enterprise Edition    │  TMS 2.0 Custom ASH        │
│  ─────────────────────────────┼───────────────────────────  │
│  V$ACTIVE_SESSION_HISTORY     │  TMS_ASH_SAMPLES           │
│  (Diagnostics Pack 필요)       │  (라이선스 불필요)          │
│  SGA 메모리 버퍼              │  테이블 저장 (파티션)       │
│  자동 1초 샘플링              │  DBMS_SCHEDULER 1초        │
│  AWR 연동                     │  자체 히스토리 관리         │
└────────────────────────────────────────────────────────────┘
```

### 1.2 테이블 스키마

```sql
-- ============================================
-- TMS_ASH_SAMPLES: 세션 샘플링 테이블
-- ============================================
CREATE TABLE tms_ash_samples (
    sample_id           NUMBER GENERATED ALWAYS AS IDENTITY,
    sample_time         TIMESTAMP(3) DEFAULT SYSTIMESTAMP NOT NULL,
    instance_number     NUMBER DEFAULT 1,
    
    -- Session Info
    sid                 NUMBER NOT NULL,
    serial#             NUMBER,
    user#               NUMBER,
    username            VARCHAR2(128),
    
    -- Program Info  
    machine             VARCHAR2(64),
    program             VARCHAR2(64),
    module              VARCHAR2(64),
    action              VARCHAR2(64),
    
    -- SQL Info
    sql_id              VARCHAR2(13),
    sql_child_number    NUMBER,
    sql_plan_hash_value NUMBER,
    
    -- Wait Info
    event               VARCHAR2(64),
    wait_class          VARCHAR2(64),
    wait_class_id       NUMBER,
    wait_time           NUMBER,
    seconds_in_wait     NUMBER,
    state               VARCHAR2(19),
    
    -- Blocking Info
    blocking_session    NUMBER,
    blocking_session_status VARCHAR2(10),
    
    -- Session State
    session_state       VARCHAR2(7),   -- 'ON CPU' or 'WAITING'
    
    CONSTRAINT pk_tms_ash_samples PRIMARY KEY (sample_id)
)
PARTITION BY RANGE (sample_time)
INTERVAL (NUMTODSINTERVAL(1, 'DAY'))
(
    PARTITION p_initial VALUES LESS THAN (TIMESTAMP '2024-01-01 00:00:00')
)
TABLESPACE tms_data
COMPRESS FOR OLTP;

-- 인덱스
CREATE INDEX idx_tms_ash_time ON tms_ash_samples(sample_time) LOCAL COMPRESS;
CREATE INDEX idx_tms_ash_sqlid ON tms_ash_samples(sql_id, sample_time) LOCAL COMPRESS;
CREATE INDEX idx_tms_ash_wait ON tms_ash_samples(wait_class, sample_time) LOCAL COMPRESS;
CREATE INDEX idx_tms_ash_blocking ON tms_ash_samples(blocking_session) LOCAL COMPRESS;
```

### 1.3 샘플링 프로시저

```sql
-- ============================================
-- ASH 샘플링 프로시저 (1초 간격 실행)
-- ============================================
CREATE OR REPLACE PROCEDURE tms_sample_ash AS
    v_sample_time TIMESTAMP(3) := SYSTIMESTAMP;
BEGIN
    INSERT /*+ APPEND */ INTO tms_ash_samples (
        sample_time, sid, serial#, user#, username,
        machine, program, module, action,
        sql_id, sql_child_number, sql_plan_hash_value,
        event, wait_class, wait_class_id,
        wait_time, seconds_in_wait, state,
        blocking_session, blocking_session_status,
        session_state
    )
    SELECT 
        v_sample_time,
        s.sid, s.serial#, s.user#, s.username,
        SUBSTR(s.machine, 1, 64),
        SUBSTR(s.program, 1, 64),
        SUBSTR(s.module, 1, 64),
        SUBSTR(s.action, 1, 64),
        s.sql_id, s.sql_child_number,
        (SELECT sql_plan_hash_value FROM v$sql sq 
         WHERE sq.sql_id = s.sql_id AND sq.child_number = s.sql_child_number AND ROWNUM = 1),
        s.event, s.wait_class, s.wait_class#,
        s.wait_time_micro, s.seconds_in_wait, s.state,
        s.blocking_session, s.blocking_session_status,
        CASE WHEN s.wait_class = 'Idle' OR s.state = 'WAITED KNOWN TIME' 
             THEN 'ON CPU' ELSE 'WAITING' END
    FROM v$session s
    WHERE s.status = 'ACTIVE'
      AND s.wait_class != 'Idle'
      AND s.type = 'USER'
      AND s.username IS NOT NULL;
    
    COMMIT;
EXCEPTION
    WHEN OTHERS THEN
        ROLLBACK;
END tms_sample_ash;
/

-- 스케줄러 잡 (1초 간격)
BEGIN
    DBMS_SCHEDULER.CREATE_JOB(
        job_name        => 'TMS_ASH_SAMPLER',
        job_type        => 'STORED_PROCEDURE',
        job_action      => 'TMS_SAMPLE_ASH',
        start_date      => SYSTIMESTAMP,
        repeat_interval => 'FREQ=SECONDLY;INTERVAL=1',
        enabled         => TRUE,
        comments        => 'TMS Custom ASH Sampler'
    );
END;
/
```

### 1.4 분석 뷰

```sql
-- 시간대별 ASH 요약
CREATE OR REPLACE VIEW tms_ash_summary AS
SELECT 
    TO_CHAR(sample_time, 'YYYY-MM-DD HH24:MI') AS time_slot,
    wait_class,
    COUNT(*) AS sample_count,
    ROUND(COUNT(*) / 60.0, 3) AS avg_active_sessions,
    COUNT(DISTINCT sid) AS unique_sessions,
    COUNT(DISTINCT sql_id) AS unique_sqls
FROM tms_ash_samples
WHERE sample_time > SYSTIMESTAMP - INTERVAL '1' HOUR
GROUP BY TO_CHAR(sample_time, 'YYYY-MM-DD HH24:MI'), wait_class;

-- Top SQL by DB Time
CREATE OR REPLACE VIEW tms_top_sql AS
SELECT 
    sql_id,
    COUNT(*) AS samples,
    COUNT(*) AS db_time_sec,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS pct_db_time,
    COUNT(DISTINCT sid) AS sessions,
    MAX(username) AS username,
    MAX(module) AS module,
    MAX(wait_class) AS primary_wait_class
FROM tms_ash_samples
WHERE sample_time > SYSTIMESTAMP - INTERVAL '1' HOUR
  AND sql_id IS NOT NULL
GROUP BY sql_id
ORDER BY samples DESC;

-- Blocking Session 분석
CREATE OR REPLACE VIEW tms_blocking_sessions AS
SELECT 
    blocking_session AS blocker_sid,
    COUNT(DISTINCT sid) AS blocked_count,
    SUM(seconds_in_wait) AS total_wait_sec,
    LISTAGG(DISTINCT username, ', ') WITHIN GROUP (ORDER BY username) AS blocked_users
FROM tms_ash_samples
WHERE sample_time > SYSTIMESTAMP - INTERVAL '5' MINUTE
  AND blocking_session IS NOT NULL
GROUP BY blocking_session
ORDER BY blocked_count DESC;
```

---

## 🎯 2. SQL 등급 시스템 (A ~ F)

### 2.1 등급 정의

```
┌──────┬────────────┬──────────────┬─────────────────────────────────────────┐
│ 등급 │   레벨     │     색상     │                 기준                     │
├──────┼────────────┼──────────────┼─────────────────────────────────────────┤
│  A   │ Excellent  │ #10b981 녹색 │ Elapsed/Exec < 0.01s, Buffer/Exec < 100 │
│  B   │ Good       │ #22d3ee 청록 │ Elapsed/Exec < 0.1s, Buffer/Exec < 1K   │
│  C   │ Average    │ #3b82f6 파랑 │ Elapsed/Exec < 1s, Buffer/Exec < 10K    │
│  D   │ Warning    │ #f59e0b 노랑 │ Elapsed/Exec < 5s, Buffer/Exec < 50K    │
│  E   │ Poor       │ #f97316 주황 │ Elapsed/Exec < 30s, Buffer/Exec < 500K  │
│  F   │ Critical   │ #ef4444 빨강 │ Elapsed/Exec >= 30s or Buffer >= 500K  │
└──────┴────────────┴──────────────┴─────────────────────────────────────────┘
```

### 2.2 등급 산정 알고리즘

```javascript
// ============================================
// SQL Grade Calculation Algorithm
// ============================================
const calculateSQLGrade = (sql) => {
  const elapsedPerExec = sql.elapsedSec / Math.max(sql.executions, 1);
  const bufferPerExec = sql.bufferGets / Math.max(sql.executions, 1);
  const cpuRatio = sql.cpuSec / Math.max(sql.elapsedSec, 0.001);
  
  // 100점 만점 스코어링 시스템
  let score = 100;
  
  // 1. Elapsed Time 감점 (최대 -50점)
  if (elapsedPerExec >= 30) score -= 50;
  else if (elapsedPerExec >= 5) score -= 35;
  else if (elapsedPerExec >= 1) score -= 25;
  else if (elapsedPerExec >= 0.1) score -= 15;
  else if (elapsedPerExec >= 0.01) score -= 5;
  
  // 2. Buffer Gets 감점 (최대 -30점)
  if (bufferPerExec >= 500000) score -= 30;
  else if (bufferPerExec >= 50000) score -= 20;
  else if (bufferPerExec >= 10000) score -= 15;
  else if (bufferPerExec >= 1000) score -= 10;
  else if (bufferPerExec >= 100) score -= 5;
  
  // 3. Disk Read 비율 감점 (최대 -10점)
  const diskRatio = sql.diskReads / Math.max(sql.bufferGets, 1);
  if (diskRatio > 0.1) score -= 10;
  else if (diskRatio > 0.05) score -= 5;
  
  // 4. CPU 효율 보너스 (최대 +5점)
  if (cpuRatio > 0.8) score += 5;
  
  // 등급 결정
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  if (score >= 20) return 'E';
  return 'F';
};
```

### 2.3 PL/SQL 등급 함수

```sql
-- ============================================
-- SQL 등급 계산 함수 (Oracle PL/SQL)
-- ============================================
CREATE OR REPLACE FUNCTION tms_calculate_sql_grade(
    p_elapsed_sec    NUMBER,
    p_executions     NUMBER,
    p_buffer_gets    NUMBER,
    p_disk_reads     NUMBER,
    p_cpu_sec        NUMBER
) RETURN CHAR AS
    v_elapsed_per_exec  NUMBER;
    v_buffer_per_exec   NUMBER;
    v_disk_ratio        NUMBER;
    v_cpu_ratio         NUMBER;
    v_score             NUMBER := 100;
BEGIN
    -- 실행당 메트릭 계산
    v_elapsed_per_exec := p_elapsed_sec / GREATEST(p_executions, 1);
    v_buffer_per_exec := p_buffer_gets / GREATEST(p_executions, 1);
    v_disk_ratio := p_disk_reads / GREATEST(p_buffer_gets, 1);
    v_cpu_ratio := p_cpu_sec / GREATEST(p_elapsed_sec, 0.001);
    
    -- Elapsed Time 감점
    IF v_elapsed_per_exec >= 30 THEN v_score := v_score - 50;
    ELSIF v_elapsed_per_exec >= 5 THEN v_score := v_score - 35;
    ELSIF v_elapsed_per_exec >= 1 THEN v_score := v_score - 25;
    ELSIF v_elapsed_per_exec >= 0.1 THEN v_score := v_score - 15;
    ELSIF v_elapsed_per_exec >= 0.01 THEN v_score := v_score - 5;
    END IF;
    
    -- Buffer Gets 감점
    IF v_buffer_per_exec >= 500000 THEN v_score := v_score - 30;
    ELSIF v_buffer_per_exec >= 50000 THEN v_score := v_score - 20;
    ELSIF v_buffer_per_exec >= 10000 THEN v_score := v_score - 15;
    ELSIF v_buffer_per_exec >= 1000 THEN v_score := v_score - 10;
    ELSIF v_buffer_per_exec >= 100 THEN v_score := v_score - 5;
    END IF;
    
    -- Disk Read 감점
    IF v_disk_ratio > 0.1 THEN v_score := v_score - 10;
    ELSIF v_disk_ratio > 0.05 THEN v_score := v_score - 5;
    END IF;
    
    -- CPU 효율 보너스
    IF v_cpu_ratio > 0.8 THEN v_score := v_score + 5;
    END IF;
    
    -- 등급 반환
    IF v_score >= 90 THEN RETURN 'A';
    ELSIF v_score >= 75 THEN RETURN 'B';
    ELSIF v_score >= 60 THEN RETURN 'C';
    ELSIF v_score >= 40 THEN RETURN 'D';
    ELSIF v_score >= 20 THEN RETURN 'E';
    ELSE RETURN 'F';
    END IF;
END tms_calculate_sql_grade;
/
```

---

## 📈 3. SQL 군집분포도 (Cluster Distribution Chart)

### 3.1 차트 개념

```
        SQL Cluster Distribution (Scatter Plot)
        
        Y축: Buffer Gets / Execution (log scale)
        ↑
        │
    10M │                                    ● F등급
        │                              ●●   (Critical)
     1M │                        ●●●●
        │                  ●●●●●●      E등급
   100K │            ●●●●●●●           (Poor)
        │      ●●●●●●●●●        D등급
    10K │  ●●●●●●●●             (Warning)
        │●●●●●●●●         C등급
     1K │●●●●●            (Average)
        │●●●       B등급 (Good)
    100 │●    A등급 (Excellent)
        │
        └──────────────────────────────────────→ X축
          0.01ms  0.1ms  1ms  10ms  100ms  1s  10s  30s
                  Elapsed Time / Execution (log scale)
        
        ● 버블 크기 = Execution 횟수
```

### 3.2 React 컴포넌트 구현

```jsx
// SQL Cluster Scatter Chart Component
const SQLClusterChart = ({ data, onSQLClick }) => {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 60 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis 
          type="number" 
          dataKey="x"  // log10(elapsed_per_exec * 1000)
          name="Elapsed/Exec" 
          label={{ value: 'Elapsed Time/Exec (ms, log scale)', position: 'bottom' }}
          tickFormatter={(v) => `${Math.pow(10, v).toFixed(0)}ms`}
        />
        <YAxis 
          type="number" 
          dataKey="y"  // log10(buffer_per_exec)
          name="Buffer/Exec" 
          label={{ value: 'Buffer Gets/Exec (log scale)', angle: -90, position: 'insideLeft' }}
          tickFormatter={(v) => `${Math.pow(10, v).toFixed(0)}`}
        />
        <ZAxis type="number" dataKey="z" range={[50, 400]} />  {/* Execution count */}
        <Tooltip content={<SQLTooltip />} />
        
        {/* 등급별 Scatter */}
        {['A', 'B', 'C', 'D', 'E', 'F'].map(grade => (
          <Scatter 
            key={grade}
            name={`Grade ${grade}`}
            data={data.filter(sql => sql.grade === grade)}
            fill={SQL_GRADES[grade].color}
            onClick={onSQLClick}
            cursor="pointer"
          />
        ))}
        <Legend />
      </ScatterChart>
    </ResponsiveContainer>
  );
};
```

### 3.3 데이터 변환

```javascript
// SQL 데이터를 차트용으로 변환
const transformSQLForChart = (sqlData) => {
  return sqlData.map(sql => {
    const elapsedPerExec = sql.elapsedSec / Math.max(sql.executions, 1);
    const bufferPerExec = sql.bufferGets / Math.max(sql.executions, 1);
    
    return {
      ...sql,
      grade: calculateSQLGrade(sql),
      elapsedPerExec,
      bufferPerExec,
      // Log scale for chart positioning
      x: Math.log10(Math.max(elapsedPerExec, 0.0001) * 1000), // ms log scale
      y: Math.log10(Math.max(bufferPerExec, 1)),              // buffer log scale
      z: Math.log10(Math.max(sql.executions, 1)) * 100,       // bubble size
    };
  });
};
```

---

## 🖱️ 4. 차트 드래그 선택 기능

### 4.1 드래그 선택 구현

```jsx
// ============================================
// Draggable ASH Chart with SQL Drill-down
// ============================================
const DraggableASHChart = ({ data, onRangeSelect }) => {
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const [selection, setSelection] = useState(null);
  
  // 차트 패딩 (Recharts 기본값)
  const CHART_PADDING = { left: 60, right: 20, top: 20, bottom: 30 };
  
  // X 좌표를 데이터 인덱스로 변환
  const getDataIndexFromX = (x, containerWidth) => {
    const chartWidth = containerWidth - CHART_PADDING.left - CHART_PADDING.right;
    const relativeX = x - CHART_PADDING.left;
    const index = Math.round((relativeX / chartWidth) * (data.length - 1));
    return Math.max(0, Math.min(data.length - 1, index));
  };
  
  const handleMouseDown = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    if (x >= CHART_PADDING.left && x <= rect.width - CHART_PADDING.right) {
      setIsDragging(true);
      setDragStart(x);
      setDragEnd(x);
      setSelection(null);
    }
  };
  
  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(CHART_PADDING.left, 
              Math.min(rect.width - CHART_PADDING.right, e.clientX - rect.left));
    setDragEnd(x);
  };
  
  const handleMouseUp = () => {
    if (isDragging && Math.abs(dragEnd - dragStart) > 10) {
      const rect = containerRef.current.getBoundingClientRect();
      const startIdx = getDataIndexFromX(Math.min(dragStart, dragEnd), rect.width);
      const endIdx = getDataIndexFromX(Math.max(dragStart, dragEnd), rect.width);
      
      if (data[startIdx] && data[endIdx]) {
        setSelection({ startX: Math.min(dragStart, dragEnd), endX: Math.max(dragStart, dragEnd) });
        onRangeSelect(data[startIdx].timestamp, data[endIdx].timestamp);
      }
    }
    setIsDragging(false);
  };
  
  // 선택 영역 오버레이 스타일
  const overlayStyle = isDragging && dragStart && dragEnd ? {
    left: Math.min(dragStart, dragEnd),
    width: Math.abs(dragEnd - dragStart),
    top: CHART_PADDING.top,
    bottom: CHART_PADDING.bottom,
    backgroundColor: 'rgba(249, 115, 22, 0.3)',
    borderLeft: '2px solid #f97316',
    borderRight: '2px solid #f97316',
  } : selection ? {
    left: selection.startX,
    width: selection.endX - selection.startX,
    // ... same styles
  } : { opacity: 0 };

  return (
    <div 
      ref={containerRef}
      className="relative select-none"
      style={{ cursor: 'crosshair' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => isDragging && setIsDragging(false)}
    >
      {/* Selection Overlay */}
      <div className="absolute pointer-events-none z-10" style={overlayStyle} />
      
      {/* Recharts AreaChart */}
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data}>
          {/* ... chart configuration */}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
```

### 4.2 시간 범위 SQL 조회

```sql
-- 선택된 시간 범위의 SQL 조회
SELECT 
    sql_id,
    COUNT(*) AS samples,
    COUNT(DISTINCT sid) AS sessions,
    MAX(module) AS module,
    MAX(wait_class) AS wait_class,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) AS pct_activity
FROM tms_ash_samples
WHERE sample_time BETWEEN :start_time AND :end_time
  AND sql_id IS NOT NULL
GROUP BY sql_id
ORDER BY samples DESC
FETCH FIRST 20 ROWS ONLY;
```

---

## 🎨 5. 대시보드 UI 구조

### 5.1 탭 구성

```
┌─────────────────────────────────────────────────────────────────────────┐
│  TMS 2.0 Oracle Dashboard                           Instance: TMSDB_PROD │
├─────────────────────────────────────────────────────────────────────────┤
│  [Overview] [Performance] [Storage] [SQL]                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─ Overview Tab ─────────────────────────────────────────────────────┐ │
│  │  • Quick Stats (Active Sessions, Commits, Executions, etc.)        │ │
│  │  • ASH Chart (Draggable)                                           │ │
│  │  • Wait Time Distribution                                          │ │
│  │  • CPU/Memory Gauges                                               │ │
│  │  • I/O Statistics                                                  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ Performance Tab ──────────────────────────────────────────────────┐ │
│  │  • ASH Chart (30min, Draggable)                                    │ │
│  │  • Wait Events Pie Chart                                           │ │
│  │  • Performance Gauges                                              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ Storage Tab ──────────────────────────────────────────────────────┐ │
│  │  • Tablespace Usage Bars                                           │ │
│  │  • Resource Limits Table                                           │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ SQL Tab ──────────────────────────────────────────────────────────┐ │
│  │  • Grade Summary Cards (A~F)                                       │ │
│  │  • SQL Cluster Scatter Chart                                       │ │
│  │  • SQL List Table (with Grade)                                     │ │
│  │  • Grade Criteria Info                                             │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 컴포넌트 구조

```jsx
// ============================================
// Main Dashboard Component Structure
// ============================================
export default function TMS2Dashboard() {
  // State
  const [instance, setInstance] = useState('TMSDB_PROD');
  const [tab, setTab] = useState('overview');
  const [ashData, setASHData] = useState([]);
  const [sqlClusterData, setSqlClusterData] = useState([]);
  const [selectedGradeFilter, setSelectedGradeFilter] = useState('ALL');
  
  // Modal States
  const [sqlModalOpen, setSqlModalOpen] = useState(false);
  const [selectedRange, setSelectedRange] = useState({ start: null, end: null });
  
  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      {/* Header */}
      <Header instance={instance} onInstanceChange={setInstance} />
      
      {/* Tab Navigation */}
      <TabNavigation activeTab={tab} onTabChange={setTab} />
      
      {/* Alerts */}
      <BlockingSessionAlert />
      
      {/* Tab Content */}
      {tab === 'overview' && <OverviewTab ashData={ashData} onRangeSelect={...} />}
      {tab === 'performance' && <PerformanceTab ashData={ashData} />}
      {tab === 'storage' && <StorageTab />}
      {tab === 'sql' && (
        <SQLTab 
          sqlData={sqlClusterData}
          gradeFilter={selectedGradeFilter}
          onGradeFilterChange={setSelectedGradeFilter}
        />
      )}
      
      {/* Modals */}
      <SQLDetailModal isOpen={sqlModalOpen} ... />
    </div>
  );
}
```

---

## 🔌 6. 데이터 연동 가이드

### 6.1 REST API 엔드포인트

```javascript
// ============================================
// TMS 2.0 API Endpoints
// ============================================

// ASH 데이터 조회
GET /api/ash/samples?minutes=60
Response: {
  data: [
    { time: "14:30", timestamp: 1703234400000, CPU: 2.5, "User I/O": 1.8, ... },
    ...
  ]
}

// SQL 등급 데이터 조회
GET /api/sql/grades?filter=ALL
Response: {
  data: [
    { sqlId: "abc123", grade: "A", executions: 12500, elapsedSec: 45.2, ... },
    ...
  ],
  summary: { A: 15, B: 12, C: 10, D: 8, E: 5, F: 3 }
}

// 시간 범위 SQL 조회 (드래그 선택)
GET /api/ash/sql-by-range?start=1703234400000&end=1703235000000
Response: {
  range: { start: "14:30:00", end: "14:40:00", durationSec: 600 },
  data: [
    { sqlId: "abc123", samples: 45, executions: 1200, ... },
    ...
  ]
}

// 시스템 메트릭
GET /api/metrics/system
Response: {
  sessions: { total: 180, active: 25, blocked: 0 },
  cpu: { host: 45.2, db: 32.1 },
  memory: { sgaUsed: 4.5, sgaMax: 6, bufferHit: 98.5 },
  io: { readIOPS: 450, writeIOPS: 120, ... }
}
```

### 6.2 WebSocket 실시간 업데이트

```javascript
// ============================================
// WebSocket Connection for Real-time Updates
// ============================================
const useRealtimeMetrics = () => {
  const [metrics, setMetrics] = useState(null);
  
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080/ws/metrics');
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMetrics(data);
    };
    
    return () => ws.close();
  }, []);
  
  return metrics;
};
```

### 6.3 Oracle 연동 쿼리

```sql
-- ============================================
-- Dashboard용 메트릭 조회 쿼리
-- ============================================

-- 1. ASH 차트 데이터 (최근 1시간)
SELECT 
    TO_CHAR(sample_time, 'HH24:MI') AS time_slot,
    wait_class,
    ROUND(COUNT(*) / 60.0, 3) AS avg_active_sessions
FROM tms_ash_samples
WHERE sample_time > SYSTIMESTAMP - INTERVAL '1' HOUR
GROUP BY TO_CHAR(sample_time, 'HH24:MI'), wait_class
ORDER BY time_slot, wait_class;

-- 2. SQL 등급별 집계
SELECT 
    tms_calculate_sql_grade(
        elapsed_time/1000000, 
        executions, 
        buffer_gets, 
        disk_reads, 
        cpu_time/1000000
    ) AS grade,
    COUNT(*) AS sql_count,
    SUM(executions) AS total_executions,
    SUM(elapsed_time)/1000000 AS total_elapsed_sec
FROM v$sql
WHERE executions > 0
  AND parsing_schema_name NOT IN ('SYS', 'SYSTEM')
GROUP BY tms_calculate_sql_grade(
    elapsed_time/1000000, 
    executions, 
    buffer_gets, 
    disk_reads, 
    cpu_time/1000000
)
ORDER BY 
    CASE grade WHEN 'F' THEN 1 WHEN 'E' THEN 2 WHEN 'D' THEN 3 
               WHEN 'C' THEN 4 WHEN 'B' THEN 5 WHEN 'A' THEN 6 END;

-- 3. SQL 군집 데이터
SELECT 
    sql_id,
    executions,
    elapsed_time/1000000 AS elapsed_sec,
    cpu_time/1000000 AS cpu_sec,
    buffer_gets,
    disk_reads,
    rows_processed,
    module,
    tms_calculate_sql_grade(
        elapsed_time/1000000, 
        executions, 
        buffer_gets, 
        disk_reads, 
        cpu_time/1000000
    ) AS grade,
    -- 차트용 계산값
    LOG(10, GREATEST((elapsed_time/1000000)/GREATEST(executions,1)*1000, 0.0001)) AS x,
    LOG(10, GREATEST(buffer_gets/GREATEST(executions,1), 1)) AS y,
    LOG(10, GREATEST(executions, 1)) * 100 AS z
FROM v$sql
WHERE executions > 0
  AND parsing_schema_name NOT IN ('SYS', 'SYSTEM')
  AND elapsed_time > 0
ORDER BY elapsed_time DESC
FETCH FIRST 100 ROWS ONLY;
```

---

## ⚙️ 7. 설치 및 운영

### 7.1 설치 순서

```bash
# 1. Oracle 스키마 설치
sqlplus tms_owner/password @tms2-custom-ash-schema.sql

# 2. 스케줄러 잡 활성화 확인
SELECT job_name, state, last_start_date, next_run_date 
FROM user_scheduler_jobs WHERE job_name LIKE 'TMS%';

# 3. React 대시보드 빌드
npm install
npm run build

# 4. 애플리케이션 서버 시작
npm start
```

### 7.2 모니터링 확인

```sql
-- ASH 샘플링 상태 확인
SELECT 
    TO_CHAR(MIN(sample_time), 'YYYY-MM-DD HH24:MI:SS') AS oldest,
    TO_CHAR(MAX(sample_time), 'YYYY-MM-DD HH24:MI:SS') AS newest,
    COUNT(*) AS total_samples,
    COUNT(DISTINCT TO_CHAR(sample_time, 'YYYY-MM-DD')) AS days
FROM tms_ash_samples;

-- 등급별 SQL 분포
SELECT grade, COUNT(*) AS cnt
FROM (
    SELECT tms_calculate_sql_grade(...) AS grade
    FROM v$sql WHERE executions > 0
)
GROUP BY grade ORDER BY grade;
```

### 7.3 데이터 정리

```sql
-- 7일 이전 데이터 삭제 (일간 배치)
BEGIN
    DBMS_SCHEDULER.CREATE_JOB(
        job_name        => 'TMS_PURGE_JOB',
        job_type        => 'PLSQL_BLOCK',
        job_action      => 'BEGIN 
            DELETE FROM tms_ash_samples 
            WHERE sample_time < SYSTIMESTAMP - INTERVAL ''7'' DAY;
            COMMIT;
        END;',
        start_date      => TRUNC(SYSTIMESTAMP) + INTERVAL '3' HOUR,
        repeat_interval => 'FREQ=DAILY;BYHOUR=3;BYMINUTE=0',
        enabled         => TRUE
    );
END;
/
```

---

## 📝 8. 요약

### 핵심 구현 포인트

| 기능 | 구현 방법 | 핵심 기술 |
|------|----------|----------|
| Custom ASH | V$SESSION 1초 샘플링 | DBMS_SCHEDULER, 파티션 테이블 |
| SQL 등급 | 100점 스코어링 시스템 | Elapsed/Exec, Buffer/Exec 기반 |
| 군집분포도 | Scatter Chart | Recharts, Log Scale |
| 드래그 선택 | DOM Overlay | React useRef, Mouse Events |
| 실시간 갱신 | 5초 Polling 또는 WebSocket | setInterval, WebSocket |

### 파일 목록

```
TMS 2.0 Project Structure
├── /database
│   ├── tms2-custom-ash-schema.sql      # DB 스키마 및 프로시저
│   └── tms2-grade-function.sql         # SQL 등급 함수
├── /frontend
│   ├── tms2-oracle-dashboard-v4.jsx    # 메인 대시보드
│   └── components/
│       ├── DraggableASHChart.jsx       # 드래그 가능 ASH 차트
│       ├── SQLClusterChart.jsx         # SQL 군집분포도
│       ├── GradeBadge.jsx              # 등급 뱃지
│       └── SQLDetailModal.jsx          # SQL 상세 모달
└── /api
    └── routes/
        ├── ash.js                       # ASH 데이터 API
        ├── sql.js                       # SQL 등급 API
        └── metrics.js                   # 시스템 메트릭 API
```

---

## 🚀 다음 단계 권장사항

1. **LLM 통합**: SQL 튜닝 권장사항 자동 생성 (Kanana, Qwen3 등)
2. **알림 시스템**: Blocked Session, F등급 SQL 발생 시 알림
3. **리포트 생성**: 일간/주간 성능 리포트 자동화
4. **비교 분석**: 시간대별, 기간별 성능 비교
5. **실행계획 분석**: SQL Plan 변경 감지 및 분석

---

*문서 버전: 1.0*
*최종 수정: 2024-12*
*작성: TMS 2.0 Development Team*
