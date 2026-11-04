/**
 * CUT R6 — Admin Ads products / pricing commercial control projection.
 * Reads existing authorities only. No new billing engine / fake writers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ADS_CANONICAL_PRODUCTS } from "@/lib/ads/ads-canonical-product-ssot";
import { listFeedAdProducts, type FeedAdProduct } from "@/lib/ads/feed-ad-products";
import { loadMemberPromotionProducts } from "@/lib/points/member-promotion-products-server";
import { formatCurrencyAmount } from "@/lib/currency/currency-display-contract";
import {
  formatDeliveryAdPhpMinor,
  deliveryAdCommercialPlacementLabel,
} from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import { loadDeliveryAdCommercialCatalog } from "@/lib/stores/advertising/delivery-ad-commercial-catalog";
import type { DeliveryAdPackageRow } from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import { OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED } from "@/lib/platform-popup/owner-popup-new-sales-gate";
import { PLATFORM_POPUP_CONSUMER_SURFACES } from "@/lib/platform-popup/types";
import { humanPlacementLabel } from "@/lib/admin/ads-exposure/human-placement-label";

export const ADS_PRODUCTS_PLACEMENTS_HREF = "/admin/advertising/placements";
export const ADS_PRODUCTS_DELIVERY_COMMERCIAL_HREF =
  "/admin/delivery-ads/commercial-settings";
export const ADS_PRODUCTS_FEED_PRODUCTS_HREF = "/admin/feed-ad-products";
/** 광고 감사 A-3: 상위노출 가격 수정 화면 (DB `member_promotion_products`, revision·변경 내역) */
export const ADS_PRODUCTS_BOOST_PRICES_HREF = "/admin/trade-ad-policies";

export type AdsCommercialSellState =
  | "selling"
  | "paused"
  | "admin_only"
  | "not_released";

export type AdsPriceLine = {
  sku: string;
  labelKo: string;
  labelEn: string;
  priceTextKo: string;
  priceTextEn: string;
  active: boolean;
};

export type AdsCommercialProductCard = {
  productKey: keyof typeof ADS_CANONICAL_PRODUCTS;
  domainKo: string;
  domainEn: string;
  nameKo: string;
  nameEn: string;
  applicantKo: string;
  applicantEn: string;
  paymentKo: string;
  paymentEn: string;
  approvalKo: string;
  approvalEn: string;
  adminDirectKo: string;
  adminDirectEn: string;
  sellState: AdsCommercialSellState;
  sellStateKo: string;
  sellStateEn: string;
  placements: Array<{ key: string; labelKo: string; labelEn: string }>;
  priceLines: AdsPriceLine[];
  /** 재감사 R3 (A-3): 한국어 화면에는 테이블 이름 없이 「어디서 저장하는지」만 */
  priceAuthorityKo: string;
  priceAuthorityEn: string;
  priceEditable: boolean;
  sellableEditable: boolean;
  editPriceHref: string | null;
  editSellableHref: string | null;
  registerHref: string | null;
  memberPath: {
    paymentKo: string;
    paymentEn: string;
    approvalKo: string;
    approvalEn: string;
  } | null;
  adminDirectPath: {
    paymentKo: string;
    paymentEn: string;
    approvalKo: string;
    approvalEn: string;
  } | null;
  popupOwnerSalesKo: string | null;
  popupOwnerSalesEn: string | null;
  notesKo: string[];
  notesEn: string[];
};

export type AdsCommercialControlModel = {
  summary: {
    memberPaymentKo: string;
    memberPaymentEn: string;
    ownerPaymentKo: string;
    ownerPaymentEn: string;
    adminDirectKo: string;
    adminDirectEn: string;
    popupKo: string;
    popupEn: string;
  };
  products: AdsCommercialProductCard[];
  secondaryNotSellable: Array<{
    key: string;
    labelKo: string;
    labelEn: string;
    stateKo: string;
    stateEn: string;
  }>;
  deliveryPackageAuthority: "configured" | "not_configured" | "partial";
};

