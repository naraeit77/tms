# Local LLM Integration - Clean Architecture Implementation Plan

## 프로젝트 개요

**목표**: `/analysis` 페이지의 기능들을 Local LLM(Ollama/vLLM)을 통해 분석하도록 개선
**아키텍처**: Clean Architecture (Domain → Application → Infrastructure → Presentation)

---

## 현재 상태 분석

### 기존 LLM 인프라 (`/src/lib/llm/`)
- `client.ts`: LLMClient 클래스 (Ollama/vLLM 지원)
- `types.ts`: LLM 관련 타입 정의
- `config.ts`: 환경변수 기반 설정
- `prompts.ts`: Oracle SQL 튜닝 프롬프트
- API 엔드포인트: `/api/llm/analyze`, `/api/llm/stream`, `/api/llm/health`

### 분석 페이지 기능 (`/analysis`)
1. **SQL 통합 검색** - AI 기반 스마트 검색 가능
2. **실행 계획 분석** - LLM으로 실행 계획 해석
3. **AI 성능 진단** - 이미 LLM 연동됨
4. **성능 비교** - LLM으로 비교 분석 생성
5. **패턴 기반 이슈 탐지** - LLM으로 패턴 분석
6. **SQL 리팩토링 어시스턴트** - LLM 최적화 제안

---

## Clean Architecture 구조

```
src/
├── domain/                      # Layer 1: 도메인 (비즈니스 규칙)
│   └── llm-analysis/
│       ├── entities/
│       │   ├── SQLAnalysis.ts           # SQL 분석 엔티티
│       │   ├── ExecutionPlanAnalysis.ts # 실행계획 분석 엔티티
│       │   └── PerformanceInsight.ts    # 성능 인사이트 엔티티
│       ├── value-objects/
│       │   ├── AnalysisContext.ts       # 분석 컨텍스트 VO
│       │   ├── PerformanceScore.ts      # 성능 점수 VO
│       │   └── SQLMetrics.ts            # SQL 메트릭 VO
│       └── repositories/
│           └── ILLMAnalysisRepository.ts # 저장소 인터페이스
│
├── application/                 # Layer 2: 응용 (유스케이스)
│   └── llm-analysis/
│       ├── use-cases/
│       │   ├── AnalyzeSQLUseCase.ts           # SQL 분석
│       │   ├── AnalyzeExecutionPlanUseCase.ts # 실행계획 분석
│       │   ├── DetectPatternsUseCase.ts       # 패턴 탐지
│       │   ├── GenerateOptimizationUseCase.ts # 최적화 제안
│       │   ├── ComparePerformanceUseCase.ts   # 성능 비교
│       │   └── SmartSearchUseCase.ts          # 스마트 검색
│       ├── services/
│       │   └── LLMAnalysisService.ts    # 분석 서비스 조합
│       └── dto/
│           ├── AnalysisRequest.dto.ts
│           └── AnalysisResponse.dto.ts
│
├── infrastructure/              # Layer 3: 인프라 (외부 시스템)
│   └── llm/
│       ├── adapters/
│       │   ├── OllamaAdapter.ts         # Ollama 어댑터
│       │   ├── VLLMAdapter.ts           # vLLM 어댑터
│       │   └── ILLMAdapter.ts           # 어댑터 인터페이스
│       ├── repositories/
│       │   └── LLMAnalysisRepository.ts # 저장소 구현
│       ├── prompts/
│       │   ├── SQLAnalysisPrompt.ts
│       │   ├── ExecutionPlanPrompt.ts
│       │   ├── PatternDetectionPrompt.ts
│       │   └── OptimizationPrompt.ts
│       └── config/
│           └── LLMConfig.ts             # 설정 관리
│
└── presentation/                # Layer 4: 프레젠테이션 (UI)
    └── analysis/
        ├── hooks/
        │   ├── useSQLAnalysis.ts
        │   ├── useExecutionPlanAnalysis.ts
        │   ├── usePatternDetection.ts
        │   └── useLLMHealth.ts
        ├── components/
        │   ├── LLMAnalysisPanel.tsx
        │   ├── AIInsightCard.tsx
        │   └── StreamingResponse.tsx
        └── containers/
            └── AnalysisPageContainer.tsx
```

