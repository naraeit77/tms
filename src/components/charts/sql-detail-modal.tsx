'use client';

/**
 * SQL Detail Modal Component
 * TMS 2.0 구현 가이드 기반 - 시간 범위 선택 후 SQL 상세 분석 모달
 */

import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Download, ExternalLink, Copy } from 'lucide-react';
import { SQLGrade, getGradeInfo, WAIT_CLASS_COLORS } from '@/lib/sql-grading';

export interface SQLDetailData {
  rank: number;
  sqlId: string;
  sqlText?: string;
  module?: string;
  action?: string;
  username?: string;
  waitClass?: string;
  executions: number;
  elapsedSec: number;
  cpuSec: number;
  bufferGets: number;
  diskReads: number;
  rows?: number;
  samples?: number;
  pctActivity: number;
  grade?: SQLGrade;
}

interface SQLDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  startTime: number | null;
  endTime: number | null;
  sqlData: SQLDetailData[];
  onExport?: () => void;
  onSQLClick?: (sqlId: string) => void;
}

export function SQLDetailModal({
  isOpen,
  onClose,
  startTime,
  endTime,
  sqlData,
  onExport,
  onSQLClick,
}: SQLDetailModalProps) {
  const formatTime = (ts: number | null) => {
    if (!ts) return '--:--:--';
    return new Date(ts).toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const durationSec = useMemo(() => {
    if (!startTime || !endTime) return 0;
    return Math.round((endTime - startTime) / 1000);
  }, [startTime, endTime]);

  // Summary statistics
  const summary = useMemo(() => {
    if (!sqlData.length) return null;
    return {
      uniqueSQLs: sqlData.length,
      totalExecutions: sqlData.reduce((sum, s) => sum + s.executions, 0),
      totalElapsed: sqlData.reduce((sum, s) => sum + s.elapsedSec, 0),
      totalBufferGets: sqlData.reduce((sum, s) => sum + s.bufferGets, 0),
      totalDiskReads: sqlData.reduce((sum, s) => sum + s.diskReads, 0),
    };
  }, [sqlData]);

  const handleCopySQLId = (sqlId: string) => {
    navigator.clipboard.writeText(sqlId);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden bg-gray-900 border-gray-700 p-0">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-gray-700 bg-gray-800/50">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-orange-500">📊</span>
                SQL Activity Analysis
              </DialogTitle>
              <p className="text-sm text-gray-400 mt-1">
                Selected Range:
                <span className="text-cyan-400 ml-2 font-mono">{formatTime(startTime)}</span>
                <span className="text-gray-500 mx-2">→</span>
                <span className="text-cyan-400 font-mono">{formatTime(endTime)}</span>
                <span className="text-gray-500 ml-3">({durationSec}s)</span>
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-gray-400 hover:text-white hover:bg-gray-700"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </DialogHeader>

        {/* Summary Stats */}
        {summary && (
          <div className="px-6 py-4 bg-gray-800/30 border-b border-gray-700">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-cyan-400">{summary.uniqueSQLs}</div>
                <div className="text-xs text-gray-500">Unique SQLs</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">
                  {summary.totalExecutions.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500">Total Executions</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-400">
                  {summary.totalElapsed.toFixed(1)}s
                </div>
                <div className="text-xs text-gray-500">Total Elapsed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">
                  {summary.totalBufferGets.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500">Buffer Gets</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-400">
                  {summary.totalDiskReads.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500">Disk Reads</div>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <ScrollArea className="max-h-[40vh]">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 sticky top-0">
              <tr>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">#</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">SQL ID</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Grade</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Module</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">User</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">Wait Class</th>
                <th className="text-right py-3 px-4 text-gray-400 font-medium">Execs</th>
                <th className="text-right py-3 px-4 text-gray-400 font-medium">Elapsed</th>
                <th className="text-right py-3 px-4 text-gray-400 font-medium">CPU</th>
                <th className="text-right py-3 px-4 text-gray-400 font-medium">% Act</th>
              </tr>
            </thead>
            <tbody>
              {sqlData.map((sql, i) => {
                const gradeInfo = sql.grade ? getGradeInfo(sql.grade) : null;
                const waitColor = sql.waitClass
                  ? WAIT_CLASS_COLORS[sql.waitClass] || WAIT_CLASS_COLORS['Other']
                  : WAIT_CLASS_COLORS['Other'];

                return (
                  <tr
                    key={sql.sqlId}
                    className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer"
                    onClick={() => onSQLClick?.(sql.sqlId)}
                  >
                    <td className="py-3 px-4 text-gray-500">{sql.rank}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-cyan-400 font-mono text-xs bg-cyan-400/10 px-2 py-1 rounded">
                          {sql.sqlId}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopySQLId(sql.sqlId);
                          }}
                          className="text-gray-500 hover:text-gray-300"
                          title="Copy SQL ID"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {gradeInfo && (
                        <Badge
                          className="text-xs font-bold"
                          style={{
                            backgroundColor: `${gradeInfo.color}20`,
                            color: gradeInfo.color,
                            borderColor: gradeInfo.color,
                          }}
                        >
                          {gradeInfo.grade}
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-4 text-green-400 text-xs">{sql.module || '-'}</td>
                    <td className="py-3 px-4 text-gray-300 text-xs">{sql.username || '-'}</td>
                    <td className="py-3 px-4">
                      {sql.waitClass && (
                        <span
                          className="text-xs px-2 py-1 rounded"
                          style={{
                            backgroundColor: `${waitColor}20`,
                            color: waitColor,
                          }}
                        >
                          {sql.waitClass}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right text-white">
                      {sql.executions.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right text-yellow-400">
                      {sql.elapsedSec.toFixed(1)}s
                    </td>
                    <td className="py-3 px-4 text-right text-orange-400">
                      {sql.cpuSec.toFixed(1)}s
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-12 h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(sql.pctActivity, 100)}%`,
                              backgroundColor: waitColor,
                            }}
                          />
                        </div>
                        <span className="text-white text-xs w-8">{sql.pctActivity}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>

        {/* SQL Text Preview (Top 3) */}
        {sqlData.some((sql) => sql.sqlText) && (
          <div className="px-6 py-4 border-t border-gray-700 bg-gray-800/30">
            <h3 className="text-sm font-medium text-white mb-3">SQL Text (Top 3)</h3>
            <ScrollArea className="max-h-32">
              <div className="space-y-2">
                {sqlData
                  .slice(0, 3)
                  .filter((sql) => sql.sqlText)
                  .map((sql) => (
                    <div
                      key={sql.sqlId}
                      className="bg-gray-900 rounded p-2 border border-gray-700"
                    >
                      <span className="text-cyan-400 font-mono text-xs mr-2">{sql.sqlId}</span>
                      <code className="text-xs text-gray-300 break-all">{sql.sqlText}</code>
                    </div>
                  ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 flex justify-between items-center bg-gray-800/50">
          <div className="text-xs text-gray-500">
            {sqlData.length} SQL statements in selected time range
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="bg-gray-700 hover:bg-gray-600 border-gray-600"
            >
              Close
            </Button>
            {onExport && (
              <Button
                onClick={onExport}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
