/**
 * Member content Promotion product SSOT (AST-001 Point only).
 * CONTRACT: docs/dibay-paid-exposure-feed-ad-master-contract.md
 * DO NOT: archived store-credit schema (AST-002), client-trusted prices, placement keys as user CTA.
 * Community prices from ad_products plife top_fixed seed (10000/20000) — not Trade copy.
 */

export const PROMOTION_PRICE_ASSET = "D_POINT" as const;

export type MemberPromotionDomain = "trade" | "community";

export type MemberPromotionProductId =
  | "trade_promote_7"
  | "trade_promote_14"
  | "community_promote_3"
  | "community_promote_7";

export type MemberPromotionProduct = {
  id: MemberPromotionProductId;
  domain: MemberPromotionDomain;
  /** Internal ranking policy token — never show raw to users */
  placementPolicy: "feed_boost" | "community_top_pin";
  durationDays: number;
  priceAsset: typeof PROMOTION_PRICE_ASSET;
  pointCost: number;
  sortOrder: number;
  active: boolean;
  /**
   * MASTER CONTRACT LOCK: applicant-paid Boost = HOLD → Admin approve → CAPTURE.
   * true for all active Trade + Community promote SKUs.
   */
  requiresAdminApproval: boolean;
  titleKey: string;
  descriptionKey: string;
  fallbackTitleKo: string;
  fallbackTitleEn: string;
  fallbackDescKo: string;
  fallbackDescEn: string;
};

const PRODUCTS: readonly MemberPromotionProduct[] = [
  {
    id: "trade_promote_7",
    domain: "trade",
    placementPolicy: "feed_boost",
    durationDays: 7,
    priceAsset: PROMOTION_PRICE_ASSET,
    pointCost: 500,
    sortOrder: 10,
    active: true,
    requiresAdminApproval: true,
    titleKey: "promo_product_trade_7_title",
    descriptionKey: "promo_product_trade_7_desc",
    fallbackTitleKo: "7일 더 알리기",
    fallbackTitleEn: "Promote for 7 days",
    fallbackDescKo:
      "관리자 승인 후 거래 홈(전체)과 이 글의 카테고리 목록에 일반 매물처럼 섞여 노출됩니다. 1위 고정이 아니며, 표면당 최대 3개입니다.",
    fallbackDescEn:
      "After admin approval, shown among listings on Trade home and this post’s category feed. Not a guaranteed #1 — up to 3 per surface.",
  },
  {
    id: "trade_promote_14",
    domain: "trade",
    placementPolicy: "feed_boost",
    durationDays: 14,
    priceAsset: PROMOTION_PRICE_ASSET,
    pointCost: 900,
    sortOrder: 20,
    active: true,
    requiresAdminApproval: true,
    titleKey: "promo_product_trade_14_title",
    descriptionKey: "promo_product_trade_14_desc",
    fallbackTitleKo: "14일 더 알리기",
    fallbackTitleEn: "Promote for 14 days",
    fallbackDescKo:
      "관리자 승인 후 거래 홈(전체)과 이 글의 카테고리 목록에 일반 매물처럼 섞여 노출됩니다. 1위 고정이 아니며, 표면당 최대 3개입니다.",
    fallbackDescEn:
      "After admin approval, shown among listings on Trade home and this post’s category feed. Not a guaranteed #1 — up to 3 per surface.",
  },
  {
    id: "community_promote_3",
    domain: "community",
    placementPolicy: "community_top_pin",
    durationDays: 3,
    priceAsset: PROMOTION_PRICE_ASSET,
    pointCost: 10000,
    sortOrder: 30,
    active: true,
    requiresAdminApproval: true,
    titleKey: "promo_product_community_3_title",
    descriptionKey: "promo_product_community_3_desc",
    fallbackTitleKo: "커뮤니티 3일 상위 노출",
    fallbackTitleEn: "Community top exposure · 3 days",
    fallbackDescKo:
      "관리자 승인 후 커뮤니티 피드 상단에 3일간 우선 노출됩니다. 신청 시 Point가 보류(HOLD)되고, 승인 시 결제·거절 시 반환됩니다.",
    fallbackDescEn:
      "After admin approval, priority at top of the community feed for 3 days. Points are held on apply, captured on approve, released on reject.",
  },
  {
    id: "community_promote_7",
    domain: "community",
    placementPolicy: "community_top_pin",
    durationDays: 7,
    priceAsset: PROMOTION_PRICE_ASSET,
    pointCost: 20000,
    sortOrder: 40,
    active: true,
    requiresAdminApproval: true,
    titleKey: "promo_product_community_7_title",
    descriptionKey: "promo_product_community_7_desc",
    fallbackTitleKo: "커뮤니티 7일 상위 노출",
    fallbackTitleEn: "Community top exposure · 7 days",
    fallbackDescKo:
      "관리자 승인 후 커뮤니티 피드 상단에 7일간 우선 노출됩니다. 신청 시 Point가 보류(HOLD)되고, 승인 시 결제·거절 시 반환됩니다.",
    fallbackDescEn:
      "After admin approval, priority at top of the community feed for 7 days. Points are held on apply, captured on approve, released on reject.",
  },
];

export function listActiveMemberPromotionProducts(
  domain?: MemberPromotionDomain
): MemberPromotionProduct[] {
  return PRODUCTS.filter((p) => p.active && (!domain || p.domain === domain)).sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
}

export function getMemberPromotionProduct(
  productId: string
): MemberPromotionProduct | null {
  const id = productId.trim();
  return PRODUCTS.find((p) => p.id === id && p.active) ?? null;
}

/** Legacy placement×days map → new product (compat reads only). */
export function resolveLegacyPromotionProductId(
  placement: string,
  durationDays: number
): MemberPromotionProductId | null {
  const days = Math.floor(Number(durationDays) || 0);
  if (days === 14) return "trade_promote_14";
  if (days === 7) return "trade_promote_7";
  if (days === 3) return "community_promote_3";
  if (placement === "home_top" || placement === "feed_boost") {
    return days >= 14 ? "trade_promote_14" : "trade_promote_7";
  }
  if (placement === "top_fixed") {
    return days >= 7 ? "community_promote_7" : "community_promote_3";
  }
  return null;
}
