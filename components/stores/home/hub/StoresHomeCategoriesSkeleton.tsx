"use client";

import {
  STORES_HOME_PRIMARY_CATEGORY_SCROLL,
  STORES_HOME_PRIMARY_CATEGORY_SECTION,
  STORES_HOME_SUB_CATEGORY_GRID,
  STORES_HOME_SUB_CATEGORY_IMAGE_FRAME,
} from "@/lib/stores/stores-home-ui";

/** taxonomy load placeholder matching current 5-col + primary section layout */
export function StoresHomeCategoriesSkeleton() {
  return (
    <section className="animate-pulse space-y-0" aria-busy aria-hidden>
      <div className={STORES_HOME_SUB_CATEGORY_GRID}>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <span
              className={`${STORES_HOME_SUB_CATEGORY_IMAGE_FRAME} bg-[color:var(--delivery-bg-muted)]`}
            />
            <span className="h-3 w-10 rounded bg-[color:var(--delivery-bg-muted)]" />
          </div>
        ))}
      </div>
      <div className={STORES_HOME_PRIMARY_CATEGORY_SECTION}>
        <div className={STORES_HOME_PRIMARY_CATEGORY_SCROLL}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex w-[60px] shrink-0 flex-col items-center gap-1">
              <span className="h-[var(--delivery-home-category-icon)] w-[var(--delivery-home-category-icon)] rounded-full bg-[color:var(--delivery-bg-muted)]/70" />
              <span className="h-3 w-10 rounded bg-[color:var(--delivery-bg-muted)]/70" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
