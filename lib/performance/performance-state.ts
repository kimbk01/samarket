/**
 * 성능 운영 — 메트릭·느린 쿼리 단일 저장소.
 * 영속화: `performance-ops-db` + `/api/admin/performance-ops`
 */
import type { PerformanceMetric, SlowQuery } from "@/lib/types/performance";

function isoNow() {
  return new Date().toISOString();
}

function defaultMetrics(): PerformanceMetric[] {
  const now = isoNow();
  return [
    {
      id: "pm-1",
      route: "/",
      loadTime: 420,
      apiTime: 180,
      dbQueryTime: 95,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "pm-2",
      route: "/products",
      loadTime: 580,
      apiTime: 220,
      dbQueryTime: 150,
      createdAt: new Date(Date.now() - 1800000).toISOString(),
    },
    {
      id: "pm-3",
      route: "/admin/dashboard",
      loadTime: 720,
      apiTime: 380,
      dbQueryTime: 200,
      createdAt: new Date(Date.now() - 900000).toISOString(),
    },
    {
      id: "pm-4",
      route: "/",
      loadTime: 380,
      apiTime: 160,
      dbQueryTime: 80,
      createdAt: now,
    },
  ];
}

function defaultSlowQueries(): SlowQuery[] {
  const now = isoNow();
  return [
    {
      id: "sq-1",
      queryName: "getProductsWithUser",
      duration: 1200,
      route: "/products",
      detectedAt: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: "sq-2",
      queryName: "getAdminDashboardStats",
      duration: 850,
      route: "/admin/dashboard",
      detectedAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "sq-3",
      queryName: "listChatsWithMessages",
      duration: 650,
      route: "/chats",
      detectedAt: now,
    },
  ];
}

const METRICS: PerformanceMetric[] = defaultMetrics();
const SLOW_QUERIES: SlowQuery[] = defaultSlowQueries();

export type PerformanceOpsBundleV1 = {
  version: 1;
  metrics: PerformanceMetric[];
  slowQueries: SlowQuery[];
};

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultPerformanceOpsBundle(): PerformanceOpsBundleV1 {
  return {
    version: 1,
    metrics: defaultMetrics().map((m) => ({ ...m })),
    slowQueries: defaultSlowQueries().map((q) => ({ ...q })),
  };
}

export function importPerformanceOpsBundle(bundle: PerformanceOpsBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(METRICS, (bundle.metrics ?? []).map((m) => ({ ...m })));
  replaceArray(SLOW_QUERIES, (bundle.slowQueries ?? []).map((q) => ({ ...q })));
  if (!METRICS.length) replaceArray(METRICS, defaultMetrics());
  if (!SLOW_QUERIES.length) replaceArray(SLOW_QUERIES, defaultSlowQueries());
}

export function exportPerformanceOpsBundle(): PerformanceOpsBundleV1 {
  return {
    version: 1,
    metrics: METRICS.map((m) => ({ ...m })),
    slowQueries: SLOW_QUERIES.map((q) => ({ ...q })),
  };
}

export function getPerformanceMetrics(filters?: { route?: string }): PerformanceMetric[] {
  let list = [...METRICS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.route) list = list.filter((m) => m.route === filters.route);
  return list;
}

export function getPerformanceMetricsSummary(): {
  avgLoadTime: number;
  avgApiTime: number;
  avgDbQueryTime: number;
} {
  const list = getPerformanceMetrics();
  const n = list.length;
  if (n === 0) return { avgLoadTime: 0, avgApiTime: 0, avgDbQueryTime: 0 };
  const sumLoad = list.reduce((s, m) => s + m.loadTime, 0);
  const sumApi = list.reduce((s, m) => s + m.apiTime, 0);
  const sumDb = list.reduce((s, m) => s + m.dbQueryTime, 0);
  return {
    avgLoadTime: Math.round(sumLoad / n),
    avgApiTime: Math.round(sumApi / n),
    avgDbQueryTime: Math.round(sumDb / n),
  };
}

export function getSlowQueries(filters?: { route?: string }): SlowQuery[] {
  let list = [...SLOW_QUERIES].sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
  );
  if (filters?.route) list = list.filter((q) => q.route === filters.route);
  return list;
}
