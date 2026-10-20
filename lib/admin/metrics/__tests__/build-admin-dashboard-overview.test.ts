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
  parseAdminDashboardParts,
  type AdminDashboardMetricValue,
} from "@/lib/admin/metrics/dashboard-overview-contract";
import type { AdminMetricSourceKey } from "@/lib/admin/metrics/registry";
import { bucketDailyPht, bucketHourlyPht, manilaDailyKeys } from "@/lib/admin/metrics/load-admin-dashboard-sources";

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

const VALUES: Record<string, Record<string, { value: number | null; section?: string; forbidden?: boolean }>> = {
  aggregate: { "members.total": { value: 122 }, "members.new_today": { value: 3 }, "members.sanctioned": { value: 2 } },
  members: { "members.active_7d": { value: 32 }, "members.phone_verified": { value: 77 }, "members.deletion_requests": { value: 2 } },
  community: {
    "community.posts_active.member": { value: 50, section: "state" },
    "community.posts_hidden": { value: 1, section: "state" },
    "community.reports_pending": { value: 4, section: "action" },
    "community.reports_stale_24h": { value: 1, section: "risk" },
  },
  trade: {
    "trade.posts.selling": { value: 40, section: "state" },
    "trade.posts.sold": { value: 9, section: "state" },
    "trade.posts.admin_hidden": { value: 0, section: "state" },
    "trade.reports_open": { value: 2, section: "action" },
    "trade.promotions_overdue": { value: 0, section: "risk" },
  },
  delivery: {
    "delivery.orders_in_progress": { value: 6, section: "health" },
    "delivery.orders_new_today": { value: 11, section: "health" },
    "delivery.stores_by_state.open": { value: 5, section: "state" },
    "delivery.alerts_open": { value: 2, section: "action" },
    "delivery.orders_stale_in_progress": { value: 3, section: "risk" },
  },
  chat: {
    "chat.rooms.general_direct.active_7d": { value: 12, section: "state" },
    "chat.reports_open.messenger": { value: null, section: "action" },
    "chat.reports_open.trade_report": { value: 0, section: "action" },
    "chat.call_failed_24h": { value: 1, section: "risk" },
  },
  orders_today: { "delivery.orders_completed_today": { value: 8 }, "delivery.orders_cancelled_today": { value: 1 } },
  commission: { "finance.commission_outstanding": { value: 12345 }, "finance.commission_7d": { value: 99900 } },
  finance_today: { "finance.cash_in_today": { value: 50000 } },
  ads: { "ads.live": { value: 7 }, "ads.popups_active": { value: 1 }, "ads.collisions_blocking": { value: 0 } },
  notifications_today: { "notifications.sent_today": { value: 100 }, "notifications.failed_today": { value: 2 } },
};

function fakeSources(opts: { fail?: AdminMetricSourceKey[]; queue?: AdminActionQueueCategoryResult[]; queueFails?: boolean } = {}) {
  const metrics = vi.fn(async (key: Exclude<AdminMetricSourceKey, "queue">): Promise<AdminDashboardMetricMap> => {
    if (opts.fail?.includes(key)) throw new Error(`${key}_down`);
    return new Map(Object.entries(VALUES[key] ?? {}));
  });
  const queue = vi.fn(async () => {
    if (opts.queueFails) throw new Error("queue_down");
    return opts.queue ?? queueRows();
  });
  const trend = vi.fn(async (_id: string, range: 7 | 30) =>
    Array.from({ length: range }, (_, i) => ({ key: `2026-10-${String(i + 1).padStart(2, "0")}`, values: { signups: i } }))
  );
  return { sources: { metrics, queue, trend } as AdminDashboardSources, metrics, queue, trend };
}

