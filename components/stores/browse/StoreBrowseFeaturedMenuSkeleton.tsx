"use client";

import { STORES_HOME_MENU_TILE } from "@/lib/stores/stores-home-ui";
import { STORES_LIST_PRESENTATION_SSOT } from "@/lib/stores/presentation/stores-list-presentation-ssot";

/** browse L4 menu preview skeleton — DIBAY_PRESENTATION_DECISION thumb size (not competitor px). */
const MENU_THUMB_PX = STORES_LIST_PRESENTATION_SSOT.browseMenuPreviewThumbPx;

export function StoreBrowseFeaturedMenuSkeleton() {
  return (
    <div className="mt-2.5 flex snap-x snap-mandatory gap-1.5 overflow-hidden" aria-hidden>
      {[0, 1].map((i) => (
        <div
          key={i}
          className={`shrink-0 snap-start overflow-hidden ${STORES_HOME_MENU_TILE} bg-[color:var(--delivery-bg-muted)]`}
          style={{ width: MENU_THUMB_PX, height: MENU_THUMB_PX }}
          data-store-browse-menu-pending="true"
        />
      ))}
    </div>
  );
}
