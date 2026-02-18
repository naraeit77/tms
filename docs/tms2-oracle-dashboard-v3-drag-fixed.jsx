import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// ============================================
// TMS 2.0 Oracle Enterprise Dashboard
// With Drag Selection & SQL Drill-down (Fixed)
// ============================================

// Constants
const INSTANCES = [
  { id: 'TMSDB_PROD', name: 'TMSDB_PROD', host: 'db-prod:1521' },
  { id: 'TMSDB_DEV', name: 'TMSDB_DEV', host: 'db-dev:1521' },
  { id: 'ORCL_RAC1', name: 'ORCL_RAC1', host: 'rac-scan:1521' },
];

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

const WAIT_COLORS = {
  'CPU': '#10b981',
  'User I/O': '#3b82f6',
  'System I/O': '#8b5cf6',
  'Concurrency': '#f59e0b',
  'Application': '#f97316',
  'Commit': '#ef4444',
  'Other': '#6b7280',
};

// ============================================
// Mock Data Generators
// ============================================

const generateData = (hasBlocked = false) => ({
  status: hasBlocked ? 'warning' : 'up',
  uptime: '15d 8h 32m',
  version: '19.18.0.0.0',
  
  sessions: {
    total: Math.floor(Math.random() * 50) + 150,
    active: Math.floor(Math.random() * 30) + 20,
    inactive: Math.floor(Math.random() * 40) + 80,
    blocked: hasBlocked ? Math.floor(Math.random() * 3) + 1 : 0,
  },
  
  activity: {
    commits: Math.floor(Math.random() * 200) + 800,
    executions: Math.floor(Math.random() * 5000) + 15000,
    parses: Math.floor(Math.random() * 1000) + 3000,
    physicalReads: Math.floor(Math.random() * 2000) + 5000,
  },
  
  cpu: {
    host: Math.random() * 40 + 30,
    db: Math.random() * 30 + 15,
  },
  
  memory: {
    sgaUsed: 4.2 + Math.random() * 0.5,
    sgaMax: 6,
    pgaUsed: 1.5 + Math.random() * 0.3,
    pgaMax: 3,
    bufferHit: 97 + Math.random() * 2,
  },
  
  io: {
    readIOPS: Math.floor(Math.random() * 500) + 300,
    writeIOPS: Math.floor(Math.random() * 200) + 100,
    readMBps: Math.random() * 40 + 20,
    writeMBps: Math.random() * 15 + 5,
  },
  
  waitTime: [
    { name: 'User I/O', value: Math.random() * 100 + 50 },
    { name: 'CPU', value: Math.random() * 80 + 40 },
    { name: 'System I/O', value: Math.random() * 60 + 20 },
    { name: 'Concurrency', value: Math.random() * 40 + 10 },
    { name: 'Application', value: Math.random() * 30 + 5 },
    { name: 'Commit', value: Math.random() * 25 + 5 },
    { name: 'Other', value: Math.random() * 20 + 5 },
  ].sort((a, b) => b.value - a.value),
  
  tablespaces: [
    { name: 'SYSTEM', used: 2.8, max: 4, pct: 70 },
    { name: 'SYSAUX', used: 2.1, max: 3, pct: 70 },
    { name: 'USERS', used: 8.5, max: 10, pct: 85 },
    { name: 'TMS_DATA', used: 45, max: 50, pct: 90 },
    { name: 'TMS_INDEX', used: 12, max: 20, pct: 60 },
    { name: 'UNDOTBS1', used: 3.2, max: 8, pct: 40 },
  ],
  
  resources: [
    { name: 'processes', current: Math.floor(Math.random() * 80) + 180, limit: 500 },
    { name: 'sessions', current: Math.floor(Math.random() * 100) + 200, limit: 772 },
    { name: 'enqueue_locks', current: Math.floor(Math.random() * 200) + 150, limit: 5380 },
  ],
  
  blockedSessions: hasBlocked ? [
    { sid: 145, username: 'TMS_APP', waitEvent: 'enq: TX - row lock', waitSec: 125, blocker: 234 },
    { sid: 167, username: 'BATCH_USER', waitEvent: 'enq: TM - contention', waitSec: 45, blocker: 234 },
  ] : [],
  
  topSQL: [
    { sqlId: 'g3p8k2n5vz1x', executions: 125340, elapsed: 1845.2, module: 'TMS_ANALYZER' },
    { sqlId: 'f7h2m9q4wy6b', executions: 89210, elapsed: 1232.1, module: 'TMS_COLLECTOR' },
    { sqlId: 'a1c5x8j3tr9e', executions: 45678, elapsed: 876.5, module: 'TMS_REPORT' },
    { sqlId: 'k9l4p7s2ub8d', executions: 34521, elapsed: 654.3, module: 'TMS_BATCH' },
    { sqlId: 'm2n6q1w5vc3f', executions: 23456, elapsed: 432.1, module: 'TMS_API' },
  ],
});