function sellLabel(state: AdsCommercialSellState): { ko: string; en: string } {
  switch (state) {
    case "selling":
      return { ko: "판매 중", en: "On sale" };
    case "paused":
      return { ko: "판매 중지", en: "Paused" };
    case "admin_only":
      return { ko: "운영자 전용", en: "Admin only" };
    case "not_released":
      return { ko: "미출시", en: "Not released" };
  }
}

export function formatAdsPointPrice(
  pointCost: number,
  durationDays: number,
  ko: boolean
): string {
  const amount = formatCurrencyAmount({
    currency: "point",
    amount: pointCost,
  });
  return ko ? `${amount} / ${durationDays}일` : `${amount} / ${durationDays} days`;
}

/** Business Cash packages are stored as PHP minor; display money + unit name. */
export function formatAdsBusinessCashPackagePrice(
  priceAmountMinor: number | null,
  durationDays: number,
  ko: boolean
): string {
  if (priceAmountMinor == null || priceAmountMinor <= 0) {
    return ko ? "가격 미설정" : "Price not configured";
  }
  const money = formatDeliveryAdPhpMinor(priceAmountMinor);
  return ko
    ? `${money} Business Cash / ${durationDays}일 패키지`
    : `${money} Business Cash / ${durationDays}-day package`;
}

function feedLines(
  products: FeedAdProduct[],
  domain: "community" | "trade"
): AdsPriceLine[] {
  return products
    .filter((p) => p.domain === domain)
    .map((p) => ({
      sku: p.id,
      labelKo: p.titleKo || `${p.durationDays}일`,
      labelEn: p.titleEn || `${p.durationDays} days`,
      priceTextKo: formatAdsPointPrice(p.pointCost, p.durationDays, true),
      priceTextEn: formatAdsPointPrice(p.pointCost, p.durationDays, false),
      active: p.active,
    }));
}

function deliveryLines(
  packages: DeliveryAdPackageRow[],
  productKind: "store_sponsored" | "banner",
  inventoryKeys: readonly string[]
): AdsPriceLine[] {
  return packages
    .filter(
      (p) =>
        p.productKind === productKind && inventoryKeys.includes(p.inventoryKey)
    )
    .map((p) => ({
      sku: p.code || p.id,
      labelKo: p.displayName || `${p.durationDays}일 · ${p.inventoryKey}`,
      labelEn: p.displayName || `${p.durationDays}d · ${p.inventoryKey}`,
      priceTextKo: formatAdsBusinessCashPackagePrice(
        p.priceAmountMinor,
        p.durationDays,
        true
      ),
      priceTextEn: formatAdsBusinessCashPackagePrice(
        p.priceAmountMinor,
        p.durationDays,
        false
      ),
      active: p.enabled && p.priceAmountMinor != null && p.priceAmountMinor > 0,
    }));
}

