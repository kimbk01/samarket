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
 *
 * 광고 감사 PP-04 (2026-11-26): 다시 켜기 전 선행 과제 — `platform_popup_ad_packages` 가격·기간을 고치는 어드민 화면·API 가
 * 저장소에 없다(마이그레이션 20271103220000 주석 「어드민 상업 설정에서 다시 켤 수 있다」는 사실과 다름). 켜기 전에 만들 것.
 * 판매 꺼짐 동안: 초안 수정·소재 업로드·제출 모두 거부, 어드민 「수정 요청」 거부(반려 = 환불만).
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
