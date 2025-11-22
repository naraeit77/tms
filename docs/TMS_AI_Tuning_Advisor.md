# 🤖 AI-Powered SQL Tuning Advisor
## Oracle 튜닝관리시스템 TMS v2.0 - AI 기능 추가

---

## 1. AI 튜닝 어드바이저 개요

### 1.1 기능 정의
AI 기반 SQL 튜닝 어드바이저는 머신러닝과 규칙 기반 엔진을 결합하여 SQL 성능 문제를 자동으로 분석하고, 최적의 튜닝 방안을 제시하는 지능형 시스템입니다.

### 1.2 핵심 가치
- **자동 진단**: SQL 성능 문제 자동 식별
- **지능형 추천**: 맞춤형 튜닝 방법 제안
- **학습 기반**: 과거 튜닝 이력 학습
- **예측 분석**: 개선율 사전 예측

---

## 2. AI 아키텍처

### 2.1 시스템 구성도

```
┌─────────────────────────────────────────────────────────┐
│                   AI Tuning Advisor                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │   SQL       │  │   Pattern   │  │   ML        │   │
│  │  Analyzer   │──▶│  Matching   │──▶│  Engine     │   │
│  └─────────────┘  └─────────────┘  └─────────────┘   │
│         │                │                 │           │
│         ▼                ▼                 ▼           │
│  ┌─────────────────────────────────────────────┐      │
│  │          Knowledge Base & Rules              │      │
│  └─────────────────────────────────────────────┘      │
│                          │                             │
│                          ▼                             │
│  ┌─────────────────────────────────────────────┐      │
│  │         Recommendation Engine                │      │
│  └─────────────────────────────────────────────┘      │
│                          │                             │
│                          ▼                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │   Tuning    │  │   Impact    │  │   Guide     │   │
│  │   Methods   │  │  Prediction │  │  Generation │   │
│  └─────────────┘  └─────────────┘  └─────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 2.2 AI 컴포넌트

#### SQL Analyzer
- SQL 구문 파싱
- 실행계획 분석
- 성능 메트릭 수집
- 문제 패턴 식별

#### Pattern Matching Engine
- 일반적인 안티패턴 감지
- 유사 SQL 매칭
- 이력 기반 패턴 학습

#### ML Engine
- 성능 예측 모델
- 튜닝 효과 예측
- 이상 탐지

#### Knowledge Base
- 튜닝 규칙 저장소
- Best Practice DB
- 튜닝 이력 저장소

---

## 3. AI 튜닝 분석 기능

### 3.1 자동 문제 진단

#### 진단 항목
```json
{
  "diagnosis": {
    "performance_issues": [
      {
        "type": "FULL_TABLE_SCAN",
        "severity": "CRITICAL",
        "impact": "95% of execution time",
        "table": "ORDERS",
        "rows": 5000000,
        "detection_confidence": 0.98
      },
      {
        "type": "MISSING_INDEX",
        "severity": "HIGH",
        "impact": "Could reduce buffer gets by 80%",
        "columns": ["ORDER_DATE", "CUSTOMER_ID"],
        "detection_confidence": 0.92
      },
      {
        "type": "INEFFICIENT_JOIN",
        "severity": "MEDIUM",
        "impact": "Cartesian product detected",
        "tables": ["ORDERS", "CUSTOMERS"],
        "detection_confidence": 0.85
      }
    ],
    "root_cause": "Missing index on large table causing full scan"
  }
}
```

### 3.2 튜닝 방법 추천

#### AI 추천 시스템
```python
class AITuningRecommender:
    def analyze_sql(self, sql_text, execution_plan, metrics):
        # 1. SQL 패턴 분석
        patterns = self.detect_patterns(sql_text)
        
        # 2. 실행계획 분석
        plan_issues = self.analyze_plan(execution_plan)
        
        # 3. 성능 메트릭 분석
        metric_issues = self.analyze_metrics(metrics)
        
        # 4. 종합 추천 생성
        recommendations = self.generate_recommendations(
            patterns, plan_issues, metric_issues
        )
        
        # 5. 우선순위 정렬
        return self.prioritize_recommendations(recommendations)
