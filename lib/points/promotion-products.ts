/**
 * Member content Promotion product SSOT (AST-001 Point only).
 * CONTRACT: docs/dibay-paid-exposure-feed-ad-master-contract.md
 * OWNER POLICY LOCK: Community/Trade Boost = Point pay → immediate active (no admin approval).
 * DO NOT: archived store-credit schema (AST-002), client-trusted prices, placement keys as user CTA.
 */

export const PROMOTION_PRICE_ASSET = "D_POINT" as const;

export type MemberPromotionDomain = "trade" | "community";

export type MemberPromotionProductId =
  | "trade_promote_3"
  | "trade_promote_7"
  | "trade_promote_14"
  | "community_promote_3"
  | "community_promote_7"
  | "community_promote_14";

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
   * OWNER POLICY LOCK: false for all active Trade + Community promote SKUs.
   * Point payment → immediate ACTIVE; Admin is post-hoc sanction only.
   */
  requiresAdminApproval: boolean;
  /* 이름·설명은 여기 두지 않는다 — 이름 `promotion-product-title.ts`(키 + DB 기간), 노출 설명 `trade_ad_where_boost`·`promo_sheet_where_community` (TB-02) */
};

const PRODUCTS: readonly MemberPromotionProduct[] = [
  /** 금액 권장안 (Owner 「적용 승인」 2026-11-27 · docs/audit/ad-price-recommendation-apply-design-2026-11-27.md) — 3일 새 상품 */
  {
    id: "trade_promote_3",
    domain: "trade",
    placementPolicy: "feed_boost",
    durationDays: 3,
    priceAsset: PROMOTION_PRICE_ASSET,
    pointCost: 250,
    sortOrder: 5,
    active: true,
    requiresAdminApproval: false,
  },
  {
    id: "trade_promote_7",
    domain: "trade",
    placementPolicy: "feed_boost",
    durationDays: 7,
    priceAsset: PROMOTION_PRICE_ASSET,
    pointCost: 500,
    sortOrder: 10,
    active: true,
    requiresAdminApproval: false,
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
    requiresAdminApproval: false,
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
    requiresAdminApproval: false,
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
    requiresAdminApproval: false,
  },
  /** 금액 권장안 (2026-11-27) — 커뮤니티 14일 새 상품 */
  {
    id: "community_promote_14",
    domain: "community",
    placementPolicy: "community_top_pin",
    durationDays: 14,
    priceAsset: PROMOTION_PRICE_ASSET,
    pointCost: 900,
    sortOrder: 45,
    active: true,
    requiresAdminApproval: false,
  },
];

/**
 * 상위노출 가격 어드민 관리 (Owner 2026-11-03): 위 값은 **처음 값(seed)** 이다.
 * 실제 가격·기간·사용 여부 원본 = DB `member_promotion_products` (`member-promotion-products-server.ts`).
 * 아래 동기 함수는 DB 표가 아직 없을 때(마이그레이션 적용 전) 대체값·테스트용으로만 쓴다.
 */
export function listMemberPromotionProductSeeds(): readonly MemberPromotionProduct[] {
  return PRODUCTS;
}

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
