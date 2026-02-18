'use client';

/**
 * Tuning History Page
 * 튜닝 이력 페이지 - 타임라인 스타일로 개선
 */

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Filter,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  CheckCircle2,
  User,
  MessageSquare,
  FileText,
  Clock,
  ArrowRight,
  Search,
  X,
  Trash2,
  Settings,
  AlertTriangle,
  Download,
  Loader2,
  FileBarChart
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface TuningHistory {
  id: string;
  tuning_task_id: string;
  oracle_connection_id: string;
  sql_id: string;
  activity_type: string;
  description: string;
  old_value?: any;
  new_value?: any;
  elapsed_time_ms?: number;
  buffer_gets?: number;
  cpu_time_ms?: number;
  performed_by?: string;
  performed_at: string;
}

interface TuningTask {
  id: string;
  title: string;
  sql_id: string;
  status: string;
  priority: string;
  improvement_rate?: number;
  completed_at?: string;
}

const ACTIVITY_ICONS: Record<string, any> = {
  STATUS_CHANGE: CheckCircle2,
  ASSIGNMENT: User,
  COMMENT: MessageSquare,
  TUNING_ACTION: Activity,
  default: FileText,
};

const ACTIVITY_COLORS: Record<string, string> = {
  STATUS_CHANGE: 'bg-green-100 text-green-600',
  ASSIGNMENT: 'bg-blue-100 text-blue-600',
  COMMENT: 'bg-yellow-100 text-yellow-600',
  TUNING_ACTION: 'bg-purple-100 text-purple-600',
  default: 'bg-slate-100 text-slate-600',
};

