/**
 * Coin withdrawal rail — canonical COIN authority.
 * Gift external cash-out bridges via source_kind=gift_cash_out_bridge.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const COIN_WITHDRAWAL_REQUESTS_TABLE = "coin_withdrawal_requests" as const;
export const COIN_WITHDRAWAL_REQUEST_RPC = "coin_withdrawal_request" as const;
export const COIN_WITHDRAWAL_REJECT_RPC = "coin_withdrawal_reject" as const;
export const COIN_WITHDRAWAL_MARK_PAID_RPC = "coin_withdrawal_mark_paid" as const;

export type CoinWithdrawalDestination =
  | { destinationType: "gcash"; accountNumber: string; accountName: string }
  | { destinationType: "bank"; bankName: string; accountNumber: string; accountName: string };

export async function requestCoinWithdrawal(
  sb: SupabaseClient,
  input: {
    ownerUserId: string;
    storeId: string;
    amount: number;
    destination: CoinWithdrawalDestination;
    idempotencyKey: string;
    sourceKind?: "coin" | "gift_cash_out_bridge";
  }
): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  const amount = Math.trunc(Number(input.amount) || 0);
  if (amount <= 0) return { ok: false, error: "invalid_amount" };

  const dest = input.destination;
  const { data, error } = await sb.rpc(COIN_WITHDRAWAL_REQUEST_RPC, {
    p_owner_user_id: input.ownerUserId,
    p_store_id: input.storeId,
    p_amount: amount,
    p_destination_type: dest.destinationType,
    p_account_number: dest.accountNumber,
    p_account_name: dest.accountName,
    p_bank_name: dest.destinationType === "bank" ? dest.bankName : null,
    p_idempotency_key: input.idempotencyKey,
    p_source_kind: input.sourceKind ?? "coin",
  });

  if (error) return { ok: false, error: error.message };
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === false) return { ok: false, error: String(row.error ?? "request_failed") };
  return { ok: true, requestId: String(row.request_id ?? "") };
}

export async function rejectCoinWithdrawal(
  sb: SupabaseClient,
  input: { adminUserId: string; requestId: string; reason?: string }
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await sb.rpc(COIN_WITHDRAWAL_REJECT_RPC, {
    p_admin_user_id: input.adminUserId,
    p_request_id: input.requestId,
    p_reason: input.reason ?? null,
  });
  if (error) return { ok: false, error: error.message };
  const row = (data ?? {}) as Record<string, unknown>;
  return row.ok === true ? { ok: true } : { ok: false, error: String(row.error ?? "reject_failed") };
}

export async function markCoinWithdrawalPaid(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    requestId: string;
    payoutMethod?: string;
    payoutReference?: string;
    payoutNote?: string;
  }
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await sb.rpc(COIN_WITHDRAWAL_MARK_PAID_RPC, {
    p_admin_user_id: input.adminUserId,
    p_request_id: input.requestId,
    p_payout_method: input.payoutMethod ?? null,
    p_payout_reference: input.payoutReference ?? null,
    p_payout_note: input.payoutNote ?? null,
  });
  if (error) return { ok: false, error: error.message };
  const row = (data ?? {}) as Record<string, unknown>;
  return row.ok === true ? { ok: true } : { ok: false, error: String(row.error ?? "mark_paid_failed") };
}
