// 랜딩페이지 "제품 소식 받아보기" 구독 요청을 받아 운영자 메일로 알림 전송

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getMailer, mailFrom } from '@/lib/mailer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({
  email: z.string().email('유효한 이메일 주소가 아닙니다.'),
});

const NEWSLETTER_TO = process.env.NEWSLETTER_TO || 'sijung@naraeit.co.kr';

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' },
      { status: 400 },
    );
  }

  const { email } = parsed.data;
  const ua = request.headers.get('user-agent') ?? 'unknown';
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const submittedAt = new Date().toISOString();

  try {
    const mailer = getMailer();
    await mailer.sendMail({
      from: mailFrom(),
      to: NEWSLETTER_TO,
      replyTo: email,
      subject: `[Narae TMS] 새 뉴스레터 구독 요청 — ${email}`,
      text: [
        '새로운 뉴스레터 구독 요청이 접수되었습니다.',
        '',
        `이메일: ${email}`,
        `요청 시각: ${submittedAt}`,
        `요청 IP: ${ip}`,
        `User-Agent: ${ua}`,
      ].join('\n'),
      html: `
        <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
          <h2 style="margin:0 0 16px;font-size:18px">새 뉴스레터 구독 요청</h2>
          <p style="margin:0 0 12px;color:#334155">Narae TMS 랜딩페이지에서 구독 요청이 접수되었습니다.</p>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:8px 0;color:#64748b;width:120px">이메일</td><td style="padding:8px 0"><a href="mailto:${email}">${email}</a></td></tr>
            <tr><td style="padding:8px 0;color:#64748b">요청 시각</td><td style="padding:8px 0">${submittedAt}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b">요청 IP</td><td style="padding:8px 0">${ip}</td></tr>
            <tr><td style="padding:8px 0;color:#64748b;vertical-align:top">User-Agent</td><td style="padding:8px 0;word-break:break-all">${ua}</td></tr>
          </table>
        </div>
      `,
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    const message = error instanceof Error ? error.message : String(error);
    console.error('[newsletter] sendMail failed:', { code, message });

    if (code === 'EAUTH') {
      return NextResponse.json(
        {
          error:
            '메일 발송 계정 인증에 실패했습니다. 관리자에게 문의해 주세요. (SMTP 인증 오류)',
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: '구독 요청 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
