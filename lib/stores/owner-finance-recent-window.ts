/**
 * Owner Store Finance read helpers (M-19 / F-15).
 *
 * - Open sale-fee obligation totals come from SQL `store_cash_position` over ALL open rows (FIN-11; not the 20-row list).
 * - Coin 기간 합계는 lib/finance/wallet-period-history (고른 기간 전체 · 「최근 N건 기준」 폐지 2026-11-03).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** FIN-11 — single SQL source shared with the settlement / admin screens. */
export const STORE_CASH_POSITION_RPC = "store_cash_position" as const;

export type OpenSaleFeeAggregate =
  | { ok: true; outstandingMinor: number; openCount: number | null }
  | { ok: false; error: string };

/**
 * Open sale-fee totals for one store from `public.store_cash_position(p_store_id)` (FIN-11):
 * outstandingMinor = SUM(fee_outstanding_minor), openCount = COUNT(*) WHERE status='open' — both computed in SQL.
 * `openCount` is null only when the DB predates the `open_count` key (20270603110300); callers fall back to the list.
 */
export async function loadOpenSaleFeeTotalsFromCashPosition(
  sb: SupabaseClient,
  storeId: string
): Promise<OpenSaleFeeAggregate> {
  const sid = storeId.trim();
  if (!sid) return { ok: false, error: "missing_store_id" };
  const { data, error } = await sb.rpc(STORE_CASH_POSITION_RPC, { p_store_id: sid });
  if (error) return { ok: false, error: error.message };
  const pos = (data ?? null) as Record<string, unknown> | null;
  if (!pos || pos.outstanding_minor == null) return { ok: false, error: "store_cash_position_empty" };
  return {
    ok: true,
    outstandingMinor: Math.trunc(Number(pos.outstanding_minor) || 0),
    openCount: pos.open_count == null ? null : Math.max(0, Math.trunc(Number(pos.open_count) || 0)),
  };
}

/**
 * P0-2 — Coin 원장 한 행의 집계 의미 (사장님 최근 합계 · 관리자 매장 명세 · 일별 명세 공용 단일 규칙).
 * 모든 값은 「양수 = 그 항목이 늘어남」이며, 아래 항등식이 항상 성립한다:
 *   closing = opening + earned − converted − withdrawn − reversed + adjusted + other
 * - withdrawn 은 순출금: WITHDRAWAL_REQUEST(−) 는 +, WITHDRAWAL_RELEASE/REJECT(+, 반려 환원) 는 −, COMPLETE(0) 는 0.
 *   반려된 신청은 0 으로 상쇄되어 출금으로 세지 않는다.
 * - reversed: REVERSAL(환불 역분개, 음수) → +. 잔액을 음수로 만들 수 있다(환불 빚).
 * - other: 위에 없는 종류 (0 이 아니면 호출처가 표시해야 한다 — 숨기지 않는다).
 */
export type CoinLedgerContribution = {
  earned: number;
  converted: number;
  withdrawn: number;
  reversed: number;
  adjusted: number;
  other: number;
};

export function classifyCoinLedgerAmount(entryKind: string, amount: number): CoinLedgerContribution {
  const amt = Math.trunc(Number(amount) || 0);
  const out: CoinLedgerContribution = { earned: 0, converted: 0, withdrawn: 0, reversed: 0, adjusted: 0, other: 0 };
  switch (entryKind) {
    case "SALE_EARN":
    case "GIFT_REDEMPTION_EARN":
    case "ECONOMIC_INFLOW":
      out.earned = amt;
      break;
    case "CONVERT_TO_BUSINESS_CASH":
      out.converted = -amt;
      break;
    case "WITHDRAWAL_REQUEST":
    case "WITHDRAWAL_RELEASE":
    case "WITHDRAWAL_REJECT":
    case "WITHDRAWAL_COMPLETE":
      out.withdrawn = -amt;
      break;
    case "REVERSAL":
      out.reversed = -amt;
      break;
    case "ADMIN_ADJUST":
      out.adjusted = amt;
      break;
    default:
      out.other = amt;
  }
  return out;
}

export function sumCoinLedgerContributions(
  rows: ReadonlyArray<{ entryKind: string; amount: number }>
): CoinLedgerContribution {
  const total: CoinLedgerContribution = { earned: 0, converted: 0, withdrawn: 0, reversed: 0, adjusted: 0, other: 0 };
  for (const r of rows) {
    const c = classifyCoinLedgerAmount(r.entryKind, r.amount);
    total.earned += c.earned;
    total.converted += c.converted;
    total.withdrawn += c.withdrawn;
    total.reversed += c.reversed;
    total.adjusted += c.adjusted;
    total.other += c.other;
  }
  return total;
}
