'use client';

/**
 * AWR/ADDM Page
 * AWR 리포트 및 ADDM 분석
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { FileBarChart, Download, Play, AlertCircle, Trash2 } from 'lucide-react';
import { parseOracleEdition, checkFeatureAvailability } from '@/lib/oracle/edition-guard';
import { EnterpriseFeatureAlert } from '@/components/ui/enterprise-feature-alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

interface AWRReport {
  id: string;
  report_type: 'AWR' | 'ADDM';
  begin_snap_id: number;
  end_snap_id: number;
  report_name: string;
  generated_at: string;
  file_size?: number;
  status: 'GENERATING' | 'COMPLETED' | 'FAILED';
}

interface Snapshot {
  snap_id: number;
  snap_time: string;
  startup_time: string;
  instance_number: number;
}

export default function AWRPage() {
  const { selectedConnectionId, connections, selectedConnection } = useSelectedDatabase();
  const [beginSnapId, setBeginSnapId] = useState<string>('');
  const [endSnapId, setEndSnapId] = useState<string>('');
  const [reportType, setReportType] = useState<'AWR' | 'ADDM'>('AWR');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 에디션 확인
  const awrAvailability = useMemo(() => {
    const edition = parseOracleEdition(selectedConnection?.oracleEdition);
    return checkFeatureAvailability('AWR', edition);
  }, [selectedConnection?.oracleEdition]);

  const currentEdition = useMemo(() => {
    return parseOracleEdition(selectedConnection?.oracleEdition);
  }, [selectedConnection?.oracleEdition]);

  // 선택된 데이터베이스 연결 ID 가져오기
  const effectiveConnectionId = selectedConnectionId || 'all';

  // 스냅샷 목록 조회
  const { data: snapshots } = useQuery<Snapshot[]>({
    queryKey: ['awr-snapshots', effectiveConnectionId],
    queryFn: async () => {
      if (effectiveConnectionId === 'all') return [];
      const res = await fetch(`/api/awr/snapshots?connection=${effectiveConnectionId}`);
      if (!res.ok) throw new Error('Failed to fetch snapshots');
      const data = await res.json();
      return data.data || [];
    },
    enabled: effectiveConnectionId !== 'all',
  });

  // AWR 리포트 목록 조회
  const { data: reports, isLoading } = useQuery<AWRReport[]>({
    queryKey: ['awr-reports'],
    queryFn: async () => {
      const res = await fetch('/api/awr/reports');
      if (!res.ok) throw new Error('Failed to fetch reports');
      const data = await res.json();
      return data.data || [];
    },
  });

  // 리포트 생성 mutation
  const generateReportMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/awr/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: effectiveConnectionId,
          report_type: reportType,
          begin_snap_id: parseInt(beginSnapId),
          end_snap_id: parseInt(endSnapId),
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to generate report');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: '리포트 생성 성공',
        description: `${reportType} 리포트가 생성되었습니다.`,
      });

      // 리포트 내용을 다운로드 (AWR: HTML, ADDM: TXT)
      const reportContent = data.data.content;
      const reportName = data.data.report_name;
      const mimeType = data.data.report_type === 'ADDM' ? 'text/plain; charset=utf-8' : 'text/html';
      const blob = new Blob([reportContent], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = reportName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      queryClient.invalidateQueries({ queryKey: ['awr-reports'] });
      setBeginSnapId('');
      setEndSnapId('');
    },
    onError: (error: Error) => {
      toast({
        title: '리포트 생성 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleGenerateReport = () => {
    if (!beginSnapId || !endSnapId || effectiveConnectionId === 'all') return;
    generateReportMutation.mutate();
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">AWR/ADDM 분석</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Oracle AWR 리포트 및 ADDM 분석을 생성합니다
        </p>
        {selectedConnection && (
          <p className="text-sm text-muted-foreground mt-1">
            연결: <span className="font-medium">{selectedConnection.name}</span> ({selectedConnection.host}:{selectedConnection.port})
          </p>
        )}
      </div>

      {/* Enterprise Edition 전용 기능 안내 */}
      {!awrAvailability.available && currentEdition !== 'Unknown' && (
        <EnterpriseFeatureAlert
          featureName="AWR/ADDM"
          requiredPack={awrAvailability.requiredPack}
          alternative={awrAvailability.alternative}
          currentEdition={currentEdition}
        />
      )}

      {/* 데이터베이스 선택 경고 */}
      {effectiveConnectionId === 'all' && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            AWR/ADDM 리포트를 생성하려면 상단에서 데이터베이스를 선택해주세요.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="generate" className="space-y-4">
        <TabsList>
          <TabsTrigger value="generate">리포트 생성</TabsTrigger>
          <TabsTrigger value="reports">생성된 리포트</TabsTrigger>
        </TabsList>

        {/* 리포트 생성 */}
        <TabsContent value="generate" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>새 리포트 생성</CardTitle>
              <CardDescription>
                AWR 또는 ADDM 리포트를 생성합니다
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="connection">DB 연결</Label>
                  <Select
                    value={effectiveConnectionId !== 'all' ? effectiveConnectionId : ''}
                    disabled
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="상단에서 데이터베이스를 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {connections.map((conn) => (
                        <SelectItem key={conn.id} value={conn.id}>
                          {conn.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    상단 헤더의 데이터베이스 선택기를 사용하여 DB를 선택하세요
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="report_type">리포트 타입</Label>
                  <Select
                    value={reportType}
                    onValueChange={(value) => setReportType(value as 'AWR' | 'ADDM')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AWR">AWR (Automatic Workload Repository)</SelectItem>
                      <SelectItem value="ADDM">ADDM (Automatic Database Diagnostic Monitor)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {snapshots && snapshots.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="begin_snap">시작 스냅샷 ID</Label>
                        <Input
                          id="begin_snap"
                          type="number"
                          value={beginSnapId}
                          onChange={(e) => setBeginSnapId(e.target.value)}
                          placeholder={`예: ${snapshots[1]?.snap_id || ''}`}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="end_snap">종료 스냅샷 ID</Label>
                        <Input
                          id="end_snap"
                          type="number"
                          value={endSnapId}
                          onChange={(e) => setEndSnapId(e.target.value)}
                          placeholder={`예: ${snapshots[0]?.snap_id || ''}`}
                        />
                      </div>
                    </div>

                    <div className="text-sm text-muted-foreground">
                      최근 스냅샷: {snapshots[0]?.snap_id} (
                      {new Date(snapshots[0]?.snap_time).toLocaleString('ko-KR')})
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    {effectiveConnectionId === 'all'
                      ? '상단에서 데이터베이스를 선택하면 스냅샷 목록이 표시됩니다'
                      : 'DB 연결을 선택하면 스냅샷 목록이 표시됩니다'}
                  </div>
                )}

                <Button
                  onClick={handleGenerateReport}
                  disabled={effectiveConnectionId === 'all' || !beginSnapId || !endSnapId || generateReportMutation.isPending}
                >
                  <Play className="h-4 w-4 mr-2" />
                  {generateReportMutation.isPending ? '생성 중...' : `${reportType} 리포트 생성`}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 안내 메시지 */}
          <Card className="border-blue-500 bg-blue-50">
            <CardContent className="pt-6">
              <div className="text-sm space-y-2">
                <p className="font-medium text-blue-900">AWR/ADDM 사용 안내</p>
                <ul className="text-blue-800 space-y-1 list-disc list-inside">
                  <li><strong>AWR</strong>: 지정된 기간 동안의 성능 통계와 메트릭을 제공합니다</li>
                  <li><strong>ADDM</strong>: 성능 문제를 자동으로 분석하고 개선 권장사항을 제공합니다</li>
                  <li>일반적으로 1시간 이상의 간격으로 스냅샷을 선택하는 것이 좋습니다</li>
                  <li>리포트 생성에는 수 분이 소요될 수 있습니다</li>
                  <li className="font-medium text-red-700">Oracle Enterprise Edition + Diagnostics Pack 라이센스 필요 (Standard Edition은 STATSPACK 사용)</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 생성된 리포트 목록 */}
        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle>생성된 리포트</CardTitle>
              <CardDescription>AWR 및 ADDM 리포트 히스토리</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={`skeleton-awr-${i}`} className="h-24 w-full" />
                  ))}
                </div>
              ) : reports && reports.length > 0 ? (
                <div className="space-y-3">
                  {reports.map((report) => (
                    <ReportCard key={report.id} report={report} queryClient={queryClient} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <FileBarChart className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>생성된 리포트가 없습니다.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// 리포트 카드 컴포넌트
interface ReportCardProps {
  report: AWRReport;
  queryClient: any;
}

function ReportCard({ report, queryClient }: ReportCardProps) {
  const { toast } = useToast();

  const statusColors = {
    GENERATING: 'default',
    COMPLETED: 'outline',
    FAILED: 'destructive',
  } as const;

  const typeColors = {
    AWR: 'default',
    ADDM: 'secondary',
  } as const;

  // 리포트 다운로드 mutation
  const downloadReportMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/awr/reports/${report.id}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to download report');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: '리포트 다운로드 성공',
        description: '리포트를 다운로드합니다.',
      });

      // 리포트 내용을 다운로드 (AWR: HTML, ADDM: TXT)
      const reportContent = data.data.content;
      const reportName = data.data.report_name;
      const mimeType = report.report_type === 'ADDM' ? 'text/plain; charset=utf-8' : 'text/html';
      const blob = new Blob([reportContent], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = reportName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onError: (error: Error) => {
      toast({
        title: '리포트 다운로드 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // 리포트 삭제 mutation
  const deleteReportMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/awr/reports?id=${report.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to delete report');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: '리포트 삭제 성공',
        description: '리포트가 삭제되었습니다.',
      });
      queryClient.invalidateQueries({ queryKey: ['awr-reports'] });
    },
    onError: (error: Error) => {
      toast({
        title: '리포트 삭제 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleDownload = () => {
    downloadReportMutation.mutate();
  };

  const handleDelete = () => {
    if (confirm('이 리포트를 삭제하시겠습니까?')) {
      deleteReportMutation.mutate();
    }
  };

  return (
    <div className="border rounded-lg p-4 hover:bg-accent transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={typeColors[report.report_type]}>
              {report.report_type}
            </Badge>
            <Badge variant={statusColors[report.status]}>{report.status}</Badge>
            <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
              Snap: {report.begin_snap_id} → {report.end_snap_id}
            </code>
          </div>
          <div className="text-sm text-muted-foreground space-y-1">
            <div>파일: {report.report_name}</div>
            <div>생성: {new Date(report.generated_at).toLocaleString('ko-KR')}</div>
            {report.file_size && (
              <div>크기: {(report.file_size / 1024).toFixed(2)} KB</div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {report.status === 'COMPLETED' && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleDownload}
              disabled={downloadReportMutation.isPending}
            >
              <Download className="h-4 w-4 mr-2" />
              {downloadReportMutation.isPending ? '다운로드 중...' : '다운로드'}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleDelete}
            disabled={deleteReportMutation.isPending}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {deleteReportMutation.isPending ? '삭제 중...' : '삭제'}
          </Button>
        </div>
      </div>
    </div>
  );
}
