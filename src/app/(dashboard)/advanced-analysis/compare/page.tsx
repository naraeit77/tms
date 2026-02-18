'use client';

/**
 * Performance Comparison Page
 * 성능 비교 분석 - 여러 SQL의 성능 메트릭 비교
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, GitCompare, BarChart3, TrendingUp, TrendingDown, Plus, AlertCircle } from 'lucide-react';

export default function ComparePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sqlIds = searchParams.get('sql_ids')?.split(',') || [];

  const comparisonFeatures = [
    {
      icon: GitCompare,
      title: '다중 SQL 비교',
      description: '최대 4개의 SQL을 동시에 비교하여 성능 차이를 분석합니다.',
      badge: '멀티 비교',
    },
    {
      icon: BarChart3,
      title: '트렌드 분석',
      description: '시간에 따른 성능 변화 추세를 시각화하여 확인합니다.',
      badge: '시계열',
    },
    {
      icon: TrendingUp,
      title: '벤치마킹',
      description: '유사 SQL 간 성능 벤치마킹으로 최적화 기회를 발견합니다.',
      badge: '자동 분석',
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
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">성능 비교 분석</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">여러 SQL의 성능 메트릭 비교</p>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid md:grid-cols-3 gap-4">
        {comparisonFeatures.map((feature, index) => (
          <Card key={`compare-feature-${feature.title || ''}-${index}`} className="border-2">
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center">
                <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg mb-4">
                  <feature.icon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <Badge variant="outline" className="mb-2">
                  {feature.badge}
                </Badge>
                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Usage Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5" />
            성능 비교 분석 사용 방법
          </CardTitle>
          <CardDescription>SQL 통합 검색에서 비교할 SQL을 선택하세요</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">비교 분석 시작하기</h4>
                <ol className="space-y-2 text-sm text-blue-800 dark:text-blue-200 list-decimal list-inside">
                  <li><strong>SQL 통합 검색</strong>에서 비교하고 싶은 SQL들을 체크박스로 선택합니다</li>
                  <li>최대 <strong>4개</strong>까지 선택할 수 있습니다</li>
                  <li>화면 상단의 <strong>"비교"</strong> 버튼을 클릭하면 비교 분석이 시작됩니다</li>
                  <li>각 메트릭별로 최고/최악 성능이 자동으로 표시됩니다</li>
                </ol>
              </div>
            </div>
          </div>

          {sqlIds.length > 0 && (
            <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-2">
                <GitCompare className="h-5 w-5 text-green-600 dark:text-green-400" />
                <h4 className="font-medium text-green-900 dark:text-green-100">선택된 SQL ({sqlIds.length}개)</h4>
              </div>
              <div className="flex flex-wrap gap-2">
                {sqlIds.map((id, index) => (
                  <Badge key={`sql-id-badge-${id}-${index}`} variant="outline" className="font-mono">
                    {id}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={() => router.push('/advanced-analysis/search')} className="flex-1">
              <Plus className="h-4 w-4 mr-2" />
              SQL 검색으로 이동
            </Button>
            <Button onClick={() => router.push('/execution-plans/compare')} variant="outline" className="flex-1">
              <GitCompare className="h-4 w-4 mr-2" />
              실행 계획 비교
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Comparison Metrics Info */}
      <Card>
        <CardHeader>
          <CardTitle>비교 분석 메트릭</CardTitle>
          <CardDescription>다음 성능 지표들이 자동으로 비교 분석됩니다</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="p-3 border rounded-lg">
              <h4 className="font-medium mb-1">실행 메트릭</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• 실행 횟수</li>
                <li>• 총 경과 시간 / 평균 경과 시간</li>
                <li>• CPU 시간 (총 / 평균)</li>
              </ul>
            </div>

            <div className="p-3 border rounded-lg">
              <h4 className="font-medium mb-1">리소스 메트릭</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Buffer Gets (논리적 읽기)</li>
                <li>• Disk Reads (물리적 읽기)</li>
                <li>• 처리된 행 수</li>
              </ul>
            </div>

            <div className="p-3 border rounded-lg">
              <h4 className="font-medium mb-1">효율성 지표</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• 효율성 점수 (AI 계산)</li>
                <li>• 행당 실행 시간</li>
                <li>• I/O 효율성</li>
              </ul>
            </div>

            <div className="p-3 border rounded-lg">
              <h4 className="font-medium mb-1">성능 등급</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>
                  • <TrendingUp className="inline h-3 w-3 text-green-500" /> 최고 성능 (녹색)
                </li>
                <li>
                  • <TrendingDown className="inline h-3 w-3 text-red-500" /> 최악 성능 (빨간색)
                </li>
                <li>• 중간 성능 (회색)</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