---

## 상세 구현 계획

### Phase 1: Domain Layer (도메인 계층)

#### 1.1 엔티티 정의

```typescript
// src/domain/llm-analysis/entities/SQLAnalysis.ts
export interface SQLAnalysis {
  id: string
  sqlId: string
  sqlText: string
  analysisType: AnalysisType
  summary: string
  issues: Issue[]
  recommendations: Recommendation[]
  performanceScore: PerformanceScore
  analyzedAt: Date
}

export type AnalysisType =
  | 'tuning'           // SQL 튜닝 분석
  | 'explain'          // 실행계획 해석
  | 'index'            // 인덱스 제안
  | 'rewrite'          // SQL 리라이트
  | 'pattern'          // 패턴 탐지
  | 'comparison'       // 성능 비교
```

#### 1.2 Value Objects

```typescript
// src/domain/llm-analysis/value-objects/PerformanceScore.ts
export class PerformanceScore {
  constructor(
    public readonly value: number,
    public readonly grade: 'A' | 'B' | 'C' | 'D' | 'F',
    public readonly factors: ScoreFactor[]
  ) {
    if (value < 0 || value > 100) {
      throw new Error('Score must be between 0 and 100')
    }
  }

  static fromMetrics(metrics: SQLMetrics): PerformanceScore {
    // 메트릭 기반 점수 계산 로직
  }
}
```

### Phase 2: Application Layer (응용 계층)

#### 2.1 Use Cases

```typescript
// src/application/llm-analysis/use-cases/AnalyzeSQLUseCase.ts
export class AnalyzeSQLUseCase {
  constructor(
    private readonly llmAdapter: ILLMAdapter,
    private readonly repository: ILLMAnalysisRepository
  ) {}

  async execute(request: AnalyzeSQLRequest): Promise<AnalyzeSQLResponse> {
    // 1. 입력 검증
    this.validateRequest(request)

    // 2. 프롬프트 구성
    const prompt = this.buildPrompt(request)

    // 3. LLM 호출
    const llmResponse = await this.llmAdapter.analyze(prompt)

    // 4. 결과 파싱
    const analysis = this.parseResponse(llmResponse)

    // 5. 저장 (선택적)
    if (request.saveHistory) {
      await this.repository.save(analysis)
    }

    return analysis
  }
}
```

#### 2.2 분석 서비스

```typescript
// src/application/llm-analysis/services/LLMAnalysisService.ts
export class LLMAnalysisService {
  constructor(
    private readonly analyzeSQLUseCase: AnalyzeSQLUseCase,
    private readonly analyzeExecutionPlanUseCase: AnalyzeExecutionPlanUseCase,
    private readonly detectPatternsUseCase: DetectPatternsUseCase,
    private readonly generateOptimizationUseCase: GenerateOptimizationUseCase
  ) {}

  // 종합 분석 (여러 유스케이스 조합)
  async comprehensiveAnalysis(sql: string, plan?: string): Promise<ComprehensiveAnalysisResult> {
    const [sqlAnalysis, planAnalysis, patterns] = await Promise.all([
      this.analyzeSQLUseCase.execute({ sqlText: sql }),
      plan ? this.analyzeExecutionPlanUseCase.execute({ plan }) : null,
      this.detectPatternsUseCase.execute({ sqlText: sql })
    ])

    return {
      sqlAnalysis,
      planAnalysis,
      patterns,
      overallScore: this.calculateOverallScore(sqlAnalysis, planAnalysis)
    }
  }
}
```

### Phase 3: Infrastructure Layer (인프라 계층)

#### 3.1 LLM 어댑터 인터페이스

