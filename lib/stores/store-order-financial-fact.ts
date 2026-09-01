/**
 * Canonical Order Financial Fact projection + aggregation.
 * Owner Admin and Platform Admin MUST read these fields — no independent UI math as authority.
 */
import { STORE_ORDER_FINANCIAL_CONTRACT } from "@/lib/stores/store-order-financial-contract";
import { confirmedSaleRevenuePhp } from "@/lib/stores/confirmed-sale-revenue";

export type StoreOrderFinancialFact = {
  settlement_id: string;
  order_id: string;
  order_no: string;
  store_id: string;
  store_name: string;
  buyer_user_id: string | null;
  buyer_display: string | null;
  ordered_at: string | null;
  completed_at: string | null;
  order_status: string | null;
  payment_status: string | null;
  settlement_status: string;
  settlement_due_date: string | null;
  settlement_created_at: string;
  paid_at: string | null;

  /** Ledger gross = commission base at recognition (= payment_amount). */
  gross_amount: number;
  /** CUT A/C — store-attributed confirmed sale revenue at completed (FIN-11). */
  confirmed_sale_revenue_php: number;
  discount_amount: number;
  point_amount: number;
  delivery_fee_amount: number;
  payment_amount: number;
  /** Order snapshot — store share of coupon. Not `discount_burden_amount`. */
  store_funded_amount: number;
  /** Order snapshot — DIBAY share of coupon. Ledger `discount_burden_amount` copies this at insert. */
  platform_funded_amount: number;

  commission_base_amount: number;
  commission_rate: number;
  commission_amount: number;
  fixed_fee_amount: number;
  delivery_income_amount: number;
  discount_burden_amount: number;
  commission_reversal_amount: number;

  /** Recognized platform revenue after reversal. */
  platform_commission_revenue: number;

  refund_amount: number;
  net_settlement_amount: number;

  applied_fee_policy_id: string | null;
  applied_fee_policy_snapshot: Record<string, unknown> | null;
  commission_policy_scope: string | null;
  hold_reason: string | null;
  payout_method: string | null;
  payout_reference: string | null;
  payout_confirmed_at: string | null;
  payout_note: string | null;
};

export type StoreOrderFinancialSummary = {
  order_count: number;
  gross: number;
  discount: number;
  point: number;
  refund: number;
  commission_base: number;
  /** Gross platform fees before reversal. */
  commission_gross: number;
  commission_reversal: number;
  /** = commission_gross - commission_reversal (+ delivery income is inside gross fees). */
  platform_commission_revenue: number;
  net_settlement: number;
  pending_net: number;
  paid_net: number;
  cancelled_count: number;
  refunded_ledger_count: number;
};

