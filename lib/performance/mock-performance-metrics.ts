/**
 * 57단계: 성능 메트릭 mock
 */

import type { PerformanceMetric } from "@/lib/types/performance";

const now = new Date().toISOString();

const METRICS: PerformanceMetric[] = [
  { id: "pm-1", route: "/", loadTime: 420, apiTime: 180, dbQueryTime: 95, createdAt: new Date(Date.now() - 3600000).toISOString() },
  { id: "pm-2", route: "/products", loadTime: 580, apiTime: 220, dbQueryTime: 150, createdAt: new Date(Date.now() - 1800000).toISOString() },
  { id: "pm-3", route: "/admin/dashboard", loadTime: 720, apiTime: 380, dbQueryTime: 200, createdAt: new Date(Date.now() - 900000).toISOString() },
  { id: "pm-4", route: "/", loadTime: 380, apiTime: 160, dbQueryTime: 80, createdAt: now },
];

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
