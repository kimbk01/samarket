/**
 * CUT 3 — eligibility from discovery_schedule_state projection.
 * Reproduces G0–G5 ranks from resolveStoreDiscoveryEligibility without
 * per-row business_hours_json evaluation.
 */

export type DiscoveryScheduleStateProjection =
  | "ORDERABLE"
  | "IN_BREAK"
  | "CLOSED"
  | "PREPARING"
  | "UNKNOWN"
  | null;

export type ShadowEligibilityState =
  | "orderable_deliverable"
  | "open_delivery_disabled"
  | "open_out_of_range"
  | "resting"
  | "preparing"
  | "closed";

export type ShadowEligibilityResult = {
  state: ShadowEligibilityState;
  rank: number;
};

const RANK: Record<ShadowEligibilityState, number> = {
  orderable_deliverable: 0,
  open_delivery_disabled: 1,
  open_out_of_range: 2,
  resting: 3,
  preparing: 4,
  closed: 5,
};

export function resolveShadowEligibilityFromProjection(input: {
  discoveryScheduleState: DiscoveryScheduleStateProjection;
  deliveryAvailable: boolean | null;
  outOfRange: boolean;
}): ShadowEligibilityResult {
  const schedule = input.discoveryScheduleState;
  const deliveryAvailable = input.deliveryAvailable === true;
  const outOfRange = input.outOfRange === true;

  const orderable = schedule === "ORDERABLE";
  const inBreak = schedule === "IN_BREAK";
  const closed = schedule === "CLOSED";

  let state: ShadowEligibilityState;
  if (orderable && deliveryAvailable && !outOfRange) {
    state = "orderable_deliverable";
  } else if (orderable && !deliveryAvailable) {
    state = "open_delivery_disabled";
  } else if (orderable && outOfRange) {
    state = "open_out_of_range";
  } else if (inBreak) {
    state = "resting";
  } else if (closed) {
    state = "closed";
  } else {
    // PREPARING | UNKNOWN | null → preparing (incomplete projection fails closed to G4)
    state = "preparing";
  }

  return { state, rank: RANK[state] };
}