// Generate ASH data with timestamp
const generateASHData = () => {
  const now = Date.now();
  return Array.from({ length: 60 }, (_, i) => {
    const timestamp = now - (59 - i) * 60000;
    const date = new Date(timestamp);
    return {
      time: date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
      timestamp,
      index: i,
      'CPU': Math.random() * 3 + 1.5,
      'User I/O': Math.random() * 2.5 + 1,
      'System I/O': Math.random() * 1.5 + 0.5,
      'Concurrency': Math.random() * 1 + 0.2,
      'Application': Math.random() * 0.8 + 0.1,
      'Other': Math.random() * 0.5 + 0.1,
    };
  });
};

// Generate SQL data for time range
const generateSQLForTimeRange = (startTime, endTime) => {
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
// Components
// ============================================

const StatCard = ({ label, value, unit, color = COLORS.cyan, subtitle }) => (
  <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
    <div className="text-xs text-gray-400 mb-1">{label}</div>
    <div className="flex items-baseline gap-1">
      <span className="text-2xl font-bold" style={{ color }}>{typeof value === 'number' ? value.toLocaleString() : value}</span>
      {unit && <span className="text-sm text-gray-500">{unit}</span>}
    </div>
    {subtitle && <div className="text-xs text-gray-500 mt-1">{subtitle}</div>}
  </div>
);

const Gauge = ({ label, value, max = 100, thresholds = [70, 85] }) => {
  const pct = (value / max) * 100;
  const color = pct >= thresholds[1] ? COLORS.red : pct >= thresholds[0] ? COLORS.yellow : COLORS.green;
  
  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="text-xs text-gray-400 mb-3">{label}</div>
      <div className="relative h-3 bg-gray-700 rounded-full overflow-hidden">
        <div className="absolute h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} />
      </div>
      <div className="flex justify-between mt-2">
        <span className="text-lg font-bold" style={{ color }}>{value.toFixed(1)}%</span>
        <span className="text-xs text-gray-500">{max}%</span>
      </div>
    </div>
  );
};

const TablespaceBar = ({ name, pct, used, max }) => {
  const color = pct >= 90 ? COLORS.red : pct >= 75 ? COLORS.yellow : COLORS.green;
  return (
    <div className="py-2">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-white">{name}</span>
        <span className="text-gray-400">{used.toFixed(1)} / {max.toFixed(1)} GB</span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="text-right text-xs mt-0.5" style={{ color }}>{pct}%</div>
    </div>
  );
};

