/**
 * Finance operator ops classification — presentation only.
 * Preserves Point/Coin/Cash separation and mutation owners.
 */

export type FinanceOperatorOpKind =
  | "point_charge"
  | "cash_topup"
  | "coin_earn_history"
  | "coin_to_cash_history"
  | "coin_withdrawal"
  | "settlement"
  | "fee_obligation"
  | "refund";

export function financeOpIsAdminApproval(kind: FinanceOperatorOpKind): boolean {
  return (
    kind === "point_charge" ||
    kind === "cash_topup" ||
    kind === "coin_withdrawal" ||
    kind === "settlement" ||
    kind === "refund"
  );
}

export function financeOpSectionTitle(kind: FinanceOperatorOpKind, ko: boolean): string {
  switch (kind) {
    case "point_charge":
      return ko ? "Point 충전 요청 (승인 대상)" : "Point top-up (approval)";
    case "cash_topup":
      return ko ? "Cash 충전 요청 (승인 대상)" : "Cash top-up (approval)";
    case "coin_earn_history":
      return ko ? "판매 Coin 적립 (조회)" : "Sale Coin earn (history)";
    case "coin_to_cash_history":
      return ko ? "Coin → Cash 전환 (조회 · 승인 아님)" : "Coin → Cash (history · not approval)";
    case "coin_withdrawal":
      return ko ? "Coin 출금/환전 (승인 대상)" : "Coin withdrawal (approval)";
    case "settlement":
      return ko ? "정산 (일자·매장 통제)" : "Settlement (daily / store)";
    case "fee_obligation":
      return ko ? "미납 판매수수료" : "Unpaid sale fees";
    case "refund":
      return ko ? "환불 / 조정" : "Refund / adjustment";
  }
}
