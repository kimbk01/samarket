/**
 * CUT 0 — Paid-ad exposure-state contract (pure types + derive).
 * CUT 4 — runtime cutover via `lib/stores/store-paid-ad-exposure.ts`.
 *
 * TYPE / CONTRACT = YES
 * RUNTIME CUTOVER = YES (CUT 4)
 */

export type StoresDiscoveryPaidAdExposureFactors = {
  campaignActive: boolean;
  windowActive: boolean;
  storeEligible: boolean;
  placementMatched: boolean;
  taxonomyScopeMatched: boolean;
  surfaceAllowed: boolean;
};

export const STORES_DISCOVERY_PAID_AD_EXPOSURE_FACTOR_KEYS = [
  "campaignActive",
  "windowActive",
  "storeEligible",
  "placementMatched",
  "taxonomyScopeMatched",
  "surfaceAllowed",
] as const satisfies readonly (keyof StoresDiscoveryPaidAdExposureFactors)[];

export type StoresDiscoveryPaidAdBlockingReason =
  (typeof STORES_DISCOVERY_PAID_AD_EXPOSURE_FACTOR_KEYS)[number];

export type StoresDiscoveryPaidAdExposureState = {
  factors: StoresDiscoveryPaidAdExposureFactors;
  actualExposureEligible: boolean;
  blockingReasons: StoresDiscoveryPaidAdBlockingReason[];
};

/**
 * Pure derive — later CUT 4 will feed real campaign/surface inputs.
 * CUT 0: contract test only; no DB/query coupling.
 */
export function deriveStoresDiscoveryPaidAdExposureState(
  factors: StoresDiscoveryPaidAdExposureFactors
): StoresDiscoveryPaidAdExposureState {
  const blockingReasons: StoresDiscoveryPaidAdBlockingReason[] = [];
  for (const key of STORES_DISCOVERY_PAID_AD_EXPOSURE_FACTOR_KEYS) {
    if (!factors[key]) blockingReasons.push(key);
  }
  return {
    factors,
    actualExposureEligible: blockingReasons.length === 0,
    blockingReasons,
  };
}
