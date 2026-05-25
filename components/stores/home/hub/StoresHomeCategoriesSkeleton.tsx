"use client";

import {
  STORES_HOME_PRIMARY_CATEGORY_SCROLL,
  STORES_HOME_PRIMARY_CATEGORY_SECTION_STICKY,
  STORES_HOME_SUB_CATEGORY_RAIL,
  STORES_HOME_SUB_CATEGORY_IMAGE_FRAME,
} from "@/lib/stores/stores-home-ui";

export function StoresHomePrimaryCategoriesSkeleton() {
  return (
    <div className={STORES_HOME_PRIMARY_CATEGORY_SECTION_STICKY} aria-busy aria-hidden>
      <div className={`${STORES_HOME_PRIMARY_CATEGORY_SCROLL} animate-pulse`}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex w-[56px] shrink-0 flex-col items-center gap-1">
            <span className="h-[var(--delivery-home-category-icon-compact)] w-[var(--delivery-home-category-icon-compact)] rounded-full bg-[color:var(--delivery-bg-muted)]/70" />
            <span className="h-2.5 w-9 rounded bg-[color:var(--delivery-bg-muted)]/70" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** taxonomy load placeholder — 2차(본문 상단) */
export function StoresHomeCategoriesSkeleton() {
  return (
    <section className="animate-pulse border-b border-[color:var(--delivery-border-section)] pb-2 pt-0" aria-busy aria-hidden>
      <div className={`${STORES_HOME_SUB_CATEGORY_RAIL} animate-pulse`}>
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className="flex w-[calc((100%-4*var(--delivery-home-subcategory-gap))/5)] min-w-[calc((100%-4*var(--delivery-home-subcategory-gap))/5)] shrink-0 flex-col items-center gap-1"
          >
            <span
              className={`${STORES_HOME_SUB_CATEGORY_IMAGE_FRAME} bg-[color:var(--delivery-bg-muted)]`}
            />
            <span className="h-3 w-10 rounded bg-[color:var(--delivery-bg-muted)]" />
          </div>
        ))}
      </div>
    </section>
  );
}
