"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { DeliveryAdBanner } from "@/components/stores/advertising/DeliveryAdBanner";
import { inventoryViewFromKey } from "@/lib/stores/advertising/delivery-ad-banner-contract";
import type { SearchTopBannerSlide } from "@/lib/stores/load-store-search-top-banners";
import { formatStoreCardOutOfRangeLabel } from "@/lib/stores/presentation/resolve-store-list-card-badges";

export type DeliverySearchStore = {
  id: string;
  slug: string;
  store_name: string;
  description: string | null;
  profile_image_url: string | null;
  rating_avg: number | null;
  review_count: number | null;
  district: string | null;
  city: string | null;
  region: string | null;
  /** CUT 11 — search-delivery serviceability */
  distanceOutOfRange?: boolean;
  maxDeliveryDistanceKm?: number | null;
  distanceKm?: number | null;
};

export type DeliverySearchMenu = {
  id: string;
  store_id: string;
  store_slug: string;
  store_name: string;
  title: string;
  summary: string | null;
  price: number;
  discount_price: number | null;
  thumbnail_url: string | null;
};

function priceLabel(menu: DeliverySearchMenu): string {
  const price = Number(menu.discount_price ?? menu.price);
  if (!Number.isFinite(price)) return "";
  return `₱${price.toLocaleString("en-PH")}`;
}

export function DeliverySearchResults({
  q,
  loading,
  stores,
  menus,
  resultCount,
  searchTopBanner,
  onClickStore,
  onClickMenu,
}: {
  q: string;
  loading: boolean;
  stores: DeliverySearchStore[];
  menus: DeliverySearchMenu[];
  resultCount: number;
  searchTopBanner?: SearchTopBannerSlide | null;
  onClickStore: (slug: string) => void;
  onClickMenu: (menu: DeliverySearchMenu) => void;
}) {
  const { t, safeT } = useI18n();
  const hasAny = (stores?.length ?? 0) + (menus?.length ?? 0) > 0;
  const banner = searchTopBanner ?? null;
  const adLabel = safeT("store_insertion_sponsored", {
    fallbackKo: "광고",
    fallbackEn: "Sponsored",
  });

  if (loading && !hasAny) {
    return (
      <div className="py-10 text-center">
        <p className="sam-text-body text-sam-muted">{t("ui_delivery_search_searching")}</p>
      </div>
    );
  }

  if (!hasAny && q.trim().length > 0) {
    return (
      <div className="py-10 text-center">
        <p className="sam-text-body font-semibold text-sam-fg">{t("ui_delivery_search_no_results_title")}</p>
        <p className="mt-1 sam-text-body text-sam-muted">{t("ui_delivery_search_no_results_hint")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="sam-text-body text-sam-muted">
          <span className="font-semibold text-sam-fg">{q}</span> · 결과 {Math.max(0, resultCount)}
        </p>
      </div>

      {banner && stores.length > 0 ? (
        <div className="w-full overflow-hidden" data-delivery-ad-inventory="STORES_SEARCH_TOP">
          <DeliveryAdBanner
            inventory={inventoryViewFromKey("STORES_SEARCH_TOP")}
            creative={{
              assetUrl: banner.imageUrl,
              headline: banner.headline,
              subcopy: banner.subcopy,
              alt: adLabel,
            }}
            destination={{ href: banner.href }}
            adLabel={adLabel}
            renderContext="customer"
            campaignId={banner.campaignId}
            exposureToken={banner.exposureToken}
          />
        </div>
      ) : null}

      <section className="space-y-2">
        <h2 className="sam-text-body-secondary font-semibold text-sam-fg">
          {t("ui_delivery_search_stores_heading")}
        </h2>
        {stores.length === 0 ? (
          <p className="sam-text-body text-sam-muted">{t("ui_delivery_search_stores_empty")}</p>
        ) : (
          <ul className="space-y-2">
            {stores.map((s) => {
              const outOfRangeLabel = formatStoreCardOutOfRangeLabel({
                distanceOutOfRange: s.distanceOutOfRange === true,
                maxDeliveryDistanceKm: s.maxDeliveryDistanceKm,
                labelWithMax: (km) => t("store_delivery_distance_out_of_range_with_max", { km }),
                labelGeneric: t("store_delivery_distance_out_of_range"),
              });
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onClickStore(s.slug)}
                    className="flex w-full items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-left hover:bg-sam-surface-muted"
                    data-delivery-search-store-oor={outOfRangeLabel ? "true" : "false"}
                  >
                    <SamarketThumbnail
                      src={s.profile_image_url}
                      size={48}
                      roundedClassName="rounded-ui-rect"
                      className="bg-sam-surface-muted"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate sam-text-body font-semibold text-sam-fg">{s.store_name}</p>
                      {s.description ? (
                        <p className="mt-0.5 line-clamp-1 sam-text-body text-sam-muted">{s.description}</p>
                      ) : null}
                      <p className="mt-1 sam-text-helper text-sam-meta">
                        {(s.district || s.city || s.region || "").trim()}
                      </p>
                      {outOfRangeLabel ? (
                        <p className="mt-1 sam-text-helper font-semibold text-sam-warning">{outOfRangeLabel}</p>
                      ) : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="sam-text-body-secondary font-semibold text-sam-fg">
          {t("ui_delivery_search_menu_heading")}
        </h2>
        {menus.length === 0 ? (
          <p className="sam-text-body text-sam-muted">{t("ui_delivery_search_menu_empty")}</p>
        ) : (
          <ul className="space-y-2">
            {menus.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onClickMenu(m)}
                  className="flex w-full items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-left hover:bg-sam-surface-muted"
                >
                  <SamarketThumbnail
                    src={m.thumbnail_url}
                    size={48}
                    roundedClassName="rounded-ui-rect"
                    className="bg-sam-surface-muted"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate sam-text-body font-semibold text-sam-fg">{m.title}</p>
                    <p className="mt-0.5 truncate sam-text-body text-sam-muted">{m.store_name}</p>
                    {m.summary ? (
                      <p className="mt-0.5 line-clamp-1 sam-text-helper text-sam-meta">{m.summary}</p>
                    ) : null}
                  </div>
                  <div className="shrink-0 sam-text-body-secondary font-semibold text-sam-fg">
                    {priceLabel(m)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
