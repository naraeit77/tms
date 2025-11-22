'use client';

/**
 * Dashboard Sidebar Component
 * 대시보드 사이드바 네비게이션
 */

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Activity,
  Wrench,
  FileText,
  BarChart3,
  Database,
  Settings,
  GitCompare,
  Camera,
  BarChart4,
  Lightbulb,
  Code2,
  GitBranch,
  ChevronDown,
  ChevronRight,
  Search,
  ClipboardList,
} from 'lucide-react';

const navigation = [
  {
    name: '대시보드',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    name: '실시간 모니터링',
    href: '/monitoring',
    icon: Activity,
  },
  {
    name: 'SQL 고급 분석',
    href: '/analysis',
    icon: Search,
  },
  {
    name: 'SQL 클러스터 분석',
    href: '/sql-clusters',
    icon: GitBranch,
  },
  {
    name: 'SQL 모니터링',
    href: '/monitoring-sql',
    icon: Activity,
    children: [
      { name: 'Top SQL', href: '/monitoring/top-sql' },
      { name: 'Wait Events', href: '/monitoring/wait-events' },
      { name: 'Sessions', href: '/monitoring/sessions' },
      { name: 'Locks', href: '/monitoring/locks' },
      {
        name: 'SQL_MONITOR(SQLTUNE)',
        href: '/monitoring/sql-monitor',
      },
    ],
  },
  {
    name: 'SQL Editor',
    href: '/sql-editor',
    icon: Code2,
    openInNewWindow: true,
  },
  {
    name: '실행계획',
    href: '/execution-plans',
    icon: GitCompare,
    children: [
      { name: '실행계획 조회', href: '/execution-plans/view' },
      { name: '실행계획 비교', href: '/execution-plans/compare' },
      { name: 'Plan Baseline', href: '/execution-plans/baseline' },
      { name: 'DBMS_XPLAN', href: '/execution-plans/dbms-xplan' },
    ],
  },
  {
    name: 'SQL Trace',
    href: '/trace',
    icon: FileText,
  },
  {
    name: 'AWR/ADDM',
    href: '/awr',
    icon: BarChart3,
  },
  {
    name: 'ASH',
    href: '/ash',
    icon: Activity,
  },
  {
    name: 'STATSPACK',
    href: '/monitoring/statspack',
    icon: Camera,
  },
  {
    name: '통계정보 수집',
    href: '/monitoring/stats',
    icon: BarChart4,
  },
  {
    name: 'Oracle Advisor',
    href: '/advisor',
    icon: Lightbulb,
    children: [
      { name: 'SQL Tuning Advisor', href: '/advisor/sql-tuning' },
      { name: 'SQL Access Advisor', href: '/advisor/sql-access' },
      { name: 'Segment Advisor', href: '/advisor/segment' },
      { name: 'Undo Advisor', href: '/advisor/undo' },
      { name: 'Memory Advisor', href: '/advisor/memory' },
    ],
  },
  {
    name: '튜닝 관리',
    href: '/tuning',
    icon: Wrench,
    children: [
      { name: '튜닝 대상 관리', href: '/tuning/tasks' },
      { name: '튜닝 진행 현황', href: '/tuning/progress' },
      { name: '튜닝 이력', href: '/tuning/history' },
    ],
  },
  {
    name: '성능 보고서',
    href: '/reports',
    icon: ClipboardList,
  },
  {
    name: 'DB 연결 관리',
    href: '/connections',
    icon: Database,
  },
  {
    name: '환경설정',
    href: '/settings',
    icon: Settings,
  },
];

export default function DashboardSidebar() {
  const pathname = usePathname();
  const [openMenus, setOpenMenus] = useState<Set<string>>(new Set());

  const toggleMenu = (menuName: string) => {
    setOpenMenus((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(menuName)) {
        newSet.delete(menuName);
      } else {
        newSet.add(menuName);
      }
      return newSet;
    });
  };

  const handleNavClick = (e: React.MouseEvent, item: any) => {
    if (item.children) {
      e.preventDefault();
      toggleMenu(item.name);
      return;
    }

    if (item.openInNewWindow) {
      e.preventDefault();
      window.open(item.href, '_blank');
    }
  };

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex-shrink-0 overflow-y-auto">
      <nav className="p-4 space-y-1">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href || (item.children && item.children.some((child) => pathname === child.href));
          const isOpen = openMenus.has(item.name);

          return (
            <div key={item.name}>
              <Link
                href={item.href}
                onClick={(e) => handleNavClick(e, item)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="flex-1 flex items-baseline gap-1">
                  {item.name === '실시간 모니터링' ? (
                    <>
                      <span>실시간 모니터링</span>
                      <span className="text-[10px] font-normal">with AI</span>
                    </>
                  ) : item.name === 'SQL 고급 분석' ? (
                    <>
                      <span>SQL 고급 분석</span>
                      <span className="text-[10px] font-normal">with AI</span>
                    </>
                  ) : item.name === 'SQL 클러스터 분석' ? (
                    <>
                      <span>SQL 클러스터 분석</span>
                      <span className="text-[10px] font-normal">with AI</span>
                    </>
                  ) : (
                    item.name
                  )}
                </span>
                {item.children && (
                  isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )
                )}
              </Link>

              {item.children && isOpen && (
                <div className="ml-8 mt-1 space-y-1">
                  {item.children.map((child) => (
                    <Link
                      key={child.name}
                      href={child.href}
                      className={cn(
                        'block px-3 py-1.5 rounded text-xs transition-colors',
                        pathname === child.href
                          ? 'bg-slate-100 text-slate-900 font-medium'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      )}
                    >
                      {child.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
