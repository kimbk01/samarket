import { describe, expect, it, vi } from "vitest";
import {
  ADMIN_ACTION_QUEUE_REGISTRY,
  type AdminActionQueueCategoryResult,
} from "@/lib/admin/admin-action-queue-registry";
import {
  buildAdminDashboardOverview,
  type AdminDashboardMetricMap,
  type AdminDashboardSources,
} from "@/lib/admin/metrics/build-admin-dashboard-overview";
import {
  formatAdminDashboardValue,
  mergeAdminDashboardBand,
  mergeAdminDashboardMetric,
  mergeAdminDashboardPending,
  adminDashboardPayloadHasErrors,
  parseAdminDashboardParts,
  type AdminDashboardMetricValue,
} from "@/lib/admin/metrics/dashboard-overview-contract";
import { resolveAdminDashboardPeriod } from "@/lib/admin/metrics/dashboard-period";
import type { AdminMetricSourceKey } from "@/lib/admin/metrics/registry";
import { bucketDailyPht, manilaDailyKeys } from "@/lib/admin/metrics/load-admin-dashboard-sources";

const SUPER = { role: "super_admin", permissions: [] as string[] };
const OPERATOR = { role: "admin", permissions: ["reports", "ads"] as string[] };
const NOW = new Date("2026-10-20T09:27:00Z"); // 17:27 PHT

function queueRows(
  over: Partial<Record<string, Partial<AdminActionQueueCategoryResult>>> = {}
): AdminActionQueueCategoryResult[] {
  return ADMIN_ACTION_QUEUE_REGISTRY.map((d) => ({
    key: d.key,
    count: 1,
    status: "ok" as const,
    inTotal: d.lifecycle === "active" && d.nextActor === "admin",
    nextActor: d.nextActor,
    listHref: d.listHref,
    ...(over[d.key] ?? {}),
  }));
}

const VALUES: Record<string, Record<string, { value: number | null; forbidden?: boolean }>> = {
  members: {
    "members.total": { value: 122 },
    "members.active": { value: 85 },
    "members.new": { value: 3 },
    "members.suspended": { value: 1 },
    "members.blocked": { value: 1 },
    "members.deletion_requests": { value: 2 },
  },
  community: { "community.posts_active.member": { value: 50 } },
  community_reports: { "community.report_targets_pending": { value: 4 } },
  trade: {
    "trade.posts.selling": { value: 40 },
    "trade.posts.sold": { value: 9 },
    "trade.posts.admin_hidden": { value: 0 },
    "trade.reports_open": { value: 2 },
  },
  orders: {
    "orders.all": { value: 11 },
    "orders.in_progress": { value: 6 },
    "orders.completed": { value: 4 },
    "orders.cancel": { value: 1 },
  },
  stores: { "stores.open_now": { value: 5 } },
  points: { "points.waiting_confirm": { value: 2 }, "points.pending": { value: 1 } },
  commission: { "finance.commission_outstanding": { value: 12345 }, "finance.commission_net": { value: 99900 } },
  finance_today: { "finance.cash_in_today": { value: 50000 } },
  ads: {
    "ads.live": { value: 0 },
    "ads.pending": { value: 5 },
    "ads.scheduled": { value: 2 },
    "ads.waiting": { value: 1 },
    "ads.incomplete": { value: 3 },
    "ads.hero_used": { value: 4 },
  },
};

const RANGE_TODAY = resolveAdminDashboardPeriod("today", NOW);
const RANGE_30 = resolveAdminDashboardPeriod("30d", NOW);

function fakeSources(opts: { fail?: AdminMetricSourceKey[]; queue?: AdminActionQueueCategoryResult[]; queueFails?: boolean } = {}) {
  const metrics = vi.fn(async (key: Exclude<AdminMetricSourceKey, "queue">): Promise<AdminDashboardMetricMap> => {
    if (opts.fail?.includes(key)) throw new Error(`${key}_down`);
    return new Map(Object.entries(VALUES[key] ?? {}));
  });
  const queue = vi.fn(async () => {
    if (opts.queueFails) throw new Error("queue_down");
    return opts.queue ?? queueRows();
  });
  const trend = vi.fn(async (_id: string, days: 7 | 30) =>
    Array.from({ length: days }, (_, i) => ({ key: `2026-10-${String(i + 1).padStart(2, "0")}`, values: { signups: i } }))
  );
  const recent = vi.fn(async () => [
    { kind: "users" as const, labelKo: "최근 가입 회원", labelEn: "Recent members", href: "/admin/users", items: [] },
    { kind: "reports" as const, labelKo: "최근 신고", labelEn: "Recent reports", href: "/admin/reports", items: [] },
  ]);
  return { sources: { metrics, queue, trend, recent } as AdminDashboardSources, metrics, queue, trend, recent };
}

