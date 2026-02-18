# Implementation Plan: Query Artifacts - SQL 인덱스 생성도 시각화

**Status**: 🔄 In Progress
**Started**: 2026-01-13
**Last Updated**: 2026-01-13
**Estimated Completion**: 2026-01-17

---

**⚠️ CRITICAL INSTRUCTIONS**: After completing each phase:
1. ✅ Check off completed task checkboxes
2. 🧪 Run all quality gate validation commands
3. ⚠️ Verify ALL quality gate items pass
4. 📅 Update "Last Updated" date above
5. 📝 Document learnings in Notes section
6. ➡️ Only then proceed to next phase

⛔ **DO NOT skip quality gates or proceed with failing checks**

---

## 📋 Overview

### Feature Description
Query Artifacts는 복잡한 SQL 쿼리를 **인덱스 생성도**로 시각화하여 인덱스 생성 포인트를 직관적으로 파악하고, 자동화된 튜닝 가이드를 제공하는 기능입니다.

이병국 저 「개발자를 위한 인덱스 생성과 SQL 작성 노하우」(2018)의 인덱스 생성도 이론에 기반하여:
- 테이블 = 원(Circle)
- 조인 = 선(Edge)
- 인덱스 포인트 = 점(Dot)

으로 복잡한 조인 쿼리도 직관적인 다이어그램으로 표현합니다.

### Success Criteria
- [ ] SQL 입력 시 테이블, 컬럼, 조인 관계 파싱 완료
- [ ] React Flow 기반 인덱스 생성도 시각화 구현
- [ ] 기존 인덱스 조회 및 인덱스 후보 컬럼 분석 완료
- [ ] 최적 테이블 접근 순서 계산 구현
- [ ] 튜닝 권고사항 및 DDL 생성 구현
- [ ] 모던하고 아름다운 UI/UX 구현

### User Impact
- **DBA/개발자**: 복잡한 조인 쿼리의 인덱스 설계를 시각적으로 직관적으로 파악
- **성능 튜닝**: 자동 분석된 권고사항으로 빠른 인덱스 튜닝 의사결정
- **교육**: 인덱스 생성도 이론을 시각적으로 학습

---

## 🏗️ Architecture Decisions

| Decision | Rationale | Trade-offs |
|----------|-----------|------------|
| Clean Architecture 적용 | 기존 TMS 패턴(domain/application/infrastructure/presentation) 일관성 | 초기 구조화 비용 증가 |
| React Flow 사용 | 드래그/줌/팬 지원, React 통합 우수, 커스텀 노드 지원 | 번들 크기 증가 (~200KB) |
| 정규식 기반 SQL 파서 (MVP) | 빠른 구현, 외부 의존성 없음 | 복잡한 서브쿼리 처리 한계 |
| D3.js + dagre 레이아웃 | 자동 레이아웃 계산, 기존 차트 컴포넌트와 일관성 | 학습 곡선 |
| Server Component + Client 분리 | 인덱스 메타데이터는 서버에서 조회, 시각화는 클라이언트 | 데이터 흐름 복잡도 |

---

## 📦 Dependencies

### Required Before Starting
- [x] React Flow 설치 필요: `npm install reactflow dagre @dagrejs/dagre`
- [x] 기존 Oracle 연결 인프라 사용 가능
- [x] Shadcn UI 컴포넌트 사용 가능

### External Dependencies
- reactflow: ^11.x (다이어그램 시각화)
- @dagrejs/dagre: ^1.x (자동 레이아웃)
- 기존: d3, framer-motion, lucide-react

---

## 🧪 Test Strategy

### Testing Approach
**TDD Principle**: SQL 파서 및 분석 로직은 테스트 우선 개발

### Test Pyramid for This Feature
| Test Type | Coverage Target | Purpose |
|-----------|-----------------|---------|
| **Unit Tests** | ≥80% | SQL 파서, 인덱스 분석 로직, 선택도 계산 |
| **Integration Tests** | Critical paths | API → Oracle 조회 → 응답 |
| **E2E Tests** | Key user flows | SQL 입력 → 시각화 → 권고사항 확인 |

### Test File Organization
```
__tests__/
├── unit/
│   ├── query-artifacts/
│   │   ├── sql-parser.test.ts
│   │   ├── index-analyzer.test.ts
│   │   └── access-order-optimizer.test.ts
├── integration/
│   └── query-artifacts/
│       └── analyze-api.test.ts
```

---

## 🚀 Implementation Phases

### Phase 1: Domain & Application Layer Foundation
**Goal**: 핵심 비즈니스 로직 및 타입 시스템 구축
**Status**: ⏳ Pending

#### Tasks

