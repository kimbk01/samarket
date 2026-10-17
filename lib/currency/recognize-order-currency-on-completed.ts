/**
 * Order completed — money recognition.
 *
 * 1. Commission: safety-net charge with the canonical key `sale_fee:order:{id}`.
 *    The real charge point is `preparing` (조리 시작); this only charges orders that reached
 *    `completed` without passing through it. Never double-charges (idempotent per order).
 * 2. Coin: mint ONLY the platform-held portion of the sale (gift certificate redemption +
 *    platform-funded coupon). `payment_amount` is paid by the buyer directly to the store
 *    (COD / store GCash / bank transfer) — minting Coin for it would pay the store twice.
 *    Gated by DIBAY_CURRENCY_SALE_RECOGNITION_LIVE until Production cutover.
 *
 * Contract: lib/stores/commission/store-commission-contract.ts
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isCurrencySaleRecognitionLive } from "@/lib/currency/currency-cutover-flags";
import { saleCoinIdempotencyKeyForOrder } from "@/lib/stores/confirmed-sale-revenue";
import { chargeStoreCommissionForOrder } from "@/lib/stores/commission/store-commission-writer";

export const CREDIT_COIN_FROM_CONFIRMED_SALE_RPC = "credit_coin_from_confirmed_sale" as const;

export type RecognizeOrderCurrencyResult =
  | {
      ok: true;
      skipped?: boolean;
      /** Platform-held sale amount minted as Coin (PHP). */
      platformHeldPhp?: number;
      coinCredited?: boolean;
      feeCharged?: boolean;
      coinIdempotent?: boolean;
      feeIdempotent?: boolean;
    }
  | { ok: false; error: string };

function money(n: unknown): number {
  const v = Math.trunc(Number(n) || 0);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

/** Sale amount the platform actually holds for the store (owed to the store as Coin). */
export function platformHeldSaleAmountPhp(order: {
  gift_redemption_amount?: unknown;
  platform_funded_amount?: unknown;
}): number {
  return money(order.gift_redemption_amount) + money(order.platform_funded_amount);
}

export async function recognizeOrderCurrencyOnCompleted(
  sb: SupabaseClient,
  orderId: string
): Promise<RecognizeOrderCurrencyResult> {
  const oid = orderId.trim();
  if (!oid) return { ok: false, error: "missing_order_id" };

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, store_id, order_status, gift_redemption_amount, platform_funded_amount")
    .eq("id", oid)
    .maybeSingle();

  if (oErr || !order) return { ok: false, error: "order_not_found" };
  if ((order.order_status as string) !== "completed") return { ok: true, skipped: true };

  const sid = String(order.store_id ?? "").trim();
  if (!sid) return { ok: false, error: "missing_store_id" };

  const fee = await chargeStoreCommissionForOrder(sb, oid, "completed");
  if (!fee.ok) {
    console.error("[recognizeOrderCurrencyOnCompleted] commission_charge", fee.error);
  }

  if (!isCurrencySaleRecognitionLive()) {
    return fee.ok
      ? { ok: true, skipped: true, feeCharged: true, feeIdempotent: fee.idempotent === true }
      : { ok: false, error: fee.error };
  }

  const platformHeldPhp = platformHeldSaleAmountPhp(order);
  if (platformHeldPhp <= 0) {
    return fee.ok
      ? { ok: true, platformHeldPhp: 0, feeCharged: true, feeIdempotent: fee.idempotent === true }
      : { ok: false, error: fee.error };
  }

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
  if (!fee.ok) return { ok: false, error: fee.error };

  return {
    ok: true,
    platformHeldPhp,
    coinCredited: true,
    coinIdempotent: row.idempotent === true,
    feeCharged: true,
    feeIdempotent: fee.idempotent === true,
  };
}
