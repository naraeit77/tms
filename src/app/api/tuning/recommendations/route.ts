import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';

/**
 * GET /api/tuning/recommendations
 * Oracle 성능 데이터를 분석하여 AI 기반 튜닝 권장사항 생성
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

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    // Oracle 연결 설정 가져오기
    const config = await getOracleConfig(connectionId);

    // 성능이 낮은 SQL 조회
    const slowSqlQuery = `
      SELECT * FROM (
      SELECT
        sql_id,
        sql_text,
        executions,
        elapsed_time / DECODE(executions, 0, 1, executions) / 1000 as avg_elapsed_ms,
        cpu_time / DECODE(executions, 0, 1, executions) / 1000 as avg_cpu_ms,
        buffer_gets / DECODE(executions, 0, 1, executions) as avg_buffer_gets,
        disk_reads / DECODE(executions, 0, 1, executions) as avg_disk_reads,
        rows_processed / DECODE(executions, 0, 1, executions) as avg_rows
      FROM
        v$sql
      WHERE
        parsing_schema_name NOT IN ('SYS', 'SYSTEM')
        AND sql_text NOT LIKE '%v$%'
        AND sql_text NOT LIKE '%V$%'
        AND executions > 0
        ${sqlId ? `AND sql_id = '${sqlId}'` : ''}
        AND (
          elapsed_time / DECODE(executions, 0, 1, executions) > 1000000 OR
          buffer_gets / DECODE(executions, 0, 1, executions) > 10000 OR
          disk_reads / DECODE(executions, 0, 1, executions) > 100
        )
      ORDER BY
        elapsed_time DESC
      ) WHERE ROWNUM <= 20
    `;

    const slowSqlResult = await executeQuery(config, slowSqlQuery);

    const recommendations = [];

    // 각 SQL에 대한 권장사항 생성
    for (const row of slowSqlResult.rows) {
      let sqlText = row.SQL_TEXT;
      if (sqlText && typeof sqlText !== 'string') {
        if (Buffer.isBuffer(sqlText)) {
          sqlText = sqlText.toString('utf-8');
        } else if (sqlText.toString) {
          sqlText = sqlText.toString();
        }
      }
      sqlText = sqlText ? sqlText.substring(0, 500) : '';

      const avgElapsedMs = Number(row.AVG_ELAPSED_MS) || 0;
      const avgBufferGets = Number(row.AVG_BUFFER_GETS) || 0;
      const avgDiskReads = Number(row.AVG_DISK_READS) || 0;
      const avgRows = Number(row.AVG_ROWS) || 0;

      const rec = {
        sql_id: row.SQL_ID,
        sql_text: sqlText,
        performance_metrics: {
          avg_elapsed_ms: Math.floor(avgElapsedMs),
          avg_cpu_ms: Math.floor(Number(row.AVG_CPU_MS) || 0),
          avg_buffer_gets: Math.floor(avgBufferGets),
          avg_disk_reads: Math.floor(avgDiskReads),
          avg_rows: Math.floor(avgRows),
          executions: Math.floor(Number(row.EXECUTIONS) || 0),
        },
        recommendations: [] as any[],
        priority: 'LOW' as string,
        estimated_improvement: 0,
      };

      // 성능 문제 분석 및 권장사항 생성
      if (avgElapsedMs > 5000) {
        rec.recommendations.push({
          type: 'PERFORMANCE',
          severity: 'HIGH',
          title: '쿼리 실행 시간 최적화 필요',
          description: `평균 실행 시간이 ${Math.floor(avgElapsedMs)}ms로 매우 느립니다.`,
          suggestions: [
            '실행 계획을 분석하여 Full Table Scan 여부 확인',
            '적절한 인덱스 추가 고려',
            '조인 순서 및 방식 최적화',
          ],
        });
        rec.priority = 'HIGH';
        rec.estimated_improvement += 30;
      }

      if (avgBufferGets > 50000) {
        rec.recommendations.push({
          type: 'IO_OPTIMIZATION',
          severity: 'HIGH',
          title: '과도한 버퍼 읽기 발생',
          description: `평균 버퍼 읽기가 ${Math.floor(avgBufferGets)}로 매우 높습니다.`,
          suggestions: [
            '인덱스 스캔 효율성 검토',
            '테이블 파티셔닝 고려',
            '불필요한 컬럼 조회 제거',
          ],
        });
        rec.priority = 'HIGH';
        rec.estimated_improvement += 25;
      }

      if (avgDiskReads > 500) {
        rec.recommendations.push({
          type: 'DISK_IO',
          severity: 'MEDIUM',
          title: '디스크 I/O 최적화 필요',
          description: `평균 디스크 읽기가 ${Math.floor(avgDiskReads)}로 높습니다.`,
          suggestions: [
            '자주 사용되는 테이블의 메모리 캐시 증가',
            '인덱스 재구성으로 클러스터링 개선',
            'SSD 사용 또는 스토리지 성능 개선',
          ],
        });
        if (rec.priority === 'LOW') rec.priority = 'MEDIUM';
        rec.estimated_improvement += 20;
      }

      // 실행 계획 분석
      if (row.SQL_ID) {
        const planQuery = `
          SELECT operation, options, object_name, cost
          FROM v$sql_plan
          WHERE sql_id = '${row.SQL_ID}'
          ORDER BY id
        `;

        try {
          const planResult = await executeQuery(config, planQuery);

          // Full Table Scan 검출
          const hasFullScan = planResult.rows.some(
            (p: any) => p.OPERATION === 'TABLE ACCESS' && p.OPTIONS === 'FULL'
          );

          if (hasFullScan) {
            rec.recommendations.push({
              type: 'INDEX',
              severity: 'HIGH',
              title: 'Full Table Scan 감지',
              description: '쿼리가 전체 테이블을 스캔하고 있습니다.',
              suggestions: [
                'WHERE 절에 사용된 컬럼에 인덱스 생성',
                '복합 인덱스 생성 고려',
                '테이블 통계 정보 업데이트',
              ],
            });
            rec.estimated_improvement += 25;
          }
        } catch (planError) {
          console.error('Failed to get execution plan:', planError);
        }
      }

      // 통계 기반 권장사항
      if (avgRows > 0 && avgBufferGets / avgRows > 100) {
        rec.recommendations.push({
          type: 'EFFICIENCY',
          severity: 'MEDIUM',
          title: '비효율적인 데이터 접근 패턴',
          description: `행당 버퍼 읽기 비율이 ${Math.floor(avgBufferGets / avgRows)}로 높습니다.`,
          suggestions: [
            '인덱스 커버링 쿼리 사용 고려',
            '선택도가 높은 조건을 먼저 적용',
            '불필요한 정렬 작업 제거',
          ],
        });
        if (rec.priority === 'LOW') rec.priority = 'MEDIUM';
        rec.estimated_improvement += 15;
      }

      if (rec.recommendations.length > 0) {
        recommendations.push(rec);
      }
    }

    // 시스템 레벨 권장사항 추가
    const systemRecommendations = [];

    // 메모리 설정 확인
    const memoryQuery = `
      SELECT name, value
      FROM v$parameter
      WHERE name IN ('sga_target', 'pga_aggregate_target', 'memory_target')
    `;

    try {
      const memoryResult = await executeQuery(config, memoryQuery);
      const memoryParams = memoryResult.rows.reduce((acc: any, row: any) => {
        acc[row.NAME] = row.VALUE;
        return acc;
      }, {});

      if (memoryParams.memory_target === '0') {
        systemRecommendations.push({
          type: 'SYSTEM',
          title: '자동 메모리 관리 비활성화',
          description: 'Oracle 자동 메모리 관리가 비활성화되어 있습니다.',
          suggestions: [
            'MEMORY_TARGET 파라미터 설정으로 자동 메모리 관리 활성화',
            'SGA_TARGET과 PGA_AGGREGATE_TARGET 적절히 조정',
          ],
        });
      }
    } catch (memError) {
      console.error('Failed to get memory parameters:', memError);
    }

    // 테이블 통계 확인
    const statsQuery = `
      SELECT * FROM (
      SELECT
        owner,
        table_name,
        num_rows,
        last_analyzed,
        ROUND(SYSDATE - last_analyzed) as days_since_analyzed
      FROM
        all_tables
      WHERE
        owner NOT IN ('SYS', 'SYSTEM')
        AND num_rows > 1000
        AND (last_analyzed IS NULL OR last_analyzed < SYSDATE - 30)
      ) WHERE ROWNUM <= 10
    `;

    try {
      const statsResult = await executeQuery(config, statsQuery);

      if (statsResult.rows.length > 0) {
        systemRecommendations.push({
          type: 'STATISTICS',
          title: '오래된 테이블 통계',
          description: `${statsResult.rows.length}개 테이블의 통계가 30일 이상 오래되었습니다.`,
          suggestions: [
            'DBMS_STATS.GATHER_TABLE_STATS 실행',
            '자동 통계 수집 작업 스케줄 확인',
            '중요 테이블의 통계 정기적 수집',
          ],
          tables: statsResult.rows.map((r: any) => ({
            owner: r.OWNER,
            table_name: r.TABLE_NAME,
            days_since_analyzed: r.DAYS_SINCE_ANALYZED,
          })),
        });
      }
    } catch (statsError) {
      console.error('Failed to get table statistics:', statsError);
    }

    return NextResponse.json({
      success: true,
      data: {
        sql_recommendations: recommendations,
        system_recommendations: systemRecommendations,
      },
      summary: {
        total_issues: recommendations.length,
        high_priority: recommendations.filter(r => r.priority === 'HIGH').length,
        medium_priority: recommendations.filter(r => r.priority === 'MEDIUM').length,
        low_priority: recommendations.filter(r => r.priority === 'LOW').length,
        avg_improvement: recommendations.length > 0
          ? Math.floor(recommendations.reduce((sum, r) => sum + r.estimated_improvement, 0) / recommendations.length)
          : 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Tuning recommendations API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate tuning recommendations' },
      { status: 500 }
    );
  }
}
