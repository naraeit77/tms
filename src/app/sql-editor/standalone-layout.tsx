'use client';

/**
 * Standalone SQL Editor Layout
 * 팝업 창에서 사용되는 독립적인 SQL Editor 레이아웃
 */

import { useEffect, useState } from 'react';
import { SessionProvider } from 'next-auth/react';

interface StandaloneLayoutProps {
  children: React.ReactNode;
}

export default function StandaloneLayout({ children }: StandaloneLayoutProps) {
  const [isStandalone, setIsStandalone] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // 팝업 창인지 확인 (opener가 있고, 이름이 'SQL Editor'인 경우)
    const isPopup = window.opener !== null && window.name === 'SQL Editor';
    console.log('[StandaloneLayout] Checking if popup:', { isPopup, opener: window.opener, name: window.name });
    setIsStandalone(isPopup);

    // 팝업 창인 경우 타이틀 변경
    if (isPopup) {
      document.title = 'SQL Editor - Narae TMS';
    }
  }, []);

  // 마운트 전에는 아무것도 렌더링하지 않음 (hydration mismatch 방지)
  if (!mounted) {
    return null;
  }

  if (!isStandalone) {
    // 일반 모드: 대시보드 레이아웃 내에서 렌더링
    return <>{children}</>;
  }

  // 독립 모드: 팝업 창에서 렌더링 (SessionProvider로 감싸기)
  return (
    <SessionProvider refetchInterval={0} refetchOnWindowFocus={false}>
      <div className="h-screen flex flex-col bg-slate-50">
        {/* 간단한 헤더 */}
        <div className="h-14 bg-white border-b border-slate-200 flex items-center px-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">N</span>
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900">SQL Editor</h1>
              <p className="text-xs text-slate-500">Narae TMS</p>
            </div>
          </div>
        </div>

        {/* SQL Editor 컨텐츠 */}
        <div className="flex-1 overflow-hidden p-2">{children}</div>
      </div>
    </SessionProvider>
  );
}
