/**
 * DIBAY Admin Real Operation — CUT A AUTHORITY / LEGACY / DEAD ROUTE HARD LOCK
 *
 * Purpose: freeze CURRENT REALITY so later CUTs cannot invent parallel SSOTs.
 * NOT a UI / menu-move / Growth Hub cut.
 *
 * Gate: `npm run verify:admin-real-operation-cut-a-authority-hard-lock`
 * Doc: `docs/dibay-admin-real-operation-cut-a-authority-hard-lock.md`
 *
 * Forbidden in later CUTs without reopening this lock:
 * - New unified_* tables / ads-v2 parallel console
 * - Writing through REDIRECT_ONLY / NO_NEW_WRITE surfaces
 * - Absorbing HOME/CATEGORY composition into Ads Control Plane
 * - Treating Partner as Delivery AdProduct
 * - Merging Feed / Popup / Delivery placement registries
 * - Expanding UI "campaign" as cross-domain SSOT name (DB *_campaigns stay)
 */

export const ADMIN_REAL_OPERATION_CUT_A_LOCK_ID =
  "dibay-admin-real-operation-cut-a-authority-hard-lock" as const;

export const ADMIN_REAL_OPERATION_CUT_A_LOCKED = true as const;

/** Delivery finance applicationId often equals execution row id — schema change deferred. */
export const DELIVERY_AD_APPLICATION_ID_EQUALS_EXECUTION_ID = true as const;

// ---------------------------------------------------------------------------
// ADMIN NAV
// ---------------------------------------------------------------------------

export const ADMIN_NAV_AUTHORITY = {
  menuTree: "components/admin/admin-menu.ts",
  workspaceDerive: "lib/admin/admin-workspace-routing.ts",
  shell: "components/admin/shell/AdminPlatformShell.tsx",
  topNav: "components/admin/shell/AdminWorkspaceNav.tsx",
  sidebar: "components/admin/shell/AdminWorkspaceSidebar.tsx",
  compatAdapterOnly: "lib/admin-menu-config.ts",
  duplicateMenuTreeAllowed: false,
} as const;

// ---------------------------------------------------------------------------
// FINANCE
// ---------------------------------------------------------------------------

export const POINT_AUTHORITY = {
  module: "lib/points/user-point-ledger.ts",
  balanceSsot: "sum_user_point_ledger",
  ledgerTable: "point_ledger",
  cacheOnly: "profiles.points",
  topup: "point_charge_requests + approve_user_point_charge_request",
  adSpend: "MEMBER_ADS_ONLY" as const,
  deliveryAdSpend: false,
} as const;

export const COIN_AUTHORITY = {
  module: "lib/currency/* + confirmed-sale-coin-writer",
  balanceTable: "store_economic_point_accounts",
  ledgerTable: "store_economic_point_ledger",
  topup: false,
  withdraw: true,
  convertToCash: "convert_store_economic_points_to_business_cash",
  deliveryAdSpend: false,
} as const;

/** Product name = Cash. Internal tables still business_cash_*. */
export const CASH_AUTHORITY = {
  productName: "Cash" as const,
  legacyUiAlias: "Business Cash" as const,
  module: "lib/stores/advertising/canonical-business-cash-contract.ts",
  balanceTable: "business_cash_accounts",
  ledgerTable: "business_cash_ledger",
  spendRpc: "business_cash_delivery_ad_spend",
  refundRpc: "business_cash_delivery_ad_refund",
  topup: "business_cash_charge_requests",
  deliveryAdSpend: true,
  partnerSpend: true,
} as const;

export const LEGACY_FINANCE_NO_NEW_WRITE = [
  "stores.point_balance",
  "store_point_ledger",
  "store_point_charge_requests",
  "store_cash_accounts",
  "store_cash_ledger",
  "delivery_ad_accounts",
  "delivery_ad_business_cash_charge_requests",
] as const;

