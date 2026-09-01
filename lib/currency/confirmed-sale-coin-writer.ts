/**
 * Canonical Coin inflow — confirmed sale revenue via sale_coin:{orderId} only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { saleCoinIdempotencyKeyForOrder } from "@/lib/stores/confirmed-sale-revenue";

export const CREDIT_COIN_FROM_CONFIRMED_SALE_RPC = "credit_coin_from_confirmed_sale" as const;

export type CreditConfirmedSaleCoinResult =
  | { ok: true; idempotent?: boolean; balanceAfter?: number; ledgerId?: string }
  | { ok: false; error: string };

function isMissingRpc(message: string): boolean {
  return /does not exist|Could not find the function/i.test(message);
}

export async function creditConfirmedSaleCoin(
  sb: SupabaseClient,
  input: {
    storeId: string;
    orderId: string;
    settlementId?: string | null;
    amountPhp: number;
    idempotencyKey?: string;
  }
): Promise<CreditConfirmedSaleCoinResult> {
  const amount = Math.max(0, Math.trunc(input.amountPhp));
  const orderId = input.orderId.trim();
  const storeId = input.storeId.trim();
  if (!storeId || !orderId || amount <= 0) return { ok: false, error: "invalid_input" };

  const idempotencyKey = input.idempotencyKey?.trim() || saleCoinIdempotencyKeyForOrder(orderId);
  const settlementId = input.settlementId?.trim() || null;

  const { data, error } = await sb.rpc(CREDIT_COIN_FROM_CONFIRMED_SALE_RPC, {
    p_store_id: storeId,
    p_order_id: orderId,
    p_settlement_id: settlementId,
    p_amount: amount,
    p_idempotency_key: idempotencyKey,
  });

  if (error) {
    if (isMissingRpc(error.message)) return { ok: false, error: "rpc_missing" };
    return { ok: false, error: error.message };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === false) return { ok: false, error: String(row.error ?? "credit_failed") };

  return {
    ok: true,
    idempotent: row.idempotent === true,
    balanceAfter:
      typeof row.balance_after === "number"
        ? row.balance_after
        : Number(row.balance_after) || undefined,
    ledgerId: row.ledger_id ? String(row.ledger_id) : undefined,
  };
}
