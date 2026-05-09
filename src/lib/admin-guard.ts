// 관리자 전용 라우트/페이지에서 세션을 검사하는 가드

import 'server-only';
import { getServerSession, type Session } from 'next-auth';
import { authOptions } from '@/lib/auth';

export class AdminGuardError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message);
    this.name = 'AdminGuardError';
  }
}

/**
 * 호출자가 관리자(admin role)가 아니면 throw.
 * 라우트에서 catch 후 NextResponse.json({error}, {status})로 변환.
 */
export async function requireAdmin(): Promise<Session> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new AdminGuardError(401, 'Unauthorized');
  }
  if (session.user.role !== 'admin') {
    throw new AdminGuardError(403, 'Forbidden: admin role required');
  }
  return session;
}