// ---------------------------------------------------------------------------
// DELIVERY ADS
// ---------------------------------------------------------------------------

export const DELIVERY_AD_PRODUCT_AUTHORITY = {
  module: "lib/stores/advertising/delivery-ad-product-registry.ts",
  table: "delivery_ad_products",
  keys: ["store_sponsored", "banner"] as const,
} as const;

export const DELIVERY_AD_EXECUTION_AUTHORITY = {
  lifecycleModule: "lib/stores/advertising/delivery-ad-lifecycle.ts",
  storeSponsoredTable: "store_paid_ad_campaigns",
  bannerTable: "store_banner_ad_campaigns",
  /** UI term: 광고 집행 (DB column/table may still say campaign). */
  uiTerm: "ad_execution" as const,
} as const;

export const DELIVERY_AD_CREATIVE_AUTHORITY = {
  module: "lib/stores/advertising/delivery-ad-creative.ts",
  table: "delivery_ad_creatives",
} as const;

export const DELIVERY_AD_PLACEMENT_AUTHORITY = {
  module: "lib/stores/advertising/delivery-ad-inventory.ts",
  table: "delivery_ad_inventories",
} as const;

export const DELIVERY_AD_LIFECYCLE_AUTHORITY = {
  module: "lib/stores/advertising/delivery-ad-lifecycle.ts",
  adminTransitionRpc: "admin_delivery_ad_transition",
  adminWriter: "lib/stores/advertising/admin-delivery-ad-writer.ts",
  adminContract: "lib/stores/advertising/admin-delivery-ad-contract.ts",
} as const;

export const DELIVERY_AD_ADMIN_CTA_AUTHORITY = {
  requiredDecision: "lib/stores/advertising/delivery-ad-admin-required-decision.ts",
  actionQueue: "lib/stores/advertising/delivery-ad-admin-action-queue-presentation.ts",
  consumers: [
    "components/admin/stores/AdminDeliveryAdDetailWorkspace.tsx",
    "components/admin/stores/AdminDeliveryAdActionQueuePanel.tsx",
  ] as const,
} as const;

export const DELIVERY_AD_ELIGIBILITY_AUTHORITY = {
  sponsored: "lib/stores/advertising/store-sponsored-exposure-eligibility.ts",
  contract: "lib/stores/advertising/delivery-ad-eligibility-contract.ts",
} as const;

// ---------------------------------------------------------------------------
// FEED ADS (MUST REMAIN SEPARATE FROM DELIVERY)
// ---------------------------------------------------------------------------

export const FEED_AD_AUTHORITY = {
  root: "lib/ads/*",
  products: "lib/ads/feed-ad-products.ts",
  requests: "feed_ad_requests",
  execution: "feed_ad_campaigns",
  creatives: "feed_ad_creatives",
  placement: "lib/ads/feed-ad-placement.ts",
  billing: "lib/ads/feed-ad-request-point-flow.ts",
  approval: "lib/ads/approve-feed-ad-request.ts",
  sharedWithDelivery: false,
} as const;

// ---------------------------------------------------------------------------
// PLATFORM POPUP
// ---------------------------------------------------------------------------

export const POPUP_AUTHORITY = {
  root: "lib/platform-popup/*",
  executionTable: "platform_popup_campaigns",
  ownerRequestTable: "platform_popup_owner_requests",
  lifecycle: "lib/platform-popup/campaign-lifecycle.ts",
  ownerLifecycle: "lib/platform-popup/owner-request-lifecycle.ts",
  adminRoute: "/admin/platform-popup",
  absorbIntoDeliveryTables: false,
  /**
   * docs/dibay-global-popup-ad-product-contract-lock.md still says IMPLEMENTATION BLOCKED.
   * Code under lib/platform-popup + admin route EXISTS. Treat doc as STALE product-contract
   * for implementation status; do not reopen Delivery absorption.
   */
  docImplementationClaim: "BLOCKED" as const,
  codeState: "IMPLEMENTED_MODULE_PRESENT" as const,
  runtimeProductionPass: "NOT_PROVEN" as const,
} as const;

