# 🎨 Design Guide
## Oracle 튜닝관리시스템 TMS v2.0

---

## 1. 디자인 원칙

### 1.1 핵심 디자인 철학

#### Clarity (명확성)
- 정보의 계층 구조를 명확하게 표현
- 중요한 정보를 즉시 식별 가능하게 디자인
- 불필요한 장식적 요소 최소화

#### Efficiency (효율성)
- 최소한의 클릭으로 목표 달성
- 반복 작업을 위한 단축키 제공
- 자주 사용하는 기능은 쉽게 접근

#### Consistency (일관성)
- 동일한 기능은 동일한 디자인 패턴 사용
- 플랫폼 전반에 걸친 일관된 경험 제공
- 예측 가능한 인터랙션

#### Feedback (피드백)
- 모든 사용자 액션에 즉각적인 피드백
- 진행 상황을 명확하게 표시
- 오류 발생시 명확한 안내

---

## 2. 브랜드 아이덴티티

### 2.1 로고 및 브랜딩

```
┌─────────────────────────┐
│  🗄️  TMS                │
│  Tuning Management      │
│  System                 │
└─────────────────────────┘
```

### 2.2 브랜드 컬러
- **Primary**: 전문성과 신뢰를 표현
- **Secondary**: 활력과 혁신을 표현
- **Semantic**: 상태와 피드백을 표현

### 2.3 브랜드 톤앤매너
- **Professional**: 전문적이고 신뢰할 수 있는
- **Clear**: 명확하고 이해하기 쉬운
- **Supportive**: 도움이 되고 지원적인

---

## 3. 컬러 시스템

### 3.1 Primary Colors

```css
/* Brand Colors */
--primary-900: #1e293b;  /* Dark Navy - Headers */
--primary-800: #2c3e50;  /* Navy - Primary Actions */
--primary-700: #34495e;  /* Medium Navy - Active States */
--primary-600: #3d5a7c;  /* Light Navy - Hover States */
--primary-500: #3498db;  /* Blue - Links, Highlights */
--primary-400: #5dade2;  /* Light Blue - Secondary */
--primary-300: #85c1e9;  /* Pale Blue - Backgrounds */
--primary-200: #aed6f1;  /* Very Light Blue - Tints */
--primary-100: #d6eaf8;  /* Ultra Light Blue - Subtle BG */
```

### 3.2 Semantic Colors

```css
/* Status Colors */
--critical: #e74c3c;     /* Red - Critical Alerts */
--warning: #f39c12;      /* Orange - Warnings */
--success: #27ae60;      /* Green - Success, Normal */
--info: #3498db;         /* Blue - Information */

/* Semantic Backgrounds */
--critical-bg: #ffeaa7;   /* Light Red Background */
--warning-bg: #fff3cd;    /* Light Yellow Background */
--success-bg: #d4edda;    /* Light Green Background */
--info-bg: #d1ecf1;       /* Light Blue Background */
```

### 3.3 Neutral Colors

```css
/* Grayscale */
--gray-900: #212529;      /* Text - Primary */
--gray-800: #343a40;      /* Text - Headers */
--gray-700: #495057;      /* Text - Secondary */
--gray-600: #6c757d;      /* Text - Muted */
--gray-500: #adb5bd;      /* Borders */
--gray-400: #ced4da;      /* Dividers */
--gray-300: #dee2e6;      /* Light Borders */
--gray-200: #e9ecef;      /* Backgrounds */
--gray-100: #f8f9fa;      /* Light Backgrounds */
--white: #ffffff;         /* Pure White */
```

### 3.4 컬러 사용 가이드

#### 텍스트 컬러
- **헤더**: `--gray-900` on white background
- **본문**: `--gray-800` for readability
- **보조 텍스트**: `--gray-600` for secondary info
- **비활성**: `--gray-500` for disabled state

#### 배경 컬러
- **Primary Background**: `--white`
- **Secondary Background**: `--gray-100`
- **Card Background**: `--white` with border
- **Hover Background**: `--primary-100`

---

## 4. 타이포그래피

### 4.1 폰트 패밀리

```css
/* Font Stack */
--font-primary: 'Malgun Gothic', '맑은 고딕', -apple-system, 
                BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-monospace: 'Consolas', 'Monaco', 'Courier New', monospace;

/* Font Usage */
body { font-family: var(--font-primary); }
code, .sql-text { font-family: var(--font-monospace); }
```

### 4.2 폰트 사이즈

```css
/* Type Scale */
--text-xs: 10px;    /* Labels, Captions */
--text-sm: 11px;    /* Secondary Text */
--text-base: 12px;  /* Body Text */
--text-md: 13px;    /* Emphasis Text */
--text-lg: 14px;    /* Sub Headers */
--text-xl: 16px;    /* Section Headers */
--text-2xl: 18px;   /* Page Headers */
--text-3xl: 20px;   /* Main Headers */
--text-4xl: 24px;   /* Display Headers */
```

