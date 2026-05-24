"use client";

import { memo, useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  StoreDeliveryRowCard,
  homeFeedToRowCard,
} from "@/components/stores/home/StoreDeliveryRowCard";
import { mergeFeaturedHydrationIntoStoreRowCard } from "@/lib/stores/merge-store-delivery-row-featured-hydration";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { BrowseFeaturedCardItem } from "@/lib/stores/browse-featured-items-types";
import type { BrowseFeaturedMenuHydrationPhase } from "@/lib/stores/use-browse-featured-items-hydration";

function StoresHomeStoreCardInner({
  store,
  locale,
  hydrated,
  hydrationPhase,
  registerListItem,
}: {
  store: StoreHomeFeedItem;
  locale: Parameters<typeof StoreDeliveryRowCard>[0]["locale"];
  hydrated: BrowseFeaturedCardItem[] | undefined;
  hydrationPhase: BrowseFeaturedMenuHydrationPhase;
  registerListItem: (storeId: string, node: HTMLElement | null) => void;
}) {
  const data = useMemo(
    () => mergeFeaturedHydrationIntoStoreRowCard(homeFeedToRowCard(store), hydrated),
    [store, hydrated]
  );
  return (
    <StoreDeliveryRowCard
      data={data}
      locale={locale}
      featuredMenuHydration={hydrationPhase}
      browseStoreId={store.id}
      registerBrowseListItem={registerListItem}
    />
  );
}

export const StoresHomeStoreCard = memo(StoresHomeStoreCardInner);

export function StoresHomeStoreCardList({
  stores,
  hydratedByStoreId,
  getPhase,
  registerListItem,
}: {
  stores: StoreHomeFeedItem[];
  hydratedByStoreId: ReadonlyMap<string, BrowseFeaturedCardItem[]>;
  getPhase: (storeId: string) => BrowseFeaturedMenuHydrationPhase;
  registerListItem: (storeId: string, node: HTMLElement | null) => void;
}) {
  const { language } = useI18n();
  return (
    <ul className="space-y-2">
      {stores.map((s) => (
        <StoresHomeStoreCard
          key={s.id}
          store={s}
          locale={language}
          hydrated={hydratedByStoreId.get(s.id)}
          hydrationPhase={getPhase(s.id)}
          registerListItem={registerListItem}
        />
      ))}
    </ul>
  );
}
