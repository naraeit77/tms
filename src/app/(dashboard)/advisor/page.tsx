'use client';

/**
 * Oracle Advisor Overview Page
 * Oracle Advisor 기능 개요 및 각 어드바이저 소개
 */

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Lightbulb,
  Sparkles,
  Database,
  HardDrive,
  RotateCcw,
  MemoryStick,
  Crown,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { parseOracleEdition } from '@/lib/oracle/edition-guard';
import { EnterpriseFeatureAlert } from '@/components/ui/enterprise-feature-alert';

const advisors = [
  {
    name: 'SQL Tuning Advisor',
    href: '/advisor/sql-tuning',
    icon: Sparkles,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    description: '특정 SQL 문장 성능 분석 및 튜닝 권장사항 제공',
    features: [
      '통계 정보 최적화 권장',
      'SQL 프로파일 생성',
      '인덱스 생성 제안',
      'SQL 구조 변경 권장',
    ],
  },
  {
    name: 'SQL Access Advisor',
    href: '/advisor/sql-access',
    icon: Database,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    description: '워크로드 기반 인덱스, 머티리얼라이즈드 뷰, 파티셔닝 권장',
    features: [
      'B-tree, 비트맵 인덱스 권장',
      '머티리얼라이즈드 뷰 생성 제안',
      '파티셔닝 전략 권장',
      '워크로드 전체 분석',
    ],
  },
  {
    name: 'Segment Advisor',
    href: '/advisor/segment',
    icon: HardDrive,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    description: '세그먼트 공간 낭비 분석 및 회수 권장',
    features: [
      '테이블/인덱스 단편화 분석',
      '공간 회수 가능성 평가',
      'SHRINK SPACE 권장',
      '저장 공간 최적화',
    ],
  },
  {
    name: 'Undo Advisor',
    href: '/advisor/undo',
    icon: RotateCcw,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    description: 'Undo 테이블스페이스 크기 최적화 및 "Snapshot too old" 오류 방지',
    features: [
      'Undo 테이블스페이스 크기 권장',
      'Undo Retention 최적화',
      'Snapshot too old 오류 방지',
      '워크로드 기반 분석',
    ],
  },
  {
    name: 'Memory Advisor',
    href: '/advisor/memory',
    icon: MemoryStick,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    description: 'SGA/PGA 메모리 크기 최적화 권장',
    features: [
      'SGA 컴포넌트 크기 조정',
      'PGA 크기 최적화',
      'DB Cache, Shared Pool 분석',
      '메모리 크기별 성능 예측',
    ],
  },
];

export default function OracleAdvisorPage() {
  const { selectedConnection } = useSelectedDatabase();

  const currentEdition = useMemo(() => {
    return parseOracleEdition(selectedConnection?.oracleEdition);
  }, [selectedConnection?.oracleEdition]);
  const isNotEnterprise = currentEdition !== 'Enterprise' && currentEdition !== 'Unknown';

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Oracle Advisor</h1>
            <Badge variant="secondary" className="gap-1">
              <Crown className="h-3 w-3" />
              Enterprise Only
            </Badge>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Oracle Enterprise Edition 전용 성능 분석 및 최적화 도구 모음
          </p>
        </div>
      </div>

      {/* Enterprise Edition 전용 기능 안내 */}
      {isNotEnterprise ? (
        <EnterpriseFeatureAlert
          featureName="Oracle Advisor"
          requiredPack="Diagnostics Pack + Tuning Pack"
          alternative={{
            name: 'DBMS_XPLAN / 실행계획 분석',
            description: '실행계획 조회 및 비교를 통한 수동 SQL 튜닝이 가능합니다.',
            route: '/execution-plans',
          }}
          currentEdition={currentEdition}
        />
      ) : (
        <Alert>
          <Lightbulb className="h-4 w-4" />
          <AlertTitle>Oracle Advisor란?</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              Oracle Advisor는 Oracle Enterprise Edition에서 제공하는 자동화된 성능 분석 및 최적화 도구 모음입니다.
              데이터베이스의 다양한 영역을 자동으로 분석하고 구체적인 개선안을 제안합니다.
            </p>
            <p className="text-sm font-medium mt-2">
              Oracle Advisor 기능은 Oracle Enterprise Edition과 Diagnostics Pack 및 Tuning Pack 라이센스가 필요합니다.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* Advisor 카드 그리드 */}
      <div className="grid gap-6 md:grid-cols-2">
        {advisors.map((advisor) => {
          const Icon = advisor.icon;
          return (
            <Card key={advisor.name} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className={`p-3 rounded-lg ${advisor.bgColor}`}>
                    <Icon className={`h-6 w-6 ${advisor.color}`} />
                  </div>
                  <Badge variant="outline">Enterprise</Badge>
                </div>
                <CardTitle className="mt-4">{advisor.name}</CardTitle>
                <CardDescription>{advisor.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">주요 기능:</h4>
                  <ul className="space-y-1">
                    {advisor.features.map((feature, index) => (
                      <li key={`feature-${advisor.name || ''}-${feature.substring(0, 20)}-${index}`} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-green-500 mt-0.5">•</span>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Link href={advisor.href}>
                  <Button className="w-full" variant="outline">
                    자세히 보기
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 사용 안내 */}
      <Card>
        <CardHeader>
          <CardTitle>사용 안내</CardTitle>
          <CardDescription>Oracle Advisor 기능을 효과적으로 활용하기 위한 가이드</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="border-l-4 border-blue-500 pl-4 py-2">
              <h4 className="font-medium text-sm mb-1">1. 라이센스 확인</h4>
              <p className="text-sm text-muted-foreground">
                Oracle Enterprise Edition과 Diagnostics Pack, Tuning Pack 라이센스가 필요합니다.
                Standard Edition에서는 사용할 수 없습니다.
              </p>
            </div>

            <div className="border-l-4 border-green-500 pl-4 py-2">
              <h4 className="font-medium text-sm mb-1">2. 파라미터 설정</h4>
              <p className="text-sm text-muted-foreground mb-2">
                CONTROL_MANAGEMENT_PACK_ACCESS 파라미터가 올바르게 설정되어 있어야 합니다:
              </p>
              <code className="text-xs bg-muted p-2 rounded block">
                ALTER SYSTEM SET CONTROL_MANAGEMENT_PACK_ACCESS='DIAGNOSTIC+TUNING' SCOPE=BOTH;
              </code>
            </div>

            <div className="border-l-4 border-purple-500 pl-4 py-2">
              <h4 className="font-medium text-sm mb-1">3. 권한 확인</h4>
              <p className="text-sm text-muted-foreground">
                ADVISOR 권한과 관련 패키지(DBMS_ADVISOR, DBMS_SQLTUNE) 실행 권한이 필요합니다.
              </p>
            </div>

            <div className="border-l-4 border-orange-500 pl-4 py-2">
              <h4 className="font-medium text-sm mb-1">4. 정기적인 분석</h4>
              <p className="text-sm text-muted-foreground">
                워크로드가 변경되거나 성능 문제가 발생할 때마다 Advisor를 실행하여 최적화 기회를 찾으세요.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
