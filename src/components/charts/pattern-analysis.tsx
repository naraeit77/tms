'use client';

/**
 * Pattern Analysis Component
 * SQL 성능 패턴 분석 및 최적화 권장사항 표시
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Brain,
  Clock,
  Database,
  Cpu,
  Activity,
  Target,
  Lightbulb,
  ArrowRight
} from 'lucide-react';
import { PatternAnalysis, ClusterPattern, ClusterData } from '@/types/performance';

interface PatternAnalysisProps {
  clusters: ClusterData[];
  selectedClusterId?: string | null;
  onPatternAnalysis?: (patterns: ClusterPattern[]) => void;
}

export function PatternAnalysisComponent({ clusters, selectedClusterId, onPatternAnalysis }: PatternAnalysisProps) {
  const [patterns, setPatterns] = useState<ClusterPattern[]>([]);
  const [selectedPattern, setSelectedPattern] = useState<PatternAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedRecommendation, setSelectedRecommendation] = useState<any>(null);
  const [recommendationDialogOpen, setRecommendationDialogOpen] = useState(false);

  useEffect(() => {
    if (clusters.length > 0) {
      performPatternAnalysis();
    }
  }, [clusters]);

  const performPatternAnalysis = async () => {
    setLoading(true);
    try {
      // Mock 패턴 데이터 생성 (실제 환경에서는 API 호출)
      const mockPatterns = generateMockPatterns(clusters);
      setPatterns(mockPatterns);
      onPatternAnalysis?.(mockPatterns);
    } catch (error) {
      console.error('Pattern analysis failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPatterns = selectedClusterId
    ? patterns.filter(p => p.clusterId === selectedClusterId)
    : patterns;

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'bg-red-100 text-red-800 border-red-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low': return 'bg-green-100 text-green-800 border-green-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getPatternIcon = (type: string) => {
    switch (type) {
      case 'performance': return <TrendingUp className="h-4 w-4" />;
      case 'access': return <Database className="h-4 w-4" />;
      case 'timing': return <Clock className="h-4 w-4" />;
      case 'resource': return <Cpu className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const allPatterns = filteredPatterns.flatMap(cp => cp.patterns);
  const highImpactPatterns = allPatterns.filter(p => p.impact === 'high').length;
  const avgConfidence = allPatterns.reduce((sum, p) => sum + p.confidence, 0) / allPatterns.length || 0;
  const totalOptimizationPotential = filteredPatterns.reduce((sum, cp) => sum + cp.optimizationPotential, 0) / filteredPatterns.length || 0;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              패턴 분석 중...
            </h3>
            <p className="text-gray-500 dark:text-gray-400">
              AI가 클러스터별 성능 패턴을 분석하고 있습니다.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 패턴 분석 개요 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">식별된 패턴</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allPatterns.length}</div>
            <p className="text-xs text-muted-foreground">총 패턴 수</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">고위험 패턴</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{highImpactPatterns}</div>
            <p className="text-xs text-muted-foreground">즉시 조치 필요</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">평균 신뢰도</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgConfidence.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">패턴 정확도</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">최적화 가능성</CardTitle>
            <Lightbulb className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOptimizationPotential.toFixed(0)}%</div>
            <p className="text-xs text-muted-foreground">개선 잠재력</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="patterns" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="patterns">패턴 목록</TabsTrigger>
          <TabsTrigger value="insights">인사이트</TabsTrigger>
          <TabsTrigger value="recommendations">권장사항</TabsTrigger>
        </TabsList>

        <TabsContent value="patterns" className="space-y-4">
          <div className="grid gap-6">
            {filteredPatterns.map((clusterPattern) => (
              <Card key={clusterPattern.clusterId}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{clusterPattern.clusterName}</CardTitle>
                      <CardDescription>
                        {clusterPattern.patterns.length}개 패턴 • 최적화 가능성: {clusterPattern.optimizationPotential.toFixed(0)}%
                      </CardDescription>
                    </div>
                    <Badge variant={clusterPattern.overallScore > 70 ? 'default' : 'destructive'}>
                      점수: {clusterPattern.overallScore.toFixed(0)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {clusterPattern.patterns.map((pattern) => (
                      <div
                        key={pattern.id}
                        className="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                        onClick={() => setSelectedPattern(pattern)}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center space-x-3">
                            {getPatternIcon(pattern.patternType)}
                            <div>
                              <h4 className="font-medium">{pattern.name}</h4>
                              <p className="text-sm text-gray-600 dark:text-gray-400">{pattern.description}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Badge className={getImpactColor(pattern.impact)}>
                              {pattern.impact}
                            </Badge>
                            <span className="text-sm text-gray-500">{pattern.confidence.toFixed(0)}%</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4 text-sm">
                            <span>빈도: {pattern.frequency}</span>
                            <span>•</span>
                            <span>관련 SQL: {pattern.relatedSqlIds.length}개</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-500">신뢰도:</span>
                            <Progress value={pattern.confidence} className="w-16 h-2" />
                          </div>
                        </div>

                        <div className="mt-3">
                          <div className="flex flex-wrap gap-1">
                            {pattern.characteristics.map((char, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {char}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2 text-green-600" />
                  긍정적 패턴
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {allPatterns.filter(p => p.impact === 'low').slice(0, 3).map((pattern, idx) => (
                    <div key={idx} className="flex items-center space-x-3">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <div>
                        <span className="font-medium">{pattern.name}</span>
                        <p className="text-sm text-gray-600">{pattern.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingDown className="h-5 w-5 mr-2 text-red-600" />
                  문제 패턴
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {allPatterns.filter(p => p.impact === 'high').slice(0, 3).map((pattern, idx) => (
                    <div key={idx} className="flex items-center space-x-3">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                      <div>
                        <span className="font-medium">{pattern.name}</span>
                        <p className="text-sm text-gray-600">{pattern.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>패턴 분포</CardTitle>
              <CardDescription>패턴 타입별 분석</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {['performance', 'access', 'timing', 'resource'].map((type) => {
                  const typePatterns = allPatterns.filter(p => p.patternType === type);
                  const percentage = allPatterns.length > 0 ? (typePatterns.length / allPatterns.length) * 100 : 0;

                  return (
                    <div key={type} className="text-center">
                      <div className="flex items-center justify-center mb-2">
                        {getPatternIcon(type)}
                      </div>
                      <div className="text-2xl font-bold">{typePatterns.length}</div>
                      <div className="text-sm text-gray-600 capitalize">{type}</div>
                      <div className="text-xs text-gray-500">{percentage.toFixed(1)}%</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-4">
          <div className="space-y-4">
            {filteredPatterns.map((clusterPattern) => (
              <Card key={clusterPattern.clusterId}>
                <CardHeader>
                  <CardTitle>{clusterPattern.clusterName} 최적화 권장사항</CardTitle>
                  <CardDescription>
                    우선순위별 최적화 방안
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {clusterPattern.patterns
                      .flatMap(p => p.recommendations)
                      .sort((a, b) => {
                        const priorityOrder = { high: 3, medium: 2, low: 1 };
                        return priorityOrder[b.priority] - priorityOrder[a.priority];
                      })
                      .map((rec, idx) => (
                        <div key={rec.id} className="border rounded-lg p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center space-x-3">
                              <div className="text-lg font-semibold text-gray-400">#{idx + 1}</div>
                              <div>
                                <h4 className="font-medium">{rec.title}</h4>
                                <p className="text-sm text-gray-600">{rec.description}</p>
                              </div>
                            </div>
                            <Badge className={getImpactColor(rec.priority)}>
                              {rec.priority}
                            </Badge>
                          </div>

                          <div className="flex items-center justify-between mt-3">
                            <div className="flex items-center space-x-4 text-sm">
                              <span>예상 개선: {rec.expectedImprovement.percentage.toFixed(1)}%</span>
                              <span>•</span>
                              <span>메트릭: {rec.expectedImprovement.metric}</span>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedRecommendation(rec);
                                setRecommendationDialogOpen(true);
                              }}
                            >
                              <ArrowRight className="h-4 w-4 mr-1" />
                              자세히
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {selectedPattern && (
        <Card className="fixed inset-x-4 top-16 z-50 max-w-2xl mx-auto bg-white dark:bg-gray-900 shadow-xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center">
                {getPatternIcon(selectedPattern.patternType)}
                <span className="ml-2">{selectedPattern.name}</span>
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setSelectedPattern(null)}>
                ✕
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-gray-600">{selectedPattern.description}</p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-gray-500">신뢰도</span>
                  <div className="text-lg font-semibold">{selectedPattern.confidence.toFixed(1)}%</div>
                </div>
                <div>
                  <span className="text-sm text-gray-500">출현 빈도</span>
                  <div className="text-lg font-semibold">{selectedPattern.frequency}</div>
                </div>
              </div>

              <div>
                <span className="text-sm text-gray-500 block mb-2">관련 SQL ID</span>
                <div className="flex flex-wrap gap-2">
                  {selectedPattern.relatedSqlIds.map((sqlId) => (
                    <Badge key={sqlId} variant="outline">{sqlId.replace(/^SQL_/, '')}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={recommendationDialogOpen} onOpenChange={setRecommendationDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center">
              <Lightbulb className="h-6 w-6 mr-2 text-yellow-500" />
              최적화 권장사항 상세
            </DialogTitle>
          </DialogHeader>

          {selectedRecommendation && (
            <div className="space-y-6 pt-4">
              {/* 기본 정보 */}
              <div className="space-y-3">
                <div>
                  <h3 className="text-lg font-semibold mb-2">{selectedRecommendation.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400">{selectedRecommendation.description}</p>
                </div>

                <div className="flex items-center space-x-4">
                  <Badge className={getImpactColor(selectedRecommendation.priority)}>
                    우선순위: {selectedRecommendation.priority}
                  </Badge>
                  <Badge variant="outline">
                    타입: {selectedRecommendation.type}
                  </Badge>
                </div>
              </div>

              {/* 예상 개선 효과 */}
              <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <CardHeader>
                  <CardTitle className="text-base flex items-center">
                    <TrendingUp className="h-5 w-5 mr-2 text-blue-600" />
                    예상 개선 효과
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">개선 메트릭</span>
                      <div className="text-2xl font-bold text-blue-600">
                        {selectedRecommendation.expectedImprovement.metric}
                      </div>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">예상 개선율</span>
                      <div className="text-2xl font-bold text-green-600">
                        {selectedRecommendation.expectedImprovement.percentage.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 적용 방법 */}
              <div className="space-y-3">
                <h4 className="font-semibold text-lg flex items-center">
                  <Target className="h-5 w-5 mr-2 text-purple-600" />
                  적용 방법
                </h4>
                <div className="space-y-2">
                  {selectedRecommendation.type === 'index' && (
                    <>
                      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <h5 className="font-medium mb-2">1. 인덱스 분석</h5>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          현재 쿼리의 WHERE 절과 JOIN 조건을 분석하여 인덱스 후보 컬럼을 식별합니다.
                        </p>
                      </div>
                      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <h5 className="font-medium mb-2">2. 인덱스 생성</h5>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          다음 SQL을 실행하여 인덱스를 생성합니다:
                        </p>
                        <pre className="bg-gray-900 text-green-400 p-3 rounded text-xs overflow-x-auto">
{`CREATE INDEX idx_table_column
ON table_name(column1, column2);`}
                        </pre>
                      </div>
                      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <h5 className="font-medium mb-2">3. 실행계획 재확인</h5>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          인덱스 생성 후 실행계획을 재확인하여 인덱스가 사용되는지 검증합니다.
                        </p>
                      </div>
                    </>
                  )}
                  {selectedRecommendation.type === 'query' && (
                    <>
                      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <h5 className="font-medium mb-2">1. 쿼리 재작성</h5>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          현재 쿼리의 비효율적인 부분을 식별하고 최적화된 형태로 재작성합니다.
                        </p>
                      </div>
                      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <h5 className="font-medium mb-2">2. 서브쿼리 최적화</h5>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          불필요한 서브쿼리를 JOIN으로 변환하거나 제거합니다.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 주의사항 */}
              <Card className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
                <CardHeader>
                  <CardTitle className="text-base flex items-center">
                    <AlertTriangle className="h-5 w-5 mr-2 text-yellow-600" />
                    주의사항
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc list-inside space-y-2 text-sm text-gray-600 dark:text-gray-400">
                    <li>운영 환경 적용 전 개발/테스트 환경에서 충분히 검증하세요.</li>
                    <li>인덱스 생성 시 DML 성능에 미치는 영향을 고려하세요.</li>
                    <li>변경 전후 실행계획과 성능 메트릭을 비교 분석하세요.</li>
                    <li>피크 타임을 피해 변경 작업을 수행하세요.</li>
                  </ul>
                </CardContent>
              </Card>

              {/* 참고 자료 */}
              <div className="space-y-3">
                <h4 className="font-semibold text-lg flex items-center">
                  <Activity className="h-5 w-5 mr-2 text-indigo-600" />
                  참고 자료
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <a href="#" className="text-blue-600 hover:underline">
                      Oracle Performance Tuning Guide
                    </a>
                  </div>
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <a href="#" className="text-blue-600 hover:underline">
                      Index Design Guidelines
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Mock 패턴 생성 함수
function generateMockPatterns(clusters: ClusterData[]): ClusterPattern[] {
  const patternTypes = [
    {
      type: 'performance' as const,
      patterns: [
        {
          name: 'High CPU Consumption',
          description: 'CPU 집약적인 연산이 주를 이루는 패턴',
          characteristics: ['복잡한 조인', 'CPU 바운드', '계산 중심'],
          impact: 'high' as const,
        },
        {
          name: 'Efficient Index Usage',
          description: '인덱스를 효율적으로 사용하는 패턴',
          characteristics: ['인덱스 스캔', '빠른 실행', '낮은 비용'],
          impact: 'low' as const,
        }
      ]
    },
    {
      type: 'access' as const,
      patterns: [
        {
          name: 'Full Table Scan',
          description: '전체 테이블 스캔이 발생하는 패턴',
          characteristics: ['대용량 데이터', '인덱스 미사용', 'I/O 집약적'],
          impact: 'high' as const,
        },
        {
          name: 'Nested Loop Join',
          description: '중첩 루프 조인 패턴',
          characteristics: ['소량 데이터', '조인 최적화', '반복 실행'],
          impact: 'medium' as const,
        }
      ]
    },
    {
      type: 'timing' as const,
      patterns: [
        {
          name: 'Peak Hour Access',
          description: '피크 시간대 접근 패턴',
          characteristics: ['특정 시간대', '동시성 이슈', '리소스 경합'],
          impact: 'medium' as const,
        },
        {
          name: 'Batch Processing',
          description: '배치 처리 패턴',
          characteristics: ['대량 데이터', '주기적 실행', '긴 실행시간'],
          impact: 'medium' as const,
        }
      ]
    },
    {
      type: 'resource' as const,
      patterns: [
        {
          name: 'Memory Intensive',
          description: '메모리 집약적 연산 패턴',
          characteristics: ['정렬 작업', '해시 조인', '메모리 바운드'],
          impact: 'high' as const,
        },
        {
          name: 'I/O Bottleneck',
          description: 'I/O 병목 패턴',
          characteristics: ['디스크 읽기', '느린 스토리지', 'I/O 대기'],
          impact: 'high' as const,
        }
      ]
    }
  ];

  return clusters.map((cluster, clusterIndex) => {
    const clusterPatterns: PatternAnalysis[] = [];
    const numPatterns = Math.floor(Math.random() * 3) + 2;

    for (let i = 0; i < numPatterns; i++) {
      const typeIndex = i % patternTypes.length;
      const patternTypeData = patternTypes[typeIndex];
      const patternIndex = Math.floor(Math.random() * patternTypeData.patterns.length);
      const pattern = patternTypeData.patterns[patternIndex];

      clusterPatterns.push({
        id: `pattern_${cluster.id}_${i}`,
        clusterId: cluster.id,
        patternType: patternTypeData.type,
        name: pattern.name,
        description: pattern.description,
        confidence: 60 + Math.random() * 35,
        frequency: Math.floor(Math.random() * 80) + 20,
        impact: pattern.impact,
        characteristics: pattern.characteristics,
        metrics: {
          avgCpuTime: cluster.characteristics.avgCpuTime,
          avgBufferGets: cluster.characteristics.avgBufferGets,
        },
        recommendations: [
          {
            id: `rec_${cluster.id}_${i}`,
            type: pattern.impact === 'high' ? 'index' : 'query',
            priority: pattern.impact,
            title: `${pattern.name} 최적화`,
            description: `${pattern.description}에 대한 최적화 방안`,
            expectedImprovement: {
              metric: pattern.impact === 'high' ? 'CPU Time' : 'Execution Time',
              percentage: 15 + Math.random() * 25
            }
          }
        ],
        relatedSqlIds: cluster.points.slice(0, 3).map(p => p.sql_id)
      });
    }

    const problemPatterns = clusterPatterns.filter(p => p.impact === 'high').map(p => p.name);

    return {
      clusterId: cluster.id,
      clusterName: cluster.name,
      patterns: clusterPatterns,
      overallScore: cluster.avgPerformanceScore,
      dominantPatterns: clusterPatterns.slice(0, 2).map(p => p.name),
      problemPatterns,
      optimizationPotential: problemPatterns.length > 0 ? 60 + Math.random() * 40 : 20 + Math.random() * 30
    };
  });
}
