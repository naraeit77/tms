import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * POST /api/advisor/sql-access/simulate
 * What-If 시뮬레이션: 권장 인덱스의 예상 비용 변화 분석
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      connection_id,
      task_name,
      recommendation_id, // 특정 권장사항 ID (옵션)
      sql_id, // 특정 SQL ID (옵션)
    } = body;

    if (!connection_id || !task_name) {
      return NextResponse.json(
        { error: 'Connection ID and task name are required' },
        { status: 400 }
      );
    }

    const config = await getOracleConfig(connection_id);

    // 권장 인덱스 정보 조회
    const recommendationQuery = recommendation_id
      ? `
        SELECT
          r.REC_ID,
          r.TYPE,
          r.BENEFIT,
          a.ATTR1 as TABLE_OWNER,
          a.ATTR2 as TABLE_NAME,
          a.ATTR3 as COLUMN_LIST,
          a.ATTR4 as INDEX_NAME,
          a.COMMAND as DDL_STATEMENT
        FROM USER_ADVISOR_RECOMMENDATIONS r
        JOIN USER_ADVISOR_ACTIONS a ON r.TASK_NAME = a.TASK_NAME AND r.REC_ID = a.REC_ID
        WHERE r.TASK_NAME = :task_name
          AND r.REC_ID = :rec_id
          AND r.TYPE = 'CREATE INDEX'
        ORDER BY r.RANK
      `
      : `
        SELECT
          r.REC_ID,
          r.TYPE,
          r.BENEFIT,
          a.ATTR1 as TABLE_OWNER,
          a.ATTR2 as TABLE_NAME,
          a.ATTR3 as COLUMN_LIST,
          a.ATTR4 as INDEX_NAME,
          a.COMMAND as DDL_STATEMENT
        FROM USER_ADVISOR_RECOMMENDATIONS r
        JOIN USER_ADVISOR_ACTIONS a ON r.TASK_NAME = a.TASK_NAME AND r.REC_ID = a.REC_ID
        WHERE r.TASK_NAME = :task_name
          AND r.TYPE = 'CREATE INDEX'
        ORDER BY r.RANK
      `;

    const params = recommendation_id ? [task_name, recommendation_id] : [task_name];
    const recommendationsResult = await executeQuery(config, recommendationQuery, params, { timeout: 30000 });

    // 각 권장 인덱스에 대해 시뮬레이션 수행
    const simulations = await Promise.all(
      recommendationsResult.rows.map(async (rec: any) => {
        try {
          // 현재 실행 계획 비용 조회 (인덱스 없이)
          const beforePlanQuery = sql_id
            ? `SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(:sql_id, NULL, 'ALL'))`
            : null;

          let beforeCost = null;
          if (beforePlanQuery && sql_id) {
            try {
              const beforeResult = await executeQuery(config, beforePlanQuery, [sql_id], { timeout: 10000 });
              const beforePlanText = beforeResult.rows.map((r: any) => r.PLAN_TABLE_OUTPUT || '').join('\n');
              beforeCost = extractCost(beforePlanText);
            } catch {
              // 실패 시 무시
            }
          }

          // 인덱스 생성 후 예상 비용 (권장사항의 Benefit 기반 추정)
          // 실제로는 가상 인덱스를 생성하고 테스트해야 하지만, 여기서는 Benefit을 기반으로 추정
          const estimatedCostReduction = rec.BENEFIT || 0;
          const afterCost = beforeCost ? beforeCost * (1 - estimatedCostReduction / 100) : null;

          return {
            rec_id: rec.REC_ID,
            type: rec.TYPE,
            benefit: rec.BENEFIT,
            table_owner: rec.TABLE_OWNER,
            table_name: rec.TABLE_NAME,
            column_list: rec.COLUMN_LIST,
            index_name: rec.INDEX_NAME,
            ddl_statement: rec.DDL_STATEMENT,
            before_cost: beforeCost,
            after_cost: afterCost,
            estimated_improvement: estimatedCostReduction,
          };
        } catch (error) {
          console.warn(`Failed to simulate recommendation ${rec.REC_ID}:`, error);
          return {
            rec_id: rec.REC_ID,
            error: error instanceof Error ? error.message : 'Simulation failed',
          };
        }
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        task_name,
        simulations,
        count: simulations.length,
      },
    });
  } catch (error) {
    console.error('Error simulating recommendations:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to simulate recommendations';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * 실행 계획 텍스트에서 Cost 추출
 */
function extractCost(planText: string): number | null {
  if (!planText) return null;
  
  const costMatch = planText.match(/Cost\s*\([^)]*\)\s*=\s*(\d+)/i);
  if (costMatch) {
    return parseInt(costMatch[1], 10);
  }
  
  const costMatch2 = planText.match(/cost\s*=\s*(\d+)/i);
  if (costMatch2) {
    return parseInt(costMatch2[1], 10);
  }
  
  return null;
}

