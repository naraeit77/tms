'use client';

/**
 * Performance Data Collection Scheduler
 * 클라이언트 사이드에서 주기적으로 성능 데이터 수집을 트리거
 */

interface CollectionConfig {
  connectionId: string;
  intervalMinutes: number;
  enabled: boolean;
}

interface CollectorState {
  isRunning: boolean;
  lastCollection: Date | null;
  nextCollection: Date | null;
  collectionsCount: number;
  errorCount: number;
  lastError: string | null;
}

class PerformanceCollector {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private states: Map<string, CollectorState> = new Map();
  private configs: Map<string, CollectionConfig> = new Map();

  /**
   * 특정 연결에 대한 수집 스케줄러 시작
   */
  start(connectionId: string, intervalMinutes: number = 10): void {
    // 기존 타이머 정리
    this.stop(connectionId);

    const config: CollectionConfig = {
      connectionId,
      intervalMinutes,
      enabled: true,
    };
    this.configs.set(connectionId, config);

    // 초기 상태 설정
    this.states.set(connectionId, {
      isRunning: true,
      lastCollection: null,
      nextCollection: new Date(Date.now() + intervalMinutes * 60 * 1000),
      collectionsCount: 0,
      errorCount: 0,
      lastError: null,
    });

    // 즉시 첫 수집 실행
    this.collect(connectionId);

    // 주기적 수집 시작
    const timer = setInterval(() => {
      this.collect(connectionId);
    }, intervalMinutes * 60 * 1000);

    this.timers.set(connectionId, timer);
    console.log(`[PerformanceCollector] Started for ${connectionId} with ${intervalMinutes}min interval`);
  }

  /**
   * 특정 연결에 대한 수집 스케줄러 중지
   */
  stop(connectionId: string): void {
    const timer = this.timers.get(connectionId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(connectionId);
    }

    const state = this.states.get(connectionId);
    if (state) {
      state.isRunning = false;
      state.nextCollection = null;
    }

    const config = this.configs.get(connectionId);
    if (config) {
      config.enabled = false;
    }

    console.log(`[PerformanceCollector] Stopped for ${connectionId}`);
  }

  /**
   * 모든 스케줄러 중지
   */
  stopAll(): void {
    for (const connectionId of this.timers.keys()) {
      this.stop(connectionId);
    }
  }

  /**
   * 수동 수집 트리거
   */
  async collectNow(connectionId: string): Promise<boolean> {
    return this.collect(connectionId);
  }

  /**
   * 수집 실행
   */
  private async collect(connectionId: string): Promise<boolean> {
    const state = this.states.get(connectionId);
    const config = this.configs.get(connectionId);

    if (!state || !config || !config.enabled) {
      return false;
    }

    try {
      console.log(`[PerformanceCollector] Collecting for ${connectionId}...`);

      const response = await fetch('/api/monitoring/collect-performance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ connection_id: connectionId }),
      });

      const result = await response.json();

      if (result.success) {
        state.lastCollection = new Date();
        state.nextCollection = new Date(Date.now() + config.intervalMinutes * 60 * 1000);
        state.collectionsCount++;
        state.lastError = null;
        console.log(`[PerformanceCollector] Success: ${result.records_inserted} records in ${result.duration_ms}ms`);
        return true;
      } else {
        state.errorCount++;
        state.lastError = result.message || result.error || 'Collection failed';
        console.error(`[PerformanceCollector] Failed: ${state.lastError}`);
        return false;
      }
    } catch (error) {
      state.errorCount++;
      state.lastError = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[PerformanceCollector] Error:`, error);
      return false;
    }
  }

  /**
   * 특정 연결의 상태 조회
   */
  getState(connectionId: string): CollectorState | null {
    return this.states.get(connectionId) || null;
  }

  /**
   * 특정 연결의 설정 조회
   */
  getConfig(connectionId: string): CollectionConfig | null {
    return this.configs.get(connectionId) || null;
  }

  /**
   * 스케줄러 실행 여부 확인
   */
  isRunning(connectionId: string): boolean {
    return this.timers.has(connectionId);
  }

  /**
   * 설정 업데이트 (interval 변경 시 재시작)
   */
  updateConfig(connectionId: string, intervalMinutes: number): void {
    const config = this.configs.get(connectionId);
    if (config && config.enabled) {
      // interval이 변경된 경우에만 재시작
      if (config.intervalMinutes !== intervalMinutes) {
        this.start(connectionId, intervalMinutes);
      }
    }
  }
}

// 싱글톤 인스턴스
export const performanceCollector = new PerformanceCollector();

// React Hook for using the collector
export function usePerformanceCollector(connectionId: string | null) {
  const start = (intervalMinutes: number = 10) => {
    if (connectionId) {
      performanceCollector.start(connectionId, intervalMinutes);
    }
  };

  const stop = () => {
    if (connectionId) {
      performanceCollector.stop(connectionId);
    }
  };

  const collectNow = async () => {
    if (connectionId) {
      return performanceCollector.collectNow(connectionId);
    }
    return false;
  };

  const getState = () => {
    if (connectionId) {
      return performanceCollector.getState(connectionId);
    }
    return null;
  };

  const isRunning = () => {
    if (connectionId) {
      return performanceCollector.isRunning(connectionId);
    }
    return false;
  };

  return {
    start,
    stop,
    collectNow,
    getState,
    isRunning,
  };
}
