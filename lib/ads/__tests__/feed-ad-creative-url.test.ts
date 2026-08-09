import { describe, expect, it } from "vitest";
import {
  feedAdCreativeUrlRejectReason,
  isProductionReachableFeedAdCreativeUrl,
} from "@/lib/ads/feed-ad-creative-url";
import { selectCampaignForPlacement, type FeedAdCampaignView } from "@/lib/ads/feed-ad-placement";

describe("isProductionReachableFeedAdCreativeUrl", () => {
  it("accepts public https (Supabase/CDN)", () => {
    expect(
      isProductionReachableFeedAdCreativeUrl(
        "https://ckdosyydvgzqwpbwuhon.supabase.co/storage/v1/object/public/post-images/a.jpg"
      )
    ).toBe(true);
    expect(isProductionReachableFeedAdCreativeUrl("https://cdn.example.com/banner.png")).toBe(
      true
    );
  });

  it("rejects localhost / 127.0.0.1 / private LAN / non-https / schemes / samples", () => {
    expect(
      isProductionReachableFeedAdCreativeUrl(
        "http://127.0.0.1:3010/images/feed-ad-samples/community-1200x400.svg"
      )
    ).toBe(false);
    expect(isProductionReachableFeedAdCreativeUrl("http://localhost:3000/x.jpg")).toBe(false);
    expect(isProductionReachableFeedAdCreativeUrl("https://localhost/x.jpg")).toBe(false);
    expect(isProductionReachableFeedAdCreativeUrl("https://192.168.1.2/a.jpg")).toBe(false);
    expect(isProductionReachableFeedAdCreativeUrl("https://10.0.0.5/a.jpg")).toBe(false);
    expect(isProductionReachableFeedAdCreativeUrl("http://cdn.example.com/a.jpg")).toBe(false);
    expect(isProductionReachableFeedAdCreativeUrl("file:///tmp/a.jpg")).toBe(false);
    expect(isProductionReachableFeedAdCreativeUrl("data:image/png;base64,aaa")).toBe(false);
    expect(isProductionReachableFeedAdCreativeUrl("blob:https://samarket.vercel.app/x")).toBe(
      false
    );
    expect(
      isProductionReachableFeedAdCreativeUrl("/images/feed-ad-samples/community-banner-example.svg")
    ).toBe(false);
    expect(
      isProductionReachableFeedAdCreativeUrl(
        "https://samarket.vercel.app/images/feed-ad-samples/community-banner-example.svg"
      )
    ).toBe(false);
    expect(feedAdCreativeUrlRejectReason("http://127.0.0.1/x")).toBe("creative_url_https_required");
  });
});

describe("eligibility excludes invalid creatives from day-bucket pool", () => {
  function camp(
    partial: Partial<FeedAdCampaignView> & { id: string; imageUrl: string }
  ): FeedAdCampaignView {
    return {
      id: partial.id,
      name: partial.name ?? partial.id,
      domain: "community",
      placement: "COMMUNITY_HOME",
      status: "active",
      priority: 100,
      targetCategoryId: null,
      targetTopicSlug: null,
      destinationType: "internal_page",
      destinationId: "",
      destinationUrl: "/",
      startAt: null,
      endAt: "2099-01-01T00:00:00.000Z",
      source: "MEMBER_REQUESTED",
      slides: [
        {
          id: `${partial.id}-s`,
          sortOrder: 1,
          imageUrl: partial.imageUrl,
          altText: "",
          headline: "",
          description: "",
          ctaLabel: "",
          destinationType: null,
          destinationId: "",
          destinationUrl: "",
        },
      ],
    };
  }

  it("selects only production-reachable member creative", () => {
    const pool = [
      camp({
        id: "qa-local",
        imageUrl: "http://127.0.0.1:3010/images/feed-ad-samples/community-1200x400.svg",
      }),
      camp({
        id: "member-ok",
        imageUrl:
          "https://ckdosyydvgzqwpbwuhon.supabase.co/storage/v1/object/public/post-images/ok.jpg",
      }),
    ];
    const picked = selectCampaignForPlacement(pool, {
      domain: "community",
      placement: "COMMUNITY_HOME",
      nowMs: 0,
    });
    expect(picked?.id).toBe("member-ok");
  });

  it("returns null when only invalid creatives exist", () => {
    const pool = [
      camp({
        id: "qa-only",
        imageUrl: "http://127.0.0.1:3010/x.svg",
      }),
    ];
    expect(
      selectCampaignForPlacement(pool, {
        domain: "community",
        placement: "COMMUNITY_HOME",
        nowMs: 0,
      })
    ).toBeNull();
  });
});
