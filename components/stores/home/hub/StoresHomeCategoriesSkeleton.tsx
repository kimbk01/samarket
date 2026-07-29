"use client";

import {
  STORES_HOME_PRIMARY_CATEGORY_SCROLL,
  STORES_HOME_PRIMARY_CATEGORY_SECTION_INNER,
  STORES_HOME_PRIMARY_CATEGORY_SECTION_STICKY,
  STORES_HOME_SUB_CATEGORY_RAIL,
  STORES_HOME_SUB_CATEGORY_IMAGE_FRAME,
  STORES_HOME_SUB_CATEGORY_SECTION_BODY,
  STORES_HOME_SUB_CATEGORY_SECTION_INNER,
} from "@/lib/stores/stores-home-ui";

export function StoresHomePrimaryCategoriesSkeleton() {
  return (
    <div
      className={STORES_HOME_PRIMARY_CATEGORY_SECTION_STICKY}
      aria-busy
      aria-hidden
      data-stores-home-category-pending="true"
    >
      <div className={STORES_HOME_PRIMARY_CATEGORY_SECTION_INNER}>
        <div className={STORES_HOME_PRIMARY_CATEGORY_SCROLL}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex w-[56px] shrink-0 flex-col items-center gap-1">
              <span className="h-[var(--delivery-home-category-icon-compact)] w-[var(--delivery-home-category-icon-compact)] rounded-full bg-[color:var(--delivery-bg-muted)]/70" />
              <span className="h-2.5 w-9 rounded bg-[color:var(--delivery-bg-muted)]/70" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** taxonomy load placeholder — 2차(본문 상단). Static size-stable surface only (list skeleton ban). */
export function StoresHomeCategoriesSkeleton() {
  return (
    <section
      className={STORES_HOME_SUB_CATEGORY_SECTION_BODY}
      aria-busy
      aria-hidden
      data-stores-home-category-pending="true"
    >
      <div className={STORES_HOME_SUB_CATEGORY_SECTION_INNER}>
        <div className={STORES_HOME_SUB_CATEGORY_RAIL}>
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
      </div>
    </section>
  );
}
