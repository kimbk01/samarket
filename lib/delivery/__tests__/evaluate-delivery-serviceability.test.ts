import { describe, expect, it } from "vitest";
import {
  evaluateDeliveryServiceability,
  resolveEffectiveStoreDistancePolicy,
} from "@/lib/delivery/evaluate-delivery-serviceability";
import type {
  DeliveryDistancePolicy,
  DeliveryStoreDistanceOverrides,
} from "@/lib/delivery/delivery-ops-settings";
import { DEFAULT_STORE_DELIVERY_RADIUS_KM } from "@/lib/delivery/store-delivery-radius";

const offPolicy: DeliveryDistancePolicy = {
  enabled: false,
  source: "straight",
  defaultMaxKm: 5,
  overDistanceBehavior: "exclude",
};

const onPolicy: DeliveryDistancePolicy = {
  enabled: true,
  source: "straight",
  defaultMaxKm: 5,
  overDistanceBehavior: "exclude",
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
      storeDeliveryRadiusKm: null,
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
      storeDeliveryRadiusKm: 10,
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
      storeDeliveryRadiusKm: null,
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
      storeDeliveryRadiusKm: null,
      customerLat: null,
      customerLng: null,
      storeLat: near.lat,
      storeLng: near.lng,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("missing_customer_coords");
  });

  it("NULL store radius → effective default 10km; near store eligible", () => {
    const r = evaluateDeliveryServiceability({
      policy: onPolicy,
      overrides: emptyOverrides,
      storeId: "s1",
      storeDeliveryRadiusKm: null,
      customerLat: near.lat,
      customerLng: near.lng,
      storeLat: near.lat,
      storeLng: near.lng,
    });
    expect(r.eligible).toBe(true);
    expect(r.distanceKm).toBe(0);
    expect(r.maxKm).toBe(DEFAULT_STORE_DELIVERY_RADIUS_KM);
    expect(r.policySource).toBe("store");
    expect(r.reason).toBe("eligible");
  });

  it("configured store radius 10km allows ~8km (legacy override maxKm ignored)", () => {
    const r = evaluateDeliveryServiceability({
      policy: onPolicy,
      overrides: { stores: { s1: { mode: "enabled", maxKm: 3 } } },
      storeId: "s1",
      storeDeliveryRadiusKm: 10,
      customerLat: far.lat,
      customerLng: far.lng,
      storeLat: near.lat,
      storeLng: near.lng,
    });
    expect(r.distanceKm).not.toBeNull();
    expect(r.distanceKm!).toBeGreaterThan(5);
    expect(r.distanceKm!).toBeLessThan(10);
    expect(r.eligible).toBe(true);
    expect(r.maxKm).toBe(10);
    expect(r.policySource).toBe("store");
  });

  it("NULL store radius (effective 10) rejects ~20km; legacy global defaultMaxKm unused", () => {
    const beyond10 = { lat: 14.7, lng: 121.1 };
    const r = evaluateDeliveryServiceability({
      policy: { ...onPolicy, defaultMaxKm: 60 },
      overrides: emptyOverrides,
      storeId: "s1",
      storeDeliveryRadiusKm: null,
      customerLat: beyond10.lat,
      customerLng: beyond10.lng,
      storeLat: near.lat,
      storeLng: near.lng,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("out_of_range");
    expect(r.maxKm).toBe(DEFAULT_STORE_DELIVERY_RADIUS_KM);
  });

  it("resolveEffectiveStoreDistancePolicy uses store column / default 10", () => {
    const e = resolveEffectiveStoreDistancePolicy(onPolicy, emptyOverrides, "s1", null);
    expect(e).toEqual({ applies: true, maxKm: DEFAULT_STORE_DELIVERY_RADIUS_KM, policySource: "store" });
    const e2 = resolveEffectiveStoreDistancePolicy(onPolicy, emptyOverrides, "s1", 15);
    expect(e2).toEqual({ applies: true, maxKm: 15, policySource: "store" });
  });
});