describe("buildAdminDashboardOverview — 응답 모양", () => {
  it("전체 현황: 요약 띠 8 · 지표 6 · 추세 · 처리 대기(관리자 처리 전부 + 합계) · 최근 활동 · 바로가기", async () => {
    const { sources, metrics, queue } = fakeSources();
    const p = await buildAdminDashboardOverview({
      tab: "overview",
      parts: parseAdminDashboardParts(null),
      range: RANGE_TODAY,
      actor: SUPER,
      sources,
      now: NOW,
    });
    expect(p.ok).toBe(true);
    expect(p.todayPht).toBe("2026-10-20");
    expect(p.period).toEqual({ id: "today", fromDay: "2026-10-20", toDay: "2026-10-20" });
    expect(p.band).toHaveLength(8);
    expect(p.band?.find((b) => b.id === "members")?.primary.value).toBe(122);
    expect(p.metrics).toHaveLength(6);
    expect(p.metrics?.find((m) => m.id === "finance.cash_in_today")).toMatchObject({ unit: "php_minor", period: "today_fixed" });
    expect(p.metrics?.find((m) => m.id === "members.new")).toMatchObject({
      period: "selected",
      href: "/admin/users?joinedFrom=2026-10-20&joinedTo=2026-10-20",
    });
    expect(p.trend).toMatchObject({ id: "signups_orders_daily", days: 7 });
    const adminCats = ADMIN_ACTION_QUEUE_REGISTRY.filter((d) => d.lifecycle === "active" && d.nextActor === "admin");
    expect(p.pending?.items).toHaveLength(adminCats.length);
    expect(p.pending?.total).toBe(adminCats.length);
    expect(p.pending?.items[0].priority).toBe("P0_CRITICAL");
    expect(p.recent?.groups.map((g) => g.kind)).toEqual(["users", "reports"]);
    expect(p.shortcuts?.length).toBeGreaterThanOrEqual(4);
    // 출처 키마다 1회만 읽는다
    const calls = metrics.mock.calls.map((c) => c[0]);
    expect(new Set(calls).size).toBe(calls.length);
    expect(queue).toHaveBeenCalledTimes(1);
  });

  it("요약 띠 「처리 대기」 = 전체 현황 처리 대기 목록 합계, P0 = P0 카테고리", async () => {
    const { sources } = fakeSources({
      queue: queueRows({ delivery_alerts: { count: 5 }, orders_attention: { count: 2 } }),
    });
    const p = await buildAdminDashboardOverview({
      tab: "overview",
      parts: new Set(["band", "pending"]),
      range: RANGE_TODAY,
      actor: SUPER,
      sources,
      now: NOW,
    });
    const pending = p.band?.find((b) => b.id === "pending");
    expect(pending?.secondary?.value).toBe(7);
    expect(pending?.primary.value).toBe(p.pending?.total);
    expect(p.metrics).toBeUndefined();
    expect(p.trend).toBeUndefined();
  });

  it("기간 지표 링크 = 같은 PHT 날짜 (30일)", async () => {
    const { sources, trend } = fakeSources();
    const p = await buildAdminDashboardOverview({
      tab: "delivery",
      parts: new Set(["metrics", "trend"]),
      range: RANGE_30,
      actor: SUPER,
      sources,
      now: NOW,
    });
    expect(p.metrics?.find((m) => m.id === "orders.in_progress")?.href).toBe(
      "/admin/stores/orders?tab=in_progress&period=custom&from=2026-09-21&to=2026-10-20"
    );
    expect(trend).toHaveBeenCalledWith("orders_daily", 30);
    expect(p.trend?.days).toBe(30);
  });

  it("탭별 처리 대기 = 그 탭 카테고리만, 우선순위 → 건수 순, 0건은 뺀다", async () => {
    const { sources } = fakeSources({
      queue: queueRows({ store_reports: { count: 9 }, store_applications: { count: 0 }, delivery_alerts: { count: 1 } }),
    });
    const p = await buildAdminDashboardOverview({
      tab: "delivery",
      parts: new Set(["pending"]),
      range: RANGE_TODAY,
      actor: SUPER,
      sources,
      now: NOW,
    });
    const keys = p.pending?.items.map((i) => i.key);
    expect(keys?.[0]).toBe("delivery_alerts");
    expect(keys).toContain("store_reports");
    expect(keys).not.toContain("store_applications");
    expect(keys).not.toContain("user_charges");
  });
});

