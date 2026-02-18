import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis, Legend } from 'recharts';

// ============================================
// TMS 2.0 Oracle Enterprise Dashboard
// SQL Cluster Analysis & Grading System
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

// SQL Grade Colors & Definitions
const SQL_GRADES = {
  A: { color: '#10b981', bgColor: '#10b98120', label: 'Excellent', description: '최적화된 SQL', criteria: 'Elapsed/Exec < 0.01s, Buffer/Exec < 100' },
  B: { color: '#22d3ee', bgColor: '#22d3ee20', label: 'Good', description: '양호한 SQL', criteria: 'Elapsed/Exec < 0.1s, Buffer/Exec < 1,000' },
  C: { color: '#3b82f6', bgColor: '#3b82f620', label: 'Average', description: '보통 수준', criteria: 'Elapsed/Exec < 1s, Buffer/Exec < 10,000' },
  D: { color: '#f59e0b', bgColor: '#f59e0b20', label: 'Warning', description: '주의 필요', criteria: 'Elapsed/Exec < 5s, Buffer/Exec < 50,000' },
  E: { color: '#f97316', bgColor: '#f9731620', label: 'Poor', description: '튜닝 권장', criteria: 'Elapsed/Exec < 30s, Buffer/Exec < 500,000' },
  F: { color: '#ef4444', bgColor: '#ef444420', label: 'Critical', description: '즉시 튜닝 필요', criteria: 'Elapsed/Exec >= 30s or Buffer/Exec >= 500,000' },
};

// ============================================
// SQL Grade Calculation
// ============================================
const calculateSQLGrade = (sql) => {
  const elapsedPerExec = sql.elapsedSec / Math.max(sql.executions, 1);
  const bufferPerExec = sql.bufferGets / Math.max(sql.executions, 1);
  const cpuRatio = sql.cpuSec / Math.max(sql.elapsedSec, 0.001);
  
  // Scoring system (0-100)
  let score = 100;
  
  // Elapsed time penalty
  if (elapsedPerExec >= 30) score -= 50;
  else if (elapsedPerExec >= 5) score -= 35;
  else if (elapsedPerExec >= 1) score -= 25;
  else if (elapsedPerExec >= 0.1) score -= 15;
  else if (elapsedPerExec >= 0.01) score -= 5;
  
  // Buffer gets penalty
  if (bufferPerExec >= 500000) score -= 30;
  else if (bufferPerExec >= 50000) score -= 20;
  else if (bufferPerExec >= 10000) score -= 15;
  else if (bufferPerExec >= 1000) score -= 10;
  else if (bufferPerExec >= 100) score -= 5;
  
  // Disk reads penalty
  const diskRatio = sql.diskReads / Math.max(sql.bufferGets, 1);
  if (diskRatio > 0.1) score -= 10;
  else if (diskRatio > 0.05) score -= 5;
  
  // CPU efficiency bonus
  if (cpuRatio > 0.8) score += 5;
  
  // Determine grade
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  if (score >= 20) return 'E';
  return 'F';
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
  cpu: { host: Math.random() * 40 + 30, db: Math.random() * 30 + 15 },
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
});

