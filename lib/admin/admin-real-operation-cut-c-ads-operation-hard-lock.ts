/**
 * DIBAY Admin Real Operation — CUT C ADS OPERATION CLOSE
 *
 * Closes Delivery Ads operation semantics on top of CUT A/B locks.
 * Gate: `npm run verify:admin-real-operation-cut-c-ads-operation-hard-lock`
 * Doc: `docs/dibay-admin-real-operation-cut-c-ads-operation-hard-lock.md`
 *
 * Does NOT: Growth hub, Placement Map, Support ref extension, schema rename of *_campaigns.
 */

export const ADMIN_REAL_OPERATION_CUT_C_LOCK_ID =
  "dibay-admin-real-operation-cut-c-ads-operation-hard-lock" as const;

export const ADMIN_REAL_OPERATION_CUT_C_LOCKED = true as const;

/** UI / app-layer: prefer these terms over bare "campaign". */
export const ADS_OPERATION_UI_TERMS = {
  product: "ad_product",
  application: "ad_application",
  execution: "ad_execution",
  creative: "ad_creative",
  placement: "ad_placement",
  billing: "ad_billing",
  approval: "ad_approval",
  delivery: "ad_delivery",
} as const;

/**
 * Delivery collapses Owner submit into the execution row id for BC funding.
 * CUT C verdict: KEEP_CURRENT (idempotent spend/refund; no proven history overwrite FAIL).
 */
export const DELIVERY_AD_APPLICATION_EXECUTION_VERDICT = "KEEP_CURRENT" as const;

/** Payment/funding alone must never set lifecycle ACTIVE for OWNER_PAID. */
export const DELIVERY_AD_PAYMENT_NEVER_ACTIVATES = true as const;

/** Admin-bell store_charges is AST-002 historical — must not feed Ads or Cash ops queues. */
export const ADMIN_BELL_STORE_CHARGES_NOT_FOR_ADS_OR_CASH_QUEUE = true as const;

export const ADS_DOMAIN_SEPARATION = {
  deliverySharedWithFeed: false,
  deliverySharedWithPopup: false,
  partnerIsAdProduct: false,
  homeCategoryAdsMayWriteComposition: false,
} as const;

/** Carry from CUT B — must stay visible until Production close. */
export const CUT_B_PRODUCTION_CARRY = {
  financeImplementation: "PASS",
  financeSsot: "PASS",
  financeOperationUx: "PARTIAL",
  financeProductionE2E: "NOT_PROVEN",
  coinProductionEarn: "NOT_PROVEN",
  tabletFinance: "NOT_PROVEN",
  saleRecognitionEnv: "NOT_PROVEN",
} as const;

export const DELIVERY_AD_CANONICAL_MODULES = {
  product: "lib/stores/advertising/delivery-ad-product-registry.ts",
  lifecycle: "lib/stores/advertising/delivery-ad-lifecycle.ts",
  creative: "lib/stores/advertising/delivery-ad-creative.ts",
  placement: "lib/stores/advertising/delivery-ad-inventory.ts",
  ctaRequired: "lib/stores/advertising/delivery-ad-admin-required-decision.ts",
  ctaQueue: "lib/stores/advertising/delivery-ad-admin-action-queue-presentation.ts",
  eligibilitySponsored: "lib/stores/advertising/store-sponsored-exposure-eligibility.ts",
  payment: "lib/stores/advertising/canonical-business-cash-contract.ts",
  adminTransitionRpc: "admin_delivery_ad_transition",
} as const;

export function assertAdminRealOperationCutCAdsOperationHardLock(): boolean {
  return (
    ADMIN_REAL_OPERATION_CUT_C_LOCKED === true &&
    DELIVERY_AD_APPLICATION_EXECUTION_VERDICT === "KEEP_CURRENT" &&
    DELIVERY_AD_PAYMENT_NEVER_ACTIVATES === true &&
    ADMIN_BELL_STORE_CHARGES_NOT_FOR_ADS_OR_CASH_QUEUE === true &&
    ADS_DOMAIN_SEPARATION.deliverySharedWithFeed === false &&
    ADS_DOMAIN_SEPARATION.partnerIsAdProduct === false &&
    CUT_B_PRODUCTION_CARRY.financeProductionE2E === "NOT_PROVEN" &&
    CUT_B_PRODUCTION_CARRY.coinProductionEarn === "NOT_PROVEN"
  );
}
