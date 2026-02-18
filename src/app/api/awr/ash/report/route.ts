import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getOracleConfig } from '@/lib/oracle/utils';
import { executeQuery } from '@/lib/oracle/client';
import { createEnterpriseFeatureResponse } from '@/lib/oracle/edition-guard';
import { getConnectionEdition } from '@/lib/oracle/edition-guard-server';

// ASH 리포트 인메모리 캐시 (동일 파라미터 반복 호출 방지)
const ashReportCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1시간
const MAX_CACHE_SIZE = 20;

// 생성 중인 리포트 추적 (동시 중복 요청 방지)
const pendingReports = new Map<string, Promise<any>>();

function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, entry] of ashReportCache) {
    if (now - entry.timestamp > CACHE_TTL) {
      ashReportCache.delete(key);
    }
  }
}

/**
 * POST /api/awr/ash/report
 * ASH 리포트 생성 (캐시 + 중복 요청 방지)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const connectionId = searchParams.get('connection_id');
    const startTime = searchParams.get('start_time');
    const endTime = searchParams.get('end_time');

    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 });
    }

    if (!startTime || !endTime) {
      return NextResponse.json(
        { error: 'Start time and end time are required' },
        { status: 400 }
      );
    }

    // Enterprise Edition 체크 (ASH Report는 Diagnostics Pack 필요)
    const edition = await getConnectionEdition(connectionId);
    const enterpriseCheck = createEnterpriseFeatureResponse('ASH', edition);
    if (enterpriseCheck) {
      return NextResponse.json(enterpriseCheck, { status: 403 });
    }

    const cacheKey = `${connectionId}_${startTime}_${endTime}`;

    // 1. 캐시 확인
    cleanExpiredCache();
    const cached = ashReportCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`[ASH Report] Cache hit for ${cacheKey}`);
      return NextResponse.json(cached.data);
    }

    // 2. 이미 생성 중인 동일 리포트가 있으면 대기
    if (pendingReports.has(cacheKey)) {
      console.log(`[ASH Report] Waiting for pending report ${cacheKey}`);
      try {
        const pendingResult = await pendingReports.get(cacheKey);
        return NextResponse.json(pendingResult);
      } catch {
        // 대기 중 에러 발생 시 새로 생성
      }
    }

    // 3. 리포트 생성
    // TABLE() 함수 내부에서는 bind variable 미지원 → 입력값 검증 후 string interpolation
    const dateTimeRegex = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/;
    if (!dateTimeRegex.test(startTime) || !dateTimeRegex.test(endTime)) {
      return NextResponse.json({ error: 'Invalid datetime format' }, { status: 400 });
    }

    const generateReport = async () => {
      const config = await getOracleConfig(connectionId);

      const reportQuery = `
        SELECT output
        FROM TABLE(DBMS_WORKLOAD_REPOSITORY.ASH_REPORT_HTML(
          l_dbid => (SELECT dbid FROM v$database),
          l_inst_num => (SELECT instance_number FROM v$instance),
          l_btime => TO_DATE('${startTime}', 'YYYY-MM-DD HH24:MI:SS'),
          l_etime => TO_DATE('${endTime}', 'YYYY-MM-DD HH24:MI:SS')
        ))
      `;

      const result = await executeQuery(config, reportQuery, [], { timeout: 300000 });
      const reportContent = result.rows.map((row: any) => row.OUTPUT).join('\n');
      const fileSize = Buffer.byteLength(reportContent, 'utf8');
      const reportName = `ASH_${startTime.replace(/[: -]/g, '_')}_${endTime.replace(/[: -]/g, '_')}.html`;

      return {
        success: true,
        message: 'ASH report generated successfully',
        data: {
          report_name: reportName,
          file_size: fileSize,
          content: reportContent,
          time_range: { start: startTime, end: endTime },
          generated_at: new Date().toISOString(),
        },
      };
    };

    const reportPromise = generateReport();
    pendingReports.set(cacheKey, reportPromise);

    try {
      const responseData = await reportPromise;

      // 캐시 저장 (크기 제한)
      if (ashReportCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = ashReportCache.keys().next().value;
        if (oldestKey) ashReportCache.delete(oldestKey);
      }
      ashReportCache.set(cacheKey, { data: responseData, timestamp: Date.now() });

      return NextResponse.json(responseData);
    } finally {
      pendingReports.delete(cacheKey);
    }
  } catch (error) {
    console.error('ASH report generation error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate ASH report',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