**🔴 RED: Define Types & Interfaces First**
- [ ] **Task 1.1**: Domain 엔티티 및 Value Objects 정의
  - File(s): `src/domain/query-artifacts/entities/index.ts`
  - Types: ParsedTable, ParsedColumn, ParsedJoin, ParsedSQL
  - Types: DiagramNode, DiagramColumn, DiagramEdge
  - Types: IndexAnalysis, TuningRecommendation

- [ ] **Task 1.2**: Repository 인터페이스 정의
  - File(s): `src/domain/query-artifacts/repositories/IIndexMetadataRepository.ts`
  - Interface: getIndexesForTables(), getColumnStatistics()

- [ ] **Task 1.3**: Port 인터페이스 정의
  - File(s): `src/domain/query-artifacts/ports/ISQLParser.ts`
  - Interface: parse(sql: string): ParsedSQL

**🟢 GREEN: Implement Application Use Cases**
- [ ] **Task 1.4**: AnalyzeQueryUseCase 구현
  - File(s): `src/application/query-artifacts/use-cases/AnalyzeQueryUseCase.ts`
  - Orchestration: parse → fetch indexes → analyze → generate recommendations

- [ ] **Task 1.5**: DTO 정의
  - File(s): `src/application/query-artifacts/dto/index.ts`
  - DTOs: AnalyzeQueryRequest, AnalyzeQueryResponse

**🔵 REFACTOR: Clean Up**
- [ ] **Task 1.6**: Export barrels 정리
  - Files: `src/domain/query-artifacts/index.ts`, `src/application/query-artifacts/index.ts`

#### Quality Gate ✋

**Build & Tests**:
- [ ] TypeScript 컴파일 에러 없음
- [ ] 모든 인터페이스/타입 export 확인
- [ ] Domain layer에 외부 의존성 없음 확인

**Validation Commands**:
```bash
npm run build
npx tsc --noEmit
```

---

### Phase 2: Infrastructure Layer - SQL Parser & Index Analyzer
**Goal**: SQL 파싱 엔진 및 인덱스 분석 로직 구현
**Status**: ⏳ Pending

#### Tasks

**🔴 RED: Write Failing Tests First**
- [ ] **Test 2.1**: SQL Parser 테스트 작성
  - File(s): `__tests__/unit/query-artifacts/sql-parser.test.ts`
  - Cases: FROM절 테이블 추출, WHERE절 조건 추출, JOIN 감지 (Oracle/ANSI)
  - Cases: OUTER JOIN (+) 문법 처리

- [ ] **Test 2.2**: Index Analyzer 테스트 작성
  - File(s): `__tests__/unit/query-artifacts/index-analyzer.test.ts`
  - Cases: 인덱스 후보 판정, 선택도 계산, 접근 순서 결정

**🟢 GREEN: Implement Infrastructure**
- [ ] **Task 2.3**: SimpleSQLParser 구현
  - File(s): `src/infrastructure/query-artifacts/parsers/SimpleSQLParser.ts`
  - Methods: normalize(), extractTables(), extractColumns(), extractJoins()
  - Support: Oracle (+) 문법, ANSI JOIN 문법

- [ ] **Task 2.4**: IndexCandidateEvaluator 구현
  - File(s): `src/infrastructure/query-artifacts/analyzers/IndexCandidateEvaluator.ts`
  - Logic: 조건 연산자 평가, 선택도 평가, 인덱스 후보 점수화

- [ ] **Task 2.5**: AccessOrderOptimizer 구현
  - File(s): `src/infrastructure/query-artifacts/analyzers/AccessOrderOptimizer.ts`
  - Logic: 진입 테이블 결정, BFS 접근 순서, 비용 추정

- [ ] **Task 2.6**: TuningRecommendationGenerator 구현
  - File(s): `src/infrastructure/query-artifacts/generators/TuningRecommendationGenerator.ts`
  - Output: CREATE INDEX DDL, 힌트절, 결합인덱스 권고

**🔵 REFACTOR: Clean Up**
- [ ] **Task 2.7**: 코드 품질 개선
  - Extract common patterns
  - Add JSDoc documentation
  - Optimize regex patterns

#### Quality Gate ✋

**TDD Compliance**:
- [ ] SQL Parser 테스트 ≥80% 커버리지
- [ ] Index Analyzer 테스트 ≥80% 커버리지

**Validation Commands**:
```bash
npm test -- --coverage --testPathPattern=query-artifacts
npm run lint
```

---

### Phase 3: API Routes & Oracle Integration
**Goal**: 백엔드 API 엔드포인트 구현
**Status**: ⏳ Pending

#### Tasks

