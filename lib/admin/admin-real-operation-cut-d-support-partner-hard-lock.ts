/**
 * DIBAY Admin Real Operation — CUT D SUPPORT + PARTNER CONTEXT LINKAGE
 *
 * Closes Support ↔ Ads / Finance / Store / Partner deep-links without merging
 * Support cases, Delivery ops threads, or legacy platform inquiries.
 *
 * Gate: `npm run verify:admin-real-operation-cut-d-support-partner-hard-lock`
 * Doc: `docs/dibay-admin-real-operation-cut-d-support-partner-hard-lock.md`
 */

export const ADMIN_REAL_OPERATION_CUT_D_LOCK_ID =
  "dibay-admin-real-operation-cut-d-support-partner-hard-lock" as const;

export const ADMIN_REAL_OPERATION_CUT_D_LOCKED = true as const;

/** Support case ≠ Delivery ops thread ≠ legacy platform inquiry. */
export const SUPPORT_OPS_LEGACY_SEPARATION = {
  mergeSupportIntoOpsThread: false,
  mergeOpsThreadIntoSupport: false,
  migrateLegacyPlatformInquiriesIntoSupport: false,
  newPartnerInquiryTableForbidden: true,
  newSupportV2ShellForbidden: true,
  supportMutatesAds: false,
  supportMutatesFinance: false,
  supportMutatesPartner: false,
} as const;

/** Canonical Support reference types added/confirmed in CUT D (pointer only). */
export const CUT_D_SUPPORT_REFERENCE_TYPES = [
  "FEED_AD_REQUEST",
  "PLATFORM_POPUP_OWNER_REQUEST",
  "POINT_CHARGE_REQUEST",
  "BUSINESS_CASH_CHARGE_REQUEST",
  "PARTNER_MEMBERSHIP",
] as const;

export const CUT_D_SUPPORT_REFERENCE_CAPABILITY = {
  DELIVERY_AD: true,
  FEED_AD: true,
  POPUP: true,
  POINT_CHARGE: true,
  CASH_CHARGE: true,
  PARTNER: true,
  STORE_ORDER: true,
  GIFT_INSTANCE: true,
  STORE_PRODUCT: true,
  STORE_SETTLEMENT: true,
  /** Snapshot columns on support_cases remain forbidden. */
  domainSnapshotDuplication: false,
} as const;

export const CUT_D_CANONICAL_MODULES = {
  supportRoot: "lib/support/*",
  referenceAuthority: "lib/support/support-reference-authority.ts",
  referenceAdminHref: "lib/support/support-reference-admin-href.ts",
  categoryRegistry: "lib/support/support-category-registry.ts",
  adminSupportPage: "components/admin/support/AdminSupportPage.tsx",
  partnerMembershipsView:
    "components/admin/stores/AdminDeliveryAdPartnerMembershipsView.tsx",
  deliveryAdDetail: "components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx",
  partnerMembershipTable: "delivery_ad_partner_memberships",
  partnerIsAdProduct: false,
} as const;

/** Carry from CUT B/C — must stay visible until Production close (CUT I). */
export const CUT_B_C_PRODUCTION_CARRY = {
  financeOperationUx: "PARTIAL",
  financeProductionE2E: "NOT_PROVEN",
  coinProductionEarn: "NOT_PROVEN",
  saleRecognitionEnv: "NOT_PROVEN",
  tabletFinance: "NOT_PROVEN",
  deliveryAdsOperation: "PARTIAL",
  popupRuntime: "NOT_PROVEN",
  resumeEndLive: "NOT_PROVEN",
  previewLiveParity: "NOT_PROVEN",
  tabletAds: "NOT_PROVEN",
  /** CUT D surfaces — device not measured. */
  tabletSupportPartner: "NOT_PROVEN",
} as const;

/** admin-bell store_charges must not become Support/Partner badge source. */
export const ADMIN_BELL_STORE_CHARGES_NOT_FOR_SUPPORT_BADGE = true as const;

export function assertAdminRealOperationCutDSupportPartnerHardLock(): boolean {
  return (
    ADMIN_REAL_OPERATION_CUT_D_LOCKED === true &&
    SUPPORT_OPS_LEGACY_SEPARATION.mergeOpsThreadIntoSupport === false &&
    SUPPORT_OPS_LEGACY_SEPARATION.supportMutatesAds === false &&
    SUPPORT_OPS_LEGACY_SEPARATION.supportMutatesFinance === false &&
    CUT_D_SUPPORT_REFERENCE_CAPABILITY.domainSnapshotDuplication === false &&
    CUT_D_CANONICAL_MODULES.partnerIsAdProduct === false &&
    ADMIN_BELL_STORE_CHARGES_NOT_FOR_SUPPORT_BADGE === true &&
    CUT_B_C_PRODUCTION_CARRY.financeProductionE2E === "NOT_PROVEN" &&
    CUT_B_C_PRODUCTION_CARRY.popupRuntime === "NOT_PROVEN" &&
    CUT_B_C_PRODUCTION_CARRY.tabletSupportPartner === "NOT_PROVEN"
  );
}
