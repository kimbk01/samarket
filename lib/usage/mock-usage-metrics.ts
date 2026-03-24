/**
 * 58단계: 사용량/비용 mock
 */

import type { UsageMetric } from "@/lib/types/usage";

const now = new Date().toISOString();

const METRICS: UsageMetric[] = [
  {
    id: "um-1",
    dbUsage: 12.5,
    storageUsage: 8.2,
    bandwidth: 120,
    apiRequests: 450000,
    estimatedCost: 85,
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
  {
    id: "um-2",
    dbUsage: 13.1,
    storageUsage: 8.5,
    bandwidth: 145,
    apiRequests: 520000,
    estimatedCost: 92,
    createdAt: now,
  },
];

export function getUsageMetrics(limit?: number): UsageMetric[] {
  const list = [...METRICS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return limit ? list.slice(0, limit) : list;
}

export function getLatestUsageMetric(): UsageMetric | undefined {
  return getUsageMetrics(1)[0];
}
