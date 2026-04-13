/** point_ledger — `/api/me/points` normalizeLedgerRow 와 정합 */
export const POINT_LEDGER_ROW_SELECT =
  "id, user_id, entry_type, amount, balance_after, related_type, related_id, description, created_at, actor_type, earned_at, expires_at, expired_amount";

/** point_charge_requests — normalizeChargeRequest 와 정합 */
export const POINT_CHARGE_REQUEST_ROW_SELECT =
  "id, user_id, plan_id, plan_name, payment_method, payment_amount, point_amount, request_status, depositor_name, receipt_image_url, requested_at, updated_at, admin_memo, user_memo";
