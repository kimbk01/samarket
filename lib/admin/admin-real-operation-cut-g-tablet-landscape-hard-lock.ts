/**
 * DIBAY Admin Real Operation — CUT G TABLET LANDSCAPE RUNTIME CLOSE
 *
 * Runtime geometry evidence is authority — CSS class presence is NOT PASS.
 * Gate companion: docs/perf/admin-cut-g-tablet-landscape-runtime/cut-g-report.json
 * Probe: `node scripts/qa/admin-cut-g-tablet-landscape-runtime.mjs`
 */

export const ADMIN_REAL_OPERATION_CUT_G_LOCK_ID =
  "dibay-admin-real-operation-cut-g-tablet-landscape-hard-lock" as const;

export const ADMIN_REAL_OPERATION_CUT_G_LOCKED = true as const;

export const TABLET_LANDSCAPE_VIEWPORT_AUTHORITY = {
  token: "--sam-bp-lg-min",
  source: "app/design-tokens.css",
  width: 1024,
  height: 768,
  label: "lg-min landscape",
  codeReadyIsNotPass: true,
  productionPassForbiddenWithoutProductionRuntime: true,
} as const;

export const CUT_G_CARRY = {
  financeProductionE2E: "NOT_PROVEN",
  coinSaleRecognition: "NOT_PROVEN",
  adsMutationLive: "PARTIAL",
  resumeEndLive: "NOT_PROVEN",
  popupProduction: "NOT_PROVEN",
  supportMutationLive: "NOT_PROVEN",
  partnerLive: "NOT_PROVEN",
  previewLiveCreativeParity: "PARTIAL",
  /** CUT F P1 — Placement Map ACTIVE/eligibility live data must be proven in CUT I. */
  cutFPlacementMapActiveEligibility: "DEFERRED_TO_CUT_I",
} as const;

export function assertAdminRealOperationCutGTabletLandscapeHardLock(): boolean {
  return (
    ADMIN_REAL_OPERATION_CUT_G_LOCKED === true &&
    TABLET_LANDSCAPE_VIEWPORT_AUTHORITY.codeReadyIsNotPass === true &&
    TABLET_LANDSCAPE_VIEWPORT_AUTHORITY.width === 1024 &&
    CUT_G_CARRY.cutFPlacementMapActiveEligibility === "DEFERRED_TO_CUT_I" &&
    CUT_G_CARRY.financeProductionE2E === "NOT_PROVEN"
  );
}