```typescript
// src/infrastructure/llm/adapters/ILLMAdapter.ts
export interface ILLMAdapter {
  analyze(request: LLMRequest): Promise<LLMResponse>
  stream(request: LLMRequest): AsyncGenerator<string>
  healthCheck(): Promise<HealthStatus>
}

// src/infrastructure/llm/adapters/OllamaAdapter.ts
export class OllamaAdapter implements ILLMAdapter {
  constructor(private readonly config: LLMConfig) {}

  async analyze(request: LLMRequest): Promise<LLMResponse> {
    const response = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.modelName,
        messages: request.messages,
        stream: false,
        options: {
          temperature: this.config.temperature,
          num_predict: this.config.maxTokens
        }
      })
    })

    return this.parseResponse(await response.json())
  }
}
```

#### 3.2 프롬프트 템플릿

```typescript
// src/infrastructure/llm/prompts/SQLAnalysisPrompt.ts
export class SQLAnalysisPrompt {
  static build(params: SQLAnalysisParams): string {
    return `
당신은 Oracle 데이터베이스 SQL 튜닝 전문가입니다.

## 분석 대상 SQL
\`\`\`sql
${params.sqlText}
\`\`\`

${params.metrics ? this.buildMetricsSection(params.metrics) : ''}
${params.executionPlan ? this.buildPlanSection(params.executionPlan) : ''}

## 요청 분석
다음 항목을 분석해주세요:
1. **성능 이슈**: 잠재적 성능 문제 식별
2. **개선 권장사항**: 구체적인 튜닝 방안
3. **인덱스 제안**: 필요한 인덱스 DDL
4. **성능 점수**: 0-100점 평가

응답은 JSON 형식으로 제공해주세요.
    `.trim()
  }
}
```

### Phase 4: Presentation Layer (프레젠테이션 계층)

#### 4.1 Custom Hooks

```typescript
// src/presentation/analysis/hooks/useSQLAnalysis.ts
export function useSQLAnalysis() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (request: AnalyzeSQLRequest) => {
      const response = await fetch('/api/llm/analysis/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      })

      if (!response.ok) {
        throw new Error('Analysis failed')
      }

      return response.json() as Promise<SQLAnalysisResponse>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sql-analysis'] })
    }
  })
}

// 스트리밍 지원 훅
export function useSQLAnalysisStream() {
  const [content, setContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)

  const analyze = async (request: AnalyzeSQLRequest) => {
    setIsStreaming(true)
    setContent('')

    const response = await fetch('/api/llm/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    })

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader!.read()
      if (done) break

      const chunk = decoder.decode(value)
      setContent(prev => prev + chunk)
    }

    setIsStreaming(false)
  }

  return { content, isStreaming, analyze }
}
```

#### 4.2 UI 컴포넌트

```typescript
// src/presentation/analysis/components/LLMAnalysisPanel.tsx
'use client'

