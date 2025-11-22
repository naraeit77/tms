'use client';

/**
 * AI Performance Diagnosis Page
 * AI 성능 진단 - 머신러닝 기반 성능 이슈 자동 진단
 */

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Brain, Sparkles, TrendingUp, Zap, Target, AlertCircle } from 'lucide-react';

export default function AIDiagnosisPage() {
  const router = useRouter();

  const aiFeatures = [
    {
      icon: Brain,
      title: '자동 성능 분석',
      description: 'AI가 SQL 실행 패턴을 분석하여 성능 이슈를 자동으로 발견합니다.',
      badge: 'AI 기반',
      color: 'purple',
    },
    {
      icon: Sparkles,
      title: '개선 제안',
      description: '머신러닝 모델이 최적화 방안과 예상 개선율을 제시합니다.',
      badge: '자동 제안',
      color: 'blue',
    },
    {
      icon: Target,
      title: '이슈 우선순위',
      description: '성능 영향도를 기반으로 튜닝 우선순위를 자동으로 결정합니다.',
      badge: '스마트 분류',
      color: 'green',
    },
    {
      icon: TrendingUp,
      title: '예상 개선율',
      description: '최적화 적용 시 예상되는 성능 개선율을 미리 확인할 수 있습니다.',
      badge: '예측 분석',
      color: 'orange',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">AI 성능 진단</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">머신러닝 기반 성능 이슈 자동 진단</p>
        </div>
      </div>

      {/* AI Features Grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {aiFeatures.map((feature, index) => (
          <Card key={index} className="border-2 hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className={`p-3 bg-${feature.color}-100 dark:bg-${feature.color}-900 rounded-lg`}>
                  <feature.icon className={`h-6 w-6 text-${feature.color}-600 dark:text-${feature.color}-400`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">{feature.title}</h3>
                    <Badge variant="outline" className="text-xs">
                      {feature.badge}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Integration Notice */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-600" />
            AI 성능 진단 통합 안내
          </CardTitle>
          <CardDescription>Narae TMS의 다양한 모듈에서 AI 진단 기능을 활용하세요</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-lg border border-purple-200 dark:border-purple-800">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-purple-900 dark:text-purple-100 mb-2">AI 기반 분석 기능</h4>
                <p className="text-sm text-purple-800 dark:text-purple-200 mb-3">
                  AI 성능 진단은 다음 메뉴들에 통합되어 있습니다:
                </p>
                <ul className="space-y-2 text-sm text-purple-800 dark:text-purple-200">
                  <li className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    <strong>튜닝 워크플로우:</strong> 자동 튜닝 대상 선정 및 개선 제안
                  </li>
                  <li className="flex items-center gap-2">
                    <Brain className="h-4 w-4" />
                    <strong>SQL Advisor:</strong> SQL 튜닝 자동 진단 및 권장사항
                  </li>
                  <li className="flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    <strong>실시간 모니터링:</strong> 성능 이상 패턴 자동 감지
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <Button onClick={() => router.push('/tuning')} className="w-full">
              <Zap className="h-4 w-4 mr-2" />
              튜닝 워크플로우
            </Button>
            <Button onClick={() => router.push('/advisor')} variant="outline" className="w-full">
              <Brain className="h-4 w-4 mr-2" />
              SQL Advisor
            </Button>
            <Button onClick={() => router.push('/monitoring/realtime')} variant="outline" className="w-full">
              <TrendingUp className="h-4 w-4 mr-2" />
              실시간 모니터링
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle>관련 기능 바로가기</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-3">
            <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push('/advisor/sql-tuning')}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded">
                    <Brain className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium">SQL Tuning Advisor</h4>
                    <p className="text-xs text-muted-foreground">자동 SQL 튜닝 분석</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push('/advisor/sql-access')}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900 rounded">
                    <Target className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium">SQL Access Advisor</h4>
                    <p className="text-xs text-muted-foreground">인덱스 및 구조 최적화</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push('/tuning/tasks')}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded">
                    <Zap className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium">튜닝 작업 관리</h4>
                    <p className="text-xs text-muted-foreground">AI 기반 자동 튜닝 대상 관리</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push('/monitoring/top-sql')}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded">
                    <TrendingUp className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium">Top SQL 분석</h4>
                    <p className="text-xs text-muted-foreground">성능 이슈 SQL 실시간 분석</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
