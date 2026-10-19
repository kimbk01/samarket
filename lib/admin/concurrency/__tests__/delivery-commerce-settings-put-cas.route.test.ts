import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, filterValue, type FakeCall, type FakeResult } from "./fake-supabase-query";

let handler: (call: FakeCall) => FakeResult = () => ({ data: null, error: null });
const fake = createFakeSupabase((c) => handler(c));
const appendAuditLog = vi.fn();

vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async () => ({ ok: true, actor: { userId: "admin-1" }, sb: {} }),
}));
vi.mock("@/lib/auth/is-route-admin", () => ({ isRouteAdmin: async () => true }));
vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "admin-1" }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => fake.sb }));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: (...a: unknown[]) => appendAuditLog(...a) }));
vi.mock("@/lib/audit/request-meta", () => ({ getAuditRequestMeta: () => ({ ip: null, userAgent: null }) }));
vi.mock("@/lib/stores/discovery/invalidate-discovery-store-projections", () => ({
  invalidateDiscoveryGlobalDistancePolicy: async () => undefined,
}));
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({
  bumpStorePublicSharedCacheGeneration: () => undefined,
}));
vi.mock("@/lib/stores/load-commerce-settings", () => ({
  loadCommerceSettings: async () => ({ autoCompleteDays: 7, settlementFeeBp: 0, settlementDelayDays: 0 }),
  listCommerceSettingKeysInDb: async () => new Set<string>(),
}));
vi.mock("@/lib/stores/order-match-alert-sound", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/stores/order-match-alert-sound")>()),
  getOrderMatchAlertSoundUrl: async () => null,
}));

import { PUT as putDeliverySettings } from "@/app/api/admin/delivery/settings/route";
import { PUT as putCommerceSettings } from "@/app/api/admin/commerce-settings/route";

const LOADED = "2026-10-19T01:00:00.123+00:00";

function req(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

/** admin_settings 행 상태 — select(key, updated_at) 응답. */
function settingsHandler(rows: Array<{ key: string; updated_at: string | null; value_json?: unknown }>, writeResult: FakeResult) {
  return (c: FakeCall): FakeResult => {
    if (c.op === "select") return { data: rows, error: null };
    return writeResult;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.calls.length = 0;
});

describe("delivery settings PUT (거리 전역 정책 · 매장 알림 설정) — CAS", () => {
  const url = "https://x.test/api/admin/delivery/settings";

  it("400 expected_updated_at_required without versions", async () => {
    handler = settingsHandler([], { data: null, error: null });
    const res = await putDeliverySettings(req(url, { ride_time_source: "google" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("expected_updated_at_required");
    expect(fake.calls.some((c) => c.op !== "select")).toBe(false);
  });

  it("409 stale_updated_at when the distance policy row changed after load", async () => {
    handler = settingsHandler([{ key: "delivery_distance_policy", updated_at: "2026-10-19T02:00:00+00:00" }], {
      data: null,
      error: null,
    });
    const res = await putDeliverySettings(
      req(url, { distance_policy: {}, expected_updated_at: { distance_policy: LOADED } })
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("stale_updated_at");
    expect(fake.calls.some((c) => c.op !== "select")).toBe(false);
    expect(appendAuditLog).not.toHaveBeenCalled();
  });

  it("409 when another admin created the row first (screen saw no row)", async () => {
    handler = settingsHandler([{ key: "delivery_ride_time_source", updated_at: LOADED }], { data: null, error: null });
    const res = await putDeliverySettings(
      req(url, { ride_time_source: "google", expected_updated_at: { ride_time_source: null } })
    );
    expect(res.status).toBe(409);
  });

  it("409 when the conditional UPDATE matches 0 rows (race)", async () => {
    handler = settingsHandler([{ key: "delivery_rider_location_enabled", updated_at: LOADED }], {
      data: null,
      error: null,
    });
    const res = await putDeliverySettings(
      req(url, { rider_location_enabled: true, expected_updated_at: { rider_location_enabled: LOADED } })
    );
    expect(res.status).toBe(409);
    const upd = fake.calls.find((c) => c.op === "update")!;
    expect(filterValue(upd, "eq", "updated_at")).toBe(LOADED);
    expect((upd.values as Record<string, unknown>).updated_at).toEqual(expect.any(String));
  });

  it("normal save succeeds, writes audit, returns settings_updated_at", async () => {
    handler = settingsHandler([{ key: "delivery_rider_location_enabled", updated_at: LOADED }], {
      data: { key: "delivery_rider_location_enabled" },
      error: null,
    });
    const res = await putDeliverySettings(
      req(url, { rider_location_enabled: true, expected_updated_at: { rider_location_enabled: LOADED } })
    );
    expect(res.status).toBe(200);
    const j = (await res.json()) as { settings_updated_at?: Record<string, unknown> };
    expect(j.settings_updated_at).toHaveProperty("rider_location_enabled");
    expect(appendAuditLog).toHaveBeenCalledTimes(1);
  });
});

describe("commerce settings PUT — CAS", () => {
  const url = "https://x.test/api/admin/commerce-settings";

  it("400 expected_updated_at_required without versions", async () => {
    handler = settingsHandler([], { data: null, error: null });
    const res = await putCommerceSettings(req(url, { store_auto_complete_days: 5 }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("expected_updated_at_required");
    expect(fake.calls.some((c) => c.op !== "select")).toBe(false);
  });

  it("409 stale_updated_at when auto-complete days changed after load", async () => {
    handler = settingsHandler([{ key: "store_auto_complete_days", updated_at: "2026-10-19T02:00:00+00:00" }], {
      data: null,
      error: null,
    });
    const res = await putCommerceSettings(
      req(url, { store_auto_complete_days: 5, expected_updated_at: { store_auto_complete_days: LOADED } })
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("stale_updated_at");
    expect(fake.calls.some((c) => c.op !== "select")).toBe(false);
    expect(appendAuditLog).not.toHaveBeenCalled();
  });

  it("409 when the conditional DELETE (reset) matches 0 rows", async () => {
    handler = settingsHandler([{ key: "store_auto_complete_days", updated_at: LOADED }], { data: null, error: null });
    const res = await putCommerceSettings(
      req(url, {
        store_auto_complete_days: null,
        store_settlement_fee_bp: null,
        store_settlement_delay_days: null,
        expected_updated_at: {
          store_auto_complete_days: LOADED,
          store_settlement_fee_bp: null,
          store_settlement_delay_days: null,
        },
      })
    );
    expect(res.status).toBe(409);
    const del = fake.calls.find((c) => c.op === "delete")!;
    expect(filterValue(del, "eq", "updated_at")).toBe(LOADED);
  });

  it("normal save succeeds and keeps the audit write", async () => {
    handler = settingsHandler([{ key: "store_auto_complete_days", updated_at: LOADED }], {
      data: { key: "store_auto_complete_days" },
      error: null,
    });
    const res = await putCommerceSettings(
      req(url, { store_auto_complete_days: 5, expected_updated_at: { store_auto_complete_days: LOADED } })
    );
    expect(res.status).toBe(200);
    expect(appendAuditLog).toHaveBeenCalledTimes(1);
  });
});