**🟢 GREEN: Implement API Routes**
- [ ] **Task 3.1**: 메인 분석 API 구현
  - File(s): `src/app/api/query-artifacts/analyze/route.ts`
  - Method: POST
  - Input: sql, connectionId
  - Output: diagram, analysis, recommendations

- [ ] **Task 3.2**: 인덱스 메타데이터 조회 서비스 구현
  - File(s): `src/infrastructure/query-artifacts/services/IndexMetadataService.ts`
  - Queries: ALL_INDEXES, ALL_IND_COLUMNS, ALL_TAB_COL_STATISTICS

- [ ] **Task 3.3**: 분석 이력 API (선택)
  - File(s): `src/app/api/query-artifacts/history/route.ts`
  - Methods: GET (list), POST (save)

**🔵 REFACTOR: Error Handling**
- [ ] **Task 3.4**: 에러 처리 및 로깅 개선
  - Permission fallback (DBA → USER views)
  - Timeout handling
  - Detailed error messages

#### Quality Gate ✋

**API Tests**:
- [ ] 401 인증 에러 처리 확인
- [ ] 400 유효성 검사 확인
- [ ] Oracle 연결 에러 처리 확인

**Validation Commands**:
```bash
npm run build
# Manual API test with curl or Postman
```

---

### Phase 4: Visualization Components - React Flow Diagram
**Goal**: 인덱스 생성도 시각화 컴포넌트 구현
**Status**: ⏳ Pending

#### Tasks

**🟢 GREEN: Implement Visualization**
- [ ] **Task 4.1**: React Flow 설치 및 설정
  ```bash
  npm install reactflow @dagrejs/dagre
  ```

- [ ] **Task 4.2**: TableNode 커스텀 노드 구현
  - File(s): `src/components/query-artifacts/nodes/TableNode.tsx`
  - Features: 테이블명, 컬럼 목록, 인덱스 유무 표시
  - Style: 실선(INNER), 점선(OUTER)

- [ ] **Task 4.3**: ColumnIndicator 컴포넌트 구현
  - File(s): `src/components/query-artifacts/nodes/ColumnIndicator.tsx`
  - Features: ● (인덱스 있음), ○ (인덱스 없음), 후보 애니메이션

- [ ] **Task 4.4**: IndexCreationDiagram 메인 컴포넌트 구현
  - File(s): `src/components/query-artifacts/IndexCreationDiagram.tsx`
  - Features: React Flow 통합, dagre 레이아웃, 줌/팬
  - Features: 범례, 접근 경로 하이라이트

- [ ] **Task 4.5**: AccessPathAnimation 컴포넌트 구현
  - File(s): `src/components/query-artifacts/AccessPathAnimation.tsx`
  - Features: 테이블 접근 순서 애니메이션, 재생/정지 컨트롤

**🔵 REFACTOR: Polish & Performance**
- [ ] **Task 4.6**: 스타일 및 애니메이션 개선
  - Modern glassmorphism effects
  - Smooth transitions
  - Responsive design

#### Quality Gate ✋

**Visual Tests**:
- [ ] 노드 렌더링 정상 확인
- [ ] 줌/팬 기능 동작 확인
- [ ] 애니메이션 부드러움 확인
- [ ] 다크 모드 지원 확인

**Validation Commands**:
```bash
npm run build
npm run dev
# Visual inspection at /query-artifacts
```

---

### Phase 5: Query Artifacts Page - Modern UI
**Goal**: 메인 페이지 및 통합 UI 구현
**Status**: ⏳ Pending

#### Tasks

**🟢 GREEN: Implement Page**
- [ ] **Task 5.1**: 메인 페이지 레이아웃 구현
  - File(s): `src/app/(dashboard)/query-artifacts/page.tsx`
  - Sections: SQL 입력, 다이어그램, 분석 결과, 권고사항

- [ ] **Task 5.2**: SQLInputPanel 컴포넌트 구현
  - File(s): `src/components/query-artifacts/SQLInputPanel.tsx`
  - Features: SQL 에디터, 분석 버튼, 로딩 상태

- [ ] **Task 5.3**: AnalysisSummaryPanel 컴포넌트 구현
  - File(s): `src/components/query-artifacts/AnalysisSummaryPanel.tsx`
  - Features: 건강도 점수, 접근 순서, 필요 인덱스 목록

- [ ] **Task 5.4**: RecommendationsPanel 컴포넌트 구현
  - File(s): `src/components/query-artifacts/RecommendationsPanel.tsx`
  - Features: 우선순위별 카드, DDL 복사, 상세 정보 토글

- [ ] **Task 5.5**: 사이드바 메뉴 추가
  - File(s): `src/components/dashboard/sidebar.tsx`
  - Menu: Query Artifacts 메뉴 항목 추가