describe("buildAdminDashboardOverview — 응답 모양", () => {
  it("전체 현황: 요약 띠 8 · 지표 3 · 도메인 카드 4 · 추세 · 처리 대기(P0/P1 상위 10) · 바로가기", async () => {
    const { sources, metrics, queue } = fakeSources();
    const p = await buildAdminDashboardOverview({
      tab: "overview",
      parts: parseAdminDashboardParts(null),
      range: 7,
      actor: SUPER,
      sources,
      now: NOW,
    });
    expect(p.ok).toBe(true);
    expect(p.todayPht).toBe("2026-10-20");
    expect(p.band).toHaveLength(8);
    expect(p.band?.find((b) => b.id === "members")?.primary.value).toBe(122);
    expect(p.metrics?.map((m) => m.id)).toEqual(["members.new_today", "delivery.orders_new_today", "finance.cash_in_today"]);
    expect(p.metrics?.find((m) => m.id === "finance.cash_in_today")?.unit).toBe("php_minor");
    expect(p.domainCards?.map((c) => c.domain)).toEqual(["community", "trade", "delivery", "chat"]);
    expect(p.domainCards?.find((c) => c.domain === "delivery")).toMatchObject({ pending: 2, risk: 3 });
    // 채팅 action 구역에 확인 불가 값 → 대기 합계도 null (0 아님)
    expect(p.domainCards?.find((c) => c.domain === "chat")).toMatchObject({ pending: null, risk: 1 });
    expect(p.trend?.id).toBe("signups_orders_daily");
    expect(p.pending?.items.length).toBeLessThanOrEqual(10);
    expect(p.pending?.items[0].priority).toBe("P0_CRITICAL");
    expect(p.pending?.items.every((i) => i.priority === "P0_CRITICAL" || i.priority === "P1_ACTION_REQUIRED")).toBe(true);
    expect(p.shortcuts?.length).toBeGreaterThanOrEqual(4);
    // 출처 키마다 1회만 읽는다
    const calls = metrics.mock.calls.map((c) => c[0]);
    expect(new Set(calls).size).toBe(calls.length);
    expect(queue).toHaveBeenCalledTimes(1);
  });

  it("처리 대기 합산 = 레지스트리 ok 값의 합, P0 = P0 카테고리", async () => {
    const { sources } = fakeSources({
      queue: queueRows({ delivery_alerts: { count: 5 }, orders_attention: { count: 2 } }),
    });
    const p = await buildAdminDashboardOverview({ tab: "overview", parts: new Set(["band"]), range: 7, actor: SUPER, sources, now: NOW });
    const pending = p.band?.find((b) => b.id === "pending");
    expect(pending?.secondary?.value).toBe(7);
    const totalCats = ADMIN_ACTION_QUEUE_REGISTRY.filter((d) => d.lifecycle === "active" && d.nextActor === "admin");
    expect(pending?.primary.value).toBe(totalCats.length - 2 + 5 + 2);
    expect(p.metrics).toBeUndefined();
    expect(p.trend).toBeUndefined();
  });

  it("탭별 처리 대기 = 그 탭 카테고리만, 우선순위 → 건수 순, 0건은 뺀다", async () => {
    const { sources } = fakeSources({
      queue: queueRows({ store_reports: { count: 9 }, store_applications: { count: 0 }, delivery_alerts: { count: 1 } }),
    });
    const p = await buildAdminDashboardOverview({ tab: "delivery", parts: new Set(["pending"]), range: 7, actor: SUPER, sources, now: NOW });
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
    const p = await buildAdminDashboardOverview({ tab: "finance", parts: new Set(["metrics"]), range: 7, actor: SUPER, sources, now: NOW });
    const out = p.metrics?.find((m) => m.id === "finance.commission_outstanding");
    expect(out?.value).toBeNull();
    expect(out?.error).toMatch(/^commission:/);
    expect(p.metrics?.find((m) => m.id === "queue.user_charges")?.value).toBe(1);
  });

  it("처리 대기 카테고리 확인 불가 → 합계 null, 목록 complete=false", async () => {
    const { sources } = fakeSources({ queue: queueRows({ cash_charges: { status: "unavailable", count: null } }) });
    const p = await buildAdminDashboardOverview({
      tab: "finance",
      parts: new Set(["metrics", "pending", "band"]),
      range: 7,
      actor: SUPER,
      sources,
      now: NOW,
    });
    expect(p.metrics?.find((m) => m.id === "queue.cash_charges")).toMatchObject({ value: null, error: "queue_unavailable" });
    expect(p.band?.find((b) => b.id === "finance")?.primary.value).toBeNull();
    expect(p.pending?.complete).toBe(false);
    expect(p.pending?.items.find((i) => i.key === "cash_charges")).toMatchObject({ count: null, status: "unavailable" });
  });

  it("처리 대기 전체 실패 → pending.error, 띠는 null", async () => {
    const { sources } = fakeSources({ queueFails: true });
    const p = await buildAdminDashboardOverview({ tab: "overview", parts: new Set(["band", "pending"]), range: 7, actor: SUPER, sources, now: NOW });
    expect(p.pending?.error).toMatch(/queue/);
    expect(p.band?.find((b) => b.id === "pending")?.primary).toMatchObject({ value: null });
  });

  it("추세 실패 → points [] + error", async () => {
    const { sources, trend } = fakeSources();
    trend.mockRejectedValueOnce(new Error("too_many_rows"));
    const p = await buildAdminDashboardOverview({ tab: "members", parts: new Set(["trend"]), range: 30, actor: SUPER, sources, now: NOW });
    expect(p.trend).toMatchObject({ id: "signups_daily", range: 30, points: [], error: "too_many_rows" });
  });
});

