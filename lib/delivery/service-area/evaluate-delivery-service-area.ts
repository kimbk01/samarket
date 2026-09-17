/**
 * Canonical dual-mode delivery service-area evaluator.
 *
 * LEGACY_RADIUS → existing haversine ≤ delivery_radius_km
 * V2_LGU → member canonical LGU ∈ Owner-selected set (distance does NOT override)
 *
 * All surfaces must consume this result — do not branch eligibility in UI.
 */

import { haversineKm } from "@/lib/geo/haversine-km";
import { parseFiniteLatitude, parseFiniteLongitude } from "@/lib/geo/parse-finite-geographic-coord";
import {
  evaluateDeliveryServiceability,
  resolveEffectiveStoreDistancePolicy,
  type DeliveryServiceabilityInput,
  type DeliveryServiceabilityReason,
  type DeliveryServiceabilityResult,
} from "@/lib/delivery/evaluate-delivery-serviceability";
import {
  DELIVERY_SERVICE_AREA_AUTHORITY,
  parseDeliveryServiceAreaAuthority,
  type DeliveryServiceAreaAuthority,
} from "@/lib/delivery/service-area/authority";
import { resolveEffectiveStoreDeliveryRadiusKm } from "@/lib/delivery/store-delivery-radius";

export type DeliveryServiceAreaV2Reason =
  | DeliveryServiceabilityReason
  | "selected_lgu"
  | "unselected_lgu"
  | "missing_lgu_identity"
  | "empty_selected_areas";

export type DeliveryServiceAreaEvaluation = {
  eligible: boolean;
  applies: boolean;
  authorityMode: DeliveryServiceAreaAuthority;
  reason: DeliveryServiceAreaV2Reason;
  distanceKm: number | null;
  /** Owner regional discovery reference (effective delivery_radius_km). */
  referenceDistanceKm: number | null;
  /** Legacy maxKm when authority is legacy_radius; null for V2 (not a cutoff). */
  maxKm: number | null;
  memberLguId: string | null;
  matchedLguId: string | null;
  policySource: DeliveryServiceabilityResult["policySource"];
};

export type EvaluateDeliveryServiceAreaInput = DeliveryServiceabilityInput & {
  authorityMode?: unknown;
  /** Owner-selected canonical LGU ids — required when authority is v2_lgu. */
  selectedLguIds?: readonly string[] | null;
  /** Member / order-address canonical LGU id. */
  memberLguId?: string | null;
};

function normalizeIdSet(ids: readonly string[] | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!ids) return out;
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (id) out.add(id);
  }
  return out;
}

function computeDistanceKm(input: EvaluateDeliveryServiceAreaInput): number | null {
  const clat = parseFiniteLatitude(input.customerLat);
  const clng = parseFiniteLongitude(input.customerLng);
  const slat = parseFiniteLatitude(input.storeLat);
  const slng = parseFiniteLongitude(input.storeLng);
  if (clat == null || clng == null || slat == null || slng == null) return null;
  const d = haversineKm(clat, clng, slat, slng);
  if (d == null || !Number.isFinite(d)) return null;
  return Math.round(d * 1000) / 1000;
}

/**
 * ONE canonical resolver for HOME / Browse / Search / Detail / Cart / Order.
 */
export function evaluateDeliveryServiceArea(
  input: EvaluateDeliveryServiceAreaInput
): DeliveryServiceAreaEvaluation {
  const authorityMode = parseDeliveryServiceAreaAuthority(input.authorityMode);
  const referenceDistanceKm = resolveEffectiveStoreDeliveryRadiusKm(input.storeDeliveryRadiusKm);
  const distanceKm = computeDistanceKm(input);

  if (authorityMode === DELIVERY_SERVICE_AREA_AUTHORITY.LEGACY_RADIUS) {
    const legacy = evaluateDeliveryServiceability(input);
    return {
      eligible: legacy.eligible,
      applies: legacy.applies,
      authorityMode,
      reason: legacy.reason,
      distanceKm: legacy.distanceKm,
      referenceDistanceKm,
      maxKm: legacy.maxKm,
      memberLguId: (input.memberLguId ?? "").trim() || null,
      matchedLguId: null,
      policySource: legacy.policySource,
    };
  }

  // --- V2_LGU ---
  // Policy on/off + store override only. Distance MUST NOT gate eligibility.
  const gate = resolveEffectiveStoreDistancePolicy(
    input.policy,
    input.overrides,
    input.storeId,
    input.storeDeliveryRadiusKm
  );
  if (!gate.applies) {
    return {
      eligible: true,
      applies: false,
      authorityMode,
      reason: gate.policySource === "store_disabled" ? "store_override_disabled" : "policy_off",
      distanceKm,
      referenceDistanceKm,
      maxKm: null,
      memberLguId: (input.memberLguId ?? "").trim() || null,
      matchedLguId: null,
      policySource: gate.policySource,
    };
  }

  const memberLguId = (input.memberLguId ?? "").trim() || null;
  const selected = normalizeIdSet(input.selectedLguIds);

  if (!memberLguId) {
    return {
      eligible: false,
      applies: true,
      authorityMode,
      reason: "missing_lgu_identity",
      distanceKm,
      referenceDistanceKm,
      maxKm: null,
      memberLguId: null,
      matchedLguId: null,
      policySource: gate.policySource,
    };
  }

  if (selected.size === 0) {
    return {
      eligible: false,
      applies: true,
      authorityMode,
      reason: "empty_selected_areas",
      distanceKm,
      referenceDistanceKm,
      maxKm: null,
      memberLguId,
      matchedLguId: null,
      policySource: gate.policySource,
    };
  }

  if (selected.has(memberLguId)) {
    return {
      eligible: true,
      applies: true,
      authorityMode,
      reason: "selected_lgu",
      distanceKm,
      referenceDistanceKm,
      maxKm: null,
      memberLguId,
      matchedLguId: memberLguId,
      policySource: gate.policySource,
    };
  }

  return {
    eligible: false,
    applies: true,
    authorityMode,
    reason: "unselected_lgu",
    distanceKm,
    referenceDistanceKm,
    maxKm: null,
    memberLguId,
    matchedLguId: null,
    policySource: gate.policySource,
  };
}

/** Map V2 evaluation → list/OOR boolean used by existing exclude/badge paths. */
export function isDeliveryServiceAreaOutOfRange(evalResult: DeliveryServiceAreaEvaluation): boolean {
  if (!evalResult.applies) return false;
  return evalResult.eligible !== true;
}
