/**
 * Phase 3 — Promotion Distribution SSOT (orchestration only).
 * Event = CONTENT. Channels = independent existing engines.
 */

export const PROMOTION_DISTRIBUTION_CONTENT_TYPES = ["platform_event"] as const;
export type PromotionDistributionContentType =
  (typeof PROMOTION_DISTRIBUTION_CONTENT_TYPES)[number];

export const PROMOTION_DISTRIBUTION_CHANNELS = [
  "popup",
  "banner",
  "push",
  "bell",
] as const;
export type PromotionDistributionChannel =
  (typeof PROMOTION_DISTRIBUTION_CHANNELS)[number];

export const PROMOTION_DISTRIBUTION_STATUSES = [
  "draft",
  "configured",
  "active",
  "disabled",
] as const;
export type PromotionDistributionStatus =
  (typeof PROMOTION_DISTRIBUTION_STATUSES)[number];

export const PROMOTION_CHANNEL_REF_TYPES = [
  "platform_popup_campaign",
  "feed_ad_campaign",
  "admin_notification_campaign",
] as const;
export type PromotionChannelRefType = (typeof PROMOTION_CHANNEL_REF_TYPES)[number];

export type PromotionDistributionRow = {
  id: string;
  contentType: PromotionDistributionContentType;
  contentId: string;
  channel: PromotionDistributionChannel;
  enabled: boolean;
  status: PromotionDistributionStatus;
  channelRefType: PromotionChannelRefType | null;
  channelRefId: string | null;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PromotionDistributionChannelState = {
  channel: PromotionDistributionChannel;
  enabled: boolean;
  status: PromotionDistributionStatus;
  channelRefType: PromotionChannelRefType | null;
  channelRefId: string | null;
  config: Record<string, unknown>;
};

/** Admin UX independent toggles — never collapse Push+Bell into one boolean. */
export type PromotionDistributionToggleDraft = {
  popup: boolean;
  banner: boolean;
  push: boolean;
  bell: boolean;
};

export type PopupDistributionConfig = {
  surfaces?: string[];
  presentationType?: string;
  frequencyMode?: string;
  startAt?: string | null;
  endAt?: string | null;
  name?: string;
};

export type BannerDistributionConfig = {
  /** Explicit presentation — never inferred from image size or placement alone. */
  presentation?: "INLINE_BANNER" | "HERO_BANNER";
  placement?: string;
  domain?: "trade" | "community";
  imageUrl?: string;
  headline?: string;
  startAt?: string | null;
  endAt?: string | null;
  name?: string;
};

export type PushDistributionConfig = {
  title?: string;
  body?: string;
  imageUrl?: string | null;
  targetType?: string;
  sendMode?: "immediate" | "scheduled";
  scheduledAt?: string | null;
  /** Explicit send is a separate Admin action — never implied by save. */
  lastSendRequestedAt?: string | null;
};

export type BellDistributionConfig = {
  title?: string;
  body?: string;
  imageUrl?: string | null;
  targetType?: string;
};

export function emptyDistributionToggles(): PromotionDistributionToggleDraft {
  return { popup: false, banner: false, push: false, bell: false };
}

export function isPromotionDistributionChannel(
  v: string
): v is PromotionDistributionChannel {
  return (PROMOTION_DISTRIBUTION_CHANNELS as readonly string[]).includes(v);
}
