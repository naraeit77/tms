'use client'

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface ReportSummary {
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

// Convert Korean improvement descriptions to English
function convertImprovementToEnglish(description: string): string {
  const translations: Record<string, string> = {
    '인덱스 최적화를 통한 스캔 효율성 개선': 'Index optimization for scan efficiency improvement',
    '복잡한 조인 쿼리 리팩토링': 'Complex join query refactoring',
    '통계 정보 업데이트 자동화': 'Automated statistics information update',
    '파티셔닝 전략 개선': 'Partitioning strategy improvement'
  }
  return translations[description] || description
}

export function generatePerformanceSummaryPDF(data: ReportSummary, databaseName?: string) {
  // Convert Korean text to English for PDF compatibility
  const englishData = {
    ...data,
    improvements: data.improvements.map((imp) => ({
      description: convertImprovementToEnglish(imp.description),
      impact: imp.impact,
      status: imp.status
    }))
  }

  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  let yPosition = 20

  // Title
  doc.setFontSize(20)
  doc.setFont('helvetica', 'bold')
  doc.text('Performance Summary Report', pageWidth / 2, yPosition, { align: 'center' })
  yPosition += 10

  // Subtitle with database and period
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  const periodText = getPeriodText(data.period)
  const subtitle = databaseName
    ? `Database: ${databaseName} | Period: ${periodText}`
    : `Period: ${periodText}`
  doc.text(subtitle, pageWidth / 2, yPosition, { align: 'center' })
  yPosition += 5

  // Generated date
  doc.setFontSize(10)
  doc.setTextColor(100)
  const generatedDate = new Date().toISOString().replace('T', ' ').substring(0, 19)
  doc.text(`Generated: ${generatedDate}`, pageWidth / 2, yPosition, { align: 'center' })
  doc.setTextColor(0)
  yPosition += 15

  // Section 1: Executive Summary
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('1. Executive Summary', 15, yPosition)
  yPosition += 10

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')

  const summaryData = [
    ['Total SQL Statements', formatNumber(englishData.totalSQL)],
    ['Total Executions', formatNumber(englishData.totalExecutions)],
    ['Average Response Time', `${englishData.avgResponseTime.toFixed(3)}s`],
    ['CPU Utilization', `${englishData.resourceUtilization.cpu}%`],
    ['Memory Utilization', `${englishData.resourceUtilization.memory}%`],
    ['I/O Utilization', `${englishData.resourceUtilization.io}%`]
  ]

  autoTable(doc, {
    startY: yPosition,
    head: [['Metric', 'Value']],
    body: summaryData,
    theme: 'grid',
    headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 60, halign: 'right' }
    },
    margin: { left: 15, right: 15 }
  })

  yPosition = (doc as any).lastAutoTable.finalY + 15

  // Section 2: Performance Grade Distribution
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('2. Performance Grade Distribution', 15, yPosition)
  yPosition += 10

  const totalGraded = Object.values(englishData.performanceGrades).reduce((sum, count) => sum + count, 0)
  const gradeData = Object.entries(englishData.performanceGrades).map(([grade, count]) => [
    `Grade ${grade}`,
    formatNumber(count),
    `${((count / totalGraded) * 100).toFixed(1)}%`,
    getGradeDescription(grade)
  ])

  autoTable(doc, {
    startY: yPosition,
    head: [['Grade', 'Count', 'Percentage', 'Description']],
    body: gradeData,
    theme: 'striped',
    headStyles: { fillColor: [92, 184, 92], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 25, halign: 'center' },
      1: { cellWidth: 30, halign: 'right' },
      2: { cellWidth: 30, halign: 'right' },
      3: { cellWidth: 95 }
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 0) {
        const grade = data.cell.text[0].replace('Grade ', '')
        data.cell.styles.fillColor = getGradeColor(grade)
        data.cell.styles.textColor = grade === 'A' || grade === 'B' ? [0, 0, 0] : [255, 255, 255]
      }
    },
    margin: { left: 15, right: 15 }
  })

  yPosition = (doc as any).lastAutoTable.finalY + 15

  // Check if we need a new page
  if (yPosition > pageHeight - 60) {
    doc.addPage()
    yPosition = 20
  }

  // Section 3: Top Problematic SQL
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('3. Top Problematic SQL Statements', 15, yPosition)
  yPosition += 10

  if (englishData.topProblematicSQL.length > 0) {
    const problematicData = englishData.topProblematicSQL.map((sql, index) => [
      `#${index + 1}`,
      sql.sql_id,
      sql.issues.toString(),
      sql.impact.toUpperCase()
    ])

    autoTable(doc, {
      startY: yPosition,
      head: [['Rank', 'SQL ID', 'Issues', 'Impact']],
      body: problematicData,
      theme: 'grid',
      headStyles: { fillColor: [217, 83, 79], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center' },
        1: { cellWidth: 70 },
        2: { cellWidth: 25, halign: 'center' },
        3: { cellWidth: 35, halign: 'center' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          const impact = data.cell.text[0]
          if (impact === 'HIGH') {
            data.cell.styles.fillColor = [217, 83, 79]
            data.cell.styles.textColor = [255, 255, 255]
          } else if (impact === 'MEDIUM') {
            data.cell.styles.fillColor = [240, 173, 78]
            data.cell.styles.textColor = [0, 0, 0]
          } else {
            data.cell.styles.fillColor = [91, 192, 222]
            data.cell.styles.textColor = [0, 0, 0]
          }
        }
      },
      margin: { left: 15, right: 15 }
    })

    yPosition = (doc as any).lastAutoTable.finalY + 15
  } else {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'italic')
    doc.text('No problematic SQL statements found.', 15, yPosition)
    yPosition += 15
  }

  // Check if we need a new page
  if (yPosition > pageHeight - 80) {
    doc.addPage()
    yPosition = 20
  }

  // Section 4: Recommendations
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('4. Performance Improvement Recommendations', 15, yPosition)
  yPosition += 10

  const improvementData = englishData.improvements.map((imp, index) => [
    `${index + 1}`,
    imp.description,
    `${imp.impact}%`,
    imp.status.charAt(0).toUpperCase() + imp.status.slice(1)
  ])

  autoTable(doc, {
    startY: yPosition,
    head: [['#', 'Recommendation', 'Impact', 'Status']],
    body: improvementData,
    theme: 'striped',
    headStyles: { fillColor: [240, 173, 78], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 110 },
      2: { cellWidth: 25, halign: 'center' },
      3: { cellWidth: 35, halign: 'center' }
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 3) {
        const status = data.cell.text[0]
        if (status === 'Implemented') {
          data.cell.styles.fillColor = [92, 184, 92]
          data.cell.styles.textColor = [255, 255, 255]
        } else if (status === 'Planned') {
          data.cell.styles.fillColor = [91, 192, 222]
          data.cell.styles.textColor = [255, 255, 255]
        }
      }
    },
    margin: { left: 15, right: 15 }
  })

  yPosition = (doc as any).lastAutoTable.finalY + 20

  // Footer on each page
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(9)
    doc.setTextColor(150)
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    )
    doc.text(
      'Generated by Narae TMS v2.0',
      pageWidth - 15,
      pageHeight - 10,
      { align: 'right' }
    )
  }

  return doc
}

