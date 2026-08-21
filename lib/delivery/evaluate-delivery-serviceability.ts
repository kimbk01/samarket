/**
 * DELIVERY SERVICEABILITY SSOT — straight-line (haversine) only.
 * Google Routes / Matrix MUST NOT be used for order eligibility.
 *
 * Effective policy:
 * - global.enabled === false → distance axis always eligible (other gates elsewhere)
 * - store override.mode === "disabled" → distance axis skipped for that store
 * - else maxKm = override.maxKm ?? global.defaultMaxKm (null = no max)
 * - missing customer/store coords when distance applies → ineligible
 * - distanceKm > maxKm → ineligible
 */
import { haversineKm } from "@/lib/geo/haversine-km";
import { parseFiniteLatitude, parseFiniteLongitude } from "@/lib/geo/parse-finite-geographic-coord";
import type {
  DeliveryDistancePolicy,
  DeliveryStoreDistanceOverrides,
} from "@/lib/delivery/delivery-ops-settings";

export type DeliveryServiceabilityReason =
  | "policy_off"
  | "store_override_disabled"
  | "eligible"
  | "eligible_no_max"
  | "missing_customer_coords"
  | "missing_store_coords"
  | "out_of_range";

export type DeliveryServiceabilityResult = {
  eligible: boolean;
  distanceKm: number | null;
  maxKm: number | null;
  applies: boolean;
  policySource: "off" | "global" | "store" | "store_disabled";
  reason: DeliveryServiceabilityReason;
};

export type DeliveryServiceabilityInput = {
  policy: DeliveryDistancePolicy;
  overrides: DeliveryStoreDistanceOverrides;
  storeId: string;
  customerLat: unknown;
  customerLng: unknown;
  storeLat: unknown;
  storeLng: unknown;
};

export function resolveEffectiveStoreDistancePolicy(
  policy: DeliveryDistancePolicy,
  overrides: DeliveryStoreDistanceOverrides,
  storeId: string
): { applies: boolean; maxKm: number | null; policySource: DeliveryServiceabilityResult["policySource"] } {
  if (!policy.enabled) {
    return { applies: false, maxKm: null, policySource: "off" };
  }
  const override = overrides.stores[storeId.trim()];
  if (override?.mode === "disabled") {
    return { applies: false, maxKm: override.maxKm ?? policy.defaultMaxKm, policySource: "store_disabled" };
  }
  if (override?.mode === "enabled") {
    return {
      applies: true,
      maxKm: override.maxKm ?? policy.defaultMaxKm,
      policySource: "store",
    };
  }
  return {
    applies: true,
    maxKm: override?.maxKm ?? policy.defaultMaxKm,
    policySource: "global",
  };
}

/** Pure evaluator — no I/O, no Google. */
export function evaluateDeliveryServiceability(
  input: DeliveryServiceabilityInput
): DeliveryServiceabilityResult {
  const effective = resolveEffectiveStoreDistancePolicy(input.policy, input.overrides, input.storeId);
  if (!effective.applies) {
    return {
      eligible: true,
      distanceKm: null,
      maxKm: effective.maxKm,
      applies: false,
      policySource: effective.policySource,
      reason: effective.policySource === "store_disabled" ? "store_override_disabled" : "policy_off",
    };
  }

  const clat = parseFiniteLatitude(input.customerLat);
  const clng = parseFiniteLongitude(input.customerLng);
  if (clat == null || clng == null) {
    return {
      eligible: false,
      distanceKm: null,
      maxKm: effective.maxKm,
      applies: true,
      policySource: effective.policySource,
      reason: "missing_customer_coords",
    };
  }

  const slat = parseFiniteLatitude(input.storeLat);
  const slng = parseFiniteLongitude(input.storeLng);
  if (slat == null || slng == null) {
    return {
      eligible: false,
      distanceKm: null,
      maxKm: effective.maxKm,
      applies: true,
      policySource: effective.policySource,
      reason: "missing_store_coords",
    };
  }

  const distanceKm = haversineKm(clat, clng, slat, slng);
  if (distanceKm == null || !Number.isFinite(distanceKm)) {
    return {
      eligible: false,
      distanceKm: null,
      maxKm: effective.maxKm,
      applies: true,
      policySource: effective.policySource,
      reason: "missing_store_coords",
    };
  }

  const rounded = Math.round(distanceKm * 1000) / 1000;
  if (effective.maxKm != null && rounded > effective.maxKm) {
    return {
      eligible: false,
      distanceKm: rounded,
      maxKm: effective.maxKm,
      applies: true,
      policySource: effective.policySource,
      reason: "out_of_range",
    };
  }

  return {
    eligible: true,
    distanceKm: rounded,
    maxKm: effective.maxKm,
    applies: true,
    policySource: effective.policySource,
    reason: effective.maxKm == null ? "eligible_no_max" : "eligible",
  };
}
