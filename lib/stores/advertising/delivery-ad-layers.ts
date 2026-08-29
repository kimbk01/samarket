/**
 * CUT A — Campaign ≠ Exposure layer contract.
 * CUT B — Legacy surface gates classified COMPATIBILITY (see LEGACY_SURFACE_GATE_CLASSIFICATION).
 *
 * HARD LOCK: campaign exists ≠ exposure.
 */

export const DELIVERY_AD_EXPOSURE_LAYERS = [
  "CAMPAIGN",
  "SURFACE_POLICY",
  "ELIGIBILITY",
  "INSERTION_PLAN",
] as const;
export type DeliveryAdExposureLayer = (typeof DELIVERY_AD_EXPOSURE_LAYERS)[number];

/**
 * Legacy surface-policy keys — not campaign entities.
 * CUT B: absorb into Inventory / Placement SSOT.
 */
export const COMPATIBILITY_SURFACE_POLICY_KEYS = [
  "ad_integration",
  "ad_enabled",
  "homePaidAdInsertion",
] as const;
export type CompatibilitySurfacePolicyKey = (typeof COMPATIBILITY_SURFACE_POLICY_KEYS)[number];

export const DELIVERY_AD_CAMPAIGN_NE_EXPOSURE = {
  rule: "campaign_exists_is_not_exposure",
  requiredLayers: DELIVERY_AD_EXPOSURE_LAYERS,
  compatibilitySurfacePolicy: COMPATIBILITY_SURFACE_POLICY_KEYS,
  /** CUT B — gates remain COMPATIBILITY; inventory is CANONICAL for placement identity. */
  cutBStatus: "COMPATIBILITY_SURFACE_POLICY_WITH_INVENTORY_SSOT",
} as const;

/**
 * CUT A historical: storeEligibleById null → default true (PARTIAL).
 * CUT D closed the gap — see STORE_ELIGIBILITY_CUT_D_STATUS (null→true REMOVED).
 */
export const STORE_ELIGIBILITY_CUT_A_STATUS = {
  status: "PARTIAL_DEFER_CUT_D",
  evidence:
    "HISTORICAL CUT A: storeEligibleById null at HOME/BROWSE callers; resolver defaulted storeEligible=true. CLOSED by CUT D organic-pool map (fail-closed).",
  contract: "paid_campaign_must_not_bypass_organic_or_serviceability_eligibility",
  supersededBy: "CUT_D",
} as const;
