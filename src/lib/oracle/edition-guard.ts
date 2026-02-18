/**
 * Oracle Edition Guard - 에디션 기반 기능 가용성 관리
 *
 * Oracle Standard Edition에서 사용 불가한 Enterprise Edition 전용 기능을
 * 체계적으로 감지하고 대안을 제공합니다.
 *
 * 이 모듈은 클라이언트/서버 양쪽에서 사용 가능합니다.
 * 서버 전용 함수(DB 조회)는 edition-guard-server.ts를 사용하세요.
 */

// ─── Types ───────────────────────────────────────────────────────────────

export type OracleEdition = 'Enterprise' | 'Standard' | 'Express' | 'Unknown';
export type OraclePack = 'Diagnostics Pack' | 'Tuning Pack';

export type OracleFeatureName =
  | 'AWR'
  | 'ASH'
  | 'SQL_MONITOR'
  | 'SQL_TUNING_ADVISOR'
  | 'SQL_ACCESS_ADVISOR'
  | 'STATSPACK'
  | 'V$SQL'
  | 'DBMS_XPLAN'
  | 'DBMS_STATS';

export interface AlternativeFeature {
  name: string;
  description: string;
  route?: string;
}

interface FeatureDefinition {
  label: string;
  edition: 'Enterprise' | 'Standard';
  packs?: OraclePack[];
  alternatives: AlternativeFeature[];
}

export interface FeatureAvailability {
  available: boolean;
  requiresEnterprise: boolean;
  requiredPack?: OraclePack;
  alternative?: AlternativeFeature;
  reason?: string;
}

// ─── Feature Registry ────────────────────────────────────────────────────

export const ORACLE_FEATURES: Record<OracleFeatureName, FeatureDefinition> = {
  // Diagnostics Pack 필요
  AWR: {
    label: 'AWR (Automatic Workload Repository)',
    edition: 'Enterprise',
    packs: ['Diagnostics Pack'],
    alternatives: [{
      name: 'STATSPACK',
      description: 'Oracle 표준 성능 통계 패키지 (Standard Edition 호환)',
      route: '/monitoring/statspack',
    }],
  },
  ASH: {
    label: 'ASH (Active Session History)',
    edition: 'Enterprise',
    packs: ['Diagnostics Pack'],
    alternatives: [{
      name: 'Custom ASH (V$SESSION)',
      description: 'V$SESSION 뷰 기반 실시간 세션 모니터링',
      route: '/ash',
    }],
  },

  // Tuning Pack 필요
  SQL_MONITOR: {
    label: 'SQL Monitor (V$SQL_MONITOR)',
    edition: 'Enterprise',
    packs: ['Tuning Pack'],
    alternatives: [{
      name: 'Top SQL 분석',
      description: 'V$SQL 뷰를 사용한 SQL 성능 분석',
      route: '/monitoring/top-sql',
    }],
  },
  SQL_TUNING_ADVISOR: {
    label: 'SQL Tuning Advisor (DBMS_SQLTUNE)',
    edition: 'Enterprise',
    packs: ['Tuning Pack'],
    alternatives: [{
      name: 'DBMS_XPLAN 분석',
      description: '실행계획 분석을 통한 수동 SQL 튜닝',
      route: '/execution-plans',
    }],
  },
  SQL_ACCESS_ADVISOR: {
    label: 'SQL Access Advisor',
    edition: 'Enterprise',
    packs: ['Tuning Pack'],
    alternatives: [{
      name: 'DBMS_XPLAN 분석',
      description: '실행계획 분석을 통한 인덱스 검토',
      route: '/execution-plans',
    }],
  },

  // Standard Edition 호환
  STATSPACK: {
    label: 'STATSPACK',
    edition: 'Standard',
    alternatives: [],
  },
  V$SQL: {
    label: 'V$SQL 모니터링',
    edition: 'Standard',
    alternatives: [],
  },
  DBMS_XPLAN: {
    label: 'DBMS_XPLAN 실행계획',
    edition: 'Standard',
    alternatives: [],
  },
  DBMS_STATS: {
    label: 'DBMS_STATS 통계 수집',
    edition: 'Standard',
    alternatives: [],
  },
};

// ─── Core Functions ──────────────────────────────────────────────────────

/**
 * V$VERSION BANNER 또는 저장된 에디션 문자열에서 Oracle 에디션 파싱
 */
export function parseOracleEdition(editionStr: string | null | undefined): OracleEdition {
  if (!editionStr) return 'Unknown';

  const normalized = editionStr.toLowerCase();

  if (normalized.includes('enterprise')) return 'Enterprise';
  if (normalized.includes('standard')) return 'Standard';
  if (normalized.includes('express')) return 'Express';

  return 'Unknown';
}

/**
 * 특정 기능의 가용성을 에디션 기반으로 확인
 */
export function checkFeatureAvailability(
  featureName: OracleFeatureName,
  currentEdition: OracleEdition,
): FeatureAvailability {
  const feature = ORACLE_FEATURES[featureName];

  if (!feature) {
    return { available: false, requiresEnterprise: false, reason: 'Unknown feature' };
  }

  const requiresEnterprise = feature.edition === 'Enterprise';
  const available = currentEdition === 'Enterprise' || !requiresEnterprise;

  return {
    available,
    requiresEnterprise,
    requiredPack: feature.packs?.[0],
    alternative: feature.alternatives[0],
    reason: !available
      ? `${feature.label}은(는) Oracle Enterprise Edition${feature.packs ? ` + ${feature.packs.join(', ')}` : ''}이 필요합니다.`
      : undefined,
  };
}

/**
 * SE에서 EE 전용 기능 요청 시 API 403 응답 생성
 * 기능이 사용 가능하면 null 반환
 */
export function createEnterpriseFeatureResponse(
  featureName: OracleFeatureName,
  currentEdition: OracleEdition,
) {
  const availability = checkFeatureAvailability(featureName, currentEdition);

  if (availability.available) return null;

  return {
    error: 'Enterprise Edition Required',
    requiresEnterprise: true,
    featureName: ORACLE_FEATURES[featureName]?.label || featureName,
    requiredPack: availability.requiredPack,
    alternative: availability.alternative,
    message: availability.reason,
    currentEdition,
  };
}

/**
 * 에디션이 Enterprise인지 간단히 확인
 */
export function isEnterprise(edition: OracleEdition): boolean {
  return edition === 'Enterprise';
}
