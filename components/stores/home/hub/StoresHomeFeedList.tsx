"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { StoresHomeFeedSections } from "@/lib/stores/stores-home-feed-sections";
import { StoresHomeSectionShell } from "@/components/stores/home/hub/StoresHomeSectionShell";
import { StoresHomeStoreCardList } from "@/components/stores/home/hub/StoresHomeStoreCard";
import { STORES_HOME_SECTION_BROWSE } from "@/lib/stores/stores-home-section-browse-hrefs";
import type { BrowseFeaturedCardItem } from "@/lib/stores/browse-featured-items-types";
import type { BrowseFeaturedMenuHydrationPhase } from "@/lib/stores/use-browse-featured-items-hydration";

export type StoresHomeFeedSectionKey =
  | "premium"
  | "open"
  | "discount"
  | "top"
  | "nearby"
  | "rest";

const SECTION_BROWSE_ACTION: Partial<
  Record<StoresHomeFeedSectionKey, { href: () => string; labelKey: "store_browse_view_all" }>
> = {
  open: { href: STORES_HOME_SECTION_BROWSE.orderNow, labelKey: "store_browse_view_all" },
  discount: { href: STORES_HOME_SECTION_BROWSE.discount, labelKey: "store_browse_view_all" },
  top: { href: STORES_HOME_SECTION_BROWSE.topRated, labelKey: "store_browse_view_all" },
  nearby: { href: STORES_HOME_SECTION_BROWSE.nearby, labelKey: "store_browse_view_all" },
  premium: { href: STORES_HOME_SECTION_BROWSE.recommended, labelKey: "store_browse_view_all" },
  rest: { href: STORES_HOME_SECTION_BROWSE.allStores, labelKey: "store_browse_view_all" },
};

export function StoresHomeFeedList({
  sections,
  loading,
  emptyFallback,
  excludeSectionKeys = [],
  hydratedByStoreId,
  getPhase,
  registerListItem,
  hydrationEpoch,
}: {
  sections: StoresHomeFeedSections;
  loading: boolean;
  emptyFallback?: ReactNode;
  excludeSectionKeys?: readonly StoresHomeFeedSectionKey[];
  hydratedByStoreId: ReadonlyMap<string, BrowseFeaturedCardItem[]>;
  getPhase: (storeId: string) => BrowseFeaturedMenuHydrationPhase;
  registerListItem: (storeId: string, node: HTMLElement | null) => void;
  hydrationEpoch: number;
}) {
  const { t } = useI18n();
  if (loading) return null;

  const excluded = new Set(excludeSectionKeys);
  const blocks = [
    { key: "premium" as const, title: t("store_spot_recommended_title"), stores: sections.premium },
    { key: "open" as const, title: t("store_order_now_title"), stores: sections.openNow },
    { key: "discount" as const, title: t("store_badge_menu_discount"), stores: sections.discounted },
    { key: "top" as const, title: t("store_spot_recommended_subtitle"), stores: sections.topRated },
    { key: "nearby" as const, title: t("store_neighborhood_more_title"), stores: sections.nearby },
    { key: "rest" as const, title: t("store_feed_stores_title"), stores: sections.feedRest },
  ].filter((b) => b.stores.length > 0 && !excluded.has(b.key));

  if (blocks.length === 0) {
    return emptyFallback ?? null;
  }

  return (
    <div className="space-y-5">
      {blocks.map((b) => {
        const action = SECTION_BROWSE_ACTION[b.key];
        return (
          <StoresHomeSectionShell
            key={b.key}
            title={b.title}
            actionHref={action ? action.href() : undefined}
            actionLabel={action ? t(action.labelKey) : undefined}
          >
            <StoresHomeStoreCardList
              stores={b.stores}
              hydratedByStoreId={hydratedByStoreId}
              getPhase={getPhase}
              registerListItem={registerListItem}
              hydrationEpoch={hydrationEpoch}
            />
          </StoresHomeSectionShell>
        );
      })}
    </div>
  );
}
