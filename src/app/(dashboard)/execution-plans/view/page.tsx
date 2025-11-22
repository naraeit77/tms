'use client';

/**
 * Execution Plans View Page (Redirect)
 * 실행계획 조회 페이지 (리다이렉트)
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ExecutionPlansViewPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/execution-plans');
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
