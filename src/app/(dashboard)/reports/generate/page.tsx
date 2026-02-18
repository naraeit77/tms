'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  ArrowLeft,
  FileText,
  Search,
  TrendingUp,
  BarChart3,
  Clock,
  ChevronRight,
  Check,
  Calendar,
  Database,
  Filter,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Type definitions
interface DatabaseConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  service_name: string;
  username: string;
  oracle_version: string;
  is_active: boolean;
  health_status: 'HEALTHY' | 'WARNING' | 'ERROR' | 'UNKNOWN';
  created_at: string;
}

// 보고서 템플릿 정의
const reportTemplates = [
  {
    id: 'summary',
    name: '성능 요약 보고서',
    description: '전체 시스템의 SQL 성능 현황을 요약한 고급 관리자용 보고서',
    icon: FileText,
    duration: '2-3분',
    sections: 5,
    tags: ['개요', '핵심 지표', '성능 등급 분포', '+2개'],
  },
  {
    id: 'detailed',
    name: 'SQL 상세 분석',
    description: '개별 SQL의 상세한 성능 분석과 최적화 권장사항을 포함한 기술 보고서',
    icon: Search,
    duration: '5-10분',
    sections: 5,
    tags: ['SQL 목록', '실행 계획', '리소스 사용량', '+2개'],
  },
  {
    id: 'trend',
    name: '성능 트렌드 분석',
    description: '시간에 따른 성능 변화 추이와 패턴을 분석한 트렌드 보고서',
    icon: TrendingUp,
    duration: '3-5분',
    sections: 5,
    tags: ['시간별 추이', '성능 패턴', '개선성 분석', '+2개'],
  },
  {
    id: 'comparison',
    name: 'DB 간 성능 비교',
    description: '여러 데이터베이스 간의 성능을 비교 분석한 벤치마크 보고서',
    icon: BarChart3,
    duration: '4-8분',
    sections: 5,
    tags: ['데이터베이스 개요', '성능 비교', '리소스 효율성', '+2개'],
  },
];

const steps = [
  { number: 1, name: '보고서 템플릿 선택' },
  { number: 2, name: '기본 정보 입력' },
  { number: 3, name: '분석 옵션 설정' },
  { number: 4, name: '검토 및 생성' },
];

