
import { catalogPair } from "@/lib/i18n/catalog-pair";/**
 * 감사 로그 — 금융 작업·대상 이름 (관리자 화면). 표에 없으면 null → 화면은 원문 코드를 그대로 쓴다.
 * 이름은 금융 SSOT(`lib/finance/finance-display-labels`)와 같은 낱말을 쓴다: 충전 완료·반려·출금 완료·회수.
 */
type Pair = { ko: string; en: string };

const TARGET_LABELS: Record<string, Pair> = {
  point_charge_request: catalogPair("admin_point_top_up_request"),
  user_points: catalogPair("admin_member_point"),
  business_cash_charge_request: catalogPair("admin_cash_top_up_request"),
  business_cash_account: catalogPair("admin_store_cash"),
  store_coin_account: catalogPair("admin_store_coin"),
  coin_withdrawal_request: catalogPair("admin_coin_withdrawal_request"),
  apple_iap_transaction: catalogPair("admin_points_payment_apple_iap"),
  store_order: catalogPair("admin_r4b_pay_th_order"),
};

const ACTION_LABELS: Record<string, Pair> = {
  "business_cash.admin_adjust": catalogPair("admin_store_cash_adjustment"),
  "store_coin.admin_adjust": catalogPair("admin_store_coin_adjustment"),
  "business_cash_charge.approve": catalogPair("admin_cash_deposit_confirmed_topped_up"),
  "business_cash_charge.reject": catalogPair("admin_cash_top_up_rejected"),
  "coin_withdrawal.mark_paid": catalogPair("admin_coin_withdrawal_marked_paid"),
  "coin_withdrawal.reject": catalogPair("admin_coin_withdrawal_rejected"),
  "apple_iap.credit": catalogPair("admin_apple_payment_credit_retry"),
  "apple_iap.refund_recover": catalogPair("admin_apple_refund_recovered"),
  "apple_iap.refund_waive": catalogPair("admin_apple_refund_not_recovered"),
  "apple_iap.refund_recredit": catalogPair("admin_apple_refund_reversal_re_credit"),
};

/** 같은 낱말 작업(approve 등)은 대상 종류와 묶어 읽는다 */
const TARGET_ACTION_LABELS: Record<string, Record<string, Pair>> = {
  point_charge_request: {
    approve: catalogPair("admin_point_deposit_confirmed_topped_up"),
    admin_memo_update: catalogPair("admin_point_top_up_internal_memo_edited"),
  },
};

export function financeAuditTargetLabel(targetType: string | null | undefined, ko: boolean): string | null {
  const hit = TARGET_LABELS[String(targetType ?? "").trim()];
  return hit ? (ko ? hit.ko : hit.en) : null;
}

export function financeAuditActionLabel(
  action: string | null | undefined,
  targetType: string | null | undefined,
  ko: boolean
): string | null {
  const a = String(action ?? "").trim();
  const hit = TARGET_ACTION_LABELS[String(targetType ?? "").trim()]?.[a] ?? ACTION_LABELS[a];
  return hit ? (ko ? hit.ko : hit.en) : null;
}
