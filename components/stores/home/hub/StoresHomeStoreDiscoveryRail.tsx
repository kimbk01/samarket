"use client";

import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import {
  StoreVerticalDiscoveryCard,
  homeFeedItemToVerticalModel,
} from "@/components/stores/home/StoreVerticalDiscoveryCard";
import { StoresHomeSectionShell } from "@/components/stores/home/hub/StoresHomeSectionShell";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import { STORES_HOME_RAIL_SCROLL } from "@/lib/stores/stores-home-ui";

/** 할인·리뷰 등 — 가로 대형 매장 카드 레일 */
export function StoresHomeStoreDiscoveryRail({
  title,
  subtitle,
  stores,
  adHint,
  actionHref,
  actionLabel,
}: {
  title: string;
  subtitle?: string;
  stores: StoreHomeFeedItem[];
  adHint?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  if (stores.length === 0) return null;

  return (
    <StoresHomeSectionShell title={title} actionHref={actionHref} actionLabel={actionLabel}>
      {subtitle ?
        <p className="-mt-1 mb-2 text-[13px] text-[color:var(--delivery-text-sub)]">{subtitle}</p>
      : null}
      <HorizontalDragScroll
        className={STORES_HOME_RAIL_SCROLL}
        style={{ WebkitOverflowScrolling: "touch" }}
        aria-label={title}
      >
        {stores.map((s) => (
          <div key={s.id} className="w-[min(72vw,280px)] shrink-0">
            <StoreVerticalDiscoveryCard store={homeFeedItemToVerticalModel(s)} adHint={adHint} />
          </div>
        ))}
      </HorizontalDragScroll>
    </StoresHomeSectionShell>
  );
}
