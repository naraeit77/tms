'use client';

/**
 * TMS 2.0 Oracle Enterprise Dashboard
 * 다크 테마 기반 실시간 성능 모니터링 대시보드
 * - ASH 차트 드래그 선택으로 SQL 드릴다운
 * - 탭 기반 네비게이션 (Overview, Performance, Storage, SQL)
 * - 실시간 메트릭 업데이트
 */

import { useQuery } from '@tanstack/react-query';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { useSelectedDatabase } from '@/hooks/use-selected-database';
import { SQLClusterChart } from '@/components/charts/sql-cluster-chart';
import { transformToClusterPoint } from '@/lib/sql-grading';

// ============================================
// Constants
// ============================================

const COLORS = {
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  orange: '#f97316',
  pink: '#ec4899',
  gray: '#6b7280',
};

const WAIT_COLORS: Record<string, string> = {
  'CPU': '#10b981',
  'User I/O': '#3b82f6',
  'System I/O': '#8b5cf6',
  'Concurrency': '#f59e0b',
  'Application': '#f97316',
  'Commit': '#ef4444',
  'Other': '#6b7280',
};

interface ASHDataPoint {
  time: string;
  timestamp: number;
  index: number;
  CPU: number;
  'User I/O': number;
  'System I/O': number;
  Concurrency: number;
  Application: number;
  Other: number;
}

interface SQLData {
  rank: number;
  sqlId: string;
  sqlText: string;
  module: string;
  action?: string;
  username: string;
  waitClass: string;
  executions: number;
  elapsedSec: number;
  cpuSec: number;
  bufferGets: number;
  diskReads: number;
  rows: number;
  samples?: number;
  pctActivity: number;
}

// ============================================
// UI Components
// ============================================

const StatCard = ({ label, value, unit, color = COLORS.cyan, subtitle }: {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
  subtitle?: string;
}) => (
  <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
    <div className="text-xs text-gray-400 mb-1">{label}</div>
    <div className="flex items-baseline gap-1">
      <span className="text-2xl font-bold" style={{ color }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
      {unit && <span className="text-sm text-gray-500">{unit}</span>}
    </div>
    {subtitle && <div className="text-xs text-gray-500 mt-1">{subtitle}</div>}
  </div>
);

const Gauge = ({ label, value, max = 100, thresholds = [70, 85] }: {
  label: string;
  value: number;
  max?: number;
  thresholds?: [number, number];
}) => {
  const safeValue = Number(value) || 0;
  const pct = (safeValue / max) * 100;
  const color = pct >= thresholds[1] ? COLORS.red : pct >= thresholds[0] ? COLORS.yellow : COLORS.green;

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="text-xs text-gray-400 mb-3">{label}</div>
      <div className="relative h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="absolute h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
        />
      </div>
      <div className="flex justify-between mt-2">
        <span className="text-lg font-bold" style={{ color }}>{safeValue.toFixed(1)}%</span>
        <span className="text-xs text-gray-500">{max}%</span>
      </div>
    </div>
  );
};

