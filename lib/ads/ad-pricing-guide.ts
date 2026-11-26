/**
 * 광고 요금 안내 단일 정의 (광고 감사 E · 설계 `docs/audit/ad-pricing-notice-design-2026-11-26.md` §7).
 *
 * - 금액·기간은 **결제 창과 같은 표·같은 함수**에서 그때그때 읽는다 — 어드민이 바꾸면 다음 열기부터 새 금액(지시 4).
 *   회원: `member_promotion_products`(loadMemberPromotionProducts) · `feed_ad_products`(listActiveFeedAdProductsOrThrow)
 *   매장: `delivery_ad_packages` + 사장님 신청 목록과 같은 지면 판정(`isOwnerSellableDeliveryAdPlacement`) + 견적 함수(정가 · 파트너 할인 전)
 * - 판매 중인 것만 줄이 된다(꺼진 상품·검색 상단·매장 팝업·노출 자리 꺼진 홈 홍보는 자동 제외 — 지시 2).
 * - 운영자 직접 등록(운영 팝업·당김 후 광고·인트로·이벤트·마이 배너)은 돈을 받지 않으므로 넣지 않는다.
 * - 서버 전용(서비스 키 클라이언트).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageKey } from "@/lib/i18n/messages";
import { loadMemberPromotionProducts } from "@/lib/points/member-promotion-products-server";
import { listActiveFeedAdProductsOrThrow } from "@/lib/ads/feed-ad-products";
import { loadDeliveryAdCommercialCatalog } from "@/lib/stores/advertising/delivery-ad-commercial-catalog";
import { calculateDeliveryAdCommercialQuote } from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import { isOwnerSellableDeliveryAdPlacement } from "@/lib/stores/advertising/delivery-ad-owner-sellable";
import { evaluateStoresHomeFeedSellable } from "@/lib/stores/advertising/delivery-ad-home-feed-sell-gate";
import { evaluateAnyCategoryFeedSellable } from "@/lib/stores/advertising/delivery-ad-category-policy-sell-gate";

export type AdPricingOption = { days: number; amount: number };

export type AdPricingGroup = {
  id: string;
  nameKey: MessageKey;
  whereKey: MessageKey;
  options: AdPricingOption[];
};

export type AdPricingGuide = {
  /** 회원 광고 — 금액 단위 포인트 */
  member: AdPricingGroup[];
  /** 매장 광고 — 금액 단위 페소 최소 단위(센타보) */
  store: AdPricingGroup[];
  /** 광고 파트너(월 회비 · 매장 광고 할인) — 받지 않으면 null */
  partner: { feeMinor: number; discountPercent: number } | null;
  /** 읽은 시각(ISO) — 화면은 PHT 로 표시 */
  at: string;
};

const NO_PARTNER = {
  membershipId: null,
  active: false,
  advertisingDiscountPercent: 0,
  benefitSnapshot: {},
} as const;

const STORE_GROUPS: ReadonlyArray<{
  id: string;
  productKind: "banner" | "store_sponsored";
  inventoryKey: string;
  nameKey: MessageKey;
  whereKey: MessageKey;
}> = [
  {
    id: "store_home_hero",
    productKind: "banner",
    inventoryKey: "STORES_HOME_HERO",
    nameKey: "ad_guide_name_store_hero",
    whereKey: "ad_guide_where_store_hero",
  },
  {
    id: "store_home_feed",
    productKind: "store_sponsored",
    inventoryKey: "STORES_HOME_FEED",
    nameKey: "ad_guide_name_store_home_feed",
    whereKey: "ad_guide_where_store_home_feed",
  },
  {
    id: "store_category_feed",
    productKind: "store_sponsored",
    inventoryKey: "STORES_CATEGORY_FEED",
    nameKey: "ad_guide_name_store_category_feed",
    whereKey: "ad_guide_where_store_category_feed",
  },
];

function byDays(a: AdPricingOption, b: AdPricingOption): number {
  return a.days - b.days || a.amount - b.amount;
}

