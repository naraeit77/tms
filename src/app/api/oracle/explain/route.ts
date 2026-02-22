/**
 * Oracle SQL Explain Plan API
 * SQL 실행계획 조회 엔드포인트
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getConnection } from '@/lib/oracle/client';
import { getOracleConfig } from '@/lib/oracle/utils';
import oracledb from 'oracledb';

export async function POST(request: NextRequest) {
  let connection: oracledb.Connection | null = null;

  try {
    // 인증 확인
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { connectionId, query, schema } = body;

    if (!connectionId || !query) {
      return NextResponse.json({ error: 'Missing required fields: connectionId, query' }, { status: 400 });
    }

    console.log('[Explain API] Getting explain plan for connection:', connectionId, 'schema:', schema || 'default');

    // 캐싱된 연결 설정 가져오기
    const config = await getOracleConfig(connectionId);

    try {
      // 하나의 연결을 사용하여 스키마 변경과 EXPLAIN PLAN을 함께 처리
      connection = await getConnection(config);

      // 스키마가 지정된 경우 현재 스키마 변경 (같은 connection에서)
      if (schema) {
        try {
          await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ${schema}`);
          console.log('[Explain API] Schema changed to:', schema);
        } catch (schemaError: any) {
          console.warn('[Explain API] Failed to change schema:', schemaError.message);
        }
      }

      // 쿼리 정리: 세미콜론 제거 및 공백 정리
      const cleanQuery = query.trim().replace(/;+\s*$/, '');

      // 고유한 statement_id 생성
      const statementId = `STMT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      console.log('[Explain API] Statement ID:', statementId);

      // EXPLAIN PLAN 실행 (낙관적 수행: PLAN_TABLE이 있다고 가정)
      const explainSql = `EXPLAIN PLAN SET STATEMENT_ID = '${statementId}' FOR ${cleanQuery}`;

      try {
        await connection.execute(explainSql, [], { autoCommit: true });
      } catch (error: any) {
        // ORA-00942: table or view does not exist (PLAN_TABLE이 없는 경우)
        // PLAN_TABLE 관련 ORA-00942만 처리: 쿼리 내 테이블이 없는 경우와 구분
        if (error.message?.includes('ORA-00942') && error.message?.includes('PLAN_TABLE')) {
          console.log('[Explain API] PLAN_TABLE missing, creating and retrying...');
          await ensurePlanTable(connection);
          await connection.execute(explainSql, [], { autoCommit: true });
        } else if (error.message?.includes('ORA-00942')) {
          // PLAN_TABLE이 아닌 쿼리 내 테이블이 없는 경우: PLAN_TABLE 확인 후 재시도
          try {
            await ensurePlanTable(connection);
            await connection.execute(explainSql, [], { autoCommit: true });
          } catch (retryError: any) {
            throw retryError;
          }
        } else {
          throw error;
        }
      }

      console.log('[Explain API] Explain plan executed');

      // 실행계획 조회 (같은 connection에서)
      const planResult = await connection.execute(
        `SELECT
          ID,
          PARENT_ID,
          OPERATION,
          OPTIONS,
          OBJECT_NAME,
          OBJECT_TYPE,
          OPTIMIZER,
          COST,
          CARDINALITY,
          BYTES,
          CPU_COST,
          IO_COST,
          TEMP_SPACE,
          ACCESS_PREDICATES,
          FILTER_PREDICATES,
          PROJECTION,
          TIME,
          PARTITION_START,
          PARTITION_STOP,
          DISTRIBUTION
        FROM PLAN_TABLE
        WHERE STATEMENT_ID = :sid
        ORDER BY ID`,
        { sid: statementId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const planRows = planResult.rows || [];
      console.log('[Explain API] Plan retrieved, rows:', planRows.length);

      // 실행계획 삭제 (같은 connection에서)
      await connection.execute(
        `DELETE FROM PLAN_TABLE WHERE STATEMENT_ID = :sid`,
        { sid: statementId },
        { autoCommit: true }
      );

      // 실행계획을 트리 구조로 변환
      const planTree = buildPlanTree(planRows);

      // 텍스트 형식으로 변환
      const planText = formatPlanAsText(planTree);

      return NextResponse.json({
        success: true,
        plan: planRows,
        planTree,
        planText,
        statementId,
      });
    } catch (error: any) {
      console.error('[Explain API] Explain plan error:', error);

      return NextResponse.json(
        {
          error: error.message || 'Explain plan failed',
          errorCode: error.errorNum,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[Explain API] Request error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('[Explain API] Error closing connection:', err);
      }
    }
  }
}

/**
 * PLAN_TABLE 존재 확인 및 생성 (같은 connection 사용)
 */
