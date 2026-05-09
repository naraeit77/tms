'use client';

// SaaS 템플릿 레이아웃 기반의 TMS v2.0 메인 랜딩 페이지

export const dynamic = 'force-dynamic';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Database,
  Activity,
  Zap,
  Shield,
  ArrowRight,
  Code2,
  BarChart3,
  Lock,
  Check,
  TrendingUp,
  Star,
  Mail,
  Sparkles,
  Server,
  CircleCheck,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const partnerLogos: Array<{ name: string; status: 'live' | 'soon' }> = [
  { name: 'Oracle', status: 'live' },
  { name: 'PostgreSQL', status: 'live' },
  { name: 'MySQL', status: 'soon' },
  { name: 'Tibero', status: 'soon' },
  { name: 'MS-SQL', status: 'soon' },
  { name: 'MariaDB', status: 'soon' },
];

const featureBullets = [
  {
    icon: Activity,
    color: 'blue',
    title: '실시간 모니터링',
    description: 'Oracle DB의 SQL 성능을 실시간으로 모니터링하고 분석합니다.',
    items: [
      'Top SQL 실시간 분석 및 순위',
      'Wait Events 추적 및 알림',
      'Session 모니터링 대시보드',
      '성능 메트릭 시각화',
    ],
  },
  {
    icon: Zap,
    color: 'purple',
    title: '튜닝 워크플로우',
    description: '체계적인 SQL 튜닝 프로세스와 협업 기능을 제공합니다.',
    items: [
      '튜닝 대상 자동 선정 및 관리',
      '진행 상황 실시간 추적',
      '성능 개선 측정 및 보고',
      '튜닝 이력 관리 및 분석',
    ],
  },
  {
    icon: Shield,
    color: 'green',
    title: '보안 & 권한',
    description: 'Role 기반 접근 제어와 암호화된 DB 연결 관리를 제공합니다.',
    items: [
      'Role 기반 권한 관리 시스템',
      '암호화된 비밀번호 저장',
      '감사 로그 및 추적',
      '다중 DB 연결 관리',
    ],
  },
];

const colorMap = {
  blue: {
    bg: 'bg-blue-500/10',
    hoverBorder: 'hover:border-blue-500/40',
    icon: 'text-blue-600 dark:text-blue-400',
    iconBg: 'bg-gradient-to-br from-blue-500/20 to-blue-600/20',
    bullet: 'bg-blue-500/10',
  },
  purple: {
    bg: 'bg-purple-500/10',
    hoverBorder: 'hover:border-purple-500/40',
    icon: 'text-purple-600 dark:text-purple-400',
    iconBg: 'bg-gradient-to-br from-purple-500/20 to-purple-600/20',
    bullet: 'bg-purple-500/10',
  },
  green: {
    bg: 'bg-green-500/10',
    hoverBorder: 'hover:border-green-500/40',
    icon: 'text-green-600 dark:text-green-400',
    iconBg: 'bg-gradient-to-br from-green-500/20 to-green-600/20',
    bullet: 'bg-green-500/10',
  },
} as const;

