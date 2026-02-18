/**
 * SQL Tuning Advisor Page E2E Test
 * Playwright를 사용하여 테스트
 */

import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';
const TEST_URL = `${BASE_URL}/advisor/sql-tuning`;
const SIGNIN_URL = `${BASE_URL}/auth/signin`;

// 테스트 결과 저장
const testResults = {
  passed: [],
  failed: [],
  warnings: [],
  skipped: [],
  startTime: new Date(),
  endTime: null,
};

function log(type, message, details = null) {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '📋',
    pass: '✅',
    fail: '❌',
    warn: '⚠️',
    step: '▶️',
    skip: '⏭️',
  }[type] || '•';

  console.log(`${prefix} [${timestamp}] ${message}`);
  if (details) {
    console.log('   Details:', typeof details === 'string' ? details : JSON.stringify(details, null, 2));
  }

  if (type === 'pass') testResults.passed.push({ message, details, timestamp });
  if (type === 'fail') testResults.failed.push({ message, details, timestamp });
  if (type === 'warn') testResults.warnings.push({ message, details, timestamp });
  if (type === 'skip') testResults.skipped.push({ message, details, timestamp });
}

async function testLoginPage(page) {
  log('step', '=== 로그인 페이지 테스트 ===');

  await page.goto(SIGNIN_URL, { waitUntil: 'networkidle', timeout: 30000 });

  // 테스트 1: 로그인 폼 요소 확인
  log('step', '테스트: 로그인 폼 요소 확인');

  const emailInput = await page.locator('input#email');
  const passwordInput = await page.locator('input#password');
  const submitButton = await page.locator('button[type="submit"]');

  if (await emailInput.isVisible() && await passwordInput.isVisible() && await submitButton.isVisible()) {
    log('pass', '로그인 폼 요소가 모두 표시됨');
  } else {
    log('fail', '로그인 폼 요소 일부가 누락됨');
  }

  // 테스트 2: 브랜딩 확인
  log('step', '테스트: 브랜딩 요소 확인');

  const branding = await page.locator('text=Narae TMS').first();
  if (await branding.isVisible()) {
    log('pass', '브랜딩 (Narae TMS) 표시됨');
  } else {
    log('fail', '브랜딩이 표시되지 않음');
  }

  // 테스트 3: 회원가입 링크 확인
  log('step', '테스트: 회원가입 링크 확인');

  const signupLink = await page.locator('a[href="/auth/signup"]');
  if (await signupLink.isVisible()) {
    log('pass', '회원가입 링크가 표시됨');
  } else {
    log('warn', '회원가입 링크를 찾을 수 없음');
  }

  // 테스트 4: 잘못된 로그인 시도
  log('step', '테스트: 잘못된 자격증명 처리');

  await emailInput.fill('invalid@test.com');
  await passwordInput.fill('wrongpassword');
  await submitButton.click();

  await page.waitForTimeout(2000);

  // 에러 메시지 또는 여전히 로그인 페이지에 있는지 확인
  const stillOnLoginPage = page.url().includes('/auth/signin');
  if (stillOnLoginPage) {
    log('pass', '잘못된 자격증명 시 로그인 페이지 유지됨');
  } else {
    log('fail', '잘못된 자격증명으로 로그인됨');
  }

  // 스크린샷 저장
  await page.screenshot({
    path: '/Users/nit/tms/test-screenshots/login-page.png',
    fullPage: true
  });
  log('pass', '로그인 페이지 스크린샷 저장됨');
}

async function testAPIEndpoints() {
  log('step', '=== API 엔드포인트 테스트 ===');

  // 테스트: SQL Tuning Tasks API (인증 없이)
  log('step', '테스트: SQL Tuning Tasks API 인증 확인');

  try {
    const response = await fetch(`${BASE_URL}/api/advisor/sql-tuning/tasks?connection_id=test`);
    const status = response.status;

    if (status === 401 || status === 403) {
      log('pass', 'API가 인증되지 않은 요청을 적절히 거부함', { status });
    } else if (status === 400) {
      log('pass', 'API가 잘못된 요청을 적절히 처리함', { status });
    } else {
      log('warn', 'API 응답 상태 확인 필요', { status });
    }
  } catch (error) {
    log('fail', 'API 호출 실패', { error: error.message });
  }

  // 테스트: 데이터베이스 연결 API
  log('step', '테스트: 데이터베이스 목록 API');

  try {
    const response = await fetch(`${BASE_URL}/api/databases`);
    const status = response.status;

    if (status === 200) {
      const data = await response.json();
      log('pass', '데이터베이스 목록 API 정상 응답', { count: data?.data?.length || 0 });
    } else if (status === 401) {
      log('pass', 'API가 인증 요구 중', { status });
    } else {
      log('warn', 'API 응답 확인 필요', { status });
    }
  } catch (error) {
    log('fail', 'API 호출 실패', { error: error.message });
  }
}

