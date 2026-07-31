'use client';

// 대시보드 헤더 — 라이트 모드 + 중앙 퀵서치 트리거 + 현재 페이지 표시

import { useRouter, usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LogOut, User, Settings, Database, ChevronRight } from 'lucide-react';
import { DatabaseSelector } from '@/components/database/database-selector';

interface DashboardHeaderProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string;
  };
}

const PAGE_TITLES: Array<{ prefix: string; title: string }> = [
  { prefix: '/monitoring/top-sql', title: 'Top SQL' },
  { prefix: '/monitoring/wait-events', title: 'Wait Events' },
  { prefix: '/monitoring/sessions', title: '세션 모니터링' },
  { prefix: '/monitoring/locks', title: 'Locks' },
  { prefix: '/monitoring/sql-monitor', title: 'SQL Monitor' },
  { prefix: '/monitoring/realtime', title: '실시간 모니터링' },
  { prefix: '/monitoring/stats', title: '통계 정보' },
  { prefix: '/monitoring/statspack', title: 'STATSPACK' },
  { prefix: '/monitoring', title: '실시간 모니터링' },
  { prefix: '/performance-history', title: '성능 히스토리' },
  { prefix: '/advanced-analysis', title: 'SQL 고급 분석' },
  { prefix: '/sql-clusters', title: 'SQL 클러스터 분석' },
  { prefix: '/analysis/ai-tuning-guide', title: 'AI 튜닝 가이드' },
  { prefix: '/analysis', title: '분석' },
  { prefix: '/sql-editor', title: 'SQL Editor' },
  { prefix: '/execution-plans/compare', title: '실행계획 비교' },
  { prefix: '/execution-plans/baseline', title: 'Plan Baseline' },
  { prefix: '/execution-plans/dbms-xplan', title: 'DBMS_XPLAN' },
  { prefix: '/execution-plans/view', title: '실행계획 조회' },
  { prefix: '/execution-plans', title: '실행계획' },
  { prefix: '/trace', title: 'SQL Trace' },
  { prefix: '/awr', title: 'AWR/ADDM' },
  { prefix: '/ash', title: 'ASH' },
  { prefix: '/tuning/tasks', title: '튜닝 작업' },
  { prefix: '/tuning/register', title: 'SQL 등록' },
  { prefix: '/tuning/history', title: '튜닝 이력' },
  { prefix: '/tuning', title: '튜닝 관리' },
  { prefix: '/reports', title: '성능 보고서' },
  { prefix: '/connections', title: 'DB 연결 관리' },
  { prefix: '/admin/users', title: '사용자 관리' },
  { prefix: '/admin/login-history', title: '접속기록 관리' },
  { prefix: '/admin', title: '관리' },
  { prefix: '/settings', title: '환경설정' },
  { prefix: '/profile', title: '내 프로필' },
  { prefix: '/dashboard', title: '대시보드' },
];

function detectPageTitle(pathname: string): string {
  const hit = PAGE_TITLES.find((p) => pathname.startsWith(p.prefix));
  return hit?.title ?? 'Narae TMS';
}

export default function DashboardHeader({ user }: DashboardHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const pageTitle = useMemo(() => detectPageTitle(pathname || ''), [pathname]);

  const initials = user.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : user.email?.[0].toUpperCase() || 'U';

  const roleLabel = user.role === 'admin' ? '관리자' : user.role === 'tuner' ? '튜너' : '뷰어';

  return (
    <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
      <div className="w-full px-4 py-2.5 flex items-center justify-between gap-4">
        {/* 좌: 로고 + 현재 페이지 */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 via-purple-600 to-cyan-500 grid place-items-center shadow-sm shadow-purple-500/20 shrink-0">
              <Database className="h-5 w-5 text-white" />
            </div>
            <div className="leading-tight hidden sm:block">
              <h1 className="text-sm font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent">
                Narae TMS v2.0
              </h1>
              <p className="text-[10px] text-slate-500 -mt-0.5">SQL Tuning Management</p>
            </div>
          </div>

          {/* 현재 페이지 빵부스러기 */}
          <div className="hidden lg:flex items-center gap-1.5 ml-3 pl-3 border-l border-slate-200 text-sm">
            <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
            <span className="font-medium text-slate-700">{pageTitle}</span>
          </div>
        </div>

        {/* 우: DB 선택 + 사용자 */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden xl:flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">DB</span>
            <DatabaseSelector />
          </div>
          <div className="xl:hidden">
            <DatabaseSelector />
          </div>

          <div className="text-sm text-right hidden md:block">
            <div className="font-medium text-slate-800 leading-tight">{user.name || user.email}</div>
            <div className="text-slate-500 text-[11px] leading-tight">{roleLabel}</div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end">
              <DropdownMenuLabel>내 계정</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/profile')}>
                <User className="mr-2 h-4 w-4" />
                <span>프로필</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/settings')}>
                <Settings className="mr-2 h-4 w-4" />
                <span>설정</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                className="text-red-600 focus:text-red-600"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>로그아웃</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
