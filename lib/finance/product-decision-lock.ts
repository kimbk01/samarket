/**
 * DIBAY FINANCE × ADS × STORE — PRODUCT DECISION LOCK
 * Authority for AD-P0-1..4 + conversion≠withdrawal. Do not reopen without product re-lock.
 */

/** AD-P0-1: Popup = Admin Direct only. Owner Cash sell path CLOSED. */
export const POPUP_FUNDING_RAIL = "ADMIN_DIRECT" as const;
export const POPUP_SELLABLE = false;
export const OWNER_POPUP_CASH_NEW_SALES_CLOSED = true;

/** AD-P0-2: Normal ad expiry never auto-refunds. */
export const AD_NORMAL_EXPIRY_REFUND = false;

/** Refund/Release only when service was not provided (or hold not captured). */
export const AD_REFUND_ALLOWED_REASONS = [
  "admin_reject",
  "user_cancel_before_capture",
  "hold_release",
  "system_failure_no_service",
  "canonical_policy_failure",
] as const;

export type AdRefundAllowedReason = (typeof AD_REFUND_ALLOWED_REASONS)[number];

/** AD-P0-3: trade_post_ads = legacy read-only. No new member CTA / apply. */
export const TRADE_POST_ADS_NEW_WRITES_ENABLED = false;
export const TRADE_POST_ADS_LEGACY_LABEL = "LEGACY" as const;

/** Funding rails — never unify to a single wallet. */
export const ADS_FUNDING_RAILS = ["MEMBER_POINT", "STORE_CASH", "ADMIN_DIRECT"] as const;
export type AdsFundingRail = (typeof ADS_FUNDING_RAILS)[number];

/** Coin→Cash = 전환. Coin→payout = 출금. Cash withdrawal does not exist. */
export const COIN_TO_CASH_LABEL_KO = "Coin을 Cash로 전환" as const;
export const COIN_WITHDRAWAL_LABEL_KO = "Coin 출금 신청" as const;
export const CASH_WITHDRAWAL_PRODUCT_EXISTS = false;

export function isAdNormalExpiryRefundAllowed(): boolean {
  return AD_NORMAL_EXPIRY_REFUND;
}

export function isTradePostAdsNewWriteAllowed(): boolean {
  return TRADE_POST_ADS_NEW_WRITES_ENABLED;
}
