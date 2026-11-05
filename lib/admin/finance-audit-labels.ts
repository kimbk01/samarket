/**
 * 감사 로그 — 금융 작업·대상 이름 (관리자 화면). 표에 없으면 null → 화면은 원문 코드를 그대로 쓴다.
 * 이름은 금융 SSOT(`lib/finance/finance-display-labels`)와 같은 낱말을 쓴다: 충전 완료·반려·출금 완료·회수.
 */
type Pair = { ko: string; en: string };

const TARGET_LABELS: Record<string, Pair> = {
  point_charge_request: { ko: "Point 충전 신청", en: "Point top-up request" },
  user_points: { ko: "회원 Point", en: "Member Point" },
  business_cash_charge_request: { ko: "Cash 충전 신청", en: "Cash top-up request" },
  business_cash_account: { ko: "매장 Cash", en: "Store Cash" },
  store_coin_account: { ko: "매장 Coin", en: "Store Coin" },
  coin_withdrawal_request: { ko: "Coin 출금 신청", en: "Coin withdrawal request" },
  apple_iap_transaction: { ko: "Apple 결제", en: "Apple payment" },
  store_order: { ko: "주문", en: "Order" },
};

const ACTION_LABELS: Record<string, Pair> = {
  "business_cash.admin_adjust": { ko: "매장 Cash 잔액 조정", en: "Store Cash adjustment" },
  "store_coin.admin_adjust": { ko: "매장 Coin 잔액 조정", en: "Store Coin adjustment" },
  "business_cash_charge.approve": { ko: "Cash 입금 확인 · 충전 완료", en: "Cash deposit confirmed · topped up" },
  "business_cash_charge.reject": { ko: "Cash 충전 반려", en: "Cash top-up rejected" },
  "coin_withdrawal.mark_paid": { ko: "Coin 출금 완료 처리", en: "Coin withdrawal marked paid" },
  "coin_withdrawal.reject": { ko: "Coin 출금 반려", en: "Coin withdrawal rejected" },
  "apple_iap.credit": { ko: "Apple 결제 지급 재처리", en: "Apple payment credit retry" },
  "apple_iap.refund_recover": { ko: "Apple 환불 회수", en: "Apple refund recovered" },
  "apple_iap.refund_waive": { ko: "Apple 환불 회수 안 함", en: "Apple refund not recovered" },
  "apple_iap.refund_recredit": { ko: "Apple 환불 취소 · 회수분 되돌림", en: "Apple refund reversal re-credit" },
};

/** 같은 낱말 작업(approve 등)은 대상 종류와 묶어 읽는다 */
const TARGET_ACTION_LABELS: Record<string, Record<string, Pair>> = {
  point_charge_request: {
    approve: { ko: "Point 입금 확인 · 충전 완료", en: "Point deposit confirmed · topped up" },
    admin_memo_update: { ko: "Point 충전 내부 메모 수정", en: "Point top-up internal memo edited" },
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
