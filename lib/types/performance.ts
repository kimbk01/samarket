/**
 * 57단계: 성능 최적화 타입
 */

export interface PerformanceMetric {
  id: string;
  route: string;
  loadTime: number;
  apiTime: number;
  dbQueryTime: number;
  createdAt: string;
}

export interface SlowQuery {
  id: string;
  queryName: string;
  duration: number;
  route: string;
  detectedAt: string;
}
