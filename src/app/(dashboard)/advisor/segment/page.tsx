'use client';

/**
 * Segment Advisor Page (Oracle Enterprise Edition Only)
 * 세그먼트 어드바이저 - 공간 낭비 분석 및 회수 권장
 * DBMS_ADVISOR 패키지 기반 (Diagnostics Pack 라이센스 필요)
 */

import { useQuery, useMutation } from '@tanstack/react-query';
import {
  HardDrive,
  AlertCircle,
  Info,
  Crown,
  Trash2,
  TrendingDown,
  Loader2,
  Play,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { useToast } from '@/hooks/use-toast';

interface SegmentRecommendation {
  segment_owner: string;
  segment_name: string;
  segment_type: string;
  tablespace_name: string;
  allocated_space: number;
  used_space: number;
  reclaimable_space: number;
  fragmentation: number;
  recommendation: string;
  source: 'ADVISOR' | 'ESTIMATED';
}

export default function SegmentAdvisorPage() {
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
  const { toast } = useToast();

  const {
    data: recommendationsData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['segment-advisor', selectedConnectionId],
    queryFn: async () => {
      if (!selectedConnectionId || selectedConnectionId === 'all') {
        throw new Error('특정 데이터베이스를 선택해주세요');
      }

      const res = await fetch(`/api/advisor/segment?connection_id=${selectedConnectionId}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch segment recommendations');
      }
      return res.json();
    },
    enabled: !!selectedConnectionId && selectedConnectionId !== 'all',
    retry: false,
  });

  // Segment Advisor 분석 실행
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/advisor/segment/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: selectedConnectionId,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to execute segment analysis');
      }

      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: '분석 완료',
        description: data.message || 'Segment Advisor 분석이 완료되었습니다.',
      });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: '분석 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // API 응답 데이터 안전하게 처리
  const recommendations: SegmentRecommendation[] = Array.isArray(recommendationsData?.data) 
    ? recommendationsData.data 
    : [];

  const formatBytes = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (!bytes || bytes === 0 || isNaN(bytes)) return '0 B';
    if (bytes < 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Segment Advisor</h1>
            <Badge variant="secondary" className="gap-1">
              <Crown className="h-3 w-3" />
              Enterprise Only
            </Badge>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            세그먼트 공간 낭비 분석 및 회수 권장 (DBMS_ADVISOR)
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
        <AlertTitle>Segment Advisor 소개</AlertTitle>
        <AlertDescription className="space-y-1">
          <p>테이블과 인덱스 세그먼트의 공간 낭비(단편화)를 분석하고 공간 회수 방법을 제안합니다:</p>
          <ul className="text-sm list-disc list-inside ml-2 mt-2 space-y-1">
            <li><strong>단편화 분석</strong>: 세그먼트 내 사용되지 않는 공간 식별</li>
            <li><strong>공간 회수</strong>: SHRINK SPACE 또는 재구성 권장</li>
            <li><strong>저장 공간 최적화</strong>: 불필요한 공간 할당 감소</li>
          </ul>
        </AlertDescription>
      </Alert>

      {!selectedConnectionId || selectedConnectionId === 'all' ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>데이터베이스 선택 필요</AlertTitle>
          <AlertDescription>
            Segment Advisor를 사용하려면 특정 Oracle 데이터베이스를 선택해주세요.
          </AlertDescription>
        </Alert>
      ) : error ? (
        <Alert variant="destructive">
          <Crown className="h-4 w-4" />
          <AlertTitle>Segment Advisor 사용 불가</AlertTitle>
          <AlertDescription>
            <p>Segment Advisor는 Oracle Enterprise Edition의 Diagnostics Pack이 필요합니다.</p>
            {error instanceof Error && error.message && (
              <p className="text-sm mt-2">{error.message}</p>
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {/* 분석 실행 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <HardDrive className="h-5 w-5" />
                    세그먼트 분석
                  </CardTitle>
                  <CardDescription>공간 낭비가 있는 세그먼트 찾기</CardDescription>
                </div>
                <Button
                  onClick={() => analyzeMutation.mutate()}
                  disabled={analyzeMutation.isPending || !selectedConnectionId}
                >
                  {analyzeMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      분석 중...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      분석 실행
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
          </Card>

          {/* 권장사항 목록 */}
          <Card>
            <CardHeader>
              <CardTitle>공간 회수 권장사항</CardTitle>
              <CardDescription>
                단편화된 세그먼트 및 회수 가능한 공간
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={`skeleton-segment-${i}`} className="h-32 w-full" />
                  ))}
                </div>
              ) : recommendations.length > 0 ? (
                <div className="space-y-4">
                  {recommendations.map((rec, index) => {
                    // 데이터 안전성 검사
                    if (!rec || typeof rec !== 'object') return null;

                    const segmentOwner = rec.segment_owner || 'N/A';
                    const segmentName = rec.segment_name || 'N/A';
                    const segmentType = rec.segment_type || 'UNKNOWN';
                    const tablespaceName = rec.tablespace_name || 'N/A';
                    const allocatedSpace = Number(rec.allocated_space) || 0;
                    const usedSpace = Number(rec.used_space) || 0;
                    const reclaimableSpace = Number(rec.reclaimable_space) || 0;
                    const fragmentation = Number(rec.fragmentation) || 0;
                    const recommendation = rec.recommendation || '';
                    const source = rec.source || 'ESTIMATED';

                    return (
                      <div key={`segment-rec-${segmentOwner}-${segmentName}-${segmentType}-${index}`} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold flex items-center gap-2">
                              <HardDrive className="h-4 w-4" />
                              {segmentOwner}.{segmentName}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              {segmentType} • {tablespaceName}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {source === 'ADVISOR' && (
                              <Badge variant="outline" className="gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                분석됨
                              </Badge>
                            )}
                            <Badge variant={fragmentation > 30 ? 'destructive' : 'secondary'}>
                              단편화 {fragmentation.toFixed(1)}%
                            </Badge>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">할당된 공간</div>
                            <div className="font-medium">{formatBytes(allocatedSpace)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">사용 중인 공간</div>
                            <div className="font-medium">{formatBytes(usedSpace)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">회수 가능</div>
                            <div className="font-medium text-green-600">
                              {formatBytes(reclaimableSpace)}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span>공간 사용률</span>
                            <span>
                              {allocatedSpace > 0
                                ? ((usedSpace / allocatedSpace) * 100).toFixed(1)
                                : '0.0'}
                              %
                            </span>
                          </div>
                          <Progress
                            value={
                              allocatedSpace > 0
                                ? (usedSpace / allocatedSpace) * 100
                                : 0
                            }
                            className="h-2"
                          />
                        </div>

                        {reclaimableSpace > 0 && recommendation && (
                          <div className="bg-muted p-3 rounded">
                            <div className="flex items-start gap-2">
                              <TrendingDown className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                              <div className="text-sm flex-1 min-w-0">
                                <div className="font-medium mb-2">권장사항:</div>
                                <pre className="text-xs font-mono whitespace-pre-wrap break-words bg-background p-2 rounded border overflow-x-auto">
                                  {recommendation}
                                </pre>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Trash2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-lg font-medium">회수 가능한 공간이 없습니다.</p>
                  <p className="text-sm mt-2">
                    세그먼트가 최적 상태입니다. 더 정확한 분석을 위해 "분석 실행" 버튼을 클릭해보세요.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
