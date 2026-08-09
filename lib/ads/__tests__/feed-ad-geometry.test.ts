import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  FEED_AD_MEDIA_ASPECT_H,
  FEED_AD_MEDIA_ASPECT_W,
  FEED_AD_RECOMMENDED_UPLOAD,
  FEED_AD_RUNTIME_MEDIA_HEIGHT_PX,
  FEED_AD_SLIDE_INTERVAL_MS,
  FEED_AD_STANDARD_UPLOAD_HEIGHT_PX,
  FEED_AD_STANDARD_UPLOAD_WIDTH_PX,
  estimateFeedAdMediaHeightPx,
  feedAdFrameClass,
  feedAdMediaClass,
  feedAdMediaHeightClass,
  feedAdMediaViewportClass,
  feedAdStandardPixelLabel,
  getFeedAdCreativeSpec,
} from "@/lib/ads/feed-ad-geometry";
import {
  feedAdPlacementHumanLabel,
  isFeedAdCommunityTopicTargetAllowed,
  normalizeFeedAdTopicSlug,
  selectCampaignForPlacement,
  type FeedAdCampaignView,
} from "@/lib/ads/feed-ad-placement";
import {
  findCurrentFeedAdBanner,
  isFeedAdDisplayStatusBlockingNewCreate,
} from "@/lib/ads/feed-ad-member-limit";
import { FEED_AD_SAMPLE_ASSET } from "@/lib/ads/feed-ad-sample-assets";