export async function loadAdPricingGuide(sb: SupabaseClient): Promise<AdPricingGuide> {
  /**
   * R-17: 조회 오류는 던진다(→ 화면 「요금을 불러오지 못했어요」) — 빈 목록을 「판매 안 함」으로 안내하지 않는다.
   * R-18: 상위노출·배너 가격표는 한 번씩만 읽고 분야로 나눈다.
   * R-22: 매장 쪽(광고 설정 5 · 홈 선반 1)도 오류를 던진다. R-23: 광고 켜진 업종이 없으면 업종 줄을 내리지 않는다(업종 정책 1 · 업종 1).
   * Supabase 10회.
   */
  const [boosts, banners, catalog, homeFeedSellable, categoryFeedSellable] = await Promise.all([
    loadMemberPromotionProducts(sb),
    listActiveFeedAdProductsOrThrow(sb),
    loadDeliveryAdCommercialCatalog(sb, { strict: true }),
    evaluateStoresHomeFeedSellable(sb),
    evaluateAnyCategoryFeedSellable(sb),
  ]);
  const tradeBoost = boosts.filter((p) => p.domain === "trade");
  const communityBoost = boosts.filter((p) => p.domain === "community");
  const tradeBanner = banners.filter((p) => p.domain === "trade");
  const communityBanner = banners.filter((p) => p.domain === "community");

  const member: AdPricingGroup[] = [
    {
      id: "trade_boost",
      nameKey: "ad_guide_name_trade_boost",
      whereKey: "ad_guide_where_trade_boost",
      options: tradeBoost.map((p) => ({ days: p.durationDays, amount: p.pointCost })),
    },
    {
      id: "community_boost",
      nameKey: "ad_guide_name_community_boost",
      whereKey: "ad_guide_where_community_boost",
      options: communityBoost.map((p) => ({ days: p.durationDays, amount: p.pointCost })),
    },
    {
      id: "trade_banner",
      nameKey: "ad_guide_name_trade_banner",
      whereKey: "ad_guide_where_trade_banner",
      options: tradeBanner.map((p) => ({ days: p.durationDays, amount: p.pointCost })),
    },
    {
      id: "community_banner",
      nameKey: "ad_guide_name_community_banner",
      whereKey: "ad_guide_where_community_banner",
      options: communityBanner.map((p) => ({ days: p.durationDays, amount: p.pointCost })),
    },
  ]
    .map((g) => ({ ...g, options: [...g.options].sort(byDays) }))
    .filter((g) => g.options.length > 0) as AdPricingGroup[];

  const store: AdPricingGroup[] = [];
  for (const g of STORE_GROUPS) {
    const product = catalog.products.find((p) => p.key === g.productKind);
    if (!product || !product.enabled || !product.acceptingApplications) continue;
    const placement =
      catalog.placements.find((p) => p.productKind === g.productKind && p.inventoryKey === g.inventoryKey) ?? null;
    if (!placement || !isOwnerSellableDeliveryAdPlacement(placement, g.productKind, { homeFeedSellable, categoryFeedSellable })) continue;
    const options: AdPricingOption[] = [];
    for (const pkg of catalog.packages) {
      if (pkg.productKind !== g.productKind || pkg.inventoryKey !== g.inventoryKey) continue;
      const q = calculateDeliveryAdCommercialQuote({
        productKind: g.productKind,
        inventoryKey: g.inventoryKey,
        package: pkg,
        placement,
        productEnabled: product.enabled,
        acceptingApplications: product.acceptingApplications,
        partner: NO_PARTNER,
      });
      if (q.ok) options.push({ days: q.durationDays, amount: q.basePriceMinor });
    }
    if (options.length > 0) {
      store.push({ id: g.id, nameKey: g.nameKey, whereKey: g.whereKey, options: options.sort(byDays) });
    }
  }

  const cfg = catalog.partnerConfig;
  const partner =
    cfg && cfg.enabled && cfg.acceptingNewMembers && cfg.monthlyFeeMinor != null && cfg.monthlyFeeMinor >= 0
      ? { feeMinor: cfg.monthlyFeeMinor, discountPercent: cfg.advertisingDiscountPercent }
      : null;

  return { member, store, partner, at: new Date().toISOString() };
}
