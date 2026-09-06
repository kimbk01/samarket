/**
 * Feed Banner capacity boundary — FINAL LOCK.
 *
 * Feed does NOT share Delivery HERO capacity=5.
 * Finite sell-out by placement+window is NOT implemented for Feed.
 * Apply gate authority = member one-current banner limit only.
 * Runtime slot selection cap (FEED_AD_SLOT_MAX_CAMPAIGNS=3) is display selection, not apply inventory.
 */

export {
  FEED_AD_CURRENT_BANNER_BLOCKING_DISPLAY,
  findCurrentFeedAdBanner,
  isFeedAdDisplayStatusBlockingNewCreate,
} from "@/lib/ads/feed-ad-member-limit";

export const FEED_BANNER_CAPACITY_AUTHORITY = {
  kind: "MEMBER_ONE_CURRENT" as const,
  sharesDeliveryHeroPool: false,
  placementWindowSellOutGate: false,
} as const;
