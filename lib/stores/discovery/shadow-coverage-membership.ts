/**
 * CUT 3 — coverage membership for shadow eligibility (G0 vs G2).
 * Reads store_delivery_coverage projection only — no live haversine all-rows path.
 * Membership semantics aligned with evaluateDeliveryServiceability out_of_range /
 * missing_store_coords when distance applies.
 */

export type ShadowCoverageProjection = {
  distanceApplies: boolean;
  coversAll: boolean;
  /** When distance applies and !coversAll: whether origin is inside coverage_geog */
  originCovered: boolean | null;
  /** Store has usable coords / coverage circle materializable */
  hasCoverageGeog: boolean;
};

export type ShadowCoverageMembership = {
  /** Distance axis considered for ranking (policy enabled for store) */
  distanceApplies: boolean;
  /** True → G2 when orderable+delivery_available */
  outOfRange: boolean;
  reason:
    | "policy_off"
    | "covers_all"
    | "inside"
    | "outside"
    | "missing_coverage"
    | "missing_origin";
};

/**
 * G0 coverage gate:
 * ORDERABLE + delivery_available + ( !distanceApplies OR coversAll OR ST_Covers )
 */
export function resolveShadowCoverageMembership(
  coverage: ShadowCoverageProjection | null,
  opts: { hasOrigin: boolean; distanceAxisEnabled: boolean }
): ShadowCoverageMembership {
  if (!opts.distanceAxisEnabled) {
    return { distanceApplies: false, outOfRange: false, reason: "policy_off" };
  }
  if (!coverage || !coverage.distanceApplies) {
    return { distanceApplies: false, outOfRange: false, reason: "policy_off" };
  }
  if (coverage.coversAll) {
    return { distanceApplies: true, outOfRange: false, reason: "covers_all" };
  }
  if (!opts.hasOrigin) {
    return { distanceApplies: true, outOfRange: true, reason: "missing_origin" };
  }
  if (!coverage.hasCoverageGeog) {
    // Parity with missing_store_coords when distance applies
    return { distanceApplies: true, outOfRange: true, reason: "missing_coverage" };
  }
  if (coverage.originCovered === true) {
    return { distanceApplies: true, outOfRange: false, reason: "inside" };
  }
  return { distanceApplies: true, outOfRange: true, reason: "outside" };
}
