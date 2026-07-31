const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, TabStopType, TabStopPosition,
  TableOfContents, HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign, PageNumber, PageBreak
} = require('docx');

const FONT = 'Malgun Gothic';
const ACCENT = '4F46E5';     // indigo
const ACCENT2 = '7C3AED';    // purple
const GREY = '6B7280';
const LIGHT = 'F3F4F6';
const HEADBG = 'E0E7FF';

const CW = 9360; // content width (US Letter, 1" margins)

// ---------- helpers ----------
function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text })] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text })] });
}
function h3(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text })] });
}
function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120, line: 288 },
    children: [new TextRun({ text, ...opts })],
  });
}
function runs(children, opts = {}) {
  return new Paragraph({ spacing: { after: 120, line: 288 }, children, ...opts });
}
function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'bullets', level },
    spacing: { after: 60, line: 276 },
    children: typeof text === 'string' ? [new TextRun({ text })] : text,
  });
}
function num(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'steps', level },
    spacing: { after: 60, line: 276 },
    children: typeof text === 'string' ? [new TextRun({ text })] : text,
  });
}
function code(text) {
  const lines = String(text).split('\n');
  return new Paragraph({
    shading: { fill: '1E293B', type: ShadingType.CLEAR },
    spacing: { before: 60, after: 120 },
    border: {
      top: { style: BorderStyle.SINGLE, size: 2, color: '334155' },
      left: { style: BorderStyle.SINGLE, size: 2, color: '334155' },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: '334155' },
      right: { style: BorderStyle.SINGLE, size: 2, color: '334155' },
    },
    children: lines.flatMap((l, i) => {
      const r = new TextRun({ text: l, font: 'Consolas', size: 18, color: 'E2E8F0' });
      return i < lines.length - 1 ? [r, new TextRun({ break: 1 })] : [r];
    }),
  });
}
function note(text, color = ACCENT, label = '참고') {
  return new Paragraph({
    shading: { fill: LIGHT, type: ShadingType.CLEAR },
    spacing: { before: 80, after: 140 },
    border: {
      top: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB' },
      left: { style: BorderStyle.SINGLE, size: 18, color, space: 6 },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB' },
      right: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7EB' },
    },
    children: [
      new TextRun({ text: `${label}  `, bold: true, color }),
      new TextRun({ text }),
    ],
  });
}
const border = { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' };
const borders = { top: border, left: border, bottom: border, right: border };
function cell(content, { w, head = false, fill, align } = {}) {
  const children = (Array.isArray(content) ? content : [content]).map((c) =>
    typeof c === 'string'
      ? new Paragraph({
          alignment: align,
          children: [new TextRun({ text: c, bold: head, color: head ? '1E293B' : undefined })],
        })
      : c
  );
  return new TableCell({
    borders,
    width: { size: w, type: WidthType.DXA },
    shading: { fill: fill || (head ? HEADBG : 'FFFFFF'), type: ShadingType.CLEAR },
    margins: { top: 70, left: 110, bottom: 70, right: 110 },
    verticalAlign: VerticalAlign.CENTER,
    children,
  });
}
function table(widths, rows) {
  return new Table({
    width: { size: CW, type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map(
      (r, ri) =>
        new TableRow({
          tableHeader: ri === 0,
          children: r.map((c, ci) =>
            cell(c, { w: widths[ci], head: ri === 0 })
          ),
        })
    ),
  });
}
function spacer() { return new Paragraph({ spacing: { after: 60 }, children: [] }); }

// ---------- document content ----------
const cover = [
  new Paragraph({ spacing: { before: 2600, after: 0 }, alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Narae TMS', bold: true, size: 76, color: ACCENT })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 },
    children: [new TextRun({ text: 'SQL Tuning Management System', size: 36, color: GREY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240, after: 0 },
    children: [new TextRun({ text: '제품 사용 매뉴얼', bold: true, size: 44 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 },
    children: [new TextRun({ text: 'AI 튜닝 가이드 · Query Artifacts 중심', size: 26, color: ACCENT2 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1400 },
    children: [new TextRun({ text: '버전 2.0.0', size: 24 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: '대상: 데이터베이스 관리자(DBA) 및 개발자', size: 22, color: GREY })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240 },
    children: [new TextRun({ text: '주식회사 나래정보기술', size: 22, bold: true })] }),
  new Paragraph({ alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: '발행일: 2026-06-25', size: 20, color: GREY })] }),
  new Paragraph({ children: [new PageBreak()] }),
];

const toc = [
  h1('목차'),
  new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-3' }),
  new Paragraph({ children: [new PageBreak()] }),
];

const body = [];

// 1. 개요
body.push(h1('1. 문서 개요'));
body.push(p('본 문서는 Narae TMS 2.0(SQL 튜닝 관리 시스템)의 분석(Analysis) 메뉴 중 데이터베이스 관리자와 개발자가 가장 빈번하게 사용하는 두 핵심 기능인 「AI 튜닝 가이드」와 「Query Artifacts(인덱스 생성도)」의 사용 방법을 상세히 설명합니다. 화면 구성, 입력 방법, 옵션, 결과 해석, 내부 동작 원리, 실전 사용 시나리오, 그리고 자주 발생하는 문제의 해결 방법을 순서대로 다룹니다.'));
body.push(h2('1.1 대상 독자'));
body.push(bullet('Oracle 데이터베이스의 SQL 성능을 진단·튜닝하는 DBA'));
body.push(bullet('느린 SQL을 작성·개선해야 하는 애플리케이션 개발자'));
body.push(bullet('운영 중인 쿼리의 인덱스 적정성을 점검하려는 운영 담당자'));
body.push(h2('1.2 두 메뉴 한눈에 보기'));
body.push(table([2200, 3580, 3580], [
  ['구분', 'AI 튜닝 가이드', 'Query Artifacts'],
  ['메뉴 경로', '분석 › AI 튜닝 가이드\n(/analysis/ai-tuning-guide)', '분석 › Query Artifacts\n(/analysis/query-artifacts)'],
  ['핵심 가치', 'LLM(생성형 AI) 기반의 자연어 튜닝 진단·설명·대화형 후속 질문', '규칙 기반 정적 분석으로 인덱스 생성도를 시각화하고 DDL·힌트 제안'],
  ['결과 형태', '스트리밍 텍스트(설명·권장사항) + 대화', '다이어그램 + 권장사항 + 접근 경로 + 힌트(탭)'],
  ['DB 연결', '선택(있으면 메타데이터 자동 반영)', '권장(통계·기존 인덱스 조회에 사용)'],
  ['적합한 상황', '"왜 느린지", "어떻게 고치는지"를 이해·상담', '"어떤 인덱스를 만들지"를 빠르고 명확하게 판단'],
]));
body.push(note('두 기능은 상호 보완적입니다. Query Artifacts로 인덱스 구조를 객관적으로 진단한 뒤, AI 튜닝 가이드로 배경 설명과 추가 질문을 이어가는 사용 흐름을 권장합니다.', ACCENT, '활용 팁'));

// 2. 공통 사항
body.push(h1('2. 공통 사항 (두 메뉴 공통)'));
body.push(h2('2.1 데이터베이스 연결 선택'));
body.push(p('두 메뉴 모두 화면 상단 네비게이션에서 선택한 데이터베이스 연결을 기준으로 동작합니다. 연결을 선택하지 않으면 SQL_ID 자동 조회, 통계·기존 인덱스 반영 등 DB 연동 기능이 비활성화되며, 안내 메시지가 표시됩니다.'));
body.push(bullet('연결 미선택 시: "데이터베이스 연결을 먼저 선택하세요" 안내가 표시됩니다.'));
body.push(bullet('SQL을 직접 붙여넣어 분석하는 것은 연결 없이도 일부 가능하지만, 실제 인덱스·통계 반영은 연결이 있어야 정확합니다.'));
body.push(h2('2.2 SQL_ID로 조회 (V$SQL 연동)'));
body.push(p('두 메뉴 모두 SQL 원문을 직접 입력하는 대신, 운영 DB의 SQL_ID만으로 분석 대상을 불러올 수 있습니다. 입력한 SQL_ID로 데이터 딕셔너리 뷰 V$SQL을 조회하여 SQL 전문(SQL_FULLTEXT)을 가져옵니다.'));
body.push(table([3000, 6360], [
  ['항목', '설명'],
  ['입력 예시', '0w2qpuc6u2zsp (13자리 SQL_ID)'],
  ['조회 소스', 'V$SQL 뷰 (sql_id 기준, 최초 1건)'],
  ['AI 튜닝 가이드', 'SQL 전문 + 실행계획 + 성능 메트릭(실행횟수·경과·CPU·Buffer Gets·Disk Reads·처리행수)을 함께 자동 입력'],
  ['Query Artifacts', 'SQL 전문을 자동 입력 (이후 정적 분석 수행)'],
]));
body.push(note('SQL_ID 조회가 성공하면 자동으로 "SQL 직접 입력" 탭으로 전환되어 불러온 내용을 확인·수정할 수 있습니다. CLOB 읽기 특성상 조회에 최대 30초가 소요될 수 있습니다.', GREY, '동작'));

// 3. AI 튜닝 가이드
body.push(new Paragraph({ children: [new PageBreak()] }));
body.push(h1('3. AI 튜닝 가이드'));
body.push(p('AI 튜닝 가이드는 생성형 AI(LLM)를 활용해 SQL을 분석하고, 성능 튜닝 방안·실행계획 설명·인덱스 권장·SQL 재작성을 자연어로 제공하는 기능입니다. 분석 결과에 이어 대화형으로 추가 질문을 할 수 있어, 단순 진단을 넘어 "상담"에 가까운 경험을 제공합니다.'));

body.push(h2('3.1 화면 구성'));
body.push(p('화면은 좌측 입력/결과 영역(2/3)과 우측 제어 패널(1/3)로 구성됩니다.'));
body.push(table([3000, 6360], [
  ['영역', '구성 요소'],
  ['상단 헤더', '제목, LLM 모델 상태 배지(모델명·응답지연 ms), 재연결 버튼'],
  ['좌측 패널', '입력 모드 탭(SQL_ID/직접 입력), SQL 입력란, 실행계획(선택), 성능 메트릭(선택), AI 분석 결과 및 추가 질문 대화'],
  ['우측 패널', '분석 유형 선택, 응답 언어, [AI 분석 시작] 버튼, 최근 분석 기록, 분석 팁'],
]));

body.push(h2('3.2 LLM 서버 상태 확인'));
body.push(p('페이지 진입 시 자동으로 LLM 서버의 상태를 점검합니다. 정상이면 헤더에 초록색 모델 배지가 표시되고, 연결 불가 시 상단에 경고 배너와 함께 [재연결] 버튼이 나타납니다.'));
body.push(bullet('정상: 모델명과 응답 지연(ms)이 배지로 표시됩니다.'));
body.push(bullet('연결 불가: "LLM 서버 연결 불가" 배너가 표시되며 AI 분석을 사용할 수 없습니다. 새로고침 버튼으로 재점검합니다.'));
body.push(note('운영 환경의 기본 분석 모델은 Ollama 기반 Qwen2.5 7B입니다(설치 환경에 따라 다를 수 있음). 모델은 로컬에서 구동되므로 분석 데이터가 외부로 전송되지 않습니다.', ACCENT2, '보안'));

body.push(h2('3.3 분석 대상 입력'));
body.push(h3('3.3.1 SQL_ID로 조회'));
body.push(num('상단 네비게이션에서 데이터베이스 연결을 선택합니다.'));
body.push(num('"SQL_ID로 조회" 탭에서 SQL_ID를 입력하고 [조회]를 클릭합니다.'));
body.push(num('SQL 전문, 실행계획, 성능 메트릭이 자동으로 채워지고 "SQL 직접 입력" 탭으로 전환됩니다.'));
body.push(h3('3.3.2 SQL 직접 입력'));
body.push(p('"SQL 직접 입력" 탭을 선택하고 분석할 SQL을 텍스트 영역에 붙여넣습니다. 입력한 SQL은 복사(Copy) 및 전체 초기화(휴지통) 버튼으로 관리할 수 있습니다.'));

body.push(h2('3.4 선택 입력 — 실행계획과 성능 메트릭'));
body.push(p('필수는 아니지만, 함께 제공하면 분석 정확도가 높아집니다.'));
body.push(h3('3.4.1 실행계획 (선택)'));
body.push(p('DBMS_XPLAN 출력 등 실행계획 텍스트를 붙여넣으면 AI가 실제 접근 경로를 근거로 더 구체적으로 진단합니다. SQL_ID 조회 시 실행계획이 있으면 자동 입력되고 해당 섹션이 펼쳐집니다.'));
body.push(h3('3.4.2 성능 메트릭 (선택)'));
body.push(p('V$SQL 통계를 입력하면 비용 관점의 분석이 가능합니다. 입력 가능한 항목은 다음과 같습니다.'));
body.push(table([3120, 3120, 3120], [
  ['항목', '항목', '항목'],
  ['실행 횟수(executions)', '총 경과시간(ms)', 'CPU 시간(ms)'],
  ['Buffer Gets', 'Disk Reads', '처리 행수(rows)'],
]));
body.push(note('성능 메트릭은 "실행 횟수"가 1 이상일 때만 분석 요청에 포함됩니다. SQL_ID로 조회하면 이 값들이 자동 입력됩니다.', GREY, '동작'));

body.push(h2('3.5 분석 유형 선택'));
body.push(p('우측 패널에서 4가지 분석 유형 중 하나를 선택합니다. 유형에 따라 AI 응답의 형식과 초점이 달라집니다.'));
body.push(table([2400, 3000, 3960], [
  ['유형', '초점', '설명'],
  ['성능 튜닝', '최적화 권장', 'SQL 성능을 분석하고 구체적인 최적화 권장사항을 제시'],
  ['실행계획 설명', '이해', 'SQL과 실행계획을 이해하기 쉽게 풀어서 설명'],
  ['인덱스 권장', '인덱스 설계', '필요한 인덱스를 설계하고 CREATE INDEX DDL을 생성'],
  ['SQL 재작성', '쿼리 개선', '더 효율적인 형태로 SQL을 재작성하여 제안'],
]));

body.push(h2('3.6 응답 언어'));
body.push(p('응답 언어는 한국어 또는 English 중에서 선택할 수 있습니다. 시스템 프롬프트와 결과 설명이 선택한 언어로 생성됩니다.'));

body.push(h2('3.7 분석 실행 및 결과'));
body.push(num('대상 SQL과 옵션을 설정한 뒤 우측 [AI 분석 시작]을 클릭합니다.'));
body.push(num('결과는 실시간 스트리밍(타이핑 방식)으로 좌측 "AI 분석 결과" 카드에 표시됩니다.'));
body.push(num('결과는 복사 및 파일 내보내기(export)가 가능합니다. 파일명은 분석 유형 기준으로 생성됩니다(예: sql-analysis-tuning).'));
body.push(note('분석이 끝나면 리소스 절약을 위해 LLM 모델이 자동으로 언로드(stop)됩니다. 다음 분석 시 모델 로딩으로 첫 응답이 다소 늦을 수 있습니다.', GREY, '동작'));

body.push(h2('3.8 추가 질문 (대화형 후속 분석)'));
body.push(p('분석이 완료되면 결과 하단에 추가 질문 입력란이 나타납니다. AI가 직전까지의 대화 맥락(분석 대상 SQL·실행계획 포함)을 기억하므로, 자연스럽게 후속 질문을 이어갈 수 있습니다.'));
body.push(bullet('예: "인덱스를 추가하면 어떻게 될까요?"'));
body.push(bullet('예: "이 조인을 해시 조인으로 바꾸면 어떤 영향이 있나요?"'));
body.push(p('사용자와 AI의 대화는 말풍선 형태로 누적 표시되며, Enter 키로 전송할 수 있습니다.'));

body.push(h2('3.9 내부 동작 원리 (정확도를 높이는 메타데이터 주입)'));
body.push(p('데이터베이스 연결이 선택된 상태에서 SQL을 분석하면, TMS는 단순히 SQL 텍스트만 AI에 전달하지 않습니다. 다음 정보를 실시간으로 조회하여 프롬프트에 함께 주입함으로써, 일반적인 AI보다 현실에 부합하는 권장을 만들어 냅니다.'));
body.push(table([3200, 6160], [
  ['주입 정보', '효과'],
  ['기존 인덱스 목록', 'SQL에 사용된 테이블의 실제 인덱스를 조회하여, 이미 존재하는 인덱스에 대한 중복 CREATE INDEX 권장을 방지'],
  ['테이블 행 수(통계)', '각 테이블의 실제 행 수를 비교하여 조인 순서·방향(드라이빙 테이블, LEADING 힌트)을 현실적으로 권장'],
]));
body.push(note('이 메타데이터 주입은 최초 분석 시(연결 선택 + 후속 질문이 아닐 때)에 수행됩니다. 따라서 가능하면 DB 연결을 선택한 상태로 분석하는 것을 권장합니다.', ACCENT, '권장'));

body.push(h2('3.10 분석 기록'));
body.push(p('최근 분석 내역은 브라우저에 자동 저장되어 우측 "최근 분석 기록"에서 다시 불러올 수 있습니다(최대 20건). 항목을 클릭하면 SQL과 분석 유형이 입력란에 복원됩니다. [기록 삭제]로 전체 삭제가 가능합니다.'));
body.push(note('분석 기록은 사용 중인 브라우저에만 저장됩니다(로컬 저장). 다른 PC·브라우저에서는 공유되지 않습니다.', GREY, '참고'));

body.push(h2('3.11 사용 시나리오 예시'));
body.push(p('운영 중 특정 SQL이 갑자기 느려졌을 때:'));
body.push(num('AWR/Top SQL 등에서 문제 SQL_ID를 확보합니다.'));
body.push(num('DB 연결을 선택하고 SQL_ID로 조회하여 SQL·실행계획·메트릭을 불러옵니다.'));
body.push(num('분석 유형을 "성능 튜닝"으로 두고 [AI 분석 시작]을 클릭합니다.'));
body.push(num('결과를 검토한 뒤 "인덱스 권장" 유형으로 다시 분석하거나, 추가 질문으로 세부 사항을 확인합니다.'));
body.push(num('제시된 DDL/재작성안은 반드시 실행계획으로 검증 후 적용합니다.'));

// 4. Query Artifacts
body.push(new Paragraph({ children: [new PageBreak()] }));
body.push(h1('4. Query Artifacts (인덱스 생성도)'));
body.push(p('Query Artifacts는 SQL을 구문 분석(파싱)하여 「인덱스 생성도」를 시각화하고, 인덱스 적정성과 최적화 방안을 규칙 기반으로 제안하는 기능입니다. AI에 의존하지 않는 결정적(deterministic) 분석이므로 결과가 일관되며, 인덱스 설계 의사결정을 빠르고 명확하게 지원합니다.'));
body.push(note('인덱스 생성도는 이병국 「개발자를 위한 인덱스 생성과 SQL 작성 노하우」(2018)의 방법론에 기반합니다.', GREY, '근거'));

body.push(h2('4.1 화면 구성'));
body.push(table([3000, 6360], [
  ['영역', '구성 요소'],
  ['상단 헤더', '제목, 선택된 DB 연결 배지, "인덱스 생성도 기반 분석" 배지'],
  ['좌측 패널', 'SQL 입력 카드(입력 모드 탭, SQL 입력란, 분석 옵션, [분석 시작]), 테이블 상세 패널'],
  ['우측 패널', '요약 바(Summary), 결과 탭(인덱스 생성도/권장사항/접근 경로/힌트 제안)'],
]));

body.push(h2('4.2 분석 대상 입력'));
body.push(p('AI 튜닝 가이드와 동일하게 두 가지 입력 방식을 제공합니다.'));
body.push(bullet('SQL_ID로 조회: DB 연결 선택 후 SQL_ID 입력 → [조회](또는 Enter)로 V$SQL에서 SQL 전문 자동 입력'));
body.push(bullet('직접 입력: SQL을 텍스트 영역에 붙여넣기'));
body.push(note('Query Artifacts는 SELECT 문을 대상으로 분석합니다. 지원하지 않는 구문이거나 SELECT가 아닐 경우 오류 메시지가 표시됩니다.', ACCENT2, '제약'));

body.push(h2('4.3 분석 옵션'));
body.push(p('[분석 시작] 전에 좌측 하단의 3가지 스위치로 분석 범위를 조정합니다.'));
body.push(table([2600, 2000, 4760], [
  ['옵션', '기본값', '설명'],
  ['통계 정보 조회', '켜짐', '선택한 DB에서 컬럼/테이블 통계를 조회하여 분석에 반영(연결 필요)'],
  ['권장사항 생성', '켜짐', '인덱스 생성 등 튜닝 권장사항 목록을 생성'],
  ['힌트 제안', '꺼짐', 'LEADING, USE_NL 등 Oracle 옵티마이저 힌트를 생성하여 "힌트 제안" 탭 노출'],
]));

body.push(h2('4.4 요약 바 (Summary)'));
body.push(p('분석이 완료되면 결과 상단에 핵심 지표가 요약됩니다.'));
body.push(table([3120, 6240], [
  ['지표', '의미'],
  ['테이블', 'SQL에서 사용된 테이블 수'],
  ['조인', '테이블 간 조인 관계 수'],
  ['기존 인덱스', '조건 컬럼에 이미 존재하는 인덱스 수'],
  ['누락 인덱스', '인덱스 생성이 권장되는(없는) 지점 수'],
  ['Health Score', '쿼리의 인덱스 건전성 점수(0~100%). 80 이상 양호, 50~79 보통, 50 미만 주의'],
]));

body.push(h2('4.5 결과 탭'));
body.push(h3('4.5.1 인덱스 생성도'));
body.push(p('테이블을 원으로, 조인 관계를 선으로 표현한 다이어그램입니다. 좌→우 순서로 권장 접근 순서를 보여줍니다. 다이어그램 하단에는 "읽는 법" 가이드가 항상 제공됩니다.'));
body.push(bullet([new TextRun({ text: '원(테이블): ', bold: true }), new TextRun('SQL에서 사용된 테이블. 왼쪽에서 오른쪽으로 접근 순서를 나타냅니다.')]));
body.push(bullet([new TextRun({ text: '실선: ', bold: true }), new TextRun('INNER JOIN 관계')]));
body.push(bullet([new TextRun({ text: '점선: ', bold: true }), new TextRun('OUTER JOIN 관계')]));
body.push(bullet([new TextRun({ text: '연결선 위 텍스트: ', bold: true }), new TextRun('조인에 사용된 컬럼명')]));
body.push(p('테이블 위의 번호는 WHERE·JOIN·ORDER BY·GROUP BY 조건에 사용된 컬럼의 순번이며, 색으로 인덱스 상태를 구분합니다.'));
body.push(bullet([new TextRun({ text: '파란색 원 번호: ', bold: true, color: '2563EB' }), new TextRun('해당 컬럼에 인덱스가 이미 존재함')]));
body.push(bullet([new TextRun({ text: '빨간색 테두리 번호: ', bold: true, color: 'EF4444' }), new TextRun('인덱스가 없어 생성을 권장함')]));
body.push(p('범례(빈 화면 상태): 초록=인덱스 있음, 노랑=인덱스 권장, 빨강=인덱스 필요.'));

body.push(h3('4.5.2 테이블 상세 패널'));
body.push(p('다이어그램에서 테이블 원을 클릭하면 좌측 하단 "테이블 상세 패널"에 해당 테이블의 컬럼·기존 인덱스 등 상세 정보가 표시됩니다.'));

body.push(h3('4.5.3 권장사항'));
body.push(p('인덱스 생성 등 튜닝 권장 목록을 우선순위와 함께 제공합니다. 각 항목은 제목·근거·적용 DDL·기대 효과·위험도를 포함할 수 있습니다.'));
body.push(table([3120, 6240], [
  ['우선순위', '의미'],
  ['CRITICAL', '성능에 심각한 영향, 최우선 조치 권장'],
  ['HIGH', '높은 개선 효과 기대'],
  ['MEDIUM', '상황에 따라 개선 효과'],
  ['LOW', '선택적 개선 사항'],
]));
body.push(p('권장 유형에는 인덱스 생성(CREATE INDEX), 인덱스 삭제/변경, 힌트 추가, SQL 재작성, 통계 수집(GATHER_STATS) 등이 있습니다.'));

body.push(h3('4.5.4 접근 경로'));
body.push(p('옵티마이저 관점에서 권장되는 테이블 접근 순서(진입 컬럼·조인 컬럼 포함)를 단계별로 보여줍니다. 드라이빙 테이블 선정과 조인 순서 검토에 활용합니다.'));

body.push(h3('4.5.5 힌트 제안'));
body.push(p('"힌트 제안" 옵션을 켜면 Oracle 옵티마이저 힌트가 코드 블록으로 제공되며, 복사 버튼과 적용 예시(SELECT 키워드 바로 뒤 삽입)가 함께 표시됩니다.'));
body.push(bullet([new TextRun({ text: 'LEADING: ', bold: true }), new TextRun('테이블 접근(조인) 순서를 지정. 조건으로 가장 많이 필터링되는 테이블을 선행으로 두는 것이 유리합니다.')]));
body.push(bullet([new TextRun({ text: 'USE_NL: ', bold: true }), new TextRun('후행 테이블에 Nested Loops Join 사용을 지정. 인덱스가 있고 처리 행이 적은 OLTP 환경에 효과적입니다.')]));
body.push(note('힌트는 옵티마이저에 대한 제안일 뿐 반드시 적용되지 않습니다. 적용 후에는 EXPLAIN PLAN으로 반영 여부를 반드시 확인하고, 데이터 분포 변화 시 최적 힌트가 달라질 수 있음에 유의하세요.', ACCENT2, '주의'));

body.push(h2('4.6 내부 동작 원리'));
body.push(p('Query Artifacts는 다음 파이프라인으로 동작합니다.'));
body.push(num('SQL 파싱: 정규식 기반 파서가 테이블·컬럼·조인·ORDER BY·GROUP BY를 추출합니다.'));
body.push(num('메타데이터 조회: 선택한 Oracle 연결에서 기존 인덱스와 컬럼/테이블 통계를 조회합니다.'));
body.push(num('인덱스 분석: 컬럼의 선택도(분포도)와 사용 패턴을 평가하여 인덱스 후보·우선순위·접근 순서를 산출합니다.'));
body.push(num('결과 생성: 인덱스 생성도, 권장사항, 접근 경로, (옵션) 힌트, 요약 지표를 만들어 화면에 표시합니다.'));

body.push(h2('4.7 사용 시나리오 예시'));
body.push(num('개선 대상 SELECT를 직접 입력하거나 SQL_ID로 불러옵니다.'));
body.push(num('통계·권장사항 옵션을 켜고(필요 시 힌트 옵션도 켜고) [분석 시작]을 클릭합니다.'));
body.push(num('요약 바의 Health Score와 누락 인덱스 수로 전체 상태를 파악합니다.'));
body.push(num('인덱스 생성도에서 빨간 테두리 번호(인덱스 미존재) 컬럼을 확인합니다.'));
body.push(num('"권장사항" 탭의 DDL을 검토하고, 조인 컬럼은 양쪽 테이블 모두 인덱스가 있는지 확인합니다.'));
body.push(num('필요 시 "힌트 제안"을 적용하고 EXPLAIN PLAN으로 검증합니다.'));

// 5. 비교 및 권장 흐름
body.push(new Paragraph({ children: [new PageBreak()] }));
body.push(h1('5. 언제 무엇을 사용할까'));
body.push(table([3000, 6360], [
  ['상황', '권장 메뉴'],
  ['인덱스를 만들지 말지 빠르고 명확히 판단하고 싶다', 'Query Artifacts'],
  ['왜 느린지/어떻게 고치는지 설명과 상담이 필요하다', 'AI 튜닝 가이드'],
  ['SQL 재작성안을 자연어 설명과 함께 받고 싶다', 'AI 튜닝 가이드 (SQL 재작성)'],
  ['조인 순서·드라이빙 테이블을 객관적으로 점검한다', 'Query Artifacts (접근 경로/힌트)'],
  ['일관되고 재현 가능한 정적 진단이 필요하다', 'Query Artifacts'],
]));
body.push(p('권장 흐름: Query Artifacts로 인덱스·접근 경로를 객관적으로 진단 → 의문점이나 배경 설명이 필요하면 AI 튜닝 가이드에서 동일 SQL로 추가 분석 및 후속 질문.'));

// 6. 문제 해결
body.push(h1('6. 문제 해결 (FAQ)'));
body.push(table([3400, 5960], [
  ['증상', '확인 및 조치'],
  ['SQL_ID 조회가 실패한다', 'DB 연결 선택 여부 확인, SQL_ID 정확성 확인. 해당 SQL이 V$SQL에서 이미 밀려났을(aged out) 수 있음 → SQL 직접 입력으로 대체'],
  ['"데이터베이스 연결을 먼저 선택하세요"', '상단 네비게이션에서 분석 대상 DB 연결을 선택'],
  ['AI 튜닝 가이드: "LLM 서버 연결 불가"', 'LLM(Ollama) 서버 구동 여부 확인 후 [재연결] 클릭. 기능 비활성화(503) 시 관리자에게 문의'],
  ['AI 첫 응답이 느리다', '직전 분석 후 모델이 언로드되어 재로딩 중일 수 있음(정상). 잠시 대기'],
  ['Query Artifacts: "지원하지 않는 SQL"', 'SELECT 문인지 확인. 매우 복잡하거나 비표준 구문은 파싱이 제한될 수 있음'],
  ['이미 있는 인덱스를 또 만들라고 한다', 'DB 연결을 선택한 상태로 분석하면 기존 인덱스가 반영되어 중복 권장이 방지됨'],
  ['분석 기록이 안 보인다', '기록은 브라우저 로컬에 저장됨. 동일 PC·브라우저에서만 표시'],
]));

// 7. 부록
body.push(h1('7. 부록: 용어 정리'));
body.push(table([2600, 6760], [
  ['용어', '설명'],
  ['SQL_ID', 'Oracle이 SQL에 부여하는 고유 식별자. V$SQL 등에서 SQL을 식별'],
  ['V$SQL', '공유 풀에 적재된 SQL과 실행 통계를 담는 동적 성능 뷰'],
  ['선택도/분포도', '특정 조건이 전체 행에서 얼마나 적은 행을 추출하는지의 척도. 낮을수록 인덱스 효율이 높음'],
  ['드라이빙 테이블', '조인에서 먼저 접근하는(선행) 테이블. 적은 결과 집합일수록 유리'],
  ['LEADING/USE_NL', '각각 조인 순서, Nested Loops 조인 방식을 지정하는 옵티마이저 힌트'],
  ['Health Score', 'Query Artifacts가 산출하는 쿼리 인덱스 건전성 종합 점수(0~100%)'],
  ['스트리밍 응답(SSE)', 'AI 응답을 생성되는 즉시 조금씩 전송·표시하는 방식'],
]));
body.push(spacer());
body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240 },
  children: [new TextRun({ text: '— 문서 끝 —', color: GREY })] }));

// ---------- assemble ----------
const doc = new Document({
  creator: '주식회사 나래정보기술',
  title: 'Narae TMS 2.0 사용 매뉴얼',
  styles: {
    default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 34, bold: true, font: FONT, color: ACCENT },
        paragraph: { spacing: { before: 320, after: 200 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ACCENT, space: 4 } } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 27, bold: true, font: FONT, color: '1E293B' },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { size: 23, bold: true, font: FONT, color: ACCENT2 },
        paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: 'bullets', levels: [
        { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 280 } } } },
        { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1020, hanging: 280 } } } },
      ] },
      { reference: 'steps', levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 300 } } } },
      ] },
    ],
  },
  sections: [
    // cover (no header/footer)
    { properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children: cover },
    // toc + body
    { properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      headers: { default: new Header({ children: [ new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1', space: 2 } },
        children: [
          new TextRun({ text: 'Narae TMS 2.0 사용 매뉴얼', size: 16, color: GREY }),
          new TextRun({ text: '\tAI 튜닝 가이드 · Query Artifacts', size: 16, color: GREY }),
        ],
        tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      }) ] }) },
      footers: { default: new Footer({ children: [ new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1', space: 2 } },
        children: [
          new TextRun({ text: '주식회사 나래정보기술  |  ', size: 16, color: GREY }),
          new TextRun({ text: '', size: 16, color: GREY }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY }),
          new TextRun({ text: ' / ', size: 16, color: GREY }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: GREY }),
        ],
      }) ] }) },
      children: [...toc, ...body] },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync('/sessions/amazing-vibrant-brahmagupta/mnt/outputs/Narae_TMS_2.0_사용매뉴얼.docx', buf);
  console.log('written', buf.length, 'bytes');
});
