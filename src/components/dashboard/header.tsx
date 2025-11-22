'use client';

/**
 * Dashboard Header Component
 * 대시보드 헤더 (시스템 제목, 사용자 정보, 로그아웃)
 */

import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
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
import { LogOut, User, Settings } from 'lucide-react';
import { DatabaseSelector } from '@/components/database/database-selector';

interface DashboardHeaderProps {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string;
  };
}

export default function DashboardHeader({ user }: DashboardHeaderProps) {
  const router = useRouter();

  const initials = user.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : user.email?.[0].toUpperCase() || 'U';

  return (
    <header className="bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-lg sticky top-0 z-50">
      <div className="container mx-auto max-w-[1920px] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🗄️</span>
          <div>
            <h1 className="text-lg font-bold">Narae TMS v2.0</h1>
            <p className="text-xs text-slate-300 hidden sm:block">SQL Tuning Management System</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-300">DB선택</span>
            <DatabaseSelector />
          </div>

          <div className="text-sm text-right hidden md:block">
            <div className="font-medium">{user.name || user.email}</div>
            <div className="text-slate-300 text-xs">
              {user.role === 'admin' ? '관리자' : user.role === 'tuner' ? '튜너' : '뷰어'}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                <Avatar>
                  <AvatarFallback className="bg-slate-700 text-white">{initials}</AvatarFallback>
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
              <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/auth/signin' })} className="text-red-600">
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