// ---------------------------------------------------------------------------
// HOME / CATEGORY COMPOSITION (CONFIGURATION — CROSS_LINK_ONLY for Ads)
// ---------------------------------------------------------------------------

export const HOME_COMPOSITION_AUTHORITY = {
  adminRoute: "/admin/stores-home-shelves",
  contract: "lib/stores/composition/stores-composition-contract.ts",
  slots: "lib/stores/composition/stores-composition-home-slots.ts",
  shelfCatalog: "lib/stores/product/stores-home-shelf-product-catalog.ts",
  adsMayWriteComposition: false,
  targetRelation: "CROSS_LINK_ONLY" as const,
} as const;

export const CATEGORY_POLICY_AUTHORITY = {
  adminRoute: "/admin/stores-category-policy",
  page: "components/admin/stores/AdminStoresCategoryPolicyPage.tsx",
  adsMayWriteComposition: false,
  targetRelation: "CROSS_LINK_ONLY" as const,
} as const;

// ---------------------------------------------------------------------------
// SUPPORT
// ---------------------------------------------------------------------------

export const SUPPORT_AUTHORITY = {
  root: "lib/support/*",
  categoryRegistry: "lib/support/support-category-registry.ts",
  referenceAuthority: "lib/support/support-reference-authority.ts",
  adminRoute: "/admin/support",
  archiveRoute: "/admin/support/archive",
} as const;

export const SUPPORT_REFERENCE_CAPABILITY = {
  DELIVERY_AD: true,
  FEED_AD: false,
  POPUP: false,
  FINANCE_LEDGER: false,
  STORE_ORDER: true,
  GIFT_INSTANCE: true,
  STORE_PRODUCT: true,
  STORE_SETTLEMENT: true,
} as const;

export const LEGACY_INQUIRY_STATE = {
  platformAdminInquiries: "READ_ONLY_ARCHIVE" as const,
  platformInquiriesRoute: "REDIRECT_ONLY" as const,
  platformInquiriesRedirectTo: "/admin/support/archive",
  writeApiStatus: 410,
} as const;

export const OPS_THREAD_STATE = {
  deliveryAdOperationsCases: "PRODUCT_OPS_THREAD_NOT_SUPPORT_CASE" as const,
  tables: ["delivery_ad_operations_cases", "delivery_ad_operations_threads"] as const,
  mergeIntoSupportCases: false,
} as const;

// ---------------------------------------------------------------------------
// PARTNER
// ---------------------------------------------------------------------------

export const PARTNER_AUTHORITY = {
  type: "MEMBERSHIP_NOT_AD_PRODUCT" as const,
  notProductFlag: "R3_ADMIN_PARTNER_NOT_PRODUCT",
  configTable: "delivery_ad_partner_config",
  membershipTable: "delivery_ad_partner_memberships",
  billing: "AST_005_CASH" as const,
  adminEntry: "/admin/delivery-ads/partner",
  supportLink: "NOT_PROVEN" as const,
} as const;

// ---------------------------------------------------------------------------
// PLACEMENT SYSTEMS — MUST REMAIN SEPARATE
// ---------------------------------------------------------------------------

export const PLACEMENT_SYSTEMS = {
  delivery: {
    owner: "lib/stores/advertising/delivery-ad-inventory.ts",
    unifyWithFeed: false,
    unifyWithPopup: false,
  },
  feed: {
    owner: "lib/ads/feed-ad-placement.ts",
    unifyWithDelivery: false,
  },
  popup: {
    owner: "lib/platform-popup/surfaces.ts",
    unifyWithDelivery: false,
  },
  legacyAdApplication: {
    owner: "lib/types/ad-application.ts + lib/ads/post-ad-application-adapter.ts",
    class: "LEGACY" as const,
    noNewWrite: true,
  },
  targetPreviewReadModel: "ADAPTER_OVER_SEPARATE_REGISTRIES" as const,
} as const;