async function testPageAccessibility(page) {
  log('step', '=== 접근성 테스트 ===');

  await page.goto(SIGNIN_URL, { waitUntil: 'networkidle', timeout: 30000 });

  // 테스트: 키보드 탐색
  log('step', '테스트: 키보드 탐색 가능성');

  // Tab 키로 포커스 이동 테스트
  await page.keyboard.press('Tab');
  const focusedElement = await page.evaluate(() => document.activeElement?.tagName);

  if (focusedElement) {
    log('pass', '키보드 탐색으로 포커스 이동 가능', { focusedElement });
  } else {
    log('warn', '키보드 탐색 확인 필요');
  }

  // 테스트: 입력 필드 레이블
  log('step', '테스트: 입력 필드 레이블 존재');

  const emailLabel = await page.locator('label[for="email"]');
  const passwordLabel = await page.locator('label[for="password"]');

  const hasEmailLabel = await emailLabel.count() > 0;
  const hasPasswordLabel = await passwordLabel.count() > 0;

  if (hasEmailLabel && hasPasswordLabel) {
    log('pass', '모든 입력 필드에 레이블이 연결됨');
  } else {
    log('warn', '일부 입력 필드에 레이블이 없음', { hasEmailLabel, hasPasswordLabel });
  }

  // 테스트: 색상 대비 (기본 확인)
  log('step', '테스트: 기본 UI 요소 가시성');

  const buttons = await page.locator('button').all();
  let visibleButtonCount = 0;
  for (const button of buttons) {
    if (await button.isVisible()) {
      visibleButtonCount++;
    }
  }
  log('pass', `${visibleButtonCount}개의 버튼이 화면에 표시됨`);
}

async function testResponsiveDesign(page) {
  log('step', '=== 반응형 디자인 테스트 ===');

  await page.goto(SIGNIN_URL, { waitUntil: 'networkidle', timeout: 30000 });

  const viewports = [
    { name: 'Mobile', width: 375, height: 812 },
    { name: 'Tablet', width: 768, height: 1024 },
    { name: 'Desktop', width: 1920, height: 1080 },
  ];

  for (const viewport of viewports) {
    log('step', `테스트: ${viewport.name} 뷰포트 (${viewport.width}x${viewport.height})`);

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(500);

    // 주요 요소 가시성 확인
    const loginForm = await page.locator('form').first();
    const isFormVisible = await loginForm.isVisible();

    if (isFormVisible) {
      log('pass', `${viewport.name}: 로그인 폼이 정상 표시됨`);
    } else {
      log('fail', `${viewport.name}: 로그인 폼이 보이지 않음`);
    }

    // 스크린샷 저장
    await page.screenshot({
      path: `/Users/nit/tms/test-screenshots/responsive-${viewport.name.toLowerCase()}.png`,
      fullPage: true
    });
  }
}