```

### 3.3 예상 개선율 계산

```javascript
// AI 기반 개선율 예측 모델
const predictImprovement = (sqlFeatures, tuningMethod) => {
  const model = loadMLModel('improvement_predictor');
  
  const features = {
    current_elapsed_time: sqlFeatures.elapsedTime,
    current_buffer_gets: sqlFeatures.bufferGets,
    table_size: sqlFeatures.tableRows,
    index_availability: sqlFeatures.hasIndex,
    tuning_method: tuningMethod,
    historical_success_rate: getHistoricalRate(tuningMethod)
  };
  
  const prediction = model.predict(features);
  
  return {
    expected_improvement: prediction.improvement_rate,
    confidence: prediction.confidence,
    min_improvement: prediction.lower_bound,
    max_improvement: prediction.upper_bound
  };
};
```

---

## 4. 튜닝 가이드 생성

### 4.1 단계별 튜닝 가이드

```json
{
  "tuning_guide": {
    "sql_id": "abc123def456",
    "total_steps": 5,
    "estimated_time": "30 minutes",
    "difficulty": "MEDIUM",
    "steps": [
      {
        "step": 1,
        "title": "현재 실행계획 백업",
        "description": "튜닝 전 현재 상태를 보존합니다",
        "command": "CREATE OUTLINE old_plan FOR CATEGORY temp_outlines...",
        "risk": "LOW",
        "rollback": "DROP OUTLINE old_plan"
      },
      {
        "step": 2,
        "title": "인덱스 생성",
        "description": "ORDERS 테이블에 복합 인덱스를 생성합니다",
        "command": "CREATE INDEX idx_orders_date_cust ON orders(order_date, customer_id) PARALLEL 8",
        "expected_improvement": "Buffer Gets 80% 감소",
        "risk": "MEDIUM",
        "considerations": [
          "인덱스 생성 중 DML 성능 저하 가능",
          "추가 스토리지 필요: 약 2GB",
          "인덱스 유지보수 오버헤드 발생"
        ]
      },
      {
        "step": 3,
        "title": "통계정보 수집",
        "description": "새 인덱스에 대한 통계를 수집합니다",
        "command": "EXEC DBMS_STATS.GATHER_INDEX_STATS('SCOTT', 'IDX_ORDERS_DATE_CUST')",
        "risk": "LOW"
      },
      {
        "step": 4,
        "title": "SQL 재실행 및 검증",
        "description": "개선된 실행계획 확인",
        "validation_queries": [
          "SELECT * FROM v$sql WHERE sql_id = 'abc123def456'",
          "SELECT * FROM table(DBMS_XPLAN.DISPLAY_CURSOR('abc123def456'))"
        ]
      },
      {
        "step": 5,
        "title": "성능 모니터링",
        "description": "24시간 동안 성능 추이 관찰",
        "monitoring_metrics": [
          "Elapsed Time < 500ms",
          "Buffer Gets < 10000",
          "CPU Usage < 20%"
        ]
      }
    ]
  }
}
```

### 4.2 AI 생성 튜닝 스크립트

```sql
-- AI가 생성한 튜닝 스크립트
-- SQL ID: abc123def456
-- 생성일시: 2025-01-08 10:30:00
-- 예상 개선율: 85%

-- Step 1: 현재 상태 저장
CREATE TABLE tuning_backup_20250108 AS
SELECT * FROM v$sql WHERE sql_id = 'abc123def456';

-- Step 2: 인덱스 생성 (AI 추천)
CREATE INDEX idx_orders_opt ON orders(
  order_date,     -- Selectivity: 0.001
  customer_id,    -- Selectivity: 0.0001
  status          -- Filtering column
) 
TABLESPACE indexes
PARALLEL 8
NOLOGGING;

-- Step 3: 힌트 추가된 SQL (대안)
SELECT /*+ INDEX(o idx_orders_opt) 
           PARALLEL(o, 4)
           GATHER_PLAN_STATISTICS */
       o.order_id,
       o.order_date,
       c.customer_name
FROM   orders o
JOIN   customers c ON o.customer_id = c.customer_id
WHERE  o.order_date >= SYSDATE - 30
AND    o.status = 'PENDING';

