'use client';

/**
 * DBMS_XPLAN Page
 * Oracle DBMS_XPLAN 기능을 활용한 실행계획 조회 및 분석
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Search,
  Download,
  RefreshCw,
  AlertCircle,
  Info,
  Settings,
  Copy,
  Check,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

// DBMS_XPLAN 함수 타입
type XPlanFunction = 'DISPLAY_CURSOR' | 'DISPLAY_AWR';

// 포맷 옵션
type FormatOption = 'BASIC' | 'TYPICAL' | 'SERIAL' | 'ALL' | 'ADVANCED' | 'ALLSTATS';

// 실행계획 결과 타입
interface XPlanResult {
  plan_table_output: string[];
  sql_id?: string;
  plan_hash_value?: string;
  child_number?: number;
}

export default function DbmsXplanPage() {
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
  const effectiveConnectionId = selectedConnectionId || 'all';

  // 탭 상태
  const [activeTab, setActiveTab] = useState<XPlanFunction>('DISPLAY_CURSOR');

  // DISPLAY_CURSOR 파라미터
  const [sqlId, setSqlId] = useState('');
  const [childNumber, setChildNumber] = useState<string>('');
  const [format, setFormat] = useState<FormatOption>('TYPICAL');

  // DISPLAY_AWR 파라미터
  const [awrSqlId, setAwrSqlId] = useState('');
  const [awrPlanHashValue, setAwrPlanHashValue] = useState('');
  const [awrDbId, setAwrDbId] = useState('');


  // 고급 옵션
  const [showPredicate, setShowPredicate] = useState(true);
  const [showProjection, setShowProjection] = useState(false);
  const [showAlias, setShowAlias] = useState(false);
  const [showRemote, setShowRemote] = useState(false);
  const [showPartition, setShowPartition] = useState(false);
  const [showParallel, setShowParallel] = useState(false);
  const [showCost, setShowCost] = useState(true);
  const [showBytes, setShowBytes] = useState(true);

  // 복사 상태
  const [copied, setCopied] = useState(false);

  // 검색 트리거
  const [searchTrigger, setSearchTrigger] = useState(0);

  // 포맷 문자열 생성
  const getFormatString = (): FormatOption => {
    const options: string[] = [];

    if (showPredicate) options.push('PREDICATE');
    if (showProjection) options.push('PROJECTION');
    if (showAlias) options.push('ALIAS');
    if (showRemote) options.push('REMOTE');
    if (showPartition) options.push('PARTITION');
    if (showParallel) options.push('PARALLEL');
    if (!showCost) options.push('-COST');
    if (!showBytes) options.push('-BYTES');

    if (options.length > 0) {
      return `${format} ${options.join(' ')}` as FormatOption;
    }

    return format;
  };

  // 실행계획 조회
  const { data: xplanResult, isLoading, error, refetch } = useQuery<XPlanResult>({
    queryKey: ['dbms-xplan', effectiveConnectionId, activeTab, searchTrigger],
    queryFn: async () => {
      if (!selectedConnectionId || effectiveConnectionId === 'all') {
        throw new Error('데이터베이스를 선택해주세요');
      }

      let endpoint = '';
      let params = new URLSearchParams();
      params.append('connection_id', effectiveConnectionId);
      params.append('format', getFormatString());

      switch (activeTab) {
        case 'DISPLAY_CURSOR':
          if (!sqlId) throw new Error('SQL ID를 입력해주세요');
          endpoint = '/api/dbms-xplan/display-cursor';
          params.append('sql_id', sqlId);
          if (childNumber) params.append('child_number', childNumber);
          break;

        case 'DISPLAY_AWR':
          if (!awrSqlId) throw new Error('SQL ID를 입력해주세요');
          endpoint = '/api/dbms-xplan/display-awr';
          params.append('sql_id', awrSqlId);
          if (awrPlanHashValue) params.append('plan_hash_value', awrPlanHashValue);
          if (awrDbId) params.append('db_id', awrDbId);
          break;
      }

      const res = await fetch(`${endpoint}?${params.toString()}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch execution plan');
      }
      return res.json();
    },
    enabled: searchTrigger > 0, // searchTrigger가 0보다 클 때만 실행
    retry: false, // 에러 시 재시도 하지 않음
  });

  // 검색 핸들러
  const handleSearch = () => {
    console.log('🔍 Search triggered:', {
      selectedConnectionId,
      effectiveConnectionId,
      activeTab,
      sqlId,
      format: getFormatString(),
    });
    setSearchTrigger((prev) => prev + 1);
  };

  // 결과 복사
  const handleCopy = () => {
    if (xplanResult?.plan_table_output) {
      navigator.clipboard.writeText(xplanResult.plan_table_output.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 결과 다운로드
  const handleDownload = () => {
    if (xplanResult?.plan_table_output) {
      const blob = new Blob([xplanResult.plan_table_output.join('\n')], {
        type: 'text/plain',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xplan_${activeTab}_${new Date().getTime()}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">DBMS_XPLAN</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Oracle DBMS_XPLAN 패키지를 활용한 실행계획 조회 및 분석
        </p>
        {selectedConnection && (
          <p className="text-sm text-muted-foreground mt-1">
            연결: <span className="font-medium">{selectedConnection.name}</span> ({selectedConnection.host}:{selectedConnection.port})
          </p>
        )}
      </div>

      {/* 데이터베이스 선택 경고 */}
      {effectiveConnectionId === 'all' && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            DBMS_XPLAN을 사용하려면 상단에서 데이터베이스를 선택해주세요.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 좌측: 입력 패널 */}
        <div className="lg:col-span-1 space-y-6">
          {/* 기능 선택 탭 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                기능 선택
              </CardTitle>
              <CardDescription>DBMS_XPLAN 함수를 선택하세요</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as XPlanFunction)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="DISPLAY_CURSOR">CURSOR</TabsTrigger>
                  <TabsTrigger value="DISPLAY_AWR">AWR</TabsTrigger>
                </TabsList>

                {/* DISPLAY_CURSOR 탭 */}
                <TabsContent value="DISPLAY_CURSOR" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="sql_id">SQL ID *</Label>
                    <Input
                      id="sql_id"
                      value={sqlId}
                      onChange={(e) => setSqlId(e.target.value)}
                      placeholder="예: 4ztz048yfq32g"
                      className="font-mono"
                      disabled={effectiveConnectionId === 'all'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="child_number">Child Number (선택)</Label>
                    <Input
                      id="child_number"
                      value={childNumber}
                      onChange={(e) => setChildNumber(e.target.value)}
                      placeholder="NULL (모든 child)"
                      type="number"
                      disabled={effectiveConnectionId === 'all'}
                    />
                  </div>
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      현재 Shared Pool에 캐시된 실행계획을 조회합니다.
                    </AlertDescription>
                  </Alert>
                  <Button
                    onClick={handleSearch}
                    disabled={!sqlId || effectiveConnectionId === 'all'}
                    className="w-full"
                  >
                    <Search className="h-4 w-4 mr-2" />
                    조회
                  </Button>
                </TabsContent>

                {/* DISPLAY_AWR 탭 */}
                <TabsContent value="DISPLAY_AWR" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="awr_sql_id">SQL ID *</Label>
                    <Input
                      id="awr_sql_id"
                      value={awrSqlId}
                      onChange={(e) => setAwrSqlId(e.target.value)}
                      placeholder="예: 4ztz048yfq32g"
                      className="font-mono"
                      disabled={effectiveConnectionId === 'all'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plan_hash_value">Plan Hash Value (선택)</Label>
                    <Input
                      id="plan_hash_value"
                      value={awrPlanHashValue}
                      onChange={(e) => setAwrPlanHashValue(e.target.value)}
                      placeholder="NULL (가장 최근 plan)"
                      disabled={effectiveConnectionId === 'all'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="db_id">DB ID (선택)</Label>
                    <Input
                      id="db_id"
                      value={awrDbId}
                      onChange={(e) => setAwrDbId(e.target.value)}
                      placeholder="NULL (현재 DB)"
                      disabled={effectiveConnectionId === 'all'}
                    />
                  </div>
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      AWR 저장소에서 과거 실행계획을 조회합니다.
                    </AlertDescription>
                  </Alert>
                  <Button
                    onClick={handleSearch}
                    disabled={!awrSqlId || effectiveConnectionId === 'all'}
                    className="w-full"
                  >
                    <Search className="h-4 w-4 mr-2" />
                    조회
                  </Button>
                </TabsContent>

              </Tabs>
            </CardContent>
          </Card>

          {/* 포맷 옵션 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">포맷 옵션</CardTitle>
              <CardDescription className="text-xs">실행계획 출력 형식을 설정하세요</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="format">기본 포맷</Label>
                <Select value={format} onValueChange={(v) => setFormat(v as FormatOption)}>
                  <SelectTrigger id="format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BASIC">BASIC (최소 정보)</SelectItem>
                    <SelectItem value="TYPICAL">TYPICAL (표준)</SelectItem>
                    <SelectItem value="SERIAL">SERIAL (직렬)</SelectItem>
                    <SelectItem value="ALL">ALL (모든 정보)</SelectItem>
                    <SelectItem value="ADVANCED">ADVANCED (고급)</SelectItem>
                    <SelectItem value="ALLSTATS">ALLSTATS (실행 통계)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <Label htmlFor="predicate" className="text-sm">Predicate</Label>
                  <Switch
                    id="predicate"
                    checked={showPredicate}
                    onCheckedChange={setShowPredicate}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="projection" className="text-sm">Projection</Label>
                  <Switch
                    id="projection"
                    checked={showProjection}
                    onCheckedChange={setShowProjection}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="alias" className="text-sm">Alias</Label>
                  <Switch
                    id="alias"
                    checked={showAlias}
                    onCheckedChange={setShowAlias}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="remote" className="text-sm">Remote</Label>
                  <Switch
                    id="remote"
                    checked={showRemote}
                    onCheckedChange={setShowRemote}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="partition" className="text-sm">Partition</Label>
                  <Switch
                    id="partition"
                    checked={showPartition}
                    onCheckedChange={setShowPartition}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="parallel" className="text-sm">Parallel</Label>
                  <Switch
                    id="parallel"
                    checked={showParallel}
                    onCheckedChange={setShowParallel}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="cost" className="text-sm">Cost</Label>
                  <Switch
                    id="cost"
                    checked={showCost}
                    onCheckedChange={setShowCost}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="bytes" className="text-sm">Bytes</Label>
                  <Switch
                    id="bytes"
                    checked={showBytes}
                    onCheckedChange={setShowBytes}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 우측: 결과 패널 */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>실행계획 출력</CardTitle>
                  <CardDescription>
                    {xplanResult
                      ? `${activeTab} 결과 (${xplanResult.plan_table_output.length} lines)`
                      : '조회 버튼을 클릭하여 실행계획을 확인하세요'}
                  </CardDescription>
                </div>
                {xplanResult && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopy}
                      disabled={!xplanResult}
                    >
                      {copied ? (
                        <Check className="h-4 w-4 mr-2" />
                      ) : (
                        <Copy className="h-4 w-4 mr-2" />
                      )}
                      {copied ? '복사됨' : '복사'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownload}
                      disabled={!xplanResult}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      다운로드
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetch()}
                      disabled={isLoading}
                    >
                      <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(10)].map((_, i) => (
                    <Skeleton key={`skeleton-xplan-${i}`} className="h-4 w-full" />
                  ))}
                </div>
              ) : error ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {error instanceof Error ? error.message : '실행계획 조회 중 오류가 발생했습니다.'}
                  </AlertDescription>
                </Alert>
              ) : xplanResult ? (
                <div className="space-y-4">
                  {/* 메타정보 */}
                  {(xplanResult.sql_id || xplanResult.plan_hash_value) && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                      {xplanResult.sql_id && (
                        <div>
                          <div className="text-xs text-muted-foreground">SQL ID</div>
                          <div className="font-mono text-sm font-medium">
                            {xplanResult.sql_id}
                          </div>
                        </div>
                      )}
                      {xplanResult.plan_hash_value && (
                        <div>
                          <div className="text-xs text-muted-foreground">Plan Hash Value</div>
                          <div className="font-mono text-sm font-medium">
                            {xplanResult.plan_hash_value}
                          </div>
                        </div>
                      )}
                      {xplanResult.child_number !== undefined && (
                        <div>
                          <div className="text-xs text-muted-foreground">Child Number</div>
                          <div className="font-mono text-sm font-medium">
                            {xplanResult.child_number}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 실행계획 출력 */}
                  <div className="bg-slate-950 text-green-400 p-4 rounded-lg overflow-x-auto">
                    <pre className="font-mono text-xs whitespace-pre">
                      {xplanResult.plan_table_output.join('\n')}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                  {effectiveConnectionId === 'all' ? (
                    <>
                      <p className="text-destructive font-medium mb-2">데이터베이스를 선택해주세요</p>
                      <p className="text-xs text-muted-foreground">
                        상단의 데이터베이스 선택 드롭다운에서 연결을 선택하세요
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-muted-foreground mb-2">실행계획이 표시됩니다</p>
                      <p className="text-xs text-muted-foreground">
                        좌측에서 파라미터를 입력하고 조회 버튼을 클릭하세요
                      </p>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 도움말 카드 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">DBMS_XPLAN 사용 가이드</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">DISPLAY_CURSOR</h4>
              <p className="text-xs text-muted-foreground">
                현재 Shared Pool에 캐시되어 있는 SQL의 실행계획을 조회합니다. SQL_ID와 선택적으로
                Child Number를 지정할 수 있습니다.
              </p>
              <div className="bg-muted p-2 rounded text-xs font-mono">
                SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR('sql_id', child_number, 'format'))
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-sm">DISPLAY_AWR</h4>
              <p className="text-xs text-muted-foreground">
                AWR 저장소에서 과거에 실행된 SQL의 실행계획을 조회합니다. SQL_ID, Plan Hash Value,
                DB ID를 지정할 수 있습니다.
              </p>
              <div className="bg-muted p-2 rounded text-xs font-mono">
                SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_AWR('sql_id', plan_hash_value, db_id,
                'format'))
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-sm">포맷 옵션</h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• <strong>BASIC</strong>: 최소한의 정보만 출력</li>
                <li>• <strong>TYPICAL</strong>: 표준 정보 출력 (기본값)</li>
                <li>• <strong>SERIAL</strong>: 직렬 실행계획 정보</li>
                <li>• <strong>ALL</strong>: 모든 가능한 정보 출력</li>
                <li>• <strong>ADVANCED</strong>: 고급 정보 포함</li>
                <li>• <strong>ALLSTATS</strong>: 실행 통계 포함</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
