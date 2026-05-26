"use client";

import { STORES_HOME_RAIL_SCROLL } from "@/lib/stores/stores-home-ui";

/** 홈 피드 로딩 — 레일·카드 (히어로·카테고리는 별도 즉시 표시) */
export function StoresHomeSkeleton() {
  return (
    <section className="space-y-4 animate-pulse" aria-busy aria-label="Loading">
      <div className={STORES_HOME_RAIL_SCROLL}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            data-stores-perf={i === 0 ? "store-card-skeleton" : undefined}
            className="h-[7.5rem] w-[7.5rem] shrink-0 rounded-[var(--delivery-radius)] bg-[color:var(--delivery-bg-muted)]"
          />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 rounded-[var(--delivery-radius)] bg-[color:var(--delivery-bg-muted)]" />
      ))}
    </section>
  );
}
