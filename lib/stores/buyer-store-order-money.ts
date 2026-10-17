/**
 * Buyer (주문자) view of a store order's money — SSOT for what the customer sees.
 *
 * The customer sees only customer-facing payment facts (store_orders, lib/stores/store-order-financial-contract.ts):
 *   - payment_amount          what the customer pays with buyer_payment_method (COD / GCash / transfer…)
 *   - gift_redemption_amount  gift certificate applied (shown as its own line)
 *   - discount_amount         coupon discount shown on the receipt
 *   - payment_status / order_status   customer refund = payment_status 'refunded'
 * Store-internal money (commission, Cash, outstanding, fee refunds, coupon funding split, merchant
 * revenue) and admin-only fields are never sent to the buyer. A store's commission refund
 * (수수료 환급, store_commission_adjustments) is a separate event from the customer refund.
 */

/** store_orders columns that must never reach the buyer API (list + detail). */
export const BUYER_HIDDEN_STORE_ORDER_FIELDS = [
  "admin_note",
  "admin_flagged",
  "dispute_status",
  "commission_base_amount",
  "store_funded_amount",
  "platform_funded_amount",
  "funding_mode",
  "merchant_revenue_amount",
] as const;

const HIDDEN: ReadonlySet<string> = new Set(BUYER_HIDDEN_STORE_ORDER_FIELDS);

/** Returns a copy of the order row without store-internal / admin-only fields. */
export function stripStoreInternalOrderFields<T extends Record<string, unknown>>(order: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(order)) if (!HIDDEN.has(k)) out[k] = v;
  return out as T;
}

/** What the customer actually pays with their payment method (same number as the detail "총액"). */
export function buyerPaidAmountPhp(order: { payment_amount?: unknown }): number {
  const n = Number(order.payment_amount);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}