// ---------------------------------------------------------------------------
// DEAD / LEGACY / NO_NEW_WRITE SURFACES
// ---------------------------------------------------------------------------

export type LegacySurfaceClass =
  | "CANONICAL"
  | "KEEP"
  | "REDIRECT_ONLY"
  | "READ_ONLY_ARCHIVE"
  | "DEPRECATE"
  | "DEAD"
  | "NO_NEW_WRITE";

export type LegacySurfaceLock = {
  id: string;
  class: LegacySurfaceClass;
  writeAllowed: false | "canonical_only";
  evidence: string;
  target?: string;
};

/**
 * Enforceable inventory for CUT A. Classes may stack conceptually
 * (REDIRECT_ONLY implies NO_NEW_WRITE on that leaf).
 */
export const LEGACY_DEAD_SURFACE_LOCKS: readonly LegacySurfaceLock[] = [
  {
    id: "/admin/store-insertions",
    class: "REDIRECT_ONLY",
    writeAllowed: false,
    evidence: "app/admin/store-insertions/page.tsx",
    target: "/admin/delivery-ads (or coupon when ?focus=coupons)",
  },
  {
    id: "/admin/store-banner-ads",
    class: "REDIRECT_ONLY",
    writeAllowed: false,
    evidence: "app/admin/store-banner-ads/page.tsx",
    target: "/admin/delivery-ads",
  },
  {
    id: "/admin/platform-inquiries",
    class: "REDIRECT_ONLY",
    writeAllowed: false,
    evidence: "app/admin/platform-inquiries/page.tsx",
    target: "/admin/support/archive",
  },
  {
    id: "/admin/operations",
    class: "REDIRECT_ONLY",
    writeAllowed: false,
    evidence: "app/admin/operations/page.tsx",
    target: "/admin",
  },
  {
    id: "/api/admin/store-paid-ads POST|PATCH",
    class: "NO_NEW_WRITE",
    writeAllowed: false,
    evidence: "app/api/admin/store-paid-ads/route.ts status 410",
    target: "/api/admin/delivery-ads",
  },
  {
    id: "/api/admin/store-banner-ads POST|PATCH",
    class: "NO_NEW_WRITE",
    writeAllowed: false,
    evidence: "app/api/admin/store-banner-ads/route.ts status 410",
    target: "/api/admin/delivery-ads",
  },
  {
    id: "/api/admin/platform-inquiries/[id] PATCH",
    class: "NO_NEW_WRITE",
    writeAllowed: false,
    evidence: "app/api/admin/platform-inquiries/[id]/route.ts status 410",
    target: "/admin/support",
  },
  {
    id: "/api/admin/store-points/[storeId]/adjust",
    class: "NO_NEW_WRITE",
    writeAllowed: false,
    evidence: "app/api/admin/store-points/[storeId]/adjust/route.ts status 410",
    target: "canonical Coin/Cash writers",
  },
  {
    id: "/api/admin/store-point-charges/[id]",
    class: "NO_NEW_WRITE",
    writeAllowed: false,
    evidence: "app/api/admin/store-point-charges/[id]/route.ts status 410",
    target: "/admin/finance / business_cash_charge_requests",
  },
  {
    id: "/api/admin/delivery-ads/business-cash POST",
    class: "NO_NEW_WRITE",
    writeAllowed: false,
    evidence: "app/api/admin/delivery-ads/business-cash/route.ts status 410",
    target: "business_cash_charge_requests + AST-005 RPCs",
  },
  {
    id: "lib/ads/post-ad-application-adapter.ts",
    class: "DEPRECATE",
    writeAllowed: false,
    evidence: "legacy AdApplication adapter ≠ Delivery product SSOT",
    target: "Delivery / Feed canonical modules",
  },
  {
    id: "system/growth/ads-legacy menu cluster",
    class: "DEPRECATE",
    writeAllowed: "canonical_only",
    evidence: "components/admin/admin-menu.ts ads-legacy status partial",
    target: "do not add new product writes under legacy leaves",
  },
] as const;

