/**
 * CUT B — Final exposure eligibility AND-list (contract only).
 * Runtime fail-closed wiring = CUT D. storeEligibleById null→true remains PARTIAL.
 */

export const DELIVERY_AD_EXPOSURE_ELIGIBILITY_FACTORS = [
  "campaign_ACTIVE",
  "review_approved",
  "schedule_active",
  "inventory_active",
  "budget_available",
  "store_approved",
  "store_visible",
  "store_operational",
  "delivery_available",
  "customer_serviceable",
  "targeting_match",
] as const;

export type DeliveryAdExposureEligibilityFactor =
  (typeof DELIVERY_AD_EXPOSURE_ELIGIBILITY_FACTORS)[number];

export const STORE_ELIGIBILITY_CUT_B_STATUS = {
  status: "PARTIAL_DEFER_CUT_D",
  evidence: "storeEligibleById null at HOME/BROWSE callers; no boolean patch in CUT B",
  contract: "paid_must_not_bypass_organic_or_serviceability",
  factors: DELIVERY_AD_EXPOSURE_ELIGIBILITY_FACTORS,
} as const;