### 4.3 폰트 웨이트

```css
--font-normal: 400;   /* Body text */
--font-medium: 500;   /* Slight emphasis */
--font-bold: 700;     /* Headers, emphasis */
```

### 4.4 Line Height

```css
--leading-tight: 1.25;   /* Headers */
--leading-normal: 1.5;   /* Body text */
--leading-relaxed: 1.75; /* Paragraphs */
```

### 4.5 타이포그래피 컴포넌트

```css
/* Heading Styles */
.h1 {
  font-size: var(--text-3xl);
  font-weight: var(--font-bold);
  line-height: var(--leading-tight);
  color: var(--gray-900);
  margin-bottom: 16px;
}

.h2 {
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  line-height: var(--leading-tight);
  color: var(--gray-800);
  margin-bottom: 12px;
}

.h3 {
  font-size: var(--text-xl);
  font-weight: var(--font-bold);
  line-height: var(--leading-normal);
  color: var(--gray-800);
  margin-bottom: 8px;
}

/* Body Text */
.body-text {
  font-size: var(--text-base);
  font-weight: var(--font-normal);
  line-height: var(--leading-normal);
  color: var(--gray-700);
}

/* SQL Text */
.sql-text {
  font-family: var(--font-monospace);
  font-size: var(--text-sm);
  line-height: var(--leading-relaxed);
  background: var(--gray-900);
  color: var(--gray-100);
  padding: 12px;
  border-radius: 4px;
}
```

---

## 5. 레이아웃 시스템

### 5.1 Grid System

```css
/* 12 Column Grid */
.container {
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 24px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 24px;
}

/* Column Spans */
.col-1 { grid-column: span 1; }
.col-2 { grid-column: span 2; }
.col-3 { grid-column: span 3; }
.col-4 { grid-column: span 4; }
.col-6 { grid-column: span 6; }
.col-8 { grid-column: span 8; }
.col-12 { grid-column: span 12; }
```

### 5.2 Spacing System

```css
/* Spacing Scale (4px base) */
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;
```

### 5.3 Layout Templates

#### Dashboard Layout
```
┌────────────────────────────────────────┐
│              Header (60px)             │
├────────────────────────────────────────┤
│            Navigation (48px)           │
├─────────┬──────────────────────────────┤
│         │                              │
│ Sidebar │        Main Content          │
│ (220px) │         (Flexible)           │
│         │                              │
└─────────┴──────────────────────────────┘
```

#### Form Layout
```
┌────────────────────────────────────────┐
│            Form Header                 │
├────────────────────────────────────────┤
│  Label          │  Input Field         │
├─────────────────┼──────────────────────┤
│  Label          │  Input Field         │
├─────────────────┴──────────────────────┤
│          [Cancel] [Save]               │
└────────────────────────────────────────┘
```

---

## 6. 컴포넌트 디자인

### 6.1 Buttons

#### Primary Button
```css
.btn-primary {
  background: var(--primary-500);
  color: white;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary:hover {
  background: var(--primary-600);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.btn-primary:active {
  transform: translateY(0);
}

.btn-primary:disabled {
  background: var(--gray-400);
  cursor: not-allowed;
  opacity: 0.6;
}
```

#### Button Variants
```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│   Primary   │ │  Secondary  │ │   Danger    │
│    Blue     │ │    Gray     │ │     Red     │
└─────────────┘ └─────────────┘ └─────────────┘

┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│   Success   │ │   Warning   │ │    Info     │
│    Green    │ │   Orange    │ │    Blue     │
└─────────────┘ └─────────────┘ └─────────────┘
```

### 6.2 Form Elements

#### Input Fields
```css
.input-field {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--gray-400);
  border-radius: 4px;
  font-size: var(--text-sm);
  transition: border-color 0.2s;
}

.input-field:focus {
  outline: none;
  border-color: var(--primary-500);
  box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
}

.input-field:disabled {
  background: var(--gray-100);
  cursor: not-allowed;
}
```

#### Form Layout
```
Label (bold, 11px)
┌──────────────────────┐
│ Input Field          │
└──────────────────────┘
Helper text (gray, 10px)
```

### 6.3 Tables

#### Table Design
```css
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.data-table thead {
  background: var(--primary-900);
  color: white;
}

.data-table th {
  padding: 8px;
  text-align: left;
  font-weight: var(--font-medium);
  border-bottom: 2px solid var(--primary-800);
}

.data-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--gray-300);
}

.data-table tbody tr:hover {
  background: var(--primary-100);
}

.data-table tbody tr.selected {
  background: var(--info-bg);
}
```

### 6.4 Cards

