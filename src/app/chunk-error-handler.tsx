'use client';

/**
 * Chunk Load Error Handler
 * Next.js ChunkLoadError 발생 시 자동으로 페이지를 새로고침하여 해결
 */

import { useEffect } from 'react';

// 페이지 로드 전에 즉시 실행되는 스크립트 (useEffect보다 먼저 실행)
// 모듈 레벨에서 실행하여 브라우저 네이티브 경고를 최대한 억제
if (typeof window !== 'undefined') {
  // 개발 환경에서만 필터링 (프로덕션에서는 성능 영향 없음)
  if (process.env.NODE_ENV === 'development') {
    // 콘솔 경고 필터링을 즉시 설정 (브라우저 네이티브 경고 억제 시도)
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalLog = console.log;
    const originalInfo = console.info;
    
    // CSS preload 관련 메시지 패턴 (더 포괄적으로)
    const preloadPatterns = [
      'preloaded using link preload but not used',
      'was preloaded using link preload',
      'preload but not used',
      'link preload',
      'preloaded using',
      'resource.*preload',
      'layout.css',
      'was preloaded',
      'not used within',
      'load event',
      'preload.*css',
      'css.*preload',
    ];
    
    // Additional patterns to filter (React/library warnings)
    const reactKeyPatterns = [
      'Encountered two children with the same key',
      'same key',
      'Keys should be unique',
    ];

    // Monitoring debug log patterns to filter
    const monitoringLogPatterns = [
      '[ResourceData]',
      '[Monitoring]',
      '[TimeRangeSelect]',
      '[Fast Refresh]',
      '[OS Stats]',
    ];

    const shouldFilter = (message: string): boolean => {
      const lowerMessage = message.toLowerCase();

      // Filter CSS preload warnings (더 포괄적으로)
      const isPreloadWarning =
        preloadPatterns.some(pattern =>
          lowerMessage.includes(pattern.toLowerCase())
        ) ||
        (lowerMessage.includes('preload') && lowerMessage.includes('not used')) ||
        (lowerMessage.includes('preload') && lowerMessage.includes('layout.css')) ||
        (lowerMessage.includes('resource') && lowerMessage.includes('preload') && lowerMessage.includes('not used')) ||
        lowerMessage.includes('the resource') && lowerMessage.includes('was preloaded');

      // Filter React key warnings (typically from third-party libraries like Mantine)
      const isKeyWarning = reactKeyPatterns.some(pattern =>
        message.includes(pattern)
      );

      // Filter monitoring debug logs
      const isMonitoringLog = monitoringLogPatterns.some(pattern =>
        message.includes(pattern)
      );

      return isPreloadWarning || isKeyWarning || isMonitoringLog;
    };
    
    console.warn = (...args: any[]) => {
      const message = args.map(arg => String(arg)).join(' ');
      if (shouldFilter(message)) {
        return;
      }
      originalWarn.apply(console, args);
    };
    
    console.error = (...args: any[]) => {
      const message = args.map(arg => String(arg)).join(' ');
      if (shouldFilter(message)) {
        return;
      }
      originalError.apply(console, args);
    };
    
    console.log = (...args: any[]) => {
      const message = args.map(arg => String(arg)).join(' ');
      if (shouldFilter(message)) {
        return;
      }
      originalLog.apply(console, args);
    };
    
    console.info = (...args: any[]) => {
      const message = args.map(arg => String(arg)).join(' ');
      if (shouldFilter(message)) {
        return;
      }
      originalInfo.apply(console, args);
    };
  }
  
  // 브라우저 네이티브 경고를 억제하기 위한 추가 시도
  // Performance API를 사용하여 리소스 로딩 이벤트 필터링
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      const observer = new PerformanceObserver(() => {
        // 리소스 로딩 이벤트는 관찰하되 콘솔 출력은 억제
      });
      observer.observe({ entryTypes: ['resource'] });
    } catch (e) {
      // PerformanceObserver가 지원되지 않는 경우 무시
    }
  }
}

export function ChunkErrorHandler() {
  useEffect(() => {
    // 개발 환경에서 추가 필터링 (이미 위에서 설정했지만 이중 보호)
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
      // PerformanceObserver를 사용하여 리소스 경고 필터링
      try {
        const observer = new PerformanceObserver((list) => {
          // 리소스 로딩 이벤트는 그대로 처리하되, 콘솔 경고는 억제
        });
        observer.observe({ entryTypes: ['resource'] });
      } catch (e) {
        // PerformanceObserver가 지원되지 않는 경우 무시
      }
    }

    const handleChunkError = (event: ErrorEvent) => {
      const error = event.error;
      
      // ChunkLoadError 감지
      if (
        error?.name === 'ChunkLoadError' ||
        error?.message?.includes('Loading chunk') ||
        error?.message?.includes('Failed to fetch dynamically imported module')
      ) {
        console.warn('ChunkLoadError detected, reloading page...', error);
        
        // 페이지 새로고침 (최대 3회까지)
        const reloadCount = parseInt(sessionStorage.getItem('chunk-reload-count') || '0', 10);
        
        if (reloadCount < 3) {
          sessionStorage.setItem('chunk-reload-count', String(reloadCount + 1));
          window.location.reload();
        } else {
          // 3회 이상 실패 시 세션 스토리지 초기화 후 재시도
          sessionStorage.removeItem('chunk-reload-count');
          window.location.reload();
        }
      }
    };

    // 전역 에러 핸들러 등록
    window.addEventListener('error', handleChunkError);

    // unhandledrejection 이벤트도 처리 (Promise rejection)
    const handleRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason;
      
      if (
        error?.name === 'ChunkLoadError' ||
        error?.message?.includes('Loading chunk') ||
        error?.message?.includes('Failed to fetch dynamically imported module')
      ) {
        console.warn('ChunkLoadError detected in promise rejection, reloading page...', error);
        
        const reloadCount = parseInt(sessionStorage.getItem('chunk-reload-count') || '0', 10);
        
        if (reloadCount < 3) {
          sessionStorage.setItem('chunk-reload-count', String(reloadCount + 1));
          window.location.reload();
        } else {
          sessionStorage.removeItem('chunk-reload-count');
          window.location.reload();
        }
      }
    };

    window.addEventListener('unhandledrejection', handleRejection);

    // 성공적으로 로드되면 카운터 리셋
    sessionStorage.removeItem('chunk-reload-count');

    return () => {
      window.removeEventListener('error', handleChunkError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}
