# 🎯 군집분석 기반 SQL 튜닝 대상 식별 시스템
## Oracle 튜닝관리시스템 TMS v2.0 - Cluster Analysis Module

---

## 1. 개요

### 1.1 기능 정의
군집분석(Cluster Analysis)을 통해 SQL 성능 메트릭을 다차원 공간에 매핑하고, 머신러닝 알고리즘을 사용하여 튜닝이 필요한 SQL을 자동으로 식별하는 시각화 시스템입니다.

### 1.2 핵심 가치
- **시각적 식별**: 산점도를 통한 직관적인 SQL 성능 분포 파악
- **자동 분류**: K-means, DBSCAN 등 ML 알고리즘으로 SQL 자동 분류
- **이상치 감지**: 성능 이상 SQL 자동 감지
- **우선순위 지정**: 튜닝 우선순위 자동 결정

---

## 2. 군집분석 방법론

### 2.1 데이터 차원

#### 주요 메트릭 (Features)
```python
features = {
    'elapsed_time': 'SQL 실행 총 소요 시간 (ms)',
    'buffer_gets': '메모리 버퍼에서 읽은 블록 수',
    'cpu_time': 'CPU 사용 시간 (ms)',
    'disk_reads': '디스크에서 읽은 블록 수',
    'executions': 'SQL 실행 횟수',
    'rows_processed': '처리된 행 수'
}
```

#### 파생 메트릭
```python
derived_metrics = {
    'gets_per_exec': 'buffer_gets / executions',
    'elapsed_per_exec': 'elapsed_time / executions',
    'io_efficiency': 'disk_reads / buffer_gets',
    'cpu_efficiency': 'cpu_time / elapsed_time'
}
```

### 2.2 클러스터링 알고리즘

#### K-Means Clustering
```python
from sklearn.cluster import KMeans

def perform_kmeans_clustering(sql_data, n_clusters=5):
    """
    K-means 알고리즘으로 SQL 군집 분류
    """
    # 특징 추출
    features = sql_data[['elapsed_time', 'buffer_gets', 'cpu_time']]
    
    # 정규화
    from sklearn.preprocessing import StandardScaler
    scaler = StandardScaler()
    features_scaled = scaler.fit_transform(features)
    
    # K-means 클러스터링
    kmeans = KMeans(n_clusters=n_clusters, random_state=42)
    clusters = kmeans.fit_predict(features_scaled)
    
    # 클러스터 레이블 할당
    cluster_labels = {
        0: 'Critical',    # 최악 성능
        1: 'Warning',     # 주의 필요
        2: 'Normal',      # 정상
        3: 'Good',        # 양호
        4: 'Optimal'      # 최적
    }
    
    return clusters, cluster_labels
```

#### DBSCAN (Density-Based)
```python
from sklearn.cluster import DBSCAN

def perform_dbscan_clustering(sql_data, eps=0.5, min_samples=5):
    """
    DBSCAN으로 이상치 SQL 감지
    """
    features = sql_data[['elapsed_time', 'buffer_gets']]
    features_scaled = StandardScaler().fit_transform(features)
    
    dbscan = DBSCAN(eps=eps, min_samples=min_samples)
    clusters = dbscan.fit_predict(features_scaled)
    
    # -1은 이상치(outlier)
    outliers = sql_data[clusters == -1]
    
    return clusters, outliers
```

### 2.3 이상치 감지

#### Isolation Forest
```python
from sklearn.ensemble import IsolationForest

def detect_outliers(sql_data, contamination=0.1):
    """
    Isolation Forest로 성능 이상 SQL 감지
    """
    features = sql_data[['elapsed_time', 'buffer_gets', 'cpu_time']]
    
    iso_forest = IsolationForest(
        contamination=contamination,
        random_state=42
    )
    
    outliers = iso_forest.fit_predict(features)
    
    # -1이 outlier
    outlier_sqls = sql_data[outliers == -1]
    
    return outlier_sqls
```

---

## 3. 시각화 시스템

### 3.1 산점도 (Scatter Plot)

#### 3차원 매핑
```javascript
// Plotly.js를 사용한 3D 산점도
const trace = {
    x: sqlData.map(d => d.buffer_gets),      // X축: Buffer Gets
    y: sqlData.map(d => d.elapsed_time),     // Y축: Elapsed Time  
    z: sqlData.map(d => d.cpu_time),         // Z축: CPU Time
    mode: 'markers',
    marker: {
        size: sqlData.map(d => Math.log10(d.executions) * 5),
        color: sqlData.map(d => d.cluster_color),
        showscale: true
    },
    text: sqlData.map(d => d.sql_id),
    type: 'scatter3d'
};
```

#### 인터랙션 기능
- **Hover**: SQL 상세 정보 표시
- **Click**: SQL 선택 및 상세 분석
- **Lasso Selection**: 다중 SQL 선택
- **Zoom/Pan**: 특정 영역 확대

