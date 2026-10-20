import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_DASHBOARD_SOURCE_CACHE_TTL_MS,
  clearAdminDashboardSourceCache,
  readThroughAdminDashboardCache,
  withAdminDashboardSourceCache,
} from "@/lib/admin/metrics/admin-dashboard-source-cache";
import { resolveAdminDashboardPeriod } from "@/lib/admin/metrics/dashboard-period";
import type { AdminDashboardSources } from "@/lib/admin/metrics/build-admin-dashboard-overview";

afterEach(() => clearAdminDashboardSourceCache());

const NOW = new Date("2026-10-20T09:27:00Z");

function fakeSources() {
  const metrics = vi.fn(async (key: string) => new Map([[key, { value: 1 }]]));
  const queue = vi.fn(async () => []);
  const trend = vi.fn(async () => []);
  const recent = vi.fn(async () => []);
  return { metrics, queue, trend, recent } as unknown as AdminDashboardSources & {
    metrics: typeof metrics;
    queue: typeof queue;
    trend: typeof trend;
  };
}

describe("대시보드 출처 캐시 (자동 갱신 부하 방지)", () => {
  it("같은 권한·기간·출처 = 한 번만 집계 (동시 요청·TTL 안 재요청 공유)", async () => {
    const src = fakeSources();
    const range = resolveAdminDashboardPeriod("today", NOW);
    const scope = { isSuperAdmin: true, permissions: [] };
    const a = withAdminDashboardSourceCache(src, { scope, range });
    const b = withAdminDashboardSourceCache(src, { scope, range });
    await Promise.all([a.metrics("members"), b.metrics("members"), a.queue(), b.queue()]);
    await a.metrics("members");
    expect(src.metrics).toHaveBeenCalledTimes(1);
    expect(src.queue).toHaveBeenCalledTimes(1);
  });

  it("권한 범위·기간이 다르면 공유하지 않는다 (권한 키 순서는 무관)", async () => {
    const src = fakeSources();
    const today = resolveAdminDashboardPeriod("today", NOW);
    const yesterday = resolveAdminDashboardPeriod("yesterday", NOW);
    await withAdminDashboardSourceCache(src, { scope: { isSuperAdmin: true, permissions: [] }, range: today }).queue();
    await withAdminDashboardSourceCache(src, { scope: { isSuperAdmin: false, permissions: ["users", "ads"] }, range: today }).queue();
    await withAdminDashboardSourceCache(src, { scope: { isSuperAdmin: false, permissions: ["ads", "users"] }, range: today }).queue();
    await withAdminDashboardSourceCache(src, { scope: { isSuperAdmin: false, permissions: ["ads"] }, range: today }).queue();
    await withAdminDashboardSourceCache(src, { scope: { isSuperAdmin: true, permissions: [] }, range: yesterday }).queue();
    expect(src.queue).toHaveBeenCalledTimes(4);
  });

  it("수동 새로고침(fresh)은 새로 읽고 · 추세·최근 활동은 캐시하지 않는다", async () => {
    const src = fakeSources();
    const range = resolveAdminDashboardPeriod("today", NOW);
    const scope = { isSuperAdmin: true, permissions: [] };
    await withAdminDashboardSourceCache(src, { scope, range }).metrics("ads");
    await withAdminDashboardSourceCache(src, { scope, range, fresh: true }).metrics("ads");
    expect(src.metrics).toHaveBeenCalledTimes(2);
    const c = withAdminDashboardSourceCache(src, { scope, range });
    await c.trend("signup_order_daily" as never, range.trend);
    await c.trend("signup_order_daily" as never, range.trend);
    expect(src.trend).toHaveBeenCalledTimes(2);
  });

  it("실패는 캐시하지 않고 · TTL 이 지나면 다시 읽는다", async () => {
    let n = 0;
    const load = vi.fn(async () => {
      n += 1;
      if (n === 1) throw new Error("down");
      return n;
    });
    await expect(readThroughAdminDashboardCache("k", load, { now: 0 })).rejects.toThrow("down");
    expect(await readThroughAdminDashboardCache("k", load, { now: 1 })).toBe(2);
    expect(await readThroughAdminDashboardCache("k", load, { now: 2 })).toBe(2);
    expect(await readThroughAdminDashboardCache("k", load, { now: 2 + ADMIN_DASHBOARD_SOURCE_CACHE_TTL_MS })).toBe(3);
    expect(load).toHaveBeenCalledTimes(3);
  });
});
