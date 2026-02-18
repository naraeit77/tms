'use client'

import { AlertCircle, Info, ArrowRight, Shield } from 'lucide-react'
import Link from 'next/link'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { AlternativeFeature } from '@/lib/oracle/edition-guard'

interface EnterpriseFeatureAlertProps {
  featureName: string
  requiredPack?: string
  alternative?: AlternativeFeature
  currentEdition?: string
  compact?: boolean
}

export function EnterpriseFeatureAlert({
  featureName,
  requiredPack,
  alternative,
  currentEdition,
  compact = false,
}: EnterpriseFeatureAlertProps) {
  if (compact) {
    return (
      <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
        <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <AlertDescription className="text-sm">
          <strong>{featureName}</strong> 기능은 Oracle Enterprise Edition
          {requiredPack && ` + ${requiredPack}`}이 필요합니다.
          {alternative?.route && (
            <>
              {' '}대안:{' '}
              <Link href={alternative.route} className="underline font-medium hover:text-amber-800">
                {alternative.name}
              </Link>
            </>
          )}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
      <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertTitle className="text-amber-800 dark:text-amber-200">
        Enterprise Edition 전용 기능
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-3">
        <p className="text-amber-700 dark:text-amber-300">
          <strong>{featureName}</strong> 기능은 Oracle Enterprise Edition
          {requiredPack && (
            <> + <span className="font-semibold">{requiredPack}</span></>
          )}
          이 필요합니다.
        </p>

        {currentEdition && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            현재 연결된 데이터베이스: Oracle {currentEdition} Edition
          </p>
        )}

        {alternative && (
          <div className="bg-white/60 dark:bg-white/5 p-3 rounded-md border border-amber-100 dark:border-amber-800">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                  대안 기능: {alternative.name}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {alternative.description}
                </p>
                {alternative.route && (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="mt-2"
                  >
                    <Link href={alternative.route}>
                      {alternative.name} 페이지로 이동
                      <ArrowRight className="ml-2 h-3 w-3" />
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </AlertDescription>
    </Alert>
  )
}
