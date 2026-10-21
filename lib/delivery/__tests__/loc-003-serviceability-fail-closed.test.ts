import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateDeliveryServiceArea } from "@/lib/delivery/service-area/evaluate-delivery-service-area";
import { DELIVERY_SERVICE_AREA_AUTHORITY } from "@/lib/delivery/service-area/authority";
import {
  DeliveryPolicyUnavailableError,
  FAIL_CLOSED_DELIVERY_DISTANCE_SETTINGS,
  __resetDeliveryDistanceSettingsForTests,
  invalidateDeliveryDistanceSettingsCache,
  loadDeliveryDistanceSettings,
  loadDeliveryDistanceSettingsOrThrow,
  type DeliveryDistancePolicy,
} from "@/lib/delivery/delivery-ops-settings";

const policyOff: DeliveryDistancePolicy = {
  enabled: false,
  source: "straight",
  defaultMaxKm: null,
  overDistanceBehavior: "exclude",
};

function sbReturning(result: { data: unknown; error: unknown }): SupabaseClient {
  const chain = {
    select: () => chain,
    in: () => Promise.resolve(result),
  };
  return { from: vi.fn(() => chain) } as unknown as SupabaseClient;
}

afterEach(() => {
  __resetDeliveryDistanceSettingsForTests();
});

describe("LOC-003 V2 evaluator — null-geo store fail-closed", () => {
  it("V2 policy off + store coords null → ineligible missing_store_coords", () => {
    const r = evaluateDeliveryServiceArea({
      policy: policyOff,
      overrides: { stores: {} },
      storeId: "s1",
      storeDeliveryRadiusKm: 10,
      customerLat: 14.6,
      customerLng: 121.0,
      storeLat: null,
      storeLng: null,
      authorityMode: DELIVERY_SERVICE_AREA_AUTHORITY.V2_LGU,
      selectedLguIds: ["lgu-a"],
      memberLguId: "lgu-a",
    });
    expect(r).toMatchObject({ eligible: false, applies: true, reason: "missing_store_coords" });
  });

  it("V2 override disabled + store coords null → ineligible", () => {
    const r = evaluateDeliveryServiceArea({
      policy: { ...policyOff, enabled: true },
      overrides: { stores: { s1: { mode: "disabled", maxKm: null } } },
      storeId: "s1",
      storeDeliveryRadiusKm: 10,
      customerLat: 14.6,
      customerLng: 121.0,
      storeLat: null,
      storeLng: null,
      authorityMode: DELIVERY_SERVICE_AREA_AUTHORITY.V2_LGU,
      selectedLguIds: ["lgu-a"],
      memberLguId: "lgu-a",
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("missing_store_coords");
  });

  it("V2 with store coords + policy off → unchanged (eligible, policy_off)", () => {
    const r = evaluateDeliveryServiceArea({
      policy: policyOff,
      overrides: { stores: {} },
      storeId: "s1",
      storeDeliveryRadiusKm: 10,
      customerLat: 14.6,
      customerLng: 121.0,
      storeLat: 14.65,
      storeLng: 121.05,
      authorityMode: DELIVERY_SERVICE_AREA_AUTHORITY.V2_LGU,
      selectedLguIds: [],
      memberLguId: null,
    });
    expect(r).toMatchObject({ eligible: true, applies: false, reason: "policy_off" });
  });
});

describe("LOC-003 distance settings loader — no silent policy OFF on error", () => {
  it("strict loader throws DeliveryPolicyUnavailableError on DB error", async () => {
    const sb = sbReturning({ data: null, error: { message: "connection reset" } });
    await expect(loadDeliveryDistanceSettingsOrThrow(sb)).rejects.toBeInstanceOf(
      DeliveryPolicyUnavailableError
    );
  });

  it("list loader: error with no prior success → fail-closed (policy ON, no overrides)", async () => {
    const sb = sbReturning({ data: null, error: { message: "timeout" } });
    const v = await loadDeliveryDistanceSettings(sb);
    expect(v).toEqual(FAIL_CLOSED_DELIVERY_DISTANCE_SETTINGS);
    expect(v.policy.enabled).toBe(true);
  });

  it("list loader: error after a success → last successful value", async () => {
    const good = sbReturning({
      data: [
        { key: "delivery_distance_policy", value_json: { enabled: false, source: "straight" } },
        {
          key: "delivery_store_distance_overrides",
          value_json: { stores: { s9: { mode: "disabled" } } },
        },
      ],
      error: null,
    });
    const first = await loadDeliveryDistanceSettings(good);
    expect(first.policy.enabled).toBe(false);
    invalidateDeliveryDistanceSettingsCache();
    const bad = sbReturning({ data: null, error: { message: "timeout" } });
    const second = await loadDeliveryDistanceSettings(bad);
    expect(second).toEqual(first);
    await expect(loadDeliveryDistanceSettingsOrThrow(bad)).rejects.toBeInstanceOf(
      DeliveryPolicyUnavailableError
    );
  });

  it("order route maps policy read error to 503 delivery_policy_unavailable", () => {
    const src = readFileSync(join(process.cwd(), "app/api/me/store-orders/route.ts"), "utf8");
    expect(src).toContain("loadDeliveryDistanceSettingsOrThrow(sb)");
    expect(src).toContain('error: "delivery_policy_unavailable" }, { status: 503 }');
    expect(src).not.toMatch(/await loadDeliveryDistanceSettings\(sb\)/);
  });

  it("LOC-010 order route applies DELIVERY_ROUTABLE (0,0 rejected) like the serviceability API", () => {
    const src = readFileSync(join(process.cwd(), "app/api/me/store-orders/route.ts"), "utf8");
    expect(src).toContain("isDeliveryRoutableCoords(");
    expect(src).toContain("customerLat: customerCoordsRoutable ? deliveryAddressSnapshot?.latitude : null");
  });
});