export async function loadAdsCommercialControlModel(
  sb: SupabaseClient
): Promise<AdsCommercialControlModel> {
  const [feedProducts, delivery, boostProducts] = await Promise.all([
    listFeedAdProducts(sb, { activeOnly: false }),
    loadDeliveryAdCommercialCatalog(sb),
    /** 상위노출 가격 = DB `member_promotion_products` (어드민 › 상위노출 가격) */
    loadMemberPromotionProducts(sb),
  ]);

  const communityBoost = boostProducts.filter((p) => p.domain === "community");
  const tradeBoost = boostProducts.filter((p) => p.domain === "trade");

  const sponsoredKeys = ["STORES_HOME_FEED", "STORES_CATEGORY_FEED"] as const;
  const heroKeys = ["STORES_HOME_HERO"] as const;

  const sponsoredPkgs = deliveryLines(
    delivery.packages,
    "store_sponsored",
    sponsoredKeys
  );
  const bannerPkgs = deliveryLines(delivery.packages, "banner", heroKeys);

  const sponsoredConfigured = sponsoredPkgs.some((p) => p.active);
  const bannerConfigured = bannerPkgs.some((p) => p.active);
  const deliveryPackageAuthority =
    sponsoredConfigured && bannerConfigured
      ? ("configured" as const)
      : sponsoredConfigured || bannerConfigured
        ? ("partial" as const)
        : ("not_configured" as const);

  const products: AdsCommercialProductCard[] = [
    {
      productKey: "community_boost",
      domainKo: "커뮤니티",
      domainEn: "Community",
      nameKo: ADS_CANONICAL_PRODUCTS.community_boost.publicNameKo,
      nameEn: ADS_CANONICAL_PRODUCTS.community_boost.publicNameEn,
      applicantKo: "회원",
      applicantEn: "Member",
      paymentKo: "포인트",
      paymentEn: "Point",
      approvalKo: "필요 없음",
      approvalEn: "Not required",
      adminDirectKo: "지원 안 함",
      adminDirectEn: "Not supported",
      sellState: "selling",
      ...(() => {
        const s = sellLabel("selling");
        return { sellStateKo: s.ko, sellStateEn: s.en };
      })(),
      placements: [
        {
          key: "community_top_pin",
          labelKo: "커뮤니티 > 게시물 상위노출",
          labelEn: "Community > Post top exposure",
        },
      ],
      priceLines: communityBoost.map((p) => ({
        sku: p.id,
        labelKo: p.fallbackTitleKo,
        labelEn: p.fallbackTitleEn,
        priceTextKo: formatAdsPointPrice(p.pointCost, p.durationDays, true),
        priceTextEn: formatAdsPointPrice(p.pointCost, p.durationDays, false),
        active: p.active,
      })),
      priceAuthorityKo: "어드민 「상위노출 가격」 화면에서 저장",
      priceAuthorityEn: "member_promotion_products (DB) · Admin boost price writer",
      priceEditable: true,
      sellableEditable: false,
      editPriceHref: ADS_PRODUCTS_BOOST_PRICES_HREF,
      editSellableHref: null,
      registerHref: null,
      memberPath: null,
      adminDirectPath: null,
      popupOwnerSalesKo: null,
      popupOwnerSalesEn: null,
      notesKo: ["결제 즉시 노출 · 운영자 승인 없이 사후 제재만"],
      notesEn: ["Immediate paid exposure · Admin sanction only after purchase"],
    },
    {
      productKey: "trade_boost",
      domainKo: "거래",
      domainEn: "Trade",
      nameKo: ADS_CANONICAL_PRODUCTS.trade_boost.publicNameKo,
      nameEn: ADS_CANONICAL_PRODUCTS.trade_boost.publicNameEn,
      applicantKo: "회원",
      applicantEn: "Member",
      paymentKo: "포인트",
      paymentEn: "Point",
      approvalKo: "필요 없음",
      approvalEn: "Not required",
      adminDirectKo: "지원 안 함",
      adminDirectEn: "Not supported",
      sellState: "selling",
      ...(() => {
        const s = sellLabel("selling");
        return { sellStateKo: s.ko, sellStateEn: s.en };
      })(),
      placements: [
        {
          key: "feed_boost",
          labelKo: "거래 > 게시물 상위노출",
          labelEn: "Trade > Post top exposure",
        },
      ],
      priceLines: tradeBoost.map((p) => ({
        sku: p.id,
        labelKo: p.fallbackTitleKo,
        labelEn: p.fallbackTitleEn,
        priceTextKo: formatAdsPointPrice(p.pointCost, p.durationDays, true),
        priceTextEn: formatAdsPointPrice(p.pointCost, p.durationDays, false),
        active: p.active,
      })),
      priceAuthorityKo: "어드민 「상위노출 가격」 화면에서 저장",
      priceAuthorityEn: "member_promotion_products (DB) · Admin boost price writer",
      priceEditable: true,
      sellableEditable: false,
      editPriceHref: ADS_PRODUCTS_BOOST_PRICES_HREF,
      editSellableHref: null,
      registerHref: null,
      memberPath: null,
      adminDirectPath: null,
      popupOwnerSalesKo: null,
      popupOwnerSalesEn: null,
      notesKo: ["결제 즉시 노출 · 운영자 승인 없이 사후 제재만"],
      notesEn: ["Immediate paid exposure · Admin sanction only after purchase"],
    },
    {
      productKey: "delivery_store_sponsored",
      domainKo: "배달",
      domainEn: "Delivery",
      nameKo: ADS_CANONICAL_PRODUCTS.delivery_store_sponsored.publicNameKo,
      nameEn: ADS_CANONICAL_PRODUCTS.delivery_store_sponsored.publicNameEn,
      applicantKo: "사장님",
      applicantEn: "Store owner",
      paymentKo: "Business Cash",
      paymentEn: "Business Cash",
      approvalKo: "필요",
      approvalEn: "Required",
      adminDirectKo: "지원 안 함",
      adminDirectEn: "Not supported",
      sellState: sponsoredConfigured ? "selling" : "paused",
      ...(() => {
        const s = sellLabel(sponsoredConfigured ? "selling" : "paused");
        return { sellStateKo: s.ko, sellStateEn: s.en };
      })(),
      placements: sponsoredKeys.map((key) => ({
        key,
        labelKo: deliveryAdCommercialPlacementLabel(key, "ko"),
        labelEn: deliveryAdCommercialPlacementLabel(key, "en"),
      })),
      priceLines: sponsoredPkgs,
      priceAuthorityKo: "어드민 「배달 광고 상업 설정」 화면에서 저장",
      priceAuthorityEn: "delivery_ad_packages (DB) · Admin commercial writer",
      priceEditable: true,
      sellableEditable: true,
      editPriceHref: ADS_PRODUCTS_DELIVERY_COMMERCIAL_HREF,
      editSellableHref: ADS_PRODUCTS_DELIVERY_COMMERCIAL_HREF,
      registerHref: null,
      memberPath: null,
      adminDirectPath: null,
      popupOwnerSalesKo: null,
      popupOwnerSalesEn: null,
      notesKo: ["현재 판매 가격 · 과거 결제액은 변경되지 않습니다"],
      notesEn: ["Current sale prices · historical charges are unchanged"],
    },
    {
      productKey: "community_banner",
      domainKo: "커뮤니티",
      domainEn: "Community",
      nameKo: ADS_CANONICAL_PRODUCTS.community_banner.publicNameKo,
      nameEn: ADS_CANONICAL_PRODUCTS.community_banner.publicNameEn,
      applicantKo: "회원 또는 운영자",
      applicantEn: "Member or Admin",
      paymentKo: "회원 포인트 / 운영자 등록 결제 없음",
      paymentEn: "Member Point / Admin no payment",
      approvalKo: "회원 신청만 필요",
      approvalEn: "Member path only",
      adminDirectKo: "지원",
      adminDirectEn: "Supported",
      sellState: "selling",
      ...(() => {
        const s = sellLabel("selling");
        return { sellStateKo: s.ko, sellStateEn: s.en };
      })(),
      placements: [
        {
          key: "COMMUNITY_HOME",
          labelKo: "커뮤니티 홈 피드",
          labelEn: "Community home feed",
        },
        {
          key: "COMMUNITY_TOPIC",
          labelKo: "커뮤니티 주제 피드",
          labelEn: "Community topic feed",
        },
      ],
      priceLines: feedLines(feedProducts, "community"),
      priceAuthorityKo: "어드민 「피드 배너 상품」 화면에서 저장",
      priceAuthorityEn: "어드민 「피드 배너 상품」 화면에서 저장",
      priceEditable: true,
      sellableEditable: true,
      editPriceHref: ADS_PRODUCTS_FEED_PRODUCTS_HREF,
      editSellableHref: ADS_PRODUCTS_FEED_PRODUCTS_HREF,
      registerHref: "/admin/advertising/direct/community",
      memberPath: {
        paymentKo: "포인트",
        paymentEn: "Point",
        approvalKo: "승인 필요",
        approvalEn: "Approval required",
      },
      adminDirectPath: {
        paymentKo: "결제 없음",
        paymentEn: "No payment",
        approvalKo: "승인 없음",
        approvalEn: "No approval",
      },
      popupOwnerSalesKo: null,
      popupOwnerSalesEn: null,
      notesKo: ["운영자 등록은 회원 상품 0원 표기가 아닙니다"],
      notesEn: ["Admin Direct is not a zero-price Member SKU"],
    },
    {
      productKey: "trade_banner",
      domainKo: "거래",
      domainEn: "Trade",
      nameKo: ADS_CANONICAL_PRODUCTS.trade_banner.publicNameKo,
      nameEn: ADS_CANONICAL_PRODUCTS.trade_banner.publicNameEn,
      applicantKo: "회원 또는 운영자",
      applicantEn: "Member or Admin",
      paymentKo: "회원 포인트 / 운영자 등록 결제 없음",
      paymentEn: "Member Point / Admin no payment",
      approvalKo: "회원 신청만 필요",
      approvalEn: "Member path only",
      adminDirectKo: "지원",
      adminDirectEn: "Supported",
      sellState: "selling",
      ...(() => {
        const s = sellLabel("selling");
        return { sellStateKo: s.ko, sellStateEn: s.en };
      })(),
      placements: [
        {
          key: "TRADE_HOME",
          labelKo: "거래 홈 피드",
          labelEn: "Trade home feed",
        },
        {
          key: "TRADE_CATEGORY",
          labelKo: "거래 카테고리 피드",
          labelEn: "Trade category feed",
        },
      ],
      priceLines: feedLines(feedProducts, "trade"),
      priceAuthorityKo: "어드민 「피드 배너 상품」 화면에서 저장",
      priceAuthorityEn: "어드민 「피드 배너 상품」 화면에서 저장",
      priceEditable: true,
      sellableEditable: true,
      editPriceHref: ADS_PRODUCTS_FEED_PRODUCTS_HREF,
      editSellableHref: ADS_PRODUCTS_FEED_PRODUCTS_HREF,
      registerHref: "/admin/advertising/direct/trade",
      memberPath: {
        paymentKo: "포인트",
        paymentEn: "Point",
        approvalKo: "승인 필요",
        approvalEn: "Approval required",
      },
      adminDirectPath: {
        paymentKo: "결제 없음",
        paymentEn: "No payment",
        approvalKo: "승인 없음",
        approvalEn: "No approval",
      },
      popupOwnerSalesKo: null,
      popupOwnerSalesEn: null,
      notesKo: ["운영자 등록은 회원 상품 0원 표기가 아닙니다"],
      notesEn: ["Admin Direct is not a zero-price Member SKU"],
    },
    {
      productKey: "delivery_home_banner",
      domainKo: "배달",
      domainEn: "Delivery",
      nameKo: ADS_CANONICAL_PRODUCTS.delivery_home_banner.publicNameKo,
      nameEn: ADS_CANONICAL_PRODUCTS.delivery_home_banner.publicNameEn,
      applicantKo: "사장님 또는 운영자",
      applicantEn: "Store owner or Admin",
      paymentKo: "사장님 Business Cash / 운영자 등록 결제 없음",
      paymentEn: "Owner Business Cash / Admin no payment",
      approvalKo: "사장님 신청만 필요",
      approvalEn: "Owner path only",
      adminDirectKo: "지원",
      adminDirectEn: "Supported",
      sellState: bannerConfigured ? "selling" : "paused",
      ...(() => {
        const s = sellLabel(bannerConfigured ? "selling" : "paused");
        return { sellStateKo: s.ko, sellStateEn: s.en };
      })(),
      placements: [
        {
          key: "STORES_HOME_HERO",
          labelKo: "배달 홈 상단 배너",
          labelEn: "Delivery home top banner",
        },
      ],
      priceLines: bannerPkgs,
      priceAuthorityKo: "어드민 「배달 광고 상업 설정」 화면에서 저장",
      priceAuthorityEn: "delivery_ad_packages (DB) · Admin commercial writer",
      priceEditable: true,
      sellableEditable: true,
      editPriceHref: ADS_PRODUCTS_DELIVERY_COMMERCIAL_HREF,
      editSellableHref: ADS_PRODUCTS_DELIVERY_COMMERCIAL_HREF,
      registerHref: "/admin/advertising/direct/delivery",
      memberPath: {
        paymentKo: "Business Cash",
        paymentEn: "Business Cash",
        approvalKo: "승인 필요",
        approvalEn: "Approval required",
      },
      adminDirectPath: {
        paymentKo: "결제 없음",
        paymentEn: "No payment",
        approvalKo: "승인 없음",
        approvalEn: "No approval",
      },
      popupOwnerSalesKo: null,
      popupOwnerSalesEn: null,
      notesKo: ["현재 판매 가격 · 과거 결제액은 변경되지 않습니다"],
      notesEn: ["Current sale prices · historical charges are unchanged"],
    },
    {
      productKey: "popup",
      domainKo: "팝업",
      domainEn: "Popup",
      nameKo: ADS_CANONICAL_PRODUCTS.popup.publicNameKo,
      nameEn: ADS_CANONICAL_PRODUCTS.popup.publicNameEn,
      applicantKo: "운영자",
      applicantEn: "Admin",
      paymentKo: "없음",
      paymentEn: "None",
      approvalKo: "없음",
      approvalEn: "None",
      adminDirectKo: "지원 (운영자 등록만)",
      adminDirectEn: "Supported (Admin Direct ONLY)",
      sellState: "admin_only",
      ...(() => {
        const s = sellLabel("admin_only");
        return { sellStateKo: s.ko, sellStateEn: s.en };
      })(),
      // 재감사 S-2 (H-7): 위치 이름은 지면 이름 단일 정의 (코드값 그대로 보이던 것)
      placements: PLATFORM_POPUP_CONSUMER_SURFACES.map((key) => ({
        key,
        labelKo: humanPlacementLabel(key, true),
        labelEn: humanPlacementLabel(key, false),
      })),
      priceLines: [],
      priceAuthorityKo: "결제 없음 · 가격 입력 없음",
      priceAuthorityEn: "No payment · no price input",
      priceEditable: false,
      sellableEditable: false,
      editPriceHref: null,
      editSellableHref: null,
      registerHref: "/admin/advertising/direct/popup",
      memberPath: null,
      adminDirectPath: {
        paymentKo: "결제 없음",
        paymentEn: "No payment",
        approvalKo: "승인 없음",
        approvalEn: "No approval",
      },
      popupOwnerSalesKo: OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED
        ? "사장님 신규 판매 활성 (정책 확인 필요)"
        : "신규 회원·사장님 신청 지원하지 않음 · 사장님 팝업(이전 방식) 신규 판매 중지 · 기존 이력 보존",
      popupOwnerSalesEn: OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED
        ? "Owner new sales enabled (policy check required)"
        : "Member/Owner new applications not supported · Legacy Owner Popup new sales stopped · history preserved",
      notesKo: ["가격 입력·가격 저장 화면 없음"],
      notesEn: ["No price input / no price writer"],
    },
  ];

  return {
    summary: {
      memberPaymentKo: "포인트",
      memberPaymentEn: "Point",
      ownerPaymentKo: "Business Cash",
      ownerPaymentEn: "Business Cash",
      adminDirectKo: "결제 없음",
      adminDirectEn: "No payment",
      popupKo: "운영자 전용",
      popupEn: "Admin only",
    },
    products,
    secondaryNotSellable: [
      {
        key: "STORES_SEARCH_TOP",
        labelKo: "검색 결과 상단 배너",
        labelEn: "Search results top banner",
        stateKo: "판매 중지 (출시 때 판매 안 함)",
        stateEn: "Not sellable at launch",
      },
      {
        key: "STORES_HOME_INLINE_1",
        labelKo: "배달 홈 중간 배너",
        labelEn: "Delivery home inline banner",
        stateKo: "미출시",
        stateEn: "Not released",
      },
      {
        key: "STORES_CATEGORY_TOP",
        labelKo: "업종 상단 배너",
        labelEn: "Category top banner",
        stateKo: "미출시",
        stateEn: "Not released",
      },
    ],
    deliveryPackageAuthority,
  };
}