describe("feed ad geometry SSOT — card-rhythm fixed height + cover", () => {
  it("locks source 1200×400 and runtime list-thumb heights (not hero 3:1)", () => {
    expect(FEED_AD_MEDIA_ASPECT_W / FEED_AD_MEDIA_ASPECT_H).toBe(3);
    expect(FEED_AD_STANDARD_UPLOAD_WIDTH_PX).toBe(1200);
    expect(FEED_AD_STANDARD_UPLOAD_HEIGHT_PX).toBe(400);
    expect(feedAdStandardPixelLabel()).toBe("1200 × 400 px");
    expect(FEED_AD_RECOMMENDED_UPLOAD.objectFit).toBe("cover");
    expect(FEED_AD_RECOMMENDED_UPLOAD.safeCrop).toBe("edges");

    expect(FEED_AD_RUNTIME_MEDIA_HEIGHT_PX.community.phone).toBe(72);
    expect(FEED_AD_RUNTIME_MEDIA_HEIGHT_PX.community.md).toBe(88);
    expect(FEED_AD_RUNTIME_MEDIA_HEIGHT_PX.trade.phone).toBe(100);

    expect(feedAdMediaHeightClass("community")).toContain("h-[72px]");
    expect(feedAdMediaHeightClass("trade")).toContain("h-[100px]");
    expect(feedAdMediaClass("trade")).toContain("object-cover");
    expect(feedAdMediaClass("trade")).not.toContain("object-contain");
    expect(feedAdMediaClass("trade")).not.toContain("aspect-[3/1]");
    expect(feedAdMediaViewportClass("community")).toContain("h-[72px]");
    expect(getFeedAdCreativeSpec("trade").pixelLabel).toBe("1200 × 400 px");
    expect(FEED_AD_SLIDE_INTERVAL_MS).toBeGreaterThanOrEqual(3000);
  });

  it("FeedAdBannerCarousel runtime uses cover inside fixed-height viewport", () => {
    const carousel = fs.readFileSync(
      path.join(process.cwd(), "components/ads/FeedAdBannerCarousel.tsx"),
      "utf8"
    );
    expect(carousel).toMatch(/objectFit\s*=\s*["']cover["']/);
    expect(carousel).toContain("SamarketThumbnail");
  });

  it("media height stays list-card sized across widths (no width÷3 hero)", () => {
    expect(estimateFeedAdMediaHeightPx(390, "community", "phone")).toBe(72);
    expect(estimateFeedAdMediaHeightPx(768, "community", "md")).toBe(88);
    expect(estimateFeedAdMediaHeightPx(1024, "trade", "md")).toBe(100);
    expect(estimateFeedAdMediaHeightPx(1200, "trade")).toBeLessThan(150);
  });

  it("trade frame avoids boxed border; community keeps card border", () => {
    expect(feedAdFrameClass("trade")).not.toContain("border-sam-border");
    expect(feedAdFrameClass("community")).toContain("border-sam-border");
  });
});

describe("one member one current banner", () => {
  it("blocks pending/scheduled/active; allows rejected/ended/cancelled", () => {
    expect(isFeedAdDisplayStatusBlockingNewCreate("pending_review")).toBe(true);
    expect(isFeedAdDisplayStatusBlockingNewCreate("scheduled")).toBe(true);
    expect(isFeedAdDisplayStatusBlockingNewCreate("active")).toBe(true);
    expect(isFeedAdDisplayStatusBlockingNewCreate("rejected")).toBe(false);
    expect(isFeedAdDisplayStatusBlockingNewCreate("ended")).toBe(false);
    expect(isFeedAdDisplayStatusBlockingNewCreate("cancelled")).toBe(false);
  });

  it("findCurrentFeedAdBanner uses window for approved/active", () => {
    const now = Date.parse("2026-08-09T12:00:00.000Z");
    expect(
      findCurrentFeedAdBanner([{ id: "p1", status: "pending_review" }], now)?.displayStatus
    ).toBe("pending_review");
    expect(
      findCurrentFeedAdBanner(
        [
          {
            id: "a1",
            status: "approved",
            startAt: "2026-08-01T00:00:00.000Z",
            endAt: "2026-08-20T00:00:00.000Z",
          },
        ],
        now
      )?.requestId
    ).toBe("a1");
    expect(
      findCurrentFeedAdBanner(
        [
          {
            id: "e1",
            status: "approved",
            startAt: "2026-08-01T00:00:00.000Z",
            endAt: "2026-08-08T00:00:00.000Z",
          },
        ],
        now
      )
    ).toBeNull();
  });

  it("POST route guards current_banner_exists before HOLD", () => {
    const route = fs.readFileSync(
      path.join(process.cwd(), "app/api/me/feed-ad-requests/route.ts"),
      "utf8"
    );
    expect(route).toContain("current_banner_exists");
    expect(route).toContain("findCurrentFeedAdBanner");
    expect(route).toContain("FEED_AD_POTENTIALLY_OPEN_REQUEST_STATUSES");
  });
});

describe("multi-advertiser pool selection", () => {
  function slide(id: string): FeedAdCampaignView["slides"][0] {
    return {
      id: `${id}-s1`,
      sortOrder: 1,
      imageUrl: "https://example.com/a.jpg",
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
      status: partial.status ?? "active",
      priority: partial.priority ?? 100,
      targetCategoryId: partial.targetCategoryId ?? null,
      targetTopicSlug: partial.targetTopicSlug ?? null,
      destinationType: partial.destinationType ?? "internal_page",
      destinationId: partial.destinationId ?? "",
      destinationUrl: partial.destinationUrl ?? "/",
      startAt: partial.startAt ?? null,
      endAt: partial.endAt ?? "2099-01-01T00:00:00.000Z",
      source: partial.source ?? "MEMBER_REQUESTED",
      requestId: partial.requestId ?? `req-${partial.id}`,
      slides: partial.slides ?? [slide(partial.id)],
    };
  }

  it("eligible pool keeps A/B/C; day-bucket rotates across members", () => {
    const pool = [
      camp({ id: "A", priority: 1 }),
      camp({ id: "B", priority: 1 }),
      camp({ id: "C", priority: 1 }),
    ];
    const input = {
      domain: "community" as const,
      placement: "COMMUNITY_HOME" as const,
    };
    const day0 = selectCampaignForPlacement(pool, { ...input, nowMs: 0 });
    const day1 = selectCampaignForPlacement(pool, { ...input, nowMs: 86_400_000 });
    const day2 = selectCampaignForPlacement(pool, { ...input, nowMs: 86_400_000 * 2 });
    const ids = new Set([day0?.id, day1?.id, day2?.id]);
    expect(ids.size).toBe(3);
    expect(ids.has("A")).toBe(true);
    expect(ids.has("B")).toBe(true);
    expect(ids.has("C")).toBe(true);
  });
});

describe("feed ad sample assets", () => {
  it("ships community + trade samples at declared 1200×400 paths", () => {
    for (const key of ["community", "trade"] as const) {
      const asset = FEED_AD_SAMPLE_ASSET[key];
      expect(asset.widthPx).toBe(1200);
      expect(asset.heightPx).toBe(400);
      const abs = path.join(process.cwd(), "public", asset.path.replace(/^\//, ""));
      expect(fs.existsSync(abs)).toBe(true);
      const svg = fs.readFileSync(abs, "utf8");
      expect(svg).toContain('width="1200"');
      expect(svg).toContain('height="400"');
    }
  });
});

describe("feed ad placement human labels", () => {
  it("never returns raw TRADE_HOME as primary label", () => {
    expect(feedAdPlacementHumanLabel("TRADE_HOME", "ko")).toBe("거래 홈 피드");
    expect(feedAdPlacementHumanLabel("COMMUNITY_TOPIC", "en")).toContain("topic");
    expect(feedAdPlacementHumanLabel("TRADE_HOME", "ko")).not.toBe("TRADE_HOME");
  });
});

describe("COMMUNITY_TOPIC target contract", () => {
  it("rejects Philife sort-tab slugs that remap to HOME", () => {
    expect(isFeedAdCommunityTopicTargetAllowed("recommended")).toBe(false);
    expect(isFeedAdCommunityTopicTargetAllowed("recommend")).toBe(false);
    expect(isFeedAdCommunityTopicTargetAllowed("popular")).toBe(false);
    expect(isFeedAdCommunityTopicTargetAllowed("")).toBe(false);
  });

  it("allows real content topic slugs", () => {
    expect(isFeedAdCommunityTopicTargetAllowed("travel")).toBe(true);
    expect(isFeedAdCommunityTopicTargetAllowed("phlifee")).toBe(true);
    expect(isFeedAdCommunityTopicTargetAllowed("news")).toBe(true);
  });

  it("locks slug SSOT — normalize + no dual id field on writers", () => {
    expect(normalizeFeedAdTopicSlug(" Travel ")).toBe("travel");
    const reqRoute = fs.readFileSync(
      path.join(process.cwd(), "app/api/me/feed-ad-requests/route.ts"),
      "utf8"
    );
    const approve = fs.readFileSync(
      path.join(process.cwd(), "lib/ads/approve-feed-ad-request.ts"),
      "utf8"
    );
    const carousel = fs.readFileSync(
      path.join(process.cwd(), "components/ads/FeedAdBannerCarousel.tsx"),
      "utf8"
    );
    const feed = fs.readFileSync(
      path.join(process.cwd(), "components/community/CommunityFeed.tsx"),
      "utf8"
    );
    const active = fs.readFileSync(
      path.join(process.cwd(), "app/api/feed-ads/active/route.ts"),
      "utf8"
    );
    expect(reqRoute).toContain("target_topic_slug");
    expect(reqRoute).toContain("normalizeFeedAdTopicSlug");
    expect(reqRoute).not.toMatch(/target_topic_id|targetTopicId/);
    expect(approve).toContain("target_topic_slug: row.target_topic_slug");
    expect(approve).not.toMatch(/target_topic_id|targetTopicId/);
    expect(active).toContain('searchParams.get("topicSlug")');
    expect(carousel).toContain('qs.set("topicSlug", topicSlug)');
    expect(feed).toContain("categoryParamNorm");
    expect(feed).toMatch(/topicSlug=\{[\s\S]*categoryParamNorm/);
  });
});
