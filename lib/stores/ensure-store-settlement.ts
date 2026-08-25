import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCommerceSettings } from "@/lib/stores/load-commerce-settings";
import {
  buildAppliedFeePolicySnapshot,
  calculateOrderCommission,
  isMissingStoreFeePolicy,
  resolveEffectiveStoreFeePolicy,
} from "@/lib/stores/store-fee-policy-resolve";

/**
 * 결제 완료 주문에 대해 정산 1건을 만든다. order_id UNIQUE로 멱등.
 * 정책: paid만으로는 정산 생성하지 않음 → completed 위임.
 */
export async function ensureStoreSettlementForPaidOrder(
  sb: SupabaseClient,
  orderId: string
): Promise<void> {
  await ensureStoreSettlementForCompletedOrder(sb, orderId);
}

/**
 * 주문 완료(completed) 시점에만 정산 원장을 계산/생성한다.
 *
 * IMMUTABLE: 기존 settlement 행이 있으면 수수료를 재해석하지 않는다.
 * (Admin이 정책을 바꿔도 과거 주문 수수료는 불변 — INV-08)
 * 환불 조정은 `adjustStoreSettlementOnRefund` 가 snapshot 금액을 소비한다.
 */
export async function ensureStoreSettlementForCompletedOrder(
  sb: SupabaseClient,
  orderId: string
): Promise<void> {
  const oid = orderId.trim();
  if (!oid) return;

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select(
      "id, store_id, order_status, payment_amount, delivery_fee_amount, commission_base_amount, store_funded_amount, platform_funded_amount"
    )
    .eq("id", oid)
    .maybeSingle();

  if (oErr || !order) return;
  if ((order.order_status as string) !== "completed") return;

  const paymentAmount = Math.round(Number(order.payment_amount) || 0);
  const commissionBaseRaw = (order as { commission_base_amount?: unknown }).commission_base_amount;
  const hasNewBase =
    commissionBaseRaw != null && Number.isFinite(Number(commissionBaseRaw)) && Number(commissionBaseRaw) > 0;
  const gross = hasNewBase ? Math.round(Number(commissionBaseRaw)) : paymentAmount;
  if (!Number.isFinite(gross) || gross <= 0) return;

  const sid = String(order.store_id ?? "").trim();
  if (!sid) return;

  const { data: existing, error: exErr } = await sb
    .from("store_settlements")
    .select("id, settlement_status, applied_fee_policy_id, platform_fee_percent")
    .eq("order_id", oid)
    .maybeSingle();

  if (exErr && !/does not exist/i.test(String(exErr.message ?? ""))) {
    console.error("[ensureStoreSettlementForCompletedOrder existing]", exErr);
  }

  // Already snapshotted — do not re-resolve current Admin policy.
  if (existing && typeof (existing as { id?: string }).id === "string") {
    return;
  }

  const policy = await resolveEffectiveStoreFeePolicy(sb, { storeId: sid });
  if (isMissingStoreFeePolicy(policy)) {
    console.error("[ensureStoreSettlementForCompletedOrder] missing_policy — settlement not created", {
      orderId: oid,
      storeId: sid,
      reason: policy.snapshot?.reason ?? policy.policyName,
    });
    return;
  }
  const deliveryFeeAmount = Math.round(Number((order as { delivery_fee_amount?: unknown }).delivery_fee_amount) || 0);

  const fee = calculateOrderCommission({
    commissionBaseAmount: gross,
    deliveryFeeAmount,
    feePercent: policy.feePercent,
    fixedFee: policy.fixedFee,
    deliveryFeeMode: policy.deliveryFeeMode,
    deliveryFeePercent: policy.deliveryFeePercent,
  });

  const storeFunded = Math.max(
    0,
    Math.round(Number((order as { store_funded_amount?: unknown }).store_funded_amount) || 0)
  );
  const discountBurden = Math.max(
    0,
    Math.round(Number((order as { platform_funded_amount?: unknown }).platform_funded_amount) || 0)
  );
  const refundAmount = 0;
  const net = Math.max(0, fee.netBeforeRefund - storeFunded - refundAmount);

  const commerce = await loadCommerceSettings(sb);
  const delay = commerce.settlementDelayDays;
  const due = new Date();
  due.setUTCDate(due.getUTCDate() + delay);
  const settlementDueDate = due.toISOString().slice(0, 10);

  const insertPayload: Record<string, unknown> = {
    store_id: sid,
    order_id: oid,
    gross_amount: fee.commissionBaseAmount,
    fee_amount: fee.totalPlatformFeeAmount,
    settlement_amount: net,
    platform_fee_percent: fee.platformFeePercent,
    platform_fee_amount: fee.platformFeeAmount,
    fixed_fee_amount: fee.fixedFeeAmount,
    delivery_income_amount: fee.deliveryIncomeAmount,
    discount_burden_amount: discountBurden,
    refund_amount: refundAmount,
    net_settlement_amount: net,
    applied_fee_policy_id: policy.policyId,
    applied_fee_policy_snapshot: buildAppliedFeePolicySnapshot(policy),
    settlement_due_date: settlementDueDate,
    settlement_status: "scheduled",
    commission_reversal_amount: 0,
  };

  const { error: insErr } = await sb.from("store_settlements").insert(insertPayload);

  if (!insErr) return;
  if (insErr.code === "23505") return;
  if (insErr.message?.includes("store_settlements") && insErr.message.includes("does not exist")) {
    return;
  }
  if (/commission_reversal_amount/i.test(insErr.message ?? "")) {
    const legacy = { ...insertPayload };
    delete legacy.commission_reversal_amount;
    const retry = await sb.from("store_settlements").insert(legacy);
    if (!retry.error || retry.error.code === "23505") return;
    console.error("[ensureStoreSettlementForCompletedOrder insert legacy]", retry.error);
    return;
  }
  console.error("[ensureStoreSettlementForCompletedOrder insert]", insErr);
}
