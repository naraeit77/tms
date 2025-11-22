// Convert Korean text to English for PDF generation

export function convertImprovementToEnglish(description: string): string {
  const translations: Record<string, string> = {
    '인덱스 최적화를 통한 스캔 효율성 개선': 'Index optimization for scan efficiency improvement',
    '복잡한 조인 쿼리 리팩토링': 'Complex join query refactoring',
    '통계 정보 업데이트 자동화': 'Automated statistics information update',
    '파티셔닝 전략 개선': 'Partitioning strategy improvement'
  }

  return translations[description] || description
}

export function convertStatusToEnglish(status: string): string {
  const translations: Record<string, string> = {
    'implemented': 'Implemented',
    'planned': 'Planned',
    'recommended': 'Recommended'
  }

  return translations[status] || status
}

export interface ReportDataEnglish {
  period: string
  totalSQL: number
  totalExecutions: number
  avgResponseTime: number
  performanceGrades: {
    A: number
    B: number
    C: number
    D: number
    F: number
  }
  topProblematicSQL: {
    sql_id: string
    issues: number
    impact: 'high' | 'medium' | 'low'
  }[]
  improvements: {
    description: string
    impact: number
    status: 'implemented' | 'planned' | 'recommended'
  }[]
  resourceUtilization: {
    cpu: number
    memory: number
    io: number
  }
}

export function convertReportDataToEnglish(data: any): ReportDataEnglish {
  return {
    ...data,
    improvements: data.improvements.map((imp: any) => ({
      description: convertImprovementToEnglish(imp.description),
      impact: imp.impact,
      status: imp.status
    }))
  }
}
