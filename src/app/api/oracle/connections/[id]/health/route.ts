/**
 * Oracle Connection Health Check API
 * GET: 특정 연결의 Health Check 수행
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createPureClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/crypto';
import { healthCheck, type OracleConnectionConfig } from '@/lib/oracle';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const supabase = await createPureClient();

    // 연결 정보 조회
    const { data: connection, error } = await supabase
      .from('oracle_connections')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !connection) {
      console.error('Connection not found:', { id, error });
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    // 비밀번호 복호화
    let password: string;
    try {
      password = decrypt(connection.password_encrypted);
    } catch (decryptError) {
      console.error('Password decryption failed:', decryptError);
      return NextResponse.json(
        {
          error: 'Password decryption failed',
          details: decryptError instanceof Error ? decryptError.message : 'Unknown error',
        },
        { status: 500 }
      );
    }

    // Health Check 수행
    const config: OracleConnectionConfig = {
      id: connection.id,
      name: connection.name,
      host: connection.host,
      port: connection.port,
      serviceName: connection.service_name || undefined,
      sid: connection.sid || undefined,
      username: connection.username,
      password,
      connectionType: connection.connection_type,
    };

    console.log('Performing health check for connection:', {
      name: config.name,
      host: config.host,
      port: config.port,
      connectionType: config.connectionType,
    });

    const healthCheckResult = await healthCheck(config);

    console.log('Health check result:', healthCheckResult);

    // 결과 저장
    const healthStatus = healthCheckResult.isHealthy ? 'HEALTHY' : 'ERROR';

    // Health Check 업데이트 (버전 및 에디션 정보 포함)
    const updateData: any = {
      last_health_check_at: new Date().toISOString(),
      health_status: healthStatus,
    };

    if (healthCheckResult.isHealthy) {
      updateData.last_connected_at = new Date().toISOString();
      updateData.oracle_version = healthCheckResult.version;
      updateData.oracle_edition = healthCheckResult.edition || null;
    }

    const { error: updateError } = await supabase
      .from('oracle_connections')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      console.error('Failed to update health check status:', updateError);
    }

    return NextResponse.json({
      data: healthCheckResult,
    });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      {
        error: 'Health check failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
