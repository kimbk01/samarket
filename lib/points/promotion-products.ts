/**
 * Member content Promotion product SSOT (AST-001 D-Point only).
 * CONTRACT: docs/dibay-promotion-advertisement-product-contract.md
 * DO NOT: Business Credit (AST-002), client-trusted prices, placement keys as user CTA.
 */

export const PROMOTION_PRICE_ASSET = "D_POINT" as const;

export type MemberPromotionDomain = "trade";

export type MemberPromotionProductId = "trade_promote_7" | "trade_promote_14";

export type MemberPromotionProduct = {
  id: MemberPromotionProductId;
  domain: MemberPromotionDomain;
  /** Internal ranking policy token — never show raw to users */
  placementPolicy: "feed_boost";
  durationDays: number;
  priceAsset: typeof PROMOTION_PRICE_ASSET;
  pointCost: number;
  sortOrder: number;
  active: boolean;
  /** i18n message keys */
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
    titleKey: "promo_product_trade_7_title",
    descriptionKey: "promo_product_trade_7_desc",
    fallbackTitleKo: "7일 더 알리기",
    fallbackTitleEn: "Promote for 7 days",
    fallbackDescKo:
      "거래 홈과 이 게시물의 카테고리 목록에서 7일간 우선 노출됩니다(하루 최대 상단 노출 슬롯 제한).",
    fallbackDescEn:
      "Priority visibility for 7 days on Trade home and this post’s category feed (capped page-0 pins).",
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
    titleKey: "promo_product_trade_14_title",
    descriptionKey: "promo_product_trade_14_desc",
    fallbackTitleKo: "14일 더 알리기",
    fallbackTitleEn: "Promote for 14 days",
    fallbackDescKo:
      "거래 홈과 이 게시물의 카테고리 목록에서 14일간 우선 노출됩니다(하루 최대 상단 노출 슬롯 제한).",
    fallbackDescEn:
      "Priority visibility for 14 days on Trade home and this post’s category feed (capped page-0 pins).",
  },
];

export function listActiveMemberPromotionProducts(): MemberPromotionProduct[] {
  return PRODUCTS.filter((p) => p.active).sort((a, b) => a.sortOrder - b.sortOrder);
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
  if (placement === "home_top" || placement === "feed_boost") {
    return days >= 14 ? "trade_promote_14" : "trade_promote_7";
  }
  return null;
}
