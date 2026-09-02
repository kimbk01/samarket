/**
 * Platform Popup CUT 1 — shared types / constants.
 * Geometry / product locks: docs/dibay-global-popup-ad-*-lock.md (CLOSED; do not reopen).
 */

export const PLATFORM_POPUP_DEFAULT_TIMEZONE = "Asia/Manila" as const;

export const PLATFORM_POPUP_CREATIVE_ASPECT = { w: 36, h: 25 } as const;

export const PLATFORM_POPUP_CAMPAIGN_STATUSES = [
  "draft",
  "pending_review",
  "approved",
  "scheduled",
  "active",
  "paused",
  "ended",
  "rejected",
] as const;
export type PlatformPopupCampaignStatus = (typeof PLATFORM_POPUP_CAMPAIGN_STATUSES)[number];

export const PLATFORM_POPUP_APPROVAL_STATUSES = [
  "not_submitted",
  "pending_review",
  "approved",
  "rejected",
] as const;
export type PlatformPopupApprovalStatus = (typeof PLATFORM_POPUP_APPROVAL_STATUSES)[number];

export const PLATFORM_POPUP_SUPPRESSION_MODES = [
  "CLOSE",
  "SESSION",
  "TODAY",
  "DURATION",
  "CAMPAIGN",
] as const;
export type PlatformPopupSuppressionMode = (typeof PLATFORM_POPUP_SUPPRESSION_MODES)[number];

export const PLATFORM_POPUP_CTA_TYPES = [
  "trade_listing",
  "community_post",
  "store",
  "internal_page",
  "external_url",
] as const;
export type PlatformPopupCtaType = (typeof PLATFORM_POPUP_CTA_TYPES)[number];

export const PLATFORM_POPUP_EVENT_TYPES = [
  "eligible",
  "impression",
  "click",
  "dismiss",
  "suppress",
  "landing_success",
  "landing_failure",
] as const;
export type PlatformPopupEventType = (typeof PLATFORM_POPUP_EVENT_TYPES)[number];

/** Canonical advertising surfaces (Admin DB SSOT). */
export const PLATFORM_POPUP_TARGET_SURFACES = [
  "GLOBAL",
  "COMMUNITY",
  "TRADE",
  "DELIVERY",
  "MYPAGE",
] as const;
export type PlatformPopupTargetSurface = (typeof PLATFORM_POPUP_TARGET_SURFACES)[number];

/** Consumer-resolved surfaces (GLOBAL expands to these four). */
export const PLATFORM_POPUP_CONSUMER_SURFACES = [
  "COMMUNITY",
  "TRADE",
  "DELIVERY",
  "MYPAGE",
] as const;
export type PlatformPopupConsumerSurface = (typeof PLATFORM_POPUP_CONSUMER_SURFACES)[number];

export const PLATFORM_POPUP_EXCLUDED_SURFACES = [
  "MESSENGER",
  "CALL",
  "ADMIN",
  "OWNER_OPS",
  "PAYMENT",
  "ORDER_CRITICAL",
] as const;
export type PlatformPopupExcludedSurface = (typeof PLATFORM_POPUP_EXCLUDED_SURFACES)[number];

export type PlatformPopupResolvedSurface =
  | PlatformPopupConsumerSurface
  | PlatformPopupExcludedSurface
  | "UNKNOWN";

export type PlatformPopupActorRole = "owner" | "admin" | "system" | "payment";
