/**
 * Finance operator ops classification — presentation only.
 * Preserves Point/Coin/Cash separation and mutation owners.
 */

import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 언어 SSOT B4 — 불리언 언어 값으로 카탈로그 문구를 고른다(원래 `ko ? "…" : "…"` 와 같은 결과). */
function tx(ko: unknown, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

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
      return tx(ko, "admin_domain_control_point_top_up_approval");
    case "cash_topup":
      return tx(ko, "admin_domain_control_cash_top_up_approval");
    case "coin_earn_history":
      return tx(ko, "admin_domain_control_sale_coin_earn_history");
    case "coin_to_cash_history":
      return tx(ko, "admin_domain_control_coin_cash_history_not_approval");
    case "coin_withdrawal":
      return tx(ko, "admin_domain_control_coin_withdrawal_approval");
    case "settlement":
      return tx(ko, "admin_domain_control_settlement_daily_store");
    case "fee_obligation":
      return tx(ko, "admin_domain_control_unpaid_sale_fees");
    case "refund":
      return tx(ko, "admin_domain_control_refund_adjustment");
  }
}
