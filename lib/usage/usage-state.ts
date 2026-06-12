/**
 * 사용량·비용 운영 — 메트릭 단일 저장소.
 * 영속화: `usage-ops-db` + `/api/admin/usage-ops`
 */
import type { UsageMetric } from "@/lib/types/usage";

function isoNow() {
  return new Date().toISOString();
}

function defaultUsageMetrics(): UsageMetric[] {
  const now = isoNow();
  return [
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
}

const METRICS: UsageMetric[] = defaultUsageMetrics();

export type UsageOpsBundleV1 = {
  version: 1;
  usageMetrics: UsageMetric[];
};

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultUsageOpsBundle(): UsageOpsBundleV1 {
  return {
    version: 1,
    usageMetrics: defaultUsageMetrics().map((m) => ({ ...m })),
  };
}

export function importUsageOpsBundle(bundle: UsageOpsBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(METRICS, (bundle.usageMetrics ?? []).map((m) => ({ ...m })));
  if (!METRICS.length) replaceArray(METRICS, defaultUsageMetrics());
}

export function exportUsageOpsBundle(): UsageOpsBundleV1 {
  return {
    version: 1,
    usageMetrics: METRICS.map((m) => ({ ...m })),
  };
}

export function getUsageMetrics(limit?: number): UsageMetric[] {
  const list = [...METRICS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return limit ? list.slice(0, limit) : list;
}

export function getLatestUsageMetric(): UsageMetric | undefined {
  return getUsageMetrics(1)[0];
}