describe("실패 → null + error (0 금지)", () => {
  it("출처 실패 지표는 value null + error, 다른 지표는 영향 없음", async () => {
    const { sources } = fakeSources({ fail: ["commission"] });
    const p = await buildAdminDashboardOverview({
      tab: "finance",
      parts: new Set(["metrics"]),
      range: RANGE_TODAY,
      actor: SUPER,
      sources,
      now: NOW,
    });
    const out = p.metrics?.find((m) => m.id === "finance.commission_outstanding");
    expect(out?.value).toBeNull();
    expect(out?.error).toMatch(/^commission:/);
    expect(p.metrics?.find((m) => m.id === "points.waiting_confirm")?.value).toBe(2);
    expect(adminDashboardPayloadHasErrors(p)).toBe(true);
  });

  it("처리 대기 카테고리 확인 불가 → 합계 null, 목록 complete=false", async () => {
    const { sources } = fakeSources({ queue: queueRows({ settlements_actionable: { status: "unavailable", count: null } }) });
    const p = await buildAdminDashboardOverview({
      tab: "finance",
      parts: new Set(["metrics", "pending"]),
      range: RANGE_TODAY,
      actor: SUPER,
      sources,
      now: NOW,
    });
    expect(p.metrics?.find((m) => m.id === "queue.settlements_actionable")).toMatchObject({ value: null, error: "queue_unavailable" });
    expect(p.pending?.complete).toBe(false);
    expect(p.pending?.total).toBeNull();
    expect(p.pending?.items.find((i) => i.key === "settlements_actionable")).toMatchObject({ count: null, status: "unavailable" });
  });

  it("처리 대기 전체 실패 → pending.error, 띠는 null", async () => {
    const { sources } = fakeSources({ queueFails: true });
    const p = await buildAdminDashboardOverview({
      tab: "overview",
      parts: new Set(["band", "pending"]),
      range: RANGE_TODAY,
      actor: SUPER,
      sources,
      now: NOW,
    });
    expect(p.pending?.error).toMatch(/queue/);
    expect(p.band?.find((b) => b.id === "pending")?.primary).toMatchObject({ value: null });
  });

  it("추세·최근 활동 실패 → 빈 값 + error", async () => {
    const { sources, trend, recent } = fakeSources();
    trend.mockRejectedValueOnce(new Error("too_many_rows"));
    recent.mockRejectedValueOnce(new Error("profiles:down"));
    const p = await buildAdminDashboardOverview({
      tab: "members",
      parts: new Set(["trend", "recent"]),
      range: RANGE_30,
      actor: SUPER,
      sources,
      now: NOW,
    });
    expect(p.trend).toMatchObject({ id: "signups_daily", days: 30, points: [], error: "too_many_rows" });
    expect(p.recent).toMatchObject({ groups: [], error: "profiles:down" });
    expect(adminDashboardPayloadHasErrors(p)).toBe(true);
  });

  it("모두 성공이면 오류 없음 (갱신 시각을 바꿔도 된다)", async () => {
    const { sources } = fakeSources();
    const p = await buildAdminDashboardOverview({
      tab: "members",
      parts: parseAdminDashboardParts(null),
      range: RANGE_TODAY,
      actor: SUPER,
      sources,
      now: NOW,
    });
    expect(adminDashboardPayloadHasErrors(p)).toBe(false);
  });
});