/** API route files that must keep mutating methods returning 410 / legacy_writer_disabled. */
export const NO_NEW_WRITE_API_FILES = [
  "app/api/admin/store-paid-ads/route.ts",
  "app/api/admin/store-banner-ads/route.ts",
  "app/api/admin/platform-inquiries/[id]/route.ts",
  "app/api/admin/store-points/[storeId]/adjust/route.ts",
  "app/api/admin/store-point-charges/[id]/route.ts",
  "app/api/admin/delivery-ads/business-cash/route.ts",
] as const;

/** Admin pages that must remain redirect-only (no new page body / writers). */
export const REDIRECT_ONLY_ADMIN_PAGES = [
  "app/admin/store-insertions/page.tsx",
  "app/admin/store-banner-ads/page.tsx",
  "app/admin/platform-inquiries/page.tsx",
  "app/admin/operations/page.tsx",
] as const;

/** Forbidden new shell routes for later CUTs (Control Plane must reuse canonical hubs). */
export const FORBIDDEN_NEW_ADMIN_SHELL_ROUTES = [
  "/admin/growth",
  "/admin/ads-center",
  "/admin/ads-v2",
  "/admin/operations",
] as const;

// ---------------------------------------------------------------------------
// SCENARIO A–R ENTRY LOCK (current entries only — no new TARGET routes)
// ---------------------------------------------------------------------------

export type ScenarioEntryLock = {
  id: string;
  operation: string;
  currentEntry: string;
  canonicalDomain: string;
  readOwner: string;
  writeOwner: string;
  primaryCtaOwner: string;
  targetControlPlaneRole: string;
  currentResult: "REAL" | "PARTIAL" | "FAIL" | "NOT_PROVEN";
};

