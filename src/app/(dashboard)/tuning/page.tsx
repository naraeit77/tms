'use client';

/**
 * Tuning Index Page
 * 튜닝 관리 메인 페이지
 */

import { useRouter } from 'next/navigation';
import { ListChecks, TrendingUp, History, Zap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function TuningPage() {
  const router = useRouter();

  const tuningFeatures = [
    {
      title: '튜닝 대상 관리',
      description: 'SQL 튜닝 대상 등록 및 진행 상황 관리',
      icon: ListChecks,
      href: '/tuning/tasks',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: '튜닝 진행 현황',
      description: '현재 진행 중인 SQL 튜닝 작업 현황 및 진행률',
      icon: TrendingUp,
      href: '/tuning/progress',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: '튜닝 이력',
      description: '완료된 SQL 튜닝 작업 이력 및 활동 로그',
      icon: History,
      href: '/tuning/history',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ];

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">SQL 튜닝 관리</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          체계적인 SQL 튜닝 프로세스와 협업 기능
        </p>
      </div>

      {/* 튜닝 기능 카드 */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {tuningFeatures.map((feature) => {
          const Icon = feature.icon;
          return (
            <Card
              key={feature.href}
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => router.push(feature.href)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 rounded-lg ${feature.bgColor}`}>
                        <Icon className={`h-6 w-6 ${feature.color}`} />
                      </div>
                      <CardTitle className="text-xl">{feature.title}</CardTitle>
                    </div>
                    <CardDescription className="text-base">
                      {feature.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(feature.href);
                  }}
                >
                  바로가기
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 튜닝 워크플로우 안내 */}
      <Card className="border-green-500 bg-green-50">
        <CardContent className="pt-6">
          <div className="text-sm space-y-3">
            <p className="font-medium text-green-900">SQL 튜닝 워크플로우</p>
            <div className="flex items-center gap-2 text-green-800">
              <Zap className="h-4 w-4" />
              <span className="font-medium">1단계: 식별</span>
            </div>
            <p className="text-green-800 pl-6">
              모니터링을 통해 성능 문제가 있는 SQL 식별 및 튜닝 대상 등록
            </p>

            <div className="flex items-center gap-2 text-green-800">
              <Zap className="h-4 w-4" />
              <span className="font-medium">2단계: 분석</span>
            </div>
            <p className="text-green-800 pl-6">
              실행계획 분석, Wait Events 확인, 인덱스 활용도 검토
            </p>

            <div className="flex items-center gap-2 text-green-800">
              <Zap className="h-4 w-4" />
              <span className="font-medium">3단계: 튜닝</span>
            </div>
            <p className="text-green-800 pl-6">
              SQL 개선, 인덱스 생성/수정, 힌트 활용, 통계 정보 갱신
            </p>

            <div className="flex items-center gap-2 text-green-800">
              <Zap className="h-4 w-4" />
              <span className="font-medium">4단계: 검증</span>
            </div>
            <p className="text-green-800 pl-6">
              성능 개선 측정, Before/After 비교, 운영 반영 전 테스트
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
