'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ReportExportModal } from '@/components/charts/report-export-modal';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Download,
  FileText,
  Database,
  TrendingUp,
  Activity,
  BarChart3,
  Loader2,
  AlertCircle,
  Eye
} from 'lucide-react';

interface ReportDetail {
  id: string;
  user_id: string;
  template_id?: string;
  name: string;
  description?: string;
  type: 'summary' | 'detailed' | 'trend' | 'comparison';
  config: {
    period: string;
    databases: string[];
    include_charts: boolean;
    include_recommendations: boolean;
    include_raw_data: boolean;
    format: string;
    filters: any;
  };
  status: 'draft' | 'generating' | 'completed' | 'failed';
  file_path?: string;
  file_size?: number;
  generated_at?: string;
  error_message?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export default function ReportDetailPage() {
  const router = useRouter();
  const params = useParams();
  const reportId = params.id as string;

  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    loadReport();
  }, [reportId]);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/reports/${reportId}`);
      const result = await response.json();

      if (result.success) {
        setReport(result.data);
      } else {
        setError(result.error || '보고서를 불러오는데 실패했습니다.');
      }
    } catch (err) {
      console.error('Failed to load report:', err);
      setError('보고서를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    router.push('/reports');
  };

  const handleDownload = async () => {
    if (!report) return;

    try {
      // Direct download via API
      const response = await fetch(`/api/reports/${reportId}/download`);

      if (!response.ok) {
        throw new Error('다운로드에 실패했습니다.');
      }

      // Get the blob from the response
      const blob = await response.blob();

      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.name}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download error:', error);
      alert('다운로드 중 오류가 발생했습니다.');
    }
  };

  const handleExport = () => {
    if (!report) return;
    setShowExportModal(true);
  };

  const handleExportOptions = async (options: any) => {
    if (!report) return;

    try {
      const response = await fetch(`/api/reports/${reportId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options)
      });

      const result = await response.json();

      if (result.success) {
        alert(`보고서가 ${options.format.toUpperCase()} 형식으로 내보내졌습니다!`);
        if (result.data.emailSent) {
          alert('이메일로도 전송되었습니다.');
        }
      } else {
        alert('내보내기에 실패했습니다: ' + result.error);
      }
    } catch (error) {
      console.error('Export failed:', error);
      alert('내보내기 중 오류가 발생했습니다.');
    }
  };

  const handleTogglePreview = () => {
    setShowPreview(!showPreview);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500">완료</Badge>;
      case 'generating':
        return <Badge className="bg-blue-500">생성 중</Badge>;
      case 'failed':
        return <Badge className="bg-red-500">실패</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'summary':
        return <FileText className="h-5 w-5" />;
      case 'detailed':
        return <BarChart3 className="h-5 w-5" />;
      case 'trend':
        return <TrendingUp className="h-5 w-5" />;
      case 'comparison':
        return <Activity className="h-5 w-5" />;
      default:
        return <FileText className="h-5 w-5" />;
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'summary':
        return '성능 요약 보고서';
      case 'detailed':
        return '상세 분석 보고서';
      case 'trend':
        return '트렌드 분석 보고서';
      case 'comparison':
        return '비교 분석 보고서';
      default:
        return type;
    }
  };

  const getPeriodText = (period: string) => {
    switch (period) {
      case '24h':
        return '최근 24시간';
      case '7d':
        return '최근 7일';
      case '30d':
        return '최근 30일';
      case '90d':
        return '최근 90일';
      default:
        return period;
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-6xl mx-auto">
          <Button
            variant="ghost"
            onClick={handleBack}
            className="mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            목록으로 돌아가기
          </Button>
          <Card>
            <CardContent className="p-12 text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">보고서를 찾을 수 없습니다</h3>
              <p className="text-gray-500 mb-6">{error}</p>
              <Button onClick={handleBack}>목록으로 돌아가기</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={handleBack}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            목록으로 돌아가기
          </Button>
          <div className="flex items-center space-x-2">
            {report.status === 'completed' && (
              <>
                <Button
                  variant="outline"
                  onClick={handleExport}
                >
                  <Download className="h-4 w-4 mr-2" />
                  내보내기
                </Button>
                <Button
                  onClick={handleDownload}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Download className="h-4 w-4 mr-2" />
                  다운로드
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Report Header Card */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-4">
                <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  {getTypeIcon(report.type)}
                </div>
                <div>
                  <CardTitle className="text-2xl mb-2">{report.name}</CardTitle>
                  <CardDescription className="text-base">
                    {report.description || '설명이 없습니다.'}
                  </CardDescription>
                  <div className="flex items-center space-x-4 mt-4">
                    {getStatusBadge(report.status)}
                    <Badge variant="outline">{getTypeName(report.type)}</Badge>
                    {report.tags?.map((tag) => (
                      <Badge key={tag} variant="secondary">{tag}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Report Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* General Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-5 w-5 mr-2" />
                일반 정보
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm text-gray-500 mb-1">보고서 ID</div>
                <div className="font-mono text-sm">{report.id}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">생성 일시</div>
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                  {formatDate(report.created_at)}
                </div>
              </div>
              {report.generated_at && (
                <div>
                  <div className="text-sm text-gray-500 mb-1">완료 일시</div>
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 mr-2 text-gray-400" />
                    {formatDate(report.generated_at)}
                  </div>
                </div>
              )}
              {report.file_size && (
                <div>
                  <div className="text-sm text-gray-500 mb-1">파일 크기</div>
                  <div>{formatFileSize(report.file_size)}</div>
                </div>
              )}
              {report.file_path && (
                <div>
                  <div className="text-sm text-gray-500 mb-1">파일 경로</div>
                  <div className="font-mono text-sm text-gray-600 dark:text-gray-400">
                    {report.file_path}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Database className="h-5 w-5 mr-2" />
                설정 정보
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm text-gray-500 mb-1">분석 기간</div>
                <div>{getPeriodText(report.config.period)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">데이터베이스 수</div>
                <div>{report.config.databases.length}개</div>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">출력 형식</div>
                <div className="uppercase">{report.config.format}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-2">포함 옵션</div>
                <div className="space-y-1">
                  <div className="flex items-center text-sm">
                    <span className={report.config.include_charts ? 'text-green-600' : 'text-gray-400'}>
                      {report.config.include_charts ? '✓' : '✗'}
                    </span>
                    <span className="ml-2">차트 포함</span>
                  </div>
                  <div className="flex items-center text-sm">
                    <span className={report.config.include_recommendations ? 'text-green-600' : 'text-gray-400'}>
                      {report.config.include_recommendations ? '✓' : '✗'}
                    </span>
                    <span className="ml-2">권장사항 포함</span>
                  </div>
                  <div className="flex items-center text-sm">
                    <span className={report.config.include_raw_data ? 'text-green-600' : 'text-gray-400'}>
                      {report.config.include_raw_data ? '✓' : '✗'}
                    </span>
                    <span className="ml-2">원시 데이터 포함</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Error Message */}
        {report.status === 'failed' && report.error_message && (
          <Card className="border-red-200 dark:border-red-800">
            <CardHeader>
              <CardTitle className="text-red-600 flex items-center">
                <AlertCircle className="h-5 w-5 mr-2" />
                오류 정보
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-sm text-red-600 whitespace-pre-wrap">
                {report.error_message}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* Report Preview */}
        {report.status === 'completed' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>보고서 미리보기</CardTitle>
                  <CardDescription>
                    {showPreview ? '보고서 내용을 미리 확인할 수 있습니다.' : '클릭하여 보고서를 미리 볼 수 있습니다.'}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={handleTogglePreview}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  {showPreview ? '미리보기 닫기' : '미리보기'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!showPreview ? (
                <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-12 text-center">
                  <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 mb-4">
                    미리보기 버튼을 클릭하여 보고서 내용을 확인하세요.
                  </p>
                  <div className="flex items-center justify-center space-x-3">
                    <Button variant="outline" onClick={handleTogglePreview}>
                      <Eye className="h-4 w-4 mr-2" />
                      미리보기
                    </Button>
                    <Button onClick={handleDownload}>
                      <Download className="h-4 w-4 mr-2" />
                      다운로드
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  {/* Preview Header */}
                  <div className="bg-gray-50 dark:bg-gray-800 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold">{report.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">
                      {formatDate(report.generated_at || report.created_at)}
                    </p>
                  </div>

                  {/* Preview Content */}
                  <div className="p-6 bg-white dark:bg-gray-900 space-y-6">
                    {/* Summary Section */}
                    <div>
                      <h4 className="text-md font-semibold mb-3 flex items-center">
                        <BarChart3 className="h-4 w-4 mr-2" />
                        보고서 요약
                      </h4>
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                        <p className="text-sm">
                          {report.description || '이 보고서는 선택하신 데이터베이스의 SQL 성능을 분석한 결과를 담고 있습니다.'}
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                          <div>
                            <div className="text-xs text-gray-500">분석 기간</div>
                            <div className="text-sm font-semibold">{getPeriodText(report.config.period)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">데이터베이스</div>
                            <div className="text-sm font-semibold">{report.config.databases.length}개</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">보고서 타입</div>
                            <div className="text-sm font-semibold">{getTypeName(report.type)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-gray-500">파일 크기</div>
                            <div className="text-sm font-semibold">{formatFileSize(report.file_size)}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Mock Data Sections */}
                    <div>
                      <h4 className="text-md font-semibold mb-3">주요 발견사항</h4>
                      <div className="space-y-2">
                        <div className="flex items-start p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                          <span className="text-yellow-600 mr-2">⚠️</span>
                          <div>
                            <div className="font-medium text-sm">높은 CPU 사용률 감지</div>
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                              일부 SQL 쿼리에서 평균 이상의 CPU 사용률이 감지되었습니다.
                            </div>
                          </div>
                        </div>
                        <div className="flex items-start p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                          <span className="text-green-600 mr-2">✓</span>
                          <div>
                            <div className="font-medium text-sm">인덱스 최적화 양호</div>
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                              대부분의 쿼리가 적절한 인덱스를 사용하고 있습니다.
                            </div>
                          </div>
                        </div>
                        {report.config.include_recommendations && (
                          <div className="flex items-start p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                            <span className="text-blue-600 mr-2">💡</span>
                            <div>
                              <div className="font-medium text-sm">권장사항</div>
                              <div className="text-xs text-gray-600 dark:text-gray-400">
                                상세한 최적화 권장사항은 전체 보고서를 다운로드하여 확인하세요.
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Download Full Report */}
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-center">
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                        전체 보고서를 다운로드하여 상세한 분석 결과를 확인하세요.
                      </p>
                      <Button onClick={handleDownload} className="bg-blue-600 hover:bg-blue-700">
                        <Download className="h-4 w-4 mr-2" />
                        전체 보고서 다운로드
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {report.status === 'generating' && (
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">보고서 생성 중</h3>
              <p className="text-gray-500">
                보고서를 생성하고 있습니다. 잠시만 기다려주세요...
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Export Modal */}
      {report && (
        <ReportExportModal
          open={showExportModal}
          onOpenChange={setShowExportModal}
          reportId={report.id}
          reportTitle={report.name}
          onExport={handleExportOptions}
        />
      )}
    </div>
  );
}