export const SCENARIO_A_R_ENTRY_LOCK: readonly ScenarioEntryLock[] = [
  {
    id: "A",
    operation: "광고 신청 처리",
    currentEntry: "/admin/delivery-ads",
    canonicalDomain: "DELIVERY_AD",
    readOwner: "admin-delivery-ad-loader",
    writeOwner: "admin_delivery_ad_transition",
    primaryCtaOwner: "delivery-ad-admin-action-queue-presentation",
    targetControlPlaneRole: "CONSUME_QUEUE",
    currentResult: "PARTIAL",
  },
  {
    id: "B",
    operation: "광고 소재 검수",
    currentEntry: "/admin/delivery-ads (detail + creative)",
    canonicalDomain: "DELIVERY_AD_CREATIVE",
    readOwner: "delivery_ad_creatives",
    writeOwner: "admin-delivery-ad-writer / owner-banner-writer",
    primaryCtaOwner: "delivery-ad-admin-required-decision (needs_creative)",
    targetControlPlaneRole: "CONSUME_CREATIVE_CONTEXT",
    currentResult: "PARTIAL",
  },
  {
    id: "C",
    operation: "승인/보류/거절",
    currentEntry: "/admin/delivery-ads detail",
    canonicalDomain: "DELIVERY_AD_LIFECYCLE",
    readOwner: "delivery-ad-lifecycle",
    writeOwner: "admin_delivery_ad_transition",
    primaryCtaOwner: "delivery-ad-admin-required-decision",
    targetControlPlaneRole: "CONSUME_TRANSITION",
    currentResult: "PARTIAL",
  },
  {
    id: "D",
    operation: "노출 위치 확인",
    currentEntry: "placement-preview + /admin/stores-home-shelves|/admin/stores-category-policy",
    canonicalDomain: "DELIVERY_AD_PLACEMENT + HOME/CATEGORY CONFIG",
    readOwner: "delivery-ad-inventory + stores-composition-contract",
    writeOwner: "composition/config owners only",
    primaryCtaOwner: "CROSS_LINK",
    targetControlPlaneRole: "CROSS_LINK_ONLY",
    currentResult: "PARTIAL",
  },
  {
    id: "E",
    operation: "활성 광고 확인",
    currentEntry: "/admin/delivery-ads",
    canonicalDomain: "DELIVERY_AD_EXECUTION",
    readOwner: "admin-delivery-ad-loader",
    writeOwner: "n/a (read)",
    primaryCtaOwner: "filters / ACTIVE bucket",
    targetControlPlaneRole: "CONSUME_LIST",
    currentResult: "PARTIAL",
  },
  {
    id: "F",
    operation: "중지/종료",
    currentEntry: "/admin/delivery-ads detail",
    canonicalDomain: "DELIVERY_AD_LIFECYCLE",
    readOwner: "delivery-ad-lifecycle",
    writeOwner: "admin_delivery_ad_transition",
    primaryCtaOwner: "admin-delivery-ad-contract",
    targetControlPlaneRole: "CONSUME_TRANSITION",
    currentResult: "PARTIAL",
  },
  {
    id: "G",
    operation: "Owner 광고 문의",
    currentEntry: "/admin/support (+ delivery ops cases)",
    canonicalDomain: "SUPPORT + OPS_THREAD",
    readOwner: "lib/support/*",
    writeOwner: "support-case-service",
    primaryCtaOwner: "Support reply CTA",
    targetControlPlaneRole: "CONTEXT_PANEL",
    currentResult: "PARTIAL",
  },
  {
    id: "H",
    operation: "충전 요청 처리",
    currentEntry: "/admin/finance + /admin/point-charges + business-cash-charges",
    canonicalDomain: "POINT | CASH",
    readOwner: "user-point-ledger / business_cash_*",
    writeOwner: "approve_*_charge_request RPCs",
    primaryCtaOwner: "charge approve UI",
    targetControlPlaneRole: "CONTEXT_LINK_FROM_ADS",
    currentResult: "PARTIAL",
  },
  {
    id: "I",
    operation: "Coin→Cash 전환 확인",
    currentEntry: "/admin/finance",
    canonicalDomain: "COIN→CASH",
    readOwner: "store_economic_point_* + business_cash_*",
    writeOwner: "convert_store_economic_points_to_business_cash",
    primaryCtaOwner: "finance panels",
    targetControlPlaneRole: "CONTEXT_LINK",
    currentResult: "PARTIAL",
  },
  {
    id: "J",
    operation: "환불/취소 확인",
    currentEntry: "delivery-ads reject refund + charge reject",
    canonicalDomain: "CASH refund / Point credit",
    readOwner: "business_cash_ledger / point_ledger",
    writeOwner: "business_cash_delivery_ad_refund (+ domain refunds)",
    primaryCtaOwner: "reject / refund flows",
    targetControlPlaneRole: "CONTEXT_LINK",
    currentResult: "PARTIAL",
  },
  {
    id: "K",
    operation: "매장 전체 상태",
    currentEntry: "/admin/business",
    canonicalDomain: "STORE",
    readOwner: "business/store admin loaders",
    writeOwner: "store domain writers",
    primaryCtaOwner: "store detail (summary + deep-links TARGET)",
    targetControlPlaneRole: "STORE_HUB_LINKS",
    currentResult: "PARTIAL",
  },
  {
    id: "L",
    operation: "파트너 확인",
    currentEntry: "/admin/delivery-ads/partner",
    canonicalDomain: "PARTNER_MEMBERSHIP",
    readOwner: "delivery_ad_partner_*",
    writeOwner: "delivery-ad-partner-membership-writer",
    primaryCtaOwner: "partner panels",
    targetControlPlaneRole: "CONSUME_MEMBERSHIP",
    currentResult: "PARTIAL",
  },
  {
    id: "M",
    operation: "회원 문의",
    currentEntry: "/admin/support",
    canonicalDomain: "SUPPORT",
    readOwner: "lib/support/*",
    writeOwner: "support-case-service",
    primaryCtaOwner: "Support reply",
    targetControlPlaneRole: "SUPPORT_INBOX",
    currentResult: "PARTIAL",
  },
  {
    id: "N",
    operation: "매장 문의",
    currentEntry: "/admin/support + /admin/store-inquiries",
    canonicalDomain: "SUPPORT (+ store-inquiries PARTIAL)",
    readOwner: "lib/support/*",
    writeOwner: "support-case-service",
    primaryCtaOwner: "Support reply",
    targetControlPlaneRole: "SUPPORT_INBOX",
    currentResult: "PARTIAL",
  },
  {
    id: "O",
    operation: "Popup 제작/승인/노출",
    currentEntry: "/admin/platform-popup",
    canonicalDomain: "PLATFORM_POPUP",
    readOwner: "lib/platform-popup/*",
    writeOwner: "admin-campaign-writer / owner-request-*",
    primaryCtaOwner: "platform-popup admin transitions",
    targetControlPlaneRole: "CROSS_LINK_FROM_GROWTH",
    currentResult: "PARTIAL",
  },
  {
    id: "P",
    operation: "Banner 제작/승인/노출",
    currentEntry: "/admin/delivery-ads (+ first-party)",
    canonicalDomain: "DELIVERY_AD banner",
    readOwner: "store_banner_ad_campaigns",
    writeOwner: "admin_delivery_ad_transition + creative writers",
    primaryCtaOwner: "delivery-ad-admin-required-decision",
    targetControlPlaneRole: "CONSUME_BANNER_EXECUTION",
    currentResult: "PARTIAL",
  },
  {
    id: "Q",
    operation: "앱 실제 화면 미리보기",
    currentEntry: "DeliveryAdPlacementPreview + AdminStoresHomeShelfLivePreview",
    canonicalDomain: "PLACEMENT_PREVIEW (Delivery/HOME)",
    readOwner: "delivery-ad-placement-preview + composition",
    writeOwner: "n/a",
    primaryCtaOwner: "preview refresh",
    targetControlPlaneRole: "FULL_APP_MAP_LATER",
    currentResult: "PARTIAL",
  },
  {
    id: "R",
    operation: "Pre-launch Reset",
    currentEntry: "NONE",
    canonicalDomain: "NONE",
    readOwner: "NONE",
    writeOwner: "NONE",
    primaryCtaOwner: "NONE",
    targetControlPlaneRole: "CUT_H_ONLY",
    currentResult: "FAIL",
  },
] as const;

