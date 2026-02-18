'use client';

/**
 * SQL Cluster Analysis Page
 * TMS 2.0 스타일 - SQL 등급 시스템 (A-F) 및 클러스터 분석
 */

import { useState, useCallback } from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  GitBranch,
  Play,
  RefreshCw,
  Download,
  Database,
  Cpu,
  Activity,
  Clock,
  Copy,
  ExternalLink,
  AlertTriangle,
  TrendingUp,
  BarChart3,
  Filter
} from 'lucide-react';
import { SQLClusterChart, generateMockSQLClusterData } from '@/components/charts/sql-cluster-chart';
import { PatternAnalysisComponent } from '@/components/charts/pattern-analysis';
import { useToast } from '@/hooks/use-toast';
import { ClusterData } from '@/types/performance';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { downloadClusterReport } from '@/lib/reports/cluster-report';
import {
  SQLGrade,
  SQL_GRADES,
  SQLClusterPoint,
  getGradeInfo,
  calculateSQLGrade
} from '@/lib/sql-grading';

export default function SqlClustersPage() {
  const [clusters, setClusters] = useState<ClusterData[]>([]);
  const [sqlClusterData, setSqlClusterData] = useState<SQLClusterPoint[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [selectedSQL, setSelectedSQL] = useState<SQLClusterPoint | null>(null);
  const [sqlDetailModalOpen, setSqlDetailModalOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [selectedMinutes, setSelectedMinutes] = useState('60');
  const [analyzedMinutes, setAnalyzedMinutes] = useState<string | null>(null);
  const [selectedGradeFilter, setSelectedGradeFilter] = useState<SQLGrade | 'ALL'>('ALL');
  const [sqlLimit, setSqlLimit] = useState('100');
  const { toast } = useToast();
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
  const router = useRouter();

  // SQL 등급별 통계 계산
  const gradeStats = sqlClusterData.reduce((acc, sql) => {
    acc[sql.grade] = (acc[sql.grade] || 0) + 1;
    return acc;
  }, {} as Record<SQLGrade, number>);

  // 필터링된 SQL 데이터
  const filteredClusterData = selectedGradeFilter === 'ALL'
    ? sqlClusterData
    : sqlClusterData.filter(sql => sql.grade === selectedGradeFilter);

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
      // SQL Grades API 호출
      const gradesResponse = await fetch(
        `/api/monitoring/sql-grades?connectionId=${selectedConnectionId}&limit=${sqlLimit}`
      );

      if (gradesResponse.ok) {
        const gradesResult = await gradesResponse.json();
        if (gradesResult.success && gradesResult.data) {
          setSqlClusterData(gradesResult.data);
          setAnalyzedMinutes(selectedMinutes);
          toast({
            title: 'SQL 등급 분석 완료',
            description: `${gradesResult.data.length}개의 SQL이 분석되었습니다.`,
          });
        }
      } else {
        // 폴백: Mock 데이터 사용
        const mockData = generateMockSQLClusterData(50);
        setSqlClusterData(mockData);
        setAnalyzedMinutes(selectedMinutes);
        toast({
          title: 'SQL 등급 분석 완료 (샘플)',
          description: `${mockData.length}개의 SQL이 분석되었습니다. (샘플 데이터)`,
        });
      }

      // 클러스터 분석 API 호출
      const clusterResponse = await fetch('/api/clusters/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: selectedConnectionId,
          algorithm: 'kmeans',
          k: 5,
          minutes: parseInt(selectedMinutes)
        })
      });

      if (clusterResponse.ok) {
        const data = await clusterResponse.json();
        if (data.success) {
          const clusterData: ClusterData[] = data.data.clusters.map((cluster: any) => ({
            id: cluster.id,
            name: `${cluster.name}`,
            points: cluster.members.map((member: any) => ({
              sql_id: member.sql_id,
              x: member.cpu_time_per_exec,
              y: member.buffer_gets_per_exec,
              size: member.elapsed_time_per_exec,
              grade: calculateGradeFromMember(member),
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
        }
      }
    } catch (error) {
      // 에러 시 Mock 데이터 사용
      const mockData = generateMockSQLClusterData(50);
      setSqlClusterData(mockData);
      setAnalyzedMinutes(selectedMinutes);
      toast({
        title: 'SQL 등급 분석 완료 (샘플)',
        description: `연결 오류로 샘플 데이터를 표시합니다.`,
      });
    } finally {
      setAnalysisRunning(false);
    }
  };

  const calculateGradeFromMember = (member: any): SQLGrade => {
    return calculateSQLGrade({
      elapsedSec: (member.elapsed_time_per_exec || 0) / 1000,
      cpuSec: (member.cpu_time_per_exec || 0) / 1000,
      executions: 1,
      bufferGets: member.buffer_gets_per_exec || 0,
      diskReads: 0,
    });
  };

  const handleSQLClick = useCallback((sql: SQLClusterPoint) => {
    setSelectedSQL(sql);
    setSqlDetailModalOpen(true);
  }, []);

  const handleCopySQLId = (sqlId: string) => {
    navigator.clipboard.writeText(sqlId);
    toast({
      title: 'SQL ID 복사됨',
      description: sqlId,
    });
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
      {/* Header - TMS 2.0 스타일 */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">SQL Cluster Analysis & Grading</h1>
              <p className="text-sm text-muted-foreground">
                SQL 등급 시스템 (A-F) 기반 성능 클러스터링
              </p>
            </div>
          </div>
          {selectedConnection && (
            <div className="flex items-center gap-2 mt-3 ml-13">
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm text-muted-foreground">
                {selectedConnection.name} ({selectedConnection.host}:{selectedConnection.port})
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* 분석 기간 선택 */}
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedMinutes} onValueChange={setSelectedMinutes}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="분석 기간" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">최근 30분</SelectItem>
                <SelectItem value="60">최근 1시간</SelectItem>
                <SelectItem value="180">최근 3시간</SelectItem>
                <SelectItem value="360">최근 6시간</SelectItem>
                <SelectItem value="720">최근 12시간</SelectItem>
                <SelectItem value="1440">최근 24시간</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* SQL 개수 선택 */}
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <Select value={sqlLimit} onValueChange={setSqlLimit}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="SQL 개수" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="100">Top 100</SelectItem>
                <SelectItem value="250">Top 250</SelectItem>
                <SelectItem value="500">Top 500</SelectItem>
                <SelectItem value="1000">Top 1,000</SelectItem>
                <SelectItem value="2000">Top 2,000</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={runClusterAnalysis} disabled={!selectedConnectionId || analysisRunning}>
            {analysisRunning ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                분석 중...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                분석 실행
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="icon"
            disabled={sqlClusterData.length === 0}
            onClick={() => setExportDialogOpen(true)}
            title="리포트 다운로드"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Grade Summary Cards - TMS 2.0 스타일 */}
      {sqlClusterData.length > 0 && (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {(Object.entries(SQL_GRADES) as [SQLGrade, typeof SQL_GRADES[SQLGrade]][]).map(([grade, info]) => (
            <button
              key={grade}
              onClick={() => setSelectedGradeFilter(selectedGradeFilter === grade ? 'ALL' : grade)}
              className={`p-3 rounded-lg border transition-all ${
                selectedGradeFilter === grade ? 'ring-2 ring-offset-2 ring-offset-background' : ''
              }`}
              style={{
                backgroundColor: info.bgColor,
                borderColor: `${info.color}40`,
                ...(selectedGradeFilter === grade ? { ringColor: info.color } : {})
              }}
            >
              <div className="flex items-center justify-between mb-1">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm"
                  style={{
                    backgroundColor: `${info.color}20`,
                    color: info.color,
                    border: `2px solid ${info.color}`,
                  }}
                >
                  {grade}
                </div>
                <span className="text-2xl font-bold" style={{ color: info.color }}>
                  {gradeStats[grade] || 0}
                </span>
              </div>
              <div className="text-xs text-muted-foreground text-left">{info.label}</div>
            </button>
          ))}
        </div>
      )}

      <Tabs defaultValue="cluster-chart" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="cluster-chart">클러스터 차트</TabsTrigger>
          <TabsTrigger value="sql-list">SQL 목록</TabsTrigger>
          <TabsTrigger value="analysis">상세 분석</TabsTrigger>
          <TabsTrigger value="patterns">패턴 분석</TabsTrigger>
        </TabsList>

        {/* 클러스터 차트 탭 */}
        <TabsContent value="cluster-chart" className="space-y-4">
          {analysisRunning ? (
            <Card>
              <CardContent className="p-12">
                <div className="text-center">
                  <RefreshCw className="h-12 w-12 text-muted-foreground mx-auto mb-4 animate-spin" />
                  <h3 className="text-lg font-semibold mb-2">SQL 등급 분석 실행 중...</h3>
                  <p className="text-muted-foreground">SQL 성능 데이터를 분석하여 등급을 산정하고 있습니다.</p>
                </div>
              </CardContent>
            </Card>
          ) : sqlClusterData.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">SQL 등급 분석이 필요합니다</h3>
                <p className="text-muted-foreground mb-6">
                  SQL 성능 데이터를 분석하여 A-F 등급을 산정합니다
                </p>
                <Button onClick={runClusterAnalysis} disabled={!selectedConnectionId}>
                  <Play className="mr-2 h-4 w-4" />
                  분석 시작
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-primary" />
                      SQL Cluster Distribution
                    </CardTitle>
                    <CardDescription>
                      X: Elapsed Time/Exec (log), Y: Buffer Gets/Exec (log), Size: Executions
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Select
                      value={selectedGradeFilter}
                      onValueChange={(v) => setSelectedGradeFilter(v as SQLGrade | 'ALL')}
                    >
                      <SelectTrigger className="w-[130px]">
                        <SelectValue placeholder="등급 필터" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All Grades</SelectItem>
                        {Object.keys(SQL_GRADES).map(g => (
                          <SelectItem key={g} value={g}>Grade {g}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Badge variant="secondary" className="ml-2">
                      {filteredClusterData.length} SQLs
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <SQLClusterChart
                  data={filteredClusterData}
                  onSQLClick={handleSQLClick}
                  height={500}
                  showLegend={true}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* SQL 목록 탭 */}
        <TabsContent value="sql-list">
          {sqlClusterData.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Database className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">데이터 없음</h3>
                <p className="text-muted-foreground">먼저 분석을 실행해주세요</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>SQL List by Grade</CardTitle>
                    <CardDescription>Click row to view details</CardDescription>
                  </div>
                  <Badge variant="outline">{filteredClusterData.length} items</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background border-b">
                      <tr>
                        <th className="text-left py-3 px-4 font-medium">Grade</th>
                        <th className="text-left py-3 px-4 font-medium">SQL ID</th>
                        <th className="text-left py-3 px-4 font-medium">Module</th>
                        <th className="text-right py-3 px-4 font-medium">Executions</th>
                        <th className="text-right py-3 px-4 font-medium">Elapsed/Exec</th>
                        <th className="text-right py-3 px-4 font-medium">Buffer/Exec</th>
                        <th className="text-left py-3 px-4 font-medium">Wait Class</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...filteredClusterData]
                        .sort((a, b) => {
                          const gradeOrder: Record<SQLGrade, number> = { F: 0, D: 1, C: 2, B: 3, A: 4 };
                          return gradeOrder[a.grade] - gradeOrder[b.grade];
                        })
                        .map((sql, i) => {
                          const gradeInfo = getGradeInfo(sql.grade);
                          return (
                            <tr
                              key={`${sql.sqlId}-${i}`}
                              className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                              onClick={() => handleSQLClick(sql)}
                            >
                              <td className="py-3 px-4">
                                <div
                                  className="w-7 h-7 rounded flex items-center justify-center font-bold text-xs"
                                  style={{
                                    backgroundColor: `${gradeInfo.color}20`,
                                    color: gradeInfo.color,
                                    border: `2px solid ${gradeInfo.color}`,
                                  }}
                                >
                                  {sql.grade}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <code className="text-xs font-mono bg-primary/10 text-primary px-2 py-1 rounded">
                                    {sql.sqlId}
                                  </code>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleCopySQLId(sql.sqlId);
                                    }}
                                    className="text-muted-foreground hover:text-foreground"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </button>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-xs text-green-600">{sql.module || '-'}</td>
                              <td className="py-3 px-4 text-right font-mono">
                                {sql.executions.toLocaleString()}
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-yellow-600">
                                {(sql.elapsedPerExec * 1000).toFixed(2)}ms
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-purple-600">
                                {Math.round(sql.bufferPerExec).toLocaleString()}
                              </td>
                              <td className="py-3 px-4">
                                {sql.waitClass && (
                                  <Badge variant="outline" className="text-xs">
                                    {sql.waitClass}
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* 상세 분석 탭 */}
        <TabsContent value="analysis">
          <div className="grid gap-6">
            {clusters.length > 0 ? (
              clusters.map((cluster) => (
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
                          <p className="text-sm text-muted-foreground">평균 실행시간</p>
                          <p className="font-semibold">{cluster.characteristics.avgElapsedTime.toFixed(0)}ms</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Cpu className="h-4 w-4 text-green-600" />
                        <div>
                          <p className="text-sm text-muted-foreground">평균 CPU 시간</p>
                          <p className="font-semibold">{cluster.characteristics.avgCpuTime.toFixed(0)}ms</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Database className="h-4 w-4 text-blue-600" />
                        <div>
                          <p className="text-sm text-muted-foreground">평균 Buffer Gets</p>
                          <p className="font-semibold">{cluster.characteristics.avgBufferGets.toFixed(0)}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Activity className="h-4 w-4 text-purple-600" />
                        <div>
                          <p className="text-sm text-muted-foreground">총 실행 횟수</p>
                          <p className="font-semibold">{cluster.characteristics.totalExecutions}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="p-12 text-center">
                  <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">클러스터 분석 데이터 없음</h3>
                  <p className="text-muted-foreground">분석을 실행하면 클러스터별 상세 정보가 표시됩니다</p>
                </CardContent>
              </Card>
            )}

            {/* Grade Criteria Info */}
            <Card>
              <CardHeader>
                <CardTitle>SQL Grade Criteria</CardTitle>
                <CardDescription>등급 산정 기준</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(Object.entries(SQL_GRADES) as [SQLGrade, typeof SQL_GRADES[SQLGrade]][]).map(([grade, info]) => (
                    <div
                      key={grade}
                      className="p-3 rounded-lg border"
                      style={{ backgroundColor: info.bgColor, borderColor: `${info.color}30` }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className="w-8 h-8 rounded flex items-center justify-center font-bold"
                          style={{
                            backgroundColor: `${info.color}20`,
                            color: info.color,
                            border: `2px solid ${info.color}`,
                          }}
                        >
                          {grade}
                        </div>
                        <div>
                          <span className="font-semibold" style={{ color: info.color }}>{info.label}</span>
                          <span className="text-muted-foreground text-sm ml-2">{info.description}</span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{info.criteria}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 패턴 분석 탭 */}
        <TabsContent value="patterns">
          {clusters.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <GitBranch className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">클러스터 분석이 필요합니다</h3>
                <p className="text-muted-foreground mb-6">
                  먼저 분석을 실행하여 패턴을 식별해보세요
                </p>
                <Button onClick={runClusterAnalysis} disabled={!selectedConnectionId}>
                  <Play className="mr-2 h-4 w-4" />
                  분석 시작
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

      {/* SQL 상세 정보 모달 - TMS 2.0 스타일 */}
      <Dialog open={sqlDetailModalOpen} onOpenChange={setSqlDetailModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 pr-12 flex-shrink-0 border-b">
            <DialogTitle className="flex items-center gap-3">
              {selectedSQL && (
                <>
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-lg"
                    style={{
                      backgroundColor: `${getGradeInfo(selectedSQL.grade).color}20`,
                      color: getGradeInfo(selectedSQL.grade).color,
                      border: `2px solid ${getGradeInfo(selectedSQL.grade).color}`,
                    }}
                  >
                    {selectedSQL.grade}
                  </div>
                  <div>
                    <div className="text-lg font-bold">SQL Detail</div>
                    <code className="text-sm font-mono text-muted-foreground">{selectedSQL.sqlId}</code>
                  </div>
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedSQL && (
            <ScrollArea className="flex-1 min-h-0 px-6">
              <div className="space-y-4 py-4">
                {/* Grade Info */}
                <div
                  className="p-4 rounded-lg"
                  style={{
                    backgroundColor: getGradeInfo(selectedSQL.grade).bgColor,
                    border: `1px solid ${getGradeInfo(selectedSQL.grade).color}40`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg font-bold" style={{ color: getGradeInfo(selectedSQL.grade).color }}>
                      Grade {selectedSQL.grade}: {getGradeInfo(selectedSQL.grade).label}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{getGradeInfo(selectedSQL.grade).description}</p>
                  <p className="text-xs text-muted-foreground mt-1">기준: {getGradeInfo(selectedSQL.grade).criteria}</p>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground">Executions</div>
                    <div className="text-xl font-bold">{selectedSQL.executions.toLocaleString()}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground">Total Elapsed</div>
                    <div className="text-xl font-bold text-yellow-600">{selectedSQL.elapsedSec.toFixed(2)}s</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground">Elapsed/Exec</div>
                    <div className="text-xl font-bold text-orange-600">{(selectedSQL.elapsedPerExec * 1000).toFixed(2)}ms</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground">CPU Time</div>
                    <div className="text-xl font-bold text-green-600">{selectedSQL.cpuSec.toFixed(2)}s</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground">Buffer Gets</div>
                    <div className="text-xl font-bold text-purple-600">{selectedSQL.bufferGets.toLocaleString()}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground">Buffer/Exec</div>
                    <div className="text-xl font-bold text-blue-600">{Math.round(selectedSQL.bufferPerExec).toLocaleString()}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground">Disk Reads</div>
                    <div className="text-xl font-bold text-red-600">{selectedSQL.diskReads.toLocaleString()}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground">Rows Processed</div>
                    <div className="text-xl font-bold text-cyan-600">{selectedSQL.rowsProcessed.toLocaleString()}</div>
                  </div>
                  {selectedSQL.module && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <div className="text-xs text-muted-foreground">Module</div>
                      <div className="text-lg font-bold text-green-600">{selectedSQL.module}</div>
                    </div>
                  )}
                </div>

                {/* SQL Text Section */}
                {selectedSQL.sqlText && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold">SQL Text</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedSQL.sqlText || '');
                          toast({
                            title: 'SQL 복사됨',
                            description: 'SQL 텍스트가 클립보드에 복사되었습니다.',
                          });
                        }}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        복사
                      </Button>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/30 border">
                      <ScrollArea className="h-[120px]">
                        <pre className="text-xs font-mono whitespace-pre-wrap break-all text-foreground/80">
                          {selectedSQL.sqlText}
                        </pre>
                      </ScrollArea>
                    </div>
                  </div>
                )}

                {/* Bind Variables Section */}
                {selectedSQL.bindVariables && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">바인드 변수</h4>
                    <div className="p-3 rounded-lg bg-muted/30 border">
                      <pre className="text-xs font-mono whitespace-pre-wrap break-all text-foreground/80">
                        {selectedSQL.bindVariables}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Recommendations for Poor Grades (D or F) */}
                {(selectedSQL.grade === 'D' || selectedSQL.grade === 'F') && (
                  <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                    <h4 className="text-destructive font-semibold mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      튜닝 권장사항
                    </h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {selectedSQL.bufferPerExec > 10000 && <li>• Buffer Gets/Exec가 높음 - 인덱스 검토 필요</li>}
                      {selectedSQL.elapsedPerExec > 1 && <li>• 실행당 경과시간이 김 - 실행계획 분석 필요</li>}
                      {selectedSQL.diskReads / selectedSQL.bufferGets > 0.1 && <li>• 물리적 I/O 비율이 높음 - 메모리 캐싱 검토</li>}
                      <li>• SQL Advisor 실행 권장</li>
                    </ul>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          {/* Action Buttons - Fixed at bottom */}
          {selectedSQL && (
            <div className="flex justify-between items-center px-6 py-4 border-t bg-background flex-shrink-0">
              <Button
                variant="outline"
                onClick={() => {
                  router.push(`/execution-plans?connection_id=${selectedConnectionId}&sql_id=${selectedSQL.sqlId}`);
                  setSqlDetailModalOpen(false);
                }}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View Execution Plan
              </Button>
              <Button variant="outline" onClick={() => setSqlDetailModalOpen(false)}>
                Close
              </Button>
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
                <strong>포함 내용:</strong> {sqlClusterData.length}개 SQL 문, 등급별 분포
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
