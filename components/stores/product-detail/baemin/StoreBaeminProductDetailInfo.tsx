"use client";

import { StoreSampleStoreBadge } from "@/components/stores/StoreSampleStoreBadge";

/**
 * WP7 — 배지 → 이름 → 설명. 「메뉴 리뷰 n개」 줄은 제거(매장 리뷰 수를 메뉴 리뷰처럼 보이던 결함).
 */
export function StoreBaeminProductDetailInfo({
  title,
  summary,
  badges,
  isSampleStore,
}: {
  title: string;
  summary: string | null;
  badges: string[];
  /** v4 W3 PL-02 — 부모 매장 샘플(실제 주문 불가) */
  isSampleStore?: boolean;
}) {
  return (
    <div className="bg-white px-4 pb-3 pt-3">
      <StoreSampleStoreBadge isSampleStore={isSampleStore} className="mb-2" />
      {badges.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {badges.map((b) => (
            <span
              key={b}
              className="inline-flex rounded-full bg-sam-surface-muted px-2 py-0.5 text-[11px] font-semibold text-sam-muted"
            >
              {b}
            </span>
          ))}
        </div>
      ) : null}

      <h1 className="text-[20px] font-extrabold leading-snug tracking-[-0.03em] text-sam-fg">
        {title}
      </h1>

      {summary?.trim() ? (
        <p className="mt-2 text-[13px] font-medium leading-relaxed text-sam-muted">{summary.trim()}</p>
      ) : null}
    </div>
  );
}