async function ensurePlanTable(connection: oracledb.Connection) {
  try {
    const checkResult = await connection.execute<any>(
      `SELECT COUNT(*) as CNT FROM USER_TABLES WHERE TABLE_NAME = 'PLAN_TABLE'`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const exists = checkResult.rows?.[0]?.CNT > 0;

    if (!exists) {
      console.log('[Explain API] PLAN_TABLE does not exist, creating...');

      await connection.execute(`
        CREATE TABLE PLAN_TABLE (
          STATEMENT_ID       VARCHAR2(30),
          PLAN_ID            NUMBER,
          TIMESTAMP          DATE,
          REMARKS            VARCHAR2(4000),
          OPERATION          VARCHAR2(30),
          OPTIONS            VARCHAR2(255),
          OBJECT_NODE        VARCHAR2(128),
          OBJECT_OWNER       VARCHAR2(128),
          OBJECT_NAME        VARCHAR2(128),
          OBJECT_ALIAS       VARCHAR2(261),
          OBJECT_INSTANCE    NUMBER,
          OBJECT_TYPE        VARCHAR2(30),
          OPTIMIZER          VARCHAR2(255),
          SEARCH_COLUMNS     NUMBER,
          ID                 NUMBER,
          PARENT_ID          NUMBER,
          DEPTH              NUMBER,
          POSITION           NUMBER,
          COST               NUMBER,
          CARDINALITY        NUMBER,
          BYTES              NUMBER,
          OTHER_TAG          VARCHAR2(255),
          PARTITION_START    VARCHAR2(255),
          PARTITION_STOP     VARCHAR2(255),
          PARTITION_ID       NUMBER,
          OTHER              LONG,
          DISTRIBUTION       VARCHAR2(30),
          CPU_COST           NUMBER,
          IO_COST            NUMBER,
          TEMP_SPACE         NUMBER,
          ACCESS_PREDICATES  VARCHAR2(4000),
          FILTER_PREDICATES  VARCHAR2(4000),
          PROJECTION         VARCHAR2(4000),
          TIME               NUMBER,
          QBLOCK_NAME        VARCHAR2(128),
          OTHER_XML          CLOB
        )
      `, [], { autoCommit: true });
      console.log('[Explain API] PLAN_TABLE created successfully');
    } else {
      console.log('[Explain API] PLAN_TABLE already exists');
    }
  } catch (error: any) {
    console.error('[Explain API] Error ensuring PLAN_TABLE:', error);
    throw error;
  }
}

/**
 * 실행계획을 트리 구조로 변환
 */
function buildPlanTree(rows: any[]): any[] {
  const nodeMap = new Map<number, any>();
  const rootNodes: any[] = [];

  // 모든 노드를 맵에 저장
  rows.forEach((row) => {
    nodeMap.set(row.ID, {
      ...row,
      children: [],
    });
  });

  // 부모-자식 관계 설정
  rows.forEach((row) => {
    const node = nodeMap.get(row.ID);
    if (row.PARENT_ID === null || row.PARENT_ID === undefined) {
      rootNodes.push(node);
    } else {
      const parent = nodeMap.get(row.PARENT_ID);
      if (parent) {
        parent.children.push(node);
      }
    }
  });

  return rootNodes;
}

/**
 * 실행계획을 텍스트 형식으로 변환
 */
function formatPlanAsText(nodes: any[], depth: number = 0): string {
  let result = '';

  nodes.forEach((node, index) => {
    const indent = '  '.repeat(depth);
    const operation = node.OPTIONS ? `${node.OPERATION} ${node.OPTIONS}` : node.OPERATION;
    const objectName = node.OBJECT_NAME ? ` (${node.OBJECT_NAME})` : '';
    const cost = node.COST ? ` [Cost: ${node.COST}]` : '';
    const cardinality = node.CARDINALITY ? ` [Rows: ${node.CARDINALITY}]` : '';

    result += `${indent}${node.ID}. ${operation}${objectName}${cost}${cardinality}\n`;

    if (node.ACCESS_PREDICATES) {
      result += `${indent}   Access Predicates: ${node.ACCESS_PREDICATES}\n`;
    }
    if (node.FILTER_PREDICATES) {
      result += `${indent}   Filter Predicates: ${node.FILTER_PREDICATES}\n`;
    }

    if (node.children && node.children.length > 0) {
      result += formatPlanAsText(node.children, depth + 1);
    }
  });

  return result;
}
