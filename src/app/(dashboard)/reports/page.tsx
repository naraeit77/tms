'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ReportsAnalyticsChart } from '@/components/charts/reports-analytics-chart';
import { ReportExportModal } from '@/components/charts/report-export-modal';
import { AdvancedFiltersModal } from '@/components/charts/advanced-filters-modal';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import {
  FileText,
  Download,
  Calendar,
  Clock,
  TrendingUp,
  Activity,
  Search,
  Filter,
  Eye,
  Plus,
  RefreshCw,
  BarChart3,
  MoreVertical,
  Loader2,
  PieChart,
  Users,
  Trash2
} from 'lucide-react';

// Type definitions
interface ReportMetadata {
  id: string;
  title: string;
  description: string;
  type: 'summary' | 'detailed' | 'trend' | 'comparison';
  period: string;
  generatedAt: Date;
  size: string;
  status: 'completed' | 'generating' | 'failed';
  tags: string[];
  author?: string;
}

interface ReportSummaryData {
  totalReports: number;
  reportsThisMonth: number;
  avgGenerationTime: number;
  popularReportTypes: {
    type: string;
    count: number;
    percentage: number;
  }[];
  recentActivity: {
    date: string;
    action: string;
    reportName: string;
    user?: string;
  }[];
}

interface ReportInsights {
  monthlyGrowthRate: number;
  totalDownloads: number;
  avgDownloadsPerDay: number;
  engagementRate: number;
  activeUsers: number;
}

interface ReportUsageData {
  date: string;
  generated: number;
  downloaded: number;
  views: number;
}

interface AdvancedFilters {
  dateRange: {
    start?: string;
    end?: string;
    preset?: 'today' | '7d' | '30d' | '90d' | 'custom';
  };
  reportTypes: string[];
  authors: string[];
  tags: string[];
  status: string[];
  sizeRange: {
    min?: number;
    max?: number;
  };
  customConditions: {
    field: string;
    operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'between' | 'in';
    value: string | number | string[];
    label?: string;
  }[];
}

interface ExportOptions {
  format: 'pdf' | 'excel' | 'csv' | 'json' | 'html';
  includeCharts: boolean;
  includeRawData: boolean;
  includeMetadata: boolean;
  dateRange?: string;
  customFilename?: string;
}

