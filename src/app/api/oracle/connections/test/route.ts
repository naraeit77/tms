/**
 * Oracle Connection Test API
 * POST: 연결 정보를 테스트 (저장하지 않음)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { healthCheck, type OracleConnectionConfig } from '@/lib/oracle';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // 입력 검증
    if (!body.host || !body.port || !body.username || !body.password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (body.connection_type === 'SERVICE_NAME' && !body.service_name) {
      return NextResponse.json({ error: 'Service name is required' }, { status: 400 });
    }

    if (body.connection_type === 'SID' && !body.sid) {
      return NextResponse.json({ error: 'SID is required' }, { status: 400 });
    }

    // 연결 테스트
    const testConfig: OracleConnectionConfig = {
      id: '',
      name: body.name || 'Test Connection',
      host: body.host,
      port: parseInt(body.port),
      serviceName: body.service_name,
      sid: body.sid,
      username: body.username,
      password: body.password,
      connectionType: body.connection_type,
    };

    const healthCheckResult = await healthCheck(testConfig);

    if (!healthCheckResult.isHealthy) {
      return NextResponse.json(
        {
          error: 'Connection test failed',
          details: healthCheckResult.error || 'Unable to connect to database',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Connection test successful',
      data: healthCheckResult,
    });
  } catch (error) {
    console.error('Connection test error:', error);
    return NextResponse.json(
      {
        error: 'Connection test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
