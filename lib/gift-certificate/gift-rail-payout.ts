/**
 * Gift rail payout — Owner D-2 option A (stage 2-B FIN-03).
 * Gift certificate merchant net (`gift_certificate_revenue_ledger` REVENUE_AVAILABLE) is paid to the store
 * by an admin payout on the gift rail. It is never minted as Coin (Coin = platform-funded coupon only).
 * Money authority: SQL `gift_certificate_admin_store_payout` (admin re-check, amount <= available, unique
 * payout reference, idempotency key, PAYOUT_PAID ledger + audit) — this module only calls it / reads.
 * Migration: supabase/migrations/20270603120000_stage2b_fin03_gift_rail_payout.sql
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const GIFT_RAIL_PAYOUT_RPC = "gift_certificate_admin_store_payout" as const;
export const GIFT_RAIL_PAYOUT_SUMMARY_RPC = "gift_certificate_store_payout_summary" as const;
export const GIFT_RAIL_PAYOUTS_TABLE = "gift_certificate_store_payouts" as const;
/** gift_certificate_revenue_ledger.entry_type written per payout (amount = −payout). */
export const GIFT_RAIL_PAYOUT_LEDGER_ENTRY = "PAYOUT_PAID" as const;

export const GIFT_RAIL_PAYOUT_METHODS = ["bank_transfer", "gcash", "maya", "other"] as const;
export type GiftRailPayoutMethod = (typeof GIFT_RAIL_PAYOUT_METHODS)[number];

export function isGiftRailPayoutMethod(v: unknown): v is GiftRailPayoutMethod {
  return typeof v === "string" && (GIFT_RAIL_PAYOUT_METHODS as readonly string[]).includes(v);
}

export type GiftRailPayoutSummary = {
  storeId: string;
  availablePhp: number;
  paidOutPhp: number;
  payoutCount: number;
  lastPaidAt: string | null;
};

const ERROR_STATUS: Record<string, number> = {
  forbidden: 403,
  not_admin: 403,
  invalid_args: 400,
  payout_method_required: 400,
  payout_reference_required: 400,
  store_not_found: 404,
  idempotency_key_conflict: 409,
  payout_reference_duplicate: 409,
  payout_exceeds_available: 409,
  rpc_missing: 503,
};

export function giftRailPayoutErrorStatus(code: string): number {
  return ERROR_STATUS[code] ?? 500;
}

function int(v: unknown): number {
  const n = Math.trunc(Number(v) || 0);
  return Number.isFinite(n) ? n : 0;
}

function isMissingRpc(err: { code?: string | null; message?: string | null }): boolean {
  const msg = String(err.message ?? "");
  return err.code === "PGRST202" || err.code === "42883" || /does not exist|could not find the function/i.test(msg);
}

export function parseGiftRailPayoutSummary(storeId: string, raw: unknown): GiftRailPayoutSummary {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    storeId,
    availablePhp: Math.max(0, int(r.available)),
    paidOutPhp: Math.max(0, int(r.paid_out)),
    payoutCount: Math.max(0, int(r.payout_count)),
    lastPaidAt: r.last_paid_at == null ? null : String(r.last_paid_at),
  };
}

/** Same SQL reader for Admin and Owner. `null` when the reader is not deployed yet. */
export async function loadGiftRailPayoutSummary(
  sb: SupabaseClient,
  storeId: string
): Promise<GiftRailPayoutSummary | null> {
  const { data, error } = await sb.rpc(GIFT_RAIL_PAYOUT_SUMMARY_RPC, { p_store_id: storeId });
  if (error) {
    if (!isMissingRpc(error)) console.error("[loadGiftRailPayoutSummary]", error.message);
    return null;
  }
  return parseGiftRailPayoutSummary(storeId, data);
}

export type GiftRailPayoutInput = {
  adminUserId: string;
  storeId: string;
  amountPhp: number;
  payoutMethod: string;
  payoutReference: string;
  payoutNote: string | null;
  idempotencyKey: string;
};

export type GiftRailPayoutResult =
  | {
      ok: true;
      idempotent: boolean;
      payoutId: string;
      amountPhp: number;
      availableBeforePhp: number;
      availableAfterPhp: number;
    }
  | { ok: false; error: string; status: number; availablePhp?: number };

export async function payGiftRailToStore(sb: SupabaseClient, input: GiftRailPayoutInput): Promise<GiftRailPayoutResult> {
  const { data, error } = await sb.rpc(GIFT_RAIL_PAYOUT_RPC, {
    p_admin_user_id: input.adminUserId,
    p_store_id: input.storeId,
    p_amount: Math.trunc(input.amountPhp),
    p_payout_method: input.payoutMethod,
    p_payout_reference: input.payoutReference,
    p_payout_note: input.payoutNote,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) {
    if (isMissingRpc(error)) return { ok: false, error: "rpc_missing", status: 503 };
    console.error("[payGiftRailToStore]", error.message);
    return { ok: false, error: "payout_failed", status: 500 };
  }
  const r = (data ?? {}) as Record<string, unknown>;
  if (r.ok !== true) {
    const code = String(r.error ?? "payout_failed");
    return {
      ok: false,
      error: code,
      status: giftRailPayoutErrorStatus(code),
      ...(r.available != null ? { availablePhp: int(r.available) } : {}),
    };
  }
  return {
    ok: true,
    idempotent: r.idempotent === true,
    payoutId: String(r.payout_id ?? ""),
    amountPhp: int(r.amount),
    availableBeforePhp: int(r.available_before),
    availableAfterPhp: int(r.available_after),
  };
}

/** Client-side pre-check only (the RPC re-checks under the store lock). */
export function validateGiftRailPayoutForm(input: {
  amountPhp: number;
  availablePhp: number;
  payoutMethod: string;
  payoutReference: string;
}): { ok: true } | { ok: false; error: string } {
  const amount = Math.trunc(Number(input.amountPhp) || 0);
  if (amount <= 0) return { ok: false, error: "invalid_args" };
  if (amount > Math.max(0, Math.trunc(input.availablePhp))) return { ok: false, error: "payout_exceeds_available" };
  if (!isGiftRailPayoutMethod(input.payoutMethod)) return { ok: false, error: "payout_method_required" };
  if (!input.payoutReference.trim()) return { ok: false, error: "payout_reference_required" };
  return { ok: true };
}
