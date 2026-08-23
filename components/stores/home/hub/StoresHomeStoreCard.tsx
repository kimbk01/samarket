"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoresHomeTimesaleRowCardList } from "@/components/stores/home/presentation/StoresHomeTimesaleRowCard";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { BrowseFeaturedCardItem } from "@/lib/stores/browse-featured-items-types";
import type { BrowseFeaturedMenuHydrationPhase } from "@/lib/stores/use-browse-featured-items-hydration";

/** HOME store rows — A-VIS §3.1 timesale vertical (not CATEGORY card · not legacy menu strip). */
export function StoresHomeStoreCardList({
  stores,
  hydratedByStoreId: _hydratedByStoreId,
  getPhase: _getPhase,
  registerListItem,
}: {
  stores: StoreHomeFeedItem[];
  hydratedByStoreId: ReadonlyMap<string, BrowseFeaturedCardItem[]>;
  getPhase: (storeId: string) => BrowseFeaturedMenuHydrationPhase;
  registerListItem: (storeId: string, node: HTMLElement | null) => void;
}) {
  const { language } = useI18n();
  return (
    <StoresHomeTimesaleRowCardList
      stores={stores}
      locale={language}
      registerListItem={registerListItem}
    />
  );
}
