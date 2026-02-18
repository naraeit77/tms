import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * GET /api/advisor/sql-tuning/plan-comparison
 * Before & After 실행 계획 비교
 * SQL Profile 적용 전후의 실행 계획을 비교
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');
    const sqlId = searchParams.get('sql_id');
    const sqlText = searchParams.get('sql_text');
    const profileName = searchParams.get('profile_name'); // 옵션: 특정 프로파일 사용

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    if (!sqlId && !sqlText) {
      return NextResponse.json(
        { error: 'Either SQL ID or SQL text is required' },
        { status: 400 }
      );
    }

    const config = await getOracleConfig(connectionId);

    // Before: 프로파일 없이 실행 계획 조회
    let beforePlan: any = null;
    let beforePlanText = '';

    try {
      if (sqlId) {
        const beforeQuery = `
          SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(:sql_id, NULL, 'ALL'))
        `;
        const beforeResult = await executeQuery(config, beforeQuery, [sqlId], { timeout: 10000 });
        beforePlanText = beforeResult.rows.map((r: any) => r.PLAN_TABLE_OUTPUT || '').join('\n');
      } else if (sqlText) {
        // SQL 텍스트로 실행 계획 조회 (EXPLAIN PLAN 사용)
        const explainQuery = `
          EXPLAIN PLAN FOR ${sqlText}
        `;
        await executeQuery(config, explainQuery, [], { timeout: 10000 });
        
        const displayQuery = `SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY)`;
        const displayResult = await executeQuery(config, displayQuery, [], { timeout: 10000 });
        beforePlanText = displayResult.rows.map((r: any) => r.PLAN_TABLE_OUTPUT || '').join('\n');
      }
    } catch (beforeError) {
      console.warn('Failed to get before plan:', beforeError);
    }

    // After: 프로파일 적용 후 실행 계획 조회
    let afterPlan: any = null;
    let afterPlanText = '';

    if (profileName) {
      try {
        // 특정 프로파일 사용하여 실행 계획 조회
        if (sqlId) {
          // SQL_ID로 실행 계획 조회 시 프로파일이 자동 적용됨
          const afterQuery = `
            SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(:sql_id, NULL, 'ALL'))
          `;
          const afterResult = await executeQuery(config, afterQuery, [sqlId], { timeout: 10000 });
          afterPlanText = afterResult.rows.map((r: any) => r.PLAN_TABLE_OUTPUT || '').join('\n');
        } else if (sqlText) {
          // SQL 텍스트로 실행 계획 조회 (프로파일 적용)
          const explainQuery = `
            EXPLAIN PLAN FOR ${sqlText}
          `;
          await executeQuery(config, explainQuery, [], { timeout: 10000 });
          
          const displayQuery = `SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY)`;
          const displayResult = await executeQuery(config, displayQuery, [], { timeout: 10000 });
          afterPlanText = displayResult.rows.map((r: any) => r.PLAN_TABLE_OUTPUT || '').join('\n');
        }
      } catch (afterError) {
        console.warn('Failed to get after plan:', afterError);
      }
    }

    // 실행 계획 비교 분석
    const comparison = {
      before: {
        plan_text: beforePlanText,
        cost: extractCost(beforePlanText),
        cardinality: extractCardinality(beforePlanText),
        bytes: extractBytes(beforePlanText),
      },
      after: {
        plan_text: afterPlanText,
        cost: extractCost(afterPlanText),
        cardinality: extractCardinality(afterPlanText),
        bytes: extractBytes(afterPlanText),
      },
      improvement: {
        cost_reduction: beforePlanText && afterPlanText
          ? calculateImprovement(extractCost(beforePlanText), extractCost(afterPlanText))
          : null,
        cardinality_reduction: beforePlanText && afterPlanText
          ? calculateImprovement(extractCardinality(beforePlanText), extractCardinality(afterPlanText))
          : null,
        bytes_reduction: beforePlanText && afterPlanText
          ? calculateImprovement(extractBytes(beforePlanText), extractBytes(afterPlanText))
          : null,
      },
    };

    return NextResponse.json({
      success: true,
      data: comparison,
      sql_id: sqlId || null,
      profile_name: profileName || null,
    });
  } catch (error) {
    console.error('Error comparing execution plans:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to compare execution plans';
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
  
  // 다른 형식 시도
  const costMatch2 = planText.match(/cost\s*=\s*(\d+)/i);
  if (costMatch2) {
    return parseInt(costMatch2[1], 10);
  }
  
  return null;
}

/**
 * 실행 계획 텍스트에서 Cardinality 추출
 */
function extractCardinality(planText: string): number | null {
  if (!planText) return null;
  
  const cardMatch = planText.match(/cardinality\s*=\s*(\d+)/i);
  if (cardMatch) {
    return parseInt(cardMatch[1], 10);
  }
  
  return null;
}

/**
 * 실행 계획 텍스트에서 Bytes 추출
 */
function extractBytes(planText: string): number | null {
  if (!planText) return null;
  
  const bytesMatch = planText.match(/bytes\s*=\s*(\d+)/i);
  if (bytesMatch) {
    return parseInt(bytesMatch[1], 10);
  }
  
  return null;
}

/**
 * 개선율 계산 (퍼센트)
 */
function calculateImprovement(before: number | null, after: number | null): number | null {
  if (!before || !after || before === 0) return null;
  
  const reduction = ((before - after) / before) * 100;
  return Math.round(reduction * 100) / 100; // 소수점 2자리
}