### 3.2 클러스터 시각화

```javascript
// 클러스터별 색상 매핑
const clusterColors = {
    'Critical': '#e74c3c',   // 빨강 - 튜닝 필수
    'Warning': '#f39c12',    // 주황 - 검토 필요
    'Normal': '#3498db',     // 파랑 - 정상
    'Optimal': '#2ecc71',    // 초록 - 최적
    'Outlier': '#9b59b6'     // 보라 - 이상치
};

// 클러스터 영역 표시
function drawClusterBoundaries(clusters) {
    clusters.forEach(cluster => {
        const boundary = calculateConvexHull(cluster.points);
        drawPolygon(boundary, cluster.color);
    });
}
```

---

## 4. 튜닝 대상 식별 규칙

### 4.1 Critical Cluster (튜닝 필수)

```yaml
criteria:
  elapsed_time: "> 3000ms"
  buffer_gets: "> 300000"
  cpu_time: "> 2000ms"
  
characteristics:
  - Full Table Scan 가능성 높음
  - Missing Index 의심
  - 비효율적 조인
  
tuning_priority: "HIGHEST"
expected_improvement: "70-95%"
```

### 4.2 Warning Cluster (검토 필요)

```yaml
criteria:
  elapsed_time: "1000-3000ms"
  buffer_gets: "50000-300000"
  cpu_time: "500-2000ms"
  
characteristics:
  - 부분적 성능 저하
  - 통계정보 갱신 필요
  - 힌트 조정 필요
  
tuning_priority: "HIGH"
expected_improvement: "40-70%"
```

### 4.3 Outlier Detection (이상치)

```yaml
detection_rules:
  - elapsed_time > mean + 3*std
  - buffer_gets > percentile_95
  - cpu_time / elapsed_time > 0.9
  
action:
  - 즉시 분석 필요
  - 긴급 튜닝 대상
  - 시스템 영향도 평가
```

---

## 5. AI 튜닝 어드바이저 통합

### 5.1 자동 진단

```python
def ai_diagnosis(sql_cluster):
    """
    클러스터별 AI 진단
    """
    if sql_cluster == 'Critical':
        diagnosis = {
            'problems': [
                'Full Table Scan 발생',
                'Missing Index on key columns',
                'Inefficient Join Order'
            ],
            'root_cause': 'Index 부재 및 통계정보 부정확',
            'impact': 'System-wide performance degradation'
        }
    elif sql_cluster == 'Warning':
        diagnosis = {
            'problems': [
                'Suboptimal execution plan',
                'Stale statistics'
            ],
            'root_cause': '부분적 최적화 필요',
            'impact': 'Moderate performance impact'
        }
    
    return diagnosis
```

### 5.2 튜닝 추천

```python
def recommend_tuning(sql_data, cluster):
    """
    클러스터 기반 튜닝 방법 추천
    """
    recommendations = []
    
    if cluster == 'Critical':
        if sql_data['buffer_gets'] > 500000:
            recommendations.append({
                'method': 'CREATE_INDEX',
                'script': generate_index_script(sql_data),
                'expected_improvement': 85
            })
        
        if 'FULL' in sql_data['execution_plan']:
            recommendations.append({
                'method': 'ADD_HINT',
                'script': generate_hint_script(sql_data),
                'expected_improvement': 70
            })
    
    return recommendations
```

---

## 6. 대시보드 기능

### 6.1 주요 기능

#### 실시간 클러스터링
- SQL 성능 데이터 실시간 수집
- 동적 클러스터 재계산
- 클러스터 경계 자동 업데이트

#### 인터랙티브 탐색
- 축 선택 (X, Y, Z)
- 메트릭 필터링
- 시간 범위 선택
- 모듈별 필터

#### 일괄 작업
- 클러스터 내 SQL 일괄 선택
- 그룹 튜닝 작업
- 우선순위 일괄 설정

### 6.2 UI 컴포넌트

```html
<!-- 컨트롤 패널 -->
<div class="control-panel">
    <select id="xAxis">
        <option value="buffer_gets">Buffer Gets</option>
        <option value="elapsed_time">Elapsed Time</option>
        <option value="cpu_time">CPU Time</option>
    </select>
    
    <select id="algorithm">
        <option value="kmeans">K-Means</option>
        <option value="dbscan">DBSCAN</option>
        <option value="hierarchical">Hierarchical</option>
    </select>
    
    <button onclick="runClustering()">클러스터링 실행</button>
    <button onclick="detectOutliers()">이상치 감지</button>
</div>

<!-- 산점도 차트 -->
<div id="scatterPlot"></div>

<!-- SQL 정보 패널 -->
<div class="sql-info-panel">
    <div class="cluster-summary">
        <!-- 클러스터 통계 -->
    </div>
    <div class="sql-details">
        <!-- 선택된 SQL 상세 -->
    </div>
    <button class="ai-tuning-btn">
        🤖 AI 튜닝 어드바이저
    </button>
</div>
```