// Generate SQL data with grades for cluster chart
const generateSQLClusterData = () => {
  const modules = ['TMS_ANALYZER', 'TMS_COLLECTOR', 'TMS_REPORT', 'TMS_BATCH', 'TMS_API', 'JDBC Thin', 'SQL*Plus', 'PL/SQL Dev'];
  const waitClasses = ['CPU', 'User I/O', 'System I/O', 'Concurrency', 'Application'];
  
  const sqlData = [];
  
  // Grade A - Excellent (많은 실행, 낮은 비용)
  for (let i = 0; i < 15; i++) {
    sqlData.push({
      sqlId: `a${String(i).padStart(3, '0')}${Math.random().toString(36).substr(2, 6)}`,
      executions: Math.floor(Math.random() * 50000) + 10000,
      elapsedSec: Math.random() * 50 + 5,
      cpuSec: Math.random() * 40 + 4,
      bufferGets: Math.floor(Math.random() * 500000) + 50000,
      diskReads: Math.floor(Math.random() * 5000) + 500,
      rows: Math.floor(Math.random() * 100000) + 10000,
      module: modules[Math.floor(Math.random() * modules.length)],
      waitClass: waitClasses[Math.floor(Math.random() * waitClasses.length)],
    });
  }
  
  // Grade B - Good
  for (let i = 0; i < 12; i++) {
    sqlData.push({
      sqlId: `b${String(i).padStart(3, '0')}${Math.random().toString(36).substr(2, 6)}`,
      executions: Math.floor(Math.random() * 20000) + 5000,
      elapsedSec: Math.random() * 200 + 50,
      cpuSec: Math.random() * 150 + 40,
      bufferGets: Math.floor(Math.random() * 2000000) + 200000,
      diskReads: Math.floor(Math.random() * 20000) + 2000,
      rows: Math.floor(Math.random() * 50000) + 5000,
      module: modules[Math.floor(Math.random() * modules.length)],
      waitClass: waitClasses[Math.floor(Math.random() * waitClasses.length)],
    });
  }
  
  // Grade C - Average
  for (let i = 0; i < 10; i++) {
    sqlData.push({
      sqlId: `c${String(i).padStart(3, '0')}${Math.random().toString(36).substr(2, 6)}`,
      executions: Math.floor(Math.random() * 5000) + 1000,
      elapsedSec: Math.random() * 500 + 100,
      cpuSec: Math.random() * 300 + 50,
      bufferGets: Math.floor(Math.random() * 5000000) + 500000,
      diskReads: Math.floor(Math.random() * 100000) + 10000,
      rows: Math.floor(Math.random() * 20000) + 2000,
      module: modules[Math.floor(Math.random() * modules.length)],
      waitClass: waitClasses[Math.floor(Math.random() * waitClasses.length)],
    });
  }
  
  // Grade D - Warning
  for (let i = 0; i < 8; i++) {
    sqlData.push({
      sqlId: `d${String(i).padStart(3, '0')}${Math.random().toString(36).substr(2, 6)}`,
      executions: Math.floor(Math.random() * 1000) + 100,
      elapsedSec: Math.random() * 1000 + 200,
      cpuSec: Math.random() * 500 + 100,
      bufferGets: Math.floor(Math.random() * 10000000) + 1000000,
      diskReads: Math.floor(Math.random() * 500000) + 50000,
      rows: Math.floor(Math.random() * 10000) + 1000,
      module: modules[Math.floor(Math.random() * modules.length)],
      waitClass: waitClasses[Math.floor(Math.random() * waitClasses.length)],
    });
  }
  
  // Grade E - Poor
  for (let i = 0; i < 5; i++) {
    sqlData.push({
      sqlId: `e${String(i).padStart(3, '0')}${Math.random().toString(36).substr(2, 6)}`,
      executions: Math.floor(Math.random() * 200) + 20,
      elapsedSec: Math.random() * 2000 + 500,
      cpuSec: Math.random() * 1000 + 200,
      bufferGets: Math.floor(Math.random() * 30000000) + 5000000,
      diskReads: Math.floor(Math.random() * 2000000) + 200000,
      rows: Math.floor(Math.random() * 5000) + 500,
      module: modules[Math.floor(Math.random() * modules.length)],
      waitClass: waitClasses[Math.floor(Math.random() * waitClasses.length)],
    });
  }
  
  // Grade F - Critical
  for (let i = 0; i < 3; i++) {
    sqlData.push({
      sqlId: `f${String(i).padStart(3, '0')}${Math.random().toString(36).substr(2, 6)}`,
      executions: Math.floor(Math.random() * 50) + 5,
      elapsedSec: Math.random() * 5000 + 1000,
      cpuSec: Math.random() * 2000 + 500,
      bufferGets: Math.floor(Math.random() * 100000000) + 10000000,
      diskReads: Math.floor(Math.random() * 10000000) + 1000000,
      rows: Math.floor(Math.random() * 1000) + 100,
      module: modules[Math.floor(Math.random() * modules.length)],
      waitClass: waitClasses[Math.floor(Math.random() * waitClasses.length)],
    });
  }
  
  // Calculate derived metrics and grade
  return sqlData.map((sql, idx) => {
    const grade = calculateSQLGrade(sql);
    const elapsedPerExec = sql.elapsedSec / Math.max(sql.executions, 1);
    const bufferPerExec = sql.bufferGets / Math.max(sql.executions, 1);
    
    return {
      ...sql,
      id: idx,
      grade,
      gradeColor: SQL_GRADES[grade].color,
      elapsedPerExec,
      bufferPerExec,
      // For scatter chart - log scale for better visualization
      x: Math.log10(Math.max(elapsedPerExec, 0.0001) * 1000), // ms log scale
      y: Math.log10(Math.max(bufferPerExec, 1)), // buffer log scale
      z: Math.log10(Math.max(sql.executions, 1)) * 100, // bubble size
    };
  });
};

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

