'use client';

/**
 * Realtime Monitoring Page
 * 실시간 SQL 모니터링
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Info } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSelectedDatabase } from '@/hooks/use-selected-database';

interface RealtimeSQL {
  sql_id: string;
  sql_text: string;
  executions: number;
  elapsed_time_ms: number;
  buffer_gets: number;
  disk_reads: number;
  rows_processed: number;
  status: 'CRITICAL' | 'WARNING' | 'NORMAL';
  connection_name: string;
}

export default function RealtimeMonitoringPage() {
  const { selectedConnectionId, selectedConnection } = useSelectedDatabase();
  const [selectedSqlId, setSelectedSqlId] = useState<string | null>(null);

  // 실시간 SQL 모니터링 (5초마다 갱신)
  const { data: sqlData, isLoading } = useQuery<RealtimeSQL[]>({
    queryKey: ['realtime-monitoring', selectedConnectionId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedConnectionId) {
        params.append('connection_id', selectedConnectionId);
      }
      const res = await fetch(`/api/monitoring/realtime?${params}`);
      if (!res.ok) throw new Error('Failed to fetch realtime data');
      const data = await res.json();
      return data.data || [];
    },
    refetchInterval: 5000, // 5초마다 자동 갱신
    enabled: !!selectedConnectionId, // 연결이 선택된 경우에만 쿼리 실행
  });

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">실시간 모니터링</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            현재 실행 중인 SQL을 실시간으로 모니터링합니다 (5초 자동 갱신)
          </p>
          {selectedConnection && (
            <p className="text-sm text-muted-foreground mt-1">
              연결: <span className="font-medium">{selectedConnection.name}</span> ({selectedConnection.host}:{selectedConnection.port})
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-green-500 animate-pulse" />
          <span className="text-sm text-muted-foreground">Live</span>
        </div>
      </div>

      {/* 실시간 SQL 목록 */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={`realtime-skeleton-${i}`} className="h-32 w-full" />
          ))}
        </div>
      ) : sqlData && sqlData.length > 0 ? (
        <div className="space-y-3">
          {sqlData.map((sql, index) => (
            <RealtimeSQLCard
              key={`realtime-${sql.sql_id}-${sql.session_id || ''}-${sql.sql_exec_id || ''}-${index}`}
              sql={sql}
              onSqlIdClick={() => setSelectedSqlId(sql.sql_id)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Activity className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">실행 중인 SQL이 없습니다.</p>
          </CardContent>
        </Card>
      )}

      {/* SQL 상세 정보 다이얼로그 */}
      {selectedSqlId && selectedConnectionId && (
        <SQLDetailDialog
          sqlId={selectedSqlId}
          connectionId={selectedConnectionId}
          open={!!selectedSqlId}
          onClose={() => setSelectedSqlId(null)}
        />
      )}
    </div>
  );
}

// 실시간 SQL 카드 컴포넌트
interface RealtimeSQLCardProps {
  sql: RealtimeSQL;
  onSqlIdClick: () => void;
}

function RealtimeSQLCard({ sql, onSqlIdClick }: RealtimeSQLCardProps) {
  const statusColors = {
    CRITICAL: 'destructive',
    WARNING: 'outline',
    NORMAL: 'default',
  } as const;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={onSqlIdClick}
                className="text-sm font-mono bg-muted px-2 py-0.5 rounded hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
              >
                {sql.sql_id}
              </button>
              <Badge variant={statusColors[sql.status]}>{sql.status}</Badge>
              <Badge variant="outline">{sql.connection_name}</Badge>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {sql.sql_text}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <div className="space-y-1">
            <div className="text-muted-foreground">Executions</div>
            <div className="font-semibold">{sql.executions.toLocaleString()}</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Elapsed (ms)</div>
            <div className="font-semibold">
              {sql.elapsed_time_ms.toLocaleString()}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Buffer Gets</div>
            <div className="font-semibold">{sql.buffer_gets.toLocaleString()}</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Disk Reads</div>
            <div className="font-semibold">{sql.disk_reads.toLocaleString()}</div>
          </div>
          <div className="space-y-1">
            <div className="text-muted-foreground">Rows</div>
            <div className="font-semibold">{sql.rows_processed.toLocaleString()}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// SQL 상세 정보 다이얼로그
interface SQLDetailDialogProps {
  sqlId: string;
  connectionId: string;
  open: boolean;
  onClose: () => void;
}

function SQLDetailDialog({
  sqlId,
  connectionId,
  open,
  onClose,
}: SQLDetailDialogProps) {
  const { data: detailData, isLoading } = useQuery({
    queryKey: ['sql-detail', sqlId, connectionId],
    queryFn: async () => {
      const params = new URLSearchParams({
        connection_id: connectionId,
        sql_id: sqlId,
      });
      const res = await fetch(`/api/monitoring/sql-detail?${params}`);
      if (!res.ok) throw new Error('Failed to fetch SQL detail');
      const data = await res.json();
      return data.data;
    },
    enabled: open && !!sqlId && !!connectionId,
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            SQL 상세 정보
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : detailData ? (
          <div className="space-y-6">
            {/* SQL 기본 정보 */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">기본 정보</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div className="space-y-1">
                  <div className="text-muted-foreground">SQL ID</div>
                  <code className="font-mono text-sm bg-muted px-2 py-1 rounded block">
                    {detailData.sql_info.sql_id}
                  </code>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Schema</div>
                  <div className="font-medium">{detailData.sql_info.schema_name}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Module</div>
                  <div className="font-medium">{detailData.sql_info.module || 'N/A'}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">실행 횟수</div>
                  <div className="font-medium">
                    {detailData.sql_info.executions.toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">총 경과 시간 (ms)</div>
                  <div className="font-medium">
                    {detailData.sql_info.elapsed_time_ms.toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">평균 경과 시간 (ms)</div>
                  <div className="font-medium">
                    {detailData.sql_info.avg_elapsed_ms.toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">총 CPU 시간 (ms)</div>
                  <div className="font-medium">
                    {detailData.sql_info.cpu_time_ms.toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">평균 CPU 시간 (ms)</div>
                  <div className="font-medium">
                    {detailData.sql_info.avg_cpu_ms.toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Optimizer Mode</div>
                  <div className="font-medium">{detailData.sql_info.optimizer_mode}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Buffer Gets</div>
                  <div className="font-medium">
                    {detailData.sql_info.buffer_gets.toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">평균 Buffer Gets</div>
                  <div className="font-medium">
                    {detailData.sql_info.avg_buffer_gets.toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Disk Reads</div>
                  <div className="font-medium">
                    {detailData.sql_info.disk_reads.toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">평균 Disk Reads</div>
                  <div className="font-medium">
                    {detailData.sql_info.avg_disk_reads.toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">Rows Processed</div>
                  <div className="font-medium">
                    {detailData.sql_info.rows_processed.toLocaleString()}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground">평균 Rows Processed</div>
                  <div className="font-medium">
                    {detailData.sql_info.avg_rows_processed.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* SQL 텍스트 */}
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">SQL 텍스트</h3>
              <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                {detailData.sql_info.sql_text}
              </pre>
            </div>

            {/* 실행계획 */}
            {detailData.execution_plan && detailData.execution_plan.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">실행 계획</h3>
                <div className="bg-muted p-4 rounded-lg overflow-x-auto">
                  <table className="w-full text-sm font-mono">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2">ID</th>
                        <th className="text-left py-2 px-2">Operation</th>
                        <th className="text-left py-2 px-2">Object</th>
                        <th className="text-right py-2 px-2">Rows</th>
                        <th className="text-right py-2 px-2">Cost</th>
                        <th className="text-right py-2 px-2">CPU Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.execution_plan.map((step: any) => (
                        <tr key={step.id} className="border-b">
                          <td className="py-2 px-2">{step.id}</td>
                          <td className="py-2 px-2">
                            {'  '.repeat(step.id || 0)}
                            {step.operation} {step.options}
                          </td>
                          <td className="py-2 px-2">{step.object_name || '-'}</td>
                          <td className="py-2 px-2 text-right">
                            {step.cardinality?.toLocaleString() || '-'}
                          </td>
                          <td className="py-2 px-2 text-right">
                            {step.cost?.toLocaleString() || '-'}
                          </td>
                          <td className="py-2 px-2 text-right">
                            {step.cpu_cost?.toLocaleString() || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Bind 변수 */}
            {detailData.bind_variables && detailData.bind_variables.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Bind 변수</h3>
                <div className="bg-muted p-4 rounded-lg">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2">Name</th>
                        <th className="text-left py-2 px-2">Position</th>
                        <th className="text-left py-2 px-2">Data Type</th>
                        <th className="text-left py-2 px-2">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.bind_variables.map((bind: any, idx: number) => (
                        <tr key={`bind-var-realtime-${bind.name || ''}-${bind.position || idx}-${bind.datatype || ''}-${idx}`} className="border-b">
                          <td className="py-2 px-2 font-mono">{bind.name}</td>
                          <td className="py-2 px-2">{bind.position}</td>
                          <td className="py-2 px-2">{bind.datatype}</td>
                          <td className="py-2 px-2 font-mono">{bind.value || 'NULL'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            SQL 정보를 찾을 수 없습니다.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