export default function TuningHistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const sqlIdFromUrl = searchParams.get('sql_id');
  const connectionIdFromUrl = searchParams.get('connection_id');

  const [activityTypeFilter, setActivityTypeFilter] = useState<string>('all');
  const [limit, setLimit] = useState<number>(50);
  const [searchSqlId, setSearchSqlId] = useState(sqlIdFromUrl || '');

  // 데이터 관리 다이얼로그 상태
  const [isManageDialogOpen, setIsManageDialogOpen] = useState(false);
  const [retentionPeriod, setRetentionPeriod] = useState("90"); // Default 90 days

  // 엑셀 다운로드 관련 상태
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStartDate, setExportStartDate] = useState(
    new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0]
  );
  const [exportEndDate, setExportEndDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  // 개별 리포트 다운로드 상태
  const [downloadingTaskId, setDownloadingTaskId] = useState<string | null>(null);

  // 튜닝 이력 조회
  const { data: historyData, isLoading } = useQuery({
    queryKey: ['tuning-history', activityTypeFilter, limit, searchSqlId, connectionIdFromUrl],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: limit.toString(),
      });

      if (activityTypeFilter !== 'all') {
        params.append('activity_type', activityTypeFilter);
      }

      if (searchSqlId) {
        params.append('sql_id', searchSqlId);
      }

      if (connectionIdFromUrl) {
        params.append('connection_id', connectionIdFromUrl);
      }

      const res = await fetch(`/api/tuning/history?${params}`);
      if (!res.ok) throw new Error('Failed to fetch tuning history');
      return res.json();
    },
    refetchInterval: 60000,
  });

  const history: TuningHistory[] = historyData?.data || [];

  // 완료된 튜닝 작업 조회
  const { data: completedTasks } = useQuery<TuningTask[]>({
    queryKey: ['completed-tuning-tasks'],
    queryFn: async () => {
      const res = await fetch('/api/tuning/tasks?status=COMPLETED&limit=5'); // Recent 5 only
      if (!res.ok) throw new Error('Failed to fetch completed tasks');
      const data = await res.json();
      return data.data || [];
    },
  });

  // 이력 삭제 Mutation
  const deleteHistoryMutation = useMutation({
    mutationFn: async (days: number) => {
      const res = await fetch(`/api/tuning/history?retention_days=${days}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete history');
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "이력 삭제 완료",
        description: `${data.deleted_count}개의 오래된 이력 데이터가 삭제되었습니다.`,
      });
      setIsManageDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['tuning-history'] });
    },
    onError: () => {
      toast({
        title: "이력 삭제 실패",
        description: "데이터 삭제 중 오류가 발생했습니다.",
        variant: "destructive"
      });
    }
  });

  // 통계 계산
  const avgImprovement = completedTasks && completedTasks.length > 0
    ? (completedTasks.reduce((sum, task) => sum + (task.improvement_rate || 0), 0) / completedTasks.length).toFixed(1)
    : '0.0';

  const handleSearch = () => {
    // 
  };

  const clearSearch = () => {
    setSearchSqlId('');
    router.push('/tuning/history');
  };

  const handleDeleteHistory = () => {
    const days = parseInt(retentionPeriod);
    if (isNaN(days) || days <= 0) return;
    deleteHistoryMutation.mutate(days);
  };

  // 전체 이력 엑셀 다운로드
  const handleExcelDownload = async () => {
    if (!exportStartDate || !exportEndDate) {
      toast({ title: "날짜 선택 필요", description: "다운로드할 기간을 선택해주세요.", variant: "destructive" });
      return;
    }

    setIsExporting(true);
    try {
      const params = new URLSearchParams({
        limit: 'all',
        start_date: exportStartDate,
        end_date: exportEndDate
      });

      if (activityTypeFilter !== 'all') params.append('activity_type', activityTypeFilter);
      if (searchSqlId) params.append('sql_id', searchSqlId);

      const res = await fetch(`/api/tuning/history?${params}`);
      if (!res.ok) throw new Error('데이터 조회 실패');

      const json = await res.json();
      const records = json.data;

      if (!records || records.length === 0) {
        toast({ title: "데이터 없음", description: "선택한 기간에 해당하는 이력이 없습니다." });
        setIsExporting(false);
        return;
      }

      const XLSX = await import("xlsx");

      const excelData = records.map((item: any) => ({
        '일시': new Date(item.performed_at).toLocaleString('ko-KR'),
        '활동 유형': item.activity_type,
        'SQL ID': item.sql_id,
        '내용': item.description,
        '변경 전': typeof item.old_value === 'object' ? JSON.stringify(item.old_value) : item.old_value,
        '변경 후': typeof item.new_value === 'object' ? JSON.stringify(item.new_value) : item.new_value,
        '수행자': item.performed_by || 'Unknown'
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Tuning History");

      const wscols = [
        { wch: 20 },
        { wch: 15 },
        { wch: 20 },
        { wch: 50 },
        { wch: 20 },
        { wch: 20 },
        { wch: 15 },
      ];
      worksheet['!cols'] = wscols;

      XLSX.writeFile(workbook, `Tuning_History_${exportStartDate}_${exportEndDate}.xlsx`);

      toast({ title: "다운로드 완료", description: "엑셀 파일 저장이 완료되었습니다." });
      setIsDownloadDialogOpen(false);
    } catch (err) {
      console.error(err);
      toast({ title: "다운로드 실패", description: "엑셀 파일 생성 중 오류가 발생했습니다.", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  // 개별 튜닝 완료 보고서 다운로드
  const handleDownloadTaskReport = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloadingTaskId(taskId);

    try {
      toast({ title: "보고서 생성 중...", description: "데이터를 조회하고 있습니다." });

      // 1. 태스크 상세 정보 조회
      const taskRes = await fetch(`/api/tuning/tasks/${taskId}`);
      const taskJson = await taskRes.json();
      const task = taskJson.data;

      if (!task) throw new Error("Task not found");

      // 2. 관련 이력 조회
      const histRes = await fetch(`/api/tuning/history?tuning_task_id=${taskId}&limit=100`);
      const histJson = await histRes.json();
      const historyRecs = histJson.data || [];

      // 3. 엑셀 생성
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      // -- Sheet 1: 요약 --
      const summaryData = [
        ["튜닝 완료 보고서"],
        [],
        ["작업 제목", task.title],
        ["SQL ID", task.sql_id],
        ["담당자", task.assignee_name || task.assigned_to || "미지정"],
        ["완료일", new Date(task.completed_at).toLocaleString()],
        ["우선순위", task.priority],
        ["상태", task.status],
        [],
        ["[성능 개선 결과]"],
        ["항목", "튜닝 전", "튜닝 후", "개선율"],
        ["Elapsed Time (s)", (task.before_elapsed_time_ms / 1000) || 0, (task.after_elapsed_time_ms / 1000) || 0, `${task.improvement_rate}%`],
        ["Buffer Gets", task.before_buffer_gets || 0, task.after_buffer_gets || 0, ""],
        [],
        ["[튜닝 상세 내용]"],
        [task.tuning_details || task.description || "내용 없음"]
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);

      // 스타일링을 위해 컬럼 너비 지정
      wsSummary['!cols'] = [{ wch: 20 }, { wch: 40 }, { wch: 15 }, { wch: 15 }];

      XLSX.utils.book_append_sheet(wb, wsSummary, "요약");

      // -- Sheet 2: SQL --
      const sqlData = [
        ["[SQL Text]"],
        [task.sql_text],
        [],
        ["[Tuned SQL / Implemented Changes]"],
        [task.implemented_changes || "(변경 SQL 없음)"]
      ];
      const wsSql = XLSX.utils.aoa_to_sheet(sqlData);
      wsSql['!cols'] = [{ wch: 100 }];
      XLSX.utils.book_append_sheet(wb, wsSql, "SQL");

      // -- Sheet 3: 작업 이력 --
      if (historyRecs.length > 0) {
        const histRows = historyRecs.map((h: any) => ({
          "일시": new Date(h.performed_at).toLocaleString(),
          "활동": h.activity_type,
          "내용": h.description,
          "수행자": h.performed_by
        }));
        const wsHist = XLSX.utils.json_to_sheet(histRows);
        wsHist['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 50 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(wb, wsHist, "진행 이력");
      }

      XLSX.writeFile(wb, `Tuning_Report_${task.sql_id}_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast({ title: "다운로드 완료", description: "튜닝 완료 보고서가 생성되었습니다." });

    } catch (err) {
      console.error(err);
      toast({ title: "오류 발생", description: "보고서 생성 중 문제가 발생했습니다.", variant: "destructive" });
    } finally {
      setDownloadingTaskId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-1">
      {/* 페이지 헤더 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">튜닝 이력</h1>
          <p className="text-muted-foreground">
            시스템 내 모든 튜닝 활동과 변경 이력을 타임라인으로 확인합니다.
          </p>
        </div>

        {/* 요약 통계 및 관리 버튼 */}
        <div className="flex gap-2">
          {/* 엑셀 다운로드 버튼 */}
          <Dialog open={isDownloadDialogOpen} onOpenChange={setIsDownloadDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="h-auto">
                <Download className="h-4 w-4 mr-2" />
                다운로드
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>이력 데이터 다운로드</DialogTitle>
                <DialogDescription>
                  선택한 기간의 튜닝 이력을 엑셀(.xlsx) 파일로 저장합니다.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>시작일</Label>
                  <Input
                    type="date"
                    value={exportStartDate}
                    onChange={(e) => setExportStartDate(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>종료일</Label>
                  <Input
                    type="date"
                    value={exportEndDate}
                    onChange={(e) => setExportEndDate(e.target.value)}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDownloadDialogOpen(false)}>취소</Button>
                <Button onClick={handleExcelDownload} disabled={isExporting}>
                  {isExporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  엑셀 다운로드
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* 데이터 관리 버튼 */}
          <Dialog open={isManageDialogOpen} onOpenChange={setIsManageDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="h-auto">
                <Settings className="h-4 w-4 mr-2" />
                이력 관리
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>튜닝 이력 데이터 관리</DialogTitle>
                <DialogDescription>
                  오래된 이력 데이터를 정리하여 디스크 공간을 확보합니다.
                </DialogDescription>
              </DialogHeader>

              <div className="py-4 space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-amber-900 text-sm">주의사항</h4>
                    <p className="text-sm text-amber-800 mt-1">
                      삭제된 이력 데이터는 복구할 수 없습니다. 중요한 감사 로그가 포함되어 있는지 확인 후 삭제하세요.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">보관 기간 선택</label>
                  <Select value={retentionPeriod} onValueChange={setRetentionPeriod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30일 (1개월)</SelectItem>
                      <SelectItem value="90">90일 (3개월)</SelectItem>
                      <SelectItem value="180">180일 (6개월)</SelectItem>
                      <SelectItem value="365">365일 (1년)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    선택한 기간({retentionPeriod}일)보다 오래된 모든 이력이 삭제됩니다.
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsManageDialogOpen(false)}>취소</Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteHistory}
                  disabled={deleteHistoryMutation.isPending}
                >
                  {deleteHistoryMutation.isPending ? "삭제 중..." : "오래된 이력 삭제"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-sm text-muted-foreground">총 활동</p>
            <p className="text-2xl font-bold">{history.length}</p>
          </div>
          <Activity className="h-8 w-8 text-slate-300" />
        </Card>
        <Card className="p-4 flex items-center justify-between shadow-sm">
          <div>
            <p className="text-sm text-muted-foreground">평균 개선</p>
            <p className="text-2xl font-bold text-green-600">+{avgImprovement}%</p>
          </div>
          <TrendingUp className="h-8 w-8 text-green-200" />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 왼쪽: 필터 및 최근 완료 목록 */}
        <div className="space-y-6 order-2 lg:order-1">
          {/* 검색 및 필터 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">검색 및 필터</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">SQL ID 검색</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="SQL ID 입력"
                    value={searchSqlId}
                    onChange={(e) => setSearchSqlId(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className="font-mono text-sm"
                  />
                  {searchSqlId && (
                    <Button variant="ghost" size="icon" onClick={clearSearch}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">활동 유형</label>
                <Select value={activityTypeFilter} onValueChange={setActivityTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="모든 활동" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">모든 활동</SelectItem>
                    <SelectItem value="STATUS_CHANGE">상태 변경</SelectItem>
                    <SelectItem value="ASSIGNMENT">담당자 할당</SelectItem>
                    <SelectItem value="COMMENT">코멘트/토론</SelectItem>
                    <SelectItem value="TUNING_ACTION">튜닝 실행</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">조회 개수</label>
                <Select value={limit.toString()} onValueChange={(v) => setLimit(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">최근 25개</SelectItem>
                    <SelectItem value="50">최근 50개</SelectItem>
                    <SelectItem value="100">최근 100개</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* 최근 완료된 튜닝 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">최근 완료된 튜닝</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {completedTasks && completedTasks.length > 0 ? (
                <div className="divide-y relative">
                  {completedTasks.map((task) => (
                    <div
                      key={task.id}
                      className="group relative p-3 hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/tuning/${task.id}`)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-xs text-muted-foreground bg-slate-100 px-1 py-0.5 rounded">
                          {task.sql_id}
                        </span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] text-green-600 bg-green-50 border-green-100">
                            +{task.improvement_rate?.toFixed(0)}%
                          </Badge>

                          {/* 보고서 다운로드 버튼 */}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-slate-400 hover:text-blue-600"
                                  onClick={(e) => handleDownloadTaskReport(task.id, e)}
                                  disabled={downloadingTaskId === task.id}
                                >
                                  {downloadingTaskId === task.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <FileBarChart className="h-3 w-3" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>튜닝 완료 보고서 다운로드</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                      <p className="text-sm font-medium truncate pr-6">{task.title}</p>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        {new Date(task.completed_at!).toLocaleDateString()} 완료
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  완료된 튜닝이 없습니다.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 오른쪽: 타임라인 */}
        <div className="lg:col-span-2 order-1 lg:order-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                활동 타임라인
              </CardTitle>
              <CardDescription>
                {searchSqlId ? `SQL ID '${searchSqlId}'에 대한 검색 결과` : '전체 시스템 활동 로그'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex gap-4">
                      <Skeleton className="w-12 h-12 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-4 w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : history.length > 0 ? (
                <div className="relative pl-4 space-y-8 before:absolute before:inset-0 before:ml-4 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                  {history.map((item, index) => {
                    const Icon = ACTIVITY_ICONS[item.activity_type] || ACTIVITY_ICONS.default;
                    const colorClass = ACTIVITY_COLORS[item.activity_type] || ACTIVITY_COLORS.default;
                    const date = new Date(item.performed_at);

                    return (
                      <div key={item.id} className="relative flex items-start group">
                        {/* 아이콘 */}
                        <div className={cn(
                          "absolute left-0 mt-1 flex h-8 w-8 items-center justify-center rounded-full border ring-4 ring-white transition-colors bg-white",
                        )}>
                          <Icon className={cn("h-4 w-4", colorClass.split(' ')[1])} />
                        </div>

                        {/* 내용 */}
                        <div className="ml-12 w-full">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-[10px]">
                                {item.activity_type}
                              </Badge>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {date.toLocaleString('ko-KR')}
                              </span>
                            </div>
                            <span className="text-xs font-mono text-muted-foreground bg-slate-50 px-1 rounded">
                              {item.sql_id}
                            </span>
                          </div>

                          <div className="bg-slate-50 p-3 rounded-lg border group-hover:bg-slate-100 transition-colors">
                            <p className="text-sm font-medium text-slate-800">
                              {item.description}
                            </p>

                            {(item.old_value || item.new_value) && (
                              <div className="mt-2 text-xs bg-white p-2 rounded border border-slate-100 overflow-x-auto">
                                <div className="flex items-center gap-2 text-slate-500">
                                  <span>{String(item.old_value || '(비어있음)')}</span>
                                  <ArrowRight className="h-3 w-3" />
                                  <span className="font-medium text-slate-700">{String(item.new_value)}</span>
                                </div>
                              </div>
                            )}

                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {item.performed_by || 'System'}
                              </span>
                              <Button
                                variant="link"
                                size="sm"
                                className="h-auto p-0 text-xs"
                                onClick={() => router.push(`/tuning/${item.tuning_task_id}`)}
                              >
                                상세 보기 <ArrowRight className="h-3 w-3 ml-1" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>활동 이력이 없습니다.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
