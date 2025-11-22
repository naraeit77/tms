'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Download,
  FileText,
  Table,
  Code,
  CheckCircle2,
  AlertCircle,
  RefreshCw
} from 'lucide-react';

interface ExportOptions {
  format: 'pdf' | 'excel' | 'csv' | 'json' | 'html';
  includeCharts: boolean;
  includeRawData: boolean;
  includeMetadata: boolean;
  dateRange?: string;
  customFilename?: string;
}

interface ReportExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
  reportTitle: string;
  onExport: (options: ExportOptions) => Promise<void>;
}

export function ReportExportModal({
  open,
  onOpenChange,
  reportId,
  reportTitle,
  onExport
}: ReportExportModalProps) {
  const [options, setOptions] = useState<ExportOptions>({
    format: 'pdf',
    includeCharts: true,
    includeRawData: false,
    includeMetadata: true,
    customFilename: `${reportTitle}_${new Date().toISOString().split('T')[0]}`
  });

  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const formatOptions = [
    { value: 'pdf', label: 'PDF', icon: <FileText className="h-4 w-4" />, description: '고품질 문서 형식' },
    { value: 'excel', label: 'Excel', icon: <Table className="h-4 w-4" />, description: '데이터 분석에 적합' },
    { value: 'csv', label: 'CSV', icon: <Table className="h-4 w-4" />, description: '간단한 데이터 형식' },
    { value: 'json', label: 'JSON', icon: <Code className="h-4 w-4" />, description: '개발자용 데이터' },
    { value: 'html', label: 'HTML', icon: <Code className="h-4 w-4" />, description: '웹 브라우저용' }
  ];

  const handleExport = async () => {
    setExporting(true);
    setExportProgress(0);
    setExportStatus('idle');

    try {
      // Simulate export progress
      const intervals = [20, 40, 60, 80, 100];
      for (const progress of intervals) {
        setExportProgress(progress);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      await onExport(options);
      setExportStatus('success');
    } catch (error) {
      setExportStatus('error');
      console.error('Export failed:', error);
    } finally {
      setExporting(false);
      if (exportStatus !== 'error') {
        setTimeout(() => {
          onOpenChange(false);
          setExportProgress(0);
          setExportStatus('idle');
        }, 2000);
      }
    }
  };

  const getEstimatedSize = () => {
    let size = 2; // Base size in MB
    if (options.includeCharts) size += 1.5;
    if (options.includeRawData) size += 3;
    if (options.format === 'excel') size *= 1.2;
    if (options.format === 'pdf') size *= 0.8;
    return size.toFixed(1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Download className="h-5 w-5 mr-2" />
            보고서 내보내기
          </DialogTitle>
          <DialogDescription>
            {reportTitle} 보고서를 다양한 형식으로 내보낼 수 있습니다
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Export Format Selection */}
          <div>
            <Label className="text-sm font-medium">내보내기 형식</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
              {formatOptions.map((format) => (
                <button
                  key={format.value}
                  onClick={() => setOptions(prev => ({ ...prev, format: format.value as ExportOptions['format'] }))}
                  className={`p-3 border rounded-lg text-left hover:bg-gray-50 transition-colors ${
                    options.format === format.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    {format.icon}
                    <div>
                      <div className="font-medium">{format.label}</div>
                      <div className="text-xs text-gray-500">{format.description}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Include Options */}
          <div>
            <Label className="text-sm font-medium mb-3 block">포함 옵션</Label>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="charts"
                  checked={options.includeCharts}
                  onCheckedChange={(checked) =>
                    setOptions(prev => ({ ...prev, includeCharts: !!checked }))}
                />
                <Label htmlFor="charts" className="text-sm">차트 및 그래프</Label>
                <Badge variant="outline" className="text-xs">+1.5MB</Badge>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="rawdata"
                  checked={options.includeRawData}
                  onCheckedChange={(checked) =>
                    setOptions(prev => ({ ...prev, includeRawData: !!checked }))}
                />
                <Label htmlFor="rawdata" className="text-sm">원시 데이터</Label>
                <Badge variant="outline" className="text-xs">+3.0MB</Badge>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="metadata"
                  checked={options.includeMetadata}
                  onCheckedChange={(checked) =>
                    setOptions(prev => ({ ...prev, includeMetadata: !!checked }))}
                />
                <Label htmlFor="metadata" className="text-sm">메타데이터 및 생성 정보</Label>
              </div>
            </div>
          </div>

          {/* File Name */}
          <div>
            <Label htmlFor="filename" className="text-sm font-medium">파일명</Label>
            <Input
              id="filename"
              value={options.customFilename}
              onChange={(e) => setOptions(prev => ({ ...prev, customFilename: e.target.value }))}
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">
              확장자는 자동으로 추가됩니다. 예상 크기: ~{getEstimatedSize()}MB
            </p>
          </div>

          {/* Progress and Status */}
          {exporting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">내보내기 진행 중...</span>
                <span className="text-sm text-gray-500">{exportProgress}%</span>
              </div>
              <Progress value={exportProgress} />
            </div>
          )}

          {exportStatus === 'success' && (
            <div className="flex items-center space-x-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="text-green-800">보고서가 성공적으로 내보내졌습니다!</span>
            </div>
          )}

          {exportStatus === 'error' && (
            <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <span className="text-red-800">내보내기 중 오류가 발생했습니다. 다시 시도해주세요.</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-3 pt-6 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={exporting}>
            취소
          </Button>
          <Button
            onClick={handleExport}
            disabled={exporting || !options.customFilename}
            className="min-w-[120px]"
          >
            {exporting ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                내보내는 중...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                내보내기
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
