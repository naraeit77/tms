/**
 * Statistics Gathering API
 * DBMS_STATS.GATHER_TABLE_STATS를 이용한 통계 수집
 */

import { NextRequest, NextResponse } from 'next/server';

// Next.js 15: API 라우트 타임아웃 설정 (600초 = 10분)
// 대형 테이블의 경우 통계 수집에 5분 이상 걸릴 수 있음
export const maxDuration = 600;
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/db';
import { oracleConnections, statsCollectionHistory } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { decrypt } from '@/lib/crypto';
import { executeQuery } from '@/lib/oracle';
import type { OracleConnectionConfig } from '@/lib/oracle/types';

interface GatherStatsRequest {
  connection_id: string;
  owner: string;
  table_name: string;
  estimate_percent?: number;
  cascade?: boolean;
  degree?: number;
  method_opt?: string;
}

export async function POST(request: NextRequest) {
  try {
    // 현재 사용자 확인 (Next-Auth 세션 사용)
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: GatherStatsRequest = await request.json();
    const { connection_id, owner, table_name, estimate_percent = 10, cascade = true, degree = 4, method_opt = 'FOR ALL COLUMNS SIZE AUTO' } = body;

    if (!connection_id || !owner || !table_name) {
      return NextResponse.json(
        { error: 'Connection ID, owner, and table_name are required' },
        { status: 400 }
      );
    }

    // Get connection config
    const connections = await db
      .select()
      .from(oracleConnections)
      .where(
        and(
          eq(oracleConnections.id, connection_id),
          eq(oracleConnections.isActive, true)
        )
      )
      .limit(1);

    const connection = connections[0];
    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    const password = decrypt(connection.passwordEncrypted);

    const oracleConfig: OracleConnectionConfig = {
      id: connection.id,
      name: connection.name,
      host: connection.host,
      port: connection.port!,
      serviceName: connection.serviceName || undefined,
      sid: connection.sid || undefined,
      username: connection.username,
      password,
      connectionType: connection.connectionType!,
      privilege: connection.privilege || undefined,
    };

    // Create history record - IN_PROGRESS
    const startTime = new Date();
    let historyRecord: { id: string } | null = null;
    try {
      const inserted = await db
        .insert(statsCollectionHistory)
        .values({
          oracleConnectionId: connection_id,
          owner: owner.toUpperCase(),
          tableName: table_name.toUpperCase(),
          operation: 'GATHER_TABLE_STATS',
          status: 'IN_PROGRESS',
          startTime: startTime,
        })
        .returning({ id: statsCollectionHistory.id });

      historyRecord = inserted[0] || null;
    } catch (historyError) {
      console.error('Failed to create history record:', historyError);
    }

    try {
      // Execute DBMS_STATS.GATHER_TABLE_STATS
      const plsql = `
        BEGIN
          DBMS_STATS.GATHER_TABLE_STATS(
            ownname => :1,
            tabname => :2,
            estimate_percent => :3,
            cascade => :4,
            degree => :5,
            method_opt => :6
          );
        END;
      `;

      // 통계 수집은 시간이 오래 걸릴 수 있으므로 타임아웃을 600초(10분)로 설정
      await executeQuery(oracleConfig, plsql, [
        owner.toUpperCase(),
        table_name.toUpperCase(),
        estimate_percent,
        cascade,
        degree,
        method_opt,
      ], { timeout: 600000 }); // 600초(10분) 타임아웃

      // Update history record - SUCCESS
      const endTime = new Date();
      const durationSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

      if (historyRecord) {
        await db
          .update(statsCollectionHistory)
          .set({
            status: 'SUCCESS',
            endTime: endTime,
            durationSeconds: durationSeconds,
            updatedAt: new Date(),
          })
          .where(eq(statsCollectionHistory.id, historyRecord.id));
      }

      return NextResponse.json({
        success: true,
        message: `Statistics gathered successfully for ${owner}.${table_name}`,
        duration_seconds: durationSeconds,
      });
    } catch (error: any) {
      // Update history record - FAILED
      const endTime = new Date();
      const durationSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

      if (historyRecord) {
        await db
          .update(statsCollectionHistory)
          .set({
            status: 'FAILED',
            endTime: endTime,
            durationSeconds: durationSeconds,
            errorMessage: error.message,
            updatedAt: new Date(),
          })
          .where(eq(statsCollectionHistory.id, historyRecord.id));
      }

      throw error;
    }
  } catch (error: any) {
    console.error('Error gathering statistics:', error);
    return NextResponse.json(
      { error: 'Failed to gather statistics', details: error.message },
      { status: 500 }
    );
  }
}
