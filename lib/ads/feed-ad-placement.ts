/**
 * Feed Advertisement placement SSOT.
 * SLOT vs CAMPAIGN SELECTION are separate authorities — do not merge.
 *
 * PRODUCT CONTRACT (2026-08-10 reopen):
 *   SLOT = FeedAdSlotPolicy gaps ∈ [6,10] (lib/ads/feed-ad-slot-policy.ts)
 *   SELECTION = stable hash + anti-repeat (selectCampaignForPlacement)
 * DO NOT use Math.random(). DO NOT day-bucket-only permanent winner.
 */

import { isProductionReachableFeedAdCreativeUrl } from "@/lib/ads/feed-ad-creative-url";
import { feedAdStableHash } from "@/lib/ads/feed-ad-slot-policy";
import { isPhilifeNeighborhoodSortSlotSlug } from "@/lib/neighborhood/philife-topic-slug-rules";

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

import {
  FEED_AD_SLOT_AFTER_CONTENT_COUNT,
  planFeedAdSlots,
  shouldInjectFeedAdAtContentIndex,
  feedAdSlotSeed,
} from "@/lib/ads/feed-ad-slot-policy";

/** Re-export for callers that imported slot constant from this module. */
export { FEED_AD_SLOT_AFTER_CONTENT_COUNT };

/**
 * @deprecated Prefer planFeedAdSlots + shouldInjectFeedAdAtContentIndex.
 * Legacy helper: injects only at the first planned gap (deterministic ≥6).
 */
export function shouldInjectFeedAdAfterContentIndex(
  contentIndex: number,
  contentLength: number,
  hasCampaign: boolean,
  _slotAfter = FEED_AD_SLOT_AFTER_CONTENT_COUNT
): boolean {
  if (!hasCampaign) return false;
  const plan = planFeedAdSlots(contentLength, "legacy-single-slot");
  return shouldInjectFeedAdAtContentIndex(contentIndex, plan);
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
  /** ADMIN_DIRECT | MEMBER_REQUESTED */
  source?: "ADMIN_DIRECT" | "MEMBER_REQUESTED";
  requestId?: string | null;
  slides: FeedAdCreativeSlide[];
};

/**
 * RESOLVER-ONLY time eligibility.
 * Eligible iff status=active AND (no start or start<=now) AND (no end or end>now).
 */
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
    if (Number.isFinite(t) && t <= nowMs) return false;
  }
  return true;
}

export function listEligibleCampaignsForPlacement(
  campaigns: FeedAdCampaignView[],
  input: {
    domain: FeedAdDomain;
    placement: FeedAdPlacement;
    categoryId?: string | null;
    topicSlug?: string | null;
    nowMs?: number;
  }
): FeedAdCampaignView[] {
  const nowMs = input.nowMs ?? Date.now();
  const eligible = campaigns.filter((c) => {
    if (c.domain !== input.domain) return false;
    if (c.placement !== input.placement) return false;
    if (!isFeedAdCampaignEligibleNow(c, nowMs)) return false;
    if (
      c.slides.filter((s) => isProductionReachableFeedAdCreativeUrl(s.imageUrl)).length === 0
    ) {
      return false;
    }
    if (input.placement === "TRADE_CATEGORY") {
      const want = (input.categoryId ?? "").trim();
      if (!want) return false;
      return (c.targetCategoryId ?? "").trim() === want;
    }
    if (input.placement === "COMMUNITY_TOPIC") {
      const want = normalizeFeedAdTopicSlug(input.topicSlug ?? "");
      if (!want) return false;
      return normalizeFeedAdTopicSlug(c.targetTopicSlug ?? "") === want;
    }
    return true;
  });
  eligible.sort((a, b) => a.id.localeCompare(b.id));
  return eligible;
}

function pickIndex(eligibleLen: number, seed: string): number {
  if (eligibleLen <= 0) return 0;
  return feedAdStableHash(seed) % eligibleLen;
}

/**
 * Stable multi-advertiser selection + anti-repeat.
 * Simulates slots 0..slotOrdinal so any slot can be resolved independently
 * (no mutable global queue, no DB write).
 */
export function selectCampaignForPlacement(
  campaigns: FeedAdCampaignView[],
  input: {
    domain: FeedAdDomain;
    placement: FeedAdPlacement;
    categoryId?: string | null;
    topicSlug?: string | null;
    nowMs?: number;
    /** Slot ordinal on this surface (0-based). Default 0. */
    slotOrdinal?: number;
    feedSessionId?: string | null;
    viewerSalt?: string | null;
  }
): FeedAdCampaignView | null {
  const nowMs = input.nowMs ?? Date.now();
  const eligible = listEligibleCampaignsForPlacement(campaigns, input);
  if (eligible.length === 0) return null;

  const targetOrd = Math.max(0, Math.floor(input.slotOrdinal ?? 0));
  const hourBucket = Math.floor(nowMs / 3_600_000);
  const surfacePart = [
    input.domain,
    input.placement,
    (input.categoryId ?? "").trim(),
    normalizeFeedAdTopicSlug(input.topicSlug ?? ""),
    (input.feedSessionId ?? "").trim(),
    (input.viewerSalt ?? "").trim(),
    String(hourBucket),
  ].join("|");

  let previousId: string | null = null;
  let picked: FeedAdCampaignView | null = null;
  for (let o = 0; o <= targetOrd; o += 1) {
    let idx = pickIndex(eligible.length, `${surfacePart}|slot|${o}`);
    picked = eligible[idx] ?? eligible[0] ?? null;
    if (
      previousId &&
      eligible.length > 1 &&
      picked &&
      picked.id === previousId
    ) {
      idx = (idx + 1) % eligible.length;
      picked = eligible[idx] ?? picked;
    }
    previousId = picked?.id ?? null;
  }
  return picked;
}

/** Admin/consumer-facing placement label — never expose TRADE_HOME raw codes as primary UI. */
export function feedAdPlacementHumanLabel(
  placement: FeedAdPlacement,
  lang: "ko" | "en" = "ko"
): string {
  const ko: Record<FeedAdPlacement, string> = {
    TRADE_HOME: "거래 홈 피드",
    TRADE_CATEGORY: "거래 카테고리 피드",
    COMMUNITY_HOME: "커뮤니티 홈 피드",
    COMMUNITY_TOPIC: "커뮤니티 주제 피드",
  };
  const en: Record<FeedAdPlacement, string> = {
    TRADE_HOME: "Trade home feed",
    TRADE_CATEGORY: "Trade category feed",
    COMMUNITY_HOME: "Community home feed",
    COMMUNITY_TOPIC: "Community topic feed",
  };
  return (lang === "en" ? en : ko)[placement];
}

/**
 * COMMUNITY_TOPIC authority SSOT = Philife topic **slug** (string).
 */
export function normalizeFeedAdTopicSlug(slug: string): string {
  return String(slug ?? "").trim().toLowerCase();
}

export function isFeedAdCommunityTopicTargetAllowed(slug: string): boolean {
  const s = normalizeFeedAdTopicSlug(slug);
  if (!s) return false;
  return !isPhilifeNeighborhoodSortSlotSlug(s);
}

export { feedAdSlotSeed, planFeedAdSlots, shouldInjectFeedAdAtContentIndex };
