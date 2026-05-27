"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { StoresHomeSectionShell } from "@/components/stores/home/hub/StoresHomeSectionShell";
import { StoresHomeStoreCardList } from "@/components/stores/home/hub/StoresHomeStoreCard";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import { STORES_HOME_SECTION_BROWSE } from "@/lib/stores/stores-home-section-browse-hrefs";
import type { BrowseFeaturedCardItem } from "@/lib/stores/browse-featured-items-types";
import type { BrowseFeaturedMenuHydrationPhase } from "@/lib/stores/use-browse-featured-items-hydration";

/**
 * CONTRACT — `/stores` hero 아래 **즉시** 마운트되는 매장 row 목록 (`StoreDeliveryRowCard`).
 * LCP·`StoresHomeDeferredViewport`·below-fold split 과 분리. `verify:stores-home-hub-contract`.
 */
export function StoresHomePrimaryStoreRowListSection({
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
  const { t } = useI18n();
  if (stores.length === 0) return null;

  return (
    <div data-stores-home-primary-row-list>
      <StoresHomeSectionShell
        title={t("store_feed_stores_title")}
        actionHref={STORES_HOME_SECTION_BROWSE.orderNow()}
        actionLabel={t("store_browse_view_all")}
      >
        <StoresHomeStoreCardList
          stores={stores}
          hydratedByStoreId={hydratedByStoreId}
          getPhase={getPhase}
          registerListItem={registerListItem}
        />
      </StoresHomeSectionShell>
    </div>
  );
}
