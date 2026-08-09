/**
 * Feed banner D-Point product + period SSOT — CODE AUTHORITY (PHASE 1 LOCK).
 *
 * Runtime Member/Admin catalog MUST read this module only.
 * DB table `feed_ad_products` is deploy seed + FK target for request.product_id —
 * NOT a second price writer. No Admin product CMS yet → do not cut over to DB reads.
 * Seed values must stay aligned with migration 20261024120000 (asserted in tests).
 *
 * CONTRACT: docs/dibay-paid-exposure-feed-ad-master-contract.md §2
 */

import type { FeedAdDomain } from "@/lib/ads/feed-ad-placement";

export type FeedAdProductId =
  | "feed_banner_trade_3"
  | "feed_banner_trade_7"
  | "feed_banner_community_3"
  | "feed_banner_community_7";

export type FeedAdProduct = {
  id: FeedAdProductId;
  domain: FeedAdDomain;
  durationDays: number;
  pointCost: number;
  titleKo: string;
  titleEn: string;
  sortOrder: number;
  active: boolean;
};

const PRODUCTS: readonly FeedAdProduct[] = [
  {
    id: "feed_banner_trade_3",
    domain: "trade",
    durationDays: 3,
    pointCost: 8000,
    titleKo: "거래 피드 광고 3일",
    titleEn: "Trade feed ad 3 days",
    sortOrder: 10,
    active: true,
  },
  {
    id: "feed_banner_trade_7",
    domain: "trade",
    durationDays: 7,
    pointCost: 15000,
    titleKo: "거래 피드 광고 7일",
    titleEn: "Trade feed ad 7 days",
    sortOrder: 20,
    active: true,
  },
  {
    id: "feed_banner_community_3",
    domain: "community",
    durationDays: 3,
    pointCost: 10000,
    titleKo: "커뮤니티 피드 광고 3일",
    titleEn: "Community feed ad 3 days",
    sortOrder: 30,
    active: true,
  },
  {
    id: "feed_banner_community_7",
    domain: "community",
    durationDays: 7,
    pointCost: 20000,
    titleKo: "커뮤니티 피드 광고 7일",
    titleEn: "Community feed ad 7 days",
    sortOrder: 40,
    active: true,
  },
];

export function listActiveFeedAdProducts(domain?: FeedAdDomain): FeedAdProduct[] {
  return PRODUCTS.filter((p) => p.active && (!domain || p.domain === domain)).sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
}

export function getFeedAdProduct(id: string): FeedAdProduct | null {
  const key = id.trim();
  return PRODUCTS.find((p) => p.id === key && p.active) ?? null;
}