describe("권한 — 접근표로 열 수 없는 지표·링크는 숨긴다", () => {
  it("users·business·point 키 없는 운영자: 회원·재무 지표와 해당 처리 대기 숨김", async () => {
    const { sources } = fakeSources({
      queue: queueRows({ user_charges: { status: "forbidden", count: null }, cash_charges: { status: "forbidden", count: null } }),
    });
    const band = await buildAdminDashboardOverview({ tab: "overview", parts: new Set(["band"]), range: 7, actor: OPERATOR, sources, now: NOW });
    expect(band.band?.map((b) => b.id)).not.toContain("members");
    const fin = await buildAdminDashboardOverview({
      tab: "finance",
      parts: new Set(["metrics", "pending"]),
      range: 7,
      actor: OPERATOR,
      sources,
      now: NOW,
    });
    expect(fin.metrics?.map((m) => m.id)).not.toContain("queue.user_charges");
    expect(fin.metrics?.map((m) => m.id)).not.toContain("finance.commission_outstanding");
    expect(fin.pending?.items.map((i) => i.key)).not.toContain("user_charges");
    expect(fin.shortcuts?.map((s) => s.id)).not.toContain("commission");
  });
});

describe("화면 병합 — 실패 시 이전 값 유지", () => {
  const base: AdminDashboardMetricValue = { id: "x", labelKo: "x", labelEn: "x", unit: "count", value: 5, href: "/admin" };
  it("새 값 실패면 이전 값 + stale, 이전 값도 없으면 null 유지", () => {
    expect(mergeAdminDashboardMetric(base, { ...base, value: null, error: "boom" })).toMatchObject({ value: 5, stale: true, error: "boom" });
    expect(mergeAdminDashboardMetric(null, { ...base, value: null, error: "boom" })).toMatchObject({ value: null });
    expect(mergeAdminDashboardMetric(base, { ...base, value: 0 })).toMatchObject({ value: 0, stale: false });
  });

  it("요약 띠·처리 대기 병합", () => {
    const tile = { id: "t", labelKo: "", labelEn: "", shortKo: "", shortEn: "", tab: null, href: "/admin", primary: base, secondary: null };
    const merged = mergeAdminDashboardBand([tile], [{ ...tile, primary: { ...base, value: null, error: "e" } }]);
    expect(merged[0].primary.value).toBe(5);
    const prev = { items: [{ key: "reports" as const, titleKo: "", titleEn: "", domainKo: "", domainEn: "", priority: "P1_ACTION_REQUIRED" as const, count: 3, status: "ok" as const, href: "/admin/reports" }], complete: true };
    const next = { items: [{ ...prev.items[0], count: null, status: "unavailable" as const }], complete: false };
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

  it("시간대 버킷 = PHT 시", () => {
    const pts = bucketHourlyPht("orders", [{ at: "2026-10-20T01:10:00Z" }, { at: "2026-10-19T16:05:00Z" }]);
    expect(pts).toHaveLength(24);
    expect(pts[9].values.orders).toBe(1);
    expect(pts[0].values.orders).toBe(1);
  });
});
