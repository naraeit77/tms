/**
 * Dashboard Layout
 * 대시보드 공통 레이아웃 (헤더, 사이드바, 메인 컨텐츠)
 */

export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import DashboardHeader from '@/components/dashboard/header';
import DashboardSidebar from '@/components/dashboard/sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/auth/signin');
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <DashboardHeader user={session.user} />
      <div className="flex flex-1 overflow-hidden">
        <DashboardSidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 py-6 max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
