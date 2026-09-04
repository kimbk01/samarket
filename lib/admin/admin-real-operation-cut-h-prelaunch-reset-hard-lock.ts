/**
 * DIBAY Admin Real Operation — CUT H PRE-LAUNCH RESET SAFETY
 *
 * Gate: `npm run verify:admin-real-operation-cut-h-prelaunch-reset-hard-lock`
 * Doc: `docs/dibay-admin-real-operation-cut-h-prelaunch-reset-hard-lock.md`
 */

export const ADMIN_REAL_OPERATION_CUT_H_LOCK_ID =
  "dibay-admin-real-operation-cut-h-prelaunch-reset-hard-lock" as const;

export const ADMIN_REAL_OPERATION_CUT_H_LOCKED = true as const;

export const PRELAUNCH_RESET_HARD_LOCK = {
  protectBeforeDelete: true,
  sharedPlannerRequired: true,
  productionExecuteForbidden: true,
  failClosedDefault: true,
  truncateCascadeForbidden: true,
  wipeAllAppDataSqlForbiddenInUi: true,
  authUserDeleteDefaultForbidden: true,
  financeAmbiguousBlock: true,
  stalePlanBlock: true,
  typedConfirmationPlanBound: true,
  partialFailureNotSuccess: true,
  auditSurvivesReset: true,
  newDbForbiddenUnlessRequired: true,
} as const;

export const CUT_H_PRODUCTION_CARRY = {
  financeProductionE2E: "NOT_PROVEN",
  coinSaleRecognition: "NOT_PROVEN",
  adsLive: "PARTIAL",
  resumeEndLive: "NOT_PROVEN",
  popupProduction: "NOT_PROVEN",
  supportLive: "NOT_PROVEN",
  partnerLive: "NOT_PROVEN",
  placementActiveEligibility: "DEFERRED_TO_CUT_I",
  creativeLiveParity: "PARTIAL",
  productionTablet: "NOT_PROVEN",
} as const;

export function assertAdminRealOperationCutHPrelaunchResetHardLock(): boolean {
  return (
    ADMIN_REAL_OPERATION_CUT_H_LOCKED === true &&
    PRELAUNCH_RESET_HARD_LOCK.protectBeforeDelete === true &&
    PRELAUNCH_RESET_HARD_LOCK.sharedPlannerRequired === true &&
    PRELAUNCH_RESET_HARD_LOCK.productionExecuteForbidden === true &&
    PRELAUNCH_RESET_HARD_LOCK.financeAmbiguousBlock === true &&
    PRELAUNCH_RESET_HARD_LOCK.authUserDeleteDefaultForbidden === true &&
    CUT_H_PRODUCTION_CARRY.placementActiveEligibility === "DEFERRED_TO_CUT_I"
  );
}
