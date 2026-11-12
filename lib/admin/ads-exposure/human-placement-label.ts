import { catalogPair } from "@/lib/i18n/catalog-pair";
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 언어 SSOT B4 — 불리언 언어 값으로 카탈로그 문구를 고른다(원래 `ko ? "…" : "…"` 와 같은 결과). */
function tx(ko: unknown, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

/**
 * Human placement labels for Admin / Member / Owner ops UI.
 * Never expose raw inventory keys as primary copy.
 */

export type PlacementLabel = { ko: string; en: string };

const PLACEMENT_LABELS: Record<string, PlacementLabel> = {
  STORES_HOME_HERO: catalogPair("admin_delivery_home_top_banner"),
  STORES_HOME_FEED: catalogPair("admin_delivery_home_store_list"),
  STORES_CATEGORY_FEED: catalogPair("admin_delivery_category_store_list"),
  STORES_HOME_INLINE_1: catalogPair("admin_delivery_home_inline_banner"),
  STORES_CATEGORY_TOP: catalogPair("admin_delivery_category_top_banner"),
  STORES_SEARCH_TOP: catalogPair("admin_delivery_search_top_banner"),
  TRADE_HOME: catalogPair("admin_trade_home_feed_banner"),
  TRADE_CATEGORY: catalogPair("admin_trade_category_feed_banner"),
  COMMUNITY_HOME: catalogPair("admin_community_home_feed_banner"),
  COMMUNITY_TOPIC: catalogPair("admin_community_topic_feed_banner"),
  feed_boost: catalogPair("admin_trade_post_top_exposure"),
  community_top_pin: catalogPair("admin_community_post_top_exposure"),
  GLOBAL: catalogPair("admin_all_service_popup"),
  COMMUNITY: catalogPair("admin_community_popup"),
  TRADE: catalogPair("admin_trade_popup"),
  DELIVERY: catalogPair("admin_delivery_popup"),
  DELIVERY_OWNER: catalogPair("admin_delivery_owner_popup"),
  ADMIN: catalogPair("admin_admin_popup"),
  MYPAGE: catalogPair("admin_my_page_popup"),
  /** 재감사 R3 (A-5): 배달 매장 목록 상위홍보 — 신청·실제 위치 이름표가 같은 이름을 쓴다 */
  STORES_LIST_PROMOTE: catalogPair("admin_delivery_store_list_promote"),
  팝업: catalogPair("admin_ad_kind_popup_campaign"),
  "기존 거래 광고": catalogPair("admin_legacy_trade_ad"),
};

/**
 * 광고 감사 A-5: 지면 이름 단일 정의 — 등록된 키면 이름, 아니면 null(호출부가 자기 대체 문구를 쓴다).
 * 운영 화면의 다른 지면 이름표(`adsPlacementBreadcrumb`·노출 위치 지도)는 이 함수를 쓴다.
 */
export function humanPlacementLabelOrNull(key: string | null | undefined, ko: boolean): string | null {
  const raw = String(key ?? "").trim();
  if (!raw) return null;
  const hit = PLACEMENT_LABELS[raw] ?? PLACEMENT_LABELS[raw.toUpperCase()];
  return hit ? (ko ? hit.ko : hit.en) : null;
}

export function humanPlacementLabel(key: string | null | undefined, ko: boolean): string {
  const raw = String(key ?? "").trim();
  if (!raw) return tx(ko, "admin_ads_exposure_placement_tbd");
  const hit = PLACEMENT_LABELS[raw] ?? PLACEMENT_LABELS[raw.toUpperCase()];
  if (hit) return ko ? hit.ko : hit.en;
  // Soften raw keys for ops UI
  if (raw.includes("_")) {
    return raw.replace(/_/g, " ");
  }
  return raw;
}

export function humanPopupSurfaceShortLabel(
  key: string | null | undefined,
  ko: boolean
): string {
  const raw = String(key ?? "GLOBAL").trim().toUpperCase();
  const labels: Record<string, PlacementLabel> = {
    GLOBAL: catalogPair("admin_all_services"),
    COMMUNITY: catalogPair("admin_community"),
    TRADE: catalogPair("admin_domain_chip_market"),
    DELIVERY: catalogPair("admin_domain_chip_dipick"),
    DELIVERY_OWNER: catalogPair("admin_delivery_owner"),
    ADMIN: catalogPair("admin_admin"),
    MYPAGE: catalogPair("admin_my_page"),
  };
  const values = raw.split(",").map((surface) => {
    const hit = labels[surface.trim()];
    return hit ? (ko ? hit.ko : hit.en) : surface.trim();
  });
  return values.filter(Boolean).join(", ");
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
    return tx(ko, "admin_ads_exposure_legacy_trade_ad");
  }
  if (k.includes("sponsored") || k === "store_promote") {
    return tx(ko, "admin_ads_exposure_delivery_store_promotion");
  }
  if (k.includes("banner") && (k.includes("feed") || k === "feed_ad" || k === "feed_banner")) {
    return tx(ko, "admin_ads_exposure_feed_banner");
  }
  if (k.includes("banner") || k === "delivery_banner" || k === "banner_hero") {
    return tx(ko, "admin_ads_exposure_delivery_home_top_banner");
  }
  if (k.includes("popup")) return tx(ko, "admin_ads_exposure_popup");
  if (k.includes("community") && (k.includes("boost") || k.includes("promo") || k.includes("promote"))) {
    return tx(ko, "admin_ads_exposure_community_top_exposure");
  }
  if (k.includes("trade") || k.includes("promote") || k === "boost") {
    return tx(ko, "admin_ads_exposure_trade_top_exposure");
  }
  return tx(ko, "admin_ads_exposure_ad");
}
