/**
 * 거래 상세 「이전 잔액」 = 이후 잔액 − 이 거래의 증감 (Owner 권장안 2026-11-04 · 순수 함수).
 * Cash = 센타보(이후 잔액 balanceAfterMinor · 금액 amountMinor 부호 없음) · Coin/Point = 정수(balanceAfter · amount 부호 없음).
 * 방향(direction)이 증감 부호. 이후 잔액이 없으면 null(지어내지 않음).
 */
import type { FinanceUnifiedTx } from "@/lib/finance/unified-transaction/types";

export function financeTxBalanceBefore(
  tx: Pick<FinanceUnifiedTx, "wallet" | "direction" | "amount" | "amountMinor" | "balanceAfter" | "balanceAfterMinor">
): number | null {
  const sign = tx.direction === "credit" ? 1 : -1;
  if (tx.wallet === "CASH") {
    if (tx.balanceAfterMinor == null || tx.amountMinor == null) return null;
    return Math.trunc(tx.balanceAfterMinor) - sign * Math.abs(Math.trunc(tx.amountMinor));
  }
  if (tx.balanceAfter == null || tx.amount == null) return null;
  return Math.trunc(tx.balanceAfter) - sign * Math.abs(Math.trunc(tx.amount));
}
