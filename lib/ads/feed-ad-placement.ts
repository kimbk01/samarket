/**
 * Feed Advertisement placement SSOT.
 * Slot N is server policy — never hardcode index % N in UI.
 */
export type FeedAdDomain = "trade" | "community";

export type FeedAdPlacement =
  | "TRADE_HOME"
  | "TRADE_CATEGORY"
  | "COMMUNITY_HOME"
  | "COMMUNITY_TOPIC";

export type FeedAdCampaignStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "paused"
  | "ended";

export type FeedAdDestinationType =
  | "trade_listing"
  | "community_post"
  | "store"
  | "internal_page"
  | "external_url";

/** After how many content rows to inject first ad (page 0 only). NOT Karrot copy — DIBAY policy. */
export const FEED_AD_SLOT_AFTER_CONTENT_COUNT = 4;

/**
 * LOCK: slot index is counted on projected feed content rows (NORMAL + PROMOTED_CONTENT).
 * Do not invent blank rows when contentLength < N; do not inject when no campaign.
 */
export function shouldInjectFeedAdAfterContentIndex(
  contentIndex: number,
  contentLength: number,
  hasCampaign: boolean,
  slotAfter = FEED_AD_SLOT_AFTER_CONTENT_COUNT
): boolean {
  if (!hasCampaign) return false;
  if (contentLength < slotAfter) return false;
  return contentIndex === slotAfter - 1;
}

export type FeedAdCreativeSlide = {
  id: string;
  sortOrder: number;
  imageUrl: string;
  altText: string;
  headline: string;
  description: string;
  ctaLabel: string;
  destinationType: FeedAdDestinationType | null;
  destinationId: string;
  destinationUrl: string;
};

export type FeedAdCampaignView = {
  id: string;
  name: string;
  domain: FeedAdDomain;
  placement: FeedAdPlacement;
  targetCategoryId: string | null;
  targetTopicSlug: string | null;
  status: FeedAdCampaignStatus;
  priority: number;
  startAt: string | null;
  endAt: string | null;
  destinationType: FeedAdDestinationType;
  destinationId: string;
  destinationUrl: string;
  slides: FeedAdCreativeSlide[];
};

export function isFeedAdCampaignEligibleNow(
  c: Pick<FeedAdCampaignView, "status" | "startAt" | "endAt">,
  nowMs = Date.now()
): boolean {
  if (c.status !== "active") return false;
  if (c.startAt) {
    const t = Date.parse(c.startAt);
    if (Number.isFinite(t) && t > nowMs) return false;
  }
  if (c.endAt) {
    const t = Date.parse(c.endAt);
    if (Number.isFinite(t) && t < nowMs) return false;
  }
  return true;
}

export function selectCampaignForPlacement(
  campaigns: FeedAdCampaignView[],
  input: {
    domain: FeedAdDomain;
    placement: FeedAdPlacement;
    categoryId?: string | null;
    topicSlug?: string | null;
  }
): FeedAdCampaignView | null {
  const eligible = campaigns.filter((c) => {
    if (c.domain !== input.domain) return false;
    if (c.placement !== input.placement) return false;
    if (!isFeedAdCampaignEligibleNow(c)) return false;
    if (c.slides.filter((s) => s.imageUrl.trim()).length === 0) return false;
    if (input.placement === "TRADE_CATEGORY") {
      const want = (input.categoryId ?? "").trim();
      if (!want) return false;
      return (c.targetCategoryId ?? "").trim() === want;
    }
    if (input.placement === "COMMUNITY_TOPIC") {
      const want = (input.topicSlug ?? "").trim();
      if (!want) return false;
      return (c.targetTopicSlug ?? "").trim() === want;
    }
    return true;
  });
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  // Deterministic rotation by day bucket (no starvation forever on priority-only)
  const bucket = Math.floor(Date.now() / 86_400_000);
  return eligible[bucket % eligible.length] ?? eligible[0] ?? null;
}
