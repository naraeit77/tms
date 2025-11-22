'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Filter,
  Calendar,
  User,
  Tag,
  FileType,
  BarChart3,
  Search,
  X,
  Plus,
  Save,
  RefreshCw
} from 'lucide-react';

interface FilterCondition {
  field: string;
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'between' | 'in';
  value: string | number | string[];
  label?: string;
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
  customConditions: FilterCondition[];
}

interface AdvancedFiltersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: AdvancedFilters;
  onFiltersChange: (filters: AdvancedFilters) => void;
  onApplyFilters: (filters: AdvancedFilters) => void;
}

export function AdvancedFiltersModal({
  open,
  onOpenChange,
  filters,
  onFiltersChange,
  onApplyFilters
}: AdvancedFiltersModalProps) {
  const [localFilters, setLocalFilters] = useState<AdvancedFilters>(filters);
  const [newTag, setNewTag] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [saveFilterName, setSaveFilterName] = useState('');

  const reportTypeOptions = [
    { value: 'summary', label: '성능 요약' },
    { value: 'detailed', label: 'SQL 상세 분석' },
    { value: 'trend', label: '트렌드 분석' },
    { value: 'comparison', label: '비교 분석' }
  ];

  const statusOptions = [
    { value: 'completed', label: '완료' },
    { value: 'generating', label: '생성 중' },
    { value: 'failed', label: '실패' }
  ];

  const fieldOptions = [
    { value: 'title', label: '제목' },
    { value: 'description', label: '설명' },
    { value: 'size', label: '파일 크기' },
    { value: 'duration', label: '생성 시간' },
    { value: 'views', label: '조회수' },
    { value: 'downloads', label: '다운로드 수' }
  ];

  const operatorOptions = [
    { value: 'equals', label: '같음' },
    { value: 'contains', label: '포함' },
    { value: 'greater_than', label: '보다 큼' },
    { value: 'less_than', label: '보다 작음' },
    { value: 'between', label: '사이' },
    { value: 'in', label: '목록에 포함' }
  ];

  const addTag = () => {
    if (newTag && !localFilters.tags.includes(newTag)) {
      setLocalFilters(prev => ({
        ...prev,
        tags: [...prev.tags, newTag]
      }));
      setNewTag('');
    }
  };

  const removeTag = (tag: string) => {
    setLocalFilters(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }));
  };

  const addAuthor = () => {
    if (newAuthor && !localFilters.authors.includes(newAuthor)) {
      setLocalFilters(prev => ({
        ...prev,
        authors: [...prev.authors, newAuthor]
      }));
      setNewAuthor('');
    }
  };

  const removeAuthor = (author: string) => {
    setLocalFilters(prev => ({
      ...prev,
      authors: prev.authors.filter(a => a !== author)
    }));
  };

  const toggleReportType = (type: string) => {
    setLocalFilters(prev => ({
      ...prev,
      reportTypes: prev.reportTypes.includes(type)
        ? prev.reportTypes.filter(t => t !== type)
        : [...prev.reportTypes, type]
    }));
  };

  const toggleStatus = (status: string) => {
    setLocalFilters(prev => ({
      ...prev,
      status: prev.status.includes(status)
        ? prev.status.filter(s => s !== status)
        : [...prev.status, status]
    }));
  };

  const addCustomCondition = () => {
    setLocalFilters(prev => ({
      ...prev,
      customConditions: [
        ...prev.customConditions,
        { field: 'title', operator: 'contains', value: '' }
      ]
    }));
  };

  const updateCustomCondition = (index: number, updates: Partial<FilterCondition>) => {
    setLocalFilters(prev => ({
      ...prev,
      customConditions: prev.customConditions.map((condition, i) =>
        i === index ? { ...condition, ...updates } : condition
      )
    }));
  };

  const removeCustomCondition = (index: number) => {
    setLocalFilters(prev => ({
      ...prev,
      customConditions: prev.customConditions.filter((_, i) => i !== index)
    }));
  };

  const handleApplyFilters = () => {
    onFiltersChange(localFilters);
    onApplyFilters(localFilters);
    onOpenChange(false);
  };

  const handleResetFilters = () => {
    const resetFilters: AdvancedFilters = {
      dateRange: {},
      reportTypes: [],
      authors: [],
      tags: [],
      status: [],
      sizeRange: {},
      customConditions: []
    };
    setLocalFilters(resetFilters);
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (localFilters.dateRange.start || localFilters.dateRange.end || localFilters.dateRange.preset) count++;
    if (localFilters.reportTypes.length > 0) count++;
    if (localFilters.authors.length > 0) count++;
    if (localFilters.tags.length > 0) count++;
    if (localFilters.status.length > 0) count++;
    if (localFilters.sizeRange.min || localFilters.sizeRange.max) count++;
    count += localFilters.customConditions.length;
    return count;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Filter className="h-5 w-5 mr-2" />
              고급 필터
            </div>
            <Badge variant="outline" className="ml-2">
              {getActiveFiltersCount()}개 필터 활성화
            </Badge>
          </DialogTitle>
          <DialogDescription>
            상세한 조건으로 보고서를 필터링하고 검색하세요
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">기본 필터</TabsTrigger>
            <TabsTrigger value="advanced">고급 조건</TabsTrigger>
            <TabsTrigger value="saved">저장된 필터</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-6">
            {/* Date Range */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Calendar className="h-5 w-5 mr-2" />
                  날짜 범위
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">빠른 선택</Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                    {[
                      { value: 'today', label: '오늘' },
                      { value: '7d', label: '최근 7일' },
                      { value: '30d', label: '최근 30일' },
                      { value: '90d', label: '최근 90일' }
                    ].map(preset => (
                      <button
                        key={preset.value}
                        onClick={() => setLocalFilters(prev => ({
                          ...prev,
                          dateRange: { ...prev.dateRange, preset: preset.value as any }
                        }))}
                        className={`px-3 py-2 text-sm border rounded-md ${
                          localFilters.dateRange.preset === preset.value
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="startDate">시작일</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={localFilters.dateRange.start || ''}
                      onChange={(e) => setLocalFilters(prev => ({
                        ...prev,
                        dateRange: { ...prev.dateRange, start: e.target.value, preset: undefined }
                      }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="endDate">종료일</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={localFilters.dateRange.end || ''}
                      onChange={(e) => setLocalFilters(prev => ({
                        ...prev,
                        dateRange: { ...prev.dateRange, end: e.target.value, preset: undefined }
                      }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Report Types */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <FileType className="h-5 w-5 mr-2" />
                  보고서 유형
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {reportTypeOptions.map(type => (
                    <div key={type.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`type-${type.value}`}
                        checked={localFilters.reportTypes.includes(type.value)}
                        onCheckedChange={() => toggleReportType(type.value)}
                      />
                      <Label htmlFor={`type-${type.value}`} className="text-sm">
                        {type.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2" />
                  상태
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  {statusOptions.map(status => (
                    <div key={status.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`status-${status.value}`}
                        checked={localFilters.status.includes(status.value)}
                        onCheckedChange={() => toggleStatus(status.value)}
                      />
                      <Label htmlFor={`status-${status.value}`} className="text-sm">
                        {status.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Tags */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Tag className="h-5 w-5 mr-2" />
                  태그
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex space-x-2">
                  <Input
                    placeholder="태그 추가"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addTag()}
                  />
                  <Button onClick={addTag} size="sm">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {localFilters.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {localFilters.tags.map((tag, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="cursor-pointer hover:bg-red-100"
                        onClick={() => removeTag(tag)}
                      >
                        {tag} <X className="h-3 w-3 ml-1" />
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Authors */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <User className="h-5 w-5 mr-2" />
                  작성자
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex space-x-2">
                  <Input
                    placeholder="작성자 추가"
                    value={newAuthor}
                    onChange={(e) => setNewAuthor(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addAuthor()}
                  />
                  <Button onClick={addAuthor} size="sm">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {localFilters.authors.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {localFilters.authors.map((author, index) => (
                      <Badge
                        key={index}
                        variant="secondary"
                        className="cursor-pointer hover:bg-red-100"
                        onClick={() => removeAuthor(author)}
                      >
                        {author} <X className="h-3 w-3 ml-1" />
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-6">
            {/* Size Range */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">파일 크기 (MB)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="minSize">최소 크기</Label>
                    <Input
                      id="minSize"
                      type="number"
                      placeholder="0"
                      value={localFilters.sizeRange.min || ''}
                      onChange={(e) => setLocalFilters(prev => ({
                        ...prev,
                        sizeRange: { ...prev.sizeRange, min: parseInt(e.target.value) || undefined }
                      }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="maxSize">최대 크기</Label>
                    <Input
                      id="maxSize"
                      type="number"
                      placeholder="100"
                      value={localFilters.sizeRange.max || ''}
                      onChange={(e) => setLocalFilters(prev => ({
                        ...prev,
                        sizeRange: { ...prev.sizeRange, max: parseInt(e.target.value) || undefined }
                      }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Custom Conditions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between">
                  <div className="flex items-center">
                    <Search className="h-5 w-5 mr-2" />
                    사용자 정의 조건
                  </div>
                  <Button onClick={addCustomCondition} size="sm" variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    조건 추가
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {localFilters.customConditions.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">
                    추가된 사용자 정의 조건이 없습니다
                  </p>
                ) : (
                  localFilters.customConditions.map((condition, index) => (
                    <div key={index} className="p-4 border rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">조건 #{index + 1}</span>
                        <Button
                          onClick={() => removeCustomCondition(index)}
                          size="sm"
                          variant="ghost"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <Label className="text-sm">필드</Label>
                          <Select
                            value={condition.field}
                            onValueChange={(value) => updateCustomCondition(index, { field: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {fieldOptions.map(field => (
                                <SelectItem key={field.value} value={field.value}>
                                  {field.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="text-sm">연산자</Label>
                          <Select
                            value={condition.operator}
                            onValueChange={(value: any) => updateCustomCondition(index, { operator: value })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {operatorOptions.map(op => (
                                <SelectItem key={op.value} value={op.value}>
                                  {op.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="text-sm">값</Label>
                          <Input
                            value={condition.value as string}
                            onChange={(e) => updateCustomCondition(index, { value: e.target.value })}
                            placeholder="검색값"
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="saved" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Save className="h-5 w-5 mr-2" />
                  현재 필터 저장
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex space-x-2">
                  <Input
                    placeholder="필터 이름"
                    value={saveFilterName}
                    onChange={(e) => setSaveFilterName(e.target.value)}
                  />
                  <Button disabled={!saveFilterName}>저장</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">저장된 필터 목록</CardTitle>
                <CardDescription>자주 사용하는 필터 조합을 저장하고 빠르게 적용하세요</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-gray-500 text-center py-8">
                  저장된 필터가 없습니다
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Actions */}
        <div className="flex justify-between pt-6 border-t">
          <Button variant="outline" onClick={handleResetFilters}>
            <RefreshCw className="h-4 w-4 mr-2" />
            초기화
          </Button>

          <div className="space-x-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button onClick={handleApplyFilters}>
              필터 적용 ({getActiveFiltersCount()})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