const generateSQLForTimeRange = (startTime, endTime) => {
  const sqlList = [
    { sqlId: 'g3p8k2n5vz1x', sqlText: 'SELECT * FROM TMS_SQL_HISTORY WHERE analyze_date > :1', module: 'TMS_ANALYZER', action: 'ANALYZE', username: 'TMS_APP', waitClass: 'CPU' },
    { sqlId: 'f7h2m9q4wy6b', sqlText: 'INSERT INTO TMS_METRICS (metric_id, value, collect_time) VALUES (:1, :2, :3)', module: 'TMS_COLLECTOR', action: 'COLLECT', username: 'TMS_APP', waitClass: 'User I/O' },
    { sqlId: 'a1c5x8j3tr9e', sqlText: 'SELECT sql_id, elapsed_time, executions FROM V$SQL WHERE elapsed_time > 1000000', module: 'TMS_REPORT', action: 'REPORT_GEN', username: 'REPORT_USER', waitClass: 'CPU' },
    { sqlId: 'k9l4p7s2ub8d', sqlText: 'UPDATE TMS_JOB_STATUS SET status = :1, end_time = SYSDATE WHERE job_id = :2', module: 'TMS_BATCH', action: 'JOB_UPDATE', username: 'BATCH_USER', waitClass: 'Concurrency' },
    { sqlId: 'm2n6q1w5vc3f', sqlText: 'SELECT COUNT(*) FROM TMS_ALERTS WHERE alert_status = \'OPEN\'', module: 'TMS_API', action: 'GET_ALERTS', username: 'API_USER', waitClass: 'User I/O' },
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
    </div>
  );
};

