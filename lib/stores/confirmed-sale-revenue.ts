/**
 * CUT A/C HARD LOCK — canonical confirmed store sale revenue (PHP integer).
 * NOT list price. NOT net after platform fee. NOT payment + discount_amount wholesale.
 */
import { STORE_ORDER_FINANCIAL_CONTRACT } from "@/lib/stores/store-order-financial-contract";

export type ConfirmedSaleRevenueOrderSnapshot = {
  payment_amount?: unknown;
  gift_redemption_amount?: unknown;
  platform_funded_amount?: unknown;
  store_funded_amount?: unknown;
  discount_amount?: unknown;
  order_status?: string | null;
  /** Full-refund product only — partial not supported. */
  refund_amount?: unknown;
};

function money(n: unknown): number {
  const v = Math.trunc(Number(n) || 0);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

/**
 * Store-attributed confirmed sale revenue at order completed.
 *
 * ```text
 * confirmed_sale_revenue_php =
 *   payment_amount
 *   + gift_redemption_amount
 *   + platform_funded_amount
 *   - refund_attributed_reversal
 * ```
 *
 * store_funded_amount / discount_amount are funding rails — never add discount_amount wholesale.
 */
export function confirmedSaleRevenuePhp(order: ConfirmedSaleRevenueOrderSnapshot): number {
  const status = String(order.order_status ?? "").trim();
  if (status === "refunded" || status === "cancelled") return 0;

  const payment = money(order.payment_amount);
  const gift = money(order.gift_redemption_amount);
  const platform = money(order.platform_funded_amount);
  const refund = money(order.refund_amount);

  return Math.max(0, payment + gift + platform - refund);
}

/** Canonical Coin mint idempotency — one credit per completed order. */
export function saleCoinIdempotencyKeyForOrder(orderId: string): string {
  const oid = orderId.trim();
  if (!oid) throw new Error("missing_order_id");
  return `sale_coin:${oid}`;
}

export function saleFeeIdempotencyKeyForOrder(orderId: string): string {
  const oid = orderId.trim();
  if (!oid) throw new Error("missing_order_id");
  return `sale_fee:order:${oid}`;
}

/** Idempotency for refund-time sale fee reversal/release. */
export function saleFeeReversalIdempotencyKeyForOrder(orderId: string): string {
  const oid = orderId.trim();
  if (!oid) throw new Error("missing_order_id");
  return `sale_fee_reversal:order:${oid}`;
}

/** Document anchor for verify gates. */
export const CONFIRMED_SALE_REVENUE_CONTRACT = {
  formula:
    "payment_amount + gift_redemption_amount + platform_funded_amount - refund_attributed_reversal",
  partialRefundSupported: STORE_ORDER_FINANCIAL_CONTRACT.partialRefundSupported,
  forbiddenWholesaleAdd: "discount_amount",
  coinMintIdentity: "sale_coin:{orderId}",
  forbiddenSecondMint: "gift_coin:{redemptionId}",
} as const;
