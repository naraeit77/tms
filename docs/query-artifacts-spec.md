# TMS 2.0 Query Artifacts 기능 구현 명세서

## 목차
1. [개요](#1-개요)
2. [인덱스 생성도 이론](#2-인덱스-생성도-이론)
3. [Query Artifacts 기능 요구사항](#3-query-artifacts-기능-요구사항)
4. [데이터 모델](#4-데이터-모델)
5. [SQL 파싱 엔진](#5-sql-파싱-엔진)
6. [시각화 엔진](#6-시각화-엔진)
7. [인덱스 분석 엔진](#7-인덱스-분석-엔진)
8. [튜닝 가이드 생성](#8-튜닝-가이드-생성)
9. [UI/UX 설계](#9-uiux-설계)
10. [API 설계](#10-api-설계)
11. [구현 우선순위](#11-구현-우선순위)

---

## 1. 개요

### 1.1 기능 목적
Query Artifacts는 복잡한 SQL 쿼리를 **인덱스 생성도**로 시각화하여 인덱스 생성 포인트를 직관적으로 파악하고, 자동화된 튜닝 가이드를 제공하는 기능입니다.

### 1.2 핵심 가치
- **복잡한 쿼리 단순화**: 아무리 복잡한 조인 쿼리도 원(테이블), 선(조인), 점(인덱스)으로 도식화
- **인덱스 생성 포인트 자동 식별**: 최적의 테이블 접근 순서에 따른 인덱스 생성 위치 제시
- **튜닝 가이드 자동 생성**: 인덱스 생성/수정 권고사항 및 SQL 힌트절 제안

### 1.3 이론적 배경
이병국 저 「개발자를 위한 인덱스 생성과 SQL 작성 노하우」(2018)의 인덱스 생성도 이론에 기반합니다.

---

## 2. 인덱스 생성도 이론

### 2.1 기본 개념

인덱스 생성도는 쿼리를 그래프로 도식화한 것입니다:

```
┌─────────────────────────────────────────────────────────────────┐
│  시각 요소          의미                                         │
├─────────────────────────────────────────────────────────────────┤
│  ● (채워진 원)      인덱스가 있는 컬럼                            │
│  ○ (빈 원)          인덱스가 없는 컬럼                            │
│  ─ (실선)           INNER JOIN 연결                              │
│  ┈ (점선)           OUTER JOIN 연결                              │
│  큰 원 (실선)       일반 테이블                                   │
│  큰 원 (점선)       OUTER JOIN 대상 테이블                        │
│  → (화살표)         테이블 접근 방향                              │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 인덱스 생성도 예시

```sql
SELECT *
FROM   고객, 주문, 부서
WHERE  고객.고객번호 = 주문.고객번호
AND    주문.부서번호 = 부서.부서번호(+)
AND    고객.고객명 LIKE ?
AND    고객.성별 = ?
AND    주문.상품코드 = ?
AND    주문.주문일자 = ?
AND    주문.배송여부 = ?
AND    부서.사용여부(+) = ?
```

위 쿼리의 인덱스 생성도:

```
                   상품코드+주문일자
                         │
                         ▼
    ●───────────────────●5
    │                    │
    │   고객번호          │   부서번호
    │                    │
●1  ●───────○ 주문 ○─────●──────────┈○ 부서
고객명      2            3            4
    │                    │
    │                    │
   고객                  │
                        │
                     테이블 접근 방향 →
```

### 2.3 인덱스 후보 컬럼 선정 기준

#### 인덱스 후보로 **부적합한** 컬럼
1. **LIKE 조건 컬럼**: 고객명 LIKE ? → 인덱스 사용 불가능
2. **분포도 나쁜 컬럼**: 성별(50%), 배송여부(Y/N), 사용여부 → 인덱스 효과 미미
3. **NULL 비교 컬럼**: IS NULL, IS NOT NULL 조건

#### 인덱스 후보로 **적합한** 컬럼
1. **분포도 좋은 컬럼**: 1% 이내 권장 (고객번호, 주문번호 등)
2. **'=' 조건 컬럼**: 등호 조건이 범위 조건보다 우선
3. **조인절 컬럼**: 테이블 간 연결에 사용되는 컬럼
4. **ORDER BY 컬럼**: 소트 부하 제거 가능

### 2.4 테이블 접근 순서 결정 규칙

```
┌─────────────────────────────────────────────────────────────────┐
│  규칙 1: 진입형 테이블 결정                                      │
│         - 조건절 분포도가 가장 좋은 테이블부터 접근              │
│         - 최소 비용으로 첫 번째 결과 집합 획득                   │
├─────────────────────────────────────────────────────────────────┤
│  규칙 2: OUTER JOIN보다 INNER JOIN 우선                         │
│         - OUTER JOIN 테이블은 마지막에 접근                      │
├─────────────────────────────────────────────────────────────────┤
│  규칙 3: 연결 축소형 우선                                        │
│         - 1:N 관계에서 1쪽 테이블 우선 접근 권장                 │
│         - 결과 집합 축소 방향으로 접근                           │
└─────────────────────────────────────────────────────────────────┘
```

### 2.5 결합 인덱스 컬럼 순서 결정

```
┌─────────────────────────────────────────────────────────────────┐
│  순서                       설명                                 │
├─────────────────────────────────────────────────────────────────┤
│  1. 필수 조건절 컬럼        공통적으로 사용하는 조건절 우선       │
│  2. '=' 조건 컬럼           범위 조건(BETWEEN, LIKE) 컬럼보다 앞 │
│  3. 대분류 → 소분류         분포도 나쁜 컬럼 → 좋은 컬럼 순서    │
│  4. 위치정보 → 순서정보     WHERE 컬럼 → ORDER BY 컬럼 순서      │
└─────────────────────────────────────────────────────────────────┘
```

**예시**: 
```
결합인덱스 = 상품코드(위치,=) + 주문일자(위치,범위) + 주문번호(순서)
```

### 2.6 인덱스 생성 포인트 결정

**핵심 원칙**: "우편 배달 시 발신 주소가 아닌 **수신 주소**가 중요하듯이, 인덱스는 항상 **목적지 컬럼**에 생성한다"

```
테이블 A ─────조인───── 테이블 B
           (고객번호)
           
A → B 방향 접근 시: B.고객번호에 인덱스 필요
B → A 방향 접근 시: A.고객번호에 인덱스 필요
```

---

## 3. Query Artifacts 기능 요구사항

### 3.1 기능 목록

| ID | 기능명 | 설명 | 우선순위 |
|----|--------|------|----------|
| QA-001 | SQL 파싱 | SQL 문장에서 테이블, 컬럼, 조건, 조인 추출 | P0 |
| QA-002 | 인덱스 생성도 시각화 | 파싱된 SQL을 그래프로 시각화 | P0 |
| QA-003 | 기존 인덱스 조회 | 대상 테이블의 현재 인덱스 정보 조회 | P0 |
| QA-004 | 인덱스 분석 | 최적 접근 순서 및 인덱스 포인트 분석 | P0 |
| QA-005 | 튜닝 가이드 생성 | 인덱스 생성/수정 권고사항 출력 | P0 |
| QA-006 | 실행계획 비교 | 현재 vs 권고 실행계획 비교 | P1 |
| QA-007 | 힌트절 생성 | 최적 접근 순서에 따른 힌트절 자동 생성 | P1 |
| QA-008 | 이력 관리 | 분석 이력 저장 및 조회 | P2 |
| QA-009 | LLM 통합 | AI 기반 튜닝 조언 생성 | P2 |

### 3.2 입력 데이터

```typescript
interface QueryArtifactInput {
  sql: string;                    // 분석 대상 SQL
  dbConnectionId: string;         // DB 연결 정보 ID
  includeExecutionPlan?: boolean; // 실행계획 포함 여부
  targetSchema?: string;          // 대상 스키마
}
```

### 3.3 출력 데이터

```typescript
interface QueryArtifactOutput {
  diagram: IndexCreationDiagram;  // 인덱스 생성도
  analysis: IndexAnalysis;        // 인덱스 분석 결과
  recommendations: TuningRecommendation[]; // 튜닝 권고사항
  hints?: string;                 // 권장 힌트절
  executionPlanComparison?: ExecutionPlanDiff; // 실행계획 비교
}
```

---

## 4. 데이터 모델

### 4.1 SQL 파싱 결과 모델

```typescript
// 테이블 정보
interface ParsedTable {
  id: string;                     // 고유 식별자
  alias: string;                  // 테이블 별칭
  name: string;                   // 실제 테이블명
  schema?: string;                // 스키마명
  isOuterJoinTarget: boolean;     // OUTER JOIN 대상 여부
}

// 컬럼 정보
interface ParsedColumn {
  id: string;
  tableId: string;                // 소속 테이블 ID
  name: string;                   // 컬럼명
  condition: ColumnCondition;     // 조건 정보
  dataType?: string;              // 데이터 타입
}

// 조건 정보
interface ColumnCondition {
  type: 'WHERE' | 'JOIN' | 'ORDER_BY' | 'GROUP_BY';
  operator: '=' | 'LIKE' | 'BETWEEN' | '>' | '<' | '>=' | '<=' | 'IN' | 'IS NULL' | 'IS NOT NULL';
  isBindVariable: boolean;        // 바인드 변수 여부
  literalValue?: string;          // 리터럴 값 (있는 경우)
  joinTargetTableId?: string;     // 조인 대상 테이블 ID
  joinTargetColumnId?: string;    // 조인 대상 컬럼 ID
}

// 조인 관계
interface ParsedJoin {
  id: string;
  sourceTableId: string;
  sourceColumnId: string;
  targetTableId: string;
  targetColumnId: string;
  joinType: 'INNER' | 'LEFT_OUTER' | 'RIGHT_OUTER' | 'FULL_OUTER';
}

// SQL 파싱 결과
interface ParsedSQL {
  tables: ParsedTable[];
  columns: ParsedColumn[];
  joins: ParsedJoin[];
  orderByColumns: string[];       // ORDER BY 컬럼 ID 목록
  groupByColumns: string[];       // GROUP BY 컬럼 ID 목록
}
```

### 4.2 인덱스 정보 모델

```typescript
// 기존 인덱스 정보 (DB에서 조회)
interface ExistingIndex {
  indexName: string;
  tableName: string;
  columns: IndexColumn[];
  isUnique: boolean;
  indexType: 'NORMAL' | 'BITMAP' | 'FUNCTION_BASED' | 'REVERSE';
  status: 'VALID' | 'INVALID' | 'UNUSABLE';
  lastAnalyzed?: Date;
  distinctKeys?: number;
  clusteringFactor?: number;
}

interface IndexColumn {
  columnName: string;
  position: number;               // 결합인덱스 내 순서
  descOrder: boolean;             // DESC 정렬 여부
}
```

### 4.3 인덱스 생성도 모델

```typescript
// 노드 (테이블)
interface DiagramNode {
  id: string;
  tableId: string;
  tableName: string;
  alias: string;
  type: 'INNER' | 'OUTER';        // OUTER JOIN 대상 여부
  position: { x: number; y: number }; // 화면 좌표
  columns: DiagramColumn[];
}

// 노드 내 컬럼
interface DiagramColumn {
  id: string;
  columnId: string;
  name: string;
  hasIndex: boolean;              // 기존 인덱스 존재 여부
  isIndexCandidate: boolean;      // 인덱스 후보 여부
  candidateReason?: string;       // 후보 사유 또는 제외 사유
  conditionType: 'WHERE' | 'JOIN' | 'ORDER_BY' | 'NONE';
  position: number;               // 컬럼 표시 위치 (1~N)
}

// 엣지 (조인 관계)
interface DiagramEdge {
  id: string;
  sourceNodeId: string;
  sourceColumnPosition: number;
  targetNodeId: string;
  targetColumnPosition: number;
  joinType: 'INNER' | 'OUTER';
  lineStyle: 'SOLID' | 'DASHED';  // 실선/점선
}

// 접근 경로
interface AccessPath {
  order: number;                  // 접근 순서
  nodeId: string;
  entryColumnId?: string;         // 진입 컬럼 (첫 번째 테이블)
  joinColumnId?: string;          // 조인 컬럼 (이후 테이블)
}

// 인덱스 생성도 전체
interface IndexCreationDiagram {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  recommendedAccessPath: AccessPath[];
  alternativeAccessPaths?: AccessPath[][]; // 대안 접근 경로
}
```

### 4.4 분석 결과 모델

```typescript
// 컬럼 분석 결과
interface ColumnAnalysis {
  columnId: string;
  tableName: string;
  columnName: string;
  selectivity: number;            // 선택도 (0~1, 낮을수록 좋음)
  cardinality?: number;           // NDV (Number of Distinct Values)
  nullRatio?: number;             // NULL 비율
  isIndexable: boolean;           // 인덱스 후보 가능 여부
  excludeReason?: string;         // 제외 사유
}

// 인덱스 포인트 분석
interface IndexPointAnalysis {
  pointNumber: number;            // 그림상 번호 (1, 2, 3...)
  tableName: string;
  columnName: string;
  columnId: string;
  pointType: 'ENTRY' | 'JOIN' | 'FILTER' | 'ORDER';
  existingIndex?: ExistingIndex;  // 기존 인덱스 정보
  needsIndex: boolean;            // 인덱스 필요 여부
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

// 전체 분석 결과
interface IndexAnalysis {
  parsedSQL: ParsedSQL;
  columnAnalyses: ColumnAnalysis[];
  indexPoints: IndexPointAnalysis[];
  optimalAccessOrder: string[];   // 최적 테이블 접근 순서
  estimatedCostReduction?: number; // 예상 비용 절감율 (%)
}
```

### 4.5 튜닝 권고사항 모델

```typescript
interface TuningRecommendation {
  id: string;
  type: 'CREATE_INDEX' | 'DROP_INDEX' | 'MODIFY_INDEX' | 'ADD_HINT' | 'REWRITE_SQL';
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;                  // 권고사항 제목
  description: string;            // 상세 설명
  rationale: string;              // 근거
  ddl?: string;                   // CREATE INDEX 문 등
  expectedImprovement?: string;   // 예상 개선 효과
  risk?: string;                  // 위험 요소
  relatedPoints: number[];        // 관련 인덱스 포인트 번호
}
```

---

## 5. SQL 파싱 엔진

### 5.1 파싱 전략

#### 방법 1: 정규식 기반 경량 파서 (권장 - 초기 버전)
```typescript
// 장점: 빠른 구현, 외부 의존성 없음
// 단점: 복잡한 서브쿼리 처리 한계

class SimpleSQLParser {
  parse(sql: string): ParsedSQL {
    const normalized = this.normalize(sql);
    return {
      tables: this.extractTables(normalized),
      columns: this.extractColumns(normalized),
      joins: this.extractJoins(normalized),
      orderByColumns: this.extractOrderBy(normalized),
      groupByColumns: this.extractGroupBy(normalized)
    };
  }
  
  private normalize(sql: string): string {
    return sql
      .replace(/--.*$/gm, '')           // 주석 제거
      .replace(/\/\*[\s\S]*?\*\//g, '') // 블록 주석 제거
      .replace(/\s+/g, ' ')             // 공백 정규화
      .trim()
      .toUpperCase();
  }
  
  private extractTables(sql: string): ParsedTable[] {
    const fromMatch = sql.match(/FROM\s+([\s\S]+?)(?:WHERE|ORDER|GROUP|HAVING|$)/i);
    if (!fromMatch) return [];
    
    const tableSection = fromMatch[1];
    const tablePattern = /(\w+)(?:\.(\w+))?\s+(\w+)?/g;
    // ... 구현
  }
  
  private extractJoins(sql: string): ParsedJoin[] {
    // Oracle 문법: table1.col = table2.col(+)  → LEFT OUTER JOIN
    // ANSI 문법: LEFT JOIN table ON ...
    // ... 구현
  }
}
```

#### 방법 2: ANTLR 기반 파서 (고급 - 향후 확장)
```typescript
// 장점: 정확한 파싱, 모든 SQL 문법 지원
// 단점: 빌드 복잡성, ANTLR 의존성

// Oracle PL/SQL 문법 파일 사용
// https://github.com/antlr/grammars-v4/tree/master/sql/plsql
```

### 5.2 OUTER JOIN 감지

```typescript
// Oracle 전용 문법 (+) 감지
function detectOracleOuterJoin(whereClause: string): JoinInfo[] {
  const outerPattern = /(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)\s*\(\+\)/g;
  // table1.col = table2.col(+) → table2가 OUTER JOIN 대상
  
  const matches: JoinInfo[] = [];
  let match;
  while ((match = outerPattern.exec(whereClause)) !== null) {
    matches.push({
      leftTable: match[1],
      leftColumn: match[2],
      rightTable: match[3],
      rightColumn: match[4],
      outerSide: 'RIGHT'  // (+)가 붙은 쪽이 OUTER
    });
  }
  return matches;
}

// ANSI JOIN 문법 감지
function detectAnsiOuterJoin(sql: string): JoinInfo[] {
  const joinPattern = /(LEFT|RIGHT|FULL)\s+(?:OUTER\s+)?JOIN\s+(\w+)/gi;
  // ... 구현
}
```

### 5.3 조건 연산자 분류

```typescript
enum ConditionOperator {
  EQUALS = '=',
  LIKE = 'LIKE',
  BETWEEN = 'BETWEEN',
  IN = 'IN',
  GT = '>',
  LT = '<',
  GTE = '>=',
  LTE = '<=',
  IS_NULL = 'IS NULL',
  IS_NOT_NULL = 'IS NOT NULL'
}

function classifyOperator(condition: string): {
  operator: ConditionOperator;
  isRangeCondition: boolean;
  isIndexUsable: boolean;
} {
  if (condition.includes('LIKE')) {
    const isPrefix = /LIKE\s+'\w+%'/.test(condition); // 'ABC%' 형태만 인덱스 사용 가능
    return {
      operator: ConditionOperator.LIKE,
      isRangeCondition: true,
      isIndexUsable: isPrefix
    };
  }
  // ... 기타 연산자 처리
}
```

---

## 6. 시각화 엔진

### 6.1 기술 스택 선택

| 옵션 | 라이브러리 | 장점 | 단점 |
|------|------------|------|------|
| **권장** | React Flow | React 통합, 드래그&드롭, 줌/팬 | 번들 크기 |
| 대안 1 | D3.js | 완전한 커스터마이징 | 학습 곡선 |
| 대안 2 | Cytoscape.js | 그래프 전용, 레이아웃 알고리즘 | 스타일링 제한 |
| 대안 3 | Mermaid.js | 마크다운 통합, 간단 | 커스터마이징 제한 |

### 6.2 React Flow 기반 구현

```typescript
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap
} from 'reactflow';

// 커스텀 테이블 노드
const TableNode = ({ data }: { data: DiagramNode }) => {
  const borderStyle = data.type === 'OUTER' ? 'dashed' : 'solid';
  
  return (
    <div className={`table-node border-${borderStyle}`}>
      <div className="table-name">{data.tableName}</div>
      <div className="columns">
        {data.columns.map((col, idx) => (
          <ColumnIndicator
            key={col.id}
            column={col}
            position={idx + 1}
          />
        ))}
      </div>
    </div>
  );
};

// 컬럼 인디케이터 (인덱스 유무 표시)
const ColumnIndicator = ({ column, position }: { 
  column: DiagramColumn; 
  position: number;
}) => {
  const dotClass = column.hasIndex ? 'filled' : 'empty';
  const candidateClass = column.isIndexCandidate ? 'candidate' : '';
  
  return (
    <div className={`column-indicator ${candidateClass}`}>
      <span className={`index-dot ${dotClass}`}>
        {column.hasIndex ? '●' : '○'}
      </span>
      <span className="position-number">{position}</span>
      <span className="column-name">{column.name}</span>
      {column.conditionType !== 'NONE' && (
        <span className="condition-badge">{column.conditionType}</span>
      )}
    </div>
  );
};

// 메인 다이어그램 컴포넌트
const QueryArtifactDiagram = ({ diagram }: { diagram: IndexCreationDiagram }) => {
  const nodes: Node[] = diagram.nodes.map(node => ({
    id: node.id,
    type: 'tableNode',
    position: node.position,
    data: node
  }));
  
  const edges: Edge[] = diagram.edges.map(edge => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    animated: false,
    style: {
      stroke: edge.joinType === 'OUTER' ? '#888' : '#333',
      strokeDasharray: edge.lineStyle === 'DASHED' ? '5,5' : 'none'
    },
    label: `${edge.sourceColumnPosition} ─ ${edge.targetColumnPosition}`
  }));
  
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={{ tableNode: TableNode }}
      fitView
    >
      <Background />
      <Controls />
      <MiniMap />
    </ReactFlow>
  );
};
```

### 6.3 레이아웃 알고리즘

```typescript
// 자동 레이아웃 (Dagre 알고리즘 활용)
import dagre from 'dagre';

function calculateLayout(diagram: IndexCreationDiagram): IndexCreationDiagram {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', ranksep: 150, nodesep: 100 });
  g.setDefaultEdgeLabel(() => ({}));
  
  // 노드 추가
  diagram.nodes.forEach(node => {
    g.setNode(node.id, { 
      width: 200, 
      height: 100 + (node.columns.length * 30) 
    });
  });
  
  // 엣지 추가
  diagram.edges.forEach(edge => {
    g.setEdge(edge.sourceNodeId, edge.targetNodeId);
  });
  
  dagre.layout(g);
  
  // 계산된 위치 적용
  return {
    ...diagram,
    nodes: diagram.nodes.map(node => ({
      ...node,
      position: {
        x: g.node(node.id).x,
        y: g.node(node.id).y
      }
    }))
  };
}
```

### 6.4 인덱스 생성도 형태별 레이아웃

```typescript
// 인덱스 생성도 형태 감지
enum DiagramShape {
  HORIZONTAL = 'HORIZONTAL',  // 수평형 (A─B─C)
  VERTICAL = 'VERTICAL',      // 수직형 (위에서 아래로)
  STAR = 'STAR',              // 별형 (중앙 테이블 + 주변)
  MIXED = 'MIXED'             // 혼합형
}

function detectDiagramShape(diagram: IndexCreationDiagram): DiagramShape {
  const nodeCount = diagram.nodes.length;
  const edgeCount = diagram.edges.length;
  
  // 별형: 하나의 노드가 여러 노드와 연결
  const connectionCounts = new Map<string, number>();
  diagram.edges.forEach(edge => {
    connectionCounts.set(
      edge.sourceNodeId, 
      (connectionCounts.get(edge.sourceNodeId) || 0) + 1
    );
    connectionCounts.set(
      edge.targetNodeId,
      (connectionCounts.get(edge.targetNodeId) || 0) + 1
    );
  });
  
  const maxConnections = Math.max(...connectionCounts.values());
  if (maxConnections >= 3 && nodeCount >= 4) {
    return DiagramShape.STAR;
  }
  
  // 선형: 각 노드가 최대 2개 연결
  if (maxConnections <= 2) {
    return DiagramShape.HORIZONTAL;
  }
  
  return DiagramShape.MIXED;
}
```

### 6.5 접근 경로 애니메이션

```typescript
// 테이블 접근 순서 애니메이션
const AccessPathAnimation = ({ 
  diagram, 
  accessPath 
}: { 
  diagram: IndexCreationDiagram;
  accessPath: AccessPath[];
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  useEffect(() => {
    if (!isPlaying) return;
    
    const timer = setTimeout(() => {
      if (currentStep < accessPath.length - 1) {
        setCurrentStep(prev => prev + 1);
      } else {
        setIsPlaying(false);
      }
    }, 1500);
    
    return () => clearTimeout(timer);
  }, [currentStep, isPlaying, accessPath.length]);
  
  const highlightedNodes = accessPath
    .slice(0, currentStep + 1)
    .map(p => p.nodeId);
  
  return (
    <div className="access-path-animation">
      <div className="controls">
        <button onClick={() => setIsPlaying(!isPlaying)}>
          {isPlaying ? '⏸ 일시정지' : '▶ 재생'}
        </button>
        <button onClick={() => setCurrentStep(0)}>
          ⏮ 처음으로
        </button>
      </div>
      <div className="path-indicator">
        접근 순서: {accessPath
          .slice(0, currentStep + 1)
          .map(p => diagram.nodes.find(n => n.id === p.nodeId)?.tableName)
          .join(' → ')}
      </div>
    </div>
  );
};
```

---

## 7. 인덱스 분석 엔진

### 7.1 기존 인덱스 조회

```sql
-- Oracle 인덱스 정보 조회
SELECT 
    i.index_name,
    i.table_name,
    i.uniqueness,
    i.index_type,
    i.status,
    i.last_analyzed,
    i.distinct_keys,
    i.clustering_factor,
    ic.column_name,
    ic.column_position,
    ic.descend
FROM 
    all_indexes i
    JOIN all_ind_columns ic ON i.index_name = ic.index_name 
                            AND i.table_owner = ic.index_owner
WHERE 
    i.table_owner = :owner
    AND i.table_name IN (:table_names)
ORDER BY 
    i.table_name, i.index_name, ic.column_position;
```

```typescript
// 인덱스 조회 서비스
class IndexMetadataService {
  async getIndexesForTables(
    connection: OracleConnection,
    owner: string,
    tableNames: string[]
  ): Promise<Map<string, ExistingIndex[]>> {
    const result = await connection.execute(INDEX_QUERY, {
      owner,
      table_names: tableNames
    });
    
    return this.groupByTable(result.rows);
  }
  
  // 특정 컬럼에 인덱스 존재 여부 확인
  hasIndexOnColumn(
    indexes: ExistingIndex[],
    columnName: string,
    mustBeLeading: boolean = true
  ): boolean {
    return indexes.some(idx => 
      mustBeLeading
        ? idx.columns[0].columnName === columnName  // 선두 컬럼만
        : idx.columns.some(c => c.columnName === columnName)  // 어디든
    );
  }
  
  // 결합인덱스 포함 여부 확인
  findCoveringIndex(
    indexes: ExistingIndex[],
    requiredColumns: string[]
  ): ExistingIndex | null {
    return indexes.find(idx => {
      const indexColumns = idx.columns.map(c => c.columnName);
      return requiredColumns.every(col => indexColumns.includes(col));
    });
  }
}
```

### 7.2 컬럼 선택도 분석

```sql
-- 컬럼 통계 조회 (Oracle)
SELECT 
    column_name,
    num_distinct,
    num_nulls,
    density,
    histogram
FROM 
    all_tab_col_statistics
WHERE 
    owner = :owner
    AND table_name = :table_name
    AND column_name IN (:column_names);

-- 테이블 통계 조회
SELECT 
    table_name,
    num_rows,
    blocks,
    last_analyzed
FROM 
    all_tables
WHERE 
    owner = :owner
    AND table_name IN (:table_names);
```

```typescript
// 선택도 계산
class SelectivityAnalyzer {
  calculateSelectivity(
    numDistinct: number,
    numRows: number
  ): number {
    if (numRows === 0) return 1;
    return numDistinct / numRows;  // 0에 가까울수록 선택도 좋음
  }
  
  isGoodSelectivity(selectivity: number): boolean {
    // 1% 이하를 좋은 선택도로 판단 (이병국 저 기준)
    return selectivity <= 0.01;
  }
  
  getSelectivityGrade(selectivity: number): string {
    if (selectivity <= 0.001) return 'EXCELLENT';  // 0.1% 이하
    if (selectivity <= 0.01) return 'GOOD';        // 1% 이하
    if (selectivity <= 0.05) return 'FAIR';        // 5% 이하
    if (selectivity <= 0.10) return 'POOR';        // 10% 이하
    return 'VERY_POOR';                            // 10% 초과
  }
}
```

### 7.3 인덱스 후보 컬럼 판정

```typescript
interface CandidateEvaluation {
  isCandidate: boolean;
  score: number;           // 0-100 점수
  reasons: string[];       // 판정 사유
  excludeReasons: string[]; // 제외 사유
}

class IndexCandidateEvaluator {
  evaluate(column: ParsedColumn, stats: ColumnStatistics): CandidateEvaluation {
    const reasons: string[] = [];
    const excludeReasons: string[] = [];
    let score = 50;  // 기본 점수
    
    // 1. 조건 타입에 따른 평가
    if (column.condition.type === 'JOIN') {
      score += 30;
      reasons.push('조인 연결 컬럼 - 인덱스 필수');
    }
    
    // 2. 연산자에 따른 평가
    if (column.condition.operator === '=') {
      score += 20;
      reasons.push('등호(=) 조건 - 인덱스 효율 높음');
    } else if (column.condition.operator === 'LIKE') {
      if (column.condition.literalValue?.endsWith('%')) {
        score += 10;
        reasons.push('전방 LIKE 조건 - 인덱스 사용 가능');
      } else {
        score -= 40;
        excludeReasons.push('중간/후방 LIKE 조건 - 인덱스 사용 불가');
      }
    } else if (['BETWEEN', '>', '<', '>=', '<='].includes(column.condition.operator)) {
      score += 10;
      reasons.push('범위 조건 - 인덱스 부분 사용');
    }
    
    // 3. 선택도에 따른 평가
    if (stats) {
      const selectivity = stats.numDistinct / stats.numRows;
      if (selectivity <= 0.01) {
        score += 20;
        reasons.push(`선택도 우수 (${(selectivity * 100).toFixed(2)}%)`);
      } else if (selectivity >= 0.50) {
        score -= 30;
        excludeReasons.push(`선택도 나쁨 (${(selectivity * 100).toFixed(2)}%) - 풀스캔 권장`);
      }
    }
    
    // 4. NULL 비율에 따른 평가
    if (stats?.nullRatio && stats.nullRatio > 0.50) {
      score -= 20;
      excludeReasons.push(`NULL 비율 높음 (${(stats.nullRatio * 100).toFixed(0)}%)`);
    }
    
    return {
      isCandidate: score >= 50 && excludeReasons.length === 0,
      score: Math.max(0, Math.min(100, score)),
      reasons,
      excludeReasons
    };
  }
}
```

### 7.4 최적 접근 순서 결정

```typescript
interface AccessOrderCandidate {
  order: string[];           // 테이블 접근 순서
  estimatedCost: number;     // 예상 비용
  requiredIndexes: string[]; // 필요한 인덱스
}

class AccessOrderOptimizer {
  findOptimalOrder(
    diagram: IndexCreationDiagram,
    existingIndexes: Map<string, ExistingIndex[]>,
    columnStats: Map<string, ColumnStatistics>
  ): AccessOrderCandidate[] {
    
    // 1. OUTER JOIN 테이블 분리 (마지막에 접근)
    const innerTables = diagram.nodes.filter(n => n.type === 'INNER');
    const outerTables = diagram.nodes.filter(n => n.type === 'OUTER');
    
    // 2. 진입 가능 테이블 식별 (WHERE 조건이 있는 테이블)
    const entryTables = innerTables.filter(table => 
      table.columns.some(col => 
        col.conditionType === 'WHERE' && col.isIndexCandidate
      )
    );
    
    // 3. 각 진입점에서의 접근 순서 계산
    const candidates: AccessOrderCandidate[] = [];
    
    for (const entryTable of entryTables) {
      const order = this.buildAccessOrder(entryTable, diagram, innerTables);
      const cost = this.estimateCost(order, existingIndexes, columnStats);
      const requiredIndexes = this.findRequiredIndexes(order, diagram, existingIndexes);
      
      candidates.push({ order, estimatedCost: cost, requiredIndexes });
    }
    
    // OUTER 테이블 추가
    candidates.forEach(candidate => {
      candidate.order.push(...outerTables.map(t => t.id));
    });
    
    // 비용 순으로 정렬
    return candidates.sort((a, b) => a.estimatedCost - b.estimatedCost);
  }
  
  private buildAccessOrder(
    startTable: DiagramNode,
    diagram: IndexCreationDiagram,
    innerTables: DiagramNode[]
  ): string[] {
    // BFS로 연결된 테이블 순회
    const order: string[] = [startTable.id];
    const visited = new Set<string>([startTable.id]);
    const queue = [startTable.id];
    
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      
      // 현재 테이블과 연결된 테이블 찾기
      const connectedEdges = diagram.edges.filter(e => 
        (e.sourceNodeId === currentId || e.targetNodeId === currentId) &&
        e.joinType === 'INNER'
      );
      
      for (const edge of connectedEdges) {
        const nextId = edge.sourceNodeId === currentId 
          ? edge.targetNodeId 
          : edge.sourceNodeId;
        
        if (!visited.has(nextId)) {
          visited.add(nextId);
          order.push(nextId);
          queue.push(nextId);
        }
      }
    }
    
    return order;
  }
  
  private estimateCost(
    order: string[],
    existingIndexes: Map<string, ExistingIndex[]>,
    columnStats: Map<string, ColumnStatistics>
  ): number {
    // 간단한 비용 모델
    // 실제로는 Oracle의 CBO처럼 복잡한 계산 필요
    let cost = 0;
    
    for (let i = 0; i < order.length; i++) {
      const tableId = order[i];
      const hasIndex = existingIndexes.get(tableId)?.length > 0;
      
      if (i === 0) {
        // 첫 번째 테이블: 인덱스 있으면 낮은 비용
        cost += hasIndex ? 10 : 1000;
      } else {
        // 조인 테이블: 조인 컬럼 인덱스 확인
        cost += hasIndex ? 5 : 500;
      }
    }
    
    return cost;
  }
  
  private findRequiredIndexes(
    order: string[],
    diagram: IndexCreationDiagram,
    existingIndexes: Map<string, ExistingIndex[]>
  ): string[] {
    const required: string[] = [];
    
    for (let i = 0; i < order.length; i++) {
      const tableId = order[i];
      const node = diagram.nodes.find(n => n.id === tableId)!;
      
      if (i === 0) {
        // 첫 번째 테이블: WHERE 조건 컬럼 인덱스 필요
        const whereColumns = node.columns.filter(c => c.conditionType === 'WHERE');
        for (const col of whereColumns) {
          if (!col.hasIndex && col.isIndexCandidate) {
            required.push(`${node.tableName}.${col.name}`);
          }
        }
      } else {
        // 이후 테이블: JOIN 컬럼 인덱스 필요
        const joinColumns = node.columns.filter(c => c.conditionType === 'JOIN');
        for (const col of joinColumns) {
          if (!col.hasIndex) {
            required.push(`${node.tableName}.${col.name}`);
          }
        }
      }
    }
    
    return required;
  }
}
```

---

## 8. 튜닝 가이드 생성

### 8.1 권고사항 생성기

```typescript
class TuningRecommendationGenerator {
  generate(analysis: IndexAnalysis): TuningRecommendation[] {
    const recommendations: TuningRecommendation[] = [];
    
    // 1. 인덱스 생성 권고
    for (const point of analysis.indexPoints) {
      if (point.needsIndex && !point.existingIndex) {
        recommendations.push(
          this.createIndexRecommendation(point, analysis)
        );
      }
    }
    
    // 2. 결합인덱스 권고
    const combinedIndexRec = this.analyzeCombinedIndexOpportunity(analysis);
    if (combinedIndexRec) {
      recommendations.push(combinedIndexRec);
    }
    
    // 3. 힌트절 권고
    const hintRec = this.generateHintRecommendation(analysis);
    if (hintRec) {
      recommendations.push(hintRec);
    }
    
    // 4. 불필요 인덱스 제거 권고
    const dropRecs = this.findUnusedIndexes(analysis);
    recommendations.push(...dropRecs);
    
    return recommendations.sort((a, b) => 
      this.priorityOrder(a.priority) - this.priorityOrder(b.priority)
    );
  }
  
  private createIndexRecommendation(
    point: IndexPointAnalysis,
    analysis: IndexAnalysis
  ): TuningRecommendation {
    const ddl = this.generateCreateIndexDDL(point, analysis);
    
    return {
      id: `IDX_${point.pointNumber}`,
      type: 'CREATE_INDEX',
      priority: point.priority,
      title: `${point.tableName}.${point.columnName} 인덱스 생성`,
      description: `테이블 접근 순서 ${point.pointNumber}번 포인트에 인덱스가 필요합니다.`,
      rationale: this.generateRationale(point),
      ddl,
      expectedImprovement: this.estimateImprovement(point),
      risk: this.assessRisk(point),
      relatedPoints: [point.pointNumber]
    };
  }
  
  private generateCreateIndexDDL(
    point: IndexPointAnalysis,
    analysis: IndexAnalysis
  ): string {
    const indexName = `IX_${point.tableName}_${point.columnName}`.substring(0, 30);
    
    // 기본 단일 인덱스
    let ddl = `CREATE INDEX ${indexName} ON ${point.tableName}(${point.columnName});`;
    
    // 결합인덱스 기회 확인
    const relatedColumns = analysis.columnAnalyses.filter(ca => 
      ca.tableName === point.tableName &&
      ca.columnName !== point.columnName &&
      ca.isIndexable
    );
    
    if (relatedColumns.length > 0) {
      ddl += `\n\n-- 또는 결합인덱스 고려:\n`;
      ddl += `-- CREATE INDEX ${indexName}_COMB ON ${point.tableName}(`;
      ddl += point.columnName;
      relatedColumns.slice(0, 3).forEach(col => {
        ddl += `, ${col.columnName}`;
      });
      ddl += `);`;
    }
    
    return ddl;
  }
  
  private generateHintRecommendation(analysis: IndexAnalysis): TuningRecommendation | null {
    if (analysis.optimalAccessOrder.length < 2) return null;
    
    const leadingHint = `/*+ LEADING(${analysis.optimalAccessOrder.join(' ')}) */`;
    const useNlHint = `/*+ USE_NL(${analysis.optimalAccessOrder.slice(1).join(' ')}) */`;
    
    return {
      id: 'HINT_001',
      type: 'ADD_HINT',
      priority: 'MEDIUM',
      title: '최적 접근 순서 힌트절',
      description: '오라클 옵티마이저가 잘못된 접근 순서를 선택하는 경우 사용하세요.',
      rationale: `권장 접근 순서: ${analysis.optimalAccessOrder.join(' → ')}`,
      ddl: `${leadingHint}\n${useNlHint}`,
      expectedImprovement: '실행계획 안정화',
      risk: '통계정보 변경 시 재검토 필요',
      relatedPoints: []
    };
  }
  
  private generateRationale(point: IndexPointAnalysis): string {
    const reasons: string[] = [];
    
    switch (point.pointType) {
      case 'ENTRY':
        reasons.push('쿼리 진입점 - 첫 번째 접근 테이블의 조건 컬럼');
        reasons.push('인덱스 없이는 Full Table Scan 발생');
        break;
      case 'JOIN':
        reasons.push('조인 연결 컬럼 - Nested Loop Join에 필수');
        reasons.push('인덱스 없으면 Hash Join 또는 Sort Merge Join으로 전환');
        break;
      case 'FILTER':
        reasons.push('필터 조건 컬럼 - 결과 집합 축소에 기여');
        break;
      case 'ORDER':
        reasons.push('정렬 컬럼 - 소트 연산 제거 가능');
        break;
    }
    
    return reasons.join('\n');
  }
  
  private estimateImprovement(point: IndexPointAnalysis): string {
    switch (point.priority) {
      case 'CRITICAL':
        return '예상 성능 개선: 10배 이상';
      case 'HIGH':
        return '예상 성능 개선: 5-10배';
      case 'MEDIUM':
        return '예상 성능 개선: 2-5배';
      case 'LOW':
        return '예상 성능 개선: 미미함';
    }
  }
  
  private assessRisk(point: IndexPointAnalysis): string {
    const risks: string[] = [];
    
    risks.push('인덱스 생성으로 INSERT/UPDATE/DELETE 성능에 영향');
    
    if (point.pointType === 'JOIN') {
      risks.push('테이블 데이터 증가 시 인덱스 크기도 증가');
    }
    
    return risks.join('\n');
  }
  
  private priorityOrder(priority: string): number {
    const order: Record<string, number> = {
      'CRITICAL': 1,
      'HIGH': 2,
      'MEDIUM': 3,
      'LOW': 4
    };
    return order[priority] || 5;
  }
}
```

### 8.2 결과 리포트 생성

```typescript
interface QueryArtifactReport {
  summary: ReportSummary;
  diagram: IndexCreationDiagram;
  analysis: IndexAnalysis;
  recommendations: TuningRecommendation[];
  generatedAt: Date;
}

interface ReportSummary {
  tableCount: number;
  joinCount: number;
  existingIndexCount: number;
  missingIndexCount: number;
  criticalIssueCount: number;
  overallHealthScore: number;  // 0-100
}

class ReportGenerator {
  generate(
    diagram: IndexCreationDiagram,
    analysis: IndexAnalysis,
    recommendations: TuningRecommendation[]
  ): QueryArtifactReport {
    return {
      summary: this.generateSummary(diagram, analysis, recommendations),
      diagram,
      analysis,
      recommendations,
      generatedAt: new Date()
    };
  }
  
  private generateSummary(
    diagram: IndexCreationDiagram,
    analysis: IndexAnalysis,
    recommendations: TuningRecommendation[]
  ): ReportSummary {
    const missingIndexCount = analysis.indexPoints.filter(p => 
      p.needsIndex && !p.existingIndex
    ).length;
    
    const criticalIssueCount = recommendations.filter(r => 
      r.priority === 'CRITICAL'
    ).length;
    
    // 건강도 점수 계산
    let healthScore = 100;
    healthScore -= criticalIssueCount * 30;
    healthScore -= missingIndexCount * 10;
    healthScore = Math.max(0, healthScore);
    
    return {
      tableCount: diagram.nodes.length,
      joinCount: diagram.edges.length,
      existingIndexCount: analysis.indexPoints.filter(p => p.existingIndex).length,
      missingIndexCount,
      criticalIssueCount,
      overallHealthScore: healthScore
    };
  }
  
  // Markdown 리포트 생성
  toMarkdown(report: QueryArtifactReport): string {
    let md = `# Query Artifacts 분석 리포트\n\n`;
    md += `생성일시: ${report.generatedAt.toLocaleString()}\n\n`;
    
    // 요약
    md += `## 요약\n\n`;
    md += `| 항목 | 값 |\n|------|----|\n`;
    md += `| 테이블 수 | ${report.summary.tableCount} |\n`;
    md += `| 조인 수 | ${report.summary.joinCount} |\n`;
    md += `| 기존 인덱스 | ${report.summary.existingIndexCount} |\n`;
    md += `| 필요 인덱스 | ${report.summary.missingIndexCount} |\n`;
    md += `| 건강도 점수 | ${report.summary.overallHealthScore}/100 |\n\n`;
    
    // 권고사항
    md += `## 권고사항\n\n`;
    for (const rec of report.recommendations) {
      md += `### [${rec.priority}] ${rec.title}\n\n`;
      md += `${rec.description}\n\n`;
      if (rec.ddl) {
        md += `\`\`\`sql\n${rec.ddl}\n\`\`\`\n\n`;
      }
    }
    
    return md;
  }
}
```

---

## 9. UI/UX 설계

### 9.1 페이지 레이아웃

```
┌─────────────────────────────────────────────────────────────────┐
│  TMS 2.0 > SQL 튜닝 > Query Artifacts                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  SQL 입력                                          [분석]  │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  SELECT * FROM 고객, 주문                          │  │  │
│  │  │  WHERE 고객.고객번호 = 주문.고객번호               │  │  │
│  │  │  AND 주문.주문일자 BETWEEN ...                     │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────┐  ┌─────────────────────────────┐  │
│  │  인덱스 생성도           │  │  분석 결과                  │  │
│  │                         │  │                             │  │
│  │   ●1──────○ 주문 ○──●3  │  │  ■ 건강도: 65/100           │  │
│  │   고객명    2            │  │                             │  │
│  │            │            │  │  ■ 접근 순서                 │  │
│  │           고객           │  │    1. 고객 (고객명)          │  │
│  │            │            │  │    2. 주문 (고객번호)        │  │
│  │   [▶ 재생] [⏮ 처음]      │  │                             │  │
│  └─────────────────────────┘  │  ■ 필요 인덱스: 2개          │  │
│                               │    - 주문.고객번호 [필수]     │  │
│                               │    - 주문.주문일자 [권장]     │  │
│                               └─────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  튜닝 권고사항                                             │  │
│  │                                                           │  │
│  │  🔴 [CRITICAL] 주문.고객번호 인덱스 생성 필요             │  │
│  │     CREATE INDEX IX_주문_고객번호 ON 주문(고객번호);      │  │
│  │                                                           │  │
│  │  🟡 [HIGH] 결합인덱스 고려                                 │  │
│  │     CREATE INDEX IX_주문_COMB ON 주문(상품코드, 주문일자); │  │
│  │                                                           │  │
│  │  [DDL 복사] [리포트 다운로드] [이력 저장]                  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 주요 컴포넌트

```typescript
// 메인 페이지 컴포넌트
const QueryArtifactsPage: React.FC = () => {
  const [sql, setSql] = useState('');
  const [result, setResult] = useState<QueryArtifactOutput | null>(null);
  const [loading, setLoading] = useState(false);
  
  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const response = await api.analyzeQuery({ sql });
      setResult(response);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="query-artifacts-page">
      <SQLInputPanel 
        value={sql}
        onChange={setSql}
        onAnalyze={handleAnalyze}
        loading={loading}
      />
      
      {result && (
        <>
          <div className="analysis-grid">
            <DiagramPanel diagram={result.diagram} />
            <AnalysisSummaryPanel analysis={result.analysis} />
          </div>
          <RecommendationsPanel recommendations={result.recommendations} />
        </>
      )}
    </div>
  );
};

// SQL 입력 패널
const SQLInputPanel: React.FC<{
  value: string;
  onChange: (sql: string) => void;
  onAnalyze: () => void;
  loading: boolean;
}> = ({ value, onChange, onAnalyze, loading }) => {
  return (
    <div className="sql-input-panel">
      <h3>SQL 입력</h3>
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={[sql()]}
        height="200px"
      />
      <button 
        onClick={onAnalyze} 
        disabled={loading || !value.trim()}
      >
        {loading ? '분석 중...' : '🔍 분석'}
      </button>
    </div>
  );
};

// 다이어그램 패널
const DiagramPanel: React.FC<{ diagram: IndexCreationDiagram }> = ({ diagram }) => {
  const [showAnimation, setShowAnimation] = useState(false);
  
  return (
    <div className="diagram-panel">
      <div className="panel-header">
        <h3>인덱스 생성도</h3>
        <div className="legend">
          <span>● 인덱스 있음</span>
          <span>○ 인덱스 없음</span>
          <span>─ INNER JOIN</span>
          <span>┈ OUTER JOIN</span>
        </div>
      </div>
      
      <QueryArtifactDiagram diagram={diagram} />
      
      <div className="animation-controls">
        <button onClick={() => setShowAnimation(!showAnimation)}>
          {showAnimation ? '⏸ 정지' : '▶ 접근 순서 재생'}
        </button>
      </div>
      
      {showAnimation && (
        <AccessPathAnimation
          diagram={diagram}
          accessPath={diagram.recommendedAccessPath}
        />
      )}
    </div>
  );
};

// 권고사항 패널
const RecommendationsPanel: React.FC<{
  recommendations: TuningRecommendation[];
}> = ({ recommendations }) => {
  const priorityColors: Record<string, string> = {
    'CRITICAL': '#dc3545',
    'HIGH': '#fd7e14',
    'MEDIUM': '#ffc107',
    'LOW': '#28a745'
  };
  
  return (
    <div className="recommendations-panel">
      <h3>튜닝 권고사항</h3>
      
      {recommendations.map(rec => (
        <div 
          key={rec.id} 
          className="recommendation-card"
          style={{ borderLeftColor: priorityColors[rec.priority] }}
        >
          <div className="rec-header">
            <span 
              className="priority-badge"
              style={{ backgroundColor: priorityColors[rec.priority] }}
            >
              {rec.priority}
            </span>
            <span className="rec-title">{rec.title}</span>
          </div>
          
          <p className="rec-description">{rec.description}</p>
          
          {rec.ddl && (
            <div className="ddl-section">
              <pre><code>{rec.ddl}</code></pre>
              <button 
                onClick={() => navigator.clipboard.writeText(rec.ddl!)}
              >
                📋 복사
              </button>
            </div>
          )}
          
          <div className="rec-details">
            <details>
              <summary>상세 정보</summary>
              <div className="detail-content">
                <strong>근거:</strong>
                <p>{rec.rationale}</p>
                {rec.expectedImprovement && (
                  <>
                    <strong>예상 효과:</strong>
                    <p>{rec.expectedImprovement}</p>
                  </>
                )}
                {rec.risk && (
                  <>
                    <strong>주의사항:</strong>
                    <p>{rec.risk}</p>
                  </>
                )}
              </div>
            </details>
          </div>
        </div>
      ))}
    </div>
  );
};
```

### 9.3 스타일 가이드

```css
/* Query Artifacts 스타일 */
.query-artifacts-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
}

/* 다이어그램 노드 스타일 */
.table-node {
  background: white;
  border: 2px solid #333;
  border-radius: 50%;
  padding: 15px;
  min-width: 120px;
  text-align: center;
}

.table-node.outer {
  border-style: dashed;
  border-color: #666;
}

/* 인덱스 인디케이터 */
.index-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-right: 5px;
}

.index-dot.filled {
  background-color: #333;
}

.index-dot.empty {
  background-color: transparent;
  border: 2px solid #333;
}

.index-dot.candidate {
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.2); }
}

/* 권고사항 카드 */
.recommendation-card {
  background: white;
  border-left: 4px solid;
  border-radius: 4px;
  padding: 15px;
  margin-bottom: 15px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.priority-badge {
  color: white;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 12px;
  font-weight: bold;
}

/* DDL 코드 블록 */
.ddl-section pre {
  background: #f5f5f5;
  padding: 10px;
  border-radius: 4px;
  overflow-x: auto;
}

.ddl-section code {
  font-family: 'Fira Code', monospace;
  font-size: 13px;
}
```

---

## 10. API 설계

### 10.1 REST API 엔드포인트

```typescript
// API 라우트 정의
const routes = {
  // 쿼리 분석
  POST: '/api/v1/query-artifacts/analyze',
  
  // 분석 이력
  GET: '/api/v1/query-artifacts/history',
  GET: '/api/v1/query-artifacts/history/:id',
  DELETE: '/api/v1/query-artifacts/history/:id',
  
  // 리포트 다운로드
  GET: '/api/v1/query-artifacts/:id/report',
  
  // 인덱스 메타데이터
  GET: '/api/v1/indexes/:schema/:table'
};
```

### 10.2 요청/응답 스키마

```typescript
// 분석 요청
interface AnalyzeRequest {
  sql: string;
  connectionId: string;
  options?: {
    includeExecutionPlan?: boolean;
    generateHints?: boolean;
    checkExistingIndexes?: boolean;
  };
}

// 분석 응답
interface AnalyzeResponse {
  success: boolean;
  data?: QueryArtifactOutput;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata: {
    analysisId: string;
    executionTimeMs: number;
    timestamp: string;
  };
}
```

### 10.3 에러 코드

```typescript
enum ErrorCode {
  INVALID_SQL = 'QA001',           // SQL 구문 오류
  PARSE_ERROR = 'QA002',           // 파싱 실패
  CONNECTION_ERROR = 'QA003',      // DB 연결 실패
  METADATA_ERROR = 'QA004',        // 메타데이터 조회 실패
  TIMEOUT = 'QA005',               // 분석 시간 초과
  UNSUPPORTED_SYNTAX = 'QA006',    // 지원하지 않는 SQL 구문
}
```

---

## 11. 구현 우선순위

### Phase 1: MVP (2주)
- [ ] SQL 파서 (정규식 기반)
- [ ] 기본 인덱스 생성도 시각화 (React Flow)
- [ ] 기존 인덱스 조회 (Oracle)
- [ ] 기본 튜닝 권고사항 생성

### Phase 2: 핵심 기능 (2주)
- [ ] 선택도 분석 기반 인덱스 후보 판정
- [ ] 최적 접근 순서 계산
- [ ] 결합인덱스 권고
- [ ] 힌트절 자동 생성

### Phase 3: 고급 기능 (2주)
- [ ] 실행계획 비교 (현재 vs 권고)
- [ ] 접근 경로 애니메이션
- [ ] 분석 이력 관리
- [ ] Markdown/PDF 리포트 다운로드

### Phase 4: AI 통합 (1주)
- [ ] LLM 기반 튜닝 조언 생성
- [ ] 자연어 설명 추가
- [ ] 유사 패턴 추천

---

## 부록

### A. 참고 자료
- 이병국, 「개발자를 위한 인덱스 생성과 SQL 작성 노하우」, 글봄크리에이티브, 2018
- Oracle Database Performance Tuning Guide
- React Flow 공식 문서: https://reactflow.dev/

### B. 용어 정의

| 용어 | 정의 |
|------|------|
| 인덱스 생성도 | 쿼리의 테이블, 조인, 인덱스를 그래프로 도식화한 것 |
| 선택도 (Selectivity) | 전체 행 대비 조건을 만족하는 행의 비율 |
| 분포도 | 전체 레코드 대비 고유값의 비율 (선택도와 유사) |
| 진입 테이블 | 쿼리 실행 시 최초로 접근하는 테이블 |
| 인덱스 포인트 | 인덱스가 필요한 위치 (그림상 번호로 표시) |

### C. 변경 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|----------|
| 1.0 | 2026-01-13 | 초안 작성 |