```css
.card {
  background: white;
  border: 1px solid var(--gray-300);
  border-radius: 4px;
  padding: var(--space-4);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.card-header {
  font-size: var(--text-lg);
  font-weight: var(--font-bold);
  margin-bottom: var(--space-3);
  padding-bottom: var(--space-2);
  border-bottom: 2px solid var(--primary-500);
}

.metric-card {
  text-align: center;
  padding: var(--space-5);
  transition: transform 0.2s;
}

.metric-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}

.metric-value {
  font-size: var(--text-4xl);
  font-weight: var(--font-bold);
  color: var(--primary-800);
}

.metric-label {
  font-size: var(--text-xs);
  color: var(--gray-600);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
```

### 6.5 Badges

```css
.badge {
  display: inline-block;
  padding: 2px 6px;
  font-size: var(--text-xs);
  font-weight: var(--font-bold);
  border-radius: 3px;
  text-transform: uppercase;
}

.badge-critical {
  background: var(--critical);
  color: white;
}

.badge-warning {
  background: var(--warning);
  color: white;
}

.badge-success {
  background: var(--success);
  color: white;
}

.badge-info {
  background: var(--info);
  color: white;
}
```

---

## 7. 아이콘 시스템

### 7.1 아이콘 라이브러리

#### Navigation Icons
```
📊 Dashboard
📋 SQL Monitoring  
🔧 Tuning
📈 Execution Plan
📑 Trace
📊 AWR/ADDM
⚙️ Settings
```

#### Action Icons
```
🔍 Search
➕ Add
✏️ Edit
🗑️ Delete
💾 Save
↻ Refresh
⬇️ Download
📤 Export
```

#### Status Icons
```
🔴 Critical
🟡 Warning
🟢 Normal
🔵 Info
⚫ Inactive
⏸️ Paused
▶️ Running
✅ Completed
```

### 7.2 아이콘 사용 규칙

- 아이콘은 항상 레이블과 함께 사용
- 일관된 크기 유지 (16px, 20px, 24px)
- 의미가 명확한 아이콘 선택
- 컬러 아이콘은 상태 표시에만 사용

---

## 8. 차트 및 데이터 시각화

### 8.1 차트 컬러 팔레트

```javascript
const chartColors = [
  '#3498db', // Primary Blue
  '#27ae60', // Success Green
  '#f39c12', // Warning Orange
  '#e74c3c', // Critical Red
  '#9b59b6', // Purple
  '#1abc9c', // Turquoise
  '#34495e', // Dark Gray
  '#95a5a6', // Light Gray
];
```

### 8.2 차트 타입별 사용 가이드

#### Line Chart
- 시계열 데이터 (성능 트렌드)
- 연속적인 변화 추적

#### Bar Chart
- 카테고리별 비교 (Top SQL)
- 이산적인 값 비교

#### Pie Chart
- 비율/구성 표시 (Wait Event 분포)
- 전체 대비 부분

#### Heat Map
- 2차원 데이터 (시간대별 부하)
- 패턴 식별

### 8.3 차트 디자인 원칙

```css
.chart-container {
  background: white;
  border: 1px solid var(--gray-300);
  border-radius: 4px;
  padding: var(--space-4);
}

.chart-title {
  font-size: var(--text-md);
  font-weight: var(--font-bold);
  margin-bottom: var(--space-3);
}

.chart-legend {
  font-size: var(--text-xs);
  color: var(--gray-600);
}

/* Grid Lines */
.chart-grid {
  stroke: var(--gray-200);
  stroke-width: 1;
}

/* Axis */
.chart-axis {
  stroke: var(--gray-400);
  stroke-width: 2;
}
```

---

## 9. 반응형 디자인

### 9.1 Breakpoints

```css
/* Mobile First Approach */
/* Mobile */
@media (min-width: 0) {
  /* Base styles */
}

/* Tablet */
@media (min-width: 768px) {
  .container { padding: 0 32px; }
}

/* Desktop */
@media (min-width: 1024px) {
  .container { padding: 0 40px; }
}

/* Large Desktop */
@media (min-width: 1440px) {
  .container { max-width: 1440px; }
}
```

### 9.2 반응형 컴포넌트

#### Responsive Grid
```css
/* Mobile: 1 column */
.responsive-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-4);
}

/* Tablet: 2 columns */
@media (min-width: 768px) {
  .responsive-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Desktop: 4 columns */
@media (min-width: 1024px) {
  .responsive-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
```

#### Responsive Navigation
```css
/* Mobile: Hamburger Menu */
.mobile-menu {
  display: block;
}

.desktop-menu {
  display: none;
}

/* Desktop: Full Menu */
@media (min-width: 1024px) {
  .mobile-menu {
    display: none;
  }
  
  .desktop-menu {
    display: flex;
  }
}
```

---

## 10. 애니메이션 및 트랜지션

### 10.1 트랜지션 타이밍

