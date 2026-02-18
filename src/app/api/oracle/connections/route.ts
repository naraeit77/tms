/**
 * Oracle Connections API
 * GET: 모든 연결 조회
 * POST: 새 연결 생성
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { oracleConnections, auditLogs, userProfiles } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { encrypt } from '@/lib/crypto';
import { healthCheck, type OracleConnectionConfig } from '@/lib/oracle';
import { invalidateConnectionCache } from '@/lib/oracle/utils';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Oracle 연결 목록 조회
    const connections = await db
      .select({
        id: oracleConnections.id,
        name: oracleConnections.name,
        description: oracleConnections.description,
        host: oracleConnections.host,
        port: oracleConnections.port,
        service_name: oracleConnections.serviceName,
        sid: oracleConnections.sid,
        username: oracleConnections.username,
        connection_type: oracleConnections.connectionType,
        oracle_version: oracleConnections.oracleVersion,
        oracle_edition: oracleConnections.oracleEdition,
        is_active: oracleConnections.isActive,
        is_default: oracleConnections.isDefault,
        last_connected_at: oracleConnections.lastConnectedAt,
        last_health_check_at: oracleConnections.lastHealthCheckAt,
        health_status: oracleConnections.healthStatus,
        created_at: oracleConnections.createdAt,
        updated_at: oracleConnections.updatedAt,
      })
      .from(oracleConnections)
      .orderBy(desc(oracleConnections.createdAt));

    return NextResponse.json(connections || [], {
      headers: {
        'Cache-Control': 'private, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    console.error('Error fetching connections:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.stack : String(error),
      code: (error as any)?.code || '',
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    // privilege 값 정규화 (NORMAL이면 저장하지 않음)
    const privilege = body.privilege === 'NORMAL' ? undefined : body.privilege;

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
      privilege: privilege,
    };

    try {
      const healthCheckResult = await healthCheck(testConfig);

      if (!healthCheckResult.isHealthy) {
        return NextResponse.json(
          { error: 'Connection test failed', details: healthCheckResult.error },
          { status: 400 }
        );
      }

      // 사용자 프로필 조회
      let userId: string | null = null;

      const userProfileResult = await db
        .select({ id: userProfiles.id })
        .from(userProfiles)
        .where(eq(userProfiles.email, session.user.email))
        .limit(1);

      if (userProfileResult.length > 0) {
        userId = userProfileResult[0].id;
      }

      // 연결 정보 저장
      const now = new Date();
      const [connection] = await db
        .insert(oracleConnections)
        .values({
          name: body.name,
          description: body.description || null,
          host: body.host,
          port: parseInt(body.port),
          serviceName: body.service_name || null,
          sid: body.sid || null,
          username: body.username,
          passwordEncrypted: encryptedPassword,
          connectionType: body.connection_type,
          privilege: privilege || null,
          oracleVersion: healthCheckResult.version,
          oracleEdition: healthCheckResult.edition || null,
          isActive: true,
          isDefault: body.is_default || false,
          maxConnections: body.max_connections || 10,
          connectionTimeout: body.connection_timeout || 30000,
          lastConnectedAt: now,
          lastHealthCheckAt: now,
          healthStatus: 'HEALTHY',
          createdBy: userId,
        })
        .returning();

      // snake_case response for frontend compatibility
      const responseData = {
        id: connection.id,
        name: connection.name,
        description: connection.description,
        host: connection.host,
        port: connection.port,
        service_name: connection.serviceName,
        sid: connection.sid,
        username: connection.username,
        password_encrypted: connection.passwordEncrypted,
        connection_type: connection.connectionType,
        oracle_version: connection.oracleVersion,
        oracle_edition: connection.oracleEdition,
        privilege: connection.privilege,
        is_active: connection.isActive,
        is_default: connection.isDefault,
        max_connections: connection.maxConnections,
        connection_timeout: connection.connectionTimeout,
        last_connected_at: connection.lastConnectedAt,
        last_health_check_at: connection.lastHealthCheckAt,
        health_status: connection.healthStatus,
        metadata: connection.metadata,
        created_by: connection.createdBy,
        created_at: connection.createdAt,
        updated_at: connection.updatedAt,
      };

      // 감사 로그 기록 (userId가 있을 때만)
      if (userId) {
        await db.insert(auditLogs).values({
          userId: userId,
          action: 'CREATE',
          resourceType: 'oracle_connection',
          resourceId: connection.id,
          details: {
            name: body.name,
            host: body.host,
          },
        });
      }

      // 연결 캐시 무효화
      invalidateConnectionCache(connection.id);

      return NextResponse.json({ data: responseData }, { status: 201 });
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
