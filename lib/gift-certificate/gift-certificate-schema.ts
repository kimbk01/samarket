/**
 * G2 physical table / RPC names — must match migration
 * `supabase/migrations/20261127120000_gift_certificate_domain_g2.sql`.
 */

export const GIFT_TABLES = {
  applications: "gift_certificate_applications",
  products: "gift_certificate_products",
  instances: "gift_certificate_instances",
  ownershipEvents: "gift_certificate_ownership_events",
  transfers: "gift_certificate_transfers",
  ledger: "gift_certificate_ledger",
  redemptions: "gift_certificate_redemptions",
  revenueLedger: "gift_certificate_revenue_ledger",
  conversionRequests: "gift_certificate_conversion_requests",
  storeCashAccounts: "store_cash_accounts",
  storeCashLedger: "store_cash_ledger",
  storeCashRecoveryObligations: "store_cash_recovery_obligations",
} as const;

export const GIFT_RPCS = {
  purchase: "gift_certificate_purchase",
  offer: "gift_certificate_offer",
  accept: "gift_certificate_accept",
  reject: "gift_certificate_reject",
  cancel: "gift_certificate_cancel",
  redeem: "gift_certificate_redeem",
  redemptionReverse: "gift_certificate_redemption_reverse",
  refundOrderAtomic: "gift_certificate_refund_order_atomic",
  conversionRequest: "gift_certificate_conversion_request",
  conversionApprove: "gift_certificate_conversion_approve",
  recoveryClear: "store_cash_recovery_clear",
  recognizeRevenueForCompletedOrder: "gift_certificate_recognize_revenue_for_completed_order",
  redemptionIsRecognized: "gift_certificate_redemption_is_recognized",
} as const;

export const GIFT_MIGRATION_ID = "20261127120000_gift_certificate_domain_g2" as const;
export const GIFT_CHECKOUT_REFUND_MIGRATION_ID =
  "20261127140000_gift_certificate_checkout_refund_atomic" as const;
export const GIFT_ORDER_COMPLETION_REVENUE_MIGRATION_ID =
  "20261128140000_gift_certificate_order_completion_revenue" as const;
