/**
 * Feed Advertisement placement SSOT.
 * SLOT vs CAMPAIGN SELECTION are separate authorities — do not merge.
 *
 * PRODUCT CONTRACT (2026-08-10 community SSOT connect):
 *   SLOT = FeedAdSlotPolicy gaps ∈ [4,6] (lib/ads/feed-ad-slot-policy.ts)
 *   SELECTION = stable hash + anti-repeat
 *   COMMUNITY ALL (COMMUNITY_HOME surface) pool = HOME + all TOPIC campaigns
 *   COMMUNITY TOPIC pool = matching TOPIC only
 *   One slot → up to 3 distinct campaigns (selectCampaignsForPlacement)
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

export const FEED_AD_SLOT_MAX_CAMPAIGNS = 3;

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
    if (!isFeedAdCampaignEligibleNow(c, nowMs)) return false;
    if (
      c.slides.filter((s) => isProductionReachableFeedAdCreativeUrl(s.imageUrl)).length === 0
    ) {
      return false;
    }
    if (input.placement === "TRADE_CATEGORY") {
      if (c.placement !== "TRADE_CATEGORY") return false;
      const want = (input.categoryId ?? "").trim();
      if (!want) return false;
      return (c.targetCategoryId ?? "").trim() === want;
    }
    if (input.placement === "TRADE_HOME") {
      return c.placement === "TRADE_HOME";
    }
    /**
     * COMMUNITY_HOME surface (= community 「전체」 latest|popular):
     * CASE A — HOME campaigns + all active TOPIC campaigns.
     */
    if (input.placement === "COMMUNITY_HOME") {
      if (c.placement === "COMMUNITY_HOME") return true;
      return c.placement === "COMMUNITY_TOPIC";
    }
    /** Topic feed: matching COMMUNITY_TOPIC only (no cross-topic, no HOME bleed). */
    if (input.placement === "COMMUNITY_TOPIC") {
      if (c.placement !== "COMMUNITY_TOPIC") return false;
      const want = normalizeFeedAdTopicSlug(input.topicSlug ?? "");
      if (!want) return false;
      return normalizeFeedAdTopicSlug(c.targetTopicSlug ?? "") === want;
    }
    return c.placement === input.placement;
  });
  eligible.sort((a, b) => a.id.localeCompare(b.id));
  return eligible;
}

function pickIndex(eligibleLen: number, seed: string): number {
  if (eligibleLen <= 0) return 0;
  return feedAdStableHash(seed) % eligibleLen;
}

function pickDistinctCampaign(
  eligible: FeedAdCampaignView[],
  seed: string,
  avoidIds: ReadonlySet<string>,
  previousId: string | null
): FeedAdCampaignView | null {
  if (eligible.length === 0) return null;
  const idx = pickIndex(eligible.length, seed);
  let picked = eligible[idx] ?? eligible[0] ?? null;
  if (!picked) return null;

  const tryAdvance = (from: FeedAdCampaignView): FeedAdCampaignView => {
    const cur = from;
    let i = eligible.findIndex((c) => c.id === cur.id);
    if (i < 0) i = idx;
    for (let step = 0; step < eligible.length; step += 1) {
      const cand = eligible[(i + step) % eligible.length]!;
      if (avoidIds.has(cand.id)) continue;
      if (previousId && eligible.length > 1 && cand.id === previousId) continue;
      return cand;
    }
    for (let step = 0; step < eligible.length; step += 1) {
      const cand = eligible[(i + step) % eligible.length]!;
      if (!avoidIds.has(cand.id)) return cand;
    }
    return cur;
  };

  if (
    (previousId && eligible.length > 1 && picked.id === previousId) ||
    avoidIds.has(picked.id)
  ) {
    picked = tryAdvance(picked);
  }
  return picked;
}

export type SelectCampaignsInput = {
  domain: FeedAdDomain;
  placement: FeedAdPlacement;
  categoryId?: string | null;
  topicSlug?: string | null;
  nowMs?: number;
  /** Slot ordinal on this surface (0-based). Default 0. */
  slotOrdinal?: number;
  feedSessionId?: string | null;
  viewerSalt?: string | null;
  /** Max distinct campaigns per slot (default 3). */
  maxCampaigns?: number;
};

/**
 * Stable multi-advertiser selection — up to N distinct campaigns per slot.
 * Simulates slots 0..slotOrdinal so any slot resolves independently.
 * Anti-repeat: within slot + vs previous slot's last pick.
 */
export function selectCampaignsForPlacement(
  campaigns: FeedAdCampaignView[],
  input: SelectCampaignsInput
): FeedAdCampaignView[] {
  const nowMs = input.nowMs ?? Date.now();
  const eligible = listEligibleCampaignsForPlacement(campaigns, input);
  if (eligible.length === 0) return [];

  const maxPerSlot = Math.max(
    1,
    Math.min(
      FEED_AD_SLOT_MAX_CAMPAIGNS,
      Math.floor(input.maxCampaigns ?? FEED_AD_SLOT_MAX_CAMPAIGNS),
      eligible.length
    )
  );
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
  let slotPicks: FeedAdCampaignView[] = [];
  for (let o = 0; o <= targetOrd; o += 1) {
    const avoid = new Set<string>();
    const picked: FeedAdCampaignView[] = [];
    for (let item = 0; item < maxPerSlot; item += 1) {
      const cand = pickDistinctCampaign(
        eligible,
        `${surfacePart}|slot|${o}|item|${item}`,
        avoid,
        previousId
      );
      if (!cand) break;
      picked.push(cand);
      avoid.add(cand.id);
      previousId = cand.id;
    }
    slotPicks = picked;
  }
  return slotPicks;
}

/**
 * Stable single-campaign selection (Trade / compat).
 * Community slot UI should prefer selectCampaignsForPlacement (max 3).
 */
export function selectCampaignForPlacement(
  campaigns: FeedAdCampaignView[],
  input: SelectCampaignsInput
): FeedAdCampaignView | null {
  return selectCampaignsForPlacement(campaigns, { ...input, maxCampaigns: 1 })[0] ?? null;
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
