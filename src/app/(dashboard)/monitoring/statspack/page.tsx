'use client';

/**
 * STATSPACK Monitoring Page
 * STATSPACK 스냅샷 관리 및 성능 리포트 생성
 * Standard Edition용 AWR/ADDM 대체 기능
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RefreshCw,
  Camera,
  FileText,
  Trash2,
  Calendar,
  TrendingUp,
  Activity,
  Clock,
  Database,
  AlertCircle,
  Download,
  Eye,
  Terminal,
  Shield,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface StatspackSnapshot {
  id: string;
  oracle_connection_id: string;
  snap_id: number;
  snap_time: string;
  startup_time: string;
  session_count: number;
  transaction_count: number;
  db_time_ms: number;
  cpu_time_ms: number;
  physical_reads: number;
  logical_reads: number;
  redo_size_mb: number;
  created_at: string;
}

interface StatspackReport {
  id: string;
  oracle_connection_id: string;
  begin_snap_id: number;
  end_snap_id: number;
  report_type: 'TEXT' | 'HTML';
  report_content: string;
  begin_time: string;
  end_time: string;
  created_at: string;
}

export default function StatspackPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
  const [selectedSnapshots, setSelectedSnapshots] = useState<number[]>([]);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [viewReportDialogOpen, setViewReportDialogOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<StatspackReport | null>(null);
  const [reportType, setReportType] = useState<'TEXT' | 'HTML'>('TEXT');

  const effectiveConnectionId = selectedConnectionId || 'all';

  // 스냅샷 목록 조회
  const { data: snapshotsData, isLoading: isLoadingSnapshots, refetch: refetchSnapshots } = useQuery({
    queryKey: ['statspack-snapshots', effectiveConnectionId],
    queryFn: async () => {
      if (effectiveConnectionId === 'all') {
        return { data: [] };
      }
      const params = new URLSearchParams({ connection_id: effectiveConnectionId });
      const res = await fetch(`/api/monitoring/statspack/snapshots?${params}`);
      if (!res.ok) throw new Error('스냅샷 목록 조회 실패');
      return res.json();
    },
    enabled: effectiveConnectionId !== 'all',
    refetchInterval: 60000, // 60초로 증가
    staleTime: 30 * 1000, // 30초간 캐시 유지
    refetchOnWindowFocus: false,
  });

  const snapshots: StatspackSnapshot[] = snapshotsData?.data || [];

  // 리포트 목록 조회
  const { data: reportsData, isLoading: isLoadingReports, refetch: refetchReports } = useQuery({
    queryKey: ['statspack-reports', effectiveConnectionId],
    queryFn: async () => {
      if (effectiveConnectionId === 'all') {
        return { data: [] };
      }
      const params = new URLSearchParams({ connection_id: effectiveConnectionId });
      const res = await fetch(`/api/monitoring/statspack/reports?${params}`);
      if (!res.ok) throw new Error('리포트 목록 조회 실패');
      return res.json();
    },
    enabled: effectiveConnectionId !== 'all',
  });

  const reports: StatspackReport[] = reportsData?.data || [];

  // 스냅샷 생성 Mutation
  const createSnapshotMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/monitoring/statspack/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: effectiveConnectionId }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.details || '스냅샷 생성 실패');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: '스냅샷 생성 완료',
        description: 'STATSPACK 스냅샷이 성공적으로 생성되었습니다.',
      });
      refetchSnapshots();
    },
    onError: (error: Error) => {
      toast({
        title: '스냅샷 생성 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // 리포트 생성 Mutation
  const createReportMutation = useMutation({
    mutationFn: async () => {
      if (selectedSnapshots.length !== 2) {
        throw new Error('2개의 스냅샷을 선택해주세요.');
      }

      const [beginSnapId, endSnapId] = selectedSnapshots.sort((a, b) => a - b);

      const res = await fetch('/api/monitoring/statspack/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connection_id: effectiveConnectionId,
          begin_snap_id: beginSnapId,
          end_snap_id: endSnapId,
          report_type: reportType,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.details || '리포트 생성 실패');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: '리포트 생성 완료',
        description: 'STATSPACK 리포트가 성공적으로 생성되었습니다.',
      });

      // 리포트 내용을 다운로드
      if (data?.data?.report_content) {
        const reportContent = data.data.report_content;
        const mimeType = reportType === 'HTML' ? 'text/html' : 'text/plain; charset=utf-8';
        const fileExt = reportType === 'HTML' ? 'html' : 'txt';
        const blob = new Blob([reportContent], { type: mimeType });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `statspack_${data.data.begin_snap_id}_${data.data.end_snap_id}.${fileExt}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }

      setReportDialogOpen(false);
      setSelectedSnapshots([]);
      refetchReports();
    },
    onError: (error: Error) => {
      toast({
        title: '리포트 생성 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // 리포트 삭제 Mutation
  const deleteReportMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const res = await fetch(`/api/monitoring/statspack/reports?id=${reportId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.details || '리포트 삭제 실패');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: '리포트 삭제 완료',
        description: '리포트가 성공적으로 삭제되었습니다.',
      });
      refetchReports();
    },
    onError: (error: Error) => {
      toast({
        title: '리포트 삭제 실패',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // 스냅샷 선택/해제
  const toggleSnapshot = (snapId: number) => {
    setSelectedSnapshots((prev) => {
      if (prev.includes(snapId)) {
        return prev.filter((id) => id !== snapId);
      } else {
        if (prev.length >= 2) {
          toast({
            title: '선택 제한',
            description: '최대 2개의 스냅샷만 선택할 수 있습니다.',
            variant: 'destructive',
          });
          return prev;
        }
        return [...prev, snapId];
      }
    });
  };

  // 스냅샷 생성
  const handleCreateSnapshot = () => {
    if (effectiveConnectionId === 'all') {
      toast({
        title: 'DB 연결 선택 필요',
        description: 'DB 연결을 선택한 후 스냅샷을 생성할 수 있습니다.',
        variant: 'destructive',
      });
      return;
    }
    createSnapshotMutation.mutate();
  };

  // 리포트 생성 다이얼로그 열기
  const handleOpenReportDialog = () => {
    if (effectiveConnectionId === 'all') {
      toast({
        title: 'DB 연결 선택 필요',
        description: 'DB 연결을 선택한 후 리포트를 생성할 수 있습니다.',
        variant: 'destructive',
      });
      return;
    }

    if (selectedSnapshots.length !== 2) {
      toast({
        title: '스냅샷 선택 필요',
        description: '리포트 생성을 위해 2개의 스냅샷을 선택해주세요.',
        variant: 'destructive',
      });
      return;
    }

    setReportDialogOpen(true);
  };

  // 리포트 보기
  const handleViewReport = (report: StatspackReport) => {
    setSelectedReport(report);
    setViewReportDialogOpen(true);
  };

  // 리포트 다운로드
  const handleDownloadReport = (report: StatspackReport) => {
    const blob = new Blob([report.report_content], {
      type: report.report_type === 'HTML' ? 'text/html' : 'text/plain',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `statspack_report_${report.begin_snap_id}_${report.end_snap_id}.${report.report_type === 'HTML' ? 'html' : 'txt'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">STATSPACK 모니터링</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Standard Edition용 성능 모니터링 (AWR/ADDM/ASH 대체)
          </p>
          {selectedConnection && (
            <p className="text-sm text-muted-foreground mt-1">
              연결: <span className="font-medium">{selectedConnection.name}</span> ({selectedConnection.host}:{selectedConnection.port})
            </p>
          )}
        </div>
      </div>

      {/* 안내 메시지 */}
      {effectiveConnectionId === 'all' && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-yellow-900">DB 연결을 선택해주세요</h3>
                <p className="text-sm text-yellow-700 mt-1">
                  STATSPACK 기능을 사용하려면 상단 헤더에서 Oracle DB 연결을 선택해야 합니다.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STATSPACK 정보 카드 */}
      <Card>
        <CardHeader>
          <CardTitle>STATSPACK이란?</CardTitle>
          <CardDescription>
            Oracle Standard Edition에서 사용 가능한 성능 분석 도구
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">주요 기능</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>성능 스냅샷 생성 및 관리</li>
                <li>기간별 성능 비교 리포트</li>
                <li>SQL 통계 및 Wait Event 분석</li>
                <li>시스템 리소스 사용량 추적</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">사용 방법</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>정기적으로 스냅샷을 생성합니다</li>
                <li>비교할 2개의 스냅샷을 선택합니다</li>
                <li>리포트를 생성하여 성능을 분석합니다</li>
                <li>TEXT 또는 HTML 형식으로 저장 가능</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DBA 설치 가이드 */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-blue-900">STATSPACK 설치 가이드 (DBA)</CardTitle>
          </div>
          <CardDescription>
            STATSPACK이 설치되지 않았거나 권한이 없는 경우, 아래 절차를 따라 설정하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="mt-0.5 bg-white">1</Badge>
              <div className="flex-1">
                <h4 className="font-semibold text-sm text-blue-900">STATSPACK 설치 (SYSDBA 권한 필요)</h4>
                <pre className="mt-2 p-3 bg-gray-900 text-gray-100 rounded-md text-xs overflow-x-auto">
{`-- SQL*Plus에서 SYSDBA로 접속
sqlplus / as sysdba

-- STATSPACK 설치 스크립트 실행
@$ORACLE_HOME/rdbms/admin/spcreate.sql`}
                </pre>
                <p className="text-xs text-muted-foreground mt-1">
                  설치 시 PERFSTAT 사용자와 테이블스페이스를 지정해야 합니다.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Badge variant="outline" className="mt-0.5 bg-white">2</Badge>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-600" />
                  <h4 className="font-semibold text-sm text-blue-900">사용자 권한 부여</h4>
                </div>
                <pre className="mt-2 p-3 bg-gray-900 text-gray-100 rounded-md text-xs overflow-x-auto">
{`-- 애플리케이션 사용자에게 권한 부여
GRANT EXECUTE ON PERFSTAT.STATSPACK TO <사용자명>;
GRANT SELECT ANY DICTIONARY TO <사용자명>;

-- 또는 PERFSTAT 스키마 접근 권한
GRANT SELECT ON PERFSTAT.STATS$SNAPSHOT TO <사용자명>;`}
                </pre>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Badge variant="outline" className="mt-0.5 bg-white">3</Badge>
              <div className="flex-1">
                <h4 className="font-semibold text-sm text-blue-900">설치 확인</h4>
                <pre className="mt-2 p-3 bg-gray-900 text-gray-100 rounded-md text-xs overflow-x-auto">
{`-- STATSPACK 설치 확인
SELECT COUNT(*) FROM dba_objects
WHERE owner = 'PERFSTAT' AND object_name = 'STATSPACK';`}
                </pre>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 스냅샷 관리 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>스냅샷 목록</CardTitle>
              <CardDescription className="mt-1">
                {selectedSnapshots.length > 0 && (
                  <span className="text-primary font-medium">
                    {selectedSnapshots.length}개 선택됨
                  </span>
                )}
                {selectedSnapshots.length === 0 && '리포트 생성을 위해 2개의 스냅샷을 선택하세요'}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleCreateSnapshot}
                disabled={createSnapshotMutation.isPending || effectiveConnectionId === 'all'}
              >
                <Camera className={`h-4 w-4 mr-2 ${createSnapshotMutation.isPending ? 'animate-pulse' : ''}`} />
                스냅샷 생성
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenReportDialog}
                disabled={selectedSnapshots.length !== 2 || effectiveConnectionId === 'all'}
              >
                <FileText className="h-4 w-4 mr-2" />
                리포트 생성
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchSnapshots()}
                disabled={effectiveConnectionId === 'all'}
              >
                <RefreshCw className={`h-4 w-4 mr-2`} />
                새로고침
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingSnapshots ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={`snapshot-skeleton-${i}`} className="h-16 w-full" />
              ))}
            </div>
          ) : snapshots.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">선택</TableHead>
                    <TableHead>Snap ID</TableHead>
                    <TableHead>스냅샷 시간</TableHead>
                    <TableHead className="text-right">Session Count</TableHead>
                    <TableHead className="text-right">DB Time (ms)</TableHead>
                    <TableHead className="text-right">CPU Time (ms)</TableHead>
                    <TableHead className="text-right">Physical Reads</TableHead>
                    <TableHead className="text-right">Logical Reads</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshots.map((snapshot) => (
                    <TableRow
                      key={snapshot.id}
                      className={`cursor-pointer ${selectedSnapshots.includes(snapshot.snap_id) ? 'bg-blue-50' : 'hover:bg-accent'}`}
                      onClick={() => toggleSnapshot(snapshot.snap_id)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedSnapshots.includes(snapshot.snap_id)}
                          onChange={() => toggleSnapshot(snapshot.snap_id)}
                          className="h-4 w-4 cursor-pointer"
                        />
                      </TableCell>
                      <TableCell className="font-medium">{snapshot.snap_id}</TableCell>
                      <TableCell>
                        {format(new Date(snapshot.snap_time), 'yyyy-MM-dd HH:mm:ss', { locale: ko })}
                      </TableCell>
                      <TableCell className="text-right">{snapshot.session_count.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{snapshot.db_time_ms.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{snapshot.cpu_time_ms.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{snapshot.physical_reads.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{snapshot.logical_reads.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">스냅샷이 없습니다</p>
              <p className="text-sm mt-2">스냅샷 생성 버튼을 클릭하여 첫 스냅샷을 생성하세요</p>
              {effectiveConnectionId !== 'all' && (
                <Button
                  className="mt-4"
                  onClick={handleCreateSnapshot}
                  disabled={createSnapshotMutation.isPending}
                >
                  <Camera className={`h-4 w-4 mr-2 ${createSnapshotMutation.isPending ? 'animate-pulse' : ''}`} />
                  첫 스냅샷 생성하기
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 리포트 목록 */}
      <Card>
        <CardHeader>
          <CardTitle>생성된 리포트</CardTitle>
          <CardDescription>STATSPACK 성능 분석 리포트</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingReports ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={`report-skeleton-${i}`} className="h-16 w-full" />
              ))}
            </div>
          ) : reports.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>리포트 기간</TableHead>
                    <TableHead>Snap ID 범위</TableHead>
                    <TableHead>리포트 타입</TableHead>
                    <TableHead>생성 일시</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="text-sm">
                            {format(new Date(report.begin_time), 'yyyy-MM-dd HH:mm', { locale: ko })}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            ~ {format(new Date(report.end_time), 'yyyy-MM-dd HH:mm', { locale: ko })}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">
                        {report.begin_snap_id} ~ {report.end_snap_id}
                      </TableCell>
                      <TableCell>
                        <Badge variant={report.report_type === 'HTML' ? 'default' : 'secondary'}>
                          {report.report_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(report.created_at), 'yyyy-MM-dd HH:mm:ss', { locale: ko })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewReport(report)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            보기
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadReport(report)}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            다운로드
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (confirm('이 리포트를 삭제하시겠습니까?')) {
                                deleteReportMutation.mutate(report.id);
                              }
                            }}
                            disabled={deleteReportMutation.isPending}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            삭제
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">생성된 리포트가 없습니다</p>
              <p className="text-sm mt-2">2개의 스냅샷을 선택하여 리포트를 생성하세요</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 리포트 생성 다이얼로그 */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>STATSPACK 리포트 생성</DialogTitle>
            <DialogDescription>
              선택한 스냅샷 구간의 성능 분석 리포트를 생성합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">선택된 스냅샷</label>
              <div className="text-sm text-muted-foreground">
                Snap ID: {selectedSnapshots.sort((a, b) => a - b).join(' ~ ')}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">리포트 형식</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="reportType"
                    value="TEXT"
                    checked={reportType === 'TEXT'}
                    onChange={(e) => setReportType(e.target.value as 'TEXT' | 'HTML')}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">TEXT (텍스트)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="reportType"
                    value="HTML"
                    checked={reportType === 'HTML'}
                    onChange={(e) => setReportType(e.target.value as 'TEXT' | 'HTML')}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">HTML (웹)</span>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={() => createReportMutation.mutate()} disabled={createReportMutation.isPending}>
              {createReportMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  생성 중...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  리포트 생성
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 리포트 보기 다이얼로그 */}
      <Dialog open={viewReportDialogOpen} onOpenChange={setViewReportDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>STATSPACK 리포트</DialogTitle>
            <DialogDescription>
              {selectedReport && (
                <>
                  Snap ID {selectedReport.begin_snap_id} ~ {selectedReport.end_snap_id} (
                  {format(new Date(selectedReport.begin_time), 'yyyy-MM-dd HH:mm', { locale: ko })} ~{' '}
                  {format(new Date(selectedReport.end_time), 'HH:mm', { locale: ko })})
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[70vh]">
            {selectedReport?.report_type === 'HTML' ? (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: selectedReport.report_content }}
              />
            ) : (
              <pre className="text-xs font-mono whitespace-pre-wrap bg-muted p-4 rounded-lg">
                {selectedReport?.report_content}
              </pre>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewReportDialogOpen(false)}>
              닫기
            </Button>
            {selectedReport && (
              <Button onClick={() => handleDownloadReport(selectedReport)}>
                <Download className="h-4 w-4 mr-2" />
                다운로드
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
