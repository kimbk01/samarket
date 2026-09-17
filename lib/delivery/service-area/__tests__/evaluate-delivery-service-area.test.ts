import { describe, expect, it } from "vitest";
import {
  evaluateDeliveryServiceArea,
  isDeliveryServiceAreaOutOfRange,
} from "@/lib/delivery/service-area/evaluate-delivery-service-area";
import { DELIVERY_SERVICE_AREA_AUTHORITY } from "@/lib/delivery/service-area/authority";
import {
  discoverDeliveryServiceAreaCandidates,
  resolveRegionalCandidateSearchKm,
  roundDiscoveryKmInclusive,
} from "@/lib/delivery/service-area/candidate-discovery";
import { classifyDeliveryRegionalListBand } from "@/lib/delivery/service-area/regional-list-presentation";
import type { DeliveryDistancePolicy } from "@/lib/delivery/delivery-ops-settings";

const policyOn: DeliveryDistancePolicy = {
  enabled: true,
  source: "straight",
  defaultMaxKm: 10,
  overDistanceBehavior: "exclude",
};

const emptyOverrides = { stores: {} };

/** Approximate: 1° lat ≈ 111km → 0.1° ≈ 11.1km */
const STORE = { lat: 14.65, lng: 121.05 }; // QC-ish

describe("delivery service area V2 evaluator", () => {
  it("A: V2 selected LGU at >R is eligible (distance does not cut)", () => {
    const r = evaluateDeliveryServiceArea({
      policy: policyOn,
      overrides: emptyOverrides,
      storeId: "s1",
      storeDeliveryRadiusKm: 10,
      storeLat: STORE.lat,
      storeLng: STORE.lng,
      // ~12.7km south
      customerLat: STORE.lat - 0.114,
      customerLng: STORE.lng,
      authorityMode: DELIVERY_SERVICE_AREA_AUTHORITY.V2_LGU,
      selectedLguIds: ["lgu-mandaluyong"],
      memberLguId: "lgu-mandaluyong",
    });
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe("selected_lgu");
    expect(r.distanceKm != null && r.distanceKm > 10).toBe(true);
    expect(isDeliveryServiceAreaOutOfRange(r)).toBe(false);
  });

  it("B: V2 unselected LGU at <R is out_of_area", () => {
    const r = evaluateDeliveryServiceArea({
      policy: policyOn,
      overrides: emptyOverrides,
      storeId: "s1",
      storeDeliveryRadiusKm: 10,
      storeLat: STORE.lat,
      storeLng: STORE.lng,
      customerLat: STORE.lat - 0.02,
      customerLng: STORE.lng,
      authorityMode: DELIVERY_SERVICE_AREA_AUTHORITY.V2_LGU,
      selectedLguIds: ["lgu-qc"],
      memberLguId: "lgu-manila",
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("unselected_lgu");
    expect(r.distanceKm != null && r.distanceKm < 10).toBe(true);
    expect(isDeliveryServiceAreaOutOfRange(r)).toBe(true);
  });

  it("C: farther manually-added LGU is eligible", () => {
    const r = evaluateDeliveryServiceArea({
      policy: policyOn,
      overrides: emptyOverrides,
      storeId: "s1",
      storeDeliveryRadiusKm: 10,
      storeLat: STORE.lat,
      storeLng: STORE.lng,
      customerLat: STORE.lat - 0.25,
      customerLng: STORE.lng,
      authorityMode: DELIVERY_SERVICE_AREA_AUTHORITY.V2_LGU,
      selectedLguIds: ["lgu-far"],
      memberLguId: "lgu-far",
    });
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe("selected_lgu");
  });

  it("H: legacy store keeps hard-radius cutoff", () => {
    const inside = evaluateDeliveryServiceArea({
      policy: policyOn,
      overrides: emptyOverrides,
      storeId: "s1",
      storeDeliveryRadiusKm: 10,
      storeLat: STORE.lat,
      storeLng: STORE.lng,
      customerLat: STORE.lat - 0.02,
      customerLng: STORE.lng,
      authorityMode: DELIVERY_SERVICE_AREA_AUTHORITY.LEGACY_RADIUS,
      selectedLguIds: [],
      memberLguId: "ignored",
    });
    expect(inside.eligible).toBe(true);

    const outside = evaluateDeliveryServiceArea({
      policy: policyOn,
      overrides: emptyOverrides,
      storeId: "s1",
      storeDeliveryRadiusKm: 10,
      storeLat: STORE.lat,
      storeLng: STORE.lng,
      customerLat: STORE.lat - 0.15,
      customerLng: STORE.lng,
      authorityMode: DELIVERY_SERVICE_AREA_AUTHORITY.LEGACY_RADIUS,
      selectedLguIds: ["would-not-matter"],
      memberLguId: "would-not-matter",
    });
    expect(outside.eligible).toBe(false);
    expect(outside.reason).toBe("out_of_range");
  });

  it("I: V2 distance does not override unselected", () => {
    const r = evaluateDeliveryServiceArea({
      policy: policyOn,
      overrides: emptyOverrides,
      storeId: "s1",
      storeDeliveryRadiusKm: 60,
      storeLat: STORE.lat,
      storeLng: STORE.lng,
      customerLat: STORE.lat,
      customerLng: STORE.lng,
      authorityMode: DELIVERY_SERVICE_AREA_AUTHORITY.V2_LGU,
      selectedLguIds: ["other"],
      memberLguId: "home-city",
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("unselected_lgu");
  });
});

describe("candidate discovery R+10", () => {
  it("R → search = R+10 with inclusive rounding", () => {
    expect(resolveRegionalCandidateSearchKm(10)).toBe(20);
    expect(resolveRegionalCandidateSearchKm(20)).toBe(30);
    expect(resolveRegionalCandidateSearchKm(30)).toBe(40);
    expect(resolveRegionalCandidateSearchKm(15)).toBe(25);
    expect(roundDiscoveryKmInclusive(20.04)).toBe(20);
  });

  it("R=20 bands: 15 primary, 25 extended, >30 outside", () => {
    const R = 20;
    const S = resolveRegionalCandidateSearchKm(R);
    expect(S).toBe(30);
    expect(classifyDeliveryRegionalListBand(15, R, S)).toBe("base");
    expect(classifyDeliveryRegionalListBand(25, R, S)).toBe("extended");
    expect(classifyDeliveryRegionalListBand(31, R, S)).toBe("outside");
  });

  it("always includes store-home LGU in candidates", () => {
    // Quezon City PSGC-ish — use real id from dataset if available via resolve
    const candidates = discoverDeliveryServiceAreaCandidates({
      storeLat: 14.676,
      storeLng: 121.0437,
      referenceRadiusKm: 10,
      storeHomeLguId: "1381300000", // Quezon City
    });
    expect(candidates.some((c) => c.geoIdentity === "1381300000" && c.isStoreHome)).toBe(
      true
    );
  });
});
