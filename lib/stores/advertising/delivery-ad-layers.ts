/**
 * CUT A — Campaign ≠ Exposure layer contract.
 *
 * HARD LOCK: campaign exists ≠ exposure.
 *
 * Layers (independent authorities):
 *   CAMPAIGN        — row exists / is_active / schedule window
 *   SURFACE_POLICY  — surface allows this ad product (legacy gates)
 *   ELIGIBILITY     — store/service/taxonomy factors
 *   INSERTION_PLAN  — where to interleave (does not reorder organic ranking)
 *
 * Legacy surface gates (COMPATIBILITY — migrate to inventory SSOT in CUT B):
 *   ad_integration · ad_enabled · homePaidAdInsertion
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
  cutBMigrationTarget: "inventory_placement_ssot",
} as const;

/**
 * storeEligibleById: null → default true (CUT A audit).
 * HOME/BROWSE callers currently pass null; organic-pool membership is the
 * indirect gate. Explicit store/serviceability map = CUT D — do not boolean-patch.
 */
export const STORE_ELIGIBILITY_CUT_A_STATUS = {
  status: "PARTIAL_DEFER_CUT_D",
  evidence:
    "storeEligibleById null at HOME/BROWSE callers; resolver defaults storeEligible=true; taxonomy/organic pool is indirect gate",
  contract: "paid_campaign_must_not_bypass_organic_or_serviceability_eligibility",
} as const;
