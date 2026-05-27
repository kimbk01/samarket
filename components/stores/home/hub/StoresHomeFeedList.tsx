"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { StoresHomeFeedSections } from "@/lib/stores/stores-home-feed-sections";import {
  resolveStoresHomeBelowFoldFeedBlocks,
  shouldStoresHomeBelowFoldShowEmptyFallback,
  type StoresHomeFeedSectionKey,
} from "@/lib/stores/stores-home-feed-display-contract";
import { StoresHomeSectionShell } from "@/components/stores/home/hub/StoresHomeSectionShell";
import { StoresHomeStoreCardList } from "@/components/stores/home/hub/StoresHomeStoreCard";
import { STORES_HOME_SECTION_BROWSE } from "@/lib/stores/stores-home-section-browse-hrefs";
import type { BrowseFeaturedCardItem } from "@/lib/stores/browse-featured-items-types";
import type { BrowseFeaturedMenuHydrationPhase } from "@/lib/stores/use-browse-featured-items-hydration";

export type { StoresHomeFeedSectionKey };

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
  primaryRowStoreCount = 0,
  totalStoreCount = 0,
  hydratedByStoreId,
  getPhase,
  registerListItem,
}: {
  sections: StoresHomeFeedSections;
  loading: boolean;
  emptyFallback?: ReactNode;
  excludeSectionKeys?: readonly StoresHomeFeedSectionKey[];
  /** hero 직후 primary row 가 이미 그린 매장 수 — emptyFallback 오판 방지 */
  primaryRowStoreCount?: number;
  totalStoreCount?: number;
  hydratedByStoreId: ReadonlyMap<string, BrowseFeaturedCardItem[]>;
  getPhase: (storeId: string) => BrowseFeaturedMenuHydrationPhase;
  registerListItem: (storeId: string, node: HTMLElement | null) => void;
}) {
  const { t } = useI18n();
  if (loading) return null;

  const resolvedBlocks = resolveStoresHomeBelowFoldFeedBlocks(sections, excludeSectionKeys);
  const titleByKey: Record<StoresHomeFeedSectionKey, string> = {
    premium: t("store_spot_recommended_title"),
    open: t("store_order_now_title"),
    discount: t("store_badge_menu_discount"),
    top: t("store_spot_recommended_subtitle"),
    nearby: t("store_neighborhood_more_title"),
    rest: t("store_feed_stores_title"),
  };
  const blocks = resolvedBlocks.map((b) => ({ ...b, title: titleByKey[b.key] }));

  if (
    shouldStoresHomeBelowFoldShowEmptyFallback({
      totalStoreCount,
      primaryRowStoreCount,
      belowFoldBlockCount: blocks.length,
    })
  ) {
    return emptyFallback ?? null;
  }

  if (blocks.length === 0) {
    return null;
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
            />
          </StoresHomeSectionShell>
        );
      })}
    </div>
  );
}