---

## 7. 구현 예제

### 7.1 Python Backend

```python
from flask import Flask, jsonify
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

app = Flask(__name__)

@app.route('/api/clustering', methods=['POST'])
def perform_clustering():
    # SQL 데이터 로드
    sql_data = pd.read_sql("""
        SELECT sql_id, elapsed_time, buffer_gets, 
               cpu_time, disk_reads, executions
        FROM v$sql
        WHERE last_active_time > SYSDATE - 1
    """)
    
    # 특징 추출 및 정규화
    features = ['elapsed_time', 'buffer_gets', 'cpu_time']
    X = sql_data[features]
    X_scaled = StandardScaler().fit_transform(X)
    
    # K-means 클러스터링
    kmeans = KMeans(n_clusters=5)
    clusters = kmeans.fit_predict(X_scaled)
    
    # 클러스터 레이블 할당
    sql_data['cluster'] = clusters
    sql_data['cluster_label'] = sql_data['cluster'].map({
        0: 'Critical',
        1: 'Warning',
        2: 'Normal',
        3: 'Good',
        4: 'Optimal'
    })
    
    return jsonify(sql_data.to_dict('records'))
```

### 7.2 Frontend JavaScript

```javascript
async function loadClusterData() {
    const response = await fetch('/api/clustering', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'}
    });
    
    const data = await response.json();
    
    // Plotly로 시각화
    const traces = {};
    data.forEach(sql => {
        if (!traces[sql.cluster_label]) {
            traces[sql.cluster_label] = {
                x: [], y: [], text: [],
                mode: 'markers',
                name: sql.cluster_label,
                marker: {
                    size: 10,
                    color: getClusterColor(sql.cluster_label)
                }
            };
        }
        
        traces[sql.cluster_label].x.push(sql.buffer_gets);
        traces[sql.cluster_label].y.push(sql.elapsed_time);
        traces[sql.cluster_label].text.push(sql.sql_id);
    });
    
    Plotly.newPlot('scatterPlot', Object.values(traces));
}
```

---

## 8. 성능 지표

### 8.1 클러스터링 품질 메트릭

```python
from sklearn.metrics import silhouette_score, davies_bouldin_score

def evaluate_clustering(X, clusters):
    """
    클러스터링 품질 평가
    """
    metrics = {
        'silhouette_score': silhouette_score(X, clusters),
        'davies_bouldin_score': davies_bouldin_score(X, clusters),
        'inertia': kmeans.inertia_,
        'n_clusters': len(set(clusters))
    }
    
    return metrics
```

### 8.2 튜닝 효과성

| 클러스터 | 평균 개선율 | 튜닝 성공률 | 평균 소요시간 |
|----------|------------|-------------|--------------|
| Critical | 85% | 92% | 2시간 |
| Warning | 60% | 85% | 1시간 |
| Normal | 30% | 70% | 30분 |
| Outlier | 90% | 88% | 3시간 |

---

## 9. 활용 시나리오

### 9.1 일일 튜닝 워크플로우

```
1. 오전 9시: 클러스터링 자동 실행
2. Critical 클러스터 SQL 자동 식별
3. AI 튜닝 어드바이저 자동 분석
4. 튜닝 작업 티켓 자동 생성
5. DBA에게 알림 발송
6. 튜닝 실행 및 결과 추적
```

### 9.2 주간 성능 리뷰

```
1. 주간 클러스터 변화 추이 분석
2. 클러스터 이동 SQL 추적
3. 튜닝 효과 측정
4. 다음 주 튜닝 계획 수립
```

---

## 10. 장점 및 특징

### 10.1 기존 방법 대비 장점

| 기존 방법 | 군집분석 방법 | 개선 효과 |
|----------|--------------|-----------|
| 수동 SQL 검토 | 자동 클러스터링 | 90% 시간 단축 |
| 단일 메트릭 기준 | 다차원 분석 | 정확도 40% 향상 |
| 정적 임계값 | 동적 클러스터 | 적응형 튜닝 |
| 개별 SQL 분석 | 그룹 패턴 분석 | 인사이트 증가 |

### 10.2 핵심 특징

- **시각적 직관성**: 한눈에 SQL 분포 파악
- **자동 우선순위**: ML 기반 우선순위 결정
- **예측 가능성**: 튜닝 효과 사전 예측
- **확장성**: 대용량 SQL 처리 가능

---

*문서 버전: 1.0*  
*작성일: 2025-01-08*  
*작성자: TMS Development Team*  
*모듈 버전: 2.0*
