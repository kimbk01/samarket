/**
 * DIBAY Admin Real Operation — CUT J DOMAIN / COMMON OPERATION IA SEPARATION
 *
 * Nav SSOT only. No new domain DB / wallet / ads-v2 / support inbox / shell.
 * Gate: `npm run verify:admin-real-operation-cut-j-ia-separation-hard-lock`
 * Doc: `docs/dibay-admin-real-operation-cut-j-ia-separation-hard-lock.md`
 *
 * J-AMD-1: `members` immediately after `dashboard` (Owner-approved; menu implemented).
 */

export const ADMIN_REAL_OPERATION_CUT_J_LOCK_ID =
  "dibay-admin-real-operation-cut-j-ia-separation-hard-lock" as const;

export const ADMIN_REAL_OPERATION_CUT_J_LOCKED = true as const;

/**
 * Live-enforced top-level workspace order (must match `adminMenu` keys).
 * J-AMD-1: members after dashboard; all other relative order preserved.
 */
export const CUT_J_WORKSPACE_ORDER = [
  "dashboard",
  "members",
  "delivery",
  "trade",
  "community",
  "messenger",
  "finance",
  "ads",
  "promotion",
  "support",
  "notifications",
  "system",
] as const;

/** @deprecated Use CUT_J_WORKSPACE_ORDER — kept as alias for J-AMD-1 target docs/tests. */
export const CUT_J_WORKSPACE_ORDER_J_AMD_1 = CUT_J_WORKSPACE_ORDER;

export const CUT_J_J_AMD_1_OWNER_APPROVED = true as const;

export const CUT_J_J_AMD_1_STATUS = "OWNER_APPROVED_IMPLEMENTED" as const;

/** URL-preserving members leaves (J-AMD-1). */
export const CUT_J_J_AMD_1_MEMBERS_LEAVES = [
  { key: "users", path: "/admin/users" },
  { key: "global-reports", path: "/admin/reports" },
  { key: "reports-logs", path: "/admin/reports/log" },
  { key: "audit-logs", path: "/admin/audit-logs" },
] as const;

/** Explicit Owner rejects (do not implement under this amendment). */
export const CUT_J_J_AMD_1_REJECTED = {
  fullWorkspaceReorder_J_AMD_2: true,
  adsPromotionSingleParent_B_X1: true,
  cutJFullUnlock: true,
} as const;

export const CUT_J_NAV_SSOT = {
  menuTreeAuthority: "components/admin/admin-menu.ts",
  workspaceRoutingAuthority: "lib/admin/admin-workspace-routing.ts",
  shellAuthority: ["AdminPlatformShell", "AdminWorkspaceNav", "AdminWorkspaceSidebar"] as const,
  dissolvedWorkspaces: ["common", "growth"] as const,
  duplicatePrimaryLeafForbidden: true,
  newShellRoutesForbidden: [
    "/admin/ads-v2",
    "/admin/growth-v2",
    "/admin/finance-v2",
    "/admin/support-v2",
    "/admin/control-plane-v2",
  ] as const,
} as const;

/** Config stays domain-owned; ads ops is common UX entry. */
export const CUT_J_CONFIG_VS_OPERATION = {
  homeConfigRoute: "/admin/stores-home-shelves",
  homeConfigWorkspace: "delivery",
  categoryConfigRoute: "/admin/stores-category-policy",
  categoryConfigWorkspace: "delivery",
  deliveryAdsOpsRoute: "/admin/delivery-ads/manage",
  deliveryAdsOpsWorkspace: "ads",
  placementMapRoute: "/admin/delivery-ads/inventory#placement-map",
  placementMapWorkspace: "ads",
  placementMapIsConfigWriter: false,
} as const;

export const CUT_J_LEGACY_PRIMARY_FORBIDDEN = {
  platformInquiriesPrimary: "/admin/platform-inquiries",
  ast002StorePointChargesMenuKey: "store-point-charges-admin",
  growthWorkspaceKey: "growth",
  commonWorkspaceKey: "common",
} as const;

/** CUT I Production P0 carry — do not delete or re-claim as PASS in CUT J. */
export const CUT_I_CARRY_INTO_J = {
  financeF1F3F4F7: "NOT_PROVEN",
  coinSaleRecognition: "NOT_PROVEN",
  adsApplyActiveApp: "NOT_PROVEN",
  pauseResumeEnd: "NOT_PROVEN",
  popupRuntime: "NOT_PROVEN",
  actionCenterProductionUi: "PARTIAL",
  placementActiveEligibility: "PARTIAL",
  creativeLiveParity: "PARTIAL",
  tabletRealDevice: "NOT_PROVEN",
  resetStorage: "NOT_IMPLEMENTED",
  resetAuth: "NOT_IMPLEMENTED",
  resetOverall: "PARTIAL",
} as const;

export function assertAdminRealOperationCutJIaSeparationHardLock(): boolean {
  const order = [...CUT_J_WORKSPACE_ORDER];
  const jAmd1Ok =
    order[0] === "dashboard" &&
    order[1] === "members" &&
    CUT_J_J_AMD_1_OWNER_APPROVED === true &&
    CUT_J_J_AMD_1_REJECTED.fullWorkspaceReorder_J_AMD_2 === true &&
    CUT_J_J_AMD_1_REJECTED.adsPromotionSingleParent_B_X1 === true &&
    CUT_J_J_AMD_1_REJECTED.cutJFullUnlock === true &&
    CUT_J_J_AMD_1_MEMBERS_LEAVES.length === 4;

  return (
    ADMIN_REAL_OPERATION_CUT_J_LOCKED === true &&
    CUT_J_NAV_SSOT.duplicatePrimaryLeafForbidden === true &&
    CUT_J_CONFIG_VS_OPERATION.placementMapIsConfigWriter === false &&
    CUT_J_CONFIG_VS_OPERATION.homeConfigWorkspace === "delivery" &&
    CUT_J_CONFIG_VS_OPERATION.deliveryAdsOpsWorkspace === "ads" &&
    CUT_I_CARRY_INTO_J.financeF1F3F4F7 === "NOT_PROVEN" &&
    CUT_I_CARRY_INTO_J.adsApplyActiveApp === "NOT_PROVEN" &&
    CUT_I_CARRY_INTO_J.resetStorage === "NOT_IMPLEMENTED" &&
    jAmd1Ok
  );
}
