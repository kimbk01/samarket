/**
 * CUT B — Final exposure eligibility AND-list (contract).
 * CUT D — runtime fail-closed wiring + null→true REMOVED
 *   (@see store-sponsored-exposure-eligibility.ts).
 * budget_available remains NOT_IMPLEMENTED until CUT H (not a fake PASS).
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
  evidence:
    "HISTORICAL CUT B: storeEligibleById null at HOME/BROWSE callers; no boolean patch in CUT B. CLOSED by CUT D.",
  contract: "paid_must_not_bypass_organic_or_serviceability",
  factors: DELIVERY_AD_EXPOSURE_ELIGIBILITY_FACTORS,
  supersededBy: "CUT_D",
} as const;
