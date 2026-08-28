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
  cashOutRequests: "gift_certificate_cash_out_requests",
  storeCashAccounts: "store_cash_accounts",
  storeCashLedger: "store_cash_ledger",
  storeCashRecoveryObligations: "store_cash_recovery_obligations",
  promoObligations: "gift_promo_obligations",
  promoLedger: "gift_promo_ledger",
  adminEvents: "gift_admin_events",
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
  cashOutRequest: "gift_certificate_cash_out_request",
  cashOutCancel: "gift_certificate_cash_out_cancel",
  cashOutReject: "gift_certificate_cash_out_reject",
  cashOutApprove: "gift_certificate_cash_out_approve",
  cashOutMarkPaid: "gift_certificate_cash_out_mark_paid",
  recoveryClear: "store_cash_recovery_clear",
  recognizeRevenueForCompletedOrder: "gift_certificate_recognize_revenue_for_completed_order",
  redemptionIsRecognized: "gift_certificate_redemption_is_recognized",
  redemptionRecognizedNet: "gift_certificate_redemption_recognized_net",
  correctLegacyRecognition: "gift_certificate_correct_legacy_recognition",
  promoAccrueForInstance: "gift_certificate_promo_accrue_for_instance",
  promoRecognizeForRedemption: "gift_certificate_promo_recognize_for_redemption",
  promoReverseForRedemption: "gift_certificate_promo_reverse_for_redemption",
  promoSettle: "gift_certificate_promo_settle",
  instanceSuspend: "gift_certificate_instance_suspend",
  instanceResume: "gift_certificate_instance_resume",
  instanceAdjustValidity: "gift_certificate_instance_adjust_validity",
} as const;

export const GIFT_MIGRATION_ID = "20261127120000_gift_certificate_domain_g2" as const;
export const GIFT_CHECKOUT_REFUND_MIGRATION_ID =
  "20261127140000_gift_certificate_checkout_refund_atomic" as const;
export const GIFT_ORDER_COMPLETION_REVENUE_MIGRATION_ID =
  "20261128140000_gift_certificate_order_completion_revenue" as const;
export const GIFT_RECOGNITION_CORRECTION_MIGRATION_ID =
  "20261128150000_gift_certificate_recognition_correction" as const;
export const GIFT_PUBLIC_NUMBER_MIGRATION_ID =
  "20261128160000_gift_certificate_public_number" as const;
export const GIFT_INSTANCE_VALIDITY_MIGRATION_ID =
  "20261128200000_gift_certificate_instance_validity" as const;
export const GIFT_CASH_OUT_MIGRATION_ID =
  "20261128170000_gift_certificate_cash_out" as const;
export const GIFT_SCOPE_PLATFORM_MIGRATION_ID =
  "20261128180000_gift_certificate_scope_platform" as const;
export const GIFT_PROMO_ECONOMICS_MIGRATION_ID =
  "20261128190000_gift_certificate_promo_economics" as const;
export const GIFT_FINANCIAL_SNAPSHOT_MIGRATION_ID =
  "20261129150000_gift_certificate_redeem_instance_fee_snapshot" as const;
export const GIFT_MALL_VISIBLE_MIGRATION_ID =
  "20261129205000_gift_certificate_product_mall_visible" as const;
export const GIFT_ADMIN_EVENTS_MIGRATION_ID =
  "20261129210000_gift_admin_events" as const;
export const GIFT_INSTANCE_CORRECTIVE_MIGRATION_ID =
  "20261129220000_gift_certificate_instance_corrective_rpcs" as const;
