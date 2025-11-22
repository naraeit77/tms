'use client';

/**
 * Connection Info Component
 * 연결된 Oracle 데이터베이스 정보 표시
 */

import { Database, Server, User, CheckCircle, XCircle, AlertCircle, Cloud } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface OracleConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  service_name?: string;
  sid?: string;
  username?: string;
  health_status?: 'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN';
  oracle_version?: string;
  database_role?: string;
  instance_name?: string;
  host_name?: string;
}

interface ConnectionInfoProps {
  connection: OracleConnection | null;
  showDetailed?: boolean;
  className?: string;
}

export default function ConnectionInfo({
  connection,
  showDetailed = false,
  className = '',
}: ConnectionInfoProps) {
  if (!connection) {
    return null;
  }

  const connectionString = connection.service_name
    ? `${connection.host}:${connection.port}/${connection.service_name}`
    : `${connection.host}:${connection.port}/${connection.sid || 'ORCL'}`;

  const healthStatus = connection.health_status || 'UNKNOWN';

  const getHealthIcon = () => {
    switch (healthStatus) {
      case 'HEALTHY':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'UNHEALTHY':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getHealthVariant = () => {
    switch (healthStatus) {
      case 'HEALTHY':
        return 'default' as const;
      case 'UNHEALTHY':
        return 'destructive' as const;
      default:
        return 'outline' as const;
    }
  };

  const getHealthColor = () => {
    switch (healthStatus) {
      case 'HEALTHY':
        return 'bg-green-100 text-green-800 hover:bg-green-100';
      case 'UNHEALTHY':
        return 'bg-red-100 text-red-800 hover:bg-red-100';
      default:
        return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100';
    }
  };

  if (showDetailed) {
    return (
      <Alert className={`${className} bg-blue-50 border-blue-200`}>
        <Database className="h-4 w-4 text-blue-600" />
        <AlertDescription>
          <div className="space-y-2">
            {/* 첫 번째 줄: 연결 정보 */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-blue-900">연결:</span>
              <span className="text-blue-800">{connection.name}</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="secondary" className="font-mono text-xs">
                      <Database className="h-3 w-3 mr-1" />
                      {connectionString}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>연결 문자열</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Badge className={getHealthColor()}>
                <span className="flex items-center gap-1">
                  {getHealthIcon()}
                  {healthStatus}
                </span>
              </Badge>
            </div>

            {/* 두 번째 줄: 상세 정보 */}
            <div className="flex flex-wrap items-center gap-2">
              <TooltipProvider>
                {connection.oracle_version && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge variant="outline" className="bg-blue-50">
                        <Cloud className="h-3 w-3 mr-1" />
                        {connection.oracle_version}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Oracle 버전</p>
                    </TooltipContent>
                  </Tooltip>
                )}

                {connection.database_role && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge variant="outline" className="bg-purple-50 text-purple-700">
                        {connection.database_role}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>데이터베이스 역할</p>
                    </TooltipContent>
                  </Tooltip>
                )}

                {connection.instance_name && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge variant="outline" className="bg-cyan-50 text-cyan-700">
                        {connection.instance_name}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>인스턴스 이름</p>
                    </TooltipContent>
                  </Tooltip>
                )}

                {connection.username && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge variant="outline" className="bg-indigo-50 text-indigo-700">
                        <User className="h-3 w-3 mr-1" />
                        {connection.username}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>접속 사용자</p>
                    </TooltipContent>
                  </Tooltip>
                )}

                {connection.host_name && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge variant="outline" className="bg-gray-50">
                        <Server className="h-3 w-3 mr-1" />
                        {connection.host_name}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>호스트 이름</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </TooltipProvider>
            </div>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  // Basic view
  return (
    <Alert className={`${className} bg-blue-50 border-blue-200`}>
      <Database className="h-4 w-4 text-blue-600" />
      <AlertDescription>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-blue-900">연결:</span>
          <span className="text-blue-800">{connection.name}</span>
          <Badge variant="secondary" className="font-mono text-xs">
            <Database className="h-3 w-3 mr-1" />
            {connectionString}
          </Badge>
        </div>
      </AlertDescription>
    </Alert>
  );
}
