import type { SupabaseClient } from "@supabase/supabase-js";

function clampMoneyInt(n: unknown): number {
  const v = Math.round(Number(n) || 0);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

export async function adjustStoreSettlementOnRefund(
  sb: SupabaseClient,
  opts: { orderId: string; refundAmount?: number; note?: string }
): Promise<void> {
  const oid = opts.orderId.trim();
  if (!oid) return;

  const { data: row, error } = await sb
    .from("store_settlements")
    .select(
      "id, settlement_status, gross_amount, platform_fee_amount, fixed_fee_amount, discount_burden_amount, delivery_income_amount, refund_amount, hold_reason, payout_note, paid_at"
    )
    .eq("order_id", oid)
    .maybeSingle();

  if (error) {
    if (error.message?.includes("store_settlements") && error.message.includes("does not exist")) return;
    console.error("[adjustStoreSettlementOnRefund] load", error);
    return;
  }
  if (!row) return;

  const gross = clampMoneyInt((row as any).gross_amount);
  const prevRefund = clampMoneyInt((row as any).refund_amount);
  const refundDelta = clampMoneyInt(opts.refundAmount ?? gross);
  const nextRefund = Math.min(gross, Math.max(prevRefund, refundDelta));

  const platformFee = clampMoneyInt((row as any).platform_fee_amount);
  const fixedFee = clampMoneyInt((row as any).fixed_fee_amount);
  const discountBurden = clampMoneyInt((row as any).discount_burden_amount);
  const deliveryIncome = clampMoneyInt((row as any).delivery_income_amount);

  const net = Math.max(0, gross - platformFee - fixedFee - discountBurden - nextRefund - deliveryIncome);

  const currentStatus = String((row as any).settlement_status ?? "").trim();
  const note = (opts.note ?? "refund_applied").trim();

  const shouldHold = currentStatus === "paid";
  const nextStatus = shouldHold ? "held" : net === 0 ? "cancelled" : currentStatus;

  const holdReasonExisting = typeof (row as any).hold_reason === "string" ? (row as any).hold_reason.trim() : "";
  const payoutNoteExisting = typeof (row as any).payout_note === "string" ? (row as any).payout_note.trim() : "";

  const holdReason =
    shouldHold && !holdReasonExisting ? `환불 발생(지급 완료 후): ${note}`.slice(0, 500) : holdReasonExisting || null;
  const payoutNote =
    (payoutNoteExisting ? `${payoutNoteExisting}\n` : "") + `refund: ${note}`.trim();

  const updatePayload: Record<string, unknown> = {
    refund_amount: nextRefund,
    net_settlement_amount: net,
    settlement_amount: net,
    settlement_status: nextStatus,
    payout_note: payoutNote.slice(0, 2000),
  };

  if (shouldHold) {
    updatePayload.hold_reason = holdReason;
  }

  const { error: uErr } = await sb.from("store_settlements").update(updatePayload).eq("id", (row as any).id);
  if (!uErr) return;
  if (uErr.message?.includes("does not exist")) return;
  console.error("[adjustStoreSettlementOnRefund] update", uErr);
}

