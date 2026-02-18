'use client';

/**
 * Landing Page
 * TMS v2.0 랜딩 페이지 - Modern Technical Design
 */

export const dynamic = 'force-dynamic';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect } from 'react';
import { Database, Activity, Zap, Shield, ArrowRight, Code2, BarChart3, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Image from 'next/image';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // 이미 로그인한 사용자는 실시간 모니터링으로 리다이렉트
  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/monitoring');
    }
  }, [status, router]);

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-cyan-50 dark:from-slate-950 dark:via-blue-950 dark:to-slate-950">
      {/* Animated Background Grid */}
      <div className="fixed inset-0 tech-grid opacity-30 pointer-events-none" />

      {/* 헤더 */}
      <header className="relative backdrop-blur-md bg-white/70 dark:bg-slate-900/70 border-b border-slate-200/50 dark:border-slate-800/50 sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Database className="h-9 w-9 text-primary" />
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
            </div>
            <div>
              <h1 className="text-xl font-bold gradient-text">Narae TMS v2.0</h1>
              <p className="text-xs text-muted-foreground">SQL Tuning Management System</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" className="hover:bg-primary/10">
              <Link href="/auth/signin">로그인</Link>
            </Button>
            <Button asChild className="group">
              <Link href="/auth/signup">
                회원가입
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* 히어로 섹션 */}
      <section className="relative container mx-auto px-6 py-24 lg:py-32">
        <div className="text-center mb-20">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border-primary/20 mb-8 shadow-lg">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <span className="text-sm font-medium text-primary">Enterprise-Grade SQL Management</span>
          </div>

          <h2 className="text-5xl lg:text-7xl font-bold mb-8 leading-tight">
            <span className="gradient-text">Oracle 데이터베이스</span>
            <br />
            <span className="text-foreground">성능 최적화 플랫폼</span>
          </h2>

          <p className="text-lg lg:text-xl text-muted-foreground mb-8 max-w-3xl mx-auto leading-relaxed">
            실시간 모니터링부터 지능형 SQL 튜닝까지, 엔터프라이즈급 데이터베이스 성능 관리 솔루션
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mb-12 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20">
              <Activity className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">실시간 모니터링</span>
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20">
              <Zap className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium">자동 튜닝 워크플로우</span>
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20">
              <Shield className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">보안 & 권한 관리</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button asChild size="lg" className="text-base px-8 py-6 h-auto group glow shadow-lg">
              <Link href="/auth/signup">
                무료로 시작하기
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="text-base px-8 py-6 h-auto glass">
              <Link href="/auth/signin">로그인</Link>
            </Button>
          </div>

          {/* Trust Indicators */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto mt-16">
            <div className="text-center p-4 rounded-xl glass">
              <div className="text-3xl font-bold gradient-text mb-1">99.9%</div>
              <div className="text-xs text-muted-foreground">시스템 가용성</div>
            </div>
            <div className="text-center p-4 rounded-xl glass">
              <div className="text-3xl font-bold gradient-text mb-1">&lt;100ms</div>
              <div className="text-xs text-muted-foreground">평균 응답 시간</div>
            </div>
            <div className="text-center p-4 rounded-xl glass">
              <div className="text-3xl font-bold gradient-text mb-1">24/7</div>
              <div className="text-xs text-muted-foreground">실시간 모니터링</div>
            </div>
            <div className="text-center p-4 rounded-xl glass">
              <div className="text-3xl font-bold gradient-text mb-1">ISO27001</div>
              <div className="text-xs text-muted-foreground">보안 인증</div>
            </div>
          </div>
        </div>

        {/* Hero Image - Modern Technical Illustration */}
        <div className="relative max-w-6xl mx-auto">
          <div className="relative aspect-video rounded-2xl overflow-hidden glass shadow-2xl group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-cyan-500/10" />
            <Image
              src="https://picsum.photos/seed/tms-dashboard-v2/1280/720"
              alt="Narae TMS Dashboard - Oracle SQL Performance Monitoring"
              width={1280}
              height={720}
              className="object-cover transition-transform duration-700 group-hover:scale-105"
              priority
            />
            {/* Overlay gradient */}
            <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />

            {/* Dashboard Preview Overlay */}
            <div className="absolute bottom-6 left-6 right-6 glass p-4 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse-dot" />
                  <span className="text-sm font-medium">실시간 모니터링 활성화</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>CPU: 45%</span>
                  <span>Memory: 62%</span>
                  <span>Active Sessions: 124</span>
                </div>
              </div>
            </div>
          </div>

          {/* Floating Metric Cards */}
          <div className="absolute -bottom-6 -left-6 hidden xl:block animate-float">
            <div className="glass p-5 rounded-xl shadow-xl card-hover border border-green-500/20">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-500/20 rounded-xl">
                  <Activity className="h-7 w-7 text-green-500" />
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">성능 개선</div>
                  <div className="text-2xl font-bold gradient-text">+45%</div>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute -top-6 -right-6 hidden xl:block animate-float" style={{ animationDelay: '1s' }}>
            <div className="glass p-5 rounded-xl shadow-xl card-hover border border-blue-500/20">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-500/20 rounded-xl">
                  <Code2 className="h-7 w-7 text-blue-500" />
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">튜닝 완료</div>
                  <div className="text-2xl font-bold gradient-text">1,234</div>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute bottom-20 -right-8 hidden xl:block animate-float" style={{ animationDelay: '0.5s' }}>
            <div className="glass p-5 rounded-xl shadow-xl card-hover border border-purple-500/20">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-500/20 rounded-xl">
                  <Zap className="h-7 w-7 text-purple-500" />
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">응답 시간</div>
                  <div className="text-2xl font-bold gradient-text">85ms</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 기능 카드 */}
      <section className="relative container mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/5 border border-primary/10 mb-6">
            <Database className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">주요 기능</span>
          </div>
          <h3 className="text-4xl lg:text-5xl font-bold mb-4">
            <span className="gradient-text">엔터프라이즈급</span> 데이터베이스 관리
          </h3>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            실시간 모니터링부터 보안 관리까지, 완벽한 Oracle DB 성능 최적화 솔루션
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* Card 1 - 실시간 모니터링 */}
          <Card className="card-hover glass border-2 border-transparent hover:border-blue-500/30 relative overflow-hidden group">
            <div className="feature-gradient from-blue-500/5 to-transparent" />
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <CardHeader className="relative">
              <div className="p-3 bg-gradient-to-br from-blue-500/20 to-blue-600/20 rounded-2xl w-fit mb-4 shadow-lg">
                <Activity className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <CardTitle className="text-2xl font-bold mb-2">실시간 모니터링</CardTitle>
              <CardDescription className="text-base leading-relaxed">
                Oracle 데이터베이스의 SQL 성능을 실시간으로 모니터링하고 분석합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <ul className="space-y-3">
                <li className="flex items-start gap-3 group/item">
                  <div className="p-1.5 bg-blue-500/10 rounded-lg mt-0.5">
                    <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-sm leading-relaxed">Top SQL 실시간 분석 및 순위</span>
                </li>
                <li className="flex items-start gap-3 group/item">
                  <div className="p-1.5 bg-blue-500/10 rounded-lg mt-0.5">
                    <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-sm leading-relaxed">Wait Events 추적 및 알림</span>
                </li>
                <li className="flex items-start gap-3 group/item">
                  <div className="p-1.5 bg-blue-500/10 rounded-lg mt-0.5">
                    <Database className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-sm leading-relaxed">Session 모니터링 대시보드</span>
                </li>
                <li className="flex items-start gap-3 group/item">
                  <div className="p-1.5 bg-blue-500/10 rounded-lg mt-0.5">
                    <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-sm leading-relaxed">성능 메트릭 시각화</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Card 2 - 튜닝 워크플로우 */}
          <Card className="card-hover glass border-2 border-transparent hover:border-purple-500/30 relative overflow-hidden group">
            <div className="feature-gradient from-purple-500/5 to-transparent" />
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <CardHeader className="relative">
              <div className="p-3 bg-gradient-to-br from-purple-500/20 to-purple-600/20 rounded-2xl w-fit mb-4 shadow-lg">
                <Zap className="h-8 w-8 text-purple-600 dark:text-purple-400" />
              </div>
              <CardTitle className="text-2xl font-bold mb-2">튜닝 워크플로우</CardTitle>
              <CardDescription className="text-base leading-relaxed">
                체계적인 SQL 튜닝 프로세스와 협업 기능을 제공합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <ul className="space-y-3">
                <li className="flex items-start gap-3 group/item">
                  <div className="p-1.5 bg-purple-500/10 rounded-lg mt-0.5">
                    <Zap className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <span className="text-sm leading-relaxed">튜닝 대상 자동 선정 및 관리</span>
                </li>
                <li className="flex items-start gap-3 group/item">
                  <div className="p-1.5 bg-purple-500/10 rounded-lg mt-0.5">
                    <Code2 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <span className="text-sm leading-relaxed">진행 상황 실시간 추적</span>
                </li>
                <li className="flex items-start gap-3 group/item">
                  <div className="p-1.5 bg-purple-500/10 rounded-lg mt-0.5">
                    <BarChart3 className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <span className="text-sm leading-relaxed">성능 개선 측정 및 보고</span>
                </li>
                <li className="flex items-start gap-3 group/item">
                  <div className="p-1.5 bg-purple-500/10 rounded-lg mt-0.5">
                    <Database className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <span className="text-sm leading-relaxed">튜닝 이력 관리 및 분석</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Card 3 - 보안 & 권한 */}
          <Card className="card-hover glass border-2 border-transparent hover:border-green-500/30 relative overflow-hidden group md:col-span-2 lg:col-span-1">
            <div className="feature-gradient from-green-500/5 to-transparent" />
            <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <CardHeader className="relative">
              <div className="p-3 bg-gradient-to-br from-green-500/20 to-green-600/20 rounded-2xl w-fit mb-4 shadow-lg">
                <Shield className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle className="text-2xl font-bold mb-2">보안 & 권한</CardTitle>
              <CardDescription className="text-base leading-relaxed">
                Role 기반 접근 제어와 암호화된 DB 연결 관리를 제공합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="relative">
              <ul className="space-y-3">
                <li className="flex items-start gap-3 group/item">
                  <div className="p-1.5 bg-green-500/10 rounded-lg mt-0.5">
                    <Lock className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <span className="text-sm leading-relaxed">Role 기반 권한 관리 시스템</span>
                </li>
                <li className="flex items-start gap-3 group/item">
                  <div className="p-1.5 bg-green-500/10 rounded-lg mt-0.5">
                    <Shield className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <span className="text-sm leading-relaxed">암호화된 비밀번호 저장</span>
                </li>
                <li className="flex items-start gap-3 group/item">
                  <div className="p-1.5 bg-green-500/10 rounded-lg mt-0.5">
                    <Database className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <span className="text-sm leading-relaxed">감사 로그 및 추적</span>
                </li>
                <li className="flex items-start gap-3 group/item">
                  <div className="p-1.5 bg-green-500/10 rounded-lg mt-0.5">
                    <Lock className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <span className="text-sm leading-relaxed">다중 DB 연결 관리</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative container mx-auto px-6 py-20">
        <div className="relative rounded-3xl overflow-hidden glass border border-primary/20 shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/90 via-purple-600/90 to-cyan-600/90" />
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjEiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-30" />

          <div className="relative px-8 py-16 lg:py-24 text-center text-white">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 mb-6 backdrop-blur-sm">
              <Zap className="h-4 w-4" />
              <span className="text-sm font-medium">무료 체험 시작</span>
            </div>

            <h3 className="text-4xl lg:text-5xl font-bold mb-6 leading-tight">
              지금 바로 시작하세요
            </h3>
            <p className="text-lg lg:text-xl mb-10 opacity-90 max-w-2xl mx-auto leading-relaxed">
              Narae TMS v2.0의 강력한 기능을 무료로 체험하고,<br />
              데이터베이스 성능 최적화를 경험해보세요
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
              <Button asChild size="lg" variant="secondary" className="text-base px-10 py-6 h-auto shadow-xl hover:shadow-2xl transition-shadow">
                <Link href="/auth/signup" className="group">
                  무료로 시작하기
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="text-base px-10 py-6 h-auto bg-white/10 border-white/20 hover:bg-white/20 text-white backdrop-blur-sm">
                <Link href="/auth/signin">로그인</Link>
              </Button>
            </div>

            {/* Trust badges */}
            <div className="flex flex-wrap items-center justify-center gap-8 opacity-80">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                <span className="text-sm">ISO 27001 인증</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                <span className="text-sm">엔터프라이즈 보안</span>
              </div>
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                <span className="text-sm">24/7 모니터링</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 푸터 */}
      <footer className="relative glass border-t border-primary/10 mt-20">
        <div className="container mx-auto px-6 py-12">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
            {/* 회사 정보 */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="relative">
                  <Database className="h-8 w-8 text-primary" />
                  <div className="absolute inset-0 bg-primary/20 blur-lg rounded-full" />
                </div>
                <div>
                  <div className="text-lg font-bold gradient-text">Narae TMS v2.0</div>
                  <div className="text-xs text-muted-foreground">SQL Tuning Management</div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                엔터프라이즈급 Oracle 데이터베이스 성능 모니터링 및 SQL 튜닝 관리 솔루션
              </p>
            </div>

            {/* 제품 */}
            <div>
              <h4 className="font-semibold mb-4 text-sm">제품</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary transition-colors">실시간 모니터링</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">튜닝 워크플로우</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">보안 & 권한</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">가격 안내</a></li>
              </ul>
            </div>

            {/* 지원 */}
            <div>
              <h4 className="font-semibold mb-4 text-sm">지원</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary transition-colors">문서</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">API 레퍼런스</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">고객 지원</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">시스템 상태</a></li>
              </ul>
            </div>

            {/* 회사 */}
            <div>
              <h4 className="font-semibold mb-4 text-sm">회사</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary transition-colors">회사 소개</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">블로그</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">개인정보 처리방침</a></li>
                <li><a href="#" className="hover:text-primary transition-colors">이용약관</a></li>
              </ul>
            </div>
          </div>

          {/* 하단 정보 */}
          <div className="pt-8 border-t border-border/50">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="text-sm text-muted-foreground text-center md:text-left">
                <p>&copy; 2025 주식회사 나래정보기술. All rights reserved.</p>
                <p className="mt-1 text-xs">Enterprise-grade Database Performance Management Solution</p>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Shield className="h-4 w-4 text-green-500" />
                  <span>ISO 27001 Certified</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Activity className="h-4 w-4 text-blue-500" />
                  <span>99.9% Uptime</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
