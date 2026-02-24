'use client';

import { useEffect, useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Database, AlertCircle, RefreshCw, Server, User } from 'lucide-react';
import { useDatabaseStore } from '@/lib/stores/database-store';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

function DatabaseSelectorInner() {
  const queryClient = useQueryClient();
  const { connections, selectedConnectionId, selectConnection, setConnections, updateConnectionHealth } =
    useDatabaseStore();
  const healthCheckExecutedRef = useRef(false);

  // React Query로 데이터베이스 연결 목록 조회 (전용 키 사용 - 다른 페이지의 queryFn과 형식 충돌 방지)
  const { data: connectionsData, isLoading } = useQuery({
    queryKey: ['database-selector-connections'],
    queryFn: async ({ signal }) => {
      try {
        const response = await fetch('/api/oracle/connections', {
          signal,
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error('Failed to fetch connections');
        }
        const data = await response.json();

        const formattedConnections = data.map((conn: any) => {
          // Normalize health_status: convert to uppercase if exists, otherwise 'UNKNOWN'
          const rawStatus = conn.health_status;
          const normalizedHealthStatus = (rawStatus && typeof rawStatus === 'string')
            ? rawStatus.toUpperCase()
            : 'UNKNOWN';

          return {
            id: conn.id,
            name: conn.name,
            description: conn.description,
            host: conn.host,
            port: conn.port,
            serviceName: conn.service_name,
            sid: conn.sid,
            username: conn.username,
            connectionType: conn.connection_type,
            oracleVersion: conn.oracle_version,
            oracleEdition: conn.oracle_edition,
            isActive: conn.is_active,
            isDefault: conn.is_default,
            healthStatus: normalizedHealthStatus,
            lastConnectedAt: conn.last_connected_at,
          };
        });

        // Deduplicate connections by ID
        return Array.from(
          new Map(formattedConnections.map((conn: any) => [conn.id, conn])).values()
        );
      } catch (error: any) {
        // AbortError는 정상적인 취소이므로 로깅하지 않음
        if (error?.name === 'AbortError') {
          return [];
        }
        console.error('Failed to fetch connections:', error);
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // React Query 데이터를 Zustand 스토어에 동기화 (connectionsData 변경 시에만 실행)
  useEffect(() => {
    if (!connectionsData) return;

    // Zustand 스토어에 connections 동기화 (selectedConnectionId는 변경하지 않음)
    setConnections(connectionsData as any);

    // 저장된 선택 ID 복원 (stale ID 검증 포함) - store에서 최신 값 직접 읽기
    const currentId = useDatabaseStore.getState().selectedConnectionId;
    const isCurrentValid = currentId && connectionsData.some((c: any) => c.id === currentId);

    if (!isCurrentValid && connectionsData.length > 0) {
      const savedId = localStorage.getItem('selected-database-id');
      const savedConnection = savedId ? connectionsData.find((c: any) => c.id === savedId) : null;
      if (savedConnection) {
        selectConnection(savedId!);
      } else {
        const defaultConnection = connectionsData.find((c: any) => c.isDefault) || connectionsData[0];
        if (defaultConnection) {
          selectConnection((defaultConnection as any).id);
        }
      }
    }

    // health_status가 없거나 UNKNOWN인 연결들에 대해 자동 health check 실행
    if (!healthCheckExecutedRef.current) {
      const connectionsNeedingHealthCheck = (connectionsData as any[]).filter(
        (c: any) => c.healthStatus === 'UNKNOWN'
      );

      if (connectionsNeedingHealthCheck.length > 0) {
        healthCheckExecutedRef.current = true;

        Promise.all(
          connectionsNeedingHealthCheck.map(async (conn: any) => {
            try {
              const response = await fetch(`/api/oracle/connections/${conn.id}/health`);
              const result = await response.json();
              if (result?.data) {
                const newStatus = result.data.isHealthy ? 'HEALTHY' : 'ERROR';
                updateConnectionHealth(conn.id, newStatus as any, result.data.version);
              }
              return result;
            } catch (error) {
              console.error(`[DatabaseSelector] Health check failed for ${conn.name}:`, error);
              updateConnectionHealth(conn.id, 'ERROR');
              return null;
            }
          })
        ).then(() => {
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['database-selector-connections'] });
          }, 1000);
        });
      }
    }
  }, [connectionsData, setConnections, selectConnection, updateConnectionHealth, queryClient]);

  // React Query 데이터를 직접 사용하여 렌더링 (Zustand 동기화 지연 방지)
  const displayConnections = (connectionsData as any[] || connections || []) as any[];
  const selectedConnection = displayConnections.find((conn: any) => conn.id === selectedConnectionId);

  const fetchConnections = () => {
    healthCheckExecutedRef.current = false;
    queryClient.invalidateQueries({ queryKey: ['database-selector-connections'] });
  };

  const getHealthStatusBadge = (status?: string) => {
    const normalizedStatus = (status && typeof status === 'string') ? status.toUpperCase() : 'UNKNOWN';
    switch (normalizedStatus) {
      case 'HEALTHY':
        return (
          <Badge variant="default" className="bg-green-500 hover:bg-green-600 text-white text-xs border-0">
            ✓ HEALTHY
          </Badge>
        );
      case 'DEGRADED':
        return (
          <Badge variant="secondary" className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs border-0">
            ⚠ DEGRADED
          </Badge>
        );
      case 'ERROR':
      case 'UNHEALTHY':
        return (
          <Badge variant="destructive" className="text-xs">
            ✗ ERROR
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs">
            ? UNKNOWN
          </Badge>
        );
    }
  };

  const getConnectionTypeBadge = (type: string) => {
    if (type === 'SERVICE_NAME') {
      return (
        <Badge variant="secondary" className="bg-purple-100 text-purple-700 hover:bg-purple-200 text-xs border-0">
          PRIMARY
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-xs">
        SID
      </Badge>
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white min-w-[200px]"
        >
          <Database className="h-4 w-4" />
          <span className="hidden sm:inline truncate">
            {selectedConnection?.name || '데이터베이스 선택'}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[500px]">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">데이터베이스 연결</DropdownMenuLabel>
          <Button variant="ghost" size="sm" onClick={fetchConnections} disabled={isLoading} className="h-6 w-6 p-0">
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <DropdownMenuSeparator />

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <RefreshCw className="h-8 w-8 text-muted-foreground mb-2 animate-spin" />
            <p className="text-sm text-muted-foreground">데이터베이스 목록을 불러오는 중...</p>
          </div>
        ) : !displayConnections || displayConnections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">연결된 데이터베이스가 없습니다</p>
          </div>
        ) : (
          <>
            {displayConnections.map((connection: any) => (
                <DropdownMenuItem
                  key={`conn-${connection.id}`}
                  onClick={() => selectConnection(connection.id)}
                  className="flex items-start justify-between cursor-pointer p-4 focus:bg-blue-50"
                >
              <div className="flex flex-col gap-2 flex-1">
                {/* Header Row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">연결:</span>
                    <span className="font-medium text-sm">{connection.serviceName || connection.sid}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Server className="h-3 w-3" />
                    <span>
                      {connection.host}:{connection.port}/{connection.serviceName || connection.sid}
                    </span>
                  </div>
                  {getHealthStatusBadge(connection.healthStatus)}
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-4 gap-2 pl-2">
                  {/* IP Address */}
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded border border-blue-200 min-w-0">
                    <Server className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                    <span className="text-xs font-medium text-blue-900 truncate">{connection.host}</span>
                  </div>

                  {/* Database Name */}
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-50 rounded border border-cyan-200 min-w-0">
                    <Database className="h-3.5 w-3.5 text-cyan-600 flex-shrink-0" />
                    <span className="text-xs font-medium text-cyan-900 truncate">
                      {connection.serviceName || connection.sid}
                    </span>
                  </div>

                  {/* Username */}
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded border border-slate-200 min-w-0">
                    <User className="h-3.5 w-3.5 text-slate-600 flex-shrink-0" />
                    <span className="text-xs font-medium text-slate-900 truncate">{connection.username}</span>
                  </div>

                  {/* Connection Type */}
                  <div className="flex items-center justify-center">
                    {getConnectionTypeBadge(connection.connectionType)}
                  </div>

                  {/* Connection Name */}
                  {connection.name && (
                    <div className="col-span-4 text-xs text-muted-foreground pl-1">
                      <span className="font-medium">이름:</span> {connection.name}
                    </div>
                  )}
                </div>

                {/* Description */}
                {connection.description && (
                  <div className="text-xs text-muted-foreground pl-2">
                    <span className="font-medium">설명:</span> {connection.description}
                  </div>
                )}

                {/* Additional Info */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground pl-2 flex-wrap">
                  {connection.oracleVersion && <span>Oracle {connection.oracleVersion}</span>}
                  {connection.oracleEdition && (
                    <Badge variant="outline" className="text-xs">
                      {connection.oracleEdition}
                    </Badge>
                  )}
                  {connection.isDefault && (
                    <Badge variant="secondary" className="text-xs">
                      기본 연결
                    </Badge>
                  )}
                </div>
              </div>

              {selectedConnectionId === connection.id && (
                <Check className="h-5 w-5 text-primary flex-shrink-0 ml-3 mt-1" />
              )}
            </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DatabaseSelector() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-2 bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white min-w-[200px]"
      >
        <Database className="h-4 w-4" />
        <span className="hidden sm:inline">로딩중...</span>
      </Button>
    );
  }

  return <DatabaseSelectorInner />;
}
