/**
 * Platform Popup CUT 1 — shared types / constants.
 * Geometry / product locks: docs/dibay-global-popup-ad-*-lock.md (CLOSED; do not reopen).
 */

export const PLATFORM_POPUP_DEFAULT_TIMEZONE = "Asia/Manila" as const;

/** First-party Admin create default landing (internal_page). */
export const PLATFORM_POPUP_DEFAULT_INTERNAL_CTA_PATH = "/market" as const;

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

/** Canonical advertising surfaces (Admin/Owner DB SSOT + placement UI). */
export const PLATFORM_POPUP_TARGET_SURFACES = [
  "GLOBAL",
  "COMMUNITY",
  "TRADE",
  "DELIVERY",
  "DELIVERY_OWNER",
  "ADMIN",
  "MYPAGE",
] as const;
export type PlatformPopupTargetSurface = (typeof PLATFORM_POPUP_TARGET_SURFACES)[number];

/**
 * Surfaces where a campaign may show when eligible (GLOBAL expands to these).
 * Critical ops are NOT surfaces — they are runtime gates.
 */
export const PLATFORM_POPUP_CONSUMER_SURFACES = [
  "COMMUNITY",
  "TRADE",
  "DELIVERY",
  "DELIVERY_OWNER",
  "ADMIN",
  "MYPAGE",
] as const;
export type PlatformPopupConsumerSurface = (typeof PLATFORM_POPUP_CONSUMER_SURFACES)[number];

/** Always-excluded (never selectable advertising targets). */
export const PLATFORM_POPUP_EXCLUDED_SURFACES = [
  "MESSENGER",
  "CALL",
  "PAYMENT",
  "ORDER_CRITICAL",
] as const;
export type PlatformPopupExcludedSurface = (typeof PLATFORM_POPUP_EXCLUDED_SURFACES)[number];

/**
 * Legacy resolver label — not a DB/target surface.
 * Compat: map any residual OWNER_OPS meaning → DELIVERY_OWNER.
 */
export const PLATFORM_POPUP_LEGACY_OWNER_OPS_SURFACE = "OWNER_OPS" as const;

export type PlatformPopupResolvedSurface =
  | PlatformPopupConsumerSurface
  | PlatformPopupExcludedSurface
  | typeof PLATFORM_POPUP_LEGACY_OWNER_OPS_SURFACE
  | "UNKNOWN";

export type PlatformPopupActorRole = "owner" | "admin" | "system" | "payment";
