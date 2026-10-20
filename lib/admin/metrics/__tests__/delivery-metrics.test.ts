import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AdminActionQueueCategoryResult } from "@/lib/admin/admin-action-queue-registry";
import { getAdminActionQueueCategoryDef } from "@/lib/admin/admin-action-queue-registry";
import {
  DELIVERY_ACTION_CENTER_CARD_METRIC_IDS,
  DELIVERY_DASHBOARD_HREF,
  DELIVERY_METRIC_DEFINITIONS,
  formatDeliveryMetricValue,
  getDeliveryMetricDefinition,
  resolveDeliveryActionCenterCard,
  resolveDeliveryDirectMetric,
  resolveDeliveryQueueMetric,
} from "@/lib/admin/metrics/delivery-metrics";
import {
  manilaHourFromUtcHour,
  manilaTodayRangeUtc,
  rebucketUtcHoursToManila,
} from "@/lib/admin/metrics/manila-period";

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

function cat(
  key: AdminActionQueueCategoryResult["key"],
  count: number | null,
  status: AdminActionQueueCategoryResult["status"] = "ok"
): AdminActionQueueCategoryResult {
  return { key, count, status, inTotal: true, nextActor: "admin", listHref: null };
}

describe("delivery metric definitions (§5)", () => {
  it("ids are unique and namespaced", () => {
    const ids = DELIVERY_METRIC_DEFINITIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith("delivery.")).toBe(true);
  });

  it("every metric links to an admin processing screen", () => {
    for (const d of DELIVERY_METRIC_DEFINITIONS) {
      expect(d.href.startsWith("/admin/"), d.id).toBe(true);
      expect(d.href, d.id).not.toBe("/admin/stores/orders"); // 필터 없는 전체 목록 금지
    }
  });

  it("queue metrics reuse the action queue registry href and permission (no duplicate definition)", () => {
    for (const d of DELIVERY_METRIC_DEFINITIONS) {
      if (d.source.kind !== "queue") continue;
      const def = getAdminActionQueueCategoryDef(d.source.categories[0]);
      expect(d.href).toBe(def.listHref);
      expect(d.permission).toBe(def.requiredPermission);
    }
  });

  it("filters carried in hrefs are ones the target screens read", () => {
    expect(getDeliveryMetricDefinition("delivery.stores_by_state.open").href).toBe("/admin/business?open=open");
    expect(getDeliveryMetricDefinition("delivery.stores_by_state.restricted").href).toBe(
      "/admin/business?restriction=yes"
    );
    expect(getDeliveryMetricDefinition("delivery.orders_new_today").href).toBe("/admin/stores/orders?period=today");
    expect(getDeliveryMetricDefinition("delivery.auto_actions_failed").href).toBe(
      "/admin/delivery-auto-actions?status=failed"
    );
    expect(read("lib/admin/store-orders/admin-store-order-ops-contract.ts")).toContain('sp.get("period")');
    expect(read("components/admin/business/AdminBusinessListPage.tsx")).toContain('"restriction"');
    // R7 — `?status=` 는 useAdminListQuery 가 읽는다 (허용 값 = STATUS_FILTERS 중 all 제외).
    expect(read("components/admin/delivery-alerts/AdminDeliveryAutoActionsPage.tsx")).toContain('statuses: STATUS_FILTERS.filter((f) => f !== "all")');
    // R7 — `?filter=` 은 useAdminListQuery extras 로 읽는다 (기본 open).
    expect(read("components/admin/delivery-alerts/AdminDeliveryAlertsPage.tsx")).toContain('extras: ["filter", "assignment"] as const');
  });

  it("today period is Manila (UTC+8): 00:00 Manila = 16:00Z previous day", () => {
    const r = manilaTodayRangeUtc(new Date("2026-10-19T02:00:00Z"));
    expect(r.fromIso).toBe("2026-10-18T16:00:00.000Z");
    expect(r.toIso).toBe("2026-10-19T16:00:00.000Z");
  });

  it("UTC hour buckets re-bucket to Manila hours without loss", () => {
    expect(manilaHourFromUtcHour(0)).toBe(8);
    expect(manilaHourFromUtcHour(16)).toBe(0);
    expect(manilaHourFromUtcHour(23)).toBe(7);
    const out = rebucketUtcHoursToManila([
      { hour: 16, count: 3 },
      { hour: 2, count: 5 },
    ]);
    expect(out).toHaveLength(24);
    expect(out[0].count).toBe(3);
    expect(out[10].count).toBe(5);
    expect(out.reduce((s, r) => s + r.count, 0)).toBe(8);
  });
});

