import { describe, expect, it } from "vitest";
import {
  DEFAULT_DELIVERY_DISTANCE_POLICY,
  DEFAULT_DELIVERY_STORE_DISTANCE_OVERRIDES,
  type DeliveryDistancePolicy,
  type DeliveryStoreDistanceOverrides,
} from "@/lib/delivery/delivery-ops-settings";
import { evaluateDeliveryServiceability } from "@/lib/delivery/evaluate-delivery-serviceability";
import { haversineKm } from "@/lib/geo/haversine-km";
import {
  buildStoreDeliveryCoverageProjection,
  isCustomerInsideCoverageRadius,
} from "@/lib/stores/discovery/build-store-delivery-coverage";

const STORE_ID = "11111111-1111-4111-8111-111111111111";
const STORE_LAT = 14.5995;
const STORE_LNG = 120.9842;

function buildInput(
  overrides: Partial<{
    policy: DeliveryDistancePolicy;
    storeOverrides: DeliveryStoreDistanceOverrides;
    lat: number | null;
    lng: number | null;
    policyVersion: number;
    storePolicyVersion: number;
  }> = {}
) {
  return {
    storeId: STORE_ID,
    lat: overrides.lat ?? STORE_LAT,
    lng: overrides.lng ?? STORE_LNG,
    policy: overrides.policy ?? DEFAULT_DELIVERY_DISTANCE_POLICY,
    overrides: overrides.storeOverrides ?? DEFAULT_DELIVERY_STORE_DISTANCE_OVERRIDES,
    policyVersion: overrides.policyVersion ?? 1,
    storePolicyVersion: overrides.storePolicyVersion ?? 1,
  };
}

describe("buildStoreDeliveryCoverageProjection", () => {
  it("policy off → covers_all without finite maxKm enforcement", () => {
    const built = buildStoreDeliveryCoverageProjection(
      buildInput({ policy: { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: false } })
    );
    expect(built.distanceApplies).toBe(false);
    expect(built.coversAll).toBe(true);
  });

  it("inherit global maxKm → finite radius when enabled", () => {
    const built = buildStoreDeliveryCoverageProjection(
      buildInput({
        policy: { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: true, defaultMaxKm: 5 },
      })
    );
    expect(built.distanceApplies).toBe(true);
    expect(built.coversAll).toBe(false);
    expect(built.effectiveMaxKm).toBe(5);
  });

  it("store override disabled → distance axis skipped", () => {
    const built = buildStoreDeliveryCoverageProjection(
      buildInput({
        policy: { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: true, defaultMaxKm: 5 },
        storeOverrides: {
          stores: { [STORE_ID]: { mode: "disabled", maxKm: 2 } },
        },
      })
    );
    expect(built.distanceApplies).toBe(false);
    expect(built.coversAll).toBe(true);
    expect(built.deliveryModeEffective).toBe("disabled");
  });

  it("store override maxKm wins over global default", () => {
    const built = buildStoreDeliveryCoverageProjection(
      buildInput({
        policy: { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: true, defaultMaxKm: 5 },
        storeOverrides: {
          stores: { [STORE_ID]: { mode: "enabled", maxKm: 2.5 } },
        },
      })
    );
    expect(built.effectiveMaxKm).toBe(2.5);
    expect(built.coversAll).toBe(false);
  });

  it("null maxKm → covers_all", () => {
    const built = buildStoreDeliveryCoverageProjection(
      buildInput({
        policy: { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: true, defaultMaxKm: null },
      })
    );
    expect(built.coversAll).toBe(true);
    expect(built.effectiveMaxKm).toBe(null);
  });

  it("missing coords keeps distance_applies but no finite circle requirement in builder", () => {
    const built = buildStoreDeliveryCoverageProjection({
      storeId: STORE_ID,
      lat: null,
      lng: null,
      policy: { ...DEFAULT_DELIVERY_DISTANCE_POLICY, enabled: true, defaultMaxKm: 5 },
      overrides: DEFAULT_DELIVERY_STORE_DISTANCE_OVERRIDES,
      policyVersion: 1,
      storePolicyVersion: 1,
    });
    expect(built.hasCoords).toBe(false);
    expect(built.distanceApplies).toBe(true);
    expect(built.coversAll).toBe(false);
  });

  it("tracks dual policy versions independently", () => {
    const v1 = buildStoreDeliveryCoverageProjection(buildInput({ policyVersion: 1, storePolicyVersion: 1 }));
    const v2 = buildStoreDeliveryCoverageProjection(buildInput({ policyVersion: 2, storePolicyVersion: 3 }));
    expect(v1.policyVersion).toBe(1);
    expect(v2.policyVersion).toBe(2);
    expect(v2.storePolicyVersion).toBe(3);
  });
});

describe("coverage radius parity with haversine evaluator rounding", () => {
  const policy = {
    ...DEFAULT_DELIVERY_DISTANCE_POLICY,
    enabled: true,
    defaultMaxKm: 5,
  };

  function probeAt(customerLat: number, customerLng: number) {
    return {
      policy,
      overrides: DEFAULT_DELIVERY_STORE_DISTANCE_OVERRIDES,
      storeId: STORE_ID,
      storeLat: STORE_LAT,
      storeLng: STORE_LNG,
      customerLat,
      customerLng,
    };
  }

  it("inside radius → eligible", () => {
    expect(isCustomerInsideCoverageRadius(probeAt(STORE_LAT, STORE_LNG))).toBe(true);
    const evalResult = evaluateDeliveryServiceability(probeAt(STORE_LAT, STORE_LNG));
    expect(evalResult.eligible).toBe(true);
    expect(evalResult.distanceKm).toBe(0);
  });

  it("exact boundary uses millimeter-rounded haversine (rounded <= maxKm)", () => {
    let customerLng = STORE_LNG;
    for (let i = 0; i < 50_000; i += 1) {
      customerLng += 0.00001;
      const raw = haversineKm(STORE_LAT, STORE_LNG, STORE_LAT, customerLng);
      if (raw == null) continue;
      const rounded = Math.round(raw * 1000) / 1000;
      if (rounded === 5) {
        const evalResult = evaluateDeliveryServiceability(probeAt(STORE_LAT, customerLng));
        expect(evalResult.eligible).toBe(true);
        expect(isCustomerInsideCoverageRadius(probeAt(STORE_LAT, customerLng))).toBe(true);
        return;
      }
    }
    throw new Error("fixture: could not locate exact 5.000km boundary point");
  });

  it("just outside boundary → ineligible", () => {
    let customerLng = STORE_LNG;
    for (let i = 0; i < 50_000; i += 1) {
      customerLng += 0.00001;
      const raw = haversineKm(STORE_LAT, STORE_LNG, STORE_LAT, customerLng);
      if (raw == null) continue;
      const rounded = Math.round(raw * 1000) / 1000;
      if (rounded > 5) {
        const evalResult = evaluateDeliveryServiceability(probeAt(STORE_LAT, customerLng));
        expect(evalResult.eligible).toBe(false);
        expect(isCustomerInsideCoverageRadius(probeAt(STORE_LAT, customerLng))).toBe(false);
        return;
      }
    }
    throw new Error("fixture: could not locate just-outside boundary point");
  });

  it("documents evaluator rounding contract used for coverage parity", () => {
    expect(Math.round(5.0004 * 1000) / 1000).toBe(5);
    expect(Math.round(5.0006 * 1000) / 1000).toBeGreaterThan(5);
  });
});