export function LLMAnalysisPanel({ sqlId, sqlText }: Props) {
  const { mutate: analyze, data, isPending } = useSQLAnalysis()
  const { data: health } = useLLMHealth()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BrainCircuit className="h-5 w-5" />
          AI 분석
          <LLMStatusBadge status={health?.status} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data ? (
          <AnalysisResult result={data} />
        ) : (
          <Button
            onClick={() => analyze({ sqlText })}
            disabled={isPending || health?.status !== 'healthy'}
          >
            {isPending ? '분석 중...' : 'AI 분석 시작'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
```

---

## 기능별 LLM 통합 계획

### 1. SQL 통합 검색 (Smart Search)

**현재**: 텍스트 기반 검색
**개선**: 자연어 쿼리 → SQL 필터 변환

```typescript
// Use Case: SmartSearchUseCase
// 입력: "지난 주에 실행된 느린 쿼리 중 buffer_gets가 많은 것"
// 출력: { timeRange: '7d', sortBy: 'buffer_gets', minElapsedTime: 1000 }
```

### 2. 실행 계획 분석 (Execution Plan Analysis)

**현재**: 텍스트/트리 뷰 표시
**개선**: LLM으로 실행 계획 해석 및 병목 지점 분석

```typescript
// Use Case: AnalyzeExecutionPlanUseCase
// 입력: DBMS_XPLAN 출력
// 출력: 병목 지점, 개선 제안, 예상 성능 향상률
```

### 3. 패턴 기반 이슈 탐지 (Pattern Detection)

**현재**: 규칙 기반 탐지
**개선**: LLM으로 복잡한 안티패턴 탐지

```typescript
// Use Case: DetectPatternsUseCase
// 탐지 패턴:
// - Implicit Type Conversion
// - Missing Join Conditions
// - Suboptimal Subqueries
// - Index Suppression
```

### 4. SQL 리팩토링 어시스턴트

**현재**: 수동 리팩토링
**개선**: LLM 기반 자동 SQL 재작성

```typescript
// Use Case: GenerateOptimizationUseCase
// 입력: 원본 SQL + 성능 메트릭
// 출력: 최적화된 SQL + 변경 설명 + 예상 개선율
```

### 5. 성능 비교 분석

**현재**: 수치 비교만 제공
**개선**: LLM으로 비교 결과 해석 및 인사이트 제공

```typescript
// Use Case: ComparePerformanceUseCase
// 입력: SQL A 메트릭, SQL B 메트릭
// 출력: 비교 요약, 차이 원인 분석, 권장사항
```

---

## API 엔드포인트 설계

```typescript
// 기존 엔드포인트 유지 + 새로운 기능별 엔드포인트

POST /api/llm/analysis/sql          // SQL 분석
POST /api/llm/analysis/plan         // 실행계획 분석
POST /api/llm/analysis/patterns     // 패턴 탐지
POST /api/llm/analysis/optimize     // 최적화 제안
POST /api/llm/analysis/compare      // 성능 비교
POST /api/llm/analysis/search       // 스마트 검색

// 스트리밍 엔드포인트
POST /api/llm/stream/sql
POST /api/llm/stream/plan
```

---

## 구현 우선순위

### Phase 1 (Week 1-2): 기반 구축
1. ✅ Domain Layer 엔티티/VO 정의
2. ✅ Application Layer Use Case 구조
3. ✅ Infrastructure Layer 어댑터 리팩토링

### Phase 2 (Week 3-4): 핵심 기능
1. SQL 분석 Use Case 완성
2. 실행 계획 분석 Use Case
3. Presentation Layer 훅/컴포넌트

### Phase 3 (Week 5-6): 고급 기능
1. 패턴 탐지 Use Case
2. SQL 리팩토링 Use Case
3. 스마트 검색 Use Case

### Phase 4 (Week 7-8): 통합 및 최적화
1. 성능 비교 분석
2. 스트리밍 응답 최적화
3. 캐싱 및 히스토리 기능

---

## 기술적 고려사항

### 1. 에러 처리
- LLM 서버 다운 시 폴백 메시지
- 타임아웃 처리 (기본 30초)
- Rate Limiting 대응

### 2. 성능 최적화
- 응답 스트리밍으로 UX 개선
- 분석 결과 캐싱 (Redis/IndexedDB)
- 배치 분석 지원

### 3. 보안
- SQL 인젝션 방지 (프롬프트 샌드박싱)
- 민감 정보 마스킹
- API 인증 강화

### 4. 모니터링
- LLM 응답 시간 추적
- 에러율 모니터링
- 사용량 대시보드

---

## 마이그레이션 전략

### 기존 코드 활용
- `/src/lib/llm/*` 코드를 Infrastructure Layer로 이동
- 기존 API 엔드포인트 유지하며 점진적 전환
- 타입 정의 재사용

### 점진적 전환
1. 새 구조 병행 운영
2. 기능별 순차 마이그레이션
3. 기존 코드 deprecated 처리
4. 완전 전환 후 기존 코드 제거

---

## 예상 결과

### 사용자 경험 개선
- SQL 분석 시간: 수동 10분 → AI 30초
- 실행계획 해석: 전문가 필요 → 즉시 인사이트
- 패턴 탐지: 규칙 기반 → 지능형 탐지

### 개발자 경험 개선
- Clean Architecture로 테스트 용이성 향상
- 기능별 독립적 개발/배포 가능
- 새로운 LLM 백엔드 추가 용이