describe("unavailable ≠ 0", () => {
  const def = getDeliveryMetricDefinition("delivery.orders_attention");

  it("ok category → count", () => {
    expect(resolveDeliveryQueueMetric(def, [cat("orders_attention", 4)]).value).toBe(4);
  });

  it("unavailable / missing / no payload → null", () => {
    expect(resolveDeliveryQueueMetric(def, [cat("orders_attention", null, "unavailable")]).value).toBeNull();
    expect(resolveDeliveryQueueMetric(def, [cat("delivery_alerts", 2)]).value).toBeNull();
    expect(resolveDeliveryQueueMetric(def, null).value).toBeNull();
  });

  it("forbidden → hidden (forbidden flag), not 0", () => {
    const v = resolveDeliveryQueueMetric(def, [cat("orders_attention", null, "forbidden")]);
    expect(v.forbidden).toBe(true);
    expect(v.value).toBeNull();
  });

  it("direct metric: failure (null) stays null; numbers pass through", () => {
    const d = getDeliveryMetricDefinition("delivery.orders_new_today");
    expect(resolveDeliveryDirectMetric(d, null).value).toBeNull();
    expect(resolveDeliveryDirectMetric(d, undefined).value).toBeNull();
    expect(resolveDeliveryDirectMetric(d, 0).value).toBe(0);
    expect(resolveDeliveryDirectMetric(d, 12).value).toBe(12);
  });

  it("format: null → 확인 불가", () => {
    expect(formatDeliveryMetricValue(null, true)).toBe("확인 불가");
    expect(formatDeliveryMetricValue(null, false)).toBe("Unavailable");
    expect(formatDeliveryMetricValue(0, true)).toBe("0");
  });
});

describe("Action Center delivery card = dashboard metric ids (X-4)", () => {
  it("card links to the delivery dashboard", () => {
    expect(resolveDeliveryActionCenterCard([]).href).toBe("/admin/delivery");
    expect(DELIVERY_DASHBOARD_HREF).toBe("/admin/delivery");
  });

  it("sums the same metric ids the dashboard shows", () => {
    const cats = [cat("orders_attention", 2), cat("delivery_alerts", 3), cat("store_applications", 1)];
    const card = resolveDeliveryActionCenterCard(cats);
    expect(card.count).toBe(6);
    const dashSum = DELIVERY_ACTION_CENTER_CARD_METRIC_IDS.map(
      (id) => resolveDeliveryQueueMetric(getDeliveryMetricDefinition(id), cats).value ?? 0
    ).reduce((a, b) => a + b, 0);
    expect(card.count).toBe(dashSum);
  });

  it("any component unavailable → card unavailable (not a partial 0)", () => {
    const card = resolveDeliveryActionCenterCard([
      cat("orders_attention", 2),
      cat("delivery_alerts", null, "unavailable"),
      cat("store_applications", 1),
    ]);
    expect(card.count).toBeNull();
    expect(card.unavailable).toBe(true);
  });

  it("forbidden components are excluded from the sum (permission scope)", () => {
    const card = resolveDeliveryActionCenterCard([
      cat("orders_attention", 2),
      cat("delivery_alerts", 3),
      cat("store_applications", null, "forbidden"),
    ]);
    expect(card.count).toBe(5);
  });

  it("Action Center and delivery dashboard read lib/admin/metrics", () => {
    const ac = read("components/admin/dashboard/AdminActionCenter.tsx");
    expect(ac).toContain("resolveDeliveryActionCenterCard");
    expect(ac).not.toMatch(/id:\s*"domain-delivery",\s*\n\s*href:\s*withAdminReturnTo\("\/admin\/stores\/orders"/);
    const dash = read("lib/admin/domain-dashboard/load-delivery-domain-dashboard.ts");
    expect(dash).toContain("DELIVERY_METRIC_DEFINITIONS");
    expect(dash).toContain("loadDeliveryMetrics");
  });

  it("delivery metrics module stays client-safe", () => {
    const src = read("lib/admin/metrics/delivery-metrics.ts") + read("lib/admin/metrics/manila-period.ts");
    expect(src).not.toMatch(/from "next\/server"|server-only|supabase-server|lib\/audit/);
  });
});
