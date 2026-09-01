/**
 * Coin reversal writers — CUT B integrity (refund/cancel only).
 * DO NOT write Business Credit, Gift Store Cash, or delivery_ad_accounts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const REVERSE_COIN_CREDITS_FOR_ORDER_RPC = "reverse_coin_credits_for_order" as const;

export type ReverseCoinCreditsResult =
  | {
      ok: true;
      idempotent?: boolean;
      skipped?: boolean;
      reversedAmount?: number;
      reversalLedgerId?: string;
      balanceBefore?: number;
      balanceAfter?: number;
      originalLedgerIds?: string[];
    }
  | { ok: false; error: string };

function isMissingRpc(message: string): boolean {
  return /does not exist|Could not find the function/i.test(message);
}

export function coinReversalIdempotencyKeyForOrder(orderId: string): string {
  return `coin_reversal:order:${orderId.trim()}`;
}

export async function reverseCoinCreditsForOrder(
  sb: SupabaseClient,
  input: {
    orderId: string;
    idempotencyKey?: string;
    reason?: string;
  }
): Promise<ReverseCoinCreditsResult> {
  const orderId = input.orderId.trim();
  if (!orderId) return { ok: false, error: "invalid_input" };

  const idempotencyKey = (input.idempotencyKey ?? coinReversalIdempotencyKeyForOrder(orderId)).trim();
  const reason = (input.reason ?? "order_refund").trim();

  const { data, error } = await sb.rpc(REVERSE_COIN_CREDITS_FOR_ORDER_RPC, {
    p_order_id: orderId,
    p_idempotency_key: idempotencyKey,
    p_reason: reason,
  });

  if (error) {
    if (isMissingRpc(error.message)) return { ok: false, error: "rpc_missing" };
    return { ok: false, error: error.message };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === false) return { ok: false, error: String(row.error ?? "reversal_failed") };

  const originalIds = row.original_ledger_ids;
  const parsedOriginalIds = Array.isArray(originalIds)
    ? originalIds.map((id) => String(id))
    : undefined;

  return {
    ok: true,
    idempotent: row.idempotent === true,
    skipped: row.skipped === true,
    reversedAmount:
      typeof row.reversed_amount === "number"
        ? row.reversed_amount
        : Number(row.reversed_amount) || 0,
    reversalLedgerId:
      typeof row.reversal_ledger_id === "string" ? row.reversal_ledger_id : undefined,
    balanceBefore:
      typeof row.balance_before === "number"
        ? row.balance_before
        : Number(row.balance_before) || undefined,
    balanceAfter:
      typeof row.balance_after === "number"
        ? row.balance_after
        : Number(row.balance_after) || undefined,
    originalLedgerIds: parsedOriginalIds,
  };
}
