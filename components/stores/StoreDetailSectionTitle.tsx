"use client";

import { STORE_DETAIL_SECTION_HEAD } from "@/lib/stores/store-detail-ui";

type Level = "h2" | "h3";

/** 메뉴 구역명·정보/리뷰 탭 블록 제목 — 동일 장식선 */
export function StoreDetailSectionTitle({
  children,
  level = "h3",
}: {
  children: React.ReactNode;
  level?: Level;
}) {
  const Tag = level;
  return (
    <Tag className={STORE_DETAIL_SECTION_HEAD}>
      <span className="h-px min-w-[1.5rem] flex-1 bg-sam-surface-muted" aria-hidden />
      <span className="shrink-0 tracking-tight">♦ {children} ♦</span>
      <span className="h-px min-w-[1.5rem] flex-1 bg-sam-surface-muted" aria-hidden />
    </Tag>
  );
}
