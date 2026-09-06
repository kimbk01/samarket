/**
 * Human placement labels for Admin / Member / Owner ops UI.
 * Never expose raw inventory keys as primary copy.
 */

export type PlacementLabel = { ko: string; en: string };

const PLACEMENT_LABELS: Record<string, PlacementLabel> = {
  STORES_HOME_HERO: {
    ko: "배달 > 홈 > 상단 배너",
    en: "Delivery > Home > Top banner",
  },
  STORES_HOME_FEED: {
    ko: "배달 > 홈 > 매장 목록",
    en: "Delivery > Home > Store list",
  },
  STORES_CATEGORY_FEED: {
    ko: "배달 > 업종 > 매장 목록",
    en: "Delivery > Category > Store list",
  },
  STORES_HOME_INLINE_1: {
    ko: "배달 > 홈 > 중간 배너",
    en: "Delivery > Home > Inline banner",
  },
  STORES_CATEGORY_TOP: {
    ko: "배달 > 업종 > 상단 배너",
    en: "Delivery > Category > Top banner",
  },
  STORES_SEARCH_TOP: {
    ko: "배달 > 검색 > 상단 배너",
    en: "Delivery > Search > Top banner",
  },
  TRADE_HOME: {
    ko: "거래 > 홈 > 피드 배너",
    en: "Trade > Home > Feed banner",
  },
  TRADE_CATEGORY: {
    ko: "거래 > 카테고리 > 피드 배너",
    en: "Trade > Category > Feed banner",
  },
  COMMUNITY_HOME: {
    ko: "Community > 홈 > 피드 배너",
    en: "Community > Home > Feed banner",
  },
  COMMUNITY_TOPIC: {
    ko: "Community > 주제 > 피드 배너",
    en: "Community > Topic > Feed banner",
  },
  feed_boost: {
    ko: "거래 > 홈·카테고리 > 더 알리기",
    en: "Trade > Home/Category > Promote",
  },
  community_top_pin: {
    ko: "Community > 게시물 목록 > 상위 노출",
    en: "Community > Feed > Top exposure",
  },
  GLOBAL: { ko: "전체 서비스 팝업", en: "All-service popup" },
  COMMUNITY: { ko: "Community 팝업", en: "Community popup" },
  TRADE: { ko: "거래 팝업", en: "Trade popup" },
  DELIVERY: { ko: "배달 팝업", en: "Delivery popup" },
  MYPAGE: { ko: "마이페이지 팝업", en: "My page popup" },
  팝업: { ko: "팝업", en: "Popup" },
  "기존 거래 광고": { ko: "기존 거래 광고", en: "Legacy trade ad" },
};

export function humanPlacementLabel(key: string | null | undefined, ko: boolean): string {
  const raw = String(key ?? "").trim();
  if (!raw) return ko ? "위치 미정" : "Placement TBD";
  const hit = PLACEMENT_LABELS[raw] ?? PLACEMENT_LABELS[raw.toUpperCase()];
  if (hit) return ko ? hit.ko : hit.en;
  // Soften raw keys for ops UI
  if (raw.includes("_")) {
    return raw.replace(/_/g, " ");
  }
  return raw;
}

export function humanBannerSlideLabel(
  placementKey: string,
  slideIndex1Based: number,
  ko: boolean
): string {
  const base = humanPlacementLabel(placementKey, ko);
  return ko ? `${base} > Slide ${slideIndex1Based}` : `${base} > Slide ${slideIndex1Based}`;
}

export function productKindLabel(kind: string, ko: boolean): string {
  const k = kind.toLowerCase();
  if (k.includes("legacy") || k.includes("trade_post") || k === "legacy_trade_post_ad") {
    return ko ? "기존 거래 광고" : "Legacy trade ad";
  }
  if (k.includes("sponsored") || k === "store_promote") {
    return ko ? "매장 상위홍보" : "Store promote";
  }
  if (k.includes("banner") && (k.includes("feed") || k === "feed_ad" || k === "feed_banner")) {
    return ko ? "피드 배너" : "Feed banner";
  }
  if (k.includes("banner") || k === "delivery_banner" || k === "banner_hero") {
    return ko ? "배달 배너" : "Delivery banner";
  }
  if (k.includes("popup")) return ko ? "팝업" : "Popup";
  if (k.includes("community") && (k.includes("boost") || k.includes("promo") || k.includes("promote"))) {
    return ko ? "게시물 상위노출" : "Post top exposure";
  }
  if (k.includes("trade") || k.includes("promote") || k === "boost") {
    return ko ? "거래 더 알리기" : "Trade promote";
  }
  return ko ? "광고" : "Ad";
}
