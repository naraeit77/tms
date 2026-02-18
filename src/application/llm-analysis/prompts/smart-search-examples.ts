/**
 * @deprecated This file is deprecated.
 * The LLM-based SmartSearch has been replaced with rule-based implementation.
 * See: @/infrastructure/smart-search/rules/ for the new parsing rules.
 *
 * The rule-based implementation at @/application/smart-search/ provides
 * equivalent functionality without LLM dependency.
 *
 * Original: Smart Search Few-shot Examples
 * Comprehensive examples for natural language to SQL filter conversion
 *
 * Categories:
 * - Time-based: 시간 관련 쿼리
 * - Performance-based: 성능 관련 쿼리
 * - Resource-based: 리소스 사용 관련 쿼리
 * - SQL Type: SQL 유형별 쿼리
 * - Compound: 복합 조건 쿼리
 * - Ambiguous: 모호한 쿼리 처리
 */

import type { SearchFilters } from '@/domain/llm-analysis'

export interface FewShotExample {
  input: string
  output: {
    interpretation: string
    filters: SearchFilters
    suggestions: string[]
  }
  category: 'time' | 'performance' | 'resource' | 'sql_type' | 'compound' | 'ambiguous'
}

/**
 * Time-based examples (시간 관련)
 */
export const TIME_EXAMPLES: FewShotExample[] = [
  {
    input: '최근 쿼리',
    output: {
      interpretation: '최근 1시간 내 실행된 SQL을 검색합니다.',
      filters: { timeRange: '1h', sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['오늘 전체 쿼리', '지난 주 쿼리']
    },
    category: 'time'
  },
  {
    input: '오늘 실행된 쿼리',
    output: {
      interpretation: '오늘(24시간 이내) 실행된 SQL을 검색합니다.',
      filters: { timeRange: '24h', sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['오늘 느린 쿼리', '오늘 자주 실행된 쿼리']
    },
    category: 'time'
  },
  {
    input: '어제 쿼리',
    output: {
      interpretation: '어제(24시간 전부터) 실행된 SQL을 검색합니다.',
      filters: { timeRange: '24h', sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['어제 느린 쿼리', '어제 에러 발생 쿼리']
    },
    category: 'time'
  },
  {
    input: '이번 주 쿼리',
    output: {
      interpretation: '최근 7일간 실행된 SQL을 검색합니다.',
      filters: { timeRange: '7d', sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['이번 주 느린 쿼리', '이번 주 자주 실행된 쿼리']
    },
    category: 'time'
  },
  {
    input: '지난 주',
    output: {
      interpretation: '최근 7일간 실행된 SQL을 검색합니다.',
      filters: { timeRange: '7d', sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['지난 주 느린 쿼리', '지난 주 대용량 쿼리']
    },
    category: 'time'
  },
  {
    input: '이번 달 쿼리',
    output: {
      interpretation: '최근 30일간 실행된 SQL을 검색합니다.',
      filters: { timeRange: '30d', sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['이번 달 성능 이슈', '이번 달 자주 실행된 쿼리']
    },
    category: 'time'
  },
  {
    input: '한 달간',
    output: {
      interpretation: '최근 30일간 실행된 SQL을 검색합니다.',
      filters: { timeRange: '30d', sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['한 달간 느린 쿼리 추이', '한 달간 실행 빈도 변화']
    },
    category: 'time'
  },
  {
    input: '분기별 쿼리',
    output: {
      interpretation: '최근 90일간 실행된 SQL을 검색합니다.',
      filters: { timeRange: '90d', sortBy: 'executions', sortOrder: 'desc' },
      suggestions: ['분기별 성능 추이', '분기별 실행량 변화']
    },
    category: 'time'
  }
]

/**
 * Performance-based examples (성능 관련)
 */
export const PERFORMANCE_EXAMPLES: FewShotExample[] = [
  {
    input: '느린 쿼리',
    output: {
      interpretation: '실행 시간이 1초 이상인 느린 SQL을 검색합니다.',
      filters: { minElapsedTime: 1000, sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['매우 느린 쿼리 (5초+)', 'CPU 많이 쓰는 쿼리']
    },
    category: 'performance'
  },
  {
    input: '슬로우 쿼리',
    output: {
      interpretation: '실행 시간이 1초 이상인 느린 SQL을 검색합니다.',
      filters: { minElapsedTime: 1000, sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['3초 이상 걸리는 쿼리', '응답 지연 쿼리']
    },
    category: 'performance'
  },
  {
    input: '지연되는 쿼리',
    output: {
      interpretation: '실행 시간이 3초 이상으로 지연되는 SQL을 검색합니다.',
      filters: { minElapsedTime: 3000, sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['매우 느린 쿼리', '타임아웃 위험 쿼리']
    },
    category: 'performance'
  },
  {
    input: '매우 느린 쿼리',
    output: {
      interpretation: '실행 시간이 5초 이상인 심각하게 느린 SQL을 검색합니다.',
      filters: { minElapsedTime: 5000, sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['타임아웃 발생 쿼리', '긴급 튜닝 필요 쿼리']
    },
    category: 'performance'
  },
  {
    input: '아주 느린',
    output: {
      interpretation: '실행 시간이 5초 이상인 매우 느린 SQL을 검색합니다.',
      filters: { minElapsedTime: 5000, sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['10초 이상 쿼리', '병목 원인 분석']
    },
    category: 'performance'
  },
  {
    input: '빠른 쿼리',
    output: {
      interpretation: '실행 시간이 100ms 이하인 빠른 SQL을 검색합니다.',
      filters: { maxElapsedTime: 100, sortBy: 'elapsed_time', sortOrder: 'asc' },
      suggestions: ['가장 빠른 쿼리', '최적화된 쿼리 패턴']
    },
    category: 'performance'
  },
  {
    input: '응답 지연',
    output: {
      interpretation: '실행 시간이 2초 이상으로 응답이 지연되는 SQL을 검색합니다.',
      filters: { minElapsedTime: 2000, sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['네트워크 지연 쿼리', 'I/O 대기 쿼리']
    },
    category: 'performance'
  },
  {
    input: '타임아웃 위험',
    output: {
      interpretation: '실행 시간이 30초 이상인 타임아웃 위험 SQL을 검색합니다.',
      filters: { minElapsedTime: 30000, sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['긴급 튜닝 필요', '쿼리 분할 필요']
    },
    category: 'performance'
  },
  {
    input: '병목 쿼리',
    output: {
      interpretation: 'CPU 사용량이 높아 병목이 되는 SQL을 검색합니다.',
      filters: { sortBy: 'cpu_time', sortOrder: 'desc', limit: 20 },
      suggestions: ['메모리 병목 쿼리', '디스크 I/O 병목']
    },
    category: 'performance'
  }
]

/**
 * Resource-based examples (리소스 관련)
 */
export const RESOURCE_EXAMPLES: FewShotExample[] = [
  {
    input: 'CPU 많이 쓰는 쿼리',
    output: {
      interpretation: 'CPU 시간이 높은 SQL을 CPU 사용량 순으로 검색합니다.',
      filters: { sortBy: 'cpu_time', sortOrder: 'desc' },
      suggestions: ['CPU 1초 이상 쿼리', '병렬 처리 필요 쿼리']
    },
    category: 'resource'
  },
  {
    input: 'CPU 사용량 높은',
    output: {
      interpretation: 'CPU 시간이 높은 SQL을 검색합니다.',
      filters: { sortBy: 'cpu_time', sortOrder: 'desc', limit: 20 },
      suggestions: ['CPU 병목 쿼리', '연산 최적화 필요']
    },
    category: 'resource'
  },
  {
    input: '버퍼 많이 쓰는',
    output: {
      interpretation: 'Buffer Gets가 높은 SQL을 검색합니다.',
      filters: { minBufferGets: 10000, sortBy: 'buffer_gets', sortOrder: 'desc' },
      suggestions: ['인덱스 필요한 쿼리', '풀스캔 쿼리']
    },
    category: 'resource'
  },
  {
    input: '대용량 쿼리',
    output: {
      interpretation: 'Buffer Gets가 100,000 이상인 대용량 SQL을 검색합니다.',
      filters: { minBufferGets: 100000, sortBy: 'buffer_gets', sortOrder: 'desc' },
      suggestions: ['파티션 필요한 쿼리', '인덱스 추가 필요']
    },
    category: 'resource'
  },
  {
    input: '풀스캔 쿼리',
    output: {
      interpretation: 'Full Table Scan이 의심되는 Buffer Gets가 높은 SQL을 검색합니다.',
      filters: { minBufferGets: 100000, sortBy: 'buffer_gets', sortOrder: 'desc' },
      suggestions: ['인덱스 생성 필요', '파티션 프루닝 필요']
    },
    category: 'resource'
  },
  {
    input: 'Full Scan',
    output: {
      interpretation: 'Full Table Scan이 의심되는 대용량 SQL을 검색합니다.',
      filters: { minBufferGets: 100000, sortBy: 'buffer_gets', sortOrder: 'desc' },
      suggestions: ['인덱스 스캔으로 변경', '필터 조건 최적화']
    },
    category: 'resource'
  },
  {
    input: '디스크 읽기 많은',
    output: {
      interpretation: 'Disk Reads가 높은 SQL을 검색합니다.',
      filters: { sortBy: 'disk_reads', sortOrder: 'desc', limit: 20 },
      suggestions: ['메모리 부족 쿼리', '캐시 히트율 낮은 쿼리']
    },
    category: 'resource'
  },
  {
    input: '메모리 많이 사용',
    output: {
      interpretation: 'Buffer Gets가 50,000 이상인 메모리 사용량이 높은 SQL을 검색합니다.',
      filters: { minBufferGets: 50000, sortBy: 'buffer_gets', sortOrder: 'desc' },
      suggestions: ['PGA 사용 높은 쿼리', '소트 최적화 필요']
    },
    category: 'resource'
  }
]

/**
 * SQL Type examples (SQL 유형별)
 */
export const SQL_TYPE_EXAMPLES: FewShotExample[] = [
  {
    input: 'SELECT 쿼리',
    output: {
      interpretation: 'SELECT 문을 검색합니다.',
      filters: { sqlPattern: '%SELECT%', sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['느린 SELECT', '자주 실행되는 SELECT']
    },
    category: 'sql_type'
  },
  {
    input: '조회 쿼리',
    output: {
      interpretation: 'SELECT 조회 SQL을 검색합니다.',
      filters: { sqlPattern: '%SELECT%', sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['대용량 조회', '복잡한 조회']
    },
    category: 'sql_type'
  },
  {
    input: 'UPDATE 쿼리',
    output: {
      interpretation: 'UPDATE 문을 검색합니다.',
      filters: { sqlPattern: '%UPDATE%', sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['대량 UPDATE', '자주 실행되는 UPDATE']
    },
    category: 'sql_type'
  },
  {
    input: '수정 쿼리',
    output: {
      interpretation: 'UPDATE 수정 SQL을 검색합니다.',
      filters: { sqlPattern: '%UPDATE%', sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['느린 UPDATE', 'Lock 발생 UPDATE']
    },
    category: 'sql_type'
  },
  {
    input: 'DELETE 쿼리',
    output: {
      interpretation: 'DELETE 문을 검색합니다.',
      filters: { sqlPattern: '%DELETE%', sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['대량 DELETE', '느린 DELETE']
    },
    category: 'sql_type'
  },
  {
    input: '삭제 쿼리',
    output: {
      interpretation: 'DELETE 삭제 SQL을 검색합니다.',
      filters: { sqlPattern: '%DELETE%', sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['CASCADE DELETE', '조건 없는 DELETE']
    },
    category: 'sql_type'
  },
  {
    input: 'INSERT 쿼리',
    output: {
      interpretation: 'INSERT 문을 검색합니다.',
      filters: { sqlPattern: '%INSERT%', sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['대량 INSERT', 'INSERT SELECT']
    },
    category: 'sql_type'
  },
  {
    input: '입력 쿼리',
    output: {
      interpretation: 'INSERT 입력 SQL을 검색합니다.',
      filters: { sqlPattern: '%INSERT%', sortBy: 'executions', sortOrder: 'desc' },
      suggestions: ['BULK INSERT', '느린 INSERT']
    },
    category: 'sql_type'
  },
  {
    input: 'JOIN 쿼리',
    output: {
      interpretation: 'JOIN이 포함된 SQL을 검색합니다.',
      filters: { sqlPattern: '%JOIN%', sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['복잡한 JOIN', '느린 JOIN']
    },
    category: 'sql_type'
  },
  {
    input: '조인 쿼리',
    output: {
      interpretation: 'JOIN이 포함된 SQL을 검색합니다.',
      filters: { sqlPattern: '%JOIN%', sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['OUTER JOIN', 'NESTED LOOP JOIN']
    },
    category: 'sql_type'
  },
  {
    input: '서브쿼리',
    output: {
      interpretation: '서브쿼리가 포함된 SQL을 검색합니다.',
      filters: { sqlPattern: '%SELECT%SELECT%', sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['중첩 서브쿼리', 'IN 절 서브쿼리']
    },
    category: 'sql_type'
  },
  {
    input: 'GROUP BY 쿼리',
    output: {
      interpretation: 'GROUP BY가 포함된 집계 SQL을 검색합니다.',
      filters: { sqlPattern: '%GROUP BY%', sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['복잡한 집계', 'HAVING 절 포함']
    },
    category: 'sql_type'
  },
  {
    input: '집계 쿼리',
    output: {
      interpretation: 'GROUP BY 집계 SQL을 검색합니다.',
      filters: { sqlPattern: '%GROUP BY%', sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['SUM/COUNT 쿼리', '대용량 집계']
    },
    category: 'sql_type'
  },
  {
    input: 'ORDER BY 쿼리',
    output: {
      interpretation: 'ORDER BY 정렬이 포함된 SQL을 검색합니다.',
      filters: { sqlPattern: '%ORDER BY%', sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['대용량 정렬', '인덱스 정렬']
    },
    category: 'sql_type'
  }
]

/**
 * Compound condition examples (복합 조건)
 */
export const COMPOUND_EXAMPLES: FewShotExample[] = [
  {
    input: '오늘 가장 느린 쿼리 10개',
    output: {
      interpretation: '오늘 실행된 SQL 중 가장 느린 10개를 검색합니다.',
      filters: { timeRange: '24h', sortBy: 'elapsed_time', sortOrder: 'desc', limit: 10 },
      suggestions: ['오늘 CPU 많이 쓴 쿼리', '오늘 자주 실행된 쿼리']
    },
    category: 'compound'
  },
  {
    input: '이번 주 자주 실행된 SELECT',
    output: {
      interpretation: '이번 주 실행 빈도가 높은 SELECT SQL을 검색합니다.',
      filters: { timeRange: '7d', sqlPattern: '%SELECT%', sortBy: 'executions', sortOrder: 'desc' },
      suggestions: ['이번 주 느린 SELECT', '이번 주 대용량 SELECT']
    },
    category: 'compound'
  },
  {
    input: '자주 실행되는 느린 쿼리',
    output: {
      interpretation: '실행 빈도가 높으면서 느린 SQL을 검색합니다.',
      filters: { minElapsedTime: 1000, sortBy: 'executions', sortOrder: 'desc' },
      suggestions: ['긴급 튜닝 대상', '비용 효과 높은 튜닝']
    },
    category: 'compound'
  },
  {
    input: 'HR 스키마 느린 쿼리',
    output: {
      interpretation: 'HR 스키마에서 실행 시간이 1초 이상인 SQL을 검색합니다.',
      filters: { schema: 'HR', minElapsedTime: 1000, sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['HR 전체 쿼리', 'HR JOIN 쿼리']
    },
    category: 'compound'
  },
  {
    input: 'SALES 스키마의 대용량 조회',
    output: {
      interpretation: 'SALES 스키마에서 Buffer Gets가 높은 SELECT SQL을 검색합니다.',
      filters: { schema: 'SALES', sqlPattern: '%SELECT%', minBufferGets: 50000, sortBy: 'buffer_gets', sortOrder: 'desc' },
      suggestions: ['SALES 인덱스 필요', 'SALES 파티션 검토']
    },
    category: 'compound'
  },
  {
    input: '최근 1시간 CPU 많이 쓴 쿼리',
    output: {
      interpretation: '최근 1시간 동안 CPU 사용량이 높은 SQL을 검색합니다.',
      filters: { timeRange: '1h', sortBy: 'cpu_time', sortOrder: 'desc' },
      suggestions: ['CPU 병목 분석', '연산 최적화']
    },
    category: 'compound'
  },
  {
    input: '지난 주 실행된 JOIN 쿼리 중 느린 것',
    output: {
      interpretation: '지난 주 실행된 JOIN SQL 중 실행 시간이 긴 것을 검색합니다.',
      filters: { timeRange: '7d', sqlPattern: '%JOIN%', minElapsedTime: 1000, sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['조인 최적화 필요', '인덱스 추가 검토']
    },
    category: 'compound'
  },
  {
    input: '상위 5개 느린 쿼리',
    output: {
      interpretation: '실행 시간이 가장 긴 상위 5개 SQL을 검색합니다.',
      filters: { sortBy: 'elapsed_time', sortOrder: 'desc', limit: 5 },
      suggestions: ['상위 10개', '상위 20개']
    },
    category: 'compound'
  },
  {
    input: '가장 많이 실행된 쿼리 20개',
    output: {
      interpretation: '실행 횟수가 가장 많은 상위 20개 SQL을 검색합니다.',
      filters: { sortBy: 'executions', sortOrder: 'desc', limit: 20 },
      suggestions: ['자주 실행되면서 느린', '핫스팟 쿼리']
    },
    category: 'compound'
  },
  {
    input: '어제 UPDATE 중 느린 것',
    output: {
      interpretation: '어제 실행된 UPDATE SQL 중 느린 것을 검색합니다.',
      filters: { timeRange: '24h', sqlPattern: '%UPDATE%', minElapsedTime: 1000, sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['UPDATE Lock 분석', 'UPDATE 최적화']
    },
    category: 'compound'
  },
  {
    input: '가장 느린 쿼리 하나',
    output: {
      interpretation: '실행 시간이 가장 긴 SQL 1개를 검색합니다.',
      filters: { sortBy: 'elapsed_time', sortOrder: 'desc', limit: 1 },
      suggestions: ['상위 5개 느린 쿼리', '상위 10개 느린 쿼리']
    },
    category: 'compound'
  },
  {
    input: '최근 1시간 가장 느린 쿼리 하나만',
    output: {
      interpretation: '최근 1시간 내 실행 시간이 가장 긴 SQL 1개를 검색합니다.',
      filters: { timeRange: '1h', sortBy: 'elapsed_time', sortOrder: 'desc', limit: 1 },
      suggestions: ['최근 1시간 느린 쿼리 10개', '오늘 가장 느린 쿼리']
    },
    category: 'compound'
  },
  {
    input: '1시간내 느린 쿼리 1개',
    output: {
      interpretation: '최근 1시간 내 가장 느린 SQL 1개를 검색합니다.',
      filters: { timeRange: '1h', sortBy: 'elapsed_time', sortOrder: 'desc', limit: 1 },
      suggestions: ['최근 1시간 느린 쿼리 전체', 'CPU 많이 쓴 쿼리 1개']
    },
    category: 'compound'
  },
  {
    input: 'CPU 가장 많이 쓰는 쿼리 1개',
    output: {
      interpretation: 'CPU 사용량이 가장 높은 SQL 1개를 검색합니다.',
      filters: { sortBy: 'cpu_time', sortOrder: 'desc', limit: 1 },
      suggestions: ['CPU 많이 쓰는 쿼리 10개', '느린 쿼리 1개']
    },
    category: 'compound'
  },
  {
    input: '오늘 실행된 쿼리 중 가장 느린 것 하나',
    output: {
      interpretation: '오늘(24시간 내) 실행된 SQL 중 가장 느린 1개를 검색합니다.',
      filters: { timeRange: '24h', sortBy: 'elapsed_time', sortOrder: 'desc', limit: 1 },
      suggestions: ['오늘 느린 쿼리 10개', '오늘 자주 실행된 쿼리']
    },
    category: 'compound'
  }
]

/**
 * Ambiguous query examples (모호한 쿼리)
 */
export const AMBIGUOUS_EXAMPLES: FewShotExample[] = [
  {
    input: '문제 있는 쿼리',
    output: {
      interpretation: '성능 이슈가 있는 SQL을 검색합니다. (실행시간 1초 이상 또는 Buffer Gets 높음)',
      filters: { minElapsedTime: 1000, sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['CPU 문제 쿼리', '메모리 문제 쿼리']
    },
    category: 'ambiguous'
  },
  {
    input: '개선 필요한 쿼리',
    output: {
      interpretation: '튜닝이 필요한 SQL을 검색합니다. (실행시간 긴 순)',
      filters: { minElapsedTime: 500, sortBy: 'elapsed_time', sortOrder: 'desc', limit: 20 },
      suggestions: ['긴급 튜닝 대상', '자주 실행되는 느린 쿼리']
    },
    category: 'ambiguous'
  },
  {
    input: '성능 나쁜 쿼리',
    output: {
      interpretation: '성능이 좋지 않은 SQL을 실행시간 순으로 검색합니다.',
      filters: { minElapsedTime: 1000, sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['리소스 많이 쓰는 쿼리', '튜닝 효과 높은 쿼리']
    },
    category: 'ambiguous'
  },
  {
    input: '확인해야 할 쿼리',
    output: {
      interpretation: '점검이 필요한 SQL을 검색합니다. (느린 쿼리 우선)',
      filters: { minElapsedTime: 2000, sortBy: 'elapsed_time', sortOrder: 'desc', limit: 20 },
      suggestions: ['자주 실행되는 쿼리', '최근 성능 저하 쿼리']
    },
    category: 'ambiguous'
  },
  {
    input: '튜닝 대상',
    output: {
      interpretation: '튜닝 대상 SQL을 실행시간 기준으로 검색합니다.',
      filters: { minElapsedTime: 1000, sortBy: 'elapsed_time', sortOrder: 'desc' },
      suggestions: ['비용 효과 높은 튜닝 대상', '긴급 튜닝 대상']
    },
    category: 'ambiguous'
  },
  {
    input: '최적화 필요',
    output: {
      interpretation: '최적화가 필요한 SQL을 Buffer Gets 기준으로 검색합니다.',
      filters: { minBufferGets: 10000, sortBy: 'buffer_gets', sortOrder: 'desc' },
      suggestions: ['인덱스 필요한 쿼리', '쿼리 재작성 필요']
    },
    category: 'ambiguous'
  }
]

/**
 * All examples combined
 */
export const ALL_EXAMPLES: FewShotExample[] = [
  ...TIME_EXAMPLES,
  ...PERFORMANCE_EXAMPLES,
  ...RESOURCE_EXAMPLES,
  ...SQL_TYPE_EXAMPLES,
  ...COMPOUND_EXAMPLES,
  ...AMBIGUOUS_EXAMPLES,
]

/**
 * Get examples by category
 */
export function getExamplesByCategory(category: FewShotExample['category']): FewShotExample[] {
  return ALL_EXAMPLES.filter(ex => ex.category === category)
}

/**
 * Get random examples for prompt (to avoid token limits)
 */
export function getRandomExamples(count: number = 10): FewShotExample[] {
  const shuffled = [...ALL_EXAMPLES].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

/**
 * Get balanced examples (equal from each category)
 */
export function getBalancedExamples(perCategory: number = 2): FewShotExample[] {
  const categories: FewShotExample['category'][] = ['time', 'performance', 'resource', 'sql_type', 'compound', 'ambiguous']
  const result: FewShotExample[] = []

  for (const category of categories) {
    const categoryExamples = getExamplesByCategory(category)
    const shuffled = [...categoryExamples].sort(() => Math.random() - 0.5)
    result.push(...shuffled.slice(0, perCategory))
  }

  return result
}

/**
 * Format examples for prompt
 */
export function formatExamplesForPrompt(examples: FewShotExample[], language: 'ko' | 'en' = 'ko'): string {
  if (language === 'ko') {
    return examples.map(ex =>
      `입력: "${ex.input}"\n출력: ${JSON.stringify(ex.output)}`
    ).join('\n\n')
  }

  return examples.map(ex =>
    `Input: "${ex.input}"\nOutput: ${JSON.stringify(ex.output)}`
  ).join('\n\n')
}
