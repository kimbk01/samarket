"use client";

import Link from "next/link";
import { startTransition, useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import {
  flattenStoresHomeFoodEntries,
  splitStoresHomeFeed,
  type StoresHomeFeedSections,
} from "@/lib/stores/stores-home-feed-sections";
import type { BrowseFeaturedCardItem } from "@/lib/stores/browse-featured-items-types";
import type { BrowseFeaturedMenuHydrationPhase } from "@/lib/stores/use-browse-featured-items-hydration";
import { STORES_HOME_SECTION_BROWSE } from "@/lib/stores/stores-home-section-browse-hrefs";
import {
  cancelScheduledWhenBrowserIdle,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";
import { StoresHomeSectionShell } from "@/components/stores/home/hub/StoresHomeSectionShell";
import { StoresHomeFoodCard, resolveFoodCardImage } from "@/components/stores/home/hub/StoresHomeFoodCard";
import { StoresHomeFeedList } from "@/components/stores/home/hub/StoresHomeFeedList";
import { StoresHomeStoreDiscoveryRail } from "@/components/stores/home/hub/StoresHomeStoreDiscoveryRail";

const FEED_EXCLUDE_KEYS = ["premium", "open", "discount", "top"] as const;

/**
 * 첫 레일 아래 섹션 — 뷰포트 진입 후에만 마운트·피드 분할(split) 실행.
 * DO NOT: 부모에서 below-fold JSX 를 매 렌더 동기 생성( long task ).
 */
export function StoresHomeHubBelowFold({
  stores,
  loading,
  meta,
  emptyFallback,
  hydratedByStoreId,
  getPhase,
  registerListItem,
}: {
  stores: StoreHomeFeedItem[];
  loading: boolean;
  meta: { source?: string } | null;
  emptyFallback: ReactNode;
  hydratedByStoreId: ReadonlyMap<string, BrowseFeaturedCardItem[]>;
  getPhase: (storeId: string) => BrowseFeaturedMenuHydrationPhase;
  registerListItem: (storeId: string, node: HTMLElement | null) => void;
}) {
  const { t } = useI18n();
  const [sections, setSections] = useState<StoresHomeFeedSections | null>(null);

  useEffect(() => {
    if (stores.length === 0) {
      setSections(null);
      return;
    }
    let cancelled = false;
    const idleId = scheduleWhenBrowserIdle(() => {
      if (cancelled) return;
      const next = splitStoresHomeFeed(stores);
      startTransition(() => {
        if (!cancelled) setSections(next);
      });
    }, 80);
    return () => {
      cancelled = true;
      cancelScheduledWhenBrowserIdle(idleId);
    };
  }, [stores]);

  const recFood = useMemo(
    () => (sections ? flattenStoresHomeFoodEntries(sections.premium, 8) : []),
    [sections]
  );

  if (!sections) {
    return <div className="min-h-[8rem]" aria-hidden />;
  }

  return (
    <>
      <StoresHomeStoreDiscoveryRail
        title={t("store_badge_menu_discount")}
        stores={sections.discounted}
        adHint={t("store_badge_instant_discount")}
        actionHref={STORES_HOME_SECTION_BROWSE.discount()}
        actionLabel={t("store_browse_view_all")}
      />

      <StoresHomeStoreDiscoveryRail
        title={t("store_spot_recommended_subtitle")}
        stores={sections.topRated}
        actionHref={STORES_HOME_SECTION_BROWSE.topRated()}
        actionLabel={t("store_browse_view_all")}
      />

      {recFood.length > 0 ?
        <StoresHomeSectionShell title={t("store_spot_recommended_title")}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {recFood.slice(0, 4).map((entry) => {
              const img = resolveFoodCardImage(entry, hydratedByStoreId.get(entry.storeId));
              return (
                <StoresHomeFoodCard
                  key={`rec-${entry.storeId}-${entry.productId}`}
                  entry={entry}
                  imageUrl={img.imageUrl}
                  loadingImage={img.loading}
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
        sections={sections}
        loading={loading}
        emptyFallback={emptyFallback}
        excludeSectionKeys={FEED_EXCLUDE_KEYS}
        hydratedByStoreId={hydratedByStoreId}
        getPhase={getPhase}
        registerListItem={registerListItem}
      />
    </>
  );
}
