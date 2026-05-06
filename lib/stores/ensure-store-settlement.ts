import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCommerceSettings } from "@/lib/stores/load-commerce-settings";

type FeePolicyRow = {
  id: string;
  policy_name: string;
  fee_percent: number | string | null;
  fixed_fee: number | null;
  delivery_fee_mode: string | null;
  delivery_fee_percent: number | string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function clampMoneyInt(n: unknown): number {
  const v = Math.round(Number(n) || 0);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

function clampPercent(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
}

function computeFeeAmount(gross: number, feePercent: number, fixedFee: number): {
  percentFee: number;
  fixedFee: number;
  totalFee: number;
} {
  const p = clampPercent(feePercent);
  const ff = clampMoneyInt(fixedFee);
  const percentFee = Math.min(gross, Math.floor((gross * p) / 100));
  const totalFee = Math.min(gross, percentFee + ff);
  return { percentFee, fixedFee: ff, totalFee };
}

function computeDeliveryIncome(deliveryFeeAmount: number, mode: string | null, percent: unknown): number {
  if (String(mode ?? "").trim() !== "percent") return 0;
  const p = clampPercent(percent);
  return Math.min(deliveryFeeAmount, Math.floor((deliveryFeeAmount * p) / 100));
}

async function loadEffectiveFeePolicy(sb: SupabaseClient, opts: { storeId: string; storeCategoryId: string | null }) {
  const sid = opts.storeId.trim();
  const catId = opts.storeCategoryId?.trim() || null;
  const now = nowIso();

  const baseFallback = async () => {
    const commerce = await loadCommerceSettings(sb);
    const feePercent = (Number(commerce.settlementFeeBp) || 0) / 100;
    return {
      policyId: null as string | null,
      policyName: "fallback:commerce_settings",
      feePercent,
      fixedFee: 0,
      deliveryFeeMode: "none",
      deliveryFeePercent: 0,
      snapshot: {
        source: "commerce_settings",
        store_settlement_fee_bp: commerce.settlementFeeBp,
      } as Record<string, unknown>,
    };
  };

  const tableMissing = (m: unknown) =>
    /store_fee_policies/i.test(String(m ?? "")) && /does not exist/i.test(String(m ?? ""));
  const archivedColsMissing = (m: unknown) =>
    /is_archived/i.test(String(m ?? "")) && /does not exist|unknown column/i.test(String(m ?? ""));

  const query = async (q: any) => {
    const { data, error } = await q;
    if (error) {
      if (tableMissing(error.message)) return { ok: false as const, missing: true as const };
      if (archivedColsMissing(error.message)) return { ok: false as const, archived_cols_missing: true as const };
      console.error("[loadEffectiveFeePolicy]", error);
      return { ok: false as const, missing: false as const };
    }
    const row = (data ?? [])[0] as FeePolicyRow | undefined;
    if (!row) return { ok: true as const, row: null as FeePolicyRow | null };
    return { ok: true as const, row };
  };

  // 1) store-specific
  {
    let res = await query(
      sb
        .from("store_fee_policies")
        .select("id, policy_name, fee_percent, fixed_fee, delivery_fee_mode, delivery_fee_percent")
        .eq("is_active", true)
        .eq("is_archived", false)
        .eq("store_id", sid)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gt.${now}`)
        .order("priority", { ascending: true })
        .order("starts_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
    );
    if ((res as any).archived_cols_missing) {
      res = await query(
        sb
          .from("store_fee_policies")
          .select("id, policy_name, fee_percent, fixed_fee, delivery_fee_mode, delivery_fee_percent")
          .eq("is_active", true)
          .eq("store_id", sid)
          .or(`starts_at.is.null,starts_at.lte.${now}`)
          .or(`ends_at.is.null,ends_at.gt.${now}`)
          .order("priority", { ascending: true })
          .order("starts_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
      );
    }
    if (!res.ok) return await baseFallback();
    if (res.row) {
      return {
        policyId: res.row.id,
        policyName: res.row.policy_name,
        feePercent: clampPercent(res.row.fee_percent),
        fixedFee: clampMoneyInt(res.row.fixed_fee),
        deliveryFeeMode: String(res.row.delivery_fee_mode ?? "none"),
        deliveryFeePercent: clampPercent(res.row.delivery_fee_percent),
        snapshot: res.row,
      };
    }
    if ((res as any).missing) return await baseFallback();
  }

  // 2) category-specific
  if (catId) {
    let res = await query(
      sb
        .from("store_fee_policies")
        .select("id, policy_name, fee_percent, fixed_fee, delivery_fee_mode, delivery_fee_percent")
        .eq("is_active", true)
        .eq("is_archived", false)
        .eq("category_id", catId)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gt.${now}`)
        .order("priority", { ascending: true })
        .order("starts_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
    );
    if ((res as any).archived_cols_missing) {
      res = await query(
        sb
          .from("store_fee_policies")
          .select("id, policy_name, fee_percent, fixed_fee, delivery_fee_mode, delivery_fee_percent")
          .eq("is_active", true)
          .eq("category_id", catId)
          .or(`starts_at.is.null,starts_at.lte.${now}`)
          .or(`ends_at.is.null,ends_at.gt.${now}`)
          .order("priority", { ascending: true })
          .order("starts_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
      );
    }
    if (!res.ok) return await baseFallback();
    if (res.row) {
      return {
        policyId: res.row.id,
        policyName: res.row.policy_name,
        feePercent: clampPercent(res.row.fee_percent),
        fixedFee: clampMoneyInt(res.row.fixed_fee),
        deliveryFeeMode: String(res.row.delivery_fee_mode ?? "none"),
        deliveryFeePercent: clampPercent(res.row.delivery_fee_percent),
        snapshot: res.row,
      };
    }
    if ((res as any).missing) return await baseFallback();
  }

  // 3) default policy (store_id null, category_id null)
  {
    let { data, error } = await sb
      .from("store_fee_policies")
      .select("id, policy_name, fee_percent, fixed_fee, delivery_fee_mode, delivery_fee_percent")
      .eq("is_active", true)
      .eq("is_archived", false)
      .is("store_id", null)
      .is("category_id", null)
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .order("priority", { ascending: true })
      .order("starts_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);
    if (error && archivedColsMissing(error.message)) {
      const retry = await sb
        .from("store_fee_policies")
        .select("id, policy_name, fee_percent, fixed_fee, delivery_fee_mode, delivery_fee_percent")
        .eq("is_active", true)
        .is("store_id", null)
        .is("category_id", null)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gt.${now}`)
        .order("priority", { ascending: true })
        .order("starts_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);
      data = retry.data;
      error = retry.error;
    }
    if (error) {
      if (tableMissing(error.message)) return await baseFallback();
      console.error("[loadEffectiveFeePolicy default]", error);
      return await baseFallback();
    }
    const row = (data ?? [])[0] as FeePolicyRow | undefined;
    if (!row) return await baseFallback();
    return {
      policyId: row.id,
      policyName: row.policy_name,
      feePercent: clampPercent(row.fee_percent),
      fixedFee: clampMoneyInt(row.fixed_fee),
      deliveryFeeMode: String(row.delivery_fee_mode ?? "none"),
      deliveryFeePercent: clampPercent(row.delivery_fee_percent),
      snapshot: row,
    };
  }
}

/**
 * 결제 완료 주문에 대해 정산 1건을 만든다. order_id UNIQUE로 멱등.
 * 테이블 미적용 시 조용히 스킵(로그만).
 */
export async function ensureStoreSettlementForPaidOrder(
  sb: SupabaseClient,
  orderId: string
): Promise<void> {
  // 정책 변경: paid만으로는 정산 생성하지 않음(필리핀형 COD 포함).
  // completed 시점에만 계산/생성한다.
  await ensureStoreSettlementForCompletedOrder(sb, orderId);
}

/**
 * 주문 완료(completed) 시점에만 정산 원장을 계산/갱신한다.
 * order_id UNIQUE 기반 멱등. 테이블 미적용 시 조용히 스킵.
 */
export async function ensureStoreSettlementForCompletedOrder(
  sb: SupabaseClient,
  orderId: string
): Promise<void> {
  const oid = orderId.trim();
  if (!oid) return;

  const { data: order, error: oErr } = await sb
    .from("store_orders")
    .select("id, store_id, order_status, payment_amount, delivery_fee_amount")
    .eq("id", oid)
    .maybeSingle();

  if (oErr || !order) return;
  if ((order.order_status as string) !== "completed") return;

  const gross = clampMoneyInt(order.payment_amount);
  if (gross <= 0) return;

  const sid = String(order.store_id ?? "").trim();
  if (!sid) return;

  const { data: storeRow } = await sb.from("stores").select("id, store_category_id").eq("id", sid).maybeSingle();
  const storeCategoryId =
    storeRow && typeof (storeRow as any).store_category_id === "string"
      ? String((storeRow as any).store_category_id)
      : null;

  const policy = await loadEffectiveFeePolicy(sb, { storeId: sid, storeCategoryId });
  const deliveryFeeAmount = clampMoneyInt((order as any).delivery_fee_amount);

  const fee = computeFeeAmount(gross, policy.feePercent, policy.fixedFee);
  const deliveryIncome = computeDeliveryIncome(deliveryFeeAmount, policy.deliveryFeeMode, policy.deliveryFeePercent);

  // 예시/요구: delivery_income는 플랫폼 수익이므로 정산 예정금에서 차감한다.
  const discountBurden = 0;
  const refundAmount = 0;
  const net = Math.max(
    0,
    gross - fee.percentFee - fee.fixedFee - discountBurden - refundAmount - deliveryIncome
  );

  const commerce = await loadCommerceSettings(sb);
  const delay = commerce.settlementDelayDays;
  const due = new Date();
  due.setUTCDate(due.getUTCDate() + delay);
  const settlementDueDate = due.toISOString().slice(0, 10);

  const { data: existing, error: exErr } = await sb
    .from("store_settlements")
    .select("id, settlement_status")
    .eq("order_id", oid)
    .maybeSingle();

  if (exErr && !/does not exist/i.test(String(exErr.message ?? ""))) {
    console.error("[ensureStoreSettlementForCompletedOrder existing]", exErr);
  }

  const updatePayload: Record<string, unknown> = {
    store_id: sid,
    order_id: oid,
    gross_amount: gross,
    // legacy columns
    fee_amount: fee.totalFee,
    settlement_amount: net,
    // new columns (if available)
    platform_fee_percent: policy.feePercent,
    platform_fee_amount: fee.percentFee,
    fixed_fee_amount: fee.fixedFee,
    delivery_income_amount: deliveryIncome,
    discount_burden_amount: discountBurden,
    refund_amount: refundAmount,
    net_settlement_amount: net,
    applied_fee_policy_id: policy.policyId,
    applied_fee_policy_snapshot: {
      policy_name: policy.policyName,
      fee_percent: policy.feePercent,
      fixed_fee: policy.fixedFee,
      delivery_fee_mode: policy.deliveryFeeMode,
      delivery_fee_percent: policy.deliveryFeePercent,
      source:
        policy.snapshot && typeof policy.snapshot === "object" && "source" in policy.snapshot
          ? String((policy.snapshot as Record<string, unknown>).source)
          : "store_fee_policies",
      raw: policy.snapshot,
    },
    settlement_due_date: settlementDueDate,
  };

  if (existing && typeof (existing as any).id === "string") {
    // 상태는 운영/지급 흐름이므로 여기서 덮어쓰지 않는다.
    const { error } = await sb.from("store_settlements").update(updatePayload).eq("id", (existing as any).id);
    if (!error) return;
    if (/does not exist/i.test(String(error.message ?? ""))) return;
    console.error("[ensureStoreSettlementForCompletedOrder update]", error);
    return;
  }

  const { error: insErr } = await sb.from("store_settlements").insert({
    ...updatePayload,
    settlement_status: "scheduled",
  });

  if (!insErr) return;
  if (insErr.code === "23505") return;
  if (insErr.message?.includes("store_settlements") && insErr.message.includes("does not exist")) {
    return;
  }
  console.error("[ensureStoreSettlementForCompletedOrder insert]", insErr);
}
