"use client";

import { STORES_HOME_RAIL_SCROLL } from "@/lib/stores/stores-home-ui";

/** 홈 피드 로딩 — 배너·레일·카드 (카테고리 제외) */
export function StoresHomeSkeleton() {
  return (
    <section className="space-y-4 animate-pulse" aria-busy aria-label="Loading">
      <div className="h-[160px] rounded-[var(--delivery-radius)] bg-[color:var(--delivery-bg-muted)]" />
      <div className={STORES_HOME_RAIL_SCROLL}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
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