export default function GenerateReportPage() {
  const router = useRouter();
  const { status } = useSession();
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [reportName, setReportName] = useState('');
  const [reportDescription, setReportDescription] = useState('');

  // Database state
  const [databases, setDatabases] = useState<DatabaseConnection[]>([]);
  const [loadingDatabases, setLoadingDatabases] = useState(false);

  // Step 3: Analysis Options State
  const [period, setPeriod] = useState('30d');
  const [selectedDatabases, setSelectedDatabases] = useState<string[]>([]);
  const [includeCharts, setIncludeCharts] = useState(true);
  const [includeRecommendations, setIncludeRecommendations] = useState(true);
  const [includeRawData, setIncludeRawData] = useState(false);
  const [minExecutions, setMinExecutions] = useState('100');
  const [cpuThreshold, setCpuThreshold] = useState('1000');
  const [generating, setGenerating] = useState(false);

  // Load databases when component mounts (only when authenticated)
  useEffect(() => {
    if (status === 'authenticated') {
      loadDatabases();
    }
  }, [status]);

  // 인증 상태가 로딩 중이면 빈 페이지 표시
  if (status === 'loading') {
    return null;
  }

  const loadDatabases = async () => {
    // 인증되지 않은 경우 API 호출하지 않음
    if (status !== 'authenticated') {
      return;
    }

    setLoadingDatabases(true);
    try {
      const response = await fetch('/api/databases');
      if (response.status === 401) {
        // 인증 오류는 조용히 처리
        console.debug('Authentication required for databases API');
        return;
      }
      const result = await response.json();

      if (result.success) {
        setDatabases(result.data);
      } else {
        console.debug('Failed to load databases:', result.error);
      }
    } catch (error) {
      // 네트워크 오류는 조용히 처리
      console.debug('Failed to load databases:', error);
    } finally {
      setLoadingDatabases(false);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      router.push('/reports');
    }
  };

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
  };

  const handleGenerate = async () => {
    if (!selectedTemplate || !reportName || selectedDatabases.length === 0) {
      alert('필수 입력 항목을 모두 입력해주세요.');
      return;
    }

    setGenerating(true);
    try {
      const reportData = {
        name: reportName,
        description: reportDescription,
        type: selectedTemplate as 'summary' | 'detailed' | 'trend' | 'comparison',
        config: {
          period: period,
          databases: selectedDatabases,
          include_charts: includeCharts,
          include_recommendations: includeRecommendations,
          include_raw_data: includeRawData,
          format: 'pdf' as const,
          filters: {
            min_executions: minExecutions ? parseInt(minExecutions) : undefined,
            cpu_threshold: cpuThreshold ? parseInt(cpuThreshold) : undefined,
            include_system_sql: false
          }
        }
      };

      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportData)
      });

      const result = await response.json();

      if (result.success) {
        alert(`보고서 생성이 시작되었습니다.\n보고서 ID: ${result.data.id}\n\n보고서 목록에서 생성 진행 상황을 확인하실 수 있습니다.`);
        router.push('/reports');
      } else {
        // Handle specific error codes
        if (result.code === 'USER_NOT_FOUND' || response.status === 401) {
          alert('인증 정보가 만료되었습니다. 다시 로그인해주세요.');
          router.push('/auth/signin');
        } else {
          alert(`보고서 생성 실패: ${result.error || '알 수 없는 오류가 발생했습니다.'}`);
        }
        setGenerating(false);
      }
    } catch (error) {
      console.error('Failed to generate report:', error);
      alert('보고서 생성 중 오류가 발생했습니다. 다시 시도해주세요.');
      setGenerating(false);
    }
  };

  const selectedTemplateData = reportTemplates.find(t => t.id === selectedTemplate);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={handleBack}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            뒤로
          </Button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            새 보고서 생성
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            단계별 설정을 통해 맞춤형 보고서를 생성하세요
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-center">
            {steps.map((step, index) => (
              <div key={step.number} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-colors',
                      currentStep >= step.number
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                    )}
                  >
                    {currentStep > step.number ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      step.number
                    )}
                  </div>
                  <span className="text-xs mt-2 text-gray-600 dark:text-gray-400 hidden sm:block">
                    {step.name}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      'h-0.5 w-16 sm:w-24 mx-2 transition-colors',
                      currentStep > step.number
                        ? 'bg-blue-600'
                        : 'bg-gray-200 dark:bg-gray-700'
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <Card>
          <CardHeader>
            <CardTitle>
              {currentStep === 1 && '보고서 템플릿 선택'}
              {currentStep === 2 && '기본 정보 입력'}
              {currentStep === 3 && '분석 옵션 설정'}
              {currentStep === 4 && '검토 및 생성'}
            </CardTitle>
            <CardDescription>
              {currentStep === 1 && '생성하려는 보고서 유형을 선택해주세요'}
              {currentStep === 2 && '보고서의 기본 정보를 입력해주세요'}
              {currentStep === 3 && '보고서 생성 옵션을 설정해주세요'}
              {currentStep === 4 && '설정한 내용을 확인하고 보고서를 생성하세요'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Step 1: Template Selection */}
            {currentStep === 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {reportTemplates.map((template) => {
                  const Icon = template.icon;
                  const isSelected = selectedTemplate === template.id;

                  return (
                    <div
                      key={template.id}
                      onClick={() => handleTemplateSelect(template.id)}
                      className={cn(
                        'p-6 border-2 rounded-lg cursor-pointer transition-all hover:shadow-md',
                        isSelected
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      )}
                    >
                      <div className="flex items-start space-x-4">
                        <div
                          className={cn(
                            'p-3 rounded-lg',
                            isSelected
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                          )}
                        >
                          <Icon className="h-6 w-6" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                              {template.name}
                            </h3>
                            {isSelected && (
                              <Check className="h-5 w-5 text-blue-600" />
                            )}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            {template.description}
                          </p>
                          <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-500 mb-3">
                            <div className="flex items-center">
                              <Clock className="h-3 w-3 mr-1" />
                              {template.duration}
                            </div>
                            <div className="flex items-center">
                              <span className="font-semibold">{template.sections}개 섹션</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className="text-xs text-gray-600 dark:text-gray-400">포함 내용:</span>
                            {template.tags.map((tag, index) => (
                              <Badge
                                key={`tag-${template.name || ''}-${tag}-${index}`}
                                variant="outline"
                                className="text-xs"
                              >
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Step 2: Basic Information */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="reportName">보고서 이름 *</Label>
                  <Input
                    id="reportName"
                    placeholder="예: 2024년 1월 성능 요약 보고서"
                    value={reportName}
                    onChange={(e) => setReportName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reportDescription">보고서 설명</Label>
                  <Textarea
                    id="reportDescription"
                    placeholder="보고서에 대한 간단한 설명을 입력하세요 (선택사항)"
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                    rows={4}
                  />
                </div>
                {selectedTemplateData && (
                  <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex items-start space-x-3">
                      <selectedTemplateData.icon className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-blue-900 dark:text-blue-200">
                          선택된 템플릿: {selectedTemplateData.name}
                        </h4>
                        <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                          {selectedTemplateData.description}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Analysis Options */}
            {currentStep === 3 && (
              <div className="space-y-6">
                {/* Period Selection */}
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    <Label className="text-base font-semibold">분석 기간</Label>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { value: '24h', label: '최근 24시간' },
                      { value: '7d', label: '최근 7일' },
                      { value: '30d', label: '최근 30일' },
                      { value: '90d', label: '최근 90일' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setPeriod(option.value)}
                        className={cn(
                          'p-3 border-2 rounded-lg text-sm font-medium transition-all',
                          period === option.value
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Database Selection */}
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Database className="h-4 w-4 text-gray-500" />
                    <Label className="text-base font-semibold">데이터베이스 선택</Label>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      분석할 데이터베이스를 선택하세요 (다중 선택 가능)
                    </p>
                    {loadingDatabases ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                    ) : databases.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          연결된 데이터베이스가 없습니다.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          onClick={() => router.push('/databases')}
                        >
                          데이터베이스 연결하기
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {databases.map((db) => (
                          <label
                            key={db.id}
                            className="flex items-center space-x-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedDatabases.includes(db.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedDatabases([...selectedDatabases, db.id]);
                                } else {
                                  setSelectedDatabases(selectedDatabases.filter(d => d !== db.id));
                                }
                              }}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-gray-900 dark:text-white">{db.name}</span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "ml-auto text-xs",
                                db.health_status === 'HEALTHY' ? 'border-green-500 text-green-700' :
                                db.health_status === 'WARNING' ? 'border-yellow-500 text-yellow-700' :
                                db.health_status === 'ERROR' ? 'border-red-500 text-red-700' :
                                'border-gray-500 text-gray-700'
                              )}
                            >
                              {db.oracle_version || 'Oracle'}
                            </Badge>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Performance Filters */}
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Filter className="h-4 w-4 text-gray-500" />
                    <Label className="text-base font-semibold">성능 필터</Label>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="minExecutions" className="text-sm">최소 실행 횟수</Label>
                      <Input
                        id="minExecutions"
                        type="number"
                        placeholder="100"
                        value={minExecutions}
                        onChange={(e) => setMinExecutions(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cpuThreshold" className="text-sm">CPU 임계값 (ms)</Label>
                      <Input
                        id="cpuThreshold"
                        type="number"
                        placeholder="1000"
                        value={cpuThreshold}
                        onChange={(e) => setCpuThreshold(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Include Options */}
                <div className="space-y-3">
                  <Label className="text-base font-semibold">포함 옵션</Label>
                  <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="includeCharts" className="font-medium cursor-pointer">
                          차트 및 그래프
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          성능 트렌드 및 분석 차트 포함
                        </p>
                      </div>
                      <Switch
                        id="includeCharts"
                        checked={includeCharts}
                        onCheckedChange={setIncludeCharts}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="includeRecommendations" className="font-medium cursor-pointer">
                          최적화 권장사항
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          AI 기반 튜닝 권장사항 포함
                        </p>
                      </div>
                      <Switch
                        id="includeRecommendations"
                        checked={includeRecommendations}
                        onCheckedChange={setIncludeRecommendations}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="includeRawData" className="font-medium cursor-pointer">
                          원본 데이터
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          상세 SQL 실행 데이터 포함
                        </p>
                      </div>
                      <Switch
                        id="includeRawData"
                        checked={includeRawData}
                        onCheckedChange={setIncludeRawData}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Review and Generate */}
            {currentStep === 4 && (
              <div className="space-y-6">
                <div className="space-y-4">
                  {/* Report Information */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                      보고서 정보
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">템플릿:</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {selectedTemplateData?.name}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">보고서 이름:</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {reportName || '(미입력)'}
                        </span>
                      </div>
                      {reportDescription && (
                        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                          <span className="text-gray-600 dark:text-gray-400">설명:</span>
                          <p className="text-gray-900 dark:text-white mt-1">
                            {reportDescription}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Analysis Configuration */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
                      분석 설정
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">분석 기간:</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {period === '24h' ? '최근 24시간' :
                           period === '7d' ? '최근 7일' :
                           period === '30d' ? '최근 30일' : '최근 90일'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">선택된 데이터베이스:</span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {selectedDatabases.length > 0 ? `${selectedDatabases.length}개` : '없음'}
                        </span>
                      </div>
                      {selectedDatabases.length > 0 && (
                        <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                          <div className="flex flex-wrap gap-2">
                            {selectedDatabases.map(dbId => {
                              const db = databases.find(d => d.id === dbId);
                              return (
                                <Badge key={dbId} variant="outline" className="text-xs">
                                  {db?.name || dbId}
                                </Badge>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                        <span className="text-gray-600 dark:text-gray-400">성능 필터:</span>
                        <div className="mt-1 space-y-1">
                          <p className="text-gray-900 dark:text-white">
                            • 최소 실행 횟수: {minExecutions || '미설정'}
                          </p>
                          <p className="text-gray-900 dark:text-white">
                            • CPU 임계값: {cpuThreshold || '미설정'} ms
                          </p>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                        <span className="text-gray-600 dark:text-gray-400">포함 옵션:</span>
                        <div className="mt-1 space-y-1">
                          <p className="text-gray-900 dark:text-white">
                            • 차트 및 그래프: {includeCharts ? '✓ 포함' : '✗ 제외'}
                          </p>
                          <p className="text-gray-900 dark:text-white">
                            • 최적화 권장사항: {includeRecommendations ? '✓ 포함' : '✗ 제외'}
                          </p>
                          <p className="text-gray-900 dark:text-white">
                            • 원본 데이터: {includeRawData ? '✓ 포함' : '✗ 제외'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Generation Info */}
                  <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      <strong>참고:</strong> 보고서 생성에는 약 {selectedTemplateData?.duration}이 소요됩니다.
                      생성 중에는 다른 작업을 계속 진행하실 수 있습니다.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-between mt-6">
          <Button
            variant="outline"
            onClick={handleBack}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            이전
          </Button>
          <div className="flex space-x-3">
            <Button
              variant="outline"
              onClick={() => router.push('/reports')}
            >
              취소
            </Button>
            {currentStep < 4 ? (
              <Button
                onClick={handleNext}
                disabled={currentStep === 1 && !selectedTemplate}
              >
                다음
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={handleGenerate}
                disabled={!reportName || generating}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {generating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    보고서 생성 중...
                  </>
                ) : (
                  '보고서 생성'
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
