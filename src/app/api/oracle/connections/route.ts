/**
 * Oracle Connections API
 * GET: 본인 소유 연결 목록 조회 (RLS 적용)
 * POST: 새 연결 생성 (created_by = 세션 user)
 */

import { NextRequest, NextResponse } from 'next/server';
import { oracleConnections, auditLogs } from '@/db/schema';
import { desc } from 'drizzle-orm';
import { encrypt } from '@/lib/crypto';
import { healthCheck, type OracleConnectionConfig } from '@/lib/oracle';
import { invalidateConnectionCache } from '@/lib/oracle/utils';
import { withSessionContext, UnauthorizedError } from '@/db/with-user';

export async function GET(_request: NextRequest) {
  try {
    const connections = await withSessionContext(async (tx) =>
      tx
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
        .orderBy(desc(oracleConnections.createdAt)),
    );

    return NextResponse.json(connections, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Error fetching connections:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.name || !body.host || !body.port || !body.username || !body.password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (body.connection_type === 'SERVICE_NAME' && !body.service_name) {
      return NextResponse.json({ error: 'Service name is required' }, { status: 400 });
    }
    if (body.connection_type === 'SID' && !body.sid) {
      return NextResponse.json({ error: 'SID is required' }, { status: 400 });
    }

    const encryptedPassword = encrypt(body.password);
    const privilege = body.privilege === 'NORMAL' ? undefined : body.privilege;

    // 연결 테스트 (DB 저장 전, RLS와 무관)
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
      privilege,
    };

    const healthCheckResult = await healthCheck(testConfig);
    if (!healthCheckResult.isHealthy) {
      return NextResponse.json(
        { error: 'Connection test failed', details: healthCheckResult.error },
        { status: 400 },
      );
    }

    const responseData = await withSessionContext(async (tx, userId) => {
      const now = new Date();
      const [connection] = await tx
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

      await tx.insert(auditLogs).values({
        userId,
        action: 'CREATE',
        resourceType: 'oracle_connection',
        resourceId: connection.id,
        details: { name: body.name, host: body.host },
      });

      return {
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
    });

    invalidateConnectionCache(responseData.id);
    return NextResponse.json({ data: responseData }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // PG unique violation: 본인 namespace 내 동일 name
    if ((error as { code?: string })?.code === '23505') {
      return NextResponse.json(
        { error: '같은 이름의 연결이 이미 존재합니다.' },
        { status: 409 },
      );
    }
    console.error('Connection create error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
