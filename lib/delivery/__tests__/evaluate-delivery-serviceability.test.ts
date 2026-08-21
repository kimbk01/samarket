import { describe, expect, it } from "vitest";
import {
  evaluateDeliveryServiceability,
  resolveEffectiveStoreDistancePolicy,
} from "@/lib/delivery/evaluate-delivery-serviceability";
import type {
  DeliveryDistancePolicy,
  DeliveryStoreDistanceOverrides,
} from "@/lib/delivery/delivery-ops-settings";

const offPolicy: DeliveryDistancePolicy = {
  enabled: false,
  source: "straight",
  defaultMaxKm: 5,
  overDistanceBehavior: "deprioritize",
};

const onPolicy: DeliveryDistancePolicy = {
  enabled: true,
  source: "straight",
  defaultMaxKm: 5,
  overDistanceBehavior: "deprioritize",
};

const emptyOverrides: DeliveryStoreDistanceOverrides = { stores: {} };

const near = { lat: 14.55, lng: 121.0 };
const far = { lat: 14.62, lng: 121.05 };

describe("evaluateDeliveryServiceability", () => {
  it("policy off → eligible without coords", () => {
    const r = evaluateDeliveryServiceability({
      policy: offPolicy,
      overrides: emptyOverrides,
      storeId: "s1",
      customerLat: null,
      customerLng: null,
      storeLat: null,
      storeLng: null,
    });
    expect(r.eligible).toBe(true);
    expect(r.applies).toBe(false);
    expect(r.reason).toBe("policy_off");
  });

  it("store override disabled → eligible without distance check", () => {
    const r = evaluateDeliveryServiceability({
      policy: onPolicy,
      overrides: { stores: { s1: { mode: "disabled", maxKm: null } } },
      storeId: "s1",
      customerLat: far.lat,
      customerLng: far.lng,
      storeLat: near.lat,
      storeLng: near.lng,
    });
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe("store_override_disabled");
  });

  it("missing store coords when policy on → ineligible", () => {
    const r = evaluateDeliveryServiceability({
      policy: onPolicy,
      overrides: emptyOverrides,
      storeId: "s1",
      customerLat: near.lat,
      customerLng: near.lng,
      storeLat: null,
      storeLng: null,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("missing_store_coords");
  });

  it("missing customer coords when policy on → ineligible", () => {
    const r = evaluateDeliveryServiceability({
      policy: onPolicy,
      overrides: emptyOverrides,
      storeId: "s1",
      customerLat: null,
      customerLng: null,
      storeLat: near.lat,
      storeLng: near.lng,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("missing_customer_coords");
  });

  it("within global max → eligible", () => {
    const r = evaluateDeliveryServiceability({
      policy: onPolicy,
      overrides: emptyOverrides,
      storeId: "s1",
      customerLat: near.lat,
      customerLng: near.lng,
      storeLat: near.lat,
      storeLng: near.lng,
    });
    expect(r.eligible).toBe(true);
    expect(r.distanceKm).toBe(0);
    expect(r.reason).toBe("eligible");
  });

  it("store override 10km allows ~8km when global is 5km", () => {
    const r = evaluateDeliveryServiceability({
      policy: onPolicy,
      overrides: { stores: { s1: { mode: "enabled", maxKm: 10 } } },
      storeId: "s1",
      customerLat: far.lat,
      customerLng: far.lng,
      storeLat: near.lat,
      storeLng: near.lng,
    });
    expect(r.distanceKm).not.toBeNull();
    expect(r.distanceKm!).toBeGreaterThan(5);
    expect(r.distanceKm!).toBeLessThan(10);
    expect(r.eligible).toBe(true);
    expect(r.policySource).toBe("store");
  });

  it("global 5km rejects ~8km without store override", () => {
    const r = evaluateDeliveryServiceability({
      policy: onPolicy,
      overrides: emptyOverrides,
      storeId: "s1",
      customerLat: far.lat,
      customerLng: far.lng,
      storeLat: near.lat,
      storeLng: near.lng,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("out_of_range");
  });

  it("resolveEffectiveStoreDistancePolicy inherits global max", () => {
    const e = resolveEffectiveStoreDistancePolicy(onPolicy, emptyOverrides, "s1");
    expect(e).toEqual({ applies: true, maxKm: 5, policySource: "global" });
  });
});
