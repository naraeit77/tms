'use client';

/**
 * Undo Advisor Page (Oracle Enterprise Edition Only)
 * Undo 어드바이저 - Undo 테이블스페이스 크기 최적화
 * DBMS_ADVISOR 패키지 기반 (Diagnostics Pack 라이센스 필요)
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  RotateCcw,
  RefreshCw,
  AlertCircle,
  Info,
  Crown,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

interface UndoAnalysis {
  current_size: number;
  current_usage: number;
  recommended_size: number;
  retention_guarantee: boolean;
  retention_time: number;
  snapshot_too_old_count: number;
  analysis_period_hours: number;
  peak_usage: number;
  recommendations: string[];
}

export default function UndoAdvisorPage() {
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
  const [retentionHours, setRetentionHours] = useState('24');

  const {
    data: analysisData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['undo-advisor', selectedConnectionId, retentionHours],
    queryFn: async () => {
      if (!selectedConnectionId || selectedConnectionId === 'all') {
        throw new Error('특정 데이터베이스를 선택해주세요');
      }

      const res = await fetch(
        `/api/advisor/undo?connection_id=${selectedConnectionId}&retention_hours=${retentionHours}`
      );
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch undo analysis');
      }
      return res.json();
    },
    enabled: false, // 수동 실행만 허용
    retry: false,
  });

  const analysis: UndoAnalysis | null = analysisData?.data || null;

  const formatBytes = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Undo Advisor</h1>
            <Badge variant="secondary" className="gap-1">
              <Crown className="h-3 w-3" />
              Enterprise Only
            </Badge>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Undo 테이블스페이스 크기 최적화 및 "Snapshot too old" 오류 방지
          </p>
          {selectedConnection && (
            <p className="text-sm text-muted-foreground mt-1">
              연결: <span className="font-medium">{selectedConnection.name}</span>
            </p>
          )}
        </div>
      </div>

      {/* 기능 설명 */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Undo Advisor 소개</AlertTitle>
        <AlertDescription className="space-y-1">
          <p>Undo 테이블스페이스의 적절한 크기를 산정하고 설정을 권장합니다:</p>
          <ul className="text-sm list-disc list-inside ml-2 mt-2 space-y-1">
            <li><strong>크기 최적화</strong>: 워크로드에 맞는 Undo 테이블스페이스 크기 권장</li>
            <li><strong>"Snapshot too old" 방지</strong>: 충분한 Undo 보존 시간 설정</li>
            <li><strong>리소스 최적화</strong>: 과도한 Undo 공간 할당 방지</li>
          </ul>
        </AlertDescription>
      </Alert>

      {!selectedConnectionId || selectedConnectionId === 'all' ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>데이터베이스 선택 필요</AlertTitle>
          <AlertDescription>
            Undo Advisor를 사용하려면 특정 Oracle 데이터베이스를 선택해주세요.
          </AlertDescription>
        </Alert>
      ) : error ? (
        <Alert variant="destructive">
          <Crown className="h-4 w-4" />
          <AlertTitle>Undo Advisor 사용 불가</AlertTitle>
          <AlertDescription>
            <p>Undo Advisor는 Oracle Enterprise Edition의 Diagnostics Pack이 필요합니다.</p>
            {error.message && <p className="text-sm mt-2">{error.message}</p>}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {/* 분석 설정 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RotateCcw className="h-5 w-5" />
                Undo 분석 설정
              </CardTitle>
              <CardDescription>원하는 Undo 보존 시간을 설정하세요</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-1.5 block">
                    Undo 보존 시간 (시간)
                  </label>
                  <Input
                    type="number"
                    value={retentionHours}
                    onChange={(e) => setRetentionHours(e.target.value)}
                    min="1"
                    max="720"
                  />
                </div>
                <Button onClick={() => refetch()}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  분석 실행
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 분석 결과 */}
          {isLoading ? (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={`skeleton-undo-${i}`} className="h-20 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : analysis ? (
            <>
              {/* 현재 상태 */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      현재 크기
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatBytes(analysis.current_size)}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      현재 사용량
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatBytes(analysis.current_usage)}</div>
                    <Progress
                      value={(analysis.current_usage / analysis.current_size) * 100}
                      className="h-2 mt-2"
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      권장 크기
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {formatBytes(analysis.recommended_size)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      최대 사용량
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatBytes(analysis.peak_usage)}</div>
                  </CardContent>
                </Card>
              </div>

              {/* Snapshot Too Old 경고 */}
              {analysis.snapshot_too_old_count > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Snapshot Too Old 오류 감지</AlertTitle>
                  <AlertDescription>
                    분석 기간 동안 {analysis.snapshot_too_old_count}건의 "Snapshot too old" 오류가
                    발생했습니다. Undo 테이블스페이스 크기를 늘리거나 보존 시간을 조정하세요.
                  </AlertDescription>
                </Alert>
              )}

              {/* 권장사항 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    권장사항
                  </CardTitle>
                  <CardDescription>
                    분석 기간: 최근 {analysis.analysis_period_hours}시간
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analysis.recommendations.length > 0 ? (
                    <div className="space-y-3">
                      {analysis.recommendations.map((rec, index) => (
                        <div key={`undo-rec-${rec.substring(0, 30)}-${index}`} className="border rounded-lg p-4">
                          <div className="flex items-start gap-2">
                            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                            <p className="text-sm">{rec}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>현재 Undo 설정이 최적 상태입니다.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 설정 정보 */}
              <Card>
                <CardHeader>
                  <CardTitle>현재 설정</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 text-sm">
                    <div className="flex items-center justify-between p-3 border rounded">
                      <span className="text-muted-foreground">Undo Retention</span>
                      <span className="font-medium">{analysis.retention_time} 초</span>
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded">
                      <span className="text-muted-foreground">Retention Guarantee</span>
                      <Badge variant={analysis.retention_guarantee ? 'default' : 'secondary'}>
                        {analysis.retention_guarantee ? 'ON' : 'OFF'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