const AlertBanner = ({ sessions }) => {
  if (sessions.length === 0) return null;
  return (
    <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
        <span className="text-red-400 font-semibold">⚠️ {sessions.length} Blocked Session(s)</span>
      </div>
      <div className="space-y-2">
        {sessions.map((s, i) => (
          <div key={i} className="bg-gray-900/50 rounded p-2 text-sm flex flex-wrap gap-x-4">
            <span><span className="text-gray-500">SID:</span> <span className="text-red-400 font-mono">{s.sid}</span></span>
            <span><span className="text-gray-500">User:</span> <span className="text-white">{s.username}</span></span>
            <span><span className="text-gray-500">Wait:</span> <span className="text-yellow-400">{s.waitSec}s</span></span>
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
      {actions}
    </div>
    <div className="p-4">{children}</div>
  </div>
);

// Grade Badge Component
const GradeBadge = ({ grade, size = 'normal' }) => {
  const gradeInfo = SQL_GRADES[grade];
  const sizeClasses = size === 'large' ? 'w-10 h-10 text-lg' : size === 'small' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm';
  
  return (
    <div 
      className={`${sizeClasses} rounded-lg flex items-center justify-center font-bold`}
      style={{ backgroundColor: gradeInfo.bgColor, color: gradeInfo.color, border: `2px solid ${gradeInfo.color}` }}
    >
      {grade}
    </div>
  );
};

// SQL Detail Modal
const SQLDetailModal = ({ isOpen, onClose, startTime, endTime, sqlData }) => {
  if (!isOpen) return null;
  const formatTime = (ts) => new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-5xl max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-700 bg-gray-800/50 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-white">📊 SQL Activity Analysis</h2>
            <p className="text-sm text-gray-400">{formatTime(startTime)} → {formatTime(endTime)}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white">✕</button>
        </div>
        <div className="overflow-auto max-h-[60vh] p-4">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 sticky top-0">
              <tr>
                <th className="text-left py-2 px-3 text-gray-400">#</th>
                <th className="text-left py-2 px-3 text-gray-400">SQL ID</th>
                <th className="text-left py-2 px-3 text-gray-400">Module</th>
                <th className="text-right py-2 px-3 text-gray-400">Execs</th>
                <th className="text-right py-2 px-3 text-gray-400">Elapsed</th>
              </tr>
            </thead>
            <tbody>
              {sqlData.map((sql, i) => (
                <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="py-2 px-3 text-gray-500">{sql.rank}</td>
                  <td className="py-2 px-3 text-cyan-400 font-mono text-xs">{sql.sqlId}</td>
                  <td className="py-2 px-3 text-green-400 text-xs">{sql.module}</td>
                  <td className="py-2 px-3 text-right text-white">{sql.executions.toLocaleString()}</td>
                  <td className="py-2 px-3 text-right text-yellow-400">{sql.elapsedSec.toFixed(1)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-gray-700 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg">Close</button>
        </div>
      </div>
    </div>
  );
};

// SQL Cluster Detail Modal
const SQLClusterDetailModal = ({ isOpen, onClose, sql }) => {
  if (!isOpen || !sql) return null;
  
  const gradeInfo = SQL_GRADES[sql.grade];
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-700 bg-gray-800/50 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <GradeBadge grade={sql.grade} size="large" />
            <div>
              <h2 className="text-lg font-bold text-white">SQL Detail</h2>
              <p className="text-sm text-gray-400 font-mono">{sql.sqlId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white">✕</button>
        </div>
        
        <div className="p-6 space-y-4">
          {/* Grade Info */}
          <div className="p-4 rounded-lg" style={{ backgroundColor: gradeInfo.bgColor, border: `1px solid ${gradeInfo.color}40` }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg font-bold" style={{ color: gradeInfo.color }}>Grade {sql.grade}: {gradeInfo.label}</span>
            </div>
            <p className="text-sm text-gray-300">{gradeInfo.description}</p>
            <p className="text-xs text-gray-400 mt-1">기준: {gradeInfo.criteria}</p>
          </div>
          
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-400">Executions</div>
              <div className="text-xl font-bold text-white">{sql.executions.toLocaleString()}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-400">Total Elapsed</div>
              <div className="text-xl font-bold text-yellow-400">{sql.elapsedSec.toFixed(2)}s</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-400">Elapsed/Exec</div>
              <div className="text-xl font-bold text-orange-400">{(sql.elapsedPerExec * 1000).toFixed(2)}ms</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-400">CPU Time</div>
              <div className="text-xl font-bold text-green-400">{sql.cpuSec.toFixed(2)}s</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-400">Buffer Gets</div>
              <div className="text-xl font-bold text-purple-400">{sql.bufferGets.toLocaleString()}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-400">Buffer/Exec</div>
              <div className="text-xl font-bold text-blue-400">{Math.round(sql.bufferPerExec).toLocaleString()}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-400">Disk Reads</div>
              <div className="text-xl font-bold text-red-400">{sql.diskReads.toLocaleString()}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-400">Rows Processed</div>
              <div className="text-xl font-bold text-cyan-400">{sql.rows.toLocaleString()}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-400">Module</div>
              <div className="text-lg font-bold text-green-400">{sql.module}</div>
            </div>
          </div>
          
          {/* Recommendations */}
          {(sql.grade === 'E' || sql.grade === 'F') && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
              <h4 className="text-red-400 font-semibold mb-2">⚠️ 튜닝 권장사항</h4>
              <ul className="text-sm text-gray-300 space-y-1">
                {sql.bufferPerExec > 10000 && <li>• Buffer Gets/Exec가 높음 - 인덱스 검토 필요</li>}
                {sql.elapsedPerExec > 1 && <li>• 실행당 경과시간이 김 - 실행계획 분석 필요</li>}
                {sql.diskReads / sql.bufferGets > 0.1 && <li>• 물리적 I/O 비율이 높음 - 메모리 캐싱 검토</li>}
                <li>• SQL Advisor 실행 권장</li>
              </ul>
            </div>
          )}
        </div>
        
        <div className="px-6 py-4 border-t border-gray-700 flex justify-between">
          <button className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg">
            🔍 View Execution Plan
          </button>
          <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg">Close</button>
        </div>
      </div>
    </div>
  );
};

// Draggable ASH Chart
const DraggableASHChart = ({ data, onRangeSelect }) => {
  const containerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const [selection, setSelection] = useState(null);
  const CHART_PADDING = { left: 60, right: 20, top: 20, bottom: 30 };
  
  const getPositionFromEvent = (e) => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, width: rect.width };
  };
  
  const getDataIndexFromX = (x, width) => {
    const chartWidth = width - CHART_PADDING.left - CHART_PADDING.right;
    const relativeX = x - CHART_PADDING.left;
    return Math.max(0, Math.min(data.length - 1, Math.round((relativeX / chartWidth) * (data.length - 1))));
  };
  
  const handleMouseDown = (e) => {
    const pos = getPositionFromEvent(e);
    if (pos && pos.x >= CHART_PADDING.left && pos.x <= pos.width - CHART_PADDING.right) {
      setIsDragging(true);
      setDragStart(pos.x);
      setDragEnd(pos.x);
      setSelection(null);
    }
  };
  
  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const pos = getPositionFromEvent(e);
    if (pos) setDragEnd(Math.max(CHART_PADDING.left, Math.min(pos.width - CHART_PADDING.right, pos.x)));
  };
  
  const handleMouseUp = () => {
    if (isDragging && containerRef.current && dragStart !== null && dragEnd !== null && Math.abs(dragEnd - dragStart) > 10) {
      const width = containerRef.current.getBoundingClientRect().width;
      const startIdx = getDataIndexFromX(Math.min(dragStart, dragEnd), width);
      const endIdx = getDataIndexFromX(Math.max(dragStart, dragEnd), width);
      if (startIdx !== endIdx && data[startIdx] && data[endIdx]) {
        setSelection({ startX: Math.min(dragStart, dragEnd), endX: Math.max(dragStart, dragEnd), startIdx, endIdx });
        onRangeSelect(data[startIdx].timestamp, data[endIdx].timestamp);
      }
    }
    setIsDragging(false);
  };
  
  const overlayStyle = isDragging && dragStart !== null && dragEnd !== null
    ? { left: Math.min(dragStart, dragEnd), width: Math.abs(dragEnd - dragStart), opacity: 1 }
    : selection ? { left: selection.startX, width: selection.endX - selection.startX, opacity: 1 } : { opacity: 0 };

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 bg-gray-700/50 px-2 py-1 rounded">🖱️ Drag to select</span>
        {selection && <button onClick={() => setSelection(null)} className="text-xs text-red-400 bg-red-400/10 px-2 py-1 rounded">✕ Clear</button>}
      </div>
      <div ref={containerRef} className="relative select-none" style={{ height: 250, cursor: 'crosshair' }} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={() => isDragging && setIsDragging(false)}>
        <div className="absolute pointer-events-none z-10" style={{ ...overlayStyle, top: CHART_PADDING.top, bottom: CHART_PADDING.bottom, backgroundColor: 'rgba(249, 115, 22, 0.3)', borderLeft: overlayStyle.opacity ? '2px solid #f97316' : 'none', borderRight: overlayStyle.opacity ? '2px solid #f97316' : 'none' }} />
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 20, right: 20, left: 40, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="time" stroke="#6b7280" fontSize={10} />
            <YAxis stroke="#6b7280" fontSize={10} />
            <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
            {['CPU', 'User I/O', 'System I/O', 'Concurrency', 'Application', 'Other'].map(key => (
              <Area key={key} type="monotone" dataKey={key} stackId="1" stroke={WAIT_COLORS[key]} fill={WAIT_COLORS[key]} fillOpacity={0.8} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-3 mt-2 justify-center">
        {Object.entries(WAIT_COLORS).map(([name, color]) => (
          <div key={name} className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ backgroundColor: color }} /><span className="text-xs text-gray-400">{name}</span></div>
        ))}
      </div>
    </div>
  );
};

// Custom Scatter Tooltip
const ScatterTooltip = ({ active, payload }) => {
  if (!active || !payload || !payload[0]) return null;
  const sql = payload[0].payload;
  const gradeInfo = SQL_GRADES[sql.grade];
  
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl max-w-xs">
      <div className="flex items-center gap-2 mb-2">
        <GradeBadge grade={sql.grade} size="small" />
        <span className="text-cyan-400 font-mono text-sm">{sql.sqlId}</span>
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex justify-between"><span className="text-gray-400">Executions:</span><span className="text-white">{sql.executions.toLocaleString()}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Elapsed/Exec:</span><span className="text-yellow-400">{(sql.elapsedPerExec * 1000).toFixed(2)}ms</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Buffer/Exec:</span><span className="text-purple-400">{Math.round(sql.bufferPerExec).toLocaleString()}</span></div>
        <div className="flex justify-between"><span className="text-gray-400">Module:</span><span className="text-green-400">{sql.module}</span></div>
      </div>
      <div className="mt-2 pt-2 border-t border-gray-700 text-xs text-gray-500">Click for details</div>
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
  const [sqlClusterData, setSqlClusterData] = useState(() => generateSQLClusterData());
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [tab, setTab] = useState('overview');
  
  const [sqlModalOpen, setSqlModalOpen] = useState(false);
  const [selectedRange, setSelectedRange] = useState({ start: null, end: null });
  const [selectedSQLData, setSelectedSQLData] = useState([]);
  
  const [selectedSQL, setSelectedSQL] = useState(null);
  const [sqlDetailModalOpen, setSqlDetailModalOpen] = useState(false);
  const [selectedGradeFilter, setSelectedGradeFilter] = useState('ALL');

  const hasBlocked = instance === 'ORCL_RAC1';

  useEffect(() => {
    const interval = setInterval(() => {
      setData(generateData(hasBlocked));
      setASHData(prev => {
        const newPoint = { time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }), timestamp: Date.now(), 'CPU': Math.random() * 3 + 1.5, 'User I/O': Math.random() * 2.5 + 1, 'System I/O': Math.random() * 1.5 + 0.5, 'Concurrency': Math.random() * 1 + 0.2, 'Application': Math.random() * 0.8 + 0.1, 'Other': Math.random() * 0.5 + 0.1 };
        return [...prev.slice(1), newPoint].map((d, i) => ({ ...d, index: i }));
      });
      setLastUpdate(new Date());
    }, 5000);
    return () => clearInterval(interval);
  }, [hasBlocked]);

  const handleRangeSelect = useCallback((startTime, endTime) => {
    setSelectedRange({ start: startTime, end: endTime });
    setSelectedSQLData(generateSQLForTimeRange(startTime, endTime));
    setSqlModalOpen(true);
  }, []);
  
  const handleScatterClick = (data) => {
    if (data && data.payload) {
      setSelectedSQL(data.payload);
      setSqlDetailModalOpen(true);
    }
  };

  // Grade statistics
  const gradeStats = sqlClusterData.reduce((acc, sql) => {
    acc[sql.grade] = (acc[sql.grade] || 0) + 1;
    return acc;
  }, {});
  
  // Filtered data for scatter chart
  const filteredClusterData = selectedGradeFilter === 'ALL' 
    ? sqlClusterData 
    : sqlClusterData.filter(sql => sql.grade === selectedGradeFilter);

  const { sessions, activity, cpu, memory, io, waitTime, tablespaces, resources, blockedSessions } = data;

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
              <p className="text-xs text-gray-500">SQL Cluster Analysis & Grading System</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select value={instance} onChange={(e) => setInstance(e.target.value)} className="bg-gray-800 text-cyan-400 text-sm px-3 py-1.5 rounded border border-gray-700">
              {INSTANCES.map(i => (<option key={i.id} value={i.id}>{i.name}</option>))}
            </select>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{lastUpdate.toLocaleTimeString('ko-KR')}</span>
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            </div>
          </div>
        </div>
        <div className="flex gap-1 mt-4 border-b border-gray-700">
          {['overview', 'performance', 'storage', 'sql'].map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium capitalize ${tab === t ? 'text-orange-500 border-b-2 border-orange-500' : 'text-gray-400 hover:text-white'}`}>{t}</button>
          ))}
        </div>
      </header>

      <AlertBanner sessions={blockedSessions} />

      {/* Tab Content */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Active Sessions" value={sessions.active} subtitle={`of ${sessions.total}`} color={COLORS.cyan} />
            <StatCard label="Blocked" value={sessions.blocked} color={sessions.blocked > 0 ? COLORS.red : COLORS.green} />
            <StatCard label="Commits/s" value={activity.commits} color={COLORS.green} />
            <StatCard label="Executions/s" value={activity.executions} color={COLORS.purple} />
            <StatCard label="Physical Reads/s" value={activity.physicalReads} color={COLORS.orange} />
            <StatCard label="Parses/s" value={activity.parses} color={COLORS.blue} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Panel title="Active Session History" subtitle="Drag to analyze SQL" className="lg:col-span-2">
              <DraggableASHChart data={ashData} onRangeSelect={handleRangeSelect} />
            </Panel>
            <Panel title="Wait Time Distribution">
              <div style={{ height: 290 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={waitTime} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
                    <XAxis type="number" stroke="#6b7280" fontSize={10} />
                    <YAxis dataKey="name" type="category" stroke="#6b7280" fontSize={10} width={75} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>{waitTime.map((e, i) => (<Cell key={i} fill={WAIT_COLORS[e.name] || COLORS.gray} />))}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Gauge label="Host CPU" value={cpu.host} />
            <Gauge label="DB CPU" value={cpu.db} />
            <Gauge label="SGA Used" value={(memory.sgaUsed / memory.sgaMax) * 100} />
            <Gauge label="Buffer Hit" value={memory.bufferHit} thresholds={[90, 95]} />
          </div>
        </div>
      )}

      {tab === 'performance' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel title="Active Session History" subtitle="Drag to drill-down">
              <DraggableASHChart data={ashData} onRangeSelect={handleRangeSelect} />
            </Panel>
            <Panel title="Wait Events">
              <div style={{ height: 290 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={waitTime} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value">{waitTime.map((e, i) => (<Cell key={i} fill={WAIT_COLORS[e.name] || COLORS.gray} />))}</Pie><Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }} /></PieChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Gauge label="Host CPU %" value={cpu.host} />
            <Gauge label="DB CPU %" value={cpu.db} />
            <Gauge label="Buffer Hit %" value={memory.bufferHit} thresholds={[92, 85]} />
            <Gauge label="PGA Used %" value={(memory.pgaUsed / memory.pgaMax) * 100} />
          </div>
        </div>
      )}

      {tab === 'storage' && (
        <div className="space-y-4">
          <Panel title="Tablespace Usage">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">{tablespaces.map((ts, i) => (<TablespaceBar key={i} {...ts} />))}</div>
          </Panel>
          <Panel title="Resource Limits">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-700"><th className="text-left py-2 text-gray-400">Resource</th><th className="text-right py-2 text-gray-400">Current</th><th className="text-right py-2 text-gray-400">Limit</th><th className="text-right py-2 text-gray-400">%</th></tr></thead>
              <tbody>{resources.map((r, i) => { const pct = (r.current / r.limit) * 100; const color = pct >= 85 ? COLORS.red : pct >= 70 ? COLORS.yellow : COLORS.green; return (<tr key={i} className="border-b border-gray-800"><td className="py-2 text-white capitalize">{r.name.replace(/_/g, ' ')}</td><td className="py-2 text-right">{r.current.toLocaleString()}</td><td className="py-2 text-right text-gray-400">{r.limit.toLocaleString()}</td><td className="py-2 text-right font-medium" style={{ color }}>{pct.toFixed(1)}%</td></tr>); })}</tbody>
            </table>
          </Panel>
        </div>
      )}

      {tab === 'sql' && (
        <div className="space-y-4">
          {/* Grade Summary Cards */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {Object.entries(SQL_GRADES).map(([grade, info]) => (
              <button
                key={grade}
                onClick={() => setSelectedGradeFilter(selectedGradeFilter === grade ? 'ALL' : grade)}
                className={`p-3 rounded-lg border transition-all ${selectedGradeFilter === grade ? 'ring-2 ring-offset-2 ring-offset-gray-900' : ''}`}
                style={{ 
                  backgroundColor: info.bgColor, 
                  borderColor: `${info.color}40`,
                  ringColor: info.color
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <GradeBadge grade={grade} size="small" />
                  <span className="text-2xl font-bold" style={{ color: info.color }}>{gradeStats[grade] || 0}</span>
                </div>
                <div className="text-xs text-gray-400">{info.label}</div>
              </button>
            ))}
          </div>

          {/* SQL Cluster Distribution Chart */}
          <Panel 
            title="SQL Cluster Distribution" 
            subtitle="X: Elapsed Time/Exec (log), Y: Buffer Gets/Exec (log), Size: Executions"
            actions={
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Filter:</span>
                <select 
                  value={selectedGradeFilter} 
                  onChange={(e) => setSelectedGradeFilter(e.target.value)}
                  className="bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600"
                >
                  <option value="ALL">All Grades</option>
                  {Object.keys(SQL_GRADES).map(g => (<option key={g} value={g}>Grade {g}</option>))}
                </select>
                <span className="text-xs text-gray-500 ml-2">{filteredClusterData.length} SQLs</span>
              </div>
            }
          >
            <div style={{ height: 400 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis 
                    type="number" 
                    dataKey="x" 
                    name="Elapsed/Exec" 
                    stroke="#6b7280" 
                    fontSize={10}
                    label={{ value: 'Elapsed Time/Exec (ms, log scale)', position: 'bottom', fill: '#6b7280', fontSize: 10 }}
                    tickFormatter={(v) => `${Math.pow(10, v).toFixed(0)}`}
                  />
                  <YAxis 
                    type="number" 
                    dataKey="y" 
                    name="Buffer/Exec" 
                    stroke="#6b7280" 
                    fontSize={10}
                    label={{ value: 'Buffer Gets/Exec (log scale)', angle: -90, position: 'insideLeft', fill: '#6b7280', fontSize: 10 }}
                    tickFormatter={(v) => `${Math.pow(10, v).toFixed(0)}`}
                  />
                  <ZAxis type="number" dataKey="z" range={[50, 400]} />
                  <Tooltip content={<ScatterTooltip />} />
                  
                  {/* Render each grade as separate scatter for legend */}
                  {Object.entries(SQL_GRADES).map(([grade, info]) => {
                    const gradeData = filteredClusterData.filter(sql => sql.grade === grade);
                    if (gradeData.length === 0) return null;
                    return (
                      <Scatter 
                        key={grade}
                        name={`Grade ${grade}`}
                        data={gradeData}
                        fill={info.color}
                        onClick={handleScatterClick}
                        cursor="pointer"
                      />
                    );
                  })}
                  <Legend 
                    verticalAlign="top" 
                    height={36}
                    formatter={(value) => <span className="text-xs text-gray-400">{value}</span>}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            
            {/* Grade Legend */}
            <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-gray-700 justify-center">
              {Object.entries(SQL_GRADES).map(([grade, info]) => (
                <div key={grade} className="flex items-center gap-2">
                  <GradeBadge grade={grade} size="small" />
                  <span className="text-xs text-gray-400">{info.description}</span>
                </div>
              ))}
            </div>
          </Panel>

          {/* SQL List by Grade */}
          <Panel title="SQL List by Grade" subtitle="Click row to view details">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="bg-gray-900 sticky top-0">
                  <tr>
                    <th className="text-left py-2 px-3 text-gray-400">Grade</th>
                    <th className="text-left py-2 px-3 text-gray-400">SQL ID</th>
                    <th className="text-left py-2 px-3 text-gray-400">Module</th>
                    <th className="text-right py-2 px-3 text-gray-400">Executions</th>
                    <th className="text-right py-2 px-3 text-gray-400">Elapsed/Exec</th>
                    <th className="text-right py-2 px-3 text-gray-400">Buffer/Exec</th>
                    <th className="text-left py-2 px-3 text-gray-400">Wait Class</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClusterData
                    .sort((a, b) => {
                      const gradeOrder = { F: 0, E: 1, D: 2, C: 3, B: 4, A: 5 };
                      return gradeOrder[a.grade] - gradeOrder[b.grade];
                    })
                    .slice(0, 20)
                    .map((sql, i) => (
                      <tr 
                        key={i} 
                        className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer"
                        onClick={() => { setSelectedSQL(sql); setSqlDetailModalOpen(true); }}
                      >
                        <td className="py-2 px-3"><GradeBadge grade={sql.grade} size="small" /></td>
                        <td className="py-2 px-3 text-cyan-400 font-mono text-xs">{sql.sqlId}</td>
                        <td className="py-2 px-3 text-green-400 text-xs">{sql.module}</td>
                        <td className="py-2 px-3 text-right text-white">{sql.executions.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right text-yellow-400">{(sql.elapsedPerExec * 1000).toFixed(2)}ms</td>
                        <td className="py-2 px-3 text-right text-purple-400">{Math.round(sql.bufferPerExec).toLocaleString()}</td>
                        <td className="py-2 px-3">
                          <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: `${WAIT_COLORS[sql.waitClass]}20`, color: WAIT_COLORS[sql.waitClass] }}>
                            {sql.waitClass}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Grade Criteria Info */}
          <Panel title="SQL Grade Criteria" subtitle="등급 산정 기준">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(SQL_GRADES).map(([grade, info]) => (
                <div key={grade} className="p-3 rounded-lg border" style={{ backgroundColor: info.bgColor, borderColor: `${info.color}30` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <GradeBadge grade={grade} />
                    <div>
                      <span className="font-semibold" style={{ color: info.color }}>{info.label}</span>
                      <span className="text-gray-400 text-sm ml-2">{info.description}</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">{info.criteria}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center text-xs text-gray-600 mt-8 py-4 border-t border-gray-800">
        <p>TMS 2.0 • SQL Cluster Analysis & Grading • 나래정보기술</p>
      </footer>

      {/* Modals */}
      <SQLDetailModal isOpen={sqlModalOpen} onClose={() => setSqlModalOpen(false)} startTime={selectedRange.start} endTime={selectedRange.end} sqlData={selectedSQLData} />
      <SQLClusterDetailModal isOpen={sqlDetailModalOpen} onClose={() => setSqlDetailModalOpen(false)} sql={selectedSQL} />
    </div>
  );
}
