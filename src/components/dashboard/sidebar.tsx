'use client';

/**
 * Dashboard Sidebar Component
 * 대시보드 사이드바 네비게이션
 * 성능 최적화: 네비게이션 호버 시 데이터 프리페칭
 */

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { usePrefetchMonitoring } from '@/hooks/use-prefetch-monitoring';
import { useDatabaseStore } from '@/lib/stores/database-store';
import { parseOracleEdition } from '@/lib/oracle/edition-guard';
import {
  Activity,
  Wrench,
  FileText,
  BarChart3,
  Database,
  Settings,
  GitCompare,
  Camera,
  BarChart4,
  // Lightbulb, // TODO: Oracle Advisor 재구현 시 복원
  Code2,
  ChevronDown,
  ChevronRight,
  Search,
  // ClipboardList, // TODO: 성능 보고서 재구축 시 복원
  History,
  Bot,
  Target,
  Sparkles,
} from 'lucide-react';

// Navigation sections for better organization
const navigation = [
  // === TMS 2.0 Core Features ===
  {
    name: '실시간 모니터링',
    href: '/monitoring',
    icon: Activity,
    badge: 'AI',
    badgeColor: 'bg-blue-500',
  },
  {
    name: '성능 히스토리',
    href: '/performance-history',
    icon: History,
  },
  // === SQL Analysis Section ===
  {
    name: 'SQL 고급 분석',
    href: '/analysis',
    icon: Search,
    badge: 'AI',
    badgeColor: 'bg-blue-500',
  },
  {
    name: 'SQL 클러스터 분석',
    href: '/sql-clusters',
    icon: Target,
    badge: 'A-F',
    badgeColor: 'bg-gradient-to-r from-green-500 to-red-500',
  },
  {
    name: 'AI 튜닝 가이드',
    href: '/analysis/ai-tuning-guide',
    icon: Bot,
    badge: 'LLM',
    badgeColor: 'bg-purple-500',
  },
  {
    name: 'Query Artifacts',
    href: '/analysis/query-artifacts',
    icon: Sparkles,
    badge: '인덱스',
    badgeColor: 'bg-indigo-500',
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
        enterpriseOnly: true,
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
    enterpriseOnly: true,
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
  // TODO: Oracle Advisor - 향후 향상된 기능으로 재구현 예정
  // {
  //   name: 'Oracle Advisor',
  //   href: '/advisor',
  //   icon: Lightbulb,
  //   children: [
  //     { name: 'SQL Tuning Advisor', href: '/advisor/sql-tuning' },
  //     { name: 'SQL Access Advisor', href: '/advisor/sql-access' },
  //     { name: 'Segment Advisor', href: '/advisor/segment' },
  //     { name: 'Undo Advisor', href: '/advisor/undo' },
  //     { name: 'Memory Advisor', href: '/advisor/memory' },
  //   ],
  // },
  {
    name: '튜닝 관리',
    href: '/tuning',
    icon: Wrench,
    children: [
      { name: '튜닝 대시보드', href: '/tuning' },
      { name: 'SQL 등록', href: '/tuning/register' },
      { name: '튜닝 이력', href: '/tuning/history' },
    ],
  },
  // TODO: 성능 보고서 기능 재구축 예정
  // {
  //   name: '성능 보고서',
  //   href: '/reports',
  //   icon: ClipboardList,
  // },
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
  const { prefetchDashboard, prefetchMetrics, prefetchSessions, prefetchTopSQL } = usePrefetchMonitoring();
  const selectedConnection = useDatabaseStore((s) => s.getSelectedConnection());
  const isNotEnterprise = useMemo(() => {
    const edition = parseOracleEdition(selectedConnection?.oracleEdition);
    return edition !== 'Enterprise' && edition !== 'Unknown';
  }, [selectedConnection?.oracleEdition]);

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

  // 네비게이션 항목별 프리페칭 핸들러
  const handleMouseEnter = useCallback((href: string) => {
    // 마우스 호버 시 해당 페이지 데이터 프리페치
    if (href === '/dashboard') {
      prefetchDashboard();
    } else if (href === '/monitoring') {
      prefetchMetrics();
    } else if (href === '/monitoring/sessions') {
      prefetchSessions();
    } else if (href === '/monitoring/top-sql') {
      prefetchTopSQL();
    }
  }, [prefetchDashboard, prefetchMetrics, prefetchSessions, prefetchTopSQL]);

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
                prefetch={!item.children}
                onClick={(e) => handleNavClick(e, item)}
                onMouseEnter={() => handleMouseEnter(item.href)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors no-underline',
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="flex-1 flex items-center gap-1.5">
                  <span className="truncate">{item.name}</span>
                  {item.badge && (
                    <span
                      className={cn(
                        'text-[9px] font-semibold px-1.5 py-0.5 rounded-full text-white whitespace-nowrap',
                        item.badgeColor || 'bg-slate-500'
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                  {isNotEnterprise && (item as any).enterpriseOnly && (
                    <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 whitespace-nowrap">
                      EE
                    </span>
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
                      onMouseEnter={() => handleMouseEnter(child.href)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-colors no-underline',
                        pathname === child.href
                          ? 'bg-slate-100 text-slate-900 font-medium'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      )}
                    >
                      <span className="truncate">{child.name}</span>
                      {isNotEnterprise && (child as any).enterpriseOnly && (
                        <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber-100 text-amber-700 whitespace-nowrap shrink-0">
                          EE
                        </span>
                      )}
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