function getPeriodText(period: string): string {
  switch (period) {
    case '24h': return 'Last 24 Hours'
    case '7d': return 'Last 7 Days'
    case '30d': return 'Last 30 Days'
    case '90d': return 'Last 90 Days'
    default: return 'Last 7 Days'
  }
}

function formatNumber(num: number): string {
  return num.toLocaleString()
}

function getGradeDescription(grade: string): string {
  switch (grade) {
    case 'A': return 'Excellent Performance'
    case 'B': return 'Good Performance'
    case 'C': return 'Average Performance'
    case 'D': return 'Poor Performance'
    case 'F': return 'Critical Issues'
    default: return ''
  }
}

function getGradeColor(grade: string): [number, number, number] {
  switch (grade) {
    case 'A': return [92, 184, 92]   // Green
    case 'B': return [91, 192, 222]  // Light Blue
    case 'C': return [240, 173, 78]  // Yellow
    case 'D': return [255, 165, 0]   // Orange
    case 'F': return [217, 83, 79]   // Red
    default: return [200, 200, 200]  // Gray
  }
}

export function downloadPDF(doc: jsPDF, filename: string) {
  doc.save(filename)
}

export function generateReportFilename(period: string, databaseName?: string): string {
  const date = new Date().toISOString().split('T')[0]
  const dbPart = databaseName ? `_${databaseName.replace(/\s+/g, '_')}` : ''
  return `Performance_Report${dbPart}_${period}_${date}.pdf`
}
