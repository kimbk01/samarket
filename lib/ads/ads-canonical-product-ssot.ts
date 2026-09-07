/**
 * DIBAY Ads / Exposure — PUBLIC product taxonomy + commercial projection SSOT.
 * Family catalogs remain authoritative; this module normalizes PUBLIC names/actors
 * without inventing a unified Ads product table or engine.
 */

export const ADS_CANONICAL_PRODUCTS = {
  community_boost: {
    productKey: "community_boost",
    publicNameKo: "Community 상위노출",
    publicNameEn: "Community top exposure",
    actor: "member" as const,
    currency: "POINT" as const,
    approvalRequired: false,
    sellable: true,
    sourceKind: "MEMBER_PAID" as const,
    commercialFamily: "promotion-products" as const,
    placementFamily: "community_boost" as const,
  },
  trade_boost: {
    productKey: "trade_boost",
    publicNameKo: "거래 상위노출",
    publicNameEn: "Trade top exposure",
    actor: "member" as const,
    currency: "POINT" as const,
    approvalRequired: false,
    sellable: true,
    sourceKind: "MEMBER_PAID" as const,
    commercialFamily: "promotion-products" as const,
    placementFamily: "trade_boost" as const,
  },
  delivery_store_sponsored: {
    productKey: "delivery_store_sponsored",
    publicNameKo: "배달 매장 홍보",
    publicNameEn: "Delivery store promotion",
    actor: "owner" as const,
    currency: "BUSINESS_CASH" as const,
    approvalRequired: true,
    sellable: true,
    sourceKind: "OWNER_PAID" as const,
    commercialFamily: "delivery_ad_packages" as const,
    placementFamily: "delivery_sponsored" as const,
  },
  community_banner: {
    productKey: "community_banner",
    publicNameKo: "Community 배너",
    publicNameEn: "Community banner",
    actor: "member_or_admin_direct" as const,
    currency: "POINT_OR_ADMIN_DIRECT" as const,
    approvalRequired: true,
    sellable: true,
    sourceKind: "MEMBER_PAID" as const,
    commercialFamily: "feed_ad_products" as const,
    placementFamily: "community_banner" as const,
  },
  trade_banner: {
    productKey: "trade_banner",
    publicNameKo: "거래 배너",
    publicNameEn: "Trade banner",
    actor: "member_or_admin_direct" as const,
    currency: "POINT_OR_ADMIN_DIRECT" as const,
    approvalRequired: true,
    sellable: true,
    sourceKind: "MEMBER_PAID" as const,
    commercialFamily: "feed_ad_products" as const,
    placementFamily: "trade_banner" as const,
  },
  delivery_home_banner: {
    productKey: "delivery_home_banner",
    publicNameKo: "배달 홈 상단 배너",
    publicNameEn: "Delivery home top banner",
    actor: "owner_or_admin_direct" as const,
    currency: "BUSINESS_CASH_OR_ADMIN_DIRECT" as const,
    approvalRequired: true,
    sellable: true,
    sourceKind: "OWNER_PAID" as const,
    commercialFamily: "delivery_ad_packages" as const,
    placementFamily: "delivery_banner" as const,
  },
  popup: {
    productKey: "popup",
    publicNameKo: "팝업",
    publicNameEn: "Popup",
    actor: "admin_direct" as const,
    currency: "N_A" as const,
    approvalRequired: false,
    sellable: false,
    sourceKind: "ADMIN_DIRECT" as const,
    commercialFamily: "platform_popup_admin_direct" as const,
    placementFamily: "popup" as const,
  },
} as const;

export type AdsCanonicalProductKey = keyof typeof ADS_CANONICAL_PRODUCTS;

export function adsCanonicalPublicName(
  key: AdsCanonicalProductKey,
  ko: boolean
): string {
  const row = ADS_CANONICAL_PRODUCTS[key];
  return ko ? row.publicNameKo : row.publicNameEn;
}

/** Normalize existing source models without DB enum migration. */
export function normalizeAdsSourceKindPublic(
  raw: string | null | undefined,
  ko: boolean
): string {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (
    v === "admin_direct" ||
    v === "admin-direct" ||
    v === "dibay_first_party" ||
    v === "admin"
  ) {
    return ko ? "Admin 직접 등록" : "Admin direct";
  }
  if (v === "owner" || v === "owner_paid") {
    return ko ? "매장 신청" : "Store application";
  }
  if (v === "member" || v === "member_paid") {
    return ko ? "회원 신청" : "Member application";
  }
  return ko ? "—" : "—";
}
