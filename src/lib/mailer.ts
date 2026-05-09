// SMTP(nodemailer) 기반 이메일 전송 헬퍼 — 랜딩 뉴스레터 구독 알림에서 사용

import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';

let cached: Transporter | null = null;

export function getMailer(): Transporter {
  if (cached) return cached;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) {
    throw new Error(
      'SMTP가 설정되지 않았습니다. .env.local의 SMTP_HOST/SMTP_USER/SMTP_PASSWORD를 확인하세요.',
    );
  }

  cached = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return cached;
}

export const mailFrom = () =>
  process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@naraeit.co.kr';
