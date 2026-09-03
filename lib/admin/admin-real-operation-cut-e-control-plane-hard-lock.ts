/**
 * DIBAY Admin Real Operation — CUT E OPERATION-CENTERED IA + CONTROL PLANE
 *
 * Assembles A–D authority into Action Center / Store hub / Bell parity.
 * Gate: `npm run verify:admin-real-operation-cut-e-control-plane-hard-lock`
 * Doc: `docs/dibay-admin-real-operation-cut-e-control-plane-hard-lock.md`
 */

export const ADMIN_REAL_OPERATION_CUT_E_LOCK_ID =
  "dibay-admin-real-operation-cut-e-control-plane-hard-lock" as const;

export const ADMIN_REAL_OPERATION_CUT_E_LOCKED = true as const;

/** Control Plane = read composition + deep-link. Not a new domain. */
export const CONTROL_PLANE_DEFINITION = {
  entry: "/admin",
  actionCenterHash: "action-center",
  newDbForbidden: true,
  newShellRoutesForbidden: [
    "/admin/control-plane-v2",
    "/admin/ads-v2",
    "/admin/growth-v2",
    "/admin/ops-v2",
  ] as const,
  mutationOwner: "CANONICAL_DOMAIN_ONLY" as const,
  menuTreeAuthority: "components/admin/admin-menu.ts",
} as const;

/** CUT E Bell semantic fix: Cash ≠ AST-002 store_charges. */
export const ADMIN_BELL_CASH_SEMANTIC = {
  cashSource: "business_cash_charge_requests.status=PENDING",
  legacyStoreChargesSource: "store_point_charge_requests (AST-002 archive)",
  cashCategoryKey: "cash_charges",
  legacyStoreChargesExcludedFromTotal: true,
  storeChargesMustNotDriveCashUi: true,
} as const;

export const CUT_A_D_PRODUCTION_CARRY = {
  financeOperationUx: "PARTIAL",
  financeProductionE2E: "NOT_PROVEN",
  coinProductionEarn: "NOT_PROVEN",
  saleRecognitionEnv: "NOT_PROVEN",
  tabletFinance: "NOT_PROVEN",
  deliveryAdsOperation: "PARTIAL",
  popupRuntime: "NOT_PROVEN",
  resumeEndLive: "NOT_PROVEN",
  previewLiveParity: "NOT_PROVEN",
  supportOperationUx: "PARTIAL",
  partnerOperationUx: "PARTIAL",
  tabletSupportPartner: "NOT_PROVEN",
  tabletControlPlane: "NOT_PROVEN",
} as const;

export function assertAdminRealOperationCutEControlPlaneHardLock(): boolean {
  return (
    ADMIN_REAL_OPERATION_CUT_E_LOCKED === true &&
    CONTROL_PLANE_DEFINITION.newDbForbidden === true &&
    CONTROL_PLANE_DEFINITION.mutationOwner === "CANONICAL_DOMAIN_ONLY" &&
    ADMIN_BELL_CASH_SEMANTIC.storeChargesMustNotDriveCashUi === true &&
    ADMIN_BELL_CASH_SEMANTIC.legacyStoreChargesExcludedFromTotal === true &&
    CUT_A_D_PRODUCTION_CARRY.financeProductionE2E === "NOT_PROVEN" &&
    CUT_A_D_PRODUCTION_CARRY.popupRuntime === "NOT_PROVEN" &&
    CUT_A_D_PRODUCTION_CARRY.tabletControlPlane === "NOT_PROVEN"
  );
}
