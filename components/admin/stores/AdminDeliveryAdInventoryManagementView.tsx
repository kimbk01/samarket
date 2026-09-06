"use client";

import Link from "next/link";
import { AdminDeliveryCmsChrome } from "@/components/admin/shell/AdminDeliveryCmsChrome";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminDeliveryAdsSectionNav } from "@/components/admin/stores/AdminDeliveryAdsSectionNav";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliveryAdPlacementMiniature } from "@/components/stores/advertising/DeliveryAdPlacementMiniature";
import {
  LAUNCH_BANNER_PLACEMENTS,
  LAUNCH_STORE_PROMOTION_PLACEMENTS,
  LEGACY_SEARCH_TOP_BANNER_PLACEMENT,
  launchBannerByInventory,
} from "@/lib/stores/advertising/delivery-ad-launch-placement-product";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { DELIVERY_AD_INVENTORY_SEEDS } from "@/lib/stores/advertising/delivery-ad-inventory";
import { STORES_SEARCH_TOP_SLOT_POLICY } from "@/lib/stores/advertising/banner-search-top-exposure";
import { STORES_SEARCH_TOP_LAUNCH } from "@/lib/stores/advertising/delivery-ad-product-recovery-contract";
import { deliveryAdsAdminHubHref } from "@/lib/stores/advertising/delivery-ad-placement-language";
import {
  DELIVERY_AD_BANNER_PIXEL_GUIDE,
  formatBannerPixelGuideLine,
} from "@/lib/stores/advertising/delivery-ad-open-event-commercial";
import { AdminPlacementMapPanel } from "@/components/admin/stores/AdminPlacementMapPanel";

function seedFor(key: string) {
  return DELIVERY_AD_INVENTORY_SEEDS.find((s) => s.key === key) ?? null;
}

const MANAGE_BTN =
  "mt-3 inline-flex min-h-[40px] items-center rounded-ui-rect bg-[#0A823E] px-4 text-[13px] font-semibold text-white transition hover:bg-[#087a38] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A823E]/40 active:scale-[0.99]";

/**
 * Admin 광고 지면 관리 — human language launch inventory cards.
 */