async function testPerformance(page) {
  log('step', '=== 성능 테스트 ===');

  const startTime = Date.now();
  await page.goto(SIGNIN_URL, { waitUntil: 'load', timeout: 30000 });
  const loadTime = Date.now() - startTime;

  if (loadTime < 3000) {
    log('pass', `페이지 로드 시간: ${loadTime}ms (양호)`);
  } else if (loadTime < 5000) {
    log('warn', `페이지 로드 시간: ${loadTime}ms (보통)`);
  } else {
    log('fail', `페이지 로드 시간: ${loadTime}ms (느림)`);
  }

  // Core Web Vitals 측정 시도
  try {
    const metrics = await page.evaluate(() => {
      return new Promise((resolve) => {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          resolve({
            entries: entries.map(e => ({ name: e.name, value: e.startTime || e.duration }))
          });
        });
        observer.observe({ entryTypes: ['paint', 'largest-contentful-paint'] });

        // 타임아웃 후 현재까지의 결과 반환
        setTimeout(() => {
          const paintEntries = performance.getEntriesByType('paint');
          resolve({
            paint: paintEntries.map(e => ({ name: e.name, startTime: e.startTime }))
          });
        }, 2000);
      });
    });

    if (metrics.paint && metrics.paint.length > 0) {
      const fcp = metrics.paint.find(p => p.name === 'first-contentful-paint');
      if (fcp) {
        if (fcp.startTime < 1800) {
          log('pass', `First Contentful Paint: ${fcp.startTime.toFixed(0)}ms (양호)`);
        } else {
          log('warn', `First Contentful Paint: ${fcp.startTime.toFixed(0)}ms (개선 필요)`);
        }
      }
    }
  } catch {
    log('info', '성능 메트릭 수집 중 일부 오류 (무시 가능)');
  }
}

async function runTests() {
  log('info', '=== SQL Tuning Advisor 페이지 E2E 테스트 시작 ===');
  log('info', '(인증이 필요하여 로그인 페이지 및 공개 기능 테스트 진행)');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'ko-KR',
  });

  const page = await context.newPage();

  // 콘솔 에러 캡처
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('401')) {
      log('warn', `Console error: ${msg.text()}`);
    }
  });

  try {
    // 1. 로그인 페이지 테스트
    await testLoginPage(page);

    // 2. API 엔드포인트 테스트
    await testAPIEndpoints();

    // 3. 접근성 테스트
    await testPageAccessibility(page);

    // 4. 반응형 디자인 테스트
    await testResponsiveDesign(page);

    // 5. 성능 테스트
    await testPerformance(page);

    // 6. 인증 필요 페이지 접근 시도
    log('step', '=== 보호된 페이지 접근 테스트 ===');

    const protectedResponse = await page.goto(TEST_URL, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    const redirectedToLogin = page.url().includes('/auth/signin');
    if (redirectedToLogin) {
      log('pass', 'SQL Tuning Advisor 페이지가 인증을 요구함 (보안 정상)');
    } else {
      log('warn', '보호된 페이지에 인증 없이 접근 가능', { url: page.url() });
    }

  } catch (error) {
    log('fail', '테스트 실행 중 예외 발생', {
      error: error.message,
      stack: error.stack
    });
  } finally {
    await browser.close();
  }

  // ===== 테스트 결과 요약 =====
  testResults.endTime = new Date();
  const duration = (testResults.endTime - testResults.startTime) / 1000;

  console.log('\n' + '='.repeat(60));
  console.log('📊 테스트 결과 요약');
  console.log('='.repeat(60));
  console.log(`✅ 통과: ${testResults.passed.length}개`);
  console.log(`❌ 실패: ${testResults.failed.length}개`);
  console.log(`⚠️ 경고: ${testResults.warnings.length}개`);
  console.log(`⏭️ 스킵: ${testResults.skipped.length}개`);
  console.log(`⏱️ 실행 시간: ${duration.toFixed(2)}초`);
  console.log('='.repeat(60));

  if (testResults.failed.length > 0) {
    console.log('\n❌ 실패한 테스트:');
    testResults.failed.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f.message}`);
      if (f.details) console.log(`     Details: ${JSON.stringify(f.details)}`);
    });
  }

  if (testResults.warnings.length > 0) {
    console.log('\n⚠️ 경고:');
    testResults.warnings.forEach((w, i) => {
      console.log(`  ${i + 1}. ${w.message}`);
    });
  }

  // 테스트 결과를 JSON 파일로 저장
  const fs = await import('fs');
  await fs.promises.mkdir('/Users/nit/tms/test-screenshots', { recursive: true });
  await fs.promises.writeFile(
    '/Users/nit/tms/test-screenshots/sql-tuning-advisor-results.json',
    JSON.stringify(testResults, null, 2)
  );

  console.log('\n📁 테스트 결과가 test-screenshots/sql-tuning-advisor-results.json에 저장되었습니다.');
  console.log('📸 스크린샷이 test-screenshots/ 폴더에 저장되었습니다.');

  // 실패가 있으면 exit code 1
  process.exit(testResults.failed.length > 0 ? 1 : 0);
}

runTests().catch(console.error);
