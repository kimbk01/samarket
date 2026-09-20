/**
 * DESTINATION contract (Owner reopen) — not a Channel / Presentation enum.
 *
 * Popup / Banner / Push / Bell → same destination adapter family.
 * Event CMS is a later CUT; interruptive compositions must accept EVENT_DETAIL
 * as a first-class destination without geometry rewrite.
 *
 * Do NOT collapse CHANNEL ∪ PLACEMENT ∪ PRESENTATION ∪ CONTENT ∪ DESTINATION
 * into one enum.
 */

export const PLATFORM_POPUP_DESTINATION_KINDS = [
  "event_detail",
  "store",
  "product",
  "delivery",
  "community_post",
  "trade_listing",
  "internal_route",
  "external_url",
] as const;
export type PlatformPopupDestinationKind = (typeof PLATFORM_POPUP_DESTINATION_KINDS)[number];

/**
 * CONTENT kinds that a promotion presentation may eventually carry.
 * Geometry compositions (A/B/C) must reserve body slots for these.
 */
export const PLATFORM_PROMOTION_CONTENT_KINDS = [
  "promotion",
  "event",
  "coupon",
  "service_notice",
] as const;
export type PlatformPromotionContentKind = (typeof PLATFORM_PROMOTION_CONTENT_KINDS)[number];