function money(n: unknown): number {
  const v = Math.round(Number(n) || 0);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

/**
 * Reproducible settlement equation (FIN-11).
 * Owner net coupon deduction = order snapshot `store_funded_amount` ONLY.
 * `platform_funded_amount` / ledger `discount_burden_amount` MUST NOT reduce Owner net.
 * Matches ensureStoreSettlementForCompletedOrder insert + adjustStoreSettlementOnRefund.
 */
export function computeNetSettlementAmount(input: {
  gross_amount: number;
  platform_fee_amount: number;
  fixed_fee_amount: number;
  /** Order-time store coupon burden — NOT ledger discount_burden (platform funded). */
  store_funded_amount: number;
  refund_amount: number;
  delivery_income_amount: number;
}): number {
  return Math.max(
    0,
    money(input.gross_amount) -
      money(input.platform_fee_amount) -
      money(input.fixed_fee_amount) -
      money(input.store_funded_amount) -
      money(input.refund_amount) -
      money(input.delivery_income_amount)
  );
}

export function computePlatformCommissionRevenue(input: {
  platform_fee_amount: number;
  fixed_fee_amount: number;
  delivery_income_amount: number;
  commission_reversal_amount: number;
}): number {
  const gross =
    money(input.platform_fee_amount) +
    money(input.fixed_fee_amount) +
    money(input.delivery_income_amount);
  return Math.max(0, gross - money(input.commission_reversal_amount));
}

/**
 * Full refund → reverse all platform fee components.
 *
 * NOT_PRODUCT_PATH: proportional branch for 0 < refund < gross exists as a
 * shared primitive only. Delivery product LOCK = full refund only
 * (`STORE_ORDER_FINANCIAL_CONTRACT.partialRefundSupported === false`).
 * Product writers must never call this with a partial refund amount.
 */
export function computeCommissionReversalAmount(input: {
  gross_amount: number;
  refund_amount: number;
  platform_fee_amount: number;
  fixed_fee_amount: number;
  delivery_income_amount: number;
}): number {
  const gross = money(input.gross_amount);
  const refund = money(input.refund_amount);
  const feeTotal =
    money(input.platform_fee_amount) +
    money(input.fixed_fee_amount) +
    money(input.delivery_income_amount);
  if (gross <= 0 || feeTotal <= 0 || refund <= 0) return 0;
  if (refund >= gross) return feeTotal;
  return Math.min(feeTotal, Math.floor((feeTotal * refund) / gross));
}

export type SettlementLedgerRowLike = {
  id: string;
  store_id: string;
  order_id: string;
  gross_amount: number | null;
  fee_amount?: number | null;
  settlement_amount?: number | null;
  settlement_status: string;
  settlement_due_date?: string | null;
  paid_at?: string | null;
  created_at: string;
  platform_fee_percent?: number | string | null;
  platform_fee_amount?: number | null;
  fixed_fee_amount?: number | null;
  delivery_income_amount?: number | null;
  discount_burden_amount?: number | null;
  refund_amount?: number | null;
  net_settlement_amount?: number | null;
  commission_reversal_amount?: number | null;
  applied_fee_policy_id?: string | null;
  applied_fee_policy_snapshot?: unknown;
  hold_reason?: string | null;
  payout_method?: string | null;
  payout_reference?: string | null;
  payout_confirmed_at?: string | null;
  payout_note?: string | null;
};

export type OrderJoinLike = {
  id: string;
  order_no?: string | null;
  buyer_user_id?: string | null;
  order_status?: string | null;
  payment_status?: string | null;
  payment_amount?: number | null;
  discount_amount?: number | null;
  store_funded_amount?: number | null;
  platform_funded_amount?: number | null;
  delivery_fee_amount?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
  refunded_at?: string | null;
};

export function projectStoreOrderFinancialFact(opts: {
  settlement: SettlementLedgerRowLike;
  order?: OrderJoinLike | null;
  storeName?: string;
  buyerDisplay?: string | null;
}): StoreOrderFinancialFact {
  const s = opts.settlement;
  const o = opts.order ?? null;
  const snap = asRecord(s.applied_fee_policy_snapshot);
  const scope =
    snap && typeof snap.scope === "string"
      ? snap.scope
      : snap && typeof snap.source === "string"
        ? snap.source
        : null;

  const gross = money(s.gross_amount);
  const platformFee = money(s.platform_fee_amount);
  const fixedFee = money(s.fixed_fee_amount);
  const deliveryIncome = money(s.delivery_income_amount);
  const discountBurden = money(s.discount_burden_amount);
  const refund = money(s.refund_amount);
  const reversal =
    s.commission_reversal_amount != null
      ? money(s.commission_reversal_amount)
      : computeCommissionReversalAmount({
          gross_amount: gross,
          refund_amount: refund,
          platform_fee_amount: platformFee,
          fixed_fee_amount: fixedFee,
          delivery_income_amount: deliveryIncome,
        });

  const paymentAmount = o?.payment_amount != null ? money(o.payment_amount) : gross;
  const deliveryFee = o?.delivery_fee_amount != null ? money(o.delivery_fee_amount) : 0;
  const discount = o?.discount_amount != null ? money(o.discount_amount) : 0;
  const storeFunded = o?.store_funded_amount != null ? money(o.store_funded_amount) : 0;
  const platformFunded = o?.platform_funded_amount != null ? money(o.platform_funded_amount) : 0;

  const netStored = s.net_settlement_amount != null ? money(s.net_settlement_amount) : null;
  const net =
    netStored ??
    computeNetSettlementAmount({
      gross_amount: gross,
      platform_fee_amount: platformFee,
      fixed_fee_amount: fixedFee,
      store_funded_amount: storeFunded,
      refund_amount: refund,
      delivery_income_amount: deliveryIncome,
    });

  const completedAt =
    (typeof o?.completed_at === "string" && o.completed_at) ||
    (String(o?.order_status ?? "") === "completed" && typeof o?.updated_at === "string"
      ? o.updated_at
      : null);

  return {
    settlement_id: s.id,
    order_id: s.order_id,
    order_no: String(o?.order_no ?? "").trim(),
    store_id: s.store_id,
    store_name: opts.storeName ?? "",
    buyer_user_id: o?.buyer_user_id ? String(o.buyer_user_id) : null,
    buyer_display: opts.buyerDisplay ?? null,
    ordered_at: o?.created_at ?? null,
    completed_at: completedAt,
    order_status: o?.order_status ? String(o.order_status) : null,
    payment_status: o?.payment_status ? String(o.payment_status) : null,
    settlement_status: String(s.settlement_status ?? ""),
    settlement_due_date: s.settlement_due_date ?? null,
    settlement_created_at: s.created_at,
    paid_at: s.paid_at ?? null,

    gross_amount: gross,
    confirmed_sale_revenue_php: o
      ? confirmedSaleRevenuePhp({
          payment_amount: o.payment_amount,
          gift_redemption_amount: (o as { gift_redemption_amount?: unknown }).gift_redemption_amount,
          platform_funded_amount: o.platform_funded_amount,
          store_funded_amount: o.store_funded_amount,
          discount_amount: o.discount_amount,
          order_status: o.order_status,
        })
      : gross,
    discount_amount: discount,
    point_amount: 0,
    delivery_fee_amount: deliveryFee,
    payment_amount: paymentAmount,
    store_funded_amount: storeFunded,
    platform_funded_amount: platformFunded,

    commission_base_amount: gross,
    commission_rate: Number(s.platform_fee_percent ?? 0) || 0,
    commission_amount: platformFee,
    fixed_fee_amount: fixedFee,
    delivery_income_amount: deliveryIncome,
    discount_burden_amount: discountBurden,
    commission_reversal_amount: reversal,
    platform_commission_revenue: computePlatformCommissionRevenue({
      platform_fee_amount: platformFee,
      fixed_fee_amount: fixedFee,
      delivery_income_amount: deliveryIncome,
      commission_reversal_amount: reversal,
    }),

    refund_amount: refund,
    net_settlement_amount: net,

    applied_fee_policy_id: s.applied_fee_policy_id ?? null,
    applied_fee_policy_snapshot: snap,
    commission_policy_scope: scope,
    hold_reason: s.hold_reason ?? null,
    payout_method: s.payout_method ?? null,
    payout_reference: s.payout_reference ?? null,
    payout_confirmed_at: s.payout_confirmed_at ?? null,
    payout_note: s.payout_note ?? null,
  };
}

/** Single aggregation authority for Owner + Admin summaries (FIN-04 / FIN-14). */
export function summarizeStoreOrderFinancialFacts(
  facts: StoreOrderFinancialFact[]
): StoreOrderFinancialSummary {
  let gross = 0;
  let discount = 0;
  let point = 0;
  let refund = 0;
  let commissionBase = 0;
  let commissionGross = 0;
  let commissionReversal = 0;
  let platformRevenue = 0;
  let netSettlement = 0;
  let pendingNet = 0;
  let paidNet = 0;
  let cancelledCount = 0;
  let refundedLedgerCount = 0;

  for (const f of facts) {
    gross += f.gross_amount;
    discount += f.discount_amount;
    point += f.point_amount;
    refund += f.refund_amount;
    commissionBase += f.commission_base_amount;
    commissionGross += f.commission_amount + f.fixed_fee_amount + f.delivery_income_amount;
    commissionReversal += f.commission_reversal_amount;
    platformRevenue += f.platform_commission_revenue;
    netSettlement += f.net_settlement_amount;
    const st = f.settlement_status;
    if (st === "paid") paidNet += f.net_settlement_amount;
    else if (st === "scheduled" || st === "processing" || st === "held") pendingNet += f.net_settlement_amount;
    if (st === "cancelled") cancelledCount += 1;
    if (f.refund_amount > 0) refundedLedgerCount += 1;
  }

  return {
    order_count: facts.length,
    gross,
    discount,
    point,
    refund,
    commission_base: commissionBase,
    commission_gross: commissionGross,
    commission_reversal: commissionReversal,
    platform_commission_revenue: platformRevenue,
    net_settlement: netSettlement,
    pending_net: pendingNet,
    paid_net: paidNet,
    cancelled_count: cancelledCount,
    refunded_ledger_count: refundedLedgerCount,
  };
}

export function assertFinancialFactsEqual(
  a: Pick<
    StoreOrderFinancialFact,
    | "gross_amount"
    | "payment_amount"
    | "refund_amount"
    | "commission_base_amount"
    | "commission_rate"
    | "commission_amount"
    | "platform_commission_revenue"
    | "net_settlement_amount"
  >,
  b: typeof a
): { ok: true } | { ok: false; field: string; a: number; b: number } {
  const fields = [
    "gross_amount",
    "payment_amount",
    "refund_amount",
    "commission_base_amount",
    "commission_rate",
    "commission_amount",
    "platform_commission_revenue",
    "net_settlement_amount",
  ] as const;
  for (const field of fields) {
    const av = Number(a[field]) || 0;
    const bv = Number(b[field]) || 0;
    if (av !== bv) return { ok: false, field, a: av, b: bv };
  }
  return { ok: true };
}

export { STORE_ORDER_FINANCIAL_CONTRACT };
