/**
 * CUT D / F-04 — order completed currency recognition (Coin gross + Cash sale fee).
 * Atomic boundary: recognize_order_currency_on_completed (single DB TX).
 * Gated by DIBAY_CURRENCY_SALE_RECOGNITION_LIVE until Production cutover.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isCurrencySaleRecognitionLive } from "@/lib/currency/currency-cutover-flags";
import {
  saleCoinIdempotencyKeyForOrder,
  saleFeeIdempotencyKeyForOrder,
  confirmedSaleRevenuePhp,
} from "@/lib/stores/confirmed-sale-revenue";
import {
  calculateOrderCommission,
  resolveEffectiveStoreFeePolicy,
} from "@/lib/stores/store-fee-policy-resolve";

export const RECOGNIZE_ORDER_CURRENCY_ON_COMPLETED_RPC =
  "recognize_order_currency_on_completed" as const;

export type RecognizeOrderCurrencyResult =
  | {
      ok: true;
      skipped?: boolean;
      confirmedRevenuePhp?: number;
      coinCredited?: boolean;
      feeCharged?: boolean;
      coinIdempotent?: boolean;
      feeIdempotent?: boolean;
    }
  | { ok: false; error: string };

export async function recognizeOrderCurrencyOnCompleted(
  sb: SupabaseClient,
  orderId: string
): Promise<RecognizeOrderCurrencyResult> {
  if (!isCurrencySaleRecognitionLive()) {
    return { ok: true, skipped: true };
  }

  const oid = orderId.trim();
  if (!oid) return { ok: false, error: "missing_order_id" };

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select(
      "id, store_id, order_status, payment_amount, gift_redemption_amount, platform_funded_amount, store_funded_amount, discount_amount, delivery_fee_amount"
    )
    .eq("id", oid)
    .maybeSingle();

  if (oErr || !order) return { ok: false, error: "order_not_found" };
  if ((order.order_status as string) !== "completed") return { ok: true, skipped: true };

  const confirmed = confirmedSaleRevenuePhp(order);
  if (confirmed <= 0) return { ok: true, skipped: true, confirmedRevenuePhp: 0 };

  const sid = String(order.store_id ?? "").trim();
  if (!sid) return { ok: false, error: "missing_store_id" };

  const { data: settlement } = await sb
    .from("store_settlements")
    .select("id, applied_fee_policy_snapshot, platform_fee_percent, fixed_fee_amount, delivery_income_amount")
    .eq("order_id", oid)
    .maybeSingle();

  const settlementId = settlement?.id ? String(settlement.id) : null;

  let feePercent = 0;
  let fixedFee = 0;
  let deliveryFeeMode: string | null = "none";
  let deliveryFeePercent: number | string | null = 0;

  const snap = settlement?.applied_fee_policy_snapshot as Record<string, unknown> | null;
  if (snap && typeof snap === "object" && settlement) {
    feePercent = Number(snap.fee_percent ?? snap.feePercent ?? settlement.platform_fee_percent) || 0;
    fixedFee = Math.trunc(Number(snap.fixed_fee ?? snap.fixedFee ?? settlement.fixed_fee_amount) || 0);
    deliveryFeeMode = String(snap.delivery_fee_mode ?? snap.deliveryFeeMode ?? "none");
    const dfp = snap.delivery_fee_percent ?? snap.deliveryFeePercent ?? 0;
    deliveryFeePercent = typeof dfp === "number" || typeof dfp === "string" ? dfp : 0;
  } else {
    const policy = await resolveEffectiveStoreFeePolicy(sb, { storeId: sid });
    feePercent = policy.feePercent;
    fixedFee = policy.fixedFee;
    deliveryFeeMode = policy.deliveryFeeMode;
    deliveryFeePercent = policy.deliveryFeePercent;
  }

  const deliveryFeeAmount = Math.trunc(Number(order.delivery_fee_amount) || 0);
  const feeCalc = calculateOrderCommission({
    commissionBaseAmount: confirmed,
    deliveryFeeAmount,
    feePercent,
    fixedFee,
    deliveryFeeMode,
    deliveryFeePercent,
  });
  const feeDuePhp = feeCalc.totalPlatformFeeAmount + feeCalc.deliveryIncomeAmount;

  const { data, error } = await sb.rpc(RECOGNIZE_ORDER_CURRENCY_ON_COMPLETED_RPC, {
    p_store_id: sid,
    p_order_id: oid,
    p_settlement_id: settlementId,
    p_confirmed_revenue_php: confirmed,
    p_fee_due_php: feeDuePhp,
    p_coin_idempotency_key: saleCoinIdempotencyKeyForOrder(oid),
    p_fee_idempotency_key: saleFeeIdempotencyKeyForOrder(oid),
  });

  if (error) {
    if (/does not exist|Could not find the function/i.test(error.message)) {
      return { ok: false, error: "rpc_missing" };
    }
    // Fee RAISE maps to PostgREST error — treat as failed atomic recognition (no half-commit).
    console.error("[recognizeOrderCurrencyOnCompleted] atomic", error.message);
    return { ok: false, error: error.message };
  }

  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === false) {
    return { ok: false, error: String(row.error ?? "recognize_failed") };
  }
  if (row.skipped === true) {
    return { ok: true, skipped: true, confirmedRevenuePhp: confirmed };
  }

  const coin = (row.coin ?? {}) as Record<string, unknown>;
  const fee = (row.fee ?? {}) as Record<string, unknown>;

  return {
    ok: true,
    confirmedRevenuePhp: confirmed,
    coinCredited: coin.ok === true || row.ok === true,
    feeCharged: fee.ok === true || fee.skipped === true,
    coinIdempotent: row.coin_idempotent === true || coin.idempotent === true,
    feeIdempotent: row.fee_idempotent === true || fee.idempotent === true,
  };
}
