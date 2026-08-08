import { describe, expect, it } from "vitest";
import {
  FEED_AD_MEDIA_ASPECT_CLASS,
  FEED_AD_MEDIA_ASPECT_H,
  FEED_AD_MEDIA_ASPECT_W,
  estimateFeedAdMediaHeightCappedPx,
  estimateFeedAdMediaHeightPx,
  feedAdFrameClass,
  feedAdMediaClass,
  feedAdMediaMaxHClass,
  feedAdMediaMaxHPx,
} from "@/lib/ads/feed-ad-geometry";
import { feedAdPlacementHumanLabel } from "@/lib/ads/feed-ad-placement";

describe("feed ad geometry SSOT", () => {
  it("uses wide compact strip with density max-h (not legacy 12:5 hero family)", () => {
    expect(FEED_AD_MEDIA_ASPECT_W / FEED_AD_MEDIA_ASPECT_H).toBeGreaterThanOrEqual(2.5);
    expect(FEED_AD_MEDIA_ASPECT_CLASS).toBe("aspect-[3/1]");
    expect(FEED_AD_MEDIA_ASPECT_CLASS).not.toContain("12/5");
    expect(feedAdMediaMaxHClass("trade")).toContain("max-h-[88px]");
    expect(feedAdMediaMaxHClass("community")).toContain("max-h-[96px]");
    expect(feedAdMediaClass("trade")).toContain("aspect-[3/1]");
    expect(feedAdMediaClass("community")).toContain("max-h-[96px]");
  });

  it("trade media cap stays near trade thumb family (~96)", () => {
    expect(feedAdMediaMaxHPx("trade", "phone")).toBe(88);
    expect(feedAdMediaMaxHPx("trade", "md")).toBe(96);
    const h = estimateFeedAdMediaHeightCappedPx(328, feedAdMediaMaxHPx("trade", "phone"));
    expect(h).toBeLessThanOrEqual(88);
  });

  it("community media cap is light-split above trade", () => {
    expect(feedAdMediaMaxHPx("community", "phone")).toBeGreaterThan(
      feedAdMediaMaxHPx("trade", "phone")
    );
    expect(feedAdMediaMaxHPx("community", "md")).toBe(104);
  });

  it("trade frame avoids boxed border; community keeps card border", () => {
    expect(feedAdFrameClass("trade")).not.toContain("border-sam-border");
    expect(feedAdFrameClass("community")).toContain("border-sam-border");
  });

  it("uncapped aspect estimate is landscape", () => {
    const h = estimateFeedAdMediaHeightPx(360);
    expect(h).toBe(120);
  });
});

describe("feed ad placement human labels", () => {
  it("never returns raw TRADE_HOME as primary label", () => {
    expect(feedAdPlacementHumanLabel("TRADE_HOME", "ko")).toBe("거래 홈 피드");
    expect(feedAdPlacementHumanLabel("COMMUNITY_TOPIC", "en")).toContain("topic");
    expect(feedAdPlacementHumanLabel("TRADE_HOME", "ko")).not.toBe("TRADE_HOME");
  });
});