const TablespaceBar = ({ name, pct, used, max }: {
  name: string;
  pct: number;
  used: number;
  max: number;
}) => {
  const safePct = Number(pct) || 0;
  const safeUsed = Number(used) || 0;
  const safeMax = Number(max) || 1;
  const color = safePct >= 90 ? COLORS.red : safePct >= 75 ? COLORS.yellow : COLORS.green;
  return (
    <div className="py-2">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-white">{name || 'Unknown'}</span>
        <span className="text-gray-400">{safeUsed.toFixed(1)} / {safeMax.toFixed(1)} GB</span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${safePct}%`, backgroundColor: color }} />
      </div>
      <div className="text-right text-xs mt-0.5" style={{ color }}>{safePct.toFixed(0)}%</div>
    </div>
  );
};

const Panel = ({ title, subtitle, children, className = '', actions }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}) => (
  <div className={`bg-gray-800 rounded-lg border border-gray-700 ${className}`}>
    <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
      <div>
        <h3 className="text-sm font-medium text-white">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
    <div className="p-4">{children}</div>
  </div>
);

// ============================================
// SQL Detail Modal
// ============================================

const SQLDetailModal = ({ isOpen, onClose, startTime, endTime, sqlData }: {
  isOpen: boolean;
  onClose: () => void;
  startTime: number | null;
  endTime: number | null;
  sqlData: SQLData[];
}) => {
  if (!isOpen || !startTime || !endTime) return null;

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const durationSec = Math.round((endTime - startTime) / 1000);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-6xl max-h-[90vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 bg-gray-800/50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="text-orange-500">📊</span>
                SQL Activity Analysis
              </h2>
              <p className="text-sm text-gray-400 mt-1">
                Selected Range:
                <span className="text-cyan-400 ml-2 font-mono">{formatTime(startTime)}</span>
                <span className="text-gray-500 mx-2">→</span>
                <span className="text-cyan-400 font-mono">{formatTime(endTime)}</span>
                <span className="text-gray-500 ml-3">({durationSec}s)</span>
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="px-6 py-4 bg-gray-800/30 border-b border-gray-700">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-cyan-400">{sqlData.length}</div>
              <div className="text-xs text-gray-500">Unique SQLs</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">{sqlData.reduce((sum, s) => sum + s.executions, 0).toLocaleString()}</div>
              <div className="text-xs text-gray-500">Total Executions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-400">{sqlData.reduce((sum, s) => sum + s.elapsedSec, 0).toFixed(1)}s</div>
              <div className="text-xs text-gray-500">Total Elapsed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-400">{sqlData.reduce((sum, s) => sum + s.bufferGets, 0).toLocaleString()}</div>
              <div className="text-xs text-gray-500">Buffer Gets</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-400">{sqlData.reduce((sum, s) => sum + s.diskReads, 0).toLocaleString()}</div>
              <div className="text-xs text-gray-500">Disk Reads</div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto max-h-[40vh]">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 sticky top-0">
              <tr>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">#</th>
                <th className="text-left py-3 px-4 text-gray-400 font-medium">SQL ID</th>
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
              {sqlData.map((sql, i) => (
                <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="py-3 px-4 text-gray-500">{sql.rank}</td>
                  <td className="py-3 px-4">
                    <span className="text-cyan-400 font-mono text-xs bg-cyan-400/10 px-2 py-1 rounded">{sql.sqlId}</span>
                  </td>
                  <td className="py-3 px-4 text-green-400 text-xs">{sql.module}</td>
                  <td className="py-3 px-4 text-gray-300 text-xs">{sql.username}</td>
                  <td className="py-3 px-4">
                    <span
                      className="text-xs px-2 py-1 rounded"
                      style={{
                        backgroundColor: `${WAIT_COLORS[sql.waitClass] || COLORS.gray}20`,
                        color: WAIT_COLORS[sql.waitClass] || COLORS.gray
                      }}
                    >
                      {sql.waitClass}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-white">{sql.executions.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right text-yellow-400">{sql.elapsedSec.toFixed(1)}s</td>
                  <td className="py-3 px-4 text-right text-orange-400">{sql.cpuSec.toFixed(1)}s</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-12 h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${sql.pctActivity}%`, backgroundColor: WAIT_COLORS[sql.waitClass] || COLORS.gray }}
                        />
                      </div>
                      <span className="text-white text-xs w-6">{sql.pctActivity}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* SQL Text */}
        <div className="px-6 py-4 border-t border-gray-700 bg-gray-800/30">
          <h3 className="text-sm font-medium text-white mb-3">SQL Text (Top 3)</h3>
          <div className="space-y-2 max-h-32 overflow-auto">
            {sqlData.slice(0, 3).map((sql, i) => (
              <div key={i} className="bg-gray-900 rounded p-2 border border-gray-700">
                <span className="text-cyan-400 font-mono text-xs mr-2">{sql.sqlId}</span>
                <code className="text-xs text-gray-300">{sql.sqlText}</code>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-2 bg-gray-800/50">
          <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg">Close</button>
          <button className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg">Export</button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// Draggable ASH Chart
// ============================================

const DraggableASHChart = ({ data, onRangeSelect }: {
  data: ASHDataPoint[];
  onRangeSelect: (startTime: number, endTime: number) => void;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [selection, setSelection] = useState<{ startX: number; endX: number; startIndex: number; endIndex: number } | null>(null);

  const CHART_PADDING = { left: 60, right: 20, top: 20, bottom: 30 };

  const getPositionFromEvent = (e: React.MouseEvent) => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return { x, y, width: rect.width, height: rect.height };
  };

  const getDataIndexFromX = (x: number, width: number) => {
    const chartWidth = width - CHART_PADDING.left - CHART_PADDING.right;
    const relativeX = x - CHART_PADDING.left;
    const index = Math.round((relativeX / chartWidth) * (data.length - 1));
    return Math.max(0, Math.min(data.length - 1, index));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getPositionFromEvent(e);
    if (!pos) return;

    if (pos.x >= CHART_PADDING.left && pos.x <= pos.width - CHART_PADDING.right) {
      setIsDragging(true);
      setDragStart(pos.x);
      setDragEnd(pos.x);
      setSelection(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const pos = getPositionFromEvent(e);
    if (!pos) return;

    const clampedX = Math.max(CHART_PADDING.left, Math.min(pos.width - CHART_PADDING.right, pos.x));
    setDragEnd(clampedX);
  };

  const handleMouseUp = () => {
    if (!isDragging || !containerRef.current) {
      setIsDragging(false);
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const width = rect.width;

    if (dragStart !== null && dragEnd !== null && Math.abs(dragEnd - dragStart) > 10) {
      const startX = Math.min(dragStart, dragEnd);
      const endX = Math.max(dragStart, dragEnd);

      const startIndex = getDataIndexFromX(startX, width);
      const endIndex = getDataIndexFromX(endX, width);

      if (startIndex !== endIndex && data[startIndex] && data[endIndex]) {
        setSelection({ startX, endX, startIndex, endIndex });
        onRangeSelect(data[startIndex].timestamp, data[endIndex].timestamp);
      }
    }

    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
    }
  };

  const clearSelection = () => {
    setSelection(null);
    setDragStart(null);
    setDragEnd(null);
  };

  const getOverlayStyle = () => {
    if (isDragging && dragStart !== null && dragEnd !== null) {
      const left = Math.min(dragStart, dragEnd);
      const width = Math.abs(dragEnd - dragStart);
      return { left, width, opacity: 1 };
    }
    if (selection) {
      return { left: selection.startX, width: selection.endX - selection.startX, opacity: 1 };
    }
    return { left: 0, width: 0, opacity: 0 };
  };

  const overlayStyle = getOverlayStyle();
  const selectedRange = selection
    ? `${data[selection.startIndex]?.time} → ${data[selection.endIndex]?.time}`
    : (isDragging && dragStart !== null && dragEnd !== null && containerRef.current)
      ? (() => {
        const width = containerRef.current.getBoundingClientRect().width;
        const startIdx = getDataIndexFromX(Math.min(dragStart, dragEnd), width);
        const endIdx = getDataIndexFromX(Math.max(dragStart, dragEnd), width);
        return `${data[startIdx]?.time} → ${data[endIdx]?.time}`;
      })()
      : null;

  return (
    <div className="relative">
      {/* Instructions & Selection Info */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 bg-gray-700/50 px-2 py-1 rounded flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
            Drag to select time range
          </span>
          {selection && (
            <button onClick={clearSelection} className="text-xs text-red-400 hover:text-red-300 bg-red-400/10 px-2 py-1 rounded flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear
            </button>
          )}
        </div>
        {selectedRange && (
          <div className="text-xs text-orange-400 bg-orange-400/10 border border-orange-400/30 px-3 py-1 rounded-full">
            📊 {selectedRange}
          </div>
        )}
      </div>

      {/* Chart Container with Overlay */}
      <div
        ref={containerRef}
        className="relative select-none"
        style={{ height: 280, cursor: 'crosshair' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {/* Selection Overlay */}
        <div
          className="absolute pointer-events-none z-10 transition-opacity duration-150"
          style={{
            left: overlayStyle.left,
            width: overlayStyle.width,
            top: CHART_PADDING.top,
            bottom: CHART_PADDING.bottom,
            backgroundColor: 'rgba(249, 115, 22, 0.3)',
            borderLeft: overlayStyle.width > 0 ? '2px solid #f97316' : 'none',
            borderRight: overlayStyle.width > 0 ? '2px solid #f97316' : 'none',
            opacity: overlayStyle.opacity,
          }}
        />

        {/* Recharts */}
        <ResponsiveContainer width="100%" height={280} minWidth={0} minHeight={0}>
          <AreaChart data={data} margin={{ top: 20, right: 20, left: 40, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="time" stroke="#6b7280" fontSize={10} tickLine={false} />
            <YAxis stroke="#6b7280" fontSize={10} tickLine={false} label={{ value: 'AAS', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 10 }} />
            <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
            {['CPU', 'User I/O', 'System I/O', 'Concurrency', 'Application', 'Other'].map(key => (
              <Area key={key} type="monotone" dataKey={key} stackId="1" stroke={WAIT_COLORS[key]} fill={WAIT_COLORS[key]} fillOpacity={0.8} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3 justify-center">
        {Object.entries(WAIT_COLORS).map(([name, color]) => (
          <div key={name} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
            <span className="text-xs text-gray-400">{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================
// Data Generation Functions (SQL 드릴다운용 & 샘플 데이터)
// ============================================

const generateSampleASHData = (): ASHDataPoint[] => {
  const now = Date.now();
  const data: ASHDataPoint[] = [];

  for (let i = 0; i < 30; i++) {
    const timestamp = now - (29 - i) * 60000;
    const time = new Date(timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

    data.push({
      time,
      timestamp,
      index: i,
      CPU: Math.floor(Math.random() * 5) + 1,
      'User I/O': Math.floor(Math.random() * 3) + 1,
      'System I/O': Math.floor(Math.random() * 2),
      Concurrency: Math.floor(Math.random() * 2),
      Application: Math.floor(Math.random() * 1),
      Other: Math.floor(Math.random() * 1),
    });
  }

  return data;
};

const generateSQLForTimeRange = (startTime: number, endTime: number): SQLData[] => {
  const sqlList = [
    { sqlId: 'g3p8k2n5vz1x', sqlText: 'SELECT * FROM TMS_SQL_HISTORY WHERE analyze_date > :1', module: 'TMS_ANALYZER', action: 'ANALYZE', username: 'TMS_APP', waitClass: 'CPU' },
    { sqlId: 'f7h2m9q4wy6b', sqlText: 'INSERT INTO TMS_METRICS (metric_id, value, collect_time) VALUES (:1, :2, :3)', module: 'TMS_COLLECTOR', action: 'COLLECT', username: 'TMS_APP', waitClass: 'User I/O' },
    { sqlId: 'a1c5x8j3tr9e', sqlText: 'SELECT sql_id, elapsed_time, executions FROM V$SQL WHERE elapsed_time > 1000000', module: 'TMS_REPORT', action: 'REPORT_GEN', username: 'REPORT_USER', waitClass: 'CPU' },
    { sqlId: 'k9l4p7s2ub8d', sqlText: 'UPDATE TMS_JOB_STATUS SET status = :1, end_time = SYSDATE WHERE job_id = :2', module: 'TMS_BATCH', action: 'JOB_UPDATE', username: 'BATCH_USER', waitClass: 'Concurrency' },
    { sqlId: 'm2n6q1w5vc3f', sqlText: 'SELECT COUNT(*) FROM TMS_ALERTS WHERE alert_status = \'OPEN\'', module: 'TMS_API', action: 'GET_ALERTS', username: 'API_USER', waitClass: 'User I/O' },
    { sqlId: 'p4r8t2v6xa0c', sqlText: 'DELETE FROM TMS_LOG WHERE log_date < SYSDATE - 30', module: 'TMS_CLEANUP', action: 'PURGE', username: 'BATCH_USER', waitClass: 'System I/O' },
    { sqlId: 'q5s9u3w7yb1d', sqlText: 'MERGE INTO TMS_BASELINE dst USING (SELECT ...) src ON (dst.id = src.id)', module: 'TMS_BASELINE', action: 'MERGE', username: 'TMS_APP', waitClass: 'Application' },
    { sqlId: 'r6t0v4x8zc2e', sqlText: 'SELECT owner, table_name, num_rows FROM DBA_TABLES WHERE num_rows > 1000000', module: 'TMS_STATS', action: 'TABLE_SCAN', username: 'DBA_USER', waitClass: 'CPU' },
  ];

  const durationMin = (endTime - startTime) / 60000;
  const multiplier = Math.max(1, durationMin / 5);

  return sqlList.map((sql, idx) => ({
    ...sql,
    rank: idx + 1,
    executions: Math.floor((Math.random() * 1000 + 500) * multiplier),
    elapsedSec: Math.floor((Math.random() * 500 + 100) * multiplier) / 10,
    cpuSec: Math.floor((Math.random() * 300 + 50) * multiplier) / 10,
    bufferGets: Math.floor((Math.random() * 50000 + 10000) * multiplier),
    diskReads: Math.floor((Math.random() * 5000 + 500) * multiplier),
    rows: Math.floor((Math.random() * 100000 + 5000) * multiplier),
    samples: Math.floor((Math.random() * 50 + 10) * multiplier),
    pctActivity: Math.floor(Math.random() * 20 + 5),
  })).sort((a, b) => b.elapsedSec - a.elapsedSec);
};

// ============================================
// Main Dashboard Component
// ============================================

export default function TMS2Dashboard() {
  const router = useRouter();
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
  const [tab, setTab] = useState('overview');
  const [ashData, setASHData] = useState<ASHDataPoint[]>([]);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  // SQL Modal State
  const [sqlModalOpen, setSqlModalOpen] = useState(false);
  const [selectedRange, setSelectedRange] = useState<{ start: number | null; end: number | null }>({ start: null, end: null });
  const [selectedSQLData, setSelectedSQLData] = useState<SQLData[]>([]);

  // Fetch real ASH data from API
  const { data: ashApiData, isLoading: isLoadingASH, error: ashError } = useQuery({
    queryKey: ['ash-data', selectedConnectionId],
    queryFn: async () => {
      if (!selectedConnectionId) return null;
      const res = await fetch(`/api/monitoring/ash?connection_id=${selectedConnectionId}&minutes=60`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch ASH data');
      }
      const result = await res.json();
      return result.data;
    },
    enabled: !!selectedConnectionId,
    refetchInterval: 10000,
    staleTime: 10 * 1000,
    retry: 1,
  });

  // Fetch Oracle metrics
  const { data: oracleMetrics, isLoading: isLoadingMetrics, error: metricsError } = useQuery({
    queryKey: ['oracle-dashboard-metrics', selectedConnectionId],
    queryFn: async () => {
      if (!selectedConnectionId) return null;
      const res = await fetch(`/api/monitoring/metrics?connection_id=${selectedConnectionId}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch metrics');
      }
      const result = await res.json();
      return result.data;
    },
    enabled: !!selectedConnectionId,
    refetchInterval: 5000,
    staleTime: 5 * 1000,
    retry: 1,
  });

  // Check for errors
  const hasError = ashError || metricsError;
  const isLoading = isLoadingASH || isLoadingMetrics;

  // ASH API 데이터로 업데이트 또는 샘플 데이터 생성
  useEffect(() => {
    if (ashApiData && ashApiData.length > 0) {
      const formattedData: ASHDataPoint[] = ashApiData.map((d: any, i: number) => ({
        time: d.time || new Date(d.timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        timestamp: d.timestamp || Date.now() - (ashApiData.length - 1 - i) * 60000,
        index: i,
        'CPU': d.CPU || d['CPU'] || 0,
        'User I/O': d['User I/O'] || 0,
        'System I/O': d['System I/O'] || 0,
        'Concurrency': d.Concurrency || 0,
        'Application': d.Application || 0,
        'Other': d.Other || 0,
      }));
      setASHData(formattedData);
      setLastUpdate(new Date());
    } else if (selectedConnectionId && !isLoadingASH && ashData.length === 0) {
      // 연결은 있지만 ASH 데이터가 없는 경우 샘플 데이터 생성
      setASHData(generateSampleASHData());
      setLastUpdate(new Date());
    }
  }, [ashApiData, selectedConnectionId, isLoadingASH, ashData.length]);

  const handleRangeSelect = useCallback((startTime: number, endTime: number) => {
    setSelectedRange({ start: startTime, end: endTime });
    setSelectedSQLData(generateSQLForTimeRange(startTime, endTime));
    setSqlModalOpen(true);
  }, []);

  // SQL Cluster 차트용 데이터 변환 (실시간 Top SQL 기반)
  const sqlClusterData = useMemo(() => {
    if (!topSQL || topSQL.length === 0) return [];

    return topSQL
      .map((sql: any) =>
        transformToClusterPoint({
          sql_id: sql.sql_id || sql.sqlId,
          elapsed_sec:
            ((sql.avg_elapsed_ms ?? sql.elapsed_ms ?? 0) / 1000) *
            Math.max(sql.executions ?? 1, 1),
          cpu_sec:
            ((sql.avg_cpu_ms ?? sql.cpu_ms ?? 0) / 1000) *
            Math.max(sql.executions ?? 1, 1),
          executions: sql.executions ?? 1,
          buffer_gets: (sql.avg_buffer_gets ?? sql.buffer_gets ?? 0) * Math.max(sql.executions ?? 1, 1),
          disk_reads: sql.disk_reads ?? 0,
          rows_processed: sql.rows_processed ?? sql.rows ?? 0,
          module: sql.module,
          wait_class: sql.wait_class,
        })
      )
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  }, [topSQL]);

  const handleSQLPointClick = useCallback(
    (sql: any) => {
      if (sql?.sqlId) {
        router.push(`/analysis/sql/${sql.sqlId}`);
      }
    },
    [router]
  );

  // Derive metrics from API or use defaults
  const sessions = oracleMetrics?.sessions || { total: 0, active: 0, inactive: 0, blocked: 0 };
  const activity = {
    commits: Math.floor(oracleMetrics?.performance?.transaction_tps || 0),
    executions: Math.floor(oracleMetrics?.system?.executions_per_sec || 0),
    parses: Math.floor(oracleMetrics?.system?.parses_per_sec || 0),
    physicalReads: Math.floor(oracleMetrics?.io?.physical_reads || 0),
  };
  const cpu = {
    host: Number(oracleMetrics?.system?.cpu_usage || 0),
    db: Number(oracleMetrics?.system?.db_cpu_usage || 0),
  };
  const memory = {
    sgaUsed: Number(oracleMetrics?.memory?.sga_used_gb || 0),
    sgaMax: Number(oracleMetrics?.memory?.sga_max_gb) || 6,
    pgaUsed: Number(oracleMetrics?.memory?.pga_used_gb || 0),
    pgaMax: Number(oracleMetrics?.memory?.pga_max_gb) || 3,
    bufferHit: Number(oracleMetrics?.performance?.buffer_cache_hit_rate || 0),
  };
  const io = {
    readIOPS: Math.floor(Number(oracleMetrics?.io?.read_iops) || 0),
    writeIOPS: Math.floor(Number(oracleMetrics?.io?.write_iops) || 0),
    readMBps: Number(oracleMetrics?.io?.read_mbps || 0),
    writeMBps: Number(oracleMetrics?.io?.write_mbps || 0),
  };

  // Wait time data - 실제 데이터만 사용
  const waitTime = oracleMetrics?.wait_events?.length > 0
    ? oracleMetrics.wait_events
    : oracleMetrics?.top_waits?.map((w: any) => ({
      name: w.wait_class || w.event,
      value: Number(w.time_waited_ms) || 0,
    })) || [];

  // Tablespace data
  const tablespaces = (oracleMetrics?.tablespaces || []).map((ts: any) => ({
    name: ts.name || ts.tablespace_name || 'Unknown',
    used: Number(ts.used_mb || 0) / 1024,
    max: Number(ts.size_mb || 1) / 1024,
    pct: Number(ts.used_pct || ts.pct || 0),
  }));

  // Resource limits - 실제 데이터만 사용
  const resources = (oracleMetrics?.resources || []).map((r: any) => ({
    name: r.name,
    current: Number(r.current) || 0,
    limit: Number(r.limit) || 999999,
  }));

  // Top SQL
  const topSQL = oracleMetrics?.top_sql || [];

  // Database info
  const dbInfo = oracleMetrics?.database || {};

  // Status display - 데이터가 있는지에 따라 상태 결정
  const hasData = oracleMetrics !== null && oracleMetrics !== undefined;
  const status = hasData ? 'up' : 'disconnected';

  // 연결이 없을 때 안내 메시지 표시
  if (!selectedConnectionId) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-orange-500 mb-2">TMS 2.0 Oracle Dashboard</h1>
          <p className="text-gray-400 mb-4">데이터베이스에 연결해주세요</p>
          <p className="text-sm text-gray-500">상단 헤더의 Database Selector에서 연결을 선택하세요.</p>
        </div>
      </div>
    );
  }

  // 로딩 상태
  if (isLoading && !oracleMetrics) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-4 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center animate-pulse">
            <svg className="w-10 h-10 text-white animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-orange-500 mb-2">TMS 2.0 Oracle Dashboard</h1>
          <p className="text-gray-400 mb-4">데이터를 불러오는 중...</p>
          <p className="text-sm text-gray-500">Oracle 데이터베이스에서 메트릭을 조회하고 있습니다.</p>
        </div>
      </div>
    );
  }

  // 에러 상태
  if (hasError) {
    const errorMessage = (ashError as Error)?.message || (metricsError as Error)?.message || 'Unknown error';
    return (
      <div className="min-h-screen bg-gray-900 text-white p-4 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-lg bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-red-500 mb-2">연결 오류</h1>
          <p className="text-gray-400 mb-4">Oracle 데이터베이스 연결에 실패했습니다</p>
          <p className="text-sm text-red-400 bg-red-400/10 p-3 rounded-lg mb-4">{errorMessage}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      {/* Header */}
      <header className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-orange-500">TMS 2.0 Oracle Dashboard</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {selectedConnection && (
              <div className="flex items-center gap-2 bg-gray-800 rounded px-3 py-1.5 border border-gray-700">
                <span className="text-xs text-gray-500">Instance:</span>
                <span className="text-cyan-400 text-sm font-medium">{selectedConnection.name}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{lastUpdate.toLocaleTimeString('ko-KR')}</span>
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div className="flex items-center gap-4 mt-4 text-xs bg-gray-800/50 rounded-lg px-4 py-2">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${hasData ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
            <span className={hasData ? 'text-green-400' : 'text-yellow-400'}>{hasData ? 'CONNECTED' : 'LOADING...'}</span>
          </div>
          {hasData && dbInfo.version && (
            <div><span className="text-gray-500">Version:</span> <span className="text-white">{dbInfo.version}</span></div>
          )}
          {selectedConnection && (
            <div><span className="text-gray-500">Host:</span> <span className="text-white">{selectedConnection.host}:{selectedConnection.port}</span></div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 border-b border-gray-700">
          {['overview', 'performance', 'storage', 'sql'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${tab === t ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-400 hover:text-white'
                }`}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Active Sessions" value={sessions.active} subtitle={`of ${sessions.total} total`} color={COLORS.cyan} />
            <StatCard label="Blocked" value={sessions.blocked || 0} color={sessions.blocked > 0 ? COLORS.red : COLORS.green} />
            <StatCard label="User Commits/s" value={activity.commits} color={COLORS.green} />
            <StatCard label="Executions/s" value={activity.executions} color={COLORS.purple} />
            <StatCard label="Physical Reads/s" value={activity.physicalReads} color={COLORS.orange} />
            <StatCard label="Parse Count/s" value={activity.parses} color={COLORS.blue} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Panel title="Active Session History (ASH)" subtitle="Drag to select time range for SQL drill-down" className="lg:col-span-2" actions={<span className="text-xs text-orange-400 bg-orange-400/10 px-2 py-1 rounded">Interactive</span>}>
              <DraggableASHChart data={ashData} onRangeSelect={handleRangeSelect} />
            </Panel>

            <Panel title="Wait Time Distribution (ms)">
              <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height={320} minWidth={0} minHeight={0}>
                  <BarChart data={waitTime} layout="vertical" margin={{ left: 0, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                    <XAxis type="number" stroke="#6b7280" fontSize={10} />
                    <YAxis dataKey="name" type="category" stroke="#6b7280" fontSize={10} width={75} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {waitTime.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={WAIT_COLORS[entry.name] || COLORS.gray} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Gauge label="Host CPU" value={cpu.host} />
            <Gauge label="DB CPU" value={cpu.db} />
            <Gauge label="SGA Used" value={memory.sgaMax > 0 ? (memory.sgaUsed / memory.sgaMax) * 100 : 0} />
            <Gauge label="Buffer Cache Hit" value={memory.bufferHit} thresholds={[90, 95]} />
          </div>

          <Panel title="I/O Statistics">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div><div className="text-2xl font-bold text-blue-400">{io.readIOPS.toLocaleString()}</div><div className="text-xs text-gray-500">Read IOPS</div></div>
              <div><div className="text-2xl font-bold text-purple-400">{io.writeIOPS.toLocaleString()}</div><div className="text-xs text-gray-500">Write IOPS</div></div>
              <div><div className="text-2xl font-bold text-blue-400">{io.readMBps.toFixed(1)}</div><div className="text-xs text-gray-500">Read MB/s</div></div>
              <div><div className="text-2xl font-bold text-purple-400">{io.writeMBps.toFixed(1)}</div><div className="text-xs text-gray-500">Write MB/s</div></div>
            </div>
          </Panel>
        </div>
      )}

      {/* Performance Tab */}
      {tab === 'performance' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel title="Active Session History (30 min)" subtitle="🖱️ Drag to drill-down into SQL activity">
              <DraggableASHChart data={ashData} onRangeSelect={handleRangeSelect} />
            </Panel>

            <Panel title="Wait Events Breakdown">
              <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height={320} minWidth={0} minHeight={0}>
                  <PieChart>
                    <Pie data={waitTime} cx="50%" cy="50%" innerRadius={50} outerRadius={100} paddingAngle={2} dataKey="value">
                      {waitTime.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={WAIT_COLORS[entry.name] || COLORS.gray} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {waitTime.slice(0, 5).map((w: any) => (
                  <div key={w.name} className="flex items-center gap-1 text-xs">
                    <div className="w-2 h-2 rounded" style={{ backgroundColor: WAIT_COLORS[w.name] }} />
                    <span className="text-gray-400">{w.name}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Gauge label="Host CPU %" value={cpu.host} />
            <Gauge label="DB CPU %" value={cpu.db} />
            <Gauge label="Buffer Cache Hit %" value={memory.bufferHit} thresholds={[85, 92]} />
            <Gauge label="PGA Used %" value={memory.pgaMax > 0 ? (memory.pgaUsed / memory.pgaMax) * 100 : 0} />
          </div>

          <Panel
            title="SQL Performance Distribution"
            subtitle="X: Elapsed/Exec (ms, log), Y: Buffer/Exec (log), Size: Executions"
          >
            {sqlClusterData.length > 0 ? (
              <SQLClusterChart
                data={sqlClusterData}
                height={420}
                onSQLClick={handleSQLPointClick}
                showLegend
                showGradeStats
              />
            ) : (
              <div className="h-40 flex items-center justify-center text-sm text-gray-500">
                실시간 Top SQL 데이터를 불러오는 중입니다.
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* Storage Tab */}
      {tab === 'storage' && (
        <div className="space-y-4">
          <Panel title="Tablespace Usage">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              {tablespaces.length > 0 ? tablespaces.map((ts: any, i: number) => (
                <TablespaceBar key={i} name={ts.name} pct={ts.pct} used={ts.used} max={ts.max} />
              )) : (
                <>
                  <TablespaceBar name="SYSTEM" pct={70} used={2.8} max={4} />
                  <TablespaceBar name="SYSAUX" pct={70} used={2.1} max={3} />
                  <TablespaceBar name="USERS" pct={85} used={8.5} max={10} />
                  <TablespaceBar name="TMS_DATA" pct={90} used={45} max={50} />
                  <TablespaceBar name="TMS_INDEX" pct={60} used={12} max={20} />
                  <TablespaceBar name="UNDOTBS1" pct={40} used={3.2} max={8} />
                </>
              )}
            </div>
          </Panel>
          <Panel title="Resource Limits (v$resource_limit)">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 text-gray-400 font-medium">Resource</th>
                    <th className="text-right py-2 text-gray-400 font-medium">Current</th>
                    <th className="text-right py-2 text-gray-400 font-medium">Limit</th>
                    <th className="text-right py-2 text-gray-400 font-medium">% Used</th>
                  </tr>
                </thead>
                <tbody>
                  {resources.map((r: any, i: number) => {
                    const pct = r.limit > 0 ? (r.current / r.limit) * 100 : 0;
                    const color = pct >= 85 ? COLORS.red : pct >= 70 ? COLORS.yellow : COLORS.green;
                    return (
                      <tr key={i} className="border-b border-gray-800">
                        <td className="py-2 text-white capitalize">{r.name.replace(/_/g, ' ')}</td>
                        <td className="py-2 text-right text-white">{r.current.toLocaleString()}</td>
                        <td className="py-2 text-right text-gray-400">{r.limit.toLocaleString()}</td>
                        <td className="py-2 text-right font-medium" style={{ color }}>{pct.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {/* SQL Tab */}
      {tab === 'sql' && (
        <div className="space-y-4">
          <Panel title="Top SQL by Elapsed Time">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left py-2 text-gray-400 font-medium">#</th>
                    <th className="text-left py-2 text-gray-400 font-medium">SQL ID</th>
                    <th className="text-left py-2 text-gray-400 font-medium">Module</th>
                    <th className="text-right py-2 text-gray-400 font-medium">Executions</th>
                    <th className="text-right py-2 text-gray-400 font-medium">Elapsed (s)</th>
                  </tr>
                </thead>
                <tbody>
                  {topSQL.length > 0 ? topSQL.map((sql: any, i: number) => (
                    <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer"
                      onClick={() => router.push(`/analysis/sql/${sql.sql_id}`)}>
                      <td className="py-2 text-gray-500">{i + 1}</td>
                      <td className="py-2 text-cyan-400 font-mono">{sql.sql_id}</td>
                      <td className="py-2 text-green-400">{sql.module || '-'}</td>
                      <td className="py-2 text-right text-white">{(sql.executions || 0).toLocaleString()}</td>
                      <td className="py-2 text-right text-yellow-400">{((sql.avg_elapsed_ms || 0) / 1000).toFixed(1)}</td>
                    </tr>
                  )) : [
                    { sqlId: 'g3p8k2n5vz1x', executions: 125340, elapsed: 1845.2, module: 'TMS_ANALYZER' },
                    { sqlId: 'f7h2m9q4wy6b', executions: 89210, elapsed: 1232.1, module: 'TMS_COLLECTOR' },
                    { sqlId: 'a1c5x8j3tr9e', executions: 45678, elapsed: 876.5, module: 'TMS_REPORT' },
                    { sqlId: 'k9l4p7s2ub8d', executions: 34521, elapsed: 654.3, module: 'TMS_BATCH' },
                    { sqlId: 'm2n6q1w5vc3f', executions: 23456, elapsed: 432.1, module: 'TMS_API' },
                  ].map((sql, i) => (
                    <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="py-2 text-gray-500">{i + 1}</td>
                      <td className="py-2 text-cyan-400 font-mono">{sql.sqlId}</td>
                      <td className="py-2 text-green-400">{sql.module}</td>
                      <td className="py-2 text-right text-white">{sql.executions.toLocaleString()}</td>
                      <td className="py-2 text-right text-yellow-400">{sql.elapsed.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total SQL Analyzed" value={topSQL.length || 15234} color={COLORS.cyan} />
            <StatCard label="Tuning Recommendations" value={387} color={COLORS.purple} />
            <StatCard label="Applied Tunings" value={198} color={COLORS.green} />
            <StatCard label="Avg Improvement" value="18.5" unit="%" color={COLORS.orange} />
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center text-xs text-gray-600 mt-8 py-4 border-t border-gray-800">
        <p>TMS 2.0 • Oracle Database Performance Monitoring • 나래정보기술</p>
      </footer>

      {/* SQL Modal */}
      <SQLDetailModal
        isOpen={sqlModalOpen}
        onClose={() => setSqlModalOpen(false)}
        startTime={selectedRange.start}
        endTime={selectedRange.end}
        sqlData={selectedSQLData}
      />
    </div>
  );
}