describe("권한 — 접근표로 열 수 없는 지표·링크는 숨긴다", () => {
  it("users·business·point 키 없는 운영자: 회원·재무 지표와 해당 처리 대기·최근 활동 숨김", async () => {
    const { sources } = fakeSources({
      queue: queueRows({ user_charges: { status: "forbidden", count: null }, cash_charges: { status: "forbidden", count: null } }),
    });
    const band = await buildAdminDashboardOverview({
      tab: "overview",
      parts: new Set(["band", "recent"]),
      range: RANGE_TODAY,
      actor: OPERATOR,
      sources,
      now: NOW,
    });
    expect(band.band?.map((b) => b.id)).not.toContain("members");
    expect(band.recent?.groups.map((g) => g.kind)).not.toContain("users");
    const fin = await buildAdminDashboardOverview({
      tab: "finance",
      parts: new Set(["metrics", "pending"]),
      range: RANGE_TODAY,
      actor: OPERATOR,
      sources,
      now: NOW,
    });
    expect(fin.metrics?.map((m) => m.id)).not.toContain("points.waiting_confirm");
    expect(fin.metrics?.map((m) => m.id)).not.toContain("finance.commission_outstanding");
    expect(fin.pending?.items.map((i) => i.key)).not.toContain("user_charges");
    expect(fin.shortcuts?.map((s) => s.id)).not.toContain("commission");
  });
});

describe("화면 병합 — 실패 시 이전 값 유지", () => {
  const base: AdminDashboardMetricValue = {
    id: "x",
    labelKo: "x",
    labelEn: "x",
    unit: "count",
    period: "now",
    value: 5,
    href: "/admin",
  };
  it("새 값 실패면 이전 값 + stale, 이전 값도 없으면 null 유지", () => {
    expect(mergeAdminDashboardMetric(base, { ...base, value: null, error: "boom" })).toMatchObject({ value: 5, stale: true, error: "boom" });
    expect(mergeAdminDashboardMetric(null, { ...base, value: null, error: "boom" })).toMatchObject({ value: null });
    expect(mergeAdminDashboardMetric(base, { ...base, value: 0 })).toMatchObject({ value: 0, stale: false });
  });

  it("요약 띠·처리 대기 병합", () => {
    const tile = { id: "t", labelKo: "", labelEn: "", shortKo: "", shortEn: "", tab: null, href: "/admin", primary: base, secondary: null };
    const merged = mergeAdminDashboardBand([tile], [{ ...tile, primary: { ...base, value: null, error: "e" } }]);
    expect(merged[0].primary.value).toBe(5);
    const prev = { items: [{ key: "reports" as const, titleKo: "", titleEn: "", domainKo: "", domainEn: "", priority: "P1_ACTION_REQUIRED" as const, count: 3, status: "ok" as const, href: "/admin/reports" }], total: 3, complete: true };
    const next = { items: [{ ...prev.items[0], count: null, status: "unavailable" as const }], total: null, complete: false };
    expect(mergeAdminDashboardPending(prev, next).items[0].count).toBe(3);
  });

  it("₱ 표시 · null = —", () => {
    expect(formatAdminDashboardValue(1234550, "php_minor")).toBe("₱12,345.5");
    expect(formatAdminDashboardValue(null, "count")).toBe("—");
    expect(formatAdminDashboardValue(1234, "count")).toBe("1,234");
  });
});

describe("PHT 버킷", () => {
  it("일별 키 = PHT 날짜 (오늘 포함 N일)", () => {
    const keys = manilaDailyKeys(7, NOW);
    expect(keys).toHaveLength(7);
    expect(keys[6]).toBe("2026-10-20");
    expect(keys[0]).toBe("2026-10-14");
    // UTC 2026-10-19 16:30 = PHT 10-20 00:30 → 오늘 버킷
    const pts = bucketDailyPht(keys, { a: [{ at: "2026-10-19T16:30:00Z" }, { at: "2026-10-19T15:59:00Z", amount: 4 }] });
    expect(pts[6].values.a).toBe(1);
    expect(pts[5].values.a).toBe(4);
  });
});
