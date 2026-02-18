'use client';

/**
 * Memory Advisor Page (Oracle Enterprise Edition Only)
 * 메모리 어드바이저 - SGA/PGA 크기 최적화
 * DBMS_ADVISOR 패키지 기반 (Diagnostics Pack 라이센스 필요)
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  MemoryStick,
  RefreshCw,
  AlertCircle,
  Info,
  Crown,
  TrendingUp,
  TrendingDown,
  Activity,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

interface MemoryAdvisorData {
  current_sga_size: number;
  current_pga_size: number;
  current_sga_target: number;
  current_pga_target: number;
  recommended_sga_size: number;
  recommended_pga_size: number;
  sga_size_factor: number;
  pga_size_factor: number;
  db_cache_advice: Array<{
    size_mb: number;
    estd_physical_reads: number;
    size_factor: number;
    benefit_pct: number;
  }>;
  shared_pool_advice: Array<{
    size_mb: number;
    estd_lc_load_time: number;
    size_factor: number;
    benefit_pct: number;
  }>;
  pga_target_advice: Array<{
    size_mb: number;
    estd_extra_bytes_rw: number;
    size_factor: number;
  }>;
  hit_ratios: {
    buffer_cache: number;
    library_cache: number;
    dictionary_cache: number;
  };
}

export default function MemoryAdvisorPage() {
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
  const [workloadType, setWorkloadType] = useState('TYPICAL');

  const {
    data: advisorData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['memory-advisor', selectedConnectionId, workloadType],
    queryFn: async () => {
      if (!selectedConnectionId || selectedConnectionId === 'all') {
        throw new Error('특정 데이터베이스를 선택해주세요');
      }

      const res = await fetch(
        `/api/advisor/memory?connection_id=${selectedConnectionId}&workload=${workloadType}`
      );
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch memory advisor data');
      }
      return res.json();
    },
    enabled: !!selectedConnectionId && selectedConnectionId !== 'all',
    retry: false,
  });

  const memoryData: MemoryAdvisorData | null = advisorData?.data || null;

  const formatBytes = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  const getSizeChangeIcon = (factor: number) => {
    if (factor > 1) return <TrendingUp className="h-4 w-4 text-red-500" />;
    if (factor < 1) return <TrendingDown className="h-4 w-4 text-green-500" />;
    return <Activity className="h-4 w-4 text-gray-500" />;
  };

  const getSizeChangeText = (factor: number) => {
    if (factor > 1) return `+${((factor - 1) * 100).toFixed(0)}% 증가 권장`;
    if (factor < 1) return `-${((1 - factor) * 100).toFixed(0)}% 감소 권장`;
    return '현재 크기 유지';
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Memory Advisor</h1>
            <Badge variant="secondary" className="gap-1">
              <Crown className="h-3 w-3" />
              Enterprise Only
            </Badge>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            SGA/PGA 메모리 크기 최적화 권장 (DBMS_ADVISOR)
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
        <AlertTitle>Memory Advisor 소개</AlertTitle>
        <AlertDescription className="space-y-1">
          <p>현재 워크로드를 분석하여 SGA와 PGA 메모리 영역의 최적 크기를 권장합니다:</p>
          <ul className="text-sm list-disc list-inside ml-2 mt-2 space-y-1">
            <li><strong>SGA 최적화</strong>: DB Cache, Shared Pool 등 SGA 컴포넌트 크기 조정</li>
            <li><strong>PGA 최적화</strong>: 정렬, 해시 조인 등을 위한 PGA 크기 조정</li>
            <li><strong>성능 예측</strong>: 메모리 크기별 성능 영향 분석</li>
          </ul>
        </AlertDescription>
      </Alert>

      {!selectedConnectionId || selectedConnectionId === 'all' ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>데이터베이스 선택 필요</AlertTitle>
          <AlertDescription>
            Memory Advisor를 사용하려면 특정 Oracle 데이터베이스를 선택해주세요.
          </AlertDescription>
        </Alert>
      ) : error ? (
        <Alert variant="destructive">
          <Crown className="h-4 w-4" />
          <AlertTitle>Memory Advisor 사용 불가</AlertTitle>
          <AlertDescription>
            <p>Memory Advisor는 Oracle Enterprise Edition의 Diagnostics Pack이 필요합니다.</p>
            {error.message && <p className="text-sm mt-2">{error.message}</p>}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {/* 분석 설정 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MemoryStick className="h-5 w-5" />
                메모리 분석 설정
              </CardTitle>
              <CardDescription>워크로드 유형에 따른 메모리 최적화</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-1.5 block">워크로드 유형</label>
                  <Select value={workloadType} onValueChange={setWorkloadType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TYPICAL">일반 워크로드</SelectItem>
                      <SelectItem value="OLTP">OLTP (트랜잭션)</SelectItem>
                      <SelectItem value="DW">DW (분석)</SelectItem>
                    </SelectContent>
                  </Select>
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
                    <Skeleton key={`skeleton-memory-${i}`} className="h-24 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : memoryData ? (
            <>
              {/* 현재 vs 권장 */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">SGA (System Global Area)</CardTitle>
                    <CardDescription>공유 메모리 영역</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">현재 크기</div>
                        <div className="text-xl font-bold">
                          {formatBytes(memoryData.current_sga_size)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">권장 크기</div>
                        <div className="text-xl font-bold text-green-600">
                          {formatBytes(memoryData.recommended_sga_size)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 p-3 bg-muted rounded">
                      {getSizeChangeIcon(memoryData.sga_size_factor)}
                      <span className="text-sm font-medium">
                        {getSizeChangeText(memoryData.sga_size_factor)}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span>SGA Target</span>
                        <span>{formatBytes(memoryData.current_sga_target)}</span>
                      </div>
                      <Progress
                        value={(memoryData.current_sga_size / memoryData.current_sga_target) * 100}
                        className="h-2"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">PGA (Program Global Area)</CardTitle>
                    <CardDescription>프로세스 전용 메모리</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">현재 크기</div>
                        <div className="text-xl font-bold">
                          {formatBytes(memoryData.current_pga_size)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">권장 크기</div>
                        <div className="text-xl font-bold text-green-600">
                          {formatBytes(memoryData.recommended_pga_size)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 p-3 bg-muted rounded">
                      {getSizeChangeIcon(memoryData.pga_size_factor)}
                      <span className="text-sm font-medium">
                        {getSizeChangeText(memoryData.pga_size_factor)}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span>PGA Target</span>
                        <span>{formatBytes(memoryData.current_pga_target)}</span>
                      </div>
                      <Progress
                        value={(memoryData.current_pga_size / memoryData.current_pga_target) * 100}
                        className="h-2"
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* 메모리 효율성 (Hit Ratios) */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">메모리 효율성 (Hit Ratios)</CardTitle>
                  <CardDescription>주요 메모리 영역의 적중률 현황</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-6 md:grid-cols-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">Buffer Cache</span>
                        <span className={`font-bold ${memoryData.hit_ratios.buffer_cache >= 90 ? 'text-green-600' : 'text-orange-500'}`}>
                          {memoryData.hit_ratios.buffer_cache}%
                        </span>
                      </div>
                      <Progress value={memoryData.hit_ratios.buffer_cache} className="h-2" />
                      <p className="text-xs text-muted-foreground">권장: 90% 이상</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">Library Cache</span>
                        <span className={`font-bold ${memoryData.hit_ratios.library_cache >= 99 ? 'text-green-600' : 'text-orange-500'}`}>
                          {memoryData.hit_ratios.library_cache}%
                        </span>
                      </div>
                      <Progress value={memoryData.hit_ratios.library_cache} className="h-2" />
                      <p className="text-xs text-muted-foreground">권장: 99% 이상</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">Dictionary Cache</span>
                        <span className={`font-bold ${memoryData.hit_ratios.dictionary_cache >= 95 ? 'text-green-600' : 'text-orange-500'}`}>
                          {memoryData.hit_ratios.dictionary_cache}%
                        </span>
                      </div>
                      <Progress value={memoryData.hit_ratios.dictionary_cache} className="h-2" />
                      <p className="text-xs text-muted-foreground">권장: 95% 이상</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 상세 분석 */}
              <Card>
                <CardHeader>
                  <CardTitle>상세 메모리 분석</CardTitle>
                  <CardDescription>메모리 크기 조정에 따른 성능 예측</CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="db-cache" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="db-cache">DB Cache (I/O)</TabsTrigger>
                      <TabsTrigger value="shared-pool">Shared Pool (CPU)</TabsTrigger>
                      <TabsTrigger value="pga">PGA (Temp)</TabsTrigger>
                    </TabsList>

                    <TabsContent value="db-cache" className="space-y-3 mt-4">
                      <div className="bg-secondary/30 p-3 rounded mb-4 text-sm flex items-center gap-2">
                        <Info className="h-4 w-4 text-blue-500" />
                        <span>Buffer Cache 크기를 늘리면 <strong>물리적 I/O (Disk Read)</strong>가 감소하여 성능이 향상됩니다.</span>
                      </div>
                      {memoryData.db_cache_advice?.length > 0 ? (
                        memoryData.db_cache_advice.map((item, index) => (
                          <div
                            key={`db-cache-${item.size_mb}-${item.size_factor}-${index}`}
                            className={`border rounded p-3 transition-colors ${item.size_factor === 1 ? 'bg-primary/5 border-primary/20 ring-1 ring-primary/20' : 'hover:bg-muted/50'}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold w-20">{item.size_mb} MB</span>
                                {item.size_factor === 1 && <Badge variant="default">현재 크기</Badge>}
                                <Badge variant="outline" className="text-xs font-normal text-muted-foreground">x{item.size_factor}</Badge>
                              </div>
                              <div className="text-right">
                                {item.size_factor === 1 ? (
                                  <span className="text-sm font-medium text-muted-foreground">기준 (Baseline)</span>
                                ) : item.benefit_pct > 0 ? (
                                  <span className="text-sm font-bold text-green-600 flex items-center justify-end gap-1">
                                    <TrendingDown className="h-3 w-3" />
                                    I/O {item.benefit_pct.toFixed(1)}% 감소
                                  </span>
                                ) : (
                                  <span className="text-sm font-bold text-red-500 flex items-center justify-end gap-1">
                                    <TrendingUp className="h-3 w-3" />
                                    I/O {Math.abs(item.benefit_pct).toFixed(1)}% 증가
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="mt-2 w-full bg-muted/30 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full ${item.size_factor === 1 ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                                style={{ width: `${Math.min(100, (item.estd_physical_reads / (memoryData.db_cache_advice.find(x => x.size_factor === 0.5)?.estd_physical_reads || item.estd_physical_reads)) * 100)}%` }}
                              />
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 text-right">
                              예상 물리적 읽기: {item.estd_physical_reads.toLocaleString()}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-center text-muted-foreground py-8">
                          데이터를 사용할 수 없습니다
                        </p>
                      )}
                    </TabsContent>

                    <TabsContent value="shared-pool" className="space-y-3 mt-4">
                      <div className="bg-secondary/30 p-3 rounded mb-4 text-sm flex items-center gap-2">
                        <Info className="h-4 w-4 text-blue-500" />
                        <span>Shared Pool 크기를 늘리면 <strong>파싱 시간(CPU)</strong>이 감소하여 성능이 향상됩니다.</span>
                      </div>
                      {memoryData.shared_pool_advice?.length > 0 ? (
                        memoryData.shared_pool_advice.map((item, index) => (
                          <div
                            key={`shared-pool-${item.size_mb}-${item.size_factor}-${index}`}
                            className={`border rounded p-3 transition-colors ${item.size_factor === 1 ? 'bg-primary/5 border-primary/20 ring-1 ring-primary/20' : 'hover:bg-muted/50'}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold w-20">{item.size_mb} MB</span>
                                {item.size_factor === 1 && <Badge variant="default">현재 크기</Badge>}
                                <Badge variant="outline" className="text-xs font-normal text-muted-foreground">x{item.size_factor}</Badge>
                              </div>
                              <div className="text-right">
                                {item.size_factor === 1 ? (
                                  <span className="text-sm font-medium text-muted-foreground">기준 (Baseline)</span>
                                ) : item.benefit_pct > 0 ? (
                                  <span className="text-sm font-bold text-green-600 flex items-center justify-end gap-1">
                                    <TrendingDown className="h-3 w-3" />
                                    로딩 시간 {item.benefit_pct.toFixed(1)}% 단축
                                  </span>
                                ) : (
                                  <span className="text-sm font-bold text-red-500 flex items-center justify-end gap-1">
                                    <TrendingUp className="h-3 w-3" />
                                    로딩 시간 {Math.abs(item.benefit_pct).toFixed(1)}% 지연
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1 text-right">
                              예상 로드 시간: {item.estd_lc_load_time.toFixed(0)} s
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-center text-muted-foreground py-8">
                          데이터를 사용할 수 없습니다
                        </p>
                      )}
                    </TabsContent>

                    <TabsContent value="pga" className="space-y-3 mt-4">
                      <div className="bg-secondary/30 p-3 rounded mb-4 text-sm flex items-center gap-2">
                        <Info className="h-4 w-4 text-blue-500" />
                        <span>PGA 크기를 늘리면 <strong>Temp DB I/O</strong>가 감소하여 정렬/해시 작업 성능이 향상됩니다.</span>
                      </div>
                      {memoryData.pga_target_advice?.length > 0 ? (
                        memoryData.pga_target_advice.map((item, index) => (
                          <div
                            key={`pga-target-${item.size_mb}-${item.size_factor}-${index}`}
                            className={`border rounded p-3 transition-colors ${item.size_factor === 1 ? 'bg-primary/5 border-primary/20 ring-1 ring-primary/20' : 'hover:bg-muted/50'}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold w-20">{item.size_mb} MB</span>
                                {item.size_factor === 1 && <Badge variant="default">현재 크기</Badge>}
                                <Badge variant="outline" className="text-xs font-normal text-muted-foreground">x{item.size_factor}</Badge>
                              </div>
                              <div className="text-right">
                                <span className="text-sm font-medium">
                                  예상 추가 I/O: {formatBytes(item.estd_extra_bytes_rw)}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-center text-muted-foreground py-8">
                          데이터를 사용할 수 없습니다
                        </p>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
