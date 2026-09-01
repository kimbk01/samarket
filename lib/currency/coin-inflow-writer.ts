/**
 * Coin inflow writers — canonical COIN authority only.
 * DO NOT write archived store-credit/store-cash schemas or delivery_ad_accounts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const CREDIT_COIN_FROM_SETTLEMENT_RPC = "credit_coin_from_settlement" as const;
export const CREDIT_COIN_FROM_GIFT_REVENUE_RPC = "credit_coin_from_gift_revenue" as const;

export type CreditCoinResult =
  | { ok: true; balanceAfter?: number; idempotent?: boolean }
  | { ok: false; error: string };

function isMissingRpc(message: string): boolean {
  return /does not exist|Could not find the function/i.test(message);
}

export async function creditCoinFromSettlement(
  sb: SupabaseClient,
  input: {
    storeId: string;
    settlementId: string;
    orderId: string;
    amountPhp: number;
    idempotencyKey: string;
  }
): Promise<CreditCoinResult> {
  const amount = Math.max(0, Math.trunc(input.amountPhp));
  if (!input.storeId || amount <= 0) return { ok: false, error: "invalid_input" };

  const { data, error } = await sb.rpc(CREDIT_COIN_FROM_SETTLEMENT_RPC, {
    p_store_id: input.storeId,
    p_settlement_id: input.settlementId,
    p_order_id: input.orderId,
    p_amount: amount,
    p_idempotency_key: input.idempotencyKey,
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
  };
}

export async function creditCoinFromGiftRevenue(
  sb: SupabaseClient,
  input: {
    storeId: string;
    redemptionId: string;
    amountPhp: number;
    idempotencyKey: string;
  }
): Promise<CreditCoinResult> {
  const amount = Math.max(0, Math.trunc(input.amountPhp));
  if (!input.storeId || !input.redemptionId || amount <= 0) {
    return { ok: false, error: "invalid_input" };
  }

  const { data, error } = await sb.rpc(CREDIT_COIN_FROM_GIFT_REVENUE_RPC, {
    p_store_id: input.storeId,
    p_redemption_id: input.redemptionId,
    p_amount: amount,
    p_idempotency_key: input.idempotencyKey,
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
  };
}
