/**
 * Static Feed Banner sample assets — QA/guide only.
 * DO NOT auto-seed into production campaigns.
 */
export const FEED_AD_SAMPLE_ASSET = {
  community: {
    path: "/images/feed-ad-samples/community-banner-example.svg",
    widthPx: 1200,
    heightPx: 400,
    headlineKo: "필리핀 생활에 필요한 정보를 한눈에",
    headlineEn: "Philippines life info at a glance",
  },
  trade: {
    path: "/images/feed-ad-samples/trade-banner-example.svg",
    widthPx: 1200,
    heightPx: 400,
    headlineKo: "우리 동네 상품을 더 많은 사람에게",
    headlineEn: "Reach more neighbors with your listing",
  },
} as const;

export type FeedAdSampleDomain = keyof typeof FEED_AD_SAMPLE_ASSET;
