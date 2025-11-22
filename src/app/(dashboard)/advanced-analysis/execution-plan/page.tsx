'use client';

/**
 * Execution Plan Analysis Page
 * 실행 계획 분석 - 실행 계획 시각화 및 최적화 제안
 */

import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, GitCompare, Database, TrendingUp, AlertTriangle, CheckCircle, Lightbulb } from 'lucide-react';

export default function ExecutionPlanPage() {
  const router = useRouter();

  const features = [
    {
      icon: GitCompare,
      title: '실행 계획 시각화',
      description: '트리 구조로 실행 계획을 시각화하여 복잡한 쿼리도 쉽게 이해할 수 있습니다.',
      status: 'available',
    },
    {
      icon: TrendingUp,
      title: '비용 분석',
      description: '각 단계별 비용을 분석하여 성능 병목 지점을 빠르게 식별합니다.',
      status: 'available',
    },
    {
      icon: Database,
      title: '인덱스 추천',
      description: 'AI 기반 인덱스 추천으로 쿼리 성능을 크게 개선할 수 있습니다.',
      status: 'available',
    },
    {
      icon: Lightbulb,
      title: '최적화 제안',
      description: '실행 계획 분석을 통해 구체적인 최적화 방안을 제시합니다.',
      status: 'available',
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
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">실행 계획 분석</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">실행 계획 시각화 및 최적화 제안</p>
        </div>
      </div>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5" />
            실행 계획 분석 기능
          </CardTitle>
          <CardDescription>Oracle DBMS_XPLAN과 통합된 고급 실행 계획 분석 도구</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            {features.map((feature, index) => (
              <Card key={index} className="border-2">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                      <feature.icon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold">{feature.title}</h3>
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          사용 가능
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{feature.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-1">실행 계획 분석 이용 안내</h4>
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  실행 계획 분석은 기존 <strong>실행 계획</strong> 메뉴에서 이용하실 수 있습니다. DBMS_XPLAN을 활용한 상세 분석,
                  실행 계획 비교, Plan Baseline 관리 등의 기능을 제공합니다.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <Button onClick={() => router.push('/execution-plans')} className="flex-1">
              <GitCompare className="h-4 w-4 mr-2" />
              실행 계획 메뉴로 이동
            </Button>
            <Button onClick={() => router.push('/execution-plans/view')} variant="outline" className="flex-1">
              <Database className="h-4 w-4 mr-2" />
              DBMS_XPLAN 분석
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Access Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => router.push('/execution-plans/view')}>
          <CardContent className="p-6">
            <h3 className="font-semibold mb-2">실행 계획 조회</h3>
            <p className="text-sm text-muted-foreground mb-4">DBMS_XPLAN으로 상세 실행 계획 확인</p>
            <Badge variant="outline">DBMS_XPLAN</Badge>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => router.push('/execution-plans/compare')}>
          <CardContent className="p-6">
            <h3 className="font-semibold mb-2">실행 계획 비교</h3>
            <p className="text-sm text-muted-foreground mb-4">여러 실행 계획을 비교하여 최적화</p>
            <Badge variant="outline">비교 분석</Badge>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => router.push('/plan-baselines')}>
          <CardContent className="p-6">
            <h3 className="font-semibold mb-2">Plan Baseline</h3>
            <p className="text-sm text-muted-foreground mb-4">실행 계획 고정 및 관리</p>
            <Badge variant="outline">Baseline</Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
