import type { MessageKey } from "@/lib/i18n/messages";
import type { ReviewStatus } from "@/lib/types/review";
import type { ReviewRole } from "@/lib/types/review";

export const REVIEW_STATUS_KEYS: Record<ReviewStatus, MessageKey> = {
  visible: "admin_review_status_visible",
  hidden: "admin_review_status_hidden",
  reported: "admin_review_status_reported",
};

export const REVIEW_PUBLIC_TYPE_KEYS: Record<string, MessageKey> = {
  good: "admin_review_public_good",
  normal: "admin_review_public_normal",
  bad: "admin_review_public_bad",
};

export const REVIEW_ROLE_KEYS: Record<ReviewRole, MessageKey> = {
  buyer_to_seller: "admin_review_role_buyer_to_seller",
  seller_to_buyer: "admin_review_role_seller_to_buyer",
};

export const REVIEW_MODERATION_ACTION_KEYS: Record<string, MessageKey> = {
  hide_review: "admin_review_action_hide",
  restore_review: "admin_review_action_restore",
  review_only: "admin_review_action_review_only",
  recalculate_trust: "admin_review_action_recalc_trust",
};
