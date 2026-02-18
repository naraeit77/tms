'use client';

/**
 * SQL Refactoring Assistant Page
 * AI가 제안하는 SQL 재작성 및 최적화
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Code,
  ArrowLeft,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  Copy,
  FileText,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { useToast } from '@/hooks/use-toast';

interface RefactoringSuggestion {
  id: string;
  original_sql: string;
  refactored_sql: string;
  improvement_type: string;
  expected_improvement: number;
  reasoning: string;
  risks: string[];
  benefits: string[];
}

export default function SQLRefactoringPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
  const [originalSQL, setOriginalSQL] = useState('');
  const [suggestions, setSuggestions] = useState<RefactoringSuggestion[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // Sample SQLs
  const sampleSQLs = [
    {
      title: 'Subquery를 Join으로',
      sql: 'SELECT e.employee_name, e.salary FROM employees e WHERE e.department_id IN (SELECT d.department_id FROM departments d WHERE d.location = \'Seoul\')',
    },
    {
      title: 'SELECT * 최적화',
      sql: 'SELECT * FROM orders WHERE order_date > SYSDATE - 30',
    },
    {
      title: '비효율적 조인',
      sql: 'SELECT o.order_id, c.customer_name FROM orders o, customers c WHERE o.customer_id = c.customer_id',
    },
  ];

  const handleAnalyze = async () => {
    if (!originalSQL.trim()) {
      toast({
        title: 'SQL을 입력해주세요',
        description: '분석할 SQL 문을 입력해주세요.',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedConnectionId || selectedConnectionId === 'all') {
      toast({
        title: '데이터베이스를 선택해주세요',
        description: 'SQL 분석을 위해 데이터베이스를 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    setIsAnalyzing(true);

    try {
      // POST 요청으로 사용자가 입력한 SQL 분석
      const res = await fetch('/api/analysis/refactoring-suggestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sql_text: originalSQL,
          connection_id: selectedConnectionId,
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to analyze SQL');
      }

      const data = await res.json();
      
      if (data.success && data.data && data.data.length > 0) {
        // API에서 받은 데이터를 변환
        const apiSuggestions: RefactoringSuggestion[] = data.data.map((s: any, index: number) => ({
          id: `${s.sql_id || `suggestion_${index}`}`,
          original_sql: s.original_sql || originalSQL,
          refactored_sql: s.refactored_sql || originalSQL,
          improvement_type: s.improvements?.[0]?.type || '성능 최적화',
          expected_improvement: s.performance_gain || 0,
          reasoning: s.reasoning || '성능 개선을 위한 리팩토링 제안입니다.',
          risks: s.improvements?.filter((i: any) => i.impact === 'high' || i.impact === 'critical')
            .map((i: any) => `주의: ${i.description}`) || ['변경 전 테스트 필요'],
          benefits: s.improvements?.map((i: any) => i.description) || ['성능 향상 기대'],
        }));

        setSuggestions(apiSuggestions);
        
        toast({
          title: '분석 완료',
          description: `${apiSuggestions.length}개의 개선 제안을 생성했습니다.`,
        });
      } else {
        toast({
          title: '분석 결과 없음',
          description: '현재 SQL에 대한 개선 제안을 찾을 수 없습니다.',
          variant: 'info',
        });
        setSuggestions([]);
      }
    } catch (error) {
      console.error('Failed to analyze SQL:', error);
      toast({
        title: '분석 실패',
        description: 'SQL 분석 중 오류가 발생했습니다. 다시 시도해주세요.',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopySQL = (sql: string) => {
    navigator.clipboard.writeText(sql);
    toast({
      title: '복사 완료',
      description: 'SQL이 클립보드에 복사되었습니다.',
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center">
              <Code className="h-8 w-8 mr-3 text-purple-600" />
              SQL 리팩토링 어시스턴트
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">AI가 제안하는 SQL 재작성 및 최적화</p>
            {selectedConnection && (
              <p className="text-sm text-muted-foreground mt-1">
                연결: <span className="font-medium">{selectedConnection.name}</span> ({selectedConnection.host}:{selectedConnection.port})
              </p>
            )}
          </div>
        </div>
        <Button variant="outline" onClick={() => setIsGuideOpen(true)}>
          <FileText className="h-4 w-4 mr-2" />
          가이드
        </Button>
      </div>

      {/* Database Selection Warning */}
      {(!selectedConnectionId || selectedConnectionId === 'all') && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/20">
          <CardContent className="p-6">
            <div className="flex items-center space-x-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium text-amber-900 dark:text-amber-300">데이터베이스를 선택해주세요</p>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                  SQL 리팩토링을 시작하려면 상단의 데이터베이스 선택 메뉴에서 데이터베이스를 선택해주세요.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Input */}
        <div className="space-y-6">
          {/* SQL Input */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>SQL 입력</span>
                <div className="flex items-center space-x-2">
                  <Button size="sm" variant="outline" onClick={() => setOriginalSQL('')} disabled={!originalSQL}>
                    초기화
                  </Button>
                  <Button size="sm" onClick={handleAnalyze} disabled={isAnalyzing || !originalSQL.trim()}>
                    {isAnalyzing ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        분석 중...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        AI 분석
                      </>
                    )}
                  </Button>
                </div>
              </CardTitle>
              <CardDescription>최적화할 SQL 문을 입력하거나 샘플 SQL을 선택하세요</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={originalSQL}
                onChange={(e) => setOriginalSQL(e.target.value)}
                placeholder="SELECT * FROM orders WHERE order_date > SYSDATE - 30"
                className="min-h-[300px] font-mono text-sm"
              />

              {/* Sample SQLs */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">샘플 SQL:</p>
                <div className="grid grid-cols-1 gap-3">
                  {sampleSQLs.map((sample, index) => (
                    <Card
                      key={`sample-sql-${sample.title || ''}-${sample.sql.substring(0, 20)}-${index}`}
                      className="cursor-pointer hover:shadow-md transition-shadow hover:border-primary/50"
                      onClick={() => setOriginalSQL(sample.sql)}
                    >
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center">
                          <Code className="h-4 w-4 mr-2 text-purple-600" />
                          {sample.title}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto">
                          <code className="text-gray-700 dark:text-gray-300">{sample.sql}</code>
                        </pre>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Analysis Tips */}
          <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
            <CardContent className="p-6">
              <div className="flex items-start space-x-3">
                <Zap className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">AI 분석 팁</h3>
                  <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                    <li>• 복잡한 Subquery는 Join이나 CTE로 개선할 수 있습니다</li>
                    <li>• SELECT * 대신 필요한 컬럼만 명시하세요</li>
                    <li>• 인덱스 힌트를 활용하여 실행 계획을 안정화하세요</li>
                    <li>• WHERE 조건을 최적화하여 풀 테이블 스캔을 방지하세요</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Suggestions */}
        <div className="space-y-6">
          {suggestions.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Sparkles className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <h3 className="text-lg font-semibold mb-2">AI 분석 대기 중</h3>
                <p className="text-gray-500 mb-4">SQL을 입력하고 AI 분석 버튼을 클릭하세요</p>
                <p className="text-sm text-gray-400">AI가 자동으로 성능 개선 제안을 생성합니다</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center">
                  <Sparkles className="h-5 w-5 mr-2 text-purple-600" />
                  개선 제안 ({suggestions.length})
                </h2>
              </div>

              {suggestions.map((suggestion) => (
                <Card key={suggestion.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg flex items-center">
                          {suggestion.improvement_type}
                          <Badge className="ml-2 bg-green-100 text-green-700">
                            <TrendingUp className="h-3 w-3 mr-1" />
                            +{suggestion.expected_improvement}% 개선
                          </Badge>
                        </CardTitle>
                        <CardDescription className="mt-2">{suggestion.reasoning}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Refactored SQL */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium">개선된 SQL</p>
                        <Button variant="ghost" size="sm" onClick={() => handleCopySQL(suggestion.refactored_sql)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-x-auto">
                        <code>{suggestion.refactored_sql}</code>
                      </pre>
                    </div>

                    {/* Benefits & Risks */}
                    <Tabs defaultValue="benefits" className="w-full">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="benefits">장점</TabsTrigger>
                        <TabsTrigger value="risks">주의사항</TabsTrigger>
                      </TabsList>
                      <TabsContent value="benefits" className="space-y-2">
                        {suggestion.benefits.map((benefit, idx) => (
                          <div key={`benefit-${suggestion.id || ''}-${benefit.substring(0, 20)}-${idx}`} className="flex items-start space-x-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
                            <span>{benefit}</span>
                          </div>
                        ))}
                      </TabsContent>
                      <TabsContent value="risks" className="space-y-2">
                        {suggestion.risks.map((risk, idx) => (
                          <div key={`risk-${suggestion.id || ''}-${risk.substring(0, 20)}-${idx}`} className="flex items-start space-x-2 text-sm">
                            <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5" />
                            <span>{risk}</span>
                          </div>
                        ))}
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 가이드 Dialog */}
      <Dialog open={isGuideOpen} onOpenChange={setIsGuideOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center">
              <FileText className="h-6 w-6 mr-2 text-purple-600" />
              SQL 리팩토링 어시스턴트 사용 가이드
            </DialogTitle>
            <DialogDescription>
              AI 기반 SQL 최적화 도구 사용 방법을 안내합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 pt-4">
            {/* 기본 사용법 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Zap className="h-5 w-5 mr-2 text-blue-600" />
                  기본 사용법
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-start space-x-2">
                    <span className="font-semibold text-blue-600">1.</span>
                    <div>
                      <p className="font-medium">SQL 입력</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        최적화할 SQL 문을 왼쪽 입력창에 입력하거나 샘플 SQL을 선택하세요.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span className="font-semibold text-blue-600">2.</span>
                    <div>
                      <p className="font-medium">AI 분석 실행</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        "AI 분석" 버튼을 클릭하면 입력한 SQL을 분석하여 개선 제안을 생성합니다.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-2">
                    <span className="font-semibold text-blue-600">3.</span>
                    <div>
                      <p className="font-medium">개선 제안 확인</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        오른쪽 패널에서 개선된 SQL과 개선 사항을 확인하세요.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 주요 기능 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Sparkles className="h-5 w-5 mr-2 text-purple-600" />
                  주요 기능
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <p className="font-semibold text-blue-900 dark:text-blue-300 mb-1">
                      SELECT * 최적화
                    </p>
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      SELECT *를 필요한 컬럼만 명시하도록 변경하여 불필요한 데이터 전송을 줄입니다.
                    </p>
                  </div>
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <p className="font-semibold text-green-900 dark:text-green-300 mb-1">
                      서브쿼리 조인 변환
                    </p>
                    <p className="text-sm text-green-800 dark:text-green-200">
                      IN 서브쿼리를 JOIN으로 변환하여 성능을 개선합니다.
                    </p>
                  </div>
                  <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                    <p className="font-semibold text-orange-900 dark:text-orange-300 mb-1">
                      OR 조건 최적화
                    </p>
                    <p className="text-sm text-orange-800 dark:text-orange-200">
                      여러 OR 조건을 IN 절로 변경하거나 UNION ALL 사용을 고려합니다.
                    </p>
                  </div>
                  <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                    <p className="font-semibold text-purple-900 dark:text-purple-300 mb-1">
                      UNION ALL 사용
                    </p>
                    <p className="text-sm text-purple-800 dark:text-purple-200">
                      중복 제거가 불필요한 경우 UNION을 UNION ALL로 변경하여 성능을 향상시킵니다.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 팁 */}
            <Card className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200">
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <AlertTriangle className="h-5 w-5 mr-2 text-yellow-600" />
                  주의사항
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc list-inside space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  <li>개선된 SQL은 제안사항이므로 실제 적용 전 개발/테스트 환경에서 충분히 검증하세요.</li>
                  <li>성능 개선율은 예상치이며, 실제 데이터와 환경에 따라 다를 수 있습니다.</li>
                  <li>인덱스 추가 제안의 경우, DML 성능에 미치는 영향을 고려하세요.</li>
                  <li>변경 전후 실행계획과 성능 메트릭을 비교 분석하세요.</li>
                </ul>
              </CardContent>
            </Card>

            {/* 샘플 SQL */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Code className="h-5 w-5 mr-2 text-purple-600" />
                  샘플 SQL 활용
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  왼쪽 패널 하단의 샘플 SQL 카드를 클릭하면 해당 SQL이 입력창에 자동으로 입력됩니다.
                  다양한 패턴의 SQL을 테스트해보세요.
                </p>
                <div className="space-y-2">
                  {sampleSQLs.map((sample, index) => (
                    <div key={`sample-list-${sample.title || ''}-${sample.sql.substring(0, 20)}-${index}`} className="p-2 bg-muted rounded text-xs font-mono">
                      {sample.title}: {sample.sql.substring(0, 60)}...
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