-- Step 4: 통계 수집
BEGIN
  DBMS_STATS.GATHER_TABLE_STATS(
    ownname => 'SCOTT',
    tabname => 'ORDERS',
    cascade => TRUE,
    estimate_percent => DBMS_STATS.AUTO_SAMPLE_SIZE,
    method_opt => 'FOR ALL INDEXED COLUMNS SIZE AUTO'
  );
END;
/

-- Step 5: 검증 쿼리
SELECT 
  sql_id,
  elapsed_time,
  buffer_gets,
  cpu_time,
  executions
FROM v$sql 
WHERE sql_id = 'abc123def456'
AND last_active_time > SYSDATE - 1/24;
```

---

## 5. AI 패턴 인식

### 5.1 SQL 안티패턴 감지

#### 감지 가능한 패턴
```javascript
const antiPatterns = {
  // N+1 Query Problem
  "N_PLUS_ONE": {
    pattern: /SELECT.*FROM.*WHERE.*IN\s*\(SELECT/i,
    severity: "HIGH",
    solution: "JOIN으로 변경 또는 배치 처리"
  },
  
  // Missing Index
  "FULL_SCAN_LARGE_TABLE": {
    pattern: /TABLE ACCESS FULL/,
    condition: "rows > 100000",
    severity: "CRITICAL",
    solution: "적절한 인덱스 생성"
  },
  
  // Implicit Conversion
  "IMPLICIT_CONVERSION": {
    pattern: /TO_NUMBER|TO_CHAR|TO_DATE/,
    severity: "MEDIUM",
    solution: "데이터 타입 일치"
  },
  
  // Cartesian Join
  "CARTESIAN_PRODUCT": {
    pattern: /MERGE JOIN CARTESIAN|NESTED LOOPS/,
    severity: "CRITICAL",
    solution: "JOIN 조건 추가"
  },
  
  // SELECT *
  "SELECT_STAR": {
    pattern: /SELECT\s+\*/,
    severity: "LOW",
    solution: "필요한 컬럼만 선택"
  },
  
  // OR Condition
  "OR_CONDITION": {
    pattern: /WHERE.*\sOR\s/i,
    severity: "MEDIUM",
    solution: "UNION ALL로 변경 검토"
  }
};
```

### 5.2 유사 SQL 매칭

```python
class SimilarSQLMatcher:
    def find_similar_sqls(self, target_sql):
        """과거 튜닝된 유사 SQL 검색"""
        
        # 1. SQL 벡터화
        target_vector = self.vectorize_sql(target_sql)
        
        # 2. 코사인 유사도 계산
        similar_sqls = []
        for historical_sql in self.tuning_history:
            similarity = cosine_similarity(
                target_vector, 
                historical_sql['vector']
            )
            
            if similarity > 0.85:  # 85% 이상 유사
                similar_sqls.append({
                    'sql_id': historical_sql['sql_id'],
                    'similarity': similarity,
                    'tuning_method': historical_sql['method'],
                    'improvement': historical_sql['improvement']
                })
        
        # 3. 유사도 순 정렬
        return sorted(similar_sqls, 
                     key=lambda x: x['similarity'], 
                     reverse=True)
```

---

## 6. AI 학습 모델

### 6.1 튜닝 성공 예측 모델

```python
import tensorflow as tf
from sklearn.ensemble import RandomForestRegressor

class TuningSuccessPredictor:
    def __init__(self):
        self.model = self.build_model()
        
    def build_model(self):
        """딥러닝 모델 구성"""
        model = tf.keras.Sequential([
            tf.keras.layers.Dense(128, activation='relu'),
            tf.keras.layers.Dropout(0.2),
            tf.keras.layers.Dense(64, activation='relu'),
            tf.keras.layers.Dropout(0.2),
            tf.keras.layers.Dense(32, activation='relu'),
            tf.keras.layers.Dense(1, activation='sigmoid')
        ])
        
        model.compile(
            optimizer='adam',
            loss='mse',
            metrics=['mae', 'accuracy']
        )
        
        return model
    
    def predict_success_rate(self, sql_features, tuning_method):
        """튜닝 성공률 예측"""
        
        # Feature Engineering
        features = self.extract_features(sql_features)
        method_encoded = self.encode_method(tuning_method)
        
        # 예측
        X = np.concatenate([features, method_encoded])
        prediction = self.model.predict(X)
        
        return {
            'success_probability': float(prediction[0]),
            'confidence_interval': self.calculate_confidence(prediction),
            'risk_level': self.assess_risk(prediction[0])
        }
```

### 6.2 자동 학습 파이프라인

```yaml
learning_pipeline:
  data_collection:
    - source: v$sql
      frequency: hourly
    - source: tuning_history
      frequency: daily
    
  feature_extraction:
    - sql_complexity_score
    - table_statistics
    - index_usage_patterns
    - historical_performance
    
  model_training:
    - algorithm: ensemble
      models:
        - random_forest
        - gradient_boosting
        - neural_network
    - validation: k-fold_cross_validation
    - metrics:
        - accuracy
        - precision
        - recall
        - f1_score
    
  model_deployment:
    - versioning: enabled
    - a_b_testing: true
    - rollback: automatic
    
  continuous_learning:
    - feedback_loop: enabled
    - retraining_trigger:
        - accuracy_drop: 5%
        - new_data_threshold: 1000
```

---

## 7. AI 대시보드 UI

### 7.1 AI 인사이트 위젯

```html
<!-- AI 튜닝 인사이트 대시보드 -->
<div class="ai-insights-dashboard">
  <!-- AI 분석 요약 -->
  <div class="ai-summary-card">
    <h3>🤖 AI 튜닝 분석</h3>
    <div class="ai-metrics">
      <div class="metric">
        <span class="value">23</span>
        <span class="label">튜닝 필요 SQL</span>
      </div>
      <div class="metric">
        <span class="value">85%</span>
        <span class="label">예상 평균 개선율</span>
      </div>
      <div class="metric">
        <span class="value">2.3h</span>
        <span class="label">예상 작업 시간</span>
      </div>
    </div>
  </div>
  
  <!-- AI 추천 우선순위 -->
  <div class="ai-recommendations">
    <h4>AI 추천 튜닝 대상 (우선순위)</h4>
    <table class="recommendation-table">
      <thead>
        <tr>
          <th>순위</th>
          <th>SQL ID</th>
          <th>문제 유형</th>
          <th>예상 개선율</th>
          <th>AI 신뢰도</th>
          <th>액션</th>
        </tr>
      </thead>
      <tbody>
        <tr class="critical">
          <td>1</td>
          <td>abc123def</td>
          <td>
            <span class="issue-badge">Full Table Scan</span>
            <span class="issue-badge">Missing Index</span>
          </td>
          <td>
            <div class="improvement-bar">
              <div class="bar" style="width: 92%">92%</div>
            </div>
          </td>
          <td>
            <div class="confidence high">98%</div>
          </td>
          <td>
            <button onclick="showAIGuide('abc123def')">
              AI 가이드 보기
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  
  <!-- AI 튜닝 가이드 모달 -->
  <div id="aiGuideModal" class="modal">
    <div class="modal-content">
      <h3>🤖 AI 튜닝 가이드</h3>
      
      <!-- 문제 진단 -->
      <div class="diagnosis-section">
        <h4>📊 문제 진단</h4>
        <div class="diagnosis-cards">
          <div class="diagnosis-card critical">
            <div class="icon">⚠️</div>
            <div class="content">
              <strong>Full Table Scan</strong>
              <p>ORDERS 테이블 (5M rows) 전체 스캔 발생</p>
              <small>영향도: 실행시간의 85%</small>
            </div>
          </div>
          <div class="diagnosis-card high">
            <div class="icon">🔍</div>
            <div class="content">
              <strong>Missing Index</strong>
              <p>ORDER_DATE, CUSTOMER_ID 컬럼 인덱스 부재</p>
              <small>개선 가능: Buffer Gets 80% 감소</small>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 튜닝 방법 -->
      <div class="tuning-methods">
        <h4>🛠️ 추천 튜닝 방법</h4>
        <div class="method-tabs">
          <button class="tab active">인덱스 생성</button>
          <button class="tab">SQL 재작성</button>
          <button class="tab">파티셔닝</button>
        </div>
        
        <div class="method-content">
          <div class="step-guide">
            <div class="step">
              <div class="step-number">1</div>
              <div class="step-content">
                <h5>인덱스 생성</h5>
                <pre><code>CREATE INDEX idx_orders_opt 
ON orders(order_date, customer_id)
TABLESPACE indexes PARALLEL 8;</code></pre>
                <p class="impact">예상 효과: Elapsed Time 90% 감소</p>
              </div>
            </div>
            
            <div class="step">
              <div class="step-number">2</div>
              <div class="step-content">
                <h5>통계정보 수집</h5>
                <pre><code>EXEC DBMS_STATS.GATHER_INDEX_STATS(
  'SCOTT', 'IDX_ORDERS_OPT');</code></pre>
              </div>
            </div>
            
            <div class="step">
              <div class="step-number">3</div>
              <div class="step-content">
                <h5>검증</h5>
                <p>새로운 실행계획 확인 및 성능 측정</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 예상 결과 -->
      <div class="expected-results">
        <h4>📈 예상 개선 결과</h4>
        <div class="before-after">
          <div class="before">
            <h5>Before</h5>
            <ul>
              <li>Elapsed Time: 5,234ms</li>
              <li>Buffer Gets: 523,456</li>
              <li>Cost: 12,345</li>
            </ul>
          </div>
          <div class="arrow">→</div>
          <div class="after">
            <h5>After</h5>
            <ul>
              <li>Elapsed Time: 234ms (-95%)</li>
              <li>Buffer Gets: 4,567 (-99%)</li>
              <li>Cost: 456 (-96%)</li>
            </ul>
          </div>
        </div>
      </div>
      
      <!-- 자동 실행 옵션 -->
      <div class="auto-execute">
        <h4>🚀 자동 실행</h4>
        <div class="auto-options">
          <label>
            <input type="checkbox" checked> 테스트 환경에서 먼저 실행
          </label>
          <label>
            <input type="checkbox"> 실행 전 승인 요청
          </label>
          <label>
            <input type="checkbox" checked> 자동 롤백 설정
          </label>
        </div>
        <button class="btn-primary" onclick="executeAITuning()">
          AI 튜닝 실행
        </button>
      </div>
    </div>
  </div>
</div>
```

---

## 8. AI 기능 통합

### 8.1 시스템 통합 포인트

```javascript
// TMS 시스템에 AI 기능 통합
class TMSWithAI {
  constructor() {
    this.aiAdvisor = new AITuningAdvisor();
    this.mlEngine = new MLEngine();
    this.patternMatcher = new PatternMatcher();
  }
  
  // SQL 모니터링에 AI 분석 추가
  async monitorSQL(sqlId) {
    const sqlData = await this.fetchSQLData(sqlId);
    
    // 기존 모니터링
    const metrics = this.calculateMetrics(sqlData);
    
    // AI 분석 추가
    const aiAnalysis = await this.aiAdvisor.analyze(sqlData);
    
    return {
      ...metrics,
      ai_insights: aiAnalysis,
      recommendations: aiAnalysis.recommendations,
      predicted_improvement: aiAnalysis.improvement_rate
    };
  }
  
  // 튜닝 워크플로우에 AI 가이드 추가
  async createTuningTask(sqlId) {
    const aiGuide = await this.aiAdvisor.generateGuide(sqlId);
    
    return {
      sql_id: sqlId,
      ai_guided: true,
      steps: aiGuide.steps,
      expected_results: aiGuide.predictions,
      auto_executable: aiGuide.automation_ready
    };
  }
  
  // 자동 튜닝 실행
  async executeAutoTuning(sqlId, options = {}) {
    const { testFirst = true, requireApproval = false } = options;
    
    if (testFirst) {
      const testResult = await this.testInSandbox(sqlId);
      if (!testResult.success) {
        return { status: 'failed', reason: testResult.error };
      }
    }
    
    if (requireApproval) {
      await this.requestApproval(sqlId);
    }
    
    const result = await this.aiAdvisor.executeTuning(sqlId);
    
    // 학습을 위한 피드백 저장
    await this.mlEngine.saveFeedback(sqlId, result);
    
    return result;
  }
}
```

### 8.2 REST API 엔드포인트

```yaml
# AI 튜닝 API 명세
/api/v1/ai-tuning:
  
  # AI 분석 요청
  POST /analyze:
    request:
      sql_id: string
      include_history: boolean
      prediction_depth: enum[basic, detailed, comprehensive]
    response:
      diagnosis: object
      recommendations: array
      predicted_improvement: number
      confidence: number
  
  # AI 가이드 생성
  GET /guide/{sql_id}:
    response:
      steps: array
      scripts: array
      expected_results: object
      risk_assessment: object
  
  # 유사 SQL 검색
  POST /find-similar:
    request:
      sql_text: string
      threshold: number
    response:
      similar_sqls: array
      tuning_methods: array
  
  # 자동 튜닝 실행
  POST /execute:
    request:
      sql_id: string
      method: string
      auto_rollback: boolean
    response:
      status: string
      before_metrics: object
      after_metrics: object
      improvement: number
  
  # AI 모델 상태
  GET /model/status:
    response:
      version: string
      accuracy: number
      last_trained: datetime
      predictions_count: number
```

---

## 9. AI 성능 지표

### 9.1 AI 효과성 KPI

| 지표 | 목표 | 측정 방법 |
|------|------|-----------|
| AI 진단 정확도 | > 90% | 실제 문제 vs AI 진단 비교 |
| 예측 개선율 정확도 | ±10% | 예측값 vs 실제 개선율 |
| 자동 튜닝 성공률 | > 85% | 성공 건수 / 전체 시도 |
| False Positive Rate | < 5% | 잘못된 추천 / 전체 추천 |
| 평균 튜닝 시간 단축 | 70% | AI 사용 전후 비교 |
| ROI | > 300% | 절감 시간 * 시간당 비용 |

### 9.2 학습 메트릭

```python
# AI 모델 성능 모니터링
class AIPerformanceMonitor:
    def track_metrics(self):
        return {
            # 모델 정확도
            'model_accuracy': self.calculate_accuracy(),
            
            # 예측 성능
            'mse': self.mean_squared_error(),
            'mae': self.mean_absolute_error(),
            'r2_score': self.r2_score(),
            
            # 비즈니스 임팩트
            'tuning_time_saved': self.calculate_time_savings(),
            'performance_improvement': self.avg_improvement(),
            'cost_reduction': self.calculate_cost_savings(),
            
            # 사용자 만족도
            'user_acceptance_rate': self.get_acceptance_rate(),
            'ai_guide_usage_rate': self.get_usage_rate()
        }
```

---

## 10. AI 보안 및 거버넌스

### 10.1 AI 의사결정 투명성

```json
{
  "ai_decision_log": {
    "sql_id": "abc123def456",
    "timestamp": "2025-01-08T10:30:00Z",
    "ai_version": "2.0.1",
    "decision": "RECOMMEND_INDEX",
    "reasoning": {
      "factors": [
        {
          "factor": "full_table_scan",
          "weight": 0.4,
          "score": 0.95
        },
        {
          "factor": "missing_index",
          "weight": 0.3,
          "score": 0.88
        },
        {
          "factor": "historical_pattern",
          "weight": 0.3,
          "score": 0.72
        }
      ],
      "final_score": 0.86,
      "confidence": 0.92
    },
    "human_override": false,
    "audit_trail": ["model_input", "processing", "output", "validation"]
  }
}
```

### 10.2 AI 윤리 가이드라인

- **투명성**: 모든 AI 결정은 설명 가능해야 함
- **책임성**: AI 추천에 대한 최종 결정은 인간이 수행
- **공정성**: 특정 SQL이나 모듈에 편향되지 않음
- **프라이버시**: 민감한 데이터는 학습에서 제외
- **안전성**: Critical 시스템은 자동 실행 제외

---

*문서 버전: 1.0*  
*작성일: 2025-01-08*  
*작성자: TMS AI Development Team*  
*AI 모델 버전: 2.0.1*