**🔵 REFACTOR: UX Enhancement**
- [ ] **Task 5.6**: 모던 디자인 적용
  - Glassmorphism cards
  - Gradient accents
  - Smooth animations
  - Loading skeletons

#### Quality Gate ✋

**UI/UX Tests**:
- [ ] 반응형 레이아웃 확인 (모바일/태블릿/데스크톱)
- [ ] 다크 모드 스타일 확인
- [ ] 접근성 확인 (키보드 네비게이션)
- [ ] 로딩 상태 UX 확인

**Validation Commands**:
```bash
npm run build
npm run lint
```

---

### Phase 6: Presentation Layer Hooks & Integration
**Goal**: 프레젠테이션 레이어 훅 및 전체 통합
**Status**: ⏳ Pending

#### Tasks

**🟢 GREEN: Implement Hooks**
- [ ] **Task 6.1**: useQueryArtifacts 훅 구현
  - File(s): `src/presentation/query-artifacts/hooks/useQueryArtifacts.ts`
  - Features: React Query 통합, 분석 mutation, 캐싱

- [ ] **Task 6.2**: useIndexDiagram 훅 구현
  - File(s): `src/presentation/query-artifacts/hooks/useIndexDiagram.ts`
  - Features: 다이어그램 상태 관리, 노드 선택, 애니메이션 상태

- [ ] **Task 6.3**: Barrel exports 구성
  - File(s): `src/presentation/query-artifacts/index.ts`

**🔵 REFACTOR: Final Integration**
- [ ] **Task 6.4**: 전체 통합 테스트
  - E2E flow: SQL 입력 → API 호출 → 시각화 → 권고사항
  - Error handling flows

- [ ] **Task 6.5**: 성능 최적화
  - Dynamic imports for heavy components
  - Memoization
  - Skeleton loading

#### Quality Gate ✋

**Final Validation**:
- [ ] 전체 플로우 동작 확인
- [ ] 에러 처리 확인
- [ ] 성능 확인 (초기 로드 < 3초)

**Validation Commands**:
```bash
npm run build
npm run lint
npx tsc --noEmit
```

---

## ⚠️ Risk Assessment

| Risk | Probability | Impact | Mitigation Strategy |
|------|-------------|--------|---------------------|
| SQL 파싱 복잡도 | Medium | High | 정규식 기반 MVP로 시작, 향후 ANTLR 고려 |
| React Flow 번들 크기 | Low | Medium | Dynamic import, code splitting |
| Oracle 권한 부족 | Medium | Medium | USER_ 뷰로 폴백, 권한 안내 메시지 |
| 복잡한 서브쿼리 처리 | High | Low | MVP에서는 기본 조인만 지원, 점진적 확장 |

---

## 🔄 Rollback Strategy

### If Phase 1 Fails
**Steps to revert**:
- Remove `src/domain/query-artifacts/` directory
- Remove `src/application/query-artifacts/` directory

### If Phase 4 Fails (React Flow)
**Steps to revert**:
- `npm uninstall reactflow @dagrejs/dagre`
- Remove `src/components/query-artifacts/` directory
- Fallback to simpler D3.js implementation

### If Full Feature Fails
**Steps to revert**:
- Remove `/query-artifacts` route
- Remove sidebar menu item
- Remove all related directories

---

## 📊 Progress Tracking

### Completion Status
- **Phase 1**: ⏳ 0%
- **Phase 2**: ⏳ 0%
- **Phase 3**: ⏳ 0%
- **Phase 4**: ⏳ 0%
- **Phase 5**: ⏳ 0%
- **Phase 6**: ⏳ 0%

**Overall Progress**: 0% complete

---

## 📝 Notes & Learnings

### Implementation Notes
- (To be filled during implementation)

### Blockers Encountered
- (To be filled during implementation)

---

## 📚 References

### Documentation
- 이병국, 「개발자를 위한 인덱스 생성과 SQL 작성 노하우」, 글봄크리에이티브, 2018
- React Flow Docs: https://reactflow.dev/
- Oracle Index Advisor: Oracle Database Performance Tuning Guide

### Related Files
- Spec: `docs/query-artifacts-spec.md`
- Existing patterns: `src/domain/llm-analysis/`, `src/components/charts/execution-plan-tree.tsx`

---

## ✅ Final Checklist

**Before marking plan as COMPLETE**:
- [ ] All phases completed with quality gates passed
- [ ] Full integration testing performed
- [ ] Documentation updated
- [ ] Performance benchmarks meet targets
- [ ] Security review completed
- [ ] Accessibility requirements met
- [ ] All stakeholders notified
- [ ] Plan document archived for future reference

---

**Plan Status**: 🔄 In Progress
**Next Action**: User approval, then Phase 1 implementation
**Blocked By**: None
