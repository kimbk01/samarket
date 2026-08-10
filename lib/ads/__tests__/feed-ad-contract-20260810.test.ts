/**
 * Product contract — community SSOT connect (surface / cadence 4–6 / multi-campaign slot).
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
  selectCampaignsForPlacement,
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
  it("ALL latest|popular + legacy home → COMMUNITY_HOME (same surfaceKey)", () => {
    for (const kind of ["all", "home", "popular"] as const) {
      const s = resolveCommunityFeedSurface("", kind);
      expect(s.placement).toBe("COMMUNITY_HOME");
      expect(s.surfaceKey).toBe("community:all");
      expect(s.topicSlug).toBeUndefined();
    }
  });

  it("TOPIC vs ALL — distinct keys; no local banner", () => {
    const all = resolveCommunityFeedSurface("", "all");
    const topic = resolveCommunityFeedSurface("travel", "topic");
    expect(topic.placement).toBe("COMMUNITY_TOPIC");
    expect(topic.topicSlug).toBe("travel");
    expect(topic.surfaceKey).toBe("community:topic:travel");
    expect(topic.surfaceKey).not.toBe(all.surfaceKey);

    expect(resolveCommunityFeedSurface("", "local")).toMatchObject({
      placement: null,
      surfaceKey: "community:local",
    });
  });

  it("TOPIC unset does not fall back to HOME ads", () => {
    expect(resolveCommunityFeedSurface("", "topic").placement).toBeNull();
    expect(resolveCommunityFeedSurface("recommended", "topic").placement).toBeNull();
  });
});

describe("feedSessionId stability", () => {
  afterEach(() => {
    resetFeedAdSessionMemoryForTests();
  });

  it("same surfaceKey reuses id; different surface gets another", () => {
    const a1 = getOrCreateFeedAdSessionId("community:all");
    const a2 = getOrCreateFeedAdSessionId("community:all");
    const b = getOrCreateFeedAdSessionId("community:topic:travel");
    expect(a1).toBe(a2);
    expect(b).not.toBe(a1);
    expect(getOrCreateFeedAdSessionId("community:all")).toBe(a1);
  });
});

describe("4-6 cadence continuity", () => {
  it("all gaps in [4,6] and early slots stable when length grows", () => {
    expect(FEED_AD_SLOT_GAP_MIN).toBe(4);
    expect(FEED_AD_SLOT_GAP_MAX).toBe(6);
    const seed = feedAdSlotSeed({
      surfaceKey: "community:all",
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

describe("candidate pool + multi-campaign slot", () => {
  const nowMs = 3_600_000 * 7;
  const pool = [
    camp({ id: "HOME1", placement: "COMMUNITY_HOME" }),
    camp({ id: "TA", placement: "COMMUNITY_TOPIC", targetTopicSlug: "food" }),
    camp({ id: "TB", placement: "COMMUNITY_TOPIC", targetTopicSlug: "life" }),
    camp({ id: "TC", placement: "COMMUNITY_TOPIC", targetTopicSlug: "news" }),
    camp({
      id: "DEAD",
      placement: "COMMUNITY_TOPIC",
      targetTopicSlug: "food",
      status: "ended",
    }),
  ];

  it("ALL (COMMUNITY_HOME) eligible = HOME + all TOPIC; excludes ended", () => {
    const elig = listEligibleCampaignsForPlacement(pool, {
      domain: "community",
      placement: "COMMUNITY_HOME",
      nowMs,
    });
    const ids = elig.map((c) => c.id).sort();
    expect(ids).toEqual(["HOME1", "TA", "TB", "TC"]);
  });

  it("TOPIC food = food only; no HOME; no other topic", () => {
    const elig = listEligibleCampaignsForPlacement(pool, {
      domain: "community",
      placement: "COMMUNITY_TOPIC",
      topicSlug: "food",
      nowMs,
    });
    expect(elig.map((c) => c.id)).toEqual(["TA"]);
  });

  it("selectCampaignsForPlacement returns up to 3 distinct", () => {
    const picked = selectCampaignsForPlacement(pool, {
      domain: "community",
      placement: "COMMUNITY_HOME",
      nowMs,
      feedSessionId: "m3",
      slotOrdinal: 0,
    });
    expect(picked.length).toBe(3);
    expect(new Set(picked.map((c) => c.id)).size).toBe(3);
  });

  it("same inputs → same campaigns; empty → []", () => {
    const input = {
      domain: "community" as const,
      placement: "COMMUNITY_HOME" as const,
      nowMs,
      feedSessionId: "stable",
      slotOrdinal: 1,
    };
    expect(selectCampaignsForPlacement(pool, input).map((c) => c.id)).toEqual(
      selectCampaignsForPlacement(pool, input).map((c) => c.id)
    );
    expect(selectCampaignsForPlacement([], input)).toEqual([]);
    expect(selectCampaignForPlacement([], input)).toBeNull();
  });

  it("eligible=1 may repeat across slots; eligible>1 adjacent single picks differ", () => {
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
