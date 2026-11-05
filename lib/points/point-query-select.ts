/** point_ledger — `/api/me/points` normalizeLedgerRow 와 정합 */
export const POINT_LEDGER_ROW_SELECT =
  "id, user_id, entry_type, amount, balance_after, related_type, related_id, description, created_at, actor_type, earned_at, expires_at, expired_amount";
/** Financial history list — same columns; kept as alias for call sites. */

/** point_charge_requests — normalizeChargeRequest 와 정합 */
export const POINT_CHARGE_REQUEST_ROW_SELECT =
  "id, user_id, plan_id, plan_name, payment_method, payment_amount, point_amount, applied_rate, rate_version, request_status, depositor_name, receipt_image_url, requested_at, updated_at, admin_memo, user_memo, approved_at, approved_by, processed_at, processed_by, reject_reason";

/** 관리자 충전 화면 — 확인 기록(verification_note · Apple 결제는 `apple:<거래번호>`) 포함. 회원 응답에는 쓰지 않는다. */
export const POINT_CHARGE_REQUEST_ADMIN_ROW_SELECT = `${POINT_CHARGE_REQUEST_ROW_SELECT}, verification_note`;
