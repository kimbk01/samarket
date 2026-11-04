// @vitest-environment jsdom
/**
 * PV-3 · D-24 · FB-C17 (2026-11-04) — 피드 배너를 실제로 그려서 확인한다.
 * - 서버 공개 투영(기간·상태·원래 이름 없음)만 받아도 배너가 나온다 → 화면은 기간을 다시 판정하지 않는다
 *   (옛 코드는 `selectCampaignsForPlacement` 가 status/startAt 을 다시 봐서 공개 투영이면 아무것도 안 그렸다)
 * - 커뮤니티도 거래와 같게 광고주 이름 + 「광고」 · 이름이 없으면 「광고」만
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/i18n/AppLanguageProvider", () => {
  const value = {
    language: "ko",
    t: (k: string) => (k === "ui_home_feed_ad_label" ? "광고" : k),
    safeT: (_k: string, o?: { fallbackKo?: string }) => o?.fallbackKo ?? _k,
  };
  return { useI18n: () => value };
});
vi.mock("@/components/common/SamarketThumbnail", () => ({
  SamarketThumbnail: ({ src, alt }: { src: string; alt: string }) => <span data-thumb={src} data-alt={alt} />,
}));
vi.mock("@/components/destination/DestinationLink", () => ({
  DestinationLink: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/lib/ads/feed-ad-event-client", () => ({
  FEED_AD_IMPRESSION_DWELL_MS: 1000,
  FEED_AD_IMPRESSION_MIN_RATIO: 0.5,
  feedAdCreativeIdOfSlide: (id: string) => id,
  sendFeedAdEvent: () => {},
}));
vi.mock("@/lib/platform-promotion-lifecycle/client-record-content-visit", () => ({ recordPromotionContentVisitClient: () => {} }));

import { FeedAdBannerCarousel } from "@/components/ads/FeedAdBannerCarousel";
import type { FeedAdPublicCampaign } from "@/lib/ads/feed-ad-public-projection";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const pub = (id: string, advertiserName: string): FeedAdPublicCampaign => ({
  id,
  placement: "COMMUNITY_HOME",
  advertiserName,
  destinationType: "internal_page",
  destinationId: "",
  destinationUrl: "/philife",
  slides: [
    {
      id: `s-${id}`,
      sortOrder: 1,
      imageUrl: "https://cdn.example.com/a.png",
      altText: "",
      headline: "",
      description: "",
      ctaLabel: "",
      destinationType: null,
      destinationId: "",
      destinationUrl: "",
    },
  ],
});

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("피드 배너 — 서버 공개 투영 그대로 · 커뮤니티 광고주 이름", () => {
  it("커뮤니티: 광고주 이름 + 「광고」 (기간·상태 없는 공개 응답도 그린다)", async () => {
    await act(async () => {
      root.render(
        <ul>
          <FeedAdBannerCarousel domain="community" placement="COMMUNITY_HOME" campaignPool={[pub("c1", "철수네 꽃집")]} />
        </ul>
      );
    });
    const head = container.querySelector("[data-feed-ad-advertiser]");
    expect(head).toBeTruthy();
    expect(container.querySelector("[data-feed-ad-advertiser-name]")?.textContent).toBe("철수네 꽃집");
    expect(head!.textContent).toContain("광고");
  });

  it("이름이 비면 「광고」만", async () => {
    await act(async () => {
      root.render(
        <ul>
          <FeedAdBannerCarousel domain="community" placement="COMMUNITY_HOME" campaignPool={[pub("c1", "")]} />
        </ul>
      );
    });
    expect(container.querySelector("[data-feed-ad-advertiser-name]")).toBeNull();
    expect(container.querySelector("[data-feed-ad-advertiser]")?.textContent).toBe("광고");
  });

  it("거래: 머리 이름 = 서버 advertiserName (원래 name 칸은 쓰지 않는다)", async () => {
    const c = { ...pub("t1", "디베이 마켓"), placement: "TRADE_HOME" as const, name: "Untitled" };
    await act(async () => {
      root.render(
        <ul>
          <FeedAdBannerCarousel domain="trade" placement="TRADE_HOME" campaignPool={[c]} />
        </ul>
      );
    });
    expect(container.textContent).toContain("디베이 마켓");
    expect(container.textContent).not.toContain("Untitled");
  });
});
