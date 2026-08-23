"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { StoresHomeFeedComposition } from "@/lib/stores/stores-home-composer";
import {
  buildStoresHomeBelowFoldFeedSectionsFromComposition,
  STORES_HOME_BELOW_FOLD_FEED_EXCLUDE_KEYS,
} from "@/lib/stores/stores-home-feed-display-contract";
import { STORES_HOME_SECTION_BROWSE } from "@/lib/stores/stores-home-section-browse-hrefs";
import { StoresHomeFoodDiscoveryRail } from "@/components/stores/home/hub/StoresHomeFoodDiscoveryRail";
import { StoresHomeFoodCard, resolveFoodCardImage } from "@/components/stores/home/hub/StoresHomeFoodCard";
import { StoresHomeFeedList } from "@/components/stores/home/hub/StoresHomeFeedList";
import { StoresHomeSectionShell } from "@/components/stores/home/hub/StoresHomeSectionShell";
import type { BrowseFeaturedCardItem } from "@/lib/stores/browse-featured-items-types";
import type { BrowseFeaturedMenuHydrationPhase } from "@/lib/stores/use-browse-featured-items-hydration";

/**
 * 첫 레일 아래 섹션 — 뷰포트 진입 후 마운트.
 * CUT3 — `composition` 은 Hub 에서 1회 compose; 여기서 재-split 금지.
 */
export function StoresHomeHubBelowFold({
  composition,
  totalStoreCount,
  loading,
  meta,
  hydratedByStoreId,
  getPhase,
  registerListItem,
}: {
  composition: StoresHomeFeedComposition | null;
  totalStoreCount: number;
  loading: boolean;
  meta: { source?: string } | null;
  hydratedByStoreId: ReadonlyMap<string, BrowseFeaturedCardItem[]>;
  getPhase: (storeId: string) => BrowseFeaturedMenuHydrationPhase;
  registerListItem: (storeId: string, node: HTMLElement | null) => void;
}) {
  const { t } = useI18n();

  if (!composition) {
    return <div className="min-h-[8rem]" aria-hidden />;
  }

  const primaryRowStoreCount = composition.slot1Stores.length;
  const feedSections = buildStoresHomeBelowFoldFeedSectionsFromComposition(composition);

  return (
    <>
      <StoresHomeFoodDiscoveryRail
        title={t("store_home_popular_stores_title")}
        entries={composition.slot2Food}
        hydratedByStoreId={hydratedByStoreId}
        actionHref={STORES_HOME_SECTION_BROWSE.popular()}
        actionLabel={t("store_browse_view_all")}
      />

      <StoresHomeFoodDiscoveryRail
        title={t("store_home_new_stores_title")}
        entries={composition.newStoreFood}
        hydratedByStoreId={hydratedByStoreId}
      />

      <StoresHomeFoodDiscoveryRail
        title={t("store_home_campaigns_title")}
        entries={composition.campaignFood}
        hydratedByStoreId={hydratedByStoreId}
      />

      <StoresHomeFoodDiscoveryRail
        title={t("store_badge_menu_discount")}
        entries={composition.slot3Food}
        hydratedByStoreId={hydratedByStoreId}
        actionHref={STORES_HOME_SECTION_BROWSE.discount()}
        actionLabel={t("store_browse_view_all")}
      />

      <StoresHomeFoodDiscoveryRail
        title={t("store_spot_recommended_subtitle")}
        entries={composition.slot4Food}
        hydratedByStoreId={hydratedByStoreId}
        presentation="highRating"
        actionHref={STORES_HOME_SECTION_BROWSE.topRated()}
        actionLabel={t("store_browse_view_all")}
      />

      {composition.slot5Food.length > 0 ?
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
      : null}

      {meta?.source === "supabase_unconfigured" ?
        <p className="rounded-[var(--delivery-radius)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t("store_supabase_unconfigured_hint")}
        </p>
      : null}

      <StoresHomeFeedList
        sections={feedSections}
        loading={loading}
        excludeSectionKeys={STORES_HOME_BELOW_FOLD_FEED_EXCLUDE_KEYS}
        primaryRowStoreCount={primaryRowStoreCount}
        totalStoreCount={totalStoreCount}
        hydratedByStoreId={hydratedByStoreId}
        getPhase={getPhase}
        registerListItem={registerListItem}
      />
    </>
  );
}
