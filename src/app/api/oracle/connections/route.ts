/**
 * Oracle Connections API
 * GET: 모든 연결 조회
 * POST: 새 연결 생성
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createPureClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/crypto';
import { healthCheck, type OracleConnectionConfig } from '@/lib/oracle';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createPureClient();

    // Oracle 연결 목록 조회
    const { data: connections, error } = await supabase
      .from('oracle_connections')
      .select(
        `
        id,
        name,
        description,
        host,
        port,
        service_name,
        sid,
        username,
        connection_type,
        oracle_version,
        oracle_edition,
        is_active,
        is_default,
        last_connected_at,
        last_health_check_at,
        health_status,
        created_at,
        updated_at
      `
      )
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching connections:', error);
      return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 });
    }

    return NextResponse.json(connections || []);
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createPureClient();

    const body = await request.json();

    // 입력 검증
    if (!body.name || !body.host || !body.port || !body.username || !body.password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (body.connection_type === 'SERVICE_NAME' && !body.service_name) {
      return NextResponse.json({ error: 'Service name is required' }, { status: 400 });
    }

    if (body.connection_type === 'SID' && !body.sid) {
      return NextResponse.json({ error: 'SID is required' }, { status: 400 });
    }

    // 비밀번호 암호화
    const encryptedPassword = encrypt(body.password);

    // 연결 테스트
    const testConfig: OracleConnectionConfig = {
      id: '',
      name: body.name,
      host: body.host,
      port: parseInt(body.port),
      serviceName: body.service_name,
      sid: body.sid,
      username: body.username,
      password: body.password,
      connectionType: body.connection_type,
    };

    try {
      const healthCheckResult = await healthCheck(testConfig);

      if (!healthCheckResult.isHealthy) {
        return NextResponse.json(
          { error: 'Connection test failed', details: healthCheckResult.error },
          { status: 400 }
        );
      }

      // 사용자 프로필 조회 또는 생성
      let userId: string | null = null;

      // user_profiles 테이블에서 현재 사용자 확인
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('email', session.user.email)
        .single();

      if (userProfile) {
        userId = userProfile.id;
      }

      // userId가 없으면 null로 설정 (auth.users는 별도로 관리됨)

      // 연결 정보 저장
      const { data: connection, error } = await supabase
        .from('oracle_connections')
        .insert({
          name: body.name,
          description: body.description || null,
          host: body.host,
          port: parseInt(body.port),
          service_name: body.service_name || null,
          sid: body.sid || null,
          username: body.username,
          password_encrypted: encryptedPassword,
          connection_type: body.connection_type,
          oracle_version: healthCheckResult.version,
          oracle_edition: healthCheckResult.edition || null,
          is_active: true,
          is_default: body.is_default || false,
          max_connections: body.max_connections || 10,
          connection_timeout: body.connection_timeout || 30000,
          last_connected_at: new Date().toISOString(),
          last_health_check_at: new Date().toISOString(),
          health_status: 'HEALTHY',
          created_by: userId,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating connection:', error);
        return NextResponse.json({ error: 'Failed to create connection' }, { status: 500 });
      }

      // 감사 로그 기록 (userId가 있을 때만)
      if (userId) {
        await supabase.from('audit_logs').insert({
          user_id: userId,
          action: 'CREATE',
          resource_type: 'oracle_connection',
          resource_id: connection.id,
          details: {
            name: body.name,
            host: body.host,
          },
        });
      }

      return NextResponse.json({ data: connection }, { status: 201 });
    } catch (error) {
      console.error('Connection test error:', error);
      return NextResponse.json(
        { error: 'Connection test failed', details: error instanceof Error ? error.message : 'Unknown error' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