const AlertBanner = ({ sessions }) => {
  if (sessions.length === 0) return null;
  return (
    <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
        <span className="text-red-400 font-semibold">⚠️ {sessions.length} Blocked Session(s) Detected</span>
      </div>
      <div className="space-y-2">
        {sessions.map((s, i) => (
          <div key={i} className="bg-gray-900/50 rounded p-3 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span><span className="text-gray-500">SID:</span> <span className="text-red-400 font-mono">{s.sid}</span></span>
              <span><span className="text-gray-500">User:</span> <span className="text-white">{s.username}</span></span>
              <span><span className="text-gray-500">Wait:</span> <span className="text-yellow-400">{s.waitSec}s</span></span>
              <span><span className="text-gray-500">Blocker:</span> <span className="text-orange-400">{s.blocker}</span></span>
            </div>
            <div className="text-gray-400 text-xs mt-1">{s.waitEvent}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Panel = ({ title, subtitle, children, className = '', actions }) => (
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

// SQL Detail Modal
const SQLDetailModal = ({ isOpen, onClose, startTime, endTime, sqlData }) => {
  if (!isOpen) return null;
  
  const formatTime = (ts) => new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
                    <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: `${WAIT_COLORS[sql.waitClass] || COLORS.gray}20`, color: WAIT_COLORS[sql.waitClass] || COLORS.gray }}>
                      {sql.waitClass}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-white">{sql.executions.toLocaleString()}</td>
                  <td className="py-3 px-4 text-right text-yellow-400">{sql.elapsedSec.toFixed(1)}s</td>
                  <td className="py-3 px-4 text-right text-orange-400">{sql.cpuSec.toFixed(1)}s</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-12 h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${sql.pctActivity}%`, backgroundColor: WAIT_COLORS[sql.waitClass] || COLORS.gray }} />
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
// Draggable ASH Chart with Visual Overlay
// ============================================
const DraggableASHChart = ({ data, onRangeSelect }) => {
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const [selection, setSelection] = useState(null);
  
  // Chart area padding (approximate Recharts default)
  const CHART_PADDING = { left: 60, right: 20, top: 20, bottom: 30 };
  
  const getPositionFromEvent = (e) => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return { x, y, width: rect.width, height: rect.height };
  };
  
  const getDataIndexFromX = (x, width) => {
    const chartWidth = width - CHART_PADDING.left - CHART_PADDING.right;
    const relativeX = x - CHART_PADDING.left;
    const index = Math.round((relativeX / chartWidth) * (data.length - 1));
    return Math.max(0, Math.min(data.length - 1, index));
  };
  
  const handleMouseDown = (e) => {
    const pos = getPositionFromEvent(e);
    if (!pos) return;
    
    // Check if within chart area
    if (pos.x >= CHART_PADDING.left && pos.x <= pos.width - CHART_PADDING.right) {
      setIsDragging(true);
      setDragStart(pos.x);
      setDragEnd(pos.x);
      setSelection(null);
    }
  };
  
  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const pos = getPositionFromEvent(e);
    if (!pos) return;
    
    const clampedX = Math.max(CHART_PADDING.left, Math.min(pos.width - CHART_PADDING.right, pos.x));
    setDragEnd(clampedX);
  };
  
  const handleMouseUp = (e) => {
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
  
  // Calculate overlay position
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
  const selectedRange = selection ? 
    `${data[selection.startIndex]?.time} → ${data[selection.endIndex]?.time}` : 
    (isDragging && dragStart !== null && dragEnd !== null && containerRef.current) ?
      (() => {
        const width = containerRef.current.getBoundingClientRect().width;
        const startIdx = getDataIndexFromX(Math.min(dragStart, dragEnd), width);
        const endIdx = getDataIndexFromX(Math.max(dragStart, dragEnd), width);
        return `${data[startIdx]?.time} → ${data[endIdx]?.time}`;
      })() : null;

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
        <ResponsiveContainer width="100%" height="100%">
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
// Main Dashboard
// ============================================

export default function TMS2Dashboard() {
  const [instance, setInstance] = useState('TMSDB_PROD');
  const [data, setData] = useState(() => generateData(false));
  const [ashData, setASHData] = useState(() => generateASHData());
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [tab, setTab] = useState('overview');
  
  // SQL Modal State
  const [sqlModalOpen, setSqlModalOpen] = useState(false);
  const [selectedRange, setSelectedRange] = useState({ start: null, end: null });
  const [selectedSQLData, setSelectedSQLData] = useState([]);

  const hasBlocked = instance === 'ORCL_RAC1';

  useEffect(() => {
    const interval = setInterval(() => {
      setData(generateData(hasBlocked));
      setASHData(prev => {
        const newPoint = {
          time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
          timestamp: Date.now(),
          index: prev.length > 0 ? prev[prev.length - 1].index + 1 : 0,
          'CPU': Math.random() * 3 + 1.5,
          'User I/O': Math.random() * 2.5 + 1,
          'System I/O': Math.random() * 1.5 + 0.5,
          'Concurrency': Math.random() * 1 + 0.2,
          'Application': Math.random() * 0.8 + 0.1,
          'Other': Math.random() * 0.5 + 0.1,
        };
        return [...prev.slice(1), newPoint].map((d, i) => ({ ...d, index: i }));
      });
      setLastUpdate(new Date());
    }, 5000);
    return () => clearInterval(interval);
  }, [hasBlocked]);

  useEffect(() => {
    setData(generateData(hasBlocked));
  }, [instance, hasBlocked]);

  const handleRangeSelect = useCallback((startTime, endTime) => {
    setSelectedRange({ start: startTime, end: endTime });
    setSelectedSQLData(generateSQLForTimeRange(startTime, endTime));
    setSqlModalOpen(true);
  }, []);

  const { sessions, activity, cpu, memory, io, waitTime, tablespaces, resources, blockedSessions, topSQL } = data;

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
              <p className="text-xs text-gray-500">🖱️ Drag on ASH chart to analyze SQL</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-gray-800 rounded px-3 py-1.5 border border-gray-700">
              <span className="text-xs text-gray-500">Instance:</span>
              <select value={instance} onChange={(e) => setInstance(e.target.value)} className="bg-transparent text-cyan-400 text-sm font-medium focus:outline-none cursor-pointer">
                {INSTANCES.map(i => (<option key={i.id} value={i.id} className="bg-gray-800">{i.name}</option>))}
              </select>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{lastUpdate.toLocaleTimeString('ko-KR')}</span>
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div className="flex items-center gap-4 mt-4 text-xs bg-gray-800/50 rounded-lg px-4 py-2">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${data.status === 'up' ? 'bg-green-500' : 'bg-yellow-500'}`} />
            <span className={data.status === 'up' ? 'text-green-400' : 'text-yellow-400'}>{data.status.toUpperCase()}</span>
          </div>
          <div><span className="text-gray-500">Version:</span> <span className="text-white">{data.version}</span></div>
          <div><span className="text-gray-500">Uptime:</span> <span className="text-white">{data.uptime}</span></div>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-1 mt-4 border-b border-gray-700">
          {['overview', 'performance', 'storage', 'sql'].map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${tab === t ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-400 hover:text-white'}`}>
              {t}
            </button>
          ))}
        </div>
      </header>

      <AlertBanner sessions={blockedSessions} />

      {/* Content */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Active Sessions" value={sessions.active} subtitle={`of ${sessions.total} total`} color={COLORS.cyan} />
            <StatCard label="Blocked" value={sessions.blocked} color={sessions.blocked > 0 ? COLORS.red : COLORS.green} />
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
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={waitTime} layout="vertical" margin={{ left: 0, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                    <XAxis type="number" stroke="#6b7280" fontSize={10} />
                    <YAxis dataKey="name" type="category" stroke="#6b7280" fontSize={10} width={75} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {waitTime.map((entry, index) => (<Cell key={`cell-${index}`} fill={WAIT_COLORS[entry.name] || COLORS.gray} />))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Gauge label="Host CPU" value={cpu.host} />
            <Gauge label="DB CPU" value={cpu.db} />
            <Gauge label="SGA Used" value={(memory.sgaUsed / memory.sgaMax) * 100} />
            <Gauge label="Buffer Cache Hit" value={memory.bufferHit} thresholds={[90, 95]} />
          </div>

          <Panel title="I/O Statistics">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div><div className="text-2xl font-bold text-blue-400">{io.readIOPS}</div><div className="text-xs text-gray-500">Read IOPS</div></div>
              <div><div className="text-2xl font-bold text-purple-400">{io.writeIOPS}</div><div className="text-xs text-gray-500">Write IOPS</div></div>
              <div><div className="text-2xl font-bold text-blue-400">{io.readMBps.toFixed(1)}</div><div className="text-xs text-gray-500">Read MB/s</div></div>
              <div><div className="text-2xl font-bold text-purple-400">{io.writeMBps.toFixed(1)}</div><div className="text-xs text-gray-500">Write MB/s</div></div>
            </div>
          </Panel>
        </div>
      )}

      {tab === 'performance' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel title="Active Session History (30 min)" subtitle="🖱️ Drag to drill-down into SQL activity">
              <DraggableASHChart data={ashData} onRangeSelect={handleRangeSelect} />
            </Panel>
            
            <Panel title="Wait Events Breakdown">
              <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={waitTime} cx="50%" cy="50%" innerRadius={50} outerRadius={100} paddingAngle={2} dataKey="value">
                      {waitTime.map((entry, index) => (<Cell key={`cell-${index}`} fill={WAIT_COLORS[entry.name] || COLORS.gray} />))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {waitTime.slice(0, 5).map(w => (
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
            <Gauge label="Buffer Cache Hit %" value={memory.bufferHit} thresholds={[92, 85]} />
            <Gauge label="PGA Used %" value={(memory.pgaUsed / memory.pgaMax) * 100} />
          </div>
        </div>
      )}

      {tab === 'storage' && (
        <div className="space-y-4">
          <Panel title="Tablespace Usage">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              {tablespaces.map((ts, i) => (<TablespaceBar key={i} name={ts.name} pct={ts.pct} used={ts.used} max={ts.max} />))}
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
                  {resources.map((r, i) => {
                    const pct = (r.current / r.limit) * 100;
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
                  {topSQL.map((sql, i) => (
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
            <StatCard label="Total SQL Analyzed" value={15234} color={COLORS.cyan} />
            <StatCard label="Tuning Recommendations" value={387} color={COLORS.purple} />
            <StatCard label="Applied Tunings" value={198} color={COLORS.green} />
            <StatCard label="Avg Improvement" value="18.5" unit="%" color={COLORS.orange} />
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center text-xs text-gray-600 mt-8 py-4 border-t border-gray-800">
        <p>TMS 2.0 • Oracle Database Performance Monitoring • 나래정보기술</p>
        <p className="mt-1">💡 Drag on ASH chart to analyze SQL • Select "ORCL_RAC1" for blocked session alerts</p>
      </footer>
      
      {/* SQL Modal */}
      <SQLDetailModal isOpen={sqlModalOpen} onClose={() => setSqlModalOpen(false)} startTime={selectedRange.start} endTime={selectedRange.end} sqlData={selectedSQLData} />
    </div>
  );
}
