/**
 * Order completed — Coin recognition.
 *
 * Commission is NOT handled here: the DB trigger `trg_store_orders_commission_lifecycle`
 * charges it inside the status UPDATE when the order first reaches a cooking-or-later status.
 *
 * Coin: mint ONLY the platform-funded coupon amount (Owner D-2 option A, stage 2-B FIN-03).
 * - `payment_amount` is paid by the buyer directly to the store (COD / store GCash / bank transfer).
 * - Gift certificate money is owed on the gift rail (`gift_certificate_revenue_ledger` merchant net →
 *   admin gift payout `gift_certificate_admin_store_payout`), never as Coin — assets are not merged.
 * The DB mint RPC refuses any amount above the order's `platform_funded_amount`
 * (`coin_mint_exceeds_platform_held`). Gated by DIBAY_CURRENCY_SALE_RECOGNITION_LIVE.
 *
 * Contract: lib/stores/commission/store-commission-contract.ts
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isCurrencySaleRecognitionLive } from "@/lib/currency/currency-cutover-flags";
import { saleCoinIdempotencyKeyForOrder } from "@/lib/stores/confirmed-sale-revenue";

export const CREDIT_COIN_FROM_CONFIRMED_SALE_RPC = "credit_coin_from_confirmed_sale" as const;

export type RecognizeOrderCurrencyResult =
  | {
      ok: true;
      skipped?: boolean;
      /** Platform-funded coupon amount minted as Coin (PHP). */
      platformHeldPhp?: number;
      coinCredited?: boolean;
      coinIdempotent?: boolean;
    }
  | { ok: false; error: string };

function money(n: unknown): number {
  const v = Math.trunc(Number(n) || 0);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

/**
 * Sale amount the platform owes the store AS COIN = platform-funded coupon only (D-2 option A).
 * Gift certificate redemption is paid on the gift rail, so `gift_redemption_amount` is ignored here.
 */
export function platformHeldSaleAmountPhp(order: {
  gift_redemption_amount?: unknown;
  platform_funded_amount?: unknown;
}): number {
  return money(order.platform_funded_amount);
}

export async function recognizeOrderCurrencyOnCompleted(
  sb: SupabaseClient,
  orderId: string
): Promise<RecognizeOrderCurrencyResult> {
  const oid = orderId.trim();
  if (!oid) return { ok: false, error: "missing_order_id" };
  if (!isCurrencySaleRecognitionLive()) return { ok: true, skipped: true };

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, store_id, order_status, platform_funded_amount")
    .eq("id", oid)
    .maybeSingle();

  if (oErr || !order) return { ok: false, error: "order_not_found" };
  if ((order.order_status as string) !== "completed") return { ok: true, skipped: true };

  const sid = String(order.store_id ?? "").trim();
  if (!sid) return { ok: false, error: "missing_store_id" };

  const platformHeldPhp = platformHeldSaleAmountPhp(order);
  if (platformHeldPhp <= 0) return { ok: true, skipped: true, platformHeldPhp: 0 };

  const { data: settlement } = await sb.from("store_settlements").select("id").eq("order_id", oid).maybeSingle();

  const { data, error } = await sb.rpc(CREDIT_COIN_FROM_CONFIRMED_SALE_RPC, {
    p_store_id: sid,
    p_order_id: oid,
    p_settlement_id: settlement?.id ? String(settlement.id) : null,
    p_amount: platformHeldPhp,
    p_idempotency_key: saleCoinIdempotencyKeyForOrder(oid),
  });
  if (error) {
    if (/does not exist|Could not find the function/i.test(error.message)) {
      return { ok: false, error: "rpc_missing" };
    }
    console.error("[recognizeOrderCurrencyOnCompleted] coin", error.message);
    return { ok: false, error: error.message };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === false) return { ok: false, error: String(row.error ?? "coin_credit_failed") };

  return { ok: true, platformHeldPhp, coinCredited: true, coinIdempotent: row.idempotent === true };
}