export function assertAdminRealOperationCutAAuthorityHardLock(): boolean {
  return (
    ADMIN_REAL_OPERATION_CUT_A_LOCKED === true &&
    ADMIN_NAV_AUTHORITY.duplicateMenuTreeAllowed === false &&
    DELIVERY_AD_PRODUCT_AUTHORITY.keys.length === 2 &&
    FEED_AD_AUTHORITY.sharedWithDelivery === false &&
    POPUP_AUTHORITY.absorbIntoDeliveryTables === false &&
    HOME_COMPOSITION_AUTHORITY.adsMayWriteComposition === false &&
    CATEGORY_POLICY_AUTHORITY.adsMayWriteComposition === false &&
    HOME_COMPOSITION_AUTHORITY.targetRelation === "CROSS_LINK_ONLY" &&
    PARTNER_AUTHORITY.type === "MEMBERSHIP_NOT_AD_PRODUCT" &&
    OPS_THREAD_STATE.mergeIntoSupportCases === false &&
    DELIVERY_AD_APPLICATION_ID_EQUALS_EXECUTION_ID === true &&
    SCENARIO_A_R_ENTRY_LOCK.length === 18 &&
    NO_NEW_WRITE_API_FILES.length >= 6 &&
    REDIRECT_ONLY_ADMIN_PAGES.length >= 4
  );
}