```css
/* Timing Functions */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1);

/* Duration */
--duration-fast: 150ms;
--duration-normal: 250ms;
--duration-slow: 350ms;
```

### 10.2 애니메이션 패턴

#### Fade In
```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.fade-in {
  animation: fadeIn var(--duration-normal) var(--ease-out);
}
```

#### Slide In
```css
@keyframes slideIn {
  from {
    transform: translateY(-10px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.slide-in {
  animation: slideIn var(--duration-normal) var(--ease-out);
}
```

#### Loading Spinner
```css
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--gray-300);
  border-top-color: var(--primary-500);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
```

---

## 11. 상태 표시

### 11.1 Loading States

```html
<!-- Loading Overlay -->
<div class="loading-overlay">
  <div class="spinner"></div>
  <p>데이터를 불러오는 중...</p>
</div>

<!-- Skeleton Screen -->
<div class="skeleton">
  <div class="skeleton-header"></div>
  <div class="skeleton-body"></div>
  <div class="skeleton-body"></div>
</div>
```

### 11.2 Empty States

```html
<div class="empty-state">
  <img src="empty-icon.svg" alt="No data">
  <h3>데이터가 없습니다</h3>
  <p>검색 조건을 변경해보세요</p>
  <button class="btn-primary">새로고침</button>
</div>
```

### 11.3 Error States

```html
<div class="error-state">
  <div class="error-icon">⚠️</div>
  <h3>오류가 발생했습니다</h3>
  <p>잠시 후 다시 시도해주세요</p>
  <details>
    <summary>상세 정보</summary>
    <code>Error: Connection timeout</code>
  </details>
</div>
```

---

## 12. 접근성 디자인

### 12.1 Color Contrast

```css
/* WCAG AA Standard (4.5:1) */
.high-contrast {
  color: var(--gray-900);    /* #212529 */
  background: white;          /* #ffffff */
  /* Contrast Ratio: 19.5:1 ✓ */
}

/* Large Text (3:1) */
.large-text {
  font-size: 18px;
  color: var(--gray-700);     /* #495057 */
  background: white;
  /* Contrast Ratio: 9.7:1 ✓ */
}
```

### 12.2 Focus Indicators

```css
/* Visible Focus */
:focus {
  outline: 2px solid var(--primary-500);
  outline-offset: 2px;
}

/* Focus Within */
.input-group:focus-within {
  border-color: var(--primary-500);
  box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
}
```

### 12.3 Touch Targets

```css
/* Minimum 44x44px touch target */
.touch-target {
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

---

## 13. 다크 모드

### 13.1 Dark Theme Colors

```css
[data-theme="dark"] {
  --bg-primary: #1a1a1a;
  --bg-secondary: #2d2d2d;
  --text-primary: #e0e0e0;
  --text-secondary: #a0a0a0;
  --border: #404040;
  
  /* Adjusted semantic colors */
  --critical: #ff6b6b;
  --warning: #ffd93d;
  --success: #6bcf7f;
  --info: #6c9bff;
}
```

### 13.2 Dark Mode Components

```css
[data-theme="dark"] .card {
  background: var(--bg-secondary);
  border-color: var(--border);
}

[data-theme="dark"] .btn-primary {
  background: var(--primary-600);
}

[data-theme="dark"] .data-table {
  background: var(--bg-secondary);
  color: var(--text-primary);
}
```

---

## 14. 인쇄 스타일

```css
@media print {
  /* Hide navigation */
  .header, .sidebar, .footer {
    display: none;
  }
  
  /* Optimize for print */
  body {
    font-size: 12pt;
    line-height: 1.5;
    color: black;
    background: white;
  }
  
  /* Avoid page breaks */
  .card, .table {
    page-break-inside: avoid;
  }
  
  /* Show URLs */
  a[href]:after {
    content: " (" attr(href) ")";
  }
}
```

---

## 15. 디자인 체크리스트

### 개발 전 체크리스트
- [ ] 컬러 팔레트 정의 완료
- [ ] 타이포그래피 스케일 설정
- [ ] 그리드 시스템 구축
- [ ] 컴포넌트 라이브러리 준비
- [ ] 아이콘 세트 선정

### 구현 체크리스트
- [ ] WCAG 2.1 AA 준수
- [ ] 반응형 브레이크포인트 적용
- [ ] 다크 모드 지원
- [ ] 인쇄 스타일 적용
- [ ] 성능 최적화 (CSS 압축)

### QA 체크리스트
- [ ] 크로스 브라우저 테스트
- [ ] 모바일 디바이스 테스트
- [ ] 접근성 검증
- [ ] 성능 측정 (Lighthouse)
- [ ] 사용성 테스트

---

*문서 버전: 1.0*  
*작성일: 2025-01-08*  
*작성자: TMS Design Team*  
*디자인 시스템 버전: 2.0*
