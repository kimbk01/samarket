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
import { catalogPair } from "@/lib/i18n/catalog-pair";
import { DIBAY_SERVICE_BRAND as B } from "@/lib/brand/dibay-service-brand";
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 언어 SSOT B4 — 불리언 언어 값으로 카탈로그 문구를 고른다(원래 `ko ? "…" : "…"` 와 같은 결과). */
function tx(ko: unknown, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

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
      return catalogPair("admin_trade_post_status_active");
    case "paused":
      return catalogPair("admin_paused");
    case "admin_only":
      return catalogPair("admin_admin_only");
    case "not_released":
      return catalogPair("admin_not_released");
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
  return tx(ko, "admin_ads_commercial_price_per_days", { amount: String(amount), durationDays: String(durationDays) });
}

/** Business Cash packages are stored as PHP minor; display money + unit name. */
export function formatAdsBusinessCashPackagePrice(
  priceAmountMinor: number | null,
  durationDays: number,
  ko: boolean
): string {
  if (priceAmountMinor == null || priceAmountMinor <= 0) {
    return tx(ko, "admin_ads_commercial_price_not_configured");
  }
  const money = formatDeliveryAdPhpMinor(priceAmountMinor);
  return tx(ko, "admin_ads_commercial_business_cash_day_package", { money: String(money), durationDays: String(durationDays) });
}

function feedLines(
  products: FeedAdProduct[],
  domain: "community" | "trade"
): AdsPriceLine[] {
  return products
    .filter((p) => p.domain === domain)
    .map((p) => ({
      sku: p.id,
      labelKo: p.titleKo || tx(true, "admin_ads_duration_days", { days: p.durationDays }),
      labelEn: p.titleEn || tx(false, "admin_ads_duration_days", { days: p.durationDays }),
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
      labelKo: p.displayName || tx(true, "admin_ads_products_days_inventory", { days: p.durationDays, key: p.inventoryKey }),
      labelEn: p.displayName || tx(false, "admin_ads_products_days_inventory", { days: p.durationDays, key: p.inventoryKey }),
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
      domainKo: B.LOUNGE,
      domainEn: B.LOUNGE,
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
          labelKo: `${B.FEED} > 게시물 상위노출`,
          labelEn: `${B.FEED} > Post top exposure`,
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
      notesKo: [tx(true, "admin_ads_products_note_instant_exposure")],
      notesEn: [tx(false, "admin_ads_products_note_instant_exposure")],
    },
    {
      productKey: "trade_boost",
      domainKo: B.MARKET,
      domainEn: B.MARKET,
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
          labelKo: `${B.MARKET} > 게시물 상위노출`,
          labelEn: `${B.MARKET} > Post top exposure`,
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
      notesKo: [tx(true, "admin_ads_products_note_instant_exposure")],
      notesEn: [tx(false, "admin_ads_products_note_instant_exposure")],
    },
    {
      productKey: "delivery_store_sponsored",
      domainKo: B.DIPICK,
      domainEn: B.DIPICK,
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
      notesKo: [tx(true, "admin_ads_products_note_current_prices")],
      notesEn: [tx(false, "admin_ads_products_note_current_prices")],
    },
    {
      productKey: "community_banner",
      domainKo: B.LOUNGE,
      domainEn: B.LOUNGE,
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
          labelKo: `${B.FEED} 홈 피드`,
          labelEn: `${B.FEED} home feed`,
        },
        {
          key: "COMMUNITY_TOPIC",
          labelKo: `${B.FEED} 주제 피드`,
          labelEn: `${B.FEED} topic feed`,
        },
      ],
      priceLines: feedLines(feedProducts, "community"),
      priceAuthorityKo: tx(true, "admin_ads_products_price_authority_feed"),
      priceAuthorityEn: tx(false, "admin_ads_products_price_authority_feed"),
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
      notesKo: [tx(true, "admin_ads_products_note_admin_direct_not_zero")],
      notesEn: [tx(false, "admin_ads_products_note_admin_direct_not_zero")],
    },
    {
      productKey: "trade_banner",
      domainKo: B.MARKET,
      domainEn: B.MARKET,
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
          labelKo: `${B.MARKET} 홈 피드`,
          labelEn: `${B.MARKET} home feed`,
        },
        {
          key: "TRADE_CATEGORY",
          labelKo: `${B.MARKET} 카테고리 피드`,
          labelEn: `${B.MARKET} category feed`,
        },
      ],
      priceLines: feedLines(feedProducts, "trade"),
      priceAuthorityKo: tx(true, "admin_ads_products_price_authority_feed"),
      priceAuthorityEn: tx(false, "admin_ads_products_price_authority_feed"),
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
      notesKo: [tx(true, "admin_ads_products_note_admin_direct_not_zero")],
      notesEn: [tx(false, "admin_ads_products_note_admin_direct_not_zero")],
    },
    {
      productKey: "delivery_home_banner",
      domainKo: B.DIPICK,
      domainEn: B.DIPICK,
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
          labelKo: `${B.DIPICK} 홈 상단 배너`,
          labelEn: `${B.DIPICK} home top banner`,
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
      notesKo: [tx(true, "admin_ads_products_note_current_prices")],
      notesEn: [tx(false, "admin_ads_products_note_current_prices")],
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
        ? tx(true, "admin_ads_products_popup_owner_sales_on")
        : tx(true, "admin_ads_products_popup_owner_sales_off"),
      popupOwnerSalesEn: OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED
        ? tx(false, "admin_ads_products_popup_owner_sales_on")
        : tx(false, "admin_ads_products_popup_owner_sales_off"),
      notesKo: [tx(true, "admin_ads_products_note_no_price_writer")],
      notesEn: [tx(false, "admin_ads_products_note_no_price_writer")],
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
        labelKo: `${B.DIPICK} 홈 중간 배너`,
        labelEn: `${B.DIPICK} home inline banner`,
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
