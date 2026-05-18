import type { MessageKey } from "@/lib/i18n/messages";
import type { AdApplyStatus, AdType, AdPaymentMethod } from "@/lib/ads/types";

export type PostAdTranslate = (key: MessageKey, params?: Record<string, string | number>) => string;

export const POST_AD_STATUS_KEYS: Record<AdApplyStatus, MessageKey> = {
  draft: "post_ad_status_draft",
  pending_payment: "post_ad_status_pending_payment",
  pending_review: "post_ad_status_pending_review",
  approved: "post_ad_status_approved",
  active: "post_ad_status_active",
  rejected: "post_ad_status_rejected",
  expired: "post_ad_status_expired",
  cancelled: "post_ad_status_cancelled",
};

export const POST_AD_TYPE_KEYS: Record<AdType, MessageKey> = {
  top_fixed: "post_ad_type_top_fixed",
  mid_insert: "post_ad_type_mid_insert",
  highlight: "post_ad_type_highlight",
};

export const POST_AD_PAYMENT_KEYS: Record<AdPaymentMethod, MessageKey> = {
  points: "post_ad_payment_points",
  bank_transfer: "post_ad_payment_bank_transfer",
  manual: "post_ad_payment_manual",
};

export function postAdStatusLabel(t: PostAdTranslate, status: AdApplyStatus): string {
  return t(POST_AD_STATUS_KEYS[status]);
}

export function postAdTypeLabel(t: PostAdTranslate, type: AdType): string {
  return t(POST_AD_TYPE_KEYS[type]);
}

export function postAdPaymentLabel(t: PostAdTranslate, method: AdPaymentMethod): string {
  return t(POST_AD_PAYMENT_KEYS[method]);
}