export function AdminDeliveryAdInventoryManagementView() {
  const { safeT, language } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const adTag = lang === "en" ? "Ad" : "광고";

  const homeHero = LAUNCH_BANNER_PLACEMENTS.find((p) => p.inventoryKey === "STORES_HOME_HERO")!;
  const homeFeed = LAUNCH_STORE_PROMOTION_PLACEMENTS.find(
    (p) => p.inventoryKey === "STORES_HOME_FEED"
  )!;
  const categoryFeed = LAUNCH_STORE_PROMOTION_PLACEMENTS.find(
    (p) => p.inventoryKey === "STORES_CATEGORY_FEED"
  )!;
  const searchTop = LEGACY_SEARCH_TOP_BANNER_PLACEMENT;
  const searchSeed = seedFor(searchTop.inventoryKey);
  const heroPolicy = launchBannerByInventory("STORES_HOME_HERO");
  const searchMax = STORES_SEARCH_TOP_SLOT_POLICY.maxBanners;

  return (
    <AdminDeliveryCmsChrome>
      <div className="space-y-5 pb-10" data-admin-delivery-ads-inventory="1">
        <div>
          <p className="text-[12px] text-sam-muted">Delivery › Ads › Placements</p>
          <h1 className="text-[20px] font-bold text-sam-fg">
            {safeT("admin_delivery_ads_inventory_title", {
              fallbackKo: "광고 위치 관리",
              fallbackEn: "Ad placement management",
            })}
          </h1>
          <p className="mt-1 text-[13px] text-sam-muted">
            {safeT("admin_delivery_ads_inventory_desc", {
              fallbackKo:
                "고객 화면에 실제로 팔리는 광고 위치를 관리합니다.",
              fallbackEn:
                "Manage sellable customer ad placements.",
            })}
          </p>
        </div>

        <AdminDeliveryAdsSectionNav />

        <section className="space-y-3">
          <h2 className="text-[16px] font-bold text-sam-fg">
            {safeT("admin_ads_surface_home", { fallbackKo: "배달 홈", fallbackEn: "Delivery Home" })}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            <AdminCard title={lang === "en" ? "Top hero banner" : "배달 홈 상단 배너"}>
              <div data-admin-inventory-card={homeHero.inventoryKey}>
                <ul className="space-y-1 text-[12px] text-sam-fg" data-admin-hero-ops="carousel">
                  <li>
                    {safeT("admin_ads_form_carousel", {
                      fallbackKo: "형태: 슬라이드 배너",
                      fallbackEn: "Form: slide carousel",
                    })}
                  </li>
                  <li>
                    {safeT("admin_ads_hero_visible", {
                      fallbackKo: `한 번에 ${(heroPolicy?.visibleAtOnce ?? 1)}장 · 여러 광고 동시 등록 가능`,
                      fallbackEn: `${heroPolicy?.visibleAtOnce ?? 1} visible at once · multiple campaigns can be active`,
                    })}
                  </li>
                  <li>
                    {safeT("admin_ads_hero_auto", {
                      fallbackKo: `자동 전환: ${(heroPolicy?.autoSlideMs ?? 5000) / 1000}초 · 무한 루프 · 좌우 swipe · 하단 dots`,
                      fallbackEn: `Auto: ${(heroPolicy?.autoSlideMs ?? 5000) / 1000}s · loop · swipe · dots`,
                    })}
                  </li>
                  <li>
                    {safeT("admin_ads_hero_order", {
                      fallbackKo: "표시 순서·일정 편입/제외는 광고 목록에서 관리",
                      fallbackEn: "Order and schedule inclusion are managed in the ad list",
                    })}
                  </li>
                  <li>
                    {safeT("admin_ads_sellable", { fallbackKo: "판매 상태", fallbackEn: "Sellable" })}
                    : ON
                  </li>
                </ul>
                <DeliveryAdPlacementMiniature kind={homeHero.miniature} adLabel={adTag} />
                <p className="mt-2 text-[12px] text-sam-muted">
                  {formatBannerPixelGuideLine(DELIVERY_AD_BANNER_PIXEL_GUIDE.STORES_HOME_HERO, lang)}
                </p>
                <p className="mt-1 text-[11px] text-sam-muted">
                  {DELIVERY_AD_BANNER_PIXEL_GUIDE.STORES_HOME_HERO[
                    lang === "en" ? "safeAreaNoteEn" : "safeAreaNoteKo"
                  ]}
                </p>
                <p className="mt-1 text-[11px] text-sam-muted">key: {homeHero.inventoryKey}</p>
                <Link
                  href={deliveryAdsAdminHubHref({ inventory: homeHero.inventoryKey })}
                  className={MANAGE_BTN}
                >
                  {safeT("admin_ads_manage", { fallbackKo: "관리", fallbackEn: "Manage" })}
                </Link>
              </div>
            </AdminCard>

            <AdminCard title={lang === "en" ? "Store list ads" : "매장 목록 광고"}>
              <div data-admin-inventory-card={homeFeed.inventoryKey}>
                <p className="text-[12px] text-sam-muted">
                  {safeT("admin_ads_form_interleave", {
                    fallbackKo: "형태: 매장 카드 삽입 · 기본 간격 8 · 최대 ~5",
                    fallbackEn: "Form: store card insert · default interval 8 · max ~5",
                  })}
                </p>
                <DeliveryAdPlacementMiniature kind={homeFeed.miniature} adLabel={adTag} />
                <p className="mt-1 text-[11px] text-sam-muted">key: {homeFeed.inventoryKey}</p>
                <Link
                  href={deliveryAdsAdminHubHref({ inventory: homeFeed.inventoryKey })}
                  className={MANAGE_BTN}
                >
                  {safeT("admin_ads_manage", { fallbackKo: "관리", fallbackEn: "Manage" })}
                </Link>
              </div>
            </AdminCard>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[16px] font-bold text-sam-fg">
            {safeT("admin_ads_surface_category", {
              fallbackKo: "업종별 매장 목록",
              fallbackEn: "Category store lists",
            })}
          </h2>
          <AdminCard title={lang === "en" ? "Category store ads" : "업종 매장 광고"}>
            <div data-admin-inventory-card={categoryFeed.inventoryKey}>
              <p className="text-[12px] text-sam-muted">
                {safeT("admin_ads_taxonomy_note", {
                  fallbackKo: "매장 본인 업종 Browse에만 노출 · 타 업종 침투 금지",
                  fallbackEn: "Only the store’s own category Browse · no cross-category",
                })}
              </p>
              <DeliveryAdPlacementMiniature kind={categoryFeed.miniature} adLabel={adTag} />
              <Link
                href={deliveryAdsAdminHubHref({ inventory: categoryFeed.inventoryKey })}
                className={MANAGE_BTN}
              >
                {safeT("admin_ads_manage", { fallbackKo: "관리", fallbackEn: "Manage" })}
              </Link>
            </div>
          </AdminCard>
        </section>

        <section className="space-y-3">
          <h2 className="text-[16px] font-bold text-sam-fg">
            {safeT("admin_ads_surface_search", { fallbackKo: "검색", fallbackEn: "Search" })}
          </h2>
          <AdminCard
            title={lang === "en" ? "Search results top banner" : "검색 결과 상단 배너"}
          >
            <div data-admin-inventory-card={searchTop.inventoryKey} data-admin-inventory-sellable="0">
              <p className="mb-2 rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-950">
                {safeT("admin_ads_search_not_sellable", {
                  fallbackKo: `런치 판매 중지 (${STORES_SEARCH_TOP_LAUNCH.launchStatus}). 스키마·런타임 호환은 유지합니다.`,
                  fallbackEn: `Not sellable at launch (${STORES_SEARCH_TOP_LAUNCH.launchStatus}). Schema/runtime kept for compat.`,
                })}
              </p>
              <ul className="space-y-1 text-[12px] text-sam-fg" data-admin-search-max={searchMax}>
                <li>
                  {safeT("admin_ads_form_single", {
                    fallbackKo: `형태: 단일 배너 · 동시 노출 ${searchMax}개 · carousel 아님`,
                    fallbackEn: `Form: single banner · max ${searchMax} · not a carousel`,
                  })}
                </li>
                <li>
                  {safeT("admin_ads_search_customer", {
                    fallbackKo:
                      "주요 고객 탐색은 HOME → 1차/2차 업종입니다. 검색 상단은 런치 Owner 상품에서 제외됩니다.",
                    fallbackEn:
                      "Primary discovery is HOME → 1st/2nd category. Search top is excluded from launch Owner products.",
                  })}
                </li>
              </ul>
              <DeliveryAdPlacementMiniature kind={searchTop.miniature} adLabel={adTag} />
              <p className="mt-2 text-[12px] text-sam-muted">
                {formatBannerPixelGuideLine(DELIVERY_AD_BANNER_PIXEL_GUIDE.STORES_SEARCH_TOP, lang)}
              </p>
              <p className="mt-1 text-[11px] text-sam-muted">
                {searchSeed
                  ? `ratio seed ${searchSeed.aspectRatioWidth}:${searchSeed.aspectRatioHeight}`
                  : "3:1"}
              </p>
            </div>
          </AdminCard>
        </section>

        <AdminPlacementMapPanel />

        <p className="text-[12px] text-sam-muted">
          <Link href={DELIVERY_AD_ADMIN_ROUTES.hub} className="font-semibold text-[#0A823E]">
            ← {safeT("admin_delivery_ads_back", { fallbackKo: "광고 목록", fallbackEn: "Ad list" })}
          </Link>
        </p>
      </div>
    </AdminDeliveryCmsChrome>
  );
}
