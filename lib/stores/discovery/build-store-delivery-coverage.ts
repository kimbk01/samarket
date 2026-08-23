import {
  evaluateDeliveryServiceability,
  resolveEffectiveStoreDistancePolicy,
  type DeliveryServiceabilityInput,
} from "@/lib/delivery/evaluate-delivery-serviceability";
import type {
  DeliveryDistancePolicy,
  DeliveryStoreDistanceMode,
  DeliveryStoreDistanceOverrides,
} from "@/lib/delivery/delivery-ops-settings";
import { parseFiniteLatitude, parseFiniteLongitude } from "@/lib/geo/parse-finite-geographic-coord";

export type StoreDeliveryCoverageBuildInput = {
  storeId: string;
  lat: unknown;
  lng: unknown;
  policy: DeliveryDistancePolicy;
  overrides: DeliveryStoreDistanceOverrides;
  policyVersion: number;
  storePolicyVersion: number;
};

export type StoreDeliveryCoverageBuildResult = {
  storeId: string;
  policyVersion: number;
  storePolicyVersion: number;
  effectiveMaxKm: number | null;
  distanceApplies: boolean;
  coversAll: boolean;
  deliveryModeEffective: DeliveryStoreDistanceMode;
  lat: number | null;
  lng: number | null;
  hasCoords: boolean;
};

function resolveDeliveryModeEffective(
  policy: DeliveryDistancePolicy,
  overrides: DeliveryStoreDistanceOverrides,
  storeId: string
): DeliveryStoreDistanceMode {
  if (!policy.enabled) return "inherit";
  const override = overrides.stores[storeId.trim()];
  return override?.mode ?? "inherit";
}

/** Pure coverage projection inputs — policy resolution uses canonical SSOT. */
export function buildStoreDeliveryCoverageProjection(
  input: StoreDeliveryCoverageBuildInput
): StoreDeliveryCoverageBuildResult {
  const storeId = input.storeId.trim();
  const lat = parseFiniteLatitude(input.lat);
  const lng = parseFiniteLongitude(input.lng);
  const hasCoords = lat != null && lng != null;

  const effective = resolveEffectiveStoreDistancePolicy(input.policy, input.overrides, storeId);
  const deliveryModeEffective = resolveDeliveryModeEffective(input.policy, input.overrides, storeId);

  if (!effective.applies) {
    return {
      storeId,
      policyVersion: input.policyVersion,
      storePolicyVersion: input.storePolicyVersion,
      effectiveMaxKm: effective.maxKm,
      distanceApplies: false,
      coversAll: true,
      deliveryModeEffective,
      lat,
      lng,
      hasCoords,
    };
  }

  if (effective.maxKm == null) {
    return {
      storeId,
      policyVersion: input.policyVersion,
      storePolicyVersion: input.storePolicyVersion,
      effectiveMaxKm: null,
      distanceApplies: true,
      coversAll: true,
      deliveryModeEffective,
      lat,
      lng,
      hasCoords,
    };
  }

  return {
    storeId,
    policyVersion: input.policyVersion,
    storePolicyVersion: input.storePolicyVersion,
    effectiveMaxKm: effective.maxKm,
    distanceApplies: true,
    coversAll: false,
    deliveryModeEffective,
    lat,
    lng,
    hasCoords,
  };
}

export type CoverageServiceabilityProbe = Pick<
  DeliveryServiceabilityInput,
  "policy" | "overrides" | "storeId" | "customerLat" | "customerLng" | "storeLat" | "storeLng"
>;

/** Parity helper — TS haversine evaluator vs coverage radius semantics. */
export function isCustomerInsideCoverageRadius(probe: CoverageServiceabilityProbe): boolean {
  const result = evaluateDeliveryServiceability(probe);
  if (!result.applies) return true;
  if (result.reason === "missing_store_coords" || result.reason === "missing_customer_coords") {
    return false;
  }
  return result.eligible;
}