export default function Home() {
  const { status } = useSession();
  const router = useRouter();
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterSubmitting, setNewsletterSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/monitoring');
    }
  }, [status, router]);

  async function handleNewsletterSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = newsletterEmail.trim();
    if (!email) {
      toast.error('이메일 주소를 입력해 주세요.');
      return;
    }
    setNewsletterSubmitting(true);
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || '구독 요청에 실패했습니다.');
      }
      toast.success('구독 요청을 받았습니다. 곧 인사이트를 보내드릴게요.');
      setNewsletterEmail('');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '구독 요청 중 오류가 발생했습니다.';
      toast.error(message);
    } finally {
      setNewsletterSubmitting(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-cyan-50">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin h-16 w-16 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <Database className="h-8 w-8 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="text-muted-foreground font-medium">Loading Narae TMS...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* Soft background blobs */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-[-10rem] left-[-10rem] h-[32rem] w-[32rem] rounded-full bg-blue-300/30 dark:bg-blue-600/10 blur-3xl" />
        <div className="absolute top-[12rem] right-[-12rem] h-[36rem] w-[36rem] rounded-full bg-purple-300/30 dark:bg-purple-600/10 blur-3xl" />
        <div className="absolute bottom-[-12rem] left-1/3 h-[30rem] w-[30rem] rounded-full bg-cyan-200/30 dark:bg-cyan-600/10 blur-3xl" />
      </div>

      {/* ========== Header ========== */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 dark:bg-slate-950/80 border-b border-slate-200/60 dark:border-slate-800/60">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 via-purple-600 to-cyan-500 grid place-items-center shadow-md shadow-purple-500/20">
                <Database className="h-5 w-5 text-white" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-500 blur-lg opacity-40 group-hover:opacity-60 transition-opacity" />
            </div>
            <div className="leading-tight">
              <div className="text-base font-bold gradient-text">Narae TMS</div>
              <div className="text-[10px] text-muted-foreground -mt-0.5">v2.0 · SQL Tuning</div>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-8 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a href="#features" className="hover:text-primary transition-colors">제품</a>
            <a href="#performance" className="hover:text-primary transition-colors">성과</a>
            <a href="#why" className="hover:text-primary transition-colors">차별점</a>
            <a href="#resources" className="hover:text-primary transition-colors">리소스</a>
          </nav>

          <div className="flex items-center gap-2">
            <a
              href="https://pgtms.info"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 text-xs font-medium text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors"
              title="PostgreSQL 전용 Narae TMS 사이트로 이동"
            >
              PostgreSQL 버전
              <ExternalLink className="h-3 w-3" />
            </a>
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/auth/signin">로그인</Link>
            </Button>
            <Button asChild size="sm" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-md shadow-purple-500/20 group">
              <Link href="/auth/signup">
                무료로 시작하기
                <ArrowRight className="ml-1.5 h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ========== Hero ========== */}
      <section className="relative container mx-auto px-6 pt-16 lg:pt-24 pb-20">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left: copy */}
          <div className="lg:col-span-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/50 text-xs font-medium text-purple-700 dark:text-purple-300 mb-6">
              <Sparkles className="h-3.5 w-3.5" />
              Enterprise-Grade SQL Performance Platform
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight mb-6">
              <span className="gradient-text">Oracle 데이터베이스</span>
              <br />
              성능 최적화의<br />
              새로운 기준
            </h1>

            <p className="text-lg text-slate-600 dark:text-slate-400 mb-5 max-w-xl leading-relaxed">
              실시간 모니터링부터 지능형 SQL 튜닝까지,
              엔터프라이즈급 데이터베이스 성능 관리 솔루션을 한 곳에서 경험하세요.
            </p>

            <div className="mb-8 inline-flex items-center gap-2 rounded-xl border border-sky-200 dark:border-sky-800/60 bg-sky-50/70 dark:bg-sky-950/30 px-4 py-2.5 text-sm">
              <Database className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
              <span className="text-slate-700 dark:text-slate-300">
                현재 보고 계신 사이트는 <strong className="font-semibold">Oracle 전용</strong>입니다. PostgreSQL 환경이라면
              </span>
              <a
                href="https://pgtms.info"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-sky-700 dark:text-sky-300 hover:text-sky-900 dark:hover:text-sky-100 underline-offset-4 hover:underline"
              >
                pgtms.info
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-8">
              <Button asChild size="lg" className="h-12 px-7 text-base bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg shadow-purple-500/30 group">
                <Link href="/auth/signup">
                  무료로 시작하기
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-7 text-base border-slate-300 dark:border-slate-700">
                <Link href="/auth/signin">데모 보기</Link>
              </Button>
            </div>

            {/* Inline social proof */}
            <div className="flex items-center gap-5 text-sm text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <CircleCheck className="h-4 w-4 text-green-500" />
                무료 체험
              </div>
              <div className="flex items-center gap-1.5">
                <CircleCheck className="h-4 w-4 text-green-500" />
                신용카드 불필요
              </div>
              <div className="flex items-center gap-1.5">
                <CircleCheck className="h-4 w-4 text-green-500" />
                5분 만에 설치
              </div>
            </div>
          </div>

          {/* Right: dashboard mockup */}
          <div className="lg:col-span-6 relative">
            <div className="relative">
              {/* Glow ring */}
              <div className="absolute -inset-6 bg-gradient-to-tr from-blue-500/30 via-purple-500/20 to-cyan-500/30 blur-3xl rounded-full opacity-60" />

              <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl shadow-2xl shadow-purple-500/10 overflow-hidden">
                {/* Window chrome */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">
                  <div className="flex gap-1.5">
                    <div className="h-3 w-3 rounded-full bg-red-400" />
                    <div className="h-3 w-3 rounded-full bg-yellow-400" />
                    <div className="h-3 w-3 rounded-full bg-green-400" />
                  </div>
                  <div className="flex-1 mx-3 h-6 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[10px] text-muted-foreground">
                    tms.naraeit.co.kr/monitoring
                  </div>
                </div>

                <div className="p-5 grid grid-cols-12 gap-3">
                  {/* Sidebar */}
                  <div className="col-span-3 space-y-1.5">
                    {['모니터링', '튜닝', '리포트', 'AWR', '설정'].map((label, i) => (
                      <div
                        key={label}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] ${
                          i === 0
                            ? 'bg-gradient-to-r from-blue-500/15 to-purple-500/15 text-primary font-semibold'
                            : 'text-slate-500'
                        }`}
                      >
                        <div className={`h-1.5 w-1.5 rounded-full ${i === 0 ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'}`} />
                        {label}
                      </div>
                    ))}
                  </div>

                  {/* Main panel */}
                  <div className="col-span-9 space-y-3">
                    {/* Stat cards */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'CPU', value: '45%', tone: 'from-blue-500/15 to-blue-500/5' },
                        { label: 'Memory', value: '62%', tone: 'from-purple-500/15 to-purple-500/5' },
                        { label: 'Sessions', value: '124', tone: 'from-cyan-500/15 to-cyan-500/5' },
                      ].map((s) => (
                        <div key={s.label} className={`rounded-lg bg-gradient-to-br ${s.tone} border border-slate-200/60 dark:border-slate-700/60 p-2.5`}>
                          <div className="text-[9px] text-muted-foreground">{s.label}</div>
                          <div className="text-sm font-bold">{s.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Mini chart */}
                    <div className="rounded-lg border border-slate-200/60 dark:border-slate-700/60 p-3 bg-white dark:bg-slate-900">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] font-semibold">SQL Performance</div>
                        <div className="text-[9px] text-green-500 flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" /> +12%
                        </div>
                      </div>
                      <svg viewBox="0 0 200 60" className="w-full h-16">
                        <defs>
                          <linearGradient id="heroChart" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="rgb(124,58,237)" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="rgb(124,58,237)" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path
                          d="M0,45 C20,40 35,25 55,28 C80,32 95,15 120,18 C145,22 160,8 200,12 L200,60 L0,60 Z"
                          fill="url(#heroChart)"
                        />
                        <path
                          d="M0,45 C20,40 35,25 55,28 C80,32 95,15 120,18 C145,22 160,8 200,12"
                          stroke="rgb(124,58,237)"
                          strokeWidth="1.5"
                          fill="none"
                        />
                      </svg>
                    </div>

                    {/* Top SQL list */}
                    <div className="rounded-lg border border-slate-200/60 dark:border-slate-700/60 p-2.5 space-y-1.5 bg-white dark:bg-slate-900">
                      <div className="text-[10px] font-semibold mb-1">Top SQL</div>
                      {[
                        { sql: 'SELECT * FROM orders WHERE...', pct: 92 },
                        { sql: 'UPDATE customers SET...', pct: 68 },
                        { sql: 'INSERT INTO logs (...)', pct: 41 },
                      ].map((row) => (
                        <div key={row.sql} className="flex items-center gap-2">
                          <div className="text-[9px] font-mono text-slate-500 truncate flex-1">{row.sql}</div>
                          <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                              style={{ width: `${row.pct}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating chips */}
              <div className="hidden md:block absolute -left-6 top-24 animate-float">
                <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl px-3 py-2.5 flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-green-500/15 grid place-items-center">
                    <Activity className="h-4 w-4 text-green-500" />
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">성능 개선</div>
                    <div className="text-sm font-bold text-green-600">+45%</div>
                  </div>
                </div>
              </div>

              <div className="hidden md:block absolute -right-6 bottom-16 animate-float" style={{ animationDelay: '1s' }}>
                <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl px-3 py-2.5 flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-blue-500/15 grid place-items-center">
                    <Code2 className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">튜닝 완료</div>
                    <div className="text-sm font-bold gradient-text">1,234</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========== Partner / Database logo strip ========== */}
      <section className="border-y border-slate-200/60 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/30">
        <div className="container mx-auto px-6 py-8">
          <p className="text-center text-xs uppercase tracking-widest text-muted-foreground mb-5">
            지원 데이터베이스 · 국내 200+ 기업이 신뢰하는 솔루션
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {partnerLogos.map((db) => (
              <div
                key={db.name}
                className={
                  db.status === 'live'
                    ? 'flex items-center gap-2 text-lg sm:text-xl font-semibold text-slate-700 dark:text-slate-200'
                    : 'flex items-center gap-2 text-lg sm:text-xl font-semibold text-slate-400 dark:text-slate-600'
                }
              >
                <span>{db.name}</span>
                {db.status === 'soon' && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-md bg-slate-200/80 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    출시 예정
                  </span>
                )}
              </div>
            ))}
          </div>
          <p className="text-center text-[11px] text-muted-foreground mt-4">
            <span className="font-semibold text-slate-600 dark:text-slate-400">Oracle · PostgreSQL</span>{' '}
            정식 지원 · MySQL · Tibero · MS-SQL · MariaDB는 향후 출시 예정
          </p>
        </div>
      </section>

      {/* ========== Performance / chart section ========== */}
      <section id="performance" className="container mx-auto px-6 py-24">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50 text-xs font-medium text-blue-700 dark:text-blue-300 mb-6">
              <BarChart3 className="h-3.5 w-3.5" />
              실측 데이터 기반 성과
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight mb-6">
              <span className="gradient-text">데이터로 증명</span>하는<br />
              실질적인 성능 개선
            </h2>
            <p className="text-base text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
              평균 30~50%의 SQL 응답 속도 개선과 운영자 1인당 처리 가능한 튜닝 건수 3배 증가.
              Narae TMS는 추측이 아닌 실측 데이터로 결과를 보여드립니다.
            </p>

            <div className="grid grid-cols-2 gap-5">
              {[
                { value: '99.9%', label: '시스템 가용성' },
                { value: '<100ms', label: '평균 응답 시간' },
                { value: '24/7', label: '실시간 모니터링' },
                { value: '100%', label: '온프레미스 지원' },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-white/60 dark:bg-slate-900/60 backdrop-blur-sm">
                  <div className="text-2xl font-bold gradient-text mb-1">{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Chart card */}
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-tr from-blue-500/20 via-purple-500/10 to-cyan-500/20 blur-2xl rounded-full" />
            <div className="relative rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="text-sm font-semibold">SQL 응답 시간 추이</div>
                  <div className="text-xs text-muted-foreground">최근 30일</div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-500" /> 도입 전
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-purple-500" /> 도입 후
                  </span>
                </div>
              </div>

              <svg viewBox="0 0 400 180" className="w-full h-48">
                <defs>
                  <linearGradient id="afterArea" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="rgb(124,58,237)" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="rgb(124,58,237)" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="beforeArea" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="rgb(59,130,246)" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="rgb(59,130,246)" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Grid */}
                {[0, 1, 2, 3, 4].map((i) => (
                  <line
                    key={i}
                    x1="0"
                    y1={20 + i * 35}
                    x2="400"
                    y2={20 + i * 35}
                    stroke="currentColor"
                    className="text-slate-200 dark:text-slate-800"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                ))}

                {/* Before line (high) */}
                <path
                  d="M0,40 C40,35 80,55 120,45 C160,35 200,60 240,50 C280,40 320,55 400,45 L400,180 L0,180 Z"
                  fill="url(#beforeArea)"
                />
                <path
                  d="M0,40 C40,35 80,55 120,45 C160,35 200,60 240,50 C280,40 320,55 400,45"
                  stroke="rgb(59,130,246)"
                  strokeWidth="2"
                  fill="none"
                />

                {/* After line (lower, improving) */}
                <path
                  d="M0,90 C40,95 80,110 120,115 C160,125 200,130 240,135 C280,140 320,148 400,150 L400,180 L0,180 Z"
                  fill="url(#afterArea)"
                />
                <path
                  d="M0,90 C40,95 80,110 120,115 C160,125 200,130 240,135 C280,140 320,148 400,150"
                  stroke="rgb(124,58,237)"
                  strokeWidth="2.5"
                  fill="none"
                />

                {/* End marker */}
                <circle cx="400" cy="150" r="5" fill="white" stroke="rgb(124,58,237)" strokeWidth="2.5" />
              </svg>

              <div className="mt-4 flex items-center gap-2 text-sm">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 text-xs font-medium">
                  <TrendingUp className="h-3.5 w-3.5" /> 평균 응답 -67%
                </div>
                <span className="text-xs text-muted-foreground">vs. 도입 전 30일</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========== Dark mid CTA banner ========== */}
      <section className="container mx-auto px-6 pb-20">
        <div className="relative rounded-3xl overflow-hidden bg-slate-950 dark:bg-slate-900 border border-slate-800">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-cyan-500/20" />
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                'radial-gradient(circle at 20% 30%, rgba(99,102,241,0.4) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(168,85,247,0.4) 0%, transparent 50%)',
            }}
          />

          <div className="relative px-6 sm:px-12 py-12 grid md:grid-cols-[1fr_auto] gap-8 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-xs font-medium text-white mb-4 backdrop-blur-sm">
                <Sparkles className="h-3.5 w-3.5" /> 30일 무료 체험
              </div>
              <h3 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white leading-tight mb-3">
                지금 데모를 신청하고 성능 개선을<br className="hidden sm:block" /> 직접 확인해보세요.
              </h3>
              <p className="text-slate-300 text-sm sm:text-base">
                전문 컨설턴트가 귀사의 환경에 맞춰 맞춤 시나리오를 시연합니다.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button asChild size="lg" className="h-12 px-7 bg-white text-slate-900 hover:bg-slate-100 font-semibold">
                <Link href="/auth/signup">데모 신청하기</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-7 bg-transparent border-white/30 text-white hover:bg-white/10 hover:text-white">
                <Link href="/auth/signin">바로 로그인</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ========== 3-column features ========== */}
      <section id="features" className="container mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/50 text-xs font-medium text-purple-700 dark:text-purple-300 mb-5">
            <Database className="h-3.5 w-3.5" />
            주요 기능
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
            <span className="gradient-text">엔터프라이즈급</span> 데이터베이스 관리
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
            실시간 모니터링부터 보안 관리까지, 완벽한 Oracle DB 성능 최적화 솔루션
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featureBullets.map((f) => {
            const c = colorMap[f.color as keyof typeof colorMap];
            const Icon = f.icon;
            return (
              <Card
                key={f.title}
                className={`relative overflow-hidden border-2 border-transparent ${c.hoverBorder} transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl bg-white dark:bg-slate-900`}
              >
                <div className={`absolute -top-12 -right-12 h-40 w-40 rounded-full ${c.bg} blur-3xl`} />
                <CardContent className="relative p-7">
                  <div className={`p-3 ${c.iconBg} rounded-2xl w-fit mb-5 shadow-md`}>
                    <Icon className={`h-7 w-7 ${c.icon}`} />
                  </div>
                  <h3 className="text-xl font-bold mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                    {f.description}
                  </p>
                  <ul className="space-y-2.5">
                    {f.items.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-sm">
                        <div className={`p-0.5 ${c.bullet} rounded mt-0.5`}>
                          <Check className={`h-3.5 w-3.5 ${c.icon}`} />
                        </div>
                        <span className="leading-relaxed text-slate-700 dark:text-slate-300">{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ========== Why TMS — 2 column ========== */}
      <section id="why" className="container mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50 text-xs font-medium text-blue-700 dark:text-blue-300 mb-5">
            <Zap className="h-3.5 w-3.5" />
            Narae TMS의 차별점
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4">
            왜 <span className="gradient-text">Narae TMS</span>인가요?
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {[
            {
              icon: Server,
              title: '온프레미스 · 클라우드 모두 지원',
              desc: '폐쇄망 환경부터 멀티 클라우드까지, 어떤 인프라에서도 동일한 경험을 제공합니다. 데이터는 외부로 전송되지 않습니다.',
              accent: 'from-blue-500 to-cyan-500',
            },
            {
              icon: TrendingUp,
              title: '운영 효율을 3배까지 끌어올리는 자동화',
              desc: '튜닝 대상 자동 선정 · 진행 상황 추적 · 성능 개선 측정을 워크플로우로 묶어 DBA 1인이 처리할 수 있는 SQL을 3배로 늘립니다.',
              accent: 'from-purple-500 to-pink-500',
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-7 hover:shadow-xl transition-all"
              >
                <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${item.accent} grid place-items-center text-white shadow-lg mb-5`}>
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{item.desc}</p>
                <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${item.accent} scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-500`} />
              </div>
            );
          })}
        </div>
      </section>

      {/* ========== Testimonial ========== */}
      <section className="container mx-auto px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-[auto_1fr] gap-10 items-center">
            <div className="relative shrink-0 mx-auto md:mx-0">
              <div className="absolute -inset-4 bg-gradient-to-tr from-blue-500/30 to-purple-500/30 blur-2xl rounded-full" />
              <div className="relative h-44 w-44 rounded-3xl overflow-hidden border-4 border-white dark:border-slate-800 shadow-2xl bg-gradient-to-br from-purple-100 to-blue-100">
                <Image
                  src="https://api.dicebear.com/9.x/lorelei/svg?seed=jiyoung-pretty-young-dba-2026&beardProbability=0&glassesProbability=0&earringsProbability=100&hair=variant01,variant02,variant04,variant10,variant14,variant26,variant30,variant31,variant33&backgroundColor=ddd6fe,c7d2fe,bfdbfe&backgroundType=gradientLinear"
                  alt="김지영 책임 DBA 가상 아바타"
                  width={400}
                  height={400}
                  className="object-cover w-full h-full"
                  unoptimized
                />
              </div>
              <div className="absolute -bottom-3 -right-3 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl p-2.5 shadow-lg">
                <Star className="h-5 w-5 text-white fill-white" />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <blockquote className="text-xl sm:text-2xl font-semibold leading-relaxed mb-6 text-slate-900 dark:text-slate-100">
                &ldquo;도입 전에는 야간에 장애 알람이 울려도 어디서부터 봐야 할지 막막했어요.
                Narae TMS 도입 후 <span className="gradient-text">평균 응답 시간이 67% 개선</span>됐고,
                튜닝 대상을 시스템이 먼저 알려주니 운영 부담이 확연히 줄었습니다.&rdquo;
              </blockquote>
              <div className="flex items-center gap-3">
                <div>
                  <div className="font-bold">김지영 책임 DBA</div>
                  <div className="text-sm text-muted-foreground">국내 대형 금융사 인프라팀</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========== Mid CTA ========== */}
      <section className="container mx-auto px-6 pb-20">
        <div className="text-center max-w-2xl mx-auto rounded-3xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-950 p-10">
          <h3 className="text-2xl sm:text-3xl font-bold mb-3">
            이미 <span className="gradient-text">200+ 기업</span>이 도입했습니다
          </h3>
          <p className="text-muted-foreground mb-6">
            지금 가입하고 30일간 모든 기능을 무료로 사용해보세요.
          </p>
          <Button asChild size="lg" className="h-12 px-8 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg shadow-purple-500/30 group">
            <Link href="/auth/signup">
              지금 시작하기
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </Button>
        </div>
      </section>

      {/* ========== Resources ========== */}
      <section id="resources" className="container mx-auto px-6 py-20">
        <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800/50 text-xs font-medium text-cyan-700 dark:text-cyan-300 mb-4">
              <Code2 className="h-3.5 w-3.5" />
              리소스 & 인사이트
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold">
              <span className="gradient-text">DBA가 읽어야 할</span> 콘텐츠
            </h2>
          </div>
          <Button asChild variant="outline" className="group">
            <a
              href="https://www.naraeit.co.kr/blog"
              target="_blank"
              rel="noopener noreferrer"
            >
              모든 글 보기
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </a>
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              tag: '장애 대응',
              title: '오라클 장애 해결 사례 — 인스턴스 다운부터 데이터 파일 손상까지',
              excerpt:
                '인스턴스 다운은 가장 치명적인 장애 중 하나다. 서버 과부하·메모리 부족·디스크 오류 등 원인별 진단과 복구 절차를 정리한다.',
              date: '2026-05-04',
              readTime: '2분',
              href: 'https://www.naraeit.co.kr/post/오라클-장애-해결-사례',
              image:
                'https://static.wixstatic.com/media/e7677e_79b10d34a47a4cd596c8d5f0fdac80f3~mv2.png',
            },
            {
              tag: 'SQL 튜닝',
              title: 'SQL 전문가 선택 — SQL 튜닝 전문가의 역할과 선택법',
              excerpt:
                'SQL 쿼리 최적화는 시스템 안정성과 비용 절감에 직결된다. 신뢰할 수 있는 튜닝 전문가를 고르는 기준과 협업 방식을 소개한다.',
              date: '2026-04-29',
              readTime: '3분',
              href: 'https://www.naraeit.co.kr/post/sql-전문가-선택-sql-튜닝-전문가의-역할과-선택법',
              image:
                'https://static.wixstatic.com/media/e7677e_58fe6d2595324aad9eff62b93a097d00~mv2.png',
            },
            {
              tag: 'PostgreSQL',
              title: 'PostgreSQL 시계열 DB 고가용성(HA) 구축 — TimescaleDB + Patroni',
              excerpt:
                'TimescaleDB의 하이퍼테이블로 INSERT 성능을 극대화하고 Patroni 기반 자동 페일오버로 시계열 워크로드의 무중단 운영을 구성한다.',
              date: '2026-04-07',
              readTime: '2분',
              href: 'https://www.naraeit.co.kr/post/postgresql-시계열-데이터베이스-고가용성-ha-구축-방안-timescaledb-patroni',
              image:
                'https://static.wixstatic.com/media/e7677e_058f450015f64827b32d18207079fb64~mv2.jpg',
            },
          ].map((post) => (
            <a
              key={post.title}
              href={post.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden hover:shadow-xl transition-all hover:-translate-y-1 flex flex-col"
            >
              <div className="relative aspect-[16/10] overflow-hidden bg-slate-100 dark:bg-slate-800">
                <Image
                  src={post.image}
                  alt={post.title}
                  width={600}
                  height={360}
                  className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105"
                  unoptimized
                />
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/95 dark:bg-slate-900/95 text-[11px] font-semibold text-primary backdrop-blur-sm">
                  {post.tag}
                </div>
              </div>
              <div className="p-5 flex flex-col flex-1">
                <h3 className="font-bold text-base leading-snug mb-2 group-hover:text-primary transition-colors line-clamp-2">
                  {post.title}
                </h3>
                <p className="text-sm text-muted-foreground line-clamp-3 mb-4 flex-1">
                  {post.excerpt}
                </p>
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-slate-100 dark:border-slate-800">
                  <span>
                    {post.date} · {post.readTime}
                  </span>
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* ========== Dark footer ========== */}
      <footer className="relative bg-slate-950 text-slate-300 mt-10">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle at 80% 0%, rgba(124,58,237,0.3) 0%, transparent 40%), radial-gradient(circle at 0% 100%, rgba(59,130,246,0.2) 0%, transparent 40%)',
          }}
        />

        <div className="relative container mx-auto px-6 pt-16 pb-10">
          {/* Newsletter */}
          <div className="grid md:grid-cols-[1.2fr_1fr] gap-10 pb-12 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 via-purple-600 to-cyan-500 grid place-items-center">
                  <Database className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="text-base font-bold text-white">Narae TMS v2.0</div>
                  <div className="text-[11px] text-slate-500">SQL Tuning Management</div>
                </div>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed max-w-md">
                Narae TMS 2.0 은 주식회사 나래정보기술이 만듭니다.
              </p>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-white mb-3">제품 소식 받아보기</h4>
              <p className="text-xs text-slate-400 mb-4">
                새 기능과 DBA를 위한 인사이트를 월 1회 보내드립니다.
              </p>
              <form className="flex gap-2" onSubmit={handleNewsletterSubmit}>
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <Input
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@company.com"
                    value={newsletterEmail}
                    onChange={(e) => setNewsletterEmail(e.target.value)}
                    disabled={newsletterSubmitting}
                    className="pl-9 h-11 bg-slate-900 border-slate-800 text-white placeholder:text-slate-500"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={newsletterSubmitting}
                  className="h-11 px-5 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white disabled:opacity-60"
                >
                  {newsletterSubmitting ? '전송 중…' : '구독'}
                </Button>
              </form>
            </div>
          </div>

          {/* Bottom row */}
          <div className="pt-8 mt-2 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-500 text-center md:text-left">
              <p>&copy; 2026 주식회사 나래정보기술. All rights reserved.</p>
              <p className="mt-1">Enterprise-grade Database Performance Management Solution</p>
            </div>
            <div className="flex items-center gap-5 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-blue-500" /> Encrypted
              </span>
              <span className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-purple-500" /> 99.9% Uptime
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
