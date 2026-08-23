"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoresHomeFoodDiscoveryRail } from "@/components/stores/home/hub/StoresHomeFoodDiscoveryRail";
import { StoresHomeFoodCard, resolveFoodCardImage } from "@/components/stores/home/hub/StoresHomeFoodCard";
import { StoresHomePrimaryStoreRowListSection } from "@/components/stores/home/hub/StoresHomePrimaryStoreRowListSection";
import { StoresHomeSectionShell } from "@/components/stores/home/hub/StoresHomeSectionShell";
import { StoresHomeStoreCardList } from "@/components/stores/home/hub/StoresHomeStoreCard";
import type { StoresHomeCompositionSlotKey } from "@/lib/stores/composition/stores-composition-home-slots";
import type { StoresHomeFeedComposition } from "@/lib/stores/stores-home-composer";
import { STORES_HOME_RAIL_SCROLL } from "@/lib/stores/stores-home-ui";
import { STORES_HOME_SECTION_BROWSE } from "@/lib/stores/stores-home-section-browse-hrefs";
import type { BrowseFeaturedCardItem } from "@/lib/stores/browse-featured-items-types";
import type { BrowseFeaturedMenuHydrationPhase } from "@/lib/stores/use-browse-featured-items-hydration";

export function StoresHomeCompositionSlotSection({
  slot,
  composition,
  hydratedByStoreId,
  getPhase,
  registerListItem,
  markFirstFoodCardPerf,
}: {
  slot: StoresHomeCompositionSlotKey;
  composition: StoresHomeFeedComposition;
  hydratedByStoreId: ReadonlyMap<string, BrowseFeaturedCardItem[]>;
  getPhase: (storeId: string) => BrowseFeaturedMenuHydrationPhase;
  registerListItem: (storeId: string, node: HTMLElement | null) => void;
  markFirstFoodCardPerf?: boolean;
}) {
  const { t } = useI18n();

  const wrap = (node: ReactNode) => (
    <div data-composition-slot={slot} data-stores-home-composition-slot={slot}>
      {node}
    </div>
  );

  switch (slot) {
    case "slot0Food":
      return wrap(
        <StoresHomeSectionShell
          title={t("store_order_now_title")}
          actionHref={STORES_HOME_SECTION_BROWSE.orderNow()}
          actionLabel={t("store_browse_view_all")}
        >
          <div className={STORES_HOME_RAIL_SCROLL}>
            {composition.slot0Food.map((entry, idx) => {
              const img = resolveFoodCardImage(entry, hydratedByStoreId.get(entry.storeId));
              return (
                <StoresHomeFoodCard
                  key={`${entry.storeId}-${entry.productId}`}
                  entry={entry}
                  imageUrl={img.imageUrl}
                  loadingImage={img.loading}
                  markStoreCardPerf={markFirstFoodCardPerf && idx === 0}
                />
              );
            })}
          </div>
        </StoresHomeSectionShell>
      );
    case "slot1Stores":
      return wrap(
        <StoresHomePrimaryStoreRowListSection
          stores={composition.slot1Stores}
          hydratedByStoreId={hydratedByStoreId}
          getPhase={getPhase}
          registerListItem={registerListItem}
        />
      );
    case "slot2Food":
      return wrap(
        <StoresHomeFoodDiscoveryRail
          title={t("store_home_popular_stores_title")}
          entries={composition.slot2Food}
          hydratedByStoreId={hydratedByStoreId}
          actionHref={STORES_HOME_SECTION_BROWSE.popular()}
          actionLabel={t("store_browse_view_all")}
        />
      );
    case "newStoreFood":
      return wrap(
        <StoresHomeFoodDiscoveryRail
          title={t("store_home_new_stores_title")}
          entries={composition.newStoreFood}
          hydratedByStoreId={hydratedByStoreId}
        />
      );
    case "campaignFood":
      return wrap(
        <StoresHomeFoodDiscoveryRail
          title={t("store_home_campaigns_title")}
          entries={composition.campaignFood}
          hydratedByStoreId={hydratedByStoreId}
        />
      );
    case "slot3Food":
      return wrap(
        <StoresHomeFoodDiscoveryRail
          title={t("store_badge_menu_discount")}
          entries={composition.slot3Food}
          hydratedByStoreId={hydratedByStoreId}
          actionHref={STORES_HOME_SECTION_BROWSE.discount()}
          actionLabel={t("store_browse_view_all")}
        />
      );
    case "slot4Food":
      return wrap(
        <StoresHomeFoodDiscoveryRail
          title={t("store_spot_recommended_subtitle")}
          entries={composition.slot4Food}
          hydratedByStoreId={hydratedByStoreId}
          presentation="highRating"
          actionHref={STORES_HOME_SECTION_BROWSE.topRated()}
          actionLabel={t("store_browse_view_all")}
        />
      );
    case "slot5Food":
      return wrap(
        <StoresHomeSectionShell title={t("store_spot_recommended_title")}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {composition.slot5Food.slice(0, 4).map((entry) => {
              const img = resolveFoodCardImage(entry, hydratedByStoreId.get(entry.storeId));
              return (
                <StoresHomeFoodCard
                  key={`featured-${entry.storeId}-${entry.productId}`}
                  entry={entry}
                  imageUrl={img.imageUrl}
                  loadingImage={img.loading}
                  presentation="grid"
                />
              );
            })}
          </div>
        </StoresHomeSectionShell>
      );
    case "slot6NearbyStores":
      return wrap(
        <StoresHomeSectionShell
          title={t("store_neighborhood_more_title")}
          actionHref={STORES_HOME_SECTION_BROWSE.nearby()}
          actionLabel={t("store_browse_view_all")}
        >
          <StoresHomeStoreCardList
            stores={composition.slot6NearbyStores}
            hydratedByStoreId={hydratedByStoreId}
            getPhase={getPhase}
            registerListItem={registerListItem}
          />
        </StoresHomeSectionShell>
      );
    case "slot6RestStores":
      return wrap(
        <StoresHomeSectionShell
          title={t("store_feed_stores_title")}
          actionHref={STORES_HOME_SECTION_BROWSE.allStores()}
          actionLabel={t("store_browse_view_all")}
        >
          <StoresHomeStoreCardList
            stores={composition.slot6RestStores}
            hydratedByStoreId={hydratedByStoreId}
            getPhase={getPhase}
            registerListItem={registerListItem}
          />
        </StoresHomeSectionShell>
      );
    default:
      return null;
  }
}
