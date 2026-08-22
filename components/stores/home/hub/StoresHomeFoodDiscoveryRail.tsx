"use client";

import { StoresHomeSectionShell } from "@/components/stores/home/hub/StoresHomeSectionShell";
import { StoresHomeFoodCard, resolveFoodCardImage } from "@/components/stores/home/hub/StoresHomeFoodCard";
import type { StoresHomeFoodEntry } from "@/lib/stores/stores-home-feed-sections";
import type { BrowseFeaturedCardItem } from "@/lib/stores/browse-featured-items-types";
import { STORES_HOME_RAIL_SCROLL } from "@/lib/stores/stores-home-ui";

/** CUT3 — 가로 FoodCard discovery 레일 (VerticalDiscovery 금지) */
export function StoresHomeFoodDiscoveryRail({
  title,
  subtitle,
  entries,
  hydratedByStoreId,
  adHint,
  actionHref,
  actionLabel,
}: {
  title: string;
  subtitle?: string;
  entries: readonly StoresHomeFoodEntry[];
  hydratedByStoreId: ReadonlyMap<string, BrowseFeaturedCardItem[]>;
  adHint?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  if (entries.length === 0) return null;

  return (
    <StoresHomeSectionShell title={title} actionHref={actionHref} actionLabel={actionLabel}>
      {subtitle ?
        <p className="-mt-1 mb-2 text-[13px] text-[color:var(--delivery-text-sub)]">{subtitle}</p>
      : null}
      {adHint ?
        <p className="-mt-1 mb-2 text-[12px] text-[color:var(--delivery-text-sub)]">{adHint}</p>
      : null}
      <div className={STORES_HOME_RAIL_SCROLL}>
        {entries.map((entry, idx) => {
          const img = resolveFoodCardImage(entry, hydratedByStoreId.get(entry.storeId));
          return (
            <StoresHomeFoodCard
              key={`${entry.storeId}-${entry.productId}`}
              entry={entry}
              imageUrl={img.imageUrl}
              loadingImage={img.loading}
              markStoreCardPerf={idx === 0}
            />
          );
        })}
      </div>
    </StoresHomeSectionShell>
  );
}
