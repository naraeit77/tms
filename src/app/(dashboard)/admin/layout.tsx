// /admin/* 전용 가드 레이아웃 — admin role 만 접근 가능

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/auth/signin?callbackUrl=/admin/users');
  }
  if (session.user.role !== 'admin') {
    redirect('/monitoring');
  }
  return <>{children}</>;
}
