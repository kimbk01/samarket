/**
 * Product contract reopen 2026-08-10 — surface / session / cadence / selector.
 * Not a Runtime PASS claim.
 */
import { afterEach, describe, expect, it } from "vitest";
import { resolveCommunityFeedSurface } from "@/lib/community/resolve-community-feed-surface";
import {
  getOrCreateFeedAdSessionId,
  resetFeedAdSessionMemoryForTests,
} from "@/lib/ads/feed-ad-session";
import {
  FEED_AD_SLOT_GAP_MAX,
  FEED_AD_SLOT_GAP_MIN,
  feedAdSlotSeed,
  planFeedAdSlots,
} from "@/lib/ads/feed-ad-slot-policy";
import {
  listEligibleCampaignsForPlacement,
  selectCampaignForPlacement,
  type FeedAdCampaignView,
} from "@/lib/ads/feed-ad-placement";

function slide(id: string): FeedAdCampaignView["slides"][0] {
  return {
    id: `s-${id}`,
    sortOrder: 1,
    imageUrl: "https://cdn.example/a.jpg",
    altText: "",
    headline: "",
    description: "",
    ctaLabel: "",
    destinationType: null,
    destinationId: "",
    destinationUrl: "",
  };
}

function camp(partial: Partial<FeedAdCampaignView> & { id: string }): FeedAdCampaignView {
  return {
    id: partial.id,
    name: partial.name ?? partial.id,
    domain: partial.domain ?? "community",
    placement: partial.placement ?? "COMMUNITY_HOME",
    targetCategoryId: partial.targetCategoryId ?? null,
    targetTopicSlug: partial.targetTopicSlug ?? null,
    status: partial.status ?? "active",
    priority: partial.priority ?? 1,
    startAt: partial.startAt ?? null,
    endAt: partial.endAt ?? "2099-01-01T00:00:00.000Z",
    destinationType: partial.destinationType ?? "internal_page",
    destinationId: partial.destinationId ?? "",
    destinationUrl: partial.destinationUrl ?? "/",
    source: partial.source ?? "MEMBER_REQUESTED",
    requestId: partial.requestId ?? null,
    slides: partial.slides ?? [slide(partial.id)],
  };
}

describe("Community surface SSOT", () => {
  it("HOME vs TOPIC — no cross fallback keys", () => {
    const home = resolveCommunityFeedSurface("");
    expect(home.placement).toBe("COMMUNITY_HOME");
    expect(home.topicSlug).toBeUndefined();
    expect(home.surfaceKey).toBe("community:home");

    const topic = resolveCommunityFeedSurface("travel");
    expect(topic.placement).toBe("COMMUNITY_TOPIC");
    expect(topic.topicSlug).toBe("travel");
    expect(topic.surfaceKey).toBe("community:topic:travel");

    const back = resolveCommunityFeedSurface("");
    expect(back.surfaceKey).toBe(home.surfaceKey);
    expect(back.surfaceKey).not.toBe(topic.surfaceKey);
  });
});

describe("feedSessionId stability", () => {
  afterEach(() => {
    resetFeedAdSessionMemoryForTests();
  });

  it("same surfaceKey reuses id; different surface gets another", () => {
    const a1 = getOrCreateFeedAdSessionId("community:home");
    const a2 = getOrCreateFeedAdSessionId("community:home");
    const b = getOrCreateFeedAdSessionId("community:topic:travel");
    expect(a1).toBe(a2);
    expect(b).not.toBe(a1);
    expect(getOrCreateFeedAdSessionId("community:home")).toBe(a1);
  });
});

describe("6-10 cadence continuity", () => {
  it("all gaps in [6,10] and early slots stable when length grows", () => {
    const seed = feedAdSlotSeed({
      surfaceKey: "community:home",
      feedSessionId: "sess-stable",
    });
    const short = planFeedAdSlots(30, seed);
    const long = planFeedAdSlots(80, seed);
    const shortHits = [...short.injectAfterIndex].sort((a, b) => a - b);
    expect(shortHits.length).toBeGreaterThanOrEqual(2);
    let prev = -1;
    for (const idx of shortHits) {
      expect(idx - prev).toBeGreaterThanOrEqual(FEED_AD_SLOT_GAP_MIN);
      expect(idx - prev).toBeLessThanOrEqual(FEED_AD_SLOT_GAP_MAX);
      expect(long.injectAfterIndex.has(idx)).toBe(true);
      expect(long.slotOrdinalByContentIndex.get(idx)).toBe(
        short.slotOrdinalByContentIndex.get(idx)
      );
      prev = idx;
    }
  });
});

describe("selector + anti-repeat", () => {
  it("same inputs → same campaign; empty pool → null", () => {
    const pool = [
      camp({ id: "A" }),
      camp({ id: "B" }),
      camp({ id: "C" }),
    ];
    const input = {
      domain: "community" as const,
      placement: "COMMUNITY_HOME" as const,
      nowMs: 3_600_000 * 7,
      feedSessionId: "stable",
      slotOrdinal: 2,
    };
    expect(selectCampaignForPlacement(pool, input)?.id).toBe(
      selectCampaignForPlacement(pool, input)?.id
    );
    expect(listEligibleCampaignsForPlacement([], input)).toEqual([]);
    expect(selectCampaignForPlacement([], input)).toBeNull();
  });

  it("eligible=1 may repeat; eligible>1 adjacent slots do not", () => {
    const solo = [camp({ id: "ONLY" })];
    const multi = [camp({ id: "A" }), camp({ id: "B" }), camp({ id: "C" })];
    const base = {
      domain: "community" as const,
      placement: "COMMUNITY_HOME" as const,
      nowMs: 3_600_000 * 9,
      feedSessionId: "ar",
    };
    expect(selectCampaignForPlacement(solo, { ...base, slotOrdinal: 0 })?.id).toBe("ONLY");
    expect(selectCampaignForPlacement(solo, { ...base, slotOrdinal: 1 })?.id).toBe("ONLY");

    for (let o = 1; o < 8; o += 1) {
      const prev = selectCampaignForPlacement(multi, { ...base, slotOrdinal: o - 1 })!;
      const cur = selectCampaignForPlacement(multi, { ...base, slotOrdinal: o })!;
      expect(cur.id).not.toBe(prev.id);
    }
  });
});
