'use client';

import { useEffect, useState } from 'react';
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
  const { connections, selectedConnectionId, selectConnection, setConnections, isLoading, setLoading } =
    useDatabaseStore();
  const selectedConnection = connections?.find((conn) => conn.id === selectedConnectionId);

  const fetchConnections = async () => {
    try {
      setLoading(true);

      // Add timeout to prevent infinite loading
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch('/api/oracle/connections', {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error('Failed to fetch connections');
      }
      const data = await response.json();

      const formattedConnections = data.map((conn: any) => ({
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
        healthStatus: conn.health_status,
        lastConnectedAt: conn.last_connected_at,
      }));

      // Deduplicate connections by ID
      const uniqueConnections = Array.from(
        new Map(formattedConnections.map((conn: any) => [conn.id, conn])).values()
      );

      setConnections(uniqueConnections as any);
    } catch (error) {
      console.error('Failed to fetch connections:', error);
      // Set empty array on error to prevent infinite loading
      setConnections([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        await fetchConnections();

        const savedId = localStorage.getItem('selected-database-id');
        if (savedId && !selectedConnectionId) {
          selectConnection(savedId);
        }
      } catch (error) {
        console.error('Error loading database connections:', error);
      }
    };

    // Don't block rendering if this fails
    loadData().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getHealthStatusBadge = (status?: string) => {
    switch (status) {
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
      case 'UNHEALTHY':
        return (
          <Badge variant="destructive" className="text-xs">
            ✗ UNHEALTHY
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

        {!connections || connections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">연결된 데이터베이스가 없습니다</p>
          </div>
        ) : (
          <>
            {connections.map((connection) => (
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
