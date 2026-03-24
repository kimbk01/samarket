import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCommerceSettings } from "@/lib/stores/load-commerce-settings";

/**
 * 결제 완료 주문에 대해 정산 1건을 만든다. order_id UNIQUE로 멱등.
 * 테이블 미적용 시 조용히 스킵(로그만).
 */
export async function ensureStoreSettlementForPaidOrder(
  sb: SupabaseClient,
  orderId: string
): Promise<void> {
  const oid = orderId.trim();
  if (!oid) return;

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, store_id, payment_amount, payment_status")
    .eq("id", oid)
    .maybeSingle();

  if (oErr || !order || order.payment_status !== "paid") return;

  const gross = Math.max(0, Math.round(Number(order.payment_amount) || 0));
  if (gross <= 0) return;

  const commerce = await loadCommerceSettings(sb);
  const feeBp = commerce.settlementFeeBp;
  const fee = Math.min(gross, Math.floor((gross * feeBp) / 10000));
  const settlementAmount = gross - fee;

  const delay = commerce.settlementDelayDays;
  const due = new Date();
  due.setUTCDate(due.getUTCDate() + delay);
  const settlementDueDate = due.toISOString().slice(0, 10);

  const { error: insErr } = await sb.from("store_settlements").insert({
    store_id: order.store_id as string,
    order_id: oid,
    gross_amount: gross,
    fee_amount: fee,
    settlement_amount: settlementAmount,
    settlement_status: "scheduled",
    settlement_due_date: settlementDueDate,
  });

  if (!insErr) return;
  if (insErr.code === "23505") return;
  if (insErr.message?.includes("store_settlements") && insErr.message.includes("does not exist")) {
    return;
  }
  console.error("[ensureStoreSettlementForPaidOrder]", insErr);
}
