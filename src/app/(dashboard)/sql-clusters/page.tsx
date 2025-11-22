'use client';

/**
 * SQL Cluster Analysis Page
 * ML 기반 SQL 성능 클러스터링 및 패턴 분석
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  GitBranch,
  Play,
  RefreshCw,
  Download,
  Database,
  Cpu,
  Activity,
  Clock
} from 'lucide-react';
import { ScatterPlot } from '@/components/charts/scatter-plot';
import { PatternAnalysisComponent } from '@/components/charts/pattern-analysis';
import { useToast } from '@/hooks/use-toast';
import { PerformancePoint, ClusterData } from '@/types/performance';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { downloadClusterReport } from '@/lib/reports/cluster-report';

export default function SqlClustersPage() {
  const [clusters, setClusters] = useState<ClusterData[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [selectedSqlPoint, setSelectedSqlPoint] = useState<PerformancePoint | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const { toast } = useToast();
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
  const router = useRouter();

  const runClusterAnalysis = async () => {
    if (!selectedConnectionId) {
      toast({
        title: '데이터베이스를 선택하세요',
        description: '상단 헤더에서 Oracle 데이터베이스를 먼저 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    setAnalysisRunning(true);
    try {
      const response = await fetch('/api/clusters/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: selectedConnectionId,
          algorithm: 'kmeans',
          k: 5
        })
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: '클러스터 분석 완료',
          description: `${data.data.clusters.length}개의 클러스터가 생성되었습니다.`,
        });

        // API 응답을 ClusterData 형식으로 변환
        const clusterData: ClusterData[] = data.data.clusters.map((cluster: any, index: number) => ({
          id: cluster.id,
          name: `${cluster.name}`,
          points: cluster.members.map((member: any) => ({
            sql_id: member.sql_id,
            x: member.cpu_time_per_exec,
            y: member.buffer_gets_per_exec,
            size: member.elapsed_time_per_exec,
            grade: calculateGrade(member),
            metrics: {
              elapsed_time: member.elapsed_time_per_exec,
              cpu_time: member.cpu_time_per_exec,
              buffer_gets: member.buffer_gets_per_exec,
              disk_reads: 0,
              executions: 1,
              rows_processed: 0,
              parse_calls: 0,
              sorts: 0,
            }
          })),
          centroid: {
            x: cluster.centroid.cpu_time,
            y: cluster.centroid.buffer_gets
          },
          avgPerformanceScore: cluster.avgScore,
          characteristics: {
            avgCpuTime: cluster.characteristics.avgCpuTime,
            avgElapsedTime: cluster.characteristics.avgElapsedTime,
            avgBufferGets: cluster.characteristics.avgBufferGets,
            totalExecutions: cluster.characteristics.totalExecutions
          }
        }));

        setClusters(clusterData);
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: '클러스터 분석 실패',
        description: error instanceof Error ? error.message : '알 수 없는 오류',
        variant: 'destructive',
      });
    } finally {
      setAnalysisRunning(false);
    }
  };

  const calculateGrade = (member: any): 'A' | 'B' | 'C' | 'D' | 'F' => {
    let score = 100;
    if (member.elapsed_time_per_exec > 1000) score -= 20;
    if (member.cpu_time_per_exec > 500) score -= 15;
    if (member.buffer_gets_per_exec > 10000) score -= 15;

    if (score >= 80) return 'A';
    if (score >= 65) return 'B';
    if (score >= 50) return 'C';
    if (score >= 35) return 'D';
    return 'F';
  };

  const getAllPoints = (): PerformancePoint[] => {
    if (!clusters.length) return [];
    return clusters.flatMap((cluster) => cluster.points);
  };

  const getSelectedClusterPoints = (): PerformancePoint[] => {
    if (!selectedCluster) return getAllPoints();
    const cluster = clusters.find(c => c.id === selectedCluster);
    return cluster ? cluster.points : [];
  };

  const handleExport = (format: 'csv' | 'json' | 'html') => {
    try {
      downloadClusterReport(clusters, format, selectedConnection?.name);
      toast({
        title: '리포트 다운로드 완료',
        description: `${format.toUpperCase()} 형식으로 리포트가 다운로드되었습니다.`,
      });
      setExportDialogOpen(false);
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: '다운로드 실패',
        description: '리포트 다운로드 중 오류가 발생했습니다.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">SQL 클러스터 분석</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            ML 기반 군집 분석으로 성능 패턴을 식별하고 최적화 가이드를 제공합니다
          </p>
          {selectedConnection && (
            <p className="text-sm text-muted-foreground mt-1">
              연결: <span className="font-medium">{selectedConnection.name}</span>
            </p>
          )}
        </div>

        <div className="flex items-center space-x-3">
          <Button onClick={runClusterAnalysis} disabled={!selectedConnectionId || analysisRunning}>
            {analysisRunning ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                분석 중...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                클러스터 분석 실행
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="icon"
            disabled={clusters.length === 0}
            onClick={() => setExportDialogOpen(true)}
            title="리포트 다운로드"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Cluster Summary Cards */}
      {clusters.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {clusters.map((cluster) => (
            <Card
              key={cluster.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                selectedCluster === cluster.id ? 'ring-2 ring-blue-500' : ''
              }`}
              onClick={() => setSelectedCluster(selectedCluster === cluster.id ? null : cluster.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{cluster.name}</CardTitle>
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">SQL 수</span>
                    <span className="text-sm font-semibold">{cluster.points.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">평균 점수</span>
                    <Badge variant={cluster.avgPerformanceScore > 70 ? 'default' : 'destructive'}>
                      {cluster.avgPerformanceScore}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">평균 CPU</span>
                    <span className="text-xs">{cluster.characteristics.avgCpuTime.toFixed(0)}ms</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs defaultValue="visualization" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="visualization">클러스터 시각화</TabsTrigger>
          <TabsTrigger value="analysis">상세 분석</TabsTrigger>
          <TabsTrigger value="patterns">패턴 분석</TabsTrigger>
        </TabsList>

        <TabsContent value="visualization" className="space-y-4">
          {analysisRunning ? (
            <Card>
              <CardContent className="p-12">
                <div className="text-center">
                  <RefreshCw className="h-12 w-12 text-gray-400 mx-auto mb-4 animate-spin" />
                  <h3 className="text-lg font-semibold mb-2">클러스터 분석 실행 중...</h3>
                  <p className="text-muted-foreground">SQL 성능 데이터를 분석하여 클러스터를 생성하고 있습니다.</p>
                </div>
              </CardContent>
            </Card>
          ) : clusters.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <GitBranch className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">클러스터 분석이 필요합니다</h3>
                <p className="text-muted-foreground mb-6">
                  SQL 성능 데이터를 클러스터링하여 패턴을 분석해보세요
                </p>
                <Button onClick={runClusterAnalysis} disabled={!selectedConnectionId}>
                  <Play className="mr-2 h-4 w-4" />
                  클러스터 분석 시작
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>클러스터 산점도</CardTitle>
                    <CardDescription>
                      {selectedCluster
                        ? `선택된 클러스터: ${clusters.find(c => c.id === selectedCluster)?.name}`
                        : '전체 클러스터 표시'}
                    </CardDescription>
                  </div>
                  {selectedCluster && (
                    <Button variant="outline" size="sm" onClick={() => setSelectedCluster(null)}>
                      전체 보기
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <ScatterPlot
                  data={getSelectedClusterPoints()}
                  width={1000}
                  height={600}
                  xLabel="CPU Time per Execution (ms)"
                  yLabel="Buffer Gets per Execution"
                  onPointClick={(point) => {
                    setSelectedSqlPoint(point);
                    setDialogOpen(true);
                  }}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="analysis">
          <div className="grid gap-6">
            {clusters.map((cluster) => (
              <Card key={cluster.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center">
                        <GitBranch className="mr-2 h-5 w-5" />
                        {cluster.name}
                      </CardTitle>
                      <CardDescription>
                        {cluster.points.length}개 SQL • 평균 성능 점수: {cluster.avgPerformanceScore}
                      </CardDescription>
                    </div>
                    <Badge variant={cluster.avgPerformanceScore > 70 ? 'default' : 'destructive'}>
                      {cluster.avgPerformanceScore > 80 ? '우수' :
                       cluster.avgPerformanceScore > 60 ? '보통' : '개선 필요'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-orange-600" />
                      <div>
                        <p className="text-sm text-gray-500">평균 실행시간</p>
                        <p className="font-semibold">{cluster.characteristics.avgElapsedTime.toFixed(0)}ms</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Cpu className="h-4 w-4 text-green-600" />
                      <div>
                        <p className="text-sm text-gray-500">평균 CPU 시간</p>
                        <p className="font-semibold">{cluster.characteristics.avgCpuTime.toFixed(0)}ms</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Database className="h-4 w-4 text-blue-600" />
                      <div>
                        <p className="text-sm text-gray-500">평균 Buffer Gets</p>
                        <p className="font-semibold">{cluster.characteristics.avgBufferGets.toFixed(0)}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Activity className="h-4 w-4 text-purple-600" />
                      <div>
                        <p className="text-sm text-gray-500">총 실행 횟수</p>
                        <p className="font-semibold">{cluster.characteristics.totalExecutions}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="patterns">
          {clusters.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <GitBranch className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">클러스터 분석이 필요합니다</h3>
                <p className="text-muted-foreground mb-6">
                  먼저 클러스터 분석을 실행하여 패턴을 식별해보세요
                </p>
                <Button onClick={runClusterAnalysis} disabled={!selectedConnectionId}>
                  <Play className="mr-2 h-4 w-4" />
                  클러스터 분석 시작
                </Button>
              </CardContent>
            </Card>
          ) : (
            <PatternAnalysisComponent
              clusters={clusters}
              selectedClusterId={selectedCluster}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* SQL 상세정보 다이얼로그 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>SQL 상세정보</DialogTitle>
            <DialogDescription>
              선택한 SQL 문의 성능 메트릭 정보입니다
            </DialogDescription>
          </DialogHeader>

          {selectedSqlPoint && (
            <div className="space-y-6">
              {/* SQL ID 및 성능 등급 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">SQL ID</label>
                  <div className="mt-1 text-lg font-mono">
                    {selectedSqlPoint.sql_id.replace(/^SQL_/, '')}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">성능 등급</label>
                  <div className="mt-1">
                    <Badge
                      variant={
                        selectedSqlPoint.grade === 'A' || selectedSqlPoint.grade === 'B'
                          ? 'default'
                          : 'destructive'
                      }
                      className="text-lg px-3 py-1"
                    >
                      {selectedSqlPoint.grade}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* 성능 메트릭 */}
              <div>
                <h4 className="text-sm font-semibold mb-3">성능 메트릭</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="text-sm text-muted-foreground">CPU Time</span>
                    <span className="font-semibold">{selectedSqlPoint.metrics.cpu_time.toFixed(2)} ms</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="text-sm text-muted-foreground">Elapsed Time</span>
                    <span className="font-semibold">{selectedSqlPoint.metrics.elapsed_time.toFixed(2)} ms</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="text-sm text-muted-foreground">Buffer Gets</span>
                    <span className="font-semibold">{selectedSqlPoint.metrics.buffer_gets.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="text-sm text-muted-foreground">Disk Reads</span>
                    <span className="font-semibold">{selectedSqlPoint.metrics.disk_reads.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="text-sm text-muted-foreground">Executions</span>
                    <span className="font-semibold">{selectedSqlPoint.metrics.executions.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span className="text-sm text-muted-foreground">Rows Processed</span>
                    <span className="font-semibold">{selectedSqlPoint.metrics.rows_processed.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* 실행계획 보기 버튼 */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                >
                  닫기
                </Button>
                <Button
                  onClick={() => {
                    const sqlId = selectedSqlPoint.sql_id.replace(/^SQL_/, '');
                    router.push(`/execution-plans?connection_id=${selectedConnectionId}&sql_id=${sqlId}`);
                    setDialogOpen(false);
                  }}
                >
                  실행계획 보기
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 리포트 내보내기 다이얼로그 */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>리포트 내보내기</DialogTitle>
            <DialogDescription>
              클러스터 분석 결과를 파일로 다운로드할 수 있습니다
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start h-auto py-4"
                onClick={() => handleExport('csv')}
              >
                <div className="text-left">
                  <div className="font-semibold flex items-center">
                    <Database className="h-4 w-4 mr-2" />
                    CSV (표 형식)
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Excel이나 스프레드시트에서 열기 좋은 형식
                  </div>
                </div>
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start h-auto py-4"
                onClick={() => handleExport('json')}
              >
                <div className="text-left">
                  <div className="font-semibold flex items-center">
                    <Activity className="h-4 w-4 mr-2" />
                    JSON (데이터 형식)
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    프로그래밍 또는 추가 분석을 위한 구조화된 데이터
                  </div>
                </div>
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start h-auto py-4"
                onClick={() => handleExport('html')}
              >
                <div className="text-left">
                  <div className="font-semibold flex items-center">
                    <Clock className="h-4 w-4 mr-2" />
                    HTML (웹 페이지)
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    브라우저에서 바로 볼 수 있는 보기 좋은 리포트
                  </div>
                </div>
              </Button>
            </div>

            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                <strong>포함 내용:</strong> {clusters.length}개 클러스터, {clusters.reduce((sum, c) => sum + c.points.length, 0)}개 SQL 문
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
