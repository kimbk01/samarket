"use client";

import { StoresHomeSectionShell } from "@/components/stores/home/hub/StoresHomeSectionShell";
import { StoresHomeStoreCardList } from "@/components/stores/home/hub/StoresHomeStoreCard";
import { StoresHomeStoreHorizontalCard } from "@/components/stores/home/presentation/StoresHomeStoreHorizontalCard";
import { StoresHomeStoreTeaserCard } from "@/components/stores/home/presentation/StoresHomeStoreTeaserCard";
import { StoresHomeTimesaleRowCardList } from "@/components/stores/home/presentation/StoresHomeTimesaleRowCard";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { BrowseFeaturedCardItem } from "@/lib/stores/browse-featured-items-types";
import type { BrowseFeaturedMenuHydrationPhase } from "@/lib/stores/use-browse-featured-items-hydration";
import type { StoresHomePresentationPatternId } from "@/lib/stores/presentation/stores-home-presentation-spec";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { STORES_HOME_RAIL_SCROLL } from "@/lib/stores/stores-home-ui";
import {
  resolveStoreShelfCardImageUrl,
  storeHomeFeedItemToShelfEntry,
} from "@/lib/stores/product/stores-home-store-to-shelf-entry";

/**
 * CONTRACT — `/stores` hero 아래 **즉시** 마운트되는 매장 row 목록.
 * Shell copy/CTA/presentation은 HOME shelf CMS authority만 소비한다.
 */
export function StoresHomePrimaryStoreRowListSection({
  stores,
  hydratedByStoreId,
  getPhase,
  registerListItem,
  title,
  subtitle,
  actionHref,
  actionLabel,
  presentation = "timesale_vertical",
  locale = "ko",
}: {
  stores: StoreHomeFeedItem[];
  hydratedByStoreId: ReadonlyMap<string, BrowseFeaturedCardItem[]>;
  getPhase: (storeId: string) => BrowseFeaturedMenuHydrationPhase;
  registerListItem: (storeId: string, node: HTMLElement | null) => void;
  title: string;
  subtitle?: string | null;
  actionHref?: string | null;
  actionLabel?: string;
  presentation?: StoresHomePresentationPatternId;
  locale?: AppLanguageCode;
}) {
  if (stores.length === 0) return null;

  const horizontal =
    presentation === "store_horizontal" || presentation === "store_teaser_horizontal";

  return (
    <div data-stores-home-primary-row-list data-stores-home-presentation={presentation}>
      <StoresHomeSectionShell
        title={title}
        subtitle={subtitle}
        actionHref={actionHref}
        actionLabel={actionLabel}
      >
        {presentation === "timesale_vertical" ?
          <StoresHomeTimesaleRowCardList
            stores={stores}
            locale={locale}
            registerListItem={registerListItem}
          />
        : horizontal ?
          <div className={STORES_HOME_RAIL_SCROLL}>
            {stores.map((store) => {
              const entry = storeHomeFeedItemToShelfEntry(store);
              const imageUrl = resolveStoreShelfCardImageUrl(store);
              return presentation === "store_teaser_horizontal" ?
                  <StoresHomeStoreTeaserCard
                    key={store.id}
                    entry={entry}
                    imageUrl={imageUrl}
                    loadingImage={false}
                  />
                : <StoresHomeStoreHorizontalCard
                    key={store.id}
                    entry={entry}
                    imageUrl={imageUrl}
                    loadingImage={false}
                  />;
            })}
          </div>
        : (
          <StoresHomeStoreCardList
            stores={stores}
            hydratedByStoreId={hydratedByStoreId}
            getPhase={getPhase}
            registerListItem={registerListItem}
          />
        )}
      </StoresHomeSectionShell>
    </div>
  );
}
