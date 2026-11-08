"use client";

import Link from "next/link";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";
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
import { translateBy } from "@/lib/i18n/translate-by";

function seedFor(key: string) {
  return DELIVERY_AD_INVENTORY_SEEDS.find((s) => s.key === key) ?? null;
}

const MANAGE_BTN = "mt-3";

/**
 * Admin 광고 지면 관리 — human language launch inventory cards.
 */
export function AdminDeliveryAdInventoryManagementView() {
  const { safeT, language, t } = useI18n();
  const lang = language === "en" ? "en" : "ko";
  const adTag = translateBy(lang, "admin_ads_history_deleted_col_title");

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
            {t("admin_menu_placement_map")}
          </h1>
          <p className="mt-1 text-[13px] text-sam-muted">
            {safeT("admin_delivery_ads_inventory_desc")}
          </p>
        </div>

        <AdminDeliveryAdsSectionNav />

        <section className="space-y-3">
          <h2 className="text-[16px] font-bold text-sam-fg">
            {safeT("admin_ads_surface_home")}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            <AdminCard title={translateBy(lang, "admin_top_hero_banner")}>
              <div data-admin-inventory-card={homeHero.inventoryKey}>
                <ul className="space-y-1 text-[12px] text-sam-fg" data-admin-hero-ops="carousel">
                  <li>
                    {safeT("admin_ads_form_carousel")}
                  </li>
                  <li>
                    {safeT("admin_ads_hero_visible")}
                  </li>
                  <li>
                    {safeT("admin_ads_hero_auto")}
                  </li>
                  <li>
                    {safeT("admin_ads_hero_order")}
                  </li>
                  <li>
                    {safeT("admin_ads_sellable")}
                    : ON
                  </li>
                </ul>
                <DeliveryAdPlacementMiniature kind={homeHero.miniature} adLabel={adTag} />
                <p className="mt-2 text-[12px] text-sam-muted">
                  {formatBannerPixelGuideLine(DELIVERY_AD_BANNER_PIXEL_GUIDE.STORES_HOME_HERO, lang)}
                </p>
                <p className="mt-1 text-[12px] text-sam-muted">
                  {DELIVERY_AD_BANNER_PIXEL_GUIDE.STORES_HOME_HERO[
                    lang === "en" ? "safeAreaNoteEn" : "safeAreaNoteKo"
                  ]}
                </p>
                <p className="mt-1 text-[12px] text-sam-muted">key: {homeHero.inventoryKey}</p>
                <AdminActionLink
                  href={deliveryAdsAdminHubHref({ inventory: homeHero.inventoryKey })}
                  variant="secondary"
                  className={MANAGE_BTN}
                >
                  {safeT("admin_ads_manage")}
                </AdminActionLink>
              </div>
            </AdminCard>

            <AdminCard title={translateBy(lang, "admin_store_list_ads")}>
              <div data-admin-inventory-card={homeFeed.inventoryKey}>
                <p className="text-[12px] text-sam-muted">
                  {safeT("admin_ads_form_interleave")}
                </p>
                <DeliveryAdPlacementMiniature kind={homeFeed.miniature} adLabel={adTag} />
                <p className="mt-1 text-[12px] text-sam-muted">key: {homeFeed.inventoryKey}</p>
                <AdminActionLink
                  href={deliveryAdsAdminHubHref({ inventory: homeFeed.inventoryKey })}
                  variant="secondary"
                  className={MANAGE_BTN}
                >
                  {safeT("admin_ads_manage")}
                </AdminActionLink>
              </div>
            </AdminCard>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-[16px] font-bold text-sam-fg">
            {safeT("admin_ads_surface_category")}
          </h2>
          <AdminCard title={translateBy(lang, "admin_category_store_ads")}>
            <div data-admin-inventory-card={categoryFeed.inventoryKey}>
              <p className="text-[12px] text-sam-muted">
                {safeT("admin_ads_taxonomy_note")}
              </p>
              <DeliveryAdPlacementMiniature kind={categoryFeed.miniature} adLabel={adTag} />
              <AdminActionLink
                href={deliveryAdsAdminHubHref({ inventory: categoryFeed.inventoryKey })}
                variant="secondary"
                className={MANAGE_BTN}
              >
                {safeT("admin_ads_manage")}
              </AdminActionLink>
            </div>
          </AdminCard>
        </section>

        <section className="space-y-3">
          <h2 className="text-[16px] font-bold text-sam-fg">
            {safeT("admin_ads_surface_search")}
          </h2>
          <AdminCard
            title={translateBy(lang, "admin_search_results_top_banner")}
          >
            <div data-admin-inventory-card={searchTop.inventoryKey} data-admin-inventory-sellable="0">
              <p className="mb-2 rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-3 py-2 text-[12px] font-semibold text-sam-fg">
                {safeT("admin_ads_search_not_sellable")}
              </p>
              <ul className="space-y-1 text-[12px] text-sam-fg" data-admin-search-max={searchMax}>
                <li>
                  {safeT("admin_ads_form_single")}
                </li>
                <li>
                  {safeT("admin_ads_search_customer")}
                </li>
              </ul>
              <DeliveryAdPlacementMiniature kind={searchTop.miniature} adLabel={adTag} />
              <p className="mt-2 text-[12px] text-sam-muted">
                {formatBannerPixelGuideLine(DELIVERY_AD_BANNER_PIXEL_GUIDE.STORES_SEARCH_TOP, lang)}
              </p>
              <p className="mt-1 text-[12px] text-sam-muted">
                {searchSeed
                  ? `ratio seed ${searchSeed.aspectRatioWidth}:${searchSeed.aspectRatioHeight}`
                  : "3:1"}
              </p>
            </div>
          </AdminCard>
        </section>

        <AdminPlacementMapPanel />

        <p className="text-[12px] text-sam-muted">
          <Link href={DELIVERY_AD_ADMIN_ROUTES.hub} className="font-semibold text-sam-primary">
            ← {safeT("admin_delivery_ads_back")}
          </Link>
        </p>
      </div>
    </AdminDeliveryCmsChrome>
  );
}
