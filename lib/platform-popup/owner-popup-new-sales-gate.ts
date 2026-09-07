/**
 * Owner Platform Popup — NEW SALES DISABLED (Owner Policy LOCK).
 * Historical requests/detail/read paths KEEP. Do not delete data.
 * Admin Direct Popup is unaffected.
 */

/** When false, Owner cannot create/submit new platform popup applications. */
export const OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED = false;

export const OWNER_PLATFORM_POPUP_NEW_SALES_DISABLED_ERROR =
  "owner_platform_popup_new_sales_disabled" as const;

export function assertOwnerPlatformPopupNewSalesAllowed():
  | { ok: true }
  | { ok: false; error: typeof OWNER_PLATFORM_POPUP_NEW_SALES_DISABLED_ERROR } {
  if (OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED) return { ok: true };
  return { ok: false, error: OWNER_PLATFORM_POPUP_NEW_SALES_DISABLED_ERROR };
}