export default function ReportsPage() {
  const { selectedConnection } = useSelectedDatabase();
  const [reports, setReports] = useState<ReportMetadata[]>([]);
  const [summaryData, setSummaryData] = useState<ReportSummaryData | null>(null);
  const [analyticsData, setAnalyticsData] = useState<ReportUsageData[]>([]);
  const [insightsData, setInsightsData] = useState<ReportInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('overview');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterPeriod, setFilterPeriod] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [selectedReportForExport, setSelectedReportForExport] = useState<ReportMetadata | null>(null);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({
    dateRange: {},
    reportTypes: [],
    authors: [],
    tags: [],
    status: [],
    sizeRange: {},
    customConditions: []
  });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<ReportMetadata | null>(null);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: '20',
        offset: '0'
      });

      if (filterType !== 'all') params.append('type', filterType);
      if (filterPeriod !== 'all') params.append('period', filterPeriod);
      if (searchTerm) params.append('search', searchTerm);

      // Add advanced filters
      if (advancedFilters.reportTypes.length > 0) {
        advancedFilters.reportTypes.forEach(type => params.append('types', type));
      }
      if (advancedFilters.status.length > 0) {
        advancedFilters.status.forEach(status => params.append('status', status));
      }
      if (advancedFilters.tags.length > 0) {
        params.append('tags', advancedFilters.tags.join(','));
      }
      if (advancedFilters.dateRange.start) {
        params.append('dateFrom', advancedFilters.dateRange.start);
      }
      if (advancedFilters.dateRange.end) {
        params.append('dateTo', advancedFilters.dateRange.end);
      }

      const response = await fetch(`/api/reports?${params}`);
      const result = await response.json();

      console.log('API Response:', result);
      console.log('Reports data:', result.data);

      if (result.success) {
        setReports(result.data);
        console.log('Reports set:', result.data);
      } else {
        console.error('Failed to load reports:', result.error);
      }
    } catch (error) {
      console.error('Failed to load reports:', error);
    } finally {
      setLoading(false);
    }
  }, [filterType, filterPeriod, searchTerm, advancedFilters]);

  const loadSummaryData = useCallback(async () => {
    try {
      const response = await fetch('/api/reports/analytics?days=30');
      const result = await response.json();

      if (result.success) {
        setSummaryData(result.data.summary);
        setAnalyticsData(result.data.analytics || []);
        setInsightsData(result.data.insights || null);
      } else {
        console.error('Failed to load summary data:', result.error);
      }
    } catch (error) {
      console.error('Failed to load summary data:', error);
    }
  }, []);

  useEffect(() => {
    loadReports();
    loadSummaryData();
  }, [loadReports, loadSummaryData]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      loadReports();
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [filterType, filterPeriod, searchTerm, advancedFilters, loadReports]);

  const handleReportClick = (report: ReportMetadata) => {
    if (report.status === 'completed') {
      router.push('/reports/summary');
    }
  };

  const handleGenerateReport = () => {
    router.push('/reports/generate');
  };

  const handleExportReport = async (report: ReportMetadata) => {
    setSelectedReportForExport(report);
    setShowExportModal(true);
  };

  const handleExportOptions = async (options: ExportOptions) => {
    if (!selectedReportForExport) return;

    try {
      const response = await fetch(`/api/reports/${selectedReportForExport.id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options)
      });

      const result = await response.json();

      if (result.success) {
        // Trigger actual download
        if (result.data.downloadUrl) {
          const link = document.createElement('a');
          link.href = result.data.downloadUrl;
          link.download = result.data.filename || `report-${selectedReportForExport.id}.${options.format}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }

        // Show success message
        const message = `보고서가 ${options.format.toUpperCase()} 형식으로 다운로드되었습니다!`;
        alert(message);

        setShowExportModal(false);
      } else {
        alert('내보내기에 실패했습니다: ' + result.error);
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert('내보내기 중 오류가 발생했습니다.');
    }
  };

  const handleAdvancedFilters = (filters: AdvancedFilters) => {
    setAdvancedFilters(filters);
    loadReports();
  };

  const handleDeleteClick = (report: ReportMetadata, e: React.MouseEvent) => {
    e.stopPropagation();
    setReportToDelete(report);
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!reportToDelete) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/reports?id=${reportToDelete.id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        // Remove the deleted report from the list
        setReports(reports.filter(r => r.id !== reportToDelete.id));
        setShowDeleteDialog(false);
        setReportToDelete(null);
        alert('보고서가 성공적으로 삭제되었습니다.');
      } else {
        alert(`보고서 삭제 실패: ${result.error}`);
      }
    } catch (error) {
      console.error('Delete failed:', error);
      alert('보고서 삭제 중 오류가 발생했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteDialog(false);
    setReportToDelete(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 border-0">완료</Badge>;
      case 'generating':
        return <Badge className="bg-blue-100 text-blue-800 border-0">생성 중</Badge>;
      case 'failed':
        return <Badge variant="destructive">실패</Badge>;
      default:
        return <Badge variant="outline">알 수 없음</Badge>;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'summary':
        return <FileText className="h-4 w-4" />;
      case 'detailed':
        return <Search className="h-4 w-4" />;
      case 'trend':
        return <TrendingUp className="h-4 w-4" />;
      case 'comparison':
        return <BarChart3 className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const filteredReports = reports.filter(report => {
    const matchesType = filterType === 'all' || report.type === filterType;
    const matchesPeriod = filterPeriod === 'all' || report.period === filterPeriod;
    const matchesSearch = searchTerm === '' ||
      report.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.description.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesType && matchesPeriod && matchesSearch;
  });

  const getActiveFiltersCount = () => {
    let count = 0;
    if (filterType !== 'all') count++;
    if (filterPeriod !== 'all') count++;
    if (searchTerm) count++;
    if (advancedFilters.reportTypes.length > 0) count++;
    if (advancedFilters.status.length > 0) count++;
    if (advancedFilters.tags.length > 0) count++;
    if (advancedFilters.authors.length > 0) count++;
    if (advancedFilters.dateRange.start || advancedFilters.dateRange.end) count++;
    return count;
  };

  if (loading && reports.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">보고서 관리</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            SQL 성능 보고서 생성, 관리 및 다운로드
          </p>
          {selectedConnection && (
            <p className="text-sm text-muted-foreground mt-1">
              연결: <span className="font-medium">{selectedConnection.name}</span> ({selectedConnection.host}:{selectedConnection.port})
            </p>
          )}
        </div>
        <div className="flex items-center space-x-3">
          <Button onClick={handleGenerateReport}>
            <Plus className="h-4 w-4 mr-2" />
            새 보고서 생성
          </Button>
        </div>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">개요</TabsTrigger>
          <TabsTrigger value="reports">보고서 목록</TabsTrigger>
          <TabsTrigger value="analytics">분석</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">총 보고서 수</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{summaryData?.totalReports || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">전체 생성된 보고서</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">이번 달</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">{summaryData?.reportsThisMonth || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">새로 생성된 보고서</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">평균 생성 시간</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">
                  {summaryData?.avgGenerationTime
                    ? `${Math.max(0, summaryData.avgGenerationTime).toFixed(1)}초`
                    : '0초'}
                </div>
                <p className="text-xs text-muted-foreground mt-1">보고서 생성 속도</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">활성 상태</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  {reports.filter(r => r.status === 'completed').length}
                </div>
                <p className="text-xs text-muted-foreground mt-1">사용 가능한 보고서</p>
              </CardContent>
            </Card>
          </div>

          {/* Popular Report Types & Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <PieChart className="h-5 w-5 mr-2" />
                  인기 보고서 유형
                </CardTitle>
                <CardDescription>가장 많이 생성된 보고서 타입별 분포</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {summaryData?.popularReportTypes.map((type, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="text-sm font-medium">{type.type}</div>
                        <div className="text-xs text-gray-500">{type.count}개</div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div
                            className="h-2 rounded-full bg-blue-600"
                            style={{ width: `${type.percentage}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-gray-500 w-8">
                          {type.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="h-5 w-5 mr-2" />
                  최근 활동
                </CardTitle>
                <CardDescription>보고서 관련 최근 활동 내역</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {summaryData?.recentActivity.map((activity, index) => (
                    <div key={index} className="flex items-start space-x-3">
                      <div className="flex-shrink-0">
                        {activity.action === '보고서 생성' && (
                          <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                        )}
                        {activity.action === 'PDF 다운로드' && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                        )}
                        {activity.action === '보고서 삭제' && (
                          <div className="w-2 h-2 bg-red-500 rounded-full mt-2"></div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900 dark:text-white">
                          {activity.action}: <span className="font-medium">{activity.reportName}</span>
                        </p>
                        <div className="flex items-center space-x-2 text-xs text-gray-500">
                          <span>{activity.date}</span>
                          {activity.user && (
                            <>
                              <span>•</span>
                              <span>{activity.user}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="reports" className="space-y-6">
          {/* Filters - Integrated at top */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="보고서 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 w-full border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-800"
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="보고서 유형" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">모든 유형</SelectItem>
                  <SelectItem value="summary">요약 보고서</SelectItem>
                  <SelectItem value="detailed">상세 분석</SelectItem>
                  <SelectItem value="trend">트렌드 분석</SelectItem>
                  <SelectItem value="comparison">비교 분석</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                <SelectTrigger className="w-full sm:w-32">
                  <SelectValue placeholder="기간" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">모든 기간</SelectItem>
                  <SelectItem value="24h">24시간</SelectItem>
                  <SelectItem value="7d">7일</SelectItem>
                  <SelectItem value="30d">30일</SelectItem>
                  <SelectItem value="90d">90일</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => setShowFiltersModal(true)}
                className={getActiveFiltersCount() > 3 ? 'border-blue-500 text-blue-600' : ''}
              >
                <Filter className="h-4 w-4 mr-2" />
                고급 필터
                {getActiveFiltersCount() > 3 && (
                  <Badge variant="secondary" className="ml-2">
                    {getActiveFiltersCount() - 3}
                  </Badge>
                )}
              </Button>
              <Button variant="outline" onClick={loadReports}>
                <RefreshCw className="h-4 w-4 mr-2" />
                새로고침
              </Button>
            </div>

            {/* Active Filters Display */}
            {getActiveFiltersCount() > 0 && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <span className="text-sm text-gray-500 mr-2">활성 필터:</span>
                {filterType !== 'all' && (
                  <Badge variant="outline" className="cursor-pointer" onClick={() => setFilterType('all')}>
                    유형: {filterType} ×
                  </Badge>
                )}
                {filterPeriod !== 'all' && (
                  <Badge variant="outline" className="cursor-pointer" onClick={() => setFilterPeriod('all')}>
                    기간: {filterPeriod} ×
                  </Badge>
                )}
                {searchTerm && (
                  <Badge variant="outline" className="cursor-pointer" onClick={() => setSearchTerm('')}>
                    검색: {searchTerm} ×
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Reports Grid - Individual Cards */}
          <div className="grid grid-cols-1 gap-4">
            {filteredReports.map((report) => (
              <Card
                key={report.id}
                className={`hover:shadow-md transition-shadow ${
                  report.status === 'completed' ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                }`}
                onClick={() => handleReportClick(report)}
              >
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-4 flex-1">
                      <div className="flex-shrink-0 mt-1">
                        {getTypeIcon(report.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {report.title}
                          </h3>
                          {getStatusBadge(report.status)}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                          {report.description}
                        </p>
                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                          <span className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            {new Date(report.generatedAt).toLocaleDateString()}
                          </span>
                          <span>{report.size}</span>
                          <span>기간: {report.period}</span>
                          {report.author && <span>작성자: {report.author}</span>}
                        </div>
                        {report.tags.length > 0 && (
                          <div className="flex items-center space-x-2 mt-3">
                            {report.tags.map((tag, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      {report.status === 'completed' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReportClick(report);
                            }}
                            title="보고서 보기"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExportReport(report);
                            }}
                            title="내보내기"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                }}
                                title="더보기"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={(e) => handleDeleteClick(report, e)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                삭제
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      )}
                      {report.status === 'generating' && (
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                      )}
                      {report.status === 'failed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            console.log('Retry report generation:', report.id);
                          }}
                          title="다시 생성"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredReports.length === 0 && !loading && (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-gray-500">검색 결과가 없습니다</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <BarChart3 className="h-5 w-5 mr-2" />
                보고서 사용 분석
              </CardTitle>
              <CardDescription>보고서 생성 및 사용 패턴 분석 (최근 30일)</CardDescription>
            </CardHeader>
            <CardContent>
              {analyticsData.length > 0 ? (
                <ReportsAnalyticsChart data={analyticsData} width={800} height={300} />
              ) : (
                <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                  <div className="text-center space-y-2">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      분석 데이터 로딩 중...
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">월별 생성 추이</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className={`text-2xl font-bold ${
                    (insightsData?.monthlyGrowthRate || 0) >= 0 ? 'text-blue-600' : 'text-red-600'
                  }`}>
                    {(insightsData?.monthlyGrowthRate || 0) >= 0 ? '+' : ''}
                    {insightsData?.monthlyGrowthRate || 0}%
                  </div>
                  <p className="text-xs text-gray-500">전월 대비 증가</p>
                  <div className="flex items-center space-x-2 text-xs text-gray-600">
                    <TrendingUp className={`h-3 w-3 ${
                      (insightsData?.monthlyGrowthRate || 0) >= 0 ? 'text-green-500' : 'text-red-500'
                    }`} />
                    <span>
                      {(insightsData?.monthlyGrowthRate || 0) >= 0 ? '지속적인 증가 추세' : '감소 추세'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">다운로드 통계</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="text-2xl font-bold text-green-600">
                    {insightsData?.totalDownloads?.toLocaleString() || 0}
                  </div>
                  <p className="text-xs text-gray-500">총 다운로드 수</p>
                  <div className="flex items-center space-x-2 text-xs text-gray-600">
                    <Download className="h-3 w-3 text-blue-500" />
                    <span>일평균 {insightsData?.avgDownloadsPerDay || 0}회</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">사용자 참여도</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="text-2xl font-bold text-purple-600">
                    {insightsData?.engagementRate || 0}%
                  </div>
                  <p className="text-xs text-gray-500">활성 사용률</p>
                  <div className="flex items-center space-x-2 text-xs text-gray-600">
                    <Users className="h-3 w-3 text-purple-500" />
                    <span>{insightsData?.activeUsers || 0}명 활성 사용자</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Export Modal */}
      {selectedReportForExport && (
        <ReportExportModal
          open={showExportModal}
          onOpenChange={setShowExportModal}
          reportId={selectedReportForExport.id}
          reportTitle={selectedReportForExport.title}
          onExport={handleExportOptions}
        />
      )}

      {/* Advanced Filters Modal */}
      <AdvancedFiltersModal
        open={showFiltersModal}
        onOpenChange={setShowFiltersModal}
        filters={advancedFilters}
        onFiltersChange={setAdvancedFilters}
        onApplyFilters={handleAdvancedFilters}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>보고서 삭제 확인</DialogTitle>
            <DialogDescription>
              정말로 &quot;{reportToDelete?.title}&quot; 보고서를 삭제하시겠습니까?
              <br />
              이 작업은 되돌릴 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleDeleteCancel}
              disabled={deleting}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  삭제 중...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  삭제
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
