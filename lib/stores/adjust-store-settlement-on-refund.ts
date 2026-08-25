import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeCommissionReversalAmount,
  computeNetSettlementAmount,
} from "@/lib/stores/store-order-financial-fact";
import { STORE_ORDER_FINANCIAL_CONTRACT } from "@/lib/stores/store-order-financial-contract";

function clampMoneyInt(n: unknown): number {
  const v = Math.round(Number(n) || 0);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

export type AdjustStoreSettlementOnRefundResult =
  | { ok: true; refund_amount: number; commission_reversal_amount: number; net_settlement_amount: number }
  | { ok: false; error: string };

/**
 * FULL REFUND ONLY — PRODUCT LOCK (`partialRefundSupported: false`).
 *
 * Consumes settlement snapshot fees (FIN-08). Does NOT re-resolve commission policy.
 * Partial `refundAmount` (< gross) is rejected.
 *
 * After-settlement (status=paid): hold + note; amounts still adjusted to full refund.
 */
export async function adjustStoreSettlementOnRefund(
  sb: SupabaseClient,
  opts: { orderId: string; refundAmount?: number; note?: string }
): Promise<AdjustStoreSettlementOnRefundResult> {
  const oid = opts.orderId.trim();
  if (!oid) return { ok: false, error: "missing_order_id" };

  const { data: row, error } = await sb
    .from("store_settlements")
    .select(
      "id, settlement_status, gross_amount, platform_fee_amount, fixed_fee_amount, discount_burden_amount, delivery_income_amount, refund_amount, commission_reversal_amount, hold_reason, payout_note, paid_at"
    )
    .eq("order_id", oid)
    .maybeSingle();

  if (error) {
    if (error.message?.includes("store_settlements") && error.message.includes("does not exist")) {
      return { ok: false, error: "table_missing" };
    }
    if (/commission_reversal_amount/i.test(error.message ?? "")) {
      return adjustLegacyWithoutReversalColumn(sb, opts);
    }
    console.error("[adjustStoreSettlementOnRefund] load", error);
    return { ok: false, error: error.message };
  }
  if (!row) return { ok: false, error: "settlement_not_found" };

  const { data: orderRow, error: orderErr } = await sb
    .from("store_orders")
    .select("store_funded_amount")
    .eq("id", oid)
    .maybeSingle();
  if (orderErr) {
    console.error("[adjustStoreSettlementOnRefund] order_load", orderErr);
    return { ok: false, error: orderErr.message };
  }
  if (!orderRow) return { ok: false, error: "order_not_found" };

  const storeFunded = clampMoneyInt((orderRow as { store_funded_amount?: unknown }).store_funded_amount);

  const gross = clampMoneyInt((row as { gross_amount?: unknown }).gross_amount);

  // PRODUCT LOCK — Delivery partial refund is NOT_SUPPORTED.
  if (
    !STORE_ORDER_FINANCIAL_CONTRACT.partialRefundSupported &&
    opts.refundAmount != null &&
    Number.isFinite(Number(opts.refundAmount))
  ) {
    const requested = clampMoneyInt(opts.refundAmount);
    if (requested > 0 && requested < gross) {
      console.error("[adjustStoreSettlementOnRefund] partial_refund_not_supported", {
        orderId: oid,
        requested,
        gross,
      });
      return { ok: false, error: "partial_refund_not_supported" };
    }
  }

  const nextRefund = gross; // full only
  const platformFee = clampMoneyInt((row as { platform_fee_amount?: unknown }).platform_fee_amount);
  const fixedFee = clampMoneyInt((row as { fixed_fee_amount?: unknown }).fixed_fee_amount);
  const deliveryIncome = clampMoneyInt((row as { delivery_income_amount?: unknown }).delivery_income_amount);

  const reversal = computeCommissionReversalAmount({
    gross_amount: gross,
    refund_amount: nextRefund,
    platform_fee_amount: platformFee,
    fixed_fee_amount: fixedFee,
    delivery_income_amount: deliveryIncome,
  });

  const net = computeNetSettlementAmount({
    gross_amount: gross,
    platform_fee_amount: platformFee,
    fixed_fee_amount: fixedFee,
    store_funded_amount: storeFunded,
    refund_amount: nextRefund,
    delivery_income_amount: deliveryIncome,
  });

  const currentStatus = String((row as { settlement_status?: unknown }).settlement_status ?? "").trim();
  const note = (opts.note ?? "refund_applied").trim();
  const shouldHold = currentStatus === "paid";
  const nextStatus = shouldHold ? "held" : net === 0 ? "cancelled" : currentStatus;

  const holdReasonExisting =
    typeof (row as { hold_reason?: unknown }).hold_reason === "string"
      ? String((row as { hold_reason: string }).hold_reason).trim()
      : "";
  const payoutNoteExisting =
    typeof (row as { payout_note?: unknown }).payout_note === "string"
      ? String((row as { payout_note: string }).payout_note).trim()
      : "";

  const holdReason =
    shouldHold && !holdReasonExisting
      ? `환불 발생(지급 완료 후): ${note}`.slice(0, 500)
      : holdReasonExisting || null;
  const payoutNote = (payoutNoteExisting ? `${payoutNoteExisting}\n` : "") + `refund: ${note}`.trim();

  const updatePayload: Record<string, unknown> = {
    refund_amount: nextRefund,
    commission_reversal_amount: reversal,
    net_settlement_amount: net,
    settlement_amount: net,
    settlement_status: nextStatus,
    payout_note: payoutNote.slice(0, 2000),
  };
  if (shouldHold) updatePayload.hold_reason = holdReason;

  const { error: uErr } = await sb
    .from("store_settlements")
    .update(updatePayload)
    .eq("id", (row as { id: string }).id);
  if (!uErr) {
    return {
      ok: true,
      refund_amount: nextRefund,
      commission_reversal_amount: reversal,
      net_settlement_amount: net,
    };
  }
  if (uErr.message?.includes("does not exist")) return { ok: false, error: "table_missing" };
  if (/commission_reversal_amount/i.test(uErr.message ?? "")) {
    return adjustLegacyWithoutReversalColumn(sb, opts);
  }
  console.error("[adjustStoreSettlementOnRefund] update", uErr);
  return { ok: false, error: uErr.message };
}

async function adjustLegacyWithoutReversalColumn(
  sb: SupabaseClient,
  opts: { orderId: string; refundAmount?: number; note?: string }
): Promise<AdjustStoreSettlementOnRefundResult> {
  const oid = opts.orderId.trim();
  const { data: row, error } = await sb
    .from("store_settlements")
    .select(
      "id, settlement_status, gross_amount, platform_fee_amount, fixed_fee_amount, discount_burden_amount, delivery_income_amount, refund_amount, hold_reason, payout_note, paid_at"
    )
    .eq("order_id", oid)
    .maybeSingle();
  if (error || !row) return { ok: false, error: error?.message ?? "settlement_not_found" };

  const { data: orderRow, error: orderErr } = await sb
    .from("store_orders")
    .select("store_funded_amount")
    .eq("id", oid)
    .maybeSingle();
  if (orderErr) return { ok: false, error: orderErr.message };
  if (!orderRow) return { ok: false, error: "order_not_found" };

  const storeFunded = clampMoneyInt((orderRow as { store_funded_amount?: unknown }).store_funded_amount);

  const gross = clampMoneyInt((row as { gross_amount?: unknown }).gross_amount);
  if (
    !STORE_ORDER_FINANCIAL_CONTRACT.partialRefundSupported &&
    opts.refundAmount != null &&
    clampMoneyInt(opts.refundAmount) > 0 &&
    clampMoneyInt(opts.refundAmount) < gross
  ) {
    return { ok: false, error: "partial_refund_not_supported" };
  }

  const nextRefund = gross;
  const platformFee = clampMoneyInt((row as { platform_fee_amount?: unknown }).platform_fee_amount);
  const fixedFee = clampMoneyInt((row as { fixed_fee_amount?: unknown }).fixed_fee_amount);
  const deliveryIncome = clampMoneyInt((row as { delivery_income_amount?: unknown }).delivery_income_amount);
  const reversal = computeCommissionReversalAmount({
    gross_amount: gross,
    refund_amount: nextRefund,
    platform_fee_amount: platformFee,
    fixed_fee_amount: fixedFee,
    delivery_income_amount: deliveryIncome,
  });
  const net = computeNetSettlementAmount({
    gross_amount: gross,
    platform_fee_amount: platformFee,
    fixed_fee_amount: fixedFee,
    store_funded_amount: storeFunded,
    refund_amount: nextRefund,
    delivery_income_amount: deliveryIncome,
  });
  const currentStatus = String((row as { settlement_status?: unknown }).settlement_status ?? "").trim();
  const note = (opts.note ?? "refund_applied").trim();
  const shouldHold = currentStatus === "paid";
  const nextStatus = shouldHold ? "held" : net === 0 ? "cancelled" : currentStatus;
  const payoutNoteExisting =
    typeof (row as { payout_note?: unknown }).payout_note === "string"
      ? String((row as { payout_note: string }).payout_note).trim()
      : "";
  const updatePayload: Record<string, unknown> = {
    refund_amount: nextRefund,
    net_settlement_amount: net,
    settlement_amount: net,
    settlement_status: nextStatus,
    payout_note: ((payoutNoteExisting ? `${payoutNoteExisting}\n` : "") + `refund: ${note}`).slice(0, 2000),
  };
  if (shouldHold) {
    const holdReasonExisting =
      typeof (row as { hold_reason?: unknown }).hold_reason === "string"
        ? String((row as { hold_reason: string }).hold_reason).trim()
        : "";
    if (!holdReasonExisting) {
      updatePayload.hold_reason = `환불 발생(지급 완료 후): ${note}`.slice(0, 500);
    }
  }
  const { error: uErr } = await sb
    .from("store_settlements")
    .update(updatePayload)
    .eq("id", (row as { id: string }).id);
  if (uErr) return { ok: false, error: uErr.message };
  return {
    ok: true,
    refund_amount: nextRefund,
    commission_reversal_amount: reversal,
    net_settlement_amount: net,
  };
}
