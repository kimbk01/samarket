/**
 * 58단계: 비용 최적화 타입
 */

export interface UsageMetric {
  id: string;
  dbUsage: number;
  storageUsage: number;
  bandwidth: number;
  apiRequests: number;
  estimatedCost: number;
  createdAt: string;
}
