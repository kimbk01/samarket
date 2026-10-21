/**
 * Owner Platform Popup — NEW SALES DISABLED (Owner Policy LOCK).
 * Historical requests/detail/read paths KEEP. Do not delete data.
 * Admin Direct Popup is unaffected.
 */

/**
 * When false, Owner cannot create/submit new platform popup applications.
 *
 * RE-ENABLE PRECONDITION (ADS-13, required — do not flip to true without it):
 * the DB function `owner_submit_platform_popup_request` (migration
 * 20270604150100_platform_popup_owner_submit_atomic.sql) must be applied to production, and the submit
 * writer (`submitPlatformPopupOwnerRequest`) must call only that RPC (single transaction: key bind + Cash
 * debit + submitted/funded). Locked by lib/platform-popup/__tests__/ads13-owner-submit-atomic.test.ts.
 */
export const OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED = false;

export const OWNER_PLATFORM_POPUP_NEW_SALES_DISABLED_ERROR =
  "owner_platform_popup_new_sales_disabled" as const;

export function assertOwnerPlatformPopupNewSalesAllowed():
  | { ok: true }
  | { ok: false; error: typeof OWNER_PLATFORM_POPUP_NEW_SALES_DISABLED_ERROR } {
  if (OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED) return { ok: true };
  return { ok: false, error: OWNER_PLATFORM_POPUP_NEW_SALES_DISABLED_ERROR };
}
