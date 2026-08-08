/**
 * CONTRACT — DIBAY Delivery Order Financial definitions (SSOT) — PRODUCT LOCK.
 *
 * Checkout (`validateStoreOrderCheckout` → `createStoreOrderAtomic`):
 *   item_gross     = Σ store_order_items.subtotal
 *   delivery_fee   = store_orders.delivery_fee_amount
 *   discount       = NOT_SUPPORTED (create always writes discount_amount=0)
 *   coupon         = NOT_SUPPORTED on store checkout
 *   customer_dpoint= NOT_SUPPORTED on store checkout
 *   payment_amount = item_gross + delivery_fee
 *
 * Commission recognition (order_status → completed):
 *   commission_base = store_orders.payment_amount (includes delivery_fee)
 *   platform_fee_amount = floor(commission_base * fee_percent / 100)
 *   Rounding: integer PHP, Math.floor percent — canonical calculator only
 *
 * Refund product path:
 *   FULL REFUND ONLY (order_status → refunded)
 *   PARTIAL REFUND = NOT_SUPPORTED (product/API must reject)
 *   Reversal consumes settlement snapshot fees (never re-resolves policy)
 *
 * Period axes (must not be conflated):
 *   Sales period      = order completion recognition time
 *                       (proxy: store_orders.updated_at when order_status=completed,
 *                        or settlement.created_at as ledger recognition clock)
 *   Settlement period = store_settlements.created_at (ledger row creation / recognition)
 *   Payout period     = store_settlements.paid_at
 *   Refund period     = store_orders.refunded_at when present, else settlement refund note time
 *   Timezone          = UTC for API day bounds (isoDayStartUtc/isoDayEndUtc)
 *
 * Platform revenue components (do not equate Owner fee line to “all platform income” blindly):
 *   platform_commission_revenue =
 *     platform_fee_amount + fixed_fee_amount + delivery_income_amount
 *     - commission_reversal_amount
 */
export const STORE_ORDER_FINANCIAL_CONTRACT = {
  commissionBaseField: "store_orders.payment_amount",
  commissionBaseIncludesDeliveryFee: true,
  customerCouponSupported: false as const,
  customerDPointSupported: false as const,
  storeCheckoutDiscountSupported: false as const,
  discountAtCreateAlwaysZero: true,
  roundingRule: "floor_percent_of_integer_php" as const,
  recognitionStatus: "completed" as const,
  /** Settlement list / Owner·Admin settlement filters default axis */
  settlementPeriodField: "store_settlements.created_at" as const,
  salesPeriodField: "order_completed_recognition" as const,
  payoutPeriodField: "store_settlements.paid_at" as const,
  refundPeriodField: "store_orders.refunded_at" as const,
  timezone: "UTC" as const,
  /** PRODUCT LOCK — Delivery supports full refund only */
  partialRefundSupported: false as const,
  partialRefundProductPath: false as const,
} as const;

export type StoreOrderFinancialLifecycleState =
  | "pending"
  | "accepted"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "completed"
  | "cancelled"
  | "refund_requested"
  | "refunded";

/** Code-evidence lifecycle money recognition (not aspirational). */
export const STORE_ORDER_FINANCIAL_LIFECYCLE: Record<
  string,
  { salesRecognized: boolean; commissionRecognized: boolean; settlementEligible: boolean }
> = {
  pending: { salesRecognized: false, commissionRecognized: false, settlementEligible: false },
  accepted: { salesRecognized: false, commissionRecognized: false, settlementEligible: false },
  preparing: { salesRecognized: false, commissionRecognized: false, settlementEligible: false },
  ready: { salesRecognized: false, commissionRecognized: false, settlementEligible: false },
  out_for_delivery: { salesRecognized: false, commissionRecognized: false, settlementEligible: false },
  completed: { salesRecognized: true, commissionRecognized: true, settlementEligible: true },
  cancelled: { salesRecognized: false, commissionRecognized: false, settlementEligible: false },
  refund_requested: { salesRecognized: true, commissionRecognized: true, settlementEligible: true },
  refunded: { salesRecognized: false, commissionRecognized: false, settlementEligible: false },
};
