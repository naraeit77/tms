// 회원가입 완료 환영 메일 — Narae TMS 2.0

import 'server-only';
import { getMailer, mailFrom } from '@/lib/mailer';

interface WelcomeEmailParams {
  email: string;
  fullName: string | null;
  trialExpiresAt: Date;
}

function formatKoreanDate(d: Date): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Seoul',
  }).format(d);
}

function buildSigninUrl(): string {
  const base = (process.env.NEXTAUTH_URL || 'https://sqltms.info').replace(/\/$/, '');
  return `${base}/auth/signin`;
}

/**
 * 신규 가입자에게 환영 메일을 보낸다. 발송 실패는 throw — 호출 측에서 try/catch.
 */
export async function sendWelcomeEmail({ email, fullName, trialExpiresAt }: WelcomeEmailParams): Promise<void> {
  const mailer = getMailer();
  const greeting = fullName ? `${fullName}님,` : '안녕하세요,';
  const signinUrl = buildSigninUrl();
  const expiresLabel = formatKoreanDate(trialExpiresAt);

  const text = [
    `${greeting}`,
    '',
    'Narae TMS 2.0에 가입해 주셔서 감사합니다.',
    '회원가입이 정상적으로 완료되었습니다.',
    '',
    `▸ 가입 이메일: ${email}`,
    `▸ 무료 체험 기간: ${expiresLabel}까지 (30일)`,
    '',
    '아래 링크에서 바로 로그인해 사용하실 수 있습니다.',
    signinUrl,
    '',
    '체험 기간 동안 다음 기능을 자유롭게 이용해 보세요.',
    '  · 실시간 SQL 모니터링',
    '  · Top SQL 자동 분석 및 튜닝 권고',
    '  · 실행계획 비교 (DBMS_XPLAN)',
    '  · 본인 전용 Oracle 연결 관리 (다른 사용자와 격리)',
    '',
    '문의가 있으시면 sijung@naraeit.co.kr 로 회신해 주세요.',
    '',
    '— 주식회사 나래정보기술',
  ].join('\n');

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Apple SD Gothic Neo','Noto Sans KR',sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a;background:#ffffff">
      <div style="text-align:center;padding:24px 0;border-bottom:1px solid #e2e8f0">
        <div style="display:inline-block;padding:10px 16px;background:linear-gradient(135deg,#2563eb,#7c3aed);border-radius:12px;color:#ffffff;font-weight:700;font-size:18px;letter-spacing:.3px">
          Narae TMS 2.0
        </div>
        <p style="margin:12px 0 0;color:#64748b;font-size:13px">SQL Tuning Management System</p>
      </div>

      <h1 style="font-size:22px;margin:32px 0 8px;color:#0f172a">가입을 환영합니다 🎉</h1>
      <p style="margin:0 0 20px;color:#475569;line-height:1.7">
        ${greeting}<br/>
        Narae TMS 2.0에 가입해 주셔서 감사합니다. 회원가입이 정상적으로 완료되었습니다.
      </p>

      <table style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin:24px 0">
        <tr>
          <td style="padding:14px 18px;color:#64748b;font-size:13px;width:140px;border-bottom:1px solid #e2e8f0">가입 이메일</td>
          <td style="padding:14px 18px;font-weight:600;border-bottom:1px solid #e2e8f0">${email}</td>
        </tr>
        <tr>
          <td style="padding:14px 18px;color:#64748b;font-size:13px">무료 체험 기간</td>
          <td style="padding:14px 18px;font-weight:600;color:#7c3aed">${expiresLabel}까지 · 30일</td>
        </tr>
      </table>

      <div style="text-align:center;margin:28px 0">
        <a href="${signinUrl}"
           style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px">
          지금 로그인하기 →
        </a>
        <p style="margin:10px 0 0;color:#94a3b8;font-size:12px">${signinUrl}</p>
      </div>

      <div style="margin:32px 0;padding:20px;background:#f1f5f9;border-radius:12px">
        <h3 style="margin:0 0 12px;font-size:14px;color:#0f172a">체험 기간 동안 이런 기능을 써보세요</h3>
        <ul style="margin:0;padding-left:20px;color:#475569;line-height:1.8;font-size:14px">
          <li>실시간 SQL 모니터링 · 세션/락/Wait Event 추적</li>
          <li>Top SQL 자동 분석 및 튜닝 권고</li>
          <li>실행계획 비교 (DBMS_XPLAN, AWR, SQL Tuning Set)</li>
          <li>본인 전용 Oracle 연결 관리 (다른 사용자와 완전 격리)</li>
        </ul>
      </div>

      <p style="margin:28px 0 0;color:#64748b;font-size:13px;line-height:1.7">
        문의가 있으시면 이 메일에 회신하시거나 <a href="mailto:sijung@naraeit.co.kr" style="color:#2563eb;text-decoration:none">sijung@naraeit.co.kr</a> 로 연락 주세요.
      </p>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0 16px"/>
      <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center">
        © ${new Date().getFullYear()} 주식회사 나래정보기술 · Narae TMS 2.0
      </p>
    </div>
  `.trim();

  await mailer.sendMail({
    from: mailFrom(),
    to: email,
    subject: '[Narae TMS] 가입을 환영합니다 — 무료 체험이 시작됐어요',
    text,
    html,
  });
}
