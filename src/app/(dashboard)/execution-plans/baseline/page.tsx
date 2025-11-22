'use client';

/**
 * Execution Plans Baseline Page (Redirect)
 * SQL Plan Baselines 페이지 (리다이렉트)
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ExecutionPlansBaselinePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/plan-baselines');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin h-12 w-12 border-4 border-slate-900 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-muted-foreground">페이지를 이동 중입니다...</p>
      </div>
    </div>
  );
}
